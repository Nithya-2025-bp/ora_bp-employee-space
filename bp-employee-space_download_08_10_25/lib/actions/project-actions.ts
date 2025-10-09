"use server"

import * as db from "../db/supabase-db-optimized"
import type { Project, Task, Subtask } from "../task-types"
import { getCurrentUser } from "../auth"
import { createTask as dbCreateTask } from "@/lib/db/supabase-db"

// Custom error class for unauthorized actions
class UnauthorizedError extends Error {
  constructor(message = "Unauthorized: Admin access required") {
    super(message)
    this.name = "UnauthorizedError"
  }
}

// Helper function to validate admin access
async function validateAdmin() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      console.error("No user found in session")
      throw new UnauthorizedError("No user found in session")
    }

    if (!user.isAdmin) {
      console.error(`User ${user.email} attempted admin action but is not an admin`)
      throw new UnauthorizedError(`User ${user.email} is not authorized for admin actions`)
    }

    console.log(`Admin validation successful for user: ${user.email}`)
    return user
  } catch (error) {
    console.error("Admin validation failed:", error)
    throw error
  }
}

// Helper function to validate admin or project manager access
async function validateAdminOrProjectManager(projectId?: string) {
  try {
    const user = await getCurrentUser()
    if (!user) {
      console.error("No user found in session")
      throw new UnauthorizedError("No user found in session")
    }

    // Admins always have access
    if (user.isAdmin) {
      console.log(`Admin validation successful for user: ${user.email}`)
      return user
    }

    // If no projectId provided, only admins can proceed
    if (!projectId) {
      console.error(`User ${user.email} attempted action without project ID and is not an admin`)
      throw new UnauthorizedError(`User ${user.email} is not authorized for this action`)
    }

    // Check if user is one of the project managers
    const project = await db.getProjectById(projectId)
    if (!project) {
      console.error(`Project not found: ${projectId}`)
      throw new UnauthorizedError(`Project not found: ${projectId}`)
    }

    if (project.managers && project.managers.includes(user.email)) {
      console.log(`Project manager validation successful for user: ${user.email} on project: ${projectId}`)
      return user
    }

    console.error(`User ${user.email} attempted action on project ${projectId} but is not a manager`)
    throw new UnauthorizedError(`User ${user.email} is not authorized to manage this project`)
  } catch (error) {
    console.error("Permission validation failed:", error)
    throw error
  }
}

// Project actions
export async function getProjects(): Promise<Project[]> {
  console.log("Server Action: getProjects")
  const startTime = Date.now()

  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      console.error("No user found in session")
      return []
    }

    const userEmail = currentUser.email
    console.log(`Getting projects for user ${userEmail}`)

    const projects = await db.getProjects(userEmail)
    const duration = Date.now() - startTime

    console.log(`Retrieved ${projects.length} projects for user ${userEmail} in ${duration}ms`)
    return projects
  } catch (error) {
    const duration = Date.now() - startTime
    console.error(`Error in getProjects after ${duration}ms:`, error)
    throw error
  }
}

// Get all projects for management purposes (admin or project managers)
export async function getAllProjects(): Promise<Project[]> {
  console.log("Server Action: getAllProjects (for management)")
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      console.error("No user found in session")
      return []
    }

    // Admins get ALL projects, no filtering
    if (currentUser.isAdmin) {
      console.log(`Getting all projects for admin user ${currentUser.email}`)
      const projects = await db.getProjects() // No user email parameter = get all projects
      console.log(`Retrieved ${projects.length} total projects for admin management`)
      return projects
    }

    // For non-admins, check if they're a manager of any project
    const allProjects = await db.getProjects() // No user filtering
    const isManagerOfAnyProject = allProjects.some(
      (project) => project.managers && project.managers.includes(currentUser.email),
    )

    if (!isManagerOfAnyProject) {
      console.log(`User ${currentUser.email} is not a manager of any project, returning empty array`)
      return []
    }

    console.log(`Getting all projects for project manager ${currentUser.email}`)
    return allProjects
  } catch (error) {
    console.error("Error in getAllProjects:", error)
    throw error
  }
}

