import { v4 as uuidv4 } from "uuid"
import type { Project, Task, Subtask } from "../task-types"
import { getSupabaseServerActionClient } from "../supabase/server"
import { createClient } from "@supabase/supabase-js"

// Add this near the top of the file, after the imports
// Simple in-memory cache for projects
let projectsCache: {
  data: Project[]
  timestamp: number
  userEmail: string | null
} | null = null

// Improve the cache expiration time - increase to 10 minutes for better performance
const CACHE_EXPIRATION = 10 * 60 * 1000

// Add a more sophisticated cache with per-project caching
const projectCache = new Map<string, { data: Project; timestamp: number }>()

// Add this function to invalidate the caches in this file
export function invalidateAllProjectCaches() {
  console.log("Invalidating all project caches in supabase-db.ts.")
  projectCache.clear()
  projectsCache = null
}

// Add this function to test the connection directly
export async function testConnection() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
      throw new Error("Missing Supabase environment variables")
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey)

    // Try a simple query
    const { data, error } = await supabase.from("projects").select("count")

    if (error) {
      console.error("Supabase query error:", error)
      throw error
    }

    return { success: true, message: "Connection successful" }
  } catch (error) {
    console.error("Supabase connection test error:", error)
    return {
      success: false,
      message: error instanceof Error ? error.message : "Unknown error",
      error,
    }
  }
}

