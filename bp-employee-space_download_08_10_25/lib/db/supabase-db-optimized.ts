import type { Project } from "../task-types"
import { getSupabaseServerActionClient } from "../supabase/server"

// Import all functions from the original supabase-db file
import {
  testConnection,
  createProject as originalCreateProject,
  updateProject as originalUpdateProject,
  getProjectById as originalGetProjectById,
  deleteTask as originalDeleteTask,
  createTask as originalCreateTask,
  createSubtask as originalCreateSubtask,
  updateSubtask as originalUpdateSubtask,
  deleteSubtask as originalDeleteSubtask,
  toggleTaskCompletion as originalToggleTaskCompletion,
  updateTask as originalUpdateTask,
  deleteProject as originalDeleteProject,
  invalidateAllProjectCaches as invalidateOriginalCaches,
} from "./supabase-db"

// Optimized cache with better invalidation
let projectsCache: {
  data: Project[]
  timestamp: number
  userEmail: string | null
} | null = null

const CACHE_EXPIRATION = 5 * 60 * 1000 // 5 minutes

// This function will be the single point of invalidation
export function invalidateCaches() {
  console.log("Invalidating all project-related caches.")
  projectsCache = null
  invalidateOriginalCaches()
}

// Optimized function to get projects using Supabase's native query builder
export async function getProjectsOptimized(userEmail: string | null = null): Promise<Project[]> {
  console.log(`Getting projects optimized from Supabase${userEmail ? ` for user: ${userEmail}` : " (all projects)"}`)

  // Check cache first
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

    if (userEmail) {
      // For specific user - get projects where user is manager OR has assigned subtasks
      console.log(`Fetching projects for user: ${userEmail}`)

      // Get projects where user is a manager
      const { data: managedProjects, error: managedError } = await supabase
        .from("projects")
        .select(`
          *,
          project_managers!inner(manager_email),
          tasks(
            *,
            subtasks(
              *,
              user_subtasks(user_email)
            )
          )
        `)
        .eq("project_managers.manager_email", userEmail)
        .order("created_at", { ascending: false })

      if (managedError) {
        console.error("Error fetching managed projects:", managedError)
      }

      // Get projects where user has assigned subtasks
      const { data: assignedProjects, error: assignedError } = await supabase
        .from("projects")
        .select(`
          *,
          project_managers(manager_email),
          tasks!inner(
            *,
            subtasks!inner(
              *,
              user_subtasks!inner(user_email)
            )
          )
        `)
        .eq("tasks.subtasks.user_subtasks.user_email", userEmail)
        .order("created_at", { ascending: false })

      if (assignedError) {
        console.error("Error fetching assigned projects:", assignedError)
      }

      // Combine and deduplicate projects
      const allUserProjects = [...(managedProjects || []), ...(assignedProjects || [])]

      // Remove duplicates based on project ID
      const uniqueProjects = allUserProjects.filter(
        (project, index, self) => index === self.findIndex((p) => p.id === project.id),
      )

      console.log(`Found ${uniqueProjects.length} projects for user ${userEmail}`)
      const transformedProjects = uniqueProjects.map(transformProject)

      // Update cache
      projectsCache = {
        data: transformedProjects,
        timestamp: Date.now(),
        userEmail,
      }

      return transformedProjects
    } else {
      // For admin - get all projects
      console.log("Fetching all projects for admin")

      const { data: allProjects, error } = await supabase
        .from("projects")
        .select(`
          *,
          project_managers(manager_email),
          tasks(
            *,
            subtasks(
              *,
              user_subtasks(user_email)
            )
          )
        `)
        .order("created_at", { ascending: false })

      if (error) {
        console.error("Error fetching all projects:", error)
        throw error
      }

      console.log(`Found ${allProjects?.length || 0} total projects`)
      const transformedProjects = (allProjects || []).map(transformProject)

      // Update cache
      projectsCache = {
        data: transformedProjects,
        timestamp: Date.now(),
        userEmail: null,
      }

      return transformedProjects
    }
  } catch (error) {
    console.error("Error in optimized getProjects:", error)
    // Fallback to simplified method
    return getProjectsSimplified(userEmail)
  }
}

// Simplified fallback method
async function getProjectsSimplified(userEmail: string | null = null): Promise<Project[]> {
  console.log("Using simplified fallback method")

  try {
    const supabase = getSupabaseServerActionClient()

    if (userEmail) {
      // Simplified approach for specific user
      // First get projects where user is manager
      const { data: managedProjectIds } = await supabase
        .from("project_managers")
        .select("project_id")
        .eq("manager_email", userEmail)

      // Get projects where user has subtask assignments
      const { data: assignedProjectIds } = await supabase
        .from("user_subtasks")
        .select(`
          subtask_id,
          subtasks!inner(
            task_id,
            tasks!inner(project_id)
          )
        `)
        .eq("user_email", userEmail)

      // Combine project IDs
      const managedIds = managedProjectIds?.map((p) => p.project_id) || []
      const assignedIds = assignedProjectIds?.map((a) => a.subtasks.tasks.project_id) || []
      const allProjectIds = [...new Set([...managedIds, ...assignedIds])]

      if (allProjectIds.length === 0) {
        return []
      }

      // Get the actual projects
      const { data: projects } = await supabase
        .from("projects")
        .select(`
          *,
          project_managers(manager_email),
          tasks(
            *,
            subtasks(
              *,
              user_subtasks(user_email)
            )
          )
        `)
        .in("id", allProjectIds)
        .order("created_at", { ascending: false })

      return (projects || []).map(transformProject)
    } else {
      // Get all projects for admin
      const { data: projects } = await supabase
        .from("projects")
        .select(`
          *,
          project_managers(manager_email),
          tasks(
            *,
            subtasks(
              *,
              user_subtasks(user_email)
            )
          )
        `)
        .order("created_at", { ascending: false })

      return (projects || []).map(transformProject)
    }
  } catch (error) {
    console.error("Error in simplified getProjects:", error)
    return []
  }
}

function transformProject(projectData: any): Project {
  return {
    id: projectData.id,
    title: projectData.title,
    description: projectData.description || undefined,
    managers: projectData.project_managers?.map((pm: any) => pm.manager_email) || [],
    tasks: (projectData.tasks || []).map((task: any) => ({
      id: task.id,
      title: task.title,
      description: task.description || undefined,
      dueDate: task.due_date ? new Date(task.due_date) : undefined,
      completed: task.completed,
      subtasks: (task.subtasks || []).map((subtask: any) => ({
        id: subtask.id,
        title: subtask.title,
        description: subtask.description || undefined,
        assignedUsers: subtask.user_subtasks?.map((us: any) => us.user_email) || [],
        createdAt: new Date(subtask.created_at),
        updatedAt: new Date(subtask.updated_at),
      })),
      createdAt: new Date(task.created_at),
      updatedAt: new Date(task.updated_at),
    })),
    createdAt: new Date(projectData.created_at),
    updatedAt: new Date(projectData.updated_at),
  }
}

// Re-export all the other functions from the original file
export {
  testConnection,
  originalCreateProject as createProject,
  originalUpdateProject as updateProject,
  originalGetProjectById as getProjectById,
  originalDeleteTask as deleteTask,
  originalCreateTask as createTask,
  originalCreateSubtask as createSubtask,
  originalUpdateSubtask as updateSubtask,
  originalDeleteSubtask as deleteSubtask,
  originalToggleTaskCompletion as toggleTaskCompletion,
  originalUpdateTask as updateTask,
  originalDeleteProject as deleteProject,
}

// Export the optimized version as the main function
export { getProjectsOptimized as getProjects }