export async function getProjectById(id: string): Promise<Project | null> {
  console.log(`Server Action: getProjectById(${id})`)
  try {
    const project = await db.getProjectById(id)
    console.log(project ? `Retrieved project: ${project.title}` : `Project not found: ${id}`)
    return project
  } catch (error) {
    console.error(`Error in getProjectById(${id}):`, error)
    throw error // Rethrow to allow proper error handling in the UI
  }
}

// The createProject function looks correct, but let's make sure it's properly logging the managers
export async function createProject(title: string, description?: string, managers: string[] = []): Promise<Project> {
  console.log(`Server Action: createProject("${title}") with managers:`, managers)
  try {
    // Validate admin access
    await validateAdmin()

    const project = await db.createProject(title, description, managers)
    db.invalidateCaches()
    console.log(`Project created successfully: ${project.id} with managers:`, project.managers)
    return project
  } catch (error) {
    console.error(`Error in createProject("${title}"):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to create project: ${error.message}`)
  }
}

export async function updateProject(
  id: string,
  title: string,
  description?: string,
  managers: string[] = [],
): Promise<Project | null> {
  console.log(`Server Action: updateProject(${id})`)
  try {
    // Check if user is admin or one of the project managers
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      throw new UnauthorizedError("No user found in session")
    }

    // Get the current project to check permissions
    const currentProject = await db.getProjectById(id)
    if (!currentProject) {
      throw new Error(`Project not found: ${id}`)
    }

    // Allow if user is admin or one of the current project managers
    if (!currentUser.isAdmin && (!currentProject.managers || !currentProject.managers.includes(currentUser.email))) {
      throw new UnauthorizedError(`User ${currentUser.email} is not authorized to update this project`)
    }

    const project = await db.updateProject(id, title, description, managers)
    db.invalidateCaches()
    console.log(project ? `Project updated successfully: ${id}` : `Project not found: ${id}`)
    return project
  } catch (error) {
    console.error(`Error in updateProject(${id}):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to update project: ${error.message}`)
  }
}

export async function deleteProject(id: string): Promise<boolean> {
  console.log(`Server Action: deleteProject(${id})`)
  try {
    // Validate admin access
    await validateAdmin()

    // First, check if the project exists
    const project = await getProjectById(id)
    if (!project) {
      console.log(`Project not found or already deleted: ${id}`)
      // Return true since the project is already gone, which is the desired end state
      return true
    }

    console.log(`Deleting project with ${project.tasks?.length || 0} tasks: ${id}`)

    // Delete the project (Supabase should handle cascading deletes)
    const result = await db.deleteProject(id)
    if (result) {
      db.invalidateCaches()
    }

    console.log(result ? `Project deleted successfully: ${id}` : `Failed to delete project: ${id}`)
    return result
  } catch (error) {
    console.error(`Error in deleteProject(${id}):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to delete project: ${error.message}`)
  }
}

// Task actions
export async function createTask(
  projectId: string,
  title: string,
  description?: string,
  dueDate?: Date,
): Promise<Task | null> {
  console.log(`Server Action: createTask(${projectId}, "${title}")`)
  try {
    // Validate admin or project manager access
    await validateAdminOrProjectManager(projectId)

    const task = await dbCreateTask(projectId, title, description, dueDate)
    if (task) {
      db.invalidateCaches()
    }
    console.log(task ? `Task created successfully: ${task.id}` : `Failed to create task in project: ${projectId}`)
    return task
  } catch (error) {
    console.error(`Error in createTask(${projectId}, "${title}"):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to create task: ${error.message}`)
  }
}

export async function updateTask(
  projectId: string,
  taskId: string,
  title: string,
  description?: string,
  dueDate?: Date,
): Promise<Task | null> {
  console.log(`Server Action: updateTask(${projectId}, ${taskId})`)
  try {
    // Validate admin or project manager access
    await validateAdminOrProjectManager(projectId)

    const task = await db.updateTask(projectId, taskId, title, description, dueDate)
    if (task) {
      db.invalidateCaches()
    }
    console.log(task ? `Task updated successfully: ${taskId}` : `Task not found: ${taskId}`)
    return task
  } catch (error) {
    console.error(`Error in updateTask(${projectId}, ${taskId}):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to update task: ${error.message}`)
  }
}