// Enhanced retry logic with better error handling for rate limits and JSON parsing
async function fetchWithRetry(fetcher: () => Promise<any>, maxRetries = 3): Promise<any> {
  let retries = 0

  while (retries < maxRetries) {
    try {
      const result = await fetcher()
      return result
    } catch (error: any) {
      console.error(`Attempt ${retries + 1}/${maxRetries} failed:`, error)

      // Check for rate limiting or JSON parsing errors
      const isRateLimit =
        (error.message &&
          (error.message.includes("Too Many Requests") ||
            error.message.includes("429") ||
            error.message.includes("Unexpected token 'T'") ||
            error.message.includes("is not valid JSON"))) ||
        (error.code && error.code === 429)

      const isNetworkError =
        error.message &&
        (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("timeout"))

      if ((isRateLimit || isNetworkError) && retries < maxRetries - 1) {
        // Exponential backoff with jitter: wait longer between each retry
        const baseDelay = Math.pow(2, retries) * 1000
        const jitter = Math.random() * 1000
        const delay = baseDelay + jitter

        console.log(
          `Rate limit or network error detected, retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        retries++
      } else {
        // If it's not a retryable error or we've exhausted retries, throw the error
        throw error
      }
    }
  }
}

// Add a wrapper for Supabase operations with better error handling
async function executeSupabaseOperation(operation: () => Promise<any>, operationName: string): Promise<any> {
  try {
    return await fetchWithRetry(async () => {
      const result = await operation()

      // Check if the result has an error property (Supabase pattern)
      if (result && result.error) {
        throw result.error
      }

      return result
    })
  } catch (error: any) {
    console.error(`Supabase operation '${operationName}' failed:`, error)

    // Handle specific error types
    if (error.message && error.message.includes("JSON")) {
      throw new Error(
        `Database returned invalid response. This may be due to rate limiting. Please try again in a moment.`,
      )
    }

    if (error.message && (error.message.includes("Too Many Requests") || error.message.includes("429"))) {
      throw new Error(`Database is currently busy. Please try again in a moment.`)
    }

    throw error
  }
}

// Update the createProject function to better handle managers and add more logging
export async function createProject(title: string, description?: string, managers: string[] = []): Promise<Project> {
  console.log(
    `Creating new project in Supabase: ${title}${managers.length > 0 ? `, Managers: ${managers.join(", ")}` : ""}`,
  )
  const supabase = getSupabaseServerActionClient()

  try {
    const projectId = uuidv4()
    const now = new Date()

    // Create the project without managers
    const { data, error } = await executeSupabaseOperation(
      () =>
        supabase
          .from("projects")
          .insert({
            id: projectId,
            title,
            description,
            created_at: now.toISOString(),
            updated_at: now.toISOString(),
          })
          .select()
          .single(),
      "createProject",
    )

    if (error) {
      console.error("Error creating project:", error)
      throw error
    }

    // If there are managers, add them to the project_managers table
    if (managers && managers.length > 0) {
      console.log(`Adding ${managers.length} managers to project ${projectId}:`, managers)

      const managerEntries = managers.map((email) => ({
        project_id: projectId,
        manager_email: email,
      }))

      // Check if the project_managers table exists
      try {
        const { count, error: countError } = await executeSupabaseOperation(
          () => supabase.from("project_managers").select("*", { count: "exact", head: true }),
          "checkProjectManagersTable",
        )

        if (countError) {
          console.error("Error checking project_managers table:", countError)
          // Table might not exist, let's try to create it
          await supabase.query(`
          CREATE TABLE IF NOT EXISTS public.project_managers (
            project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
            manager_email TEXT NOT NULL,
            PRIMARY KEY (project_id, manager_email)
          );
        `)
          console.log("Created project_managers table")
        }
      } catch (tableError) {
        console.error("Error checking/creating project_managers table:", tableError)
      }

      // Now insert the managers
      const { error: managersError } = await executeSupabaseOperation(
        () => supabase.from("project_managers").insert(managerEntries),
        "insertProjectManagers",
      )

      if (managersError) {
        console.error("Error adding project managers:", managersError)
        // Continue despite error, the project was created
      } else {
        console.log(`Successfully added ${managers.length} managers to project ${projectId}`)
      }
    }

    const newProject: Project = {
      id: projectId,
      title,
      description,
      managers: managers || [],
      tasks: [],
      createdAt: now,
      updatedAt: now,
    }

    console.log(`Created project in Supabase with ID: ${projectId}`)
    return newProject
  } catch (error) {
    console.error(`Error in createProject(${title}):`, error)
    throw error
  }
}

// Update the updateProject function to better handle managers and add more logging
export async function updateProject(
  id: string,
  title: string,
  description?: string,
  managers: string[] = [],
): Promise<Project | null> {
  console.log(`Updating project in Supabase: ${id} with managers:`, managers)
  const supabase = getSupabaseServerActionClient()

  try {
    const now = new Date()

    // Update the project details
    const { data, error } = await executeSupabaseOperation(
      () =>
        supabase
          .from("projects")
          .update({
            title,
            description,
            updated_at: now.toISOString(),
          })
          .eq("id", id)
          .select()
          .single(),
      "updateProject",
    )

    if (error) {
      console.error(`Error updating project ${id}:`, error)
      return null
    }

    // Check if the project_managers table exists
    try {
      const { count, error: countError } = await executeSupabaseOperation(
        () => supabase.from("project_managers").select("*", { count: "exact", head: true }),
        "checkProjectManagersTable",
      )

      if (countError) {
        console.error("Error checking project_managers table:", countError)
        // Table might not exist, let's try to create it
        await supabase.query(`
        CREATE TABLE IF NOT EXISTS public.project_managers (
          project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
          manager_email TEXT NOT NULL,
          PRIMARY KEY (project_id, manager_email)
        );
      `)
        console.log("Created project_managers table")
      }
    } catch (tableError) {
      console.error("Error checking/creating project_managers table:", tableError)
    }

    // Update project managers - first delete all existing managers
    console.log(`Deleting existing managers for project ${id}`)
    const { error: deleteError } = await executeSupabaseOperation(
      () => supabase.from("project_managers").delete().eq("project_id", id),
      "deleteProjectManagers",
    )

    if (deleteError) {
      console.error(`Error deleting existing project managers for ${id}:`, deleteError)
      // Continue despite error
    }

    // Then add the new managers
    if (managers && managers.length > 0) {
      console.log(`Adding ${managers.length} managers to project ${id}:`, managers)

      const managerEntries = managers.map((email) => ({
        project_id: id,
        manager_email: email,
      }))

      const { error: insertError } = await executeSupabaseOperation(
        () => supabase.from("project_managers").insert(managerEntries),
        "insertProjectManagers",
      )

      if (insertError) {
        console.error(`Error adding new project managers for ${id}:`, insertError)
        // Continue despite error
      } else {
        console.log(`Successfully added ${managers.length} managers to project ${id}`)
      }
    }

    // Get the full project with tasks and subtasks
    return await getProjectById(id)
  } catch (error) {
    console.error(`Error in updateProject(${id}):`, error)
    return null
  }
}

// Update getProjects to fetch project managers
export async function getProjects(userEmail: string | null = null): Promise<Project[]> {
  console.log(`Getting projects from Supabase${userEmail ? ` for user: ${userEmail}` : " (all projects)"}`)

  // Check if we have a valid cache
  if (
    projectsCache &&
    projectsCache.userEmail === userEmail &&
    Date.now() - projectsCache.timestamp < CACHE_EXPIRATION
  ) {
    console.log("Returning projects from cache")
    return projectsCache.data
  }

  try {
    const supabase = getSupabaseServerActionClient()

    try {
      // Get projects
      const { data: projects, error: projectsError } = await executeSupabaseOperation(
        () => supabase.from("projects").select("*").order("created_at", { ascending: false }),
        "getProjects",
      )

      if (projectsError) {
        console.error("Error fetching projects:", projectsError)
        return []
      }

      // If no projects, return empty array
      if (!projects || projects.length === 0) {
        return []
      }

      // Get project managers for all projects
      const { data: projectManagers, error: managersError } = await executeSupabaseOperation(
        () => supabase.from("project_managers").select("*"),
        "getProjectManagers",
      )

      if (managersError) {
        console.error("Error fetching project managers:", managersError)
        // Continue with empty managers
      }

      // Create a map of project ID to managers
      const managersMap = new Map<string, string[]>()
      if (projectManagers) {
        projectManagers.forEach((pm) => {
          if (!managersMap.has(pm.project_id)) {
            managersMap.set(pm.project_id, [])
          }
          managersMap.get(pm.project_id)?.push(pm.manager_email)
        })
      }

      // Get tasks for all projects
      const { data: tasks, error: tasksError } = await executeSupabaseOperation(
        () => supabase.from("tasks").select("*").order("created_at", { ascending: false }),
        "getTasks",
      )

      if (tasksError) {
        console.error("Error fetching tasks:", tasksError)
        return projects.map((p) => ({
          ...p,
          managers: managersMap.get(p.id) || [],
          tasks: [],
        }))
      }

      // Get subtasks for all tasks - with error handling for rate limiting
      let subtasks = []
      try {
        const { data: subtasksData, error: subtasksError } = await executeSupabaseOperation(
          () => supabase.from("subtasks").select("*").order("created_at", { ascending: false }),
          "getSubtasks",
        )

        if (subtasksError) {
          console.error("Error fetching subtasks:", subtasksError)
          // Continue with empty subtasks
        } else {
          subtasks = subtasksData || []
        }
      } catch (subtaskError) {
        console.error("Exception fetching subtasks:", subtaskError)
        // Continue with empty subtasks
      }

      // Get user assignments for all subtasks - with error handling
      let userSubtasks = []
      try {
        const { data: userSubtasksData, error: userSubtasksError } = await executeSupabaseOperation(
          () => supabase.from("user_subtasks").select("*"),
          "getUserSubtasks",
        )

        if (userSubtasksError) {
          console.error("Error fetching user_subtasks:", userSubtasksError)
          // Continue with empty user assignments
        } else {
          userSubtasks = userSubtasksData || []
          console.log(`Fetched ${userSubtasksData.length} user-subtask assignments`)
        }
      } catch (userSubtaskError) {
        console.error("Exception fetching user_subtasks:", userSubtaskError)
        // Continue with empty user assignments
      }

      // Build a map of subtasks that are assigned to the current user (if a user email is provided)
      const userAssignedSubtaskIds = new Set<string>()
      if (userEmail && userSubtasks && userSubtasks.length > 0) {
        userSubtasks.forEach((assignment) => {
          if (assignment.user_email === userEmail) {
            userAssignedSubtaskIds.add(assignment.subtask_id)
          }
        })
        console.log(`Found ${userAssignedSubtaskIds.size} subtasks assigned to user ${userEmail}`)
      }

      // Build a map of task IDs that have subtasks assigned to the current user
      const userAssignedTaskIds = new Set<string>()
      if (userEmail && subtasks && subtasks.length > 0 && userAssignedSubtaskIds.size > 0) {
        subtasks.forEach((subtask) => {
          if (userAssignedSubtaskIds.has(subtask.id)) {
            userAssignedTaskIds.add(subtask.task_id)
          }
        })
        console.log(`Found ${userAssignedTaskIds.size} tasks with subtasks assigned to user ${userEmail}`)
      }

      // Build a map of project IDs that have tasks with subtasks assigned to the current user
      const userAssignedProjectIds = new Set<string>()
      if (userEmail && tasks && tasks.length > 0 && userAssignedTaskIds.size > 0) {
        tasks.forEach((task) => {
          if (userAssignedTaskIds.has(task.id)) {
            userAssignedProjectIds.add(task.project_id)
          }
        })
        console.log(`Found ${userAssignedProjectIds.size} projects with tasks assigned to user ${userEmail}`)
      }

      // If userEmail is provided, filter projects where:
      // 1. User is a manager, OR
      // 2. User has at least one subtask assigned to them in the project
      let filteredProjects = projects
      if (userEmail) {
        filteredProjects = projects.filter((project) => {
          // Include if user is a manager
          const isManager = (managersMap.get(project.id) || []).includes(userEmail)

          // Include if user has any assigned subtasks in this project
          const hasAssignedSubtasks = userAssignedProjectIds.has(project.id)

          return isManager || hasAssignedSubtasks
        })

        console.log(`Filtered to ${filteredProjects.length} projects for user ${userEmail}`)
      }

      // Build the full project structure
      const result = filteredProjects.map((project) => {
        const projectTasks = tasks
          .filter((task) => task.project_id === project.id)
          .map((task) => {
            const taskSubtasks = subtasks
              .filter((subtask) => subtask.task_id === task.id)
              .map((subtask) => {
                // Get assigned users for this subtask
                const assignedUsers = userSubtasks
                  ? userSubtasks.filter((us) => us.subtask_id === subtask.id).map((us) => us.user_email)
                  : []

                return {
                  id: subtask.id,
                  title: subtask.title,
                  description: subtask.description || undefined,
                  assignedUsers: assignedUsers,
                  createdAt: new Date(subtask.created_at),
                  updatedAt: new Date(subtask.updated_at),
                } as Subtask
              })

            return {
              id: task.id,
              title: task.title,
              description: task.description || undefined,
              dueDate: task.due_date ? new Date(task.due_date) : undefined,
              completed: task.completed,
              subtasks: taskSubtasks,
              createdAt: new Date(task.created_at),
              updatedAt: new Date(task.updated_at),
            } as Task
          })

        return {
          id: project.id,
          title: project.title,
          description: project.description || undefined,
          managers: managersMap.get(project.id) || [],
          tasks: projectTasks,
          createdAt: new Date(project.created_at),
          updatedAt: new Date(project.updated_at),
        } as Project
      })

      // Update the cache
      projectsCache = {
        data: result,
        timestamp: Date.now(),
        userEmail,
      }

      return result
    } catch (innerError) {
      console.error("Error in Supabase operations:", innerError)
      // Return empty array as fallback
      return []
    }
  } catch (error) {
    console.error("Error initializing Supabase client:", error)
    // Return empty array as fallback
    return []
  }
}

// Update getProjectById to use the per-project cache
export async function getProjectById(id: string): Promise<Project | null> {
  console.log(`Getting project by ID from Supabase: ${id}`)

  // Check if we have a valid cache for this specific project
  const cachedProject = projectCache.get(id)
  if (cachedProject && Date.now() - cachedProject.timestamp < CACHE_EXPIRATION) {
    console.log(`Returning project ${id} from cache`)
    return cachedProject.data
  }

  try {
    const supabase = getSupabaseServerActionClient()

    // Use the retry logic for the project fetch
    const project = await executeSupabaseOperation(
      () => supabase.from("projects").select("*").eq("id", id).maybeSingle(),
      "getProjectById",
    )

    if (!project.data) {
      console.log(`Project not found: ${id}`)
      return null
    }

    // Get project managers
    const { data: projectManagers, error: managersError } = await executeSupabaseOperation(
      () => supabase.from("project_managers").select("manager_email").eq("project_id", id),
      "getProjectManagers",
    )

    const managers = managersError || !projectManagers ? [] : projectManagers.map((pm) => pm.manager_email)

    // Get tasks for this project
    const { data: tasks, error: tasksError } = await executeSupabaseOperation(
      () => supabase.from("tasks").select("*").eq("project_id", id).order("created_at", { ascending: false }),
      "getProjectTasks",
    )

    if (tasksError) {
      console.error(`Error fetching tasks for project ${id}:`, tasksError)
      return {
        ...project.data,
        managers: managers,
        tasks: [],
      } as Project
    }

    // Get all subtask IDs for these tasks
    const taskIds = tasks.map((task) => task.id)

    // Get subtasks for these tasks
    const { data: subtasks, error: subtasksError } = await executeSupabaseOperation(
      () => supabase.from("subtasks").select("*").in("task_id", taskIds).order("created_at", { ascending: false }),
      "getProjectSubtasks",
    )

    if (subtasksError) {
      console.error(`Error fetching subtasks for project ${id}:`, subtasksError)
      // Continue with empty subtasks
    }

    // Get all subtask IDs
    const subtaskIds = subtasks ? subtasks.map((subtask) => subtask.id) : []

    // Get user assignments for these subtasks
    const { data: userSubtasks, error: userSubtasksError } = await executeSupabaseOperation(
      () => supabase.from("user_subtasks").select("*").in("subtask_id", subtaskIds),
      "getProjectUserSubtasks",
    )

    if (userSubtasksError) {
      console.error(`Error fetching user_subtasks for project ${id}:`, userSubtasksError)
      // Continue with empty user assignments
    }

    // Build the full project structure
    const projectTasks = tasks.map((task) => {
      const taskSubtasks = subtasks
        ? subtasks
            .filter((subtask) => subtask.task_id === task.id)
            .map((subtask) => {
              // Get assigned users for this subtask
              const assignedUsers = userSubtasks
                ? userSubtasks.filter((us) => us.subtask_id === subtask.id).map((us) => us.user_email)
                : []

              return {
                id: subtask.id,
                title: subtask.title,
                description: subtask.description || undefined,
                assignedUsers: assignedUsers,
                createdAt: new Date(subtask.created_at),
                updatedAt: new Date(subtask.updated_at),
              } as Subtask
            })
        : []

      return {
        id: task.id,
        title: task.title,
        description: task.description || undefined,
        dueDate: task.due_date ? new Date(task.due_date) : undefined,
        completed: task.completed,
        subtasks: taskSubtasks,
        createdAt: new Date(task.created_at),
        updatedAt: new Date(task.updated_at),
      } as Task
    })

    const result = {
      id: project.data.id,
      title: project.data.title,
      description: project.data.description || undefined,
      managers: managers,
      tasks: projectTasks,
      createdAt: new Date(project.data.created_at),
      updatedAt: new Date(project.data.updated_at),
    } as Project

    // Update the per-project cache
    projectCache.set(id, {
      data: result,
      timestamp: Date.now(),
    })

    console.log(`Retrieved project from Supabase: ${result.title}`)
    return result
  } catch (error) {
    console.error(`Error in getProjectById(${id}):`, error)
    return null
  }
}

// Delete a project
export async function deleteTask(projectId: string, taskId: string): Promise<boolean> {
  console.log(`Deleting task from Supabase: ${taskId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // First, check if the task exists
    const { data: task, error: checkError } = await executeSupabaseOperation(
      () => supabase.from("tasks").select("id").eq("id", taskId).maybeSingle(),
      "checkTaskExists",
    )

    if (checkError) {
      console.error(`Error checking task ${taskId}:`, checkError)
      return false
    }

    if (!task) {
      console.log(`Task not found for deletion: ${taskId}`)
      // Return true since the task is already gone, which is the desired end state
      return true
    }

    // Delete the task - this should cascade to subtasks
    // if the database is set up with proper foreign key constraints
    const { error } = await executeSupabaseOperation(
      () => supabase.from("tasks").delete().eq("id", taskId),
      "deleteTask",
    )

    if (error) {
      console.error(`Error deleting task ${taskId}:`, error)
      return false
    }

    console.log(`Deleted task from Supabase: ${taskId}`)
    return true
  } catch (error) {
    console.error(`Error in deleteTask(${taskId}):`, error)
    return false
  }
}

export async function createTask(
  projectId: string,
  title: string,
  description?: string,
  dueDate?: Date,
): Promise<Task | null> {
  console.log(`Creating task in Supabase for project ${projectId}: ${title}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const taskId = uuidv4()
    const now = new Date().toISOString()

    const { data, error } = await executeSupabaseOperation(
      () =>
        supabase
          .from("tasks")
          .insert({
            id: taskId,
            project_id: projectId,
            title,
            description,
            due_date: dueDate instanceof Date ? dueDate.toISOString() : null,
            completed: false,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single(),
      "createTask",
    )

    if (error) {
      console.error(`Error creating task ${title} in project ${projectId}:`, error)
      return null
    }

    const newTask: Task = {
      id: data.id,
      title: data.title,
      description: data.description || undefined,
      dueDate: data.due_date ? new Date(data.due_date) : undefined,
      completed: data.completed,
      subtasks: [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    }

    console.log(`Created task in Supabase with ID: ${taskId}`)
    return newTask
  } catch (error) {
    console.error(`Error in createTask(${projectId}, ${title}):`, error)
    return null
  }
}

// Add the missing createSubtask function
export async function createSubtask(
  projectId: string,
  taskId: string,
  title: string,
  description?: string,
  assignedUsers: string[] = [],
): Promise<Subtask | null> {
  console.log(`Creating subtask in Supabase for task ${taskId}: ${title}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const subtaskId = uuidv4()
    const now = new Date().toISOString()

    // Create the subtask
    const { data, error } = await executeSupabaseOperation(
      () =>
        supabase
          .from("subtasks")
          .insert({
            id: subtaskId,
            task_id: taskId,
            title,
            description,
            created_at: now,
            updated_at: now,
          })
          .select()
          .single(),
      "createSubtask",
    )

    if (error) {
      console.error(`Error creating subtask ${title} in task ${taskId}:`, error)
      return null
    }

    // If there are assigned users, add them to the user_subtasks table
    if (assignedUsers && assignedUsers.length > 0) {
      console.log(`Assigning ${assignedUsers.length} users to subtask ${subtaskId}:`, assignedUsers)

      const userEntries = assignedUsers.map((email) => ({
        subtask_id: subtaskId,
        user_email: email,
      }))

      const { error: assignmentError } = await executeSupabaseOperation(
        () => supabase.from("user_subtasks").insert(userEntries),
        "assignUsersToSubtask",
      )

      if (assignmentError) {
        console.error(`Error assigning users to subtask ${subtaskId}:`, assignmentError)
        // Continue despite error, the subtask was created
      } else {
        console.log(`Successfully assigned ${assignedUsers.length} users to subtask ${subtaskId}`)
      }
    }

    const newSubtask: Subtask = {
      id: data.id,
      title: data.title,
      description: data.description || undefined,
      assignedUsers: assignedUsers || [],
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    }

    console.log(`Created subtask in Supabase with ID: ${subtaskId}`)
    return newSubtask
  } catch (error) {
    console.error(`Error in createSubtask(${taskId}, ${title}):`, error)
    return null
  }
}

// Add the missing updateSubtask function
export async function updateSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string,
  title: string,
  description?: string,
  assignedUsers?: string[],
): Promise<Subtask | null> {
  console.log(`Updating subtask in Supabase: ${subtaskId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const now = new Date().toISOString()

    // Update the subtask
    const { data, error } = await executeSupabaseOperation(
      () =>
        supabase
          .from("subtasks")
          .update({
            title,
            description,
            updated_at: now,
          })
          .eq("id", subtaskId)
          .select()
          .single(),
      "updateSubtask",
    )

    if (error) {
      console.error(`Error updating subtask ${subtaskId}:`, error)
      return null
    }

    // If assignedUsers is provided, update user assignments
    if (assignedUsers !== undefined) {
      // First, delete all existing assignments
      const { error: deleteError } = await executeSupabaseOperation(
        () => supabase.from("user_subtasks").delete().eq("subtask_id", subtaskId),
        "deleteSubtaskAssignments",
      )

      if (deleteError) {
        console.error(`Error deleting existing user assignments for subtask ${subtaskId}:`, deleteError)
        // Continue despite error
      }

      // Then add the new assignments
      if (assignedUsers && assignedUsers.length > 0) {
        const userEntries = assignedUsers.map((email) => ({
          subtask_id: subtaskId,
          user_email: email,
        }))

        const { error: assignmentError } = await executeSupabaseOperation(
          () => supabase.from("user_subtasks").insert(userEntries),
          "insertSubtaskAssignments",
        )

        if (assignmentError) {
          console.error(`Error assigning users to subtask ${subtaskId}:`, assignmentError)
          // Continue despite error
        } else {
          console.log(`Successfully assigned ${assignedUsers.length} users to subtask ${subtaskId}`)
        }
      }
    }

    // Get the current assigned users
    const { data: currentAssignments, error: assignmentsError } = await executeSupabaseOperation(
      () => supabase.from("user_subtasks").select("user_email").eq("subtask_id", subtaskId),
      "getCurrentSubtaskAssignments",
    )

    const currentAssignedUsers =
      assignmentsError || !currentAssignments ? [] : currentAssignments.map((a) => a.user_email)

    const updatedSubtask: Subtask = {
      id: data.id,
      title: data.title,
      description: data.description || undefined,
      assignedUsers: assignedUsers !== undefined ? assignedUsers : currentAssignedUsers,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    }

    console.log(`Updated subtask in Supabase: ${subtaskId}`)
    return updatedSubtask
  } catch (error) {
    console.error(`Error in updateSubtask(${subtaskId}):`, error)
    return null
  }
}

// Add the missing deleteSubtask function
export async function deleteSubtask(projectId: string, taskId: string, subtaskId: string): Promise<boolean> {
  console.log(`Deleting subtask from Supabase: ${subtaskId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // First, check if the subtask exists
    const { data: subtask, error: checkError } = await executeSupabaseOperation(
      () => supabase.from("subtasks").select("id").eq("id", subtaskId).maybeSingle(),
      "checkSubtaskExists",
    )

    if (checkError) {
      console.error(`Error checking subtask ${subtaskId}:`, checkError)
      return false
    }

    if (!subtask) {
      console.log(`Subtask not found for deletion: ${subtaskId}`)
      // Return true since the subtask is already gone, which is the desired end state
      return true
    }

    // Delete user assignments first
    const { error: assignmentsError } = await executeSupabaseOperation(
      () => supabase.from("user_subtasks").delete().eq("subtask_id", subtaskId),
      "deleteSubtaskAssignments",
    )

    if (assignmentsError) {
      console.error(`Error deleting user assignments for subtask ${subtaskId}:`, assignmentsError)
      // Continue despite error
    }

    // Delete the subtask
    const { error } = await executeSupabaseOperation(
      () => supabase.from("subtasks").delete().eq("id", subtaskId),
      "deleteSubtask",
    )

    if (error) {
      console.error(`Error deleting subtask ${subtaskId}:`, error)
      return false
    }

    console.log(`Deleted subtask from Supabase: ${subtaskId}`)
    return true
  } catch (error) {
    console.error(`Error in deleteSubtask(${subtaskId}):`, error)
    return false
  }
}

// Add the missing toggleTaskCompletion function
export async function toggleTaskCompletion(projectId: string, taskId: string): Promise<Task | null> {
  console.log(`Toggling completion for task in Supabase: ${taskId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // First, get the current task to check its completion status
    const { data: task, error: getError } = await executeSupabaseOperation(
      () => supabase.from("tasks").select("*").eq("id", taskId).single(),
      "getTaskForToggle",
    )

    if (getError) {
      console.error(`Error getting task ${taskId}:`, getError)
      return null
    }

    // Toggle the completion status
    const newCompletionStatus = !task.completed
    const now = new Date().toISOString()

    // Update the task
    const { data, error } = await executeSupabaseOperation(
      () =>
        supabase
          .from("tasks")
          .update({
            completed: newCompletionStatus,
            updated_at: now,
          })
          .eq("id", taskId)
          .select()
          .single(),
      "toggleTaskCompletion",
    )

    if (error) {
      console.error(`Error updating task completion ${taskId}:`, error)
      return null
    }

    // Get subtasks for this task
    const { data: subtasks, error: subtasksError } = await executeSupabaseOperation(
      () => supabase.from("subtasks").select("*").eq("task_id", taskId),
      "getTaskSubtasks",
    )

    if (subtasksError) {
      console.error(`Error fetching subtasks for task ${taskId}:`, subtasksError)
      // Continue with empty subtasks
    }

    // Get user assignments for these subtasks
    const subtaskIds = subtasks ? subtasks.map((s) => s.id) : []
    let userSubtasks = []

    if (subtaskIds.length > 0) {
      const { data: userSubtasksData, error: userSubtasksError } = await executeSupabaseOperation(
        () => supabase.from("user_subtasks").select("*").in("subtask_id", subtaskIds),
        "getTaskUserSubtasks",
      )

      if (userSubtasksError) {
        console.error(`Error fetching user assignments for task ${taskId}:`, userSubtasksError)
        // Continue with empty assignments
      } else {
        userSubtasks = userSubtasksData || []
      }
    }

    // Build the full task with subtasks
    const taskSubtasks = subtasks
      ? subtasks.map((subtask) => {
          // Get assigned users for this subtask
          const assignedUsers = userSubtasks
            ? userSubtasks.filter((us) => us.subtask_id === subtask.id).map((us) => us.user_email)
            : []

          return {
            id: subtask.id,
            title: subtask.title,
            description: subtask.description || undefined,
            assignedUsers: assignedUsers,
            createdAt: new Date(subtask.created_at),
            updatedAt: new Date(subtask.updated_at),
          } as Subtask
        })
      : []

    const updatedTask: Task = {
      id: data.id,
      title: data.title,
      description: data.description || undefined,
      dueDate: data.due_date ? new Date(data.due_date) : undefined,
      completed: data.completed,
      subtasks: taskSubtasks,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    }

    console.log(`Toggled task completion in Supabase: ${taskId} to ${newCompletionStatus}`)
    return updatedTask
  } catch (error) {
    console.error(`Error in toggleTaskCompletion(${taskId}):`, error)
    return null
  }
}

// Add the missing updateTask function
export async function updateTask(
  projectId: string,
  taskId: string,
  title: string,
  description?: string,
  dueDate?: Date,
): Promise<Task | null> {
  console.log(`Updating task in Supabase: ${taskId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const now = new Date().toISOString()

    // Update the task
    const { data, error } = await executeSupabaseOperation(
      () =>
        supabase
          .from("tasks")
          .update({
            title,
            description,
            due_date: dueDate instanceof Date ? dueDate.toISOString() : null,
            updated_at: now,
          })
          .eq("id", taskId)
          .select()
          .single(),
      "updateTask",
    )

    if (error) {
      console.error(`Error updating task ${taskId}:`, error)
      return null
    }

    // Get subtasks for this task
    const { data: subtasks, error: subtasksError } = await executeSupabaseOperation(
      () => supabase.from("subtasks").select("*").eq("task_id", taskId),
      "getTaskSubtasks",
    )

    if (subtasksError) {
      console.error(`Error fetching subtasks for task ${taskId}:`, subtasksError)
      // Continue with empty subtasks
    }

    // Get user assignments for these subtasks
    const subtaskIds = subtasks ? subtasks.map((s) => s.id) : []
    let userSubtasks = []

    if (subtaskIds.length > 0) {
      const { data: userSubtasksData, error: userSubtasksError } = await executeSupabaseOperation(
        () => supabase.from("user_subtasks").select("*").in("subtask_id", subtaskIds),
        "getTaskUserSubtasks",
      )

      if (userSubtasksError) {
        console.error(`Error fetching user assignments for task ${taskId}:`, userSubtasksError)
        // Continue with empty assignments
      } else {
        userSubtasks = userSubtasksData || []
      }
    }

    // Build the full task with subtasks
    const taskSubtasks = subtasks
      ? subtasks.map((subtask) => {
          // Get assigned users for this subtask
          const assignedUsers = userSubtasks
            ? userSubtasks.filter((us) => us.subtask_id === subtask.id).map((us) => us.user_email)
            : []

          return {
            id: subtask.id,
            title: subtask.title,
            description: subtask.description || undefined,
            assignedUsers: assignedUsers,
            createdAt: new Date(subtask.created_at),
            updatedAt: new Date(subtask.updated_at),
          } as Subtask
        })
      : []

    const updatedTask: Task = {
      id: data.id,
      title: data.title,
      description: data.description || undefined,
      dueDate: data.due_date ? new Date(data.due_date) : undefined,
      completed: data.completed,
      subtasks: taskSubtasks,
      createdAt: new Date(data.created_at),
      updatedAt: new Date(data.updated_at),
    }

    console.log(`Updated task in Supabase: ${taskId}`)
    return updatedTask
  } catch (error) {
    console.error(`Error in updateTask(${taskId}):`, error)
    return null
  }
}

// Add the missing deleteProject function
export async function deleteProject(id: string): Promise<boolean> {
  console.log(`Deleting project from Supabase: ${id}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // First, check if the project exists
    const { data: project, error: checkError } = await executeSupabaseOperation(
      () => supabase.from("projects").select("id").eq("id", id).maybeSingle(),
      "checkProjectExists",
    )

    if (checkError) {
      console.error(`Error checking project ${id}:`, checkError)
      return false
    }

    if (!project) {
      console.log(`Project not found for deletion: ${id}`)
      // Return true since the project is already gone, which is the desired end state
      return true
    }

    // Delete the project - this should cascade to tasks and subtasks
    // if the database is set up with proper foreign key constraints
    const { error } = await executeSupabaseOperation(
      () => supabase.from("projects").delete().eq("id", id),
      "deleteProject",
    )

    if (error) {
      console.error(`Error deleting project ${id}:`, error)
      return false
    }

    console.log(`Deleted project from Supabase: ${id}`)
    return true
  } catch (error) {
    console.error(`Error in deleteProject(${id}):`, error)
    return false
  }
}