export async function deleteTask(projectId: string, taskId: string): Promise<boolean> {
  console.log(`Server Action: deleteTask(${projectId}, ${taskId})`)
  try {
    // Validate admin or project manager access
    await validateAdminOrProjectManager(projectId)

    const result = await db.deleteTask(projectId, taskId)
    if (result) {
      db.invalidateCaches()
    }
    console.log(result ? `Task deleted successfully: ${taskId}` : `Task not found: ${taskId}`)
    return result
  } catch (error) {
    console.error(`Error in deleteTask(${projectId}, ${taskId}):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to delete task: ${error.message}`)
  }
}

export async function toggleTaskCompletion(projectId: string, taskId: string): Promise<Task | null> {
  console.log(`Server Action: toggleTaskCompletion(${projectId}, ${taskId})`)
  try {
    const task = await db.toggleTaskCompletion(projectId, taskId)
    if (task) {
      db.invalidateCaches()
    }
    console.log(task ? `Task completion toggled: ${taskId}` : `Task not found: ${taskId}`)
    return task
  } catch (error) {
    console.error(`Error in toggleTaskCompletion(${projectId}, ${taskId}):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to toggle task completion: ${error.message}`)
  }
}

// Subtask actions
export async function createSubtask(
  projectId: string,
  taskId: string,
  title: string,
  description?: string,
  assignedUsers: string[] = [],
): Promise<Subtask | null> {
  console.log(`Server Action: createSubtask(${projectId}, ${taskId}, "${title}")`)
  try {
    // Validate admin or project manager access
    await validateAdminOrProjectManager(projectId)

    const subtask = await db.createSubtask(projectId, taskId, title, description, assignedUsers)
    if (subtask) {
      db.invalidateCaches()
    }
    console.log(subtask ? `Subtask created successfully: ${subtask.id}` : `Failed to create subtask in task: ${taskId}`)
    return subtask
  } catch (error) {
    console.error(`Error in createSubtask(${projectId}, ${taskId}, "${title}"):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to create subtask: ${error.message}`)
  }
}

export async function updateSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string,
  title: string,
  description?: string,
  assignedUsers?: string[],
): Promise<Subtask | null> {
  console.log(`Server Action: updateSubtask(${projectId}, ${taskId}, ${subtaskId})`)
  try {
    // Validate admin or project manager access
    await validateAdminOrProjectManager(projectId)

    const subtask = await db.updateSubtask(projectId, taskId, subtaskId, title, description, assignedUsers)
    if (subtask) {
      db.invalidateCaches()
    }
    console.log(subtask ? `Subtask updated successfully: ${subtaskId}` : `Subtask not found: ${subtaskId}`)
    return subtask
  } catch (error) {
    console.error(`Error in updateSubtask(${projectId}, ${taskId}, ${subtaskId}):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to update subtask: ${error.message}`)
  }
}

export async function deleteSubtask(projectId: string, taskId: string, subtaskId: string): Promise<boolean> {
  console.log(`Server Action: deleteSubtask(${projectId}, ${taskId}, ${subtaskId})`)
  try {
    // Validate admin or project manager access
    await validateAdminOrProjectManager(projectId)

    const result = await db.deleteSubtask(projectId, taskId, subtaskId)
    if (result) {
      db.invalidateCaches()
    }
    console.log(result ? `Subtask deleted successfully: ${subtaskId}` : `Subtask not found: ${subtaskId}`)
    return result
  } catch (error) {
    console.error(`Error in deleteSubtask(${projectId}, ${taskId}, ${subtaskId}):`, error)
    if (error instanceof UnauthorizedError) {
      throw error
    }
    throw new Error(`Failed to delete subtask: ${error.message}`)
  }
}
