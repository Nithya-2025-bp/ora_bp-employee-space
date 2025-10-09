// Create a new utility file for task-related helper functions

import type { Project, Task, Subtask } from "./task-types"

/**
 * Checks if a user is assigned to a subtask
 */
export function isUserAssignedToSubtask(subtask: Subtask, userEmail: string): boolean {
  // If the subtask has no assignedUsers property or it's an empty array
  if (!subtask.assignedUsers || subtask.assignedUsers.length === 0) {
    // Now we consider it NOT assigned to the user (was previously returning true)
    // Empty assignedUsers list means no one is specifically assigned
    return false
  }

  return subtask.assignedUsers.includes(userEmail)
}

/**
 * Checks if a user is assigned to any subtask in a task
 */
export function isUserAssignedToTask(task: Task, userEmail: string): boolean {
  if (!task.subtasks || task.subtasks.length === 0) {
    return false
  }

  return task.subtasks.some((subtask) => isUserAssignedToSubtask(subtask, userEmail))
}

/**
 * Checks if a user is assigned to any task in a project
 */
export function isUserAssignedToProject(project: Project, userEmail: string): boolean {
  if (!project.tasks || project.tasks.length === 0) {
    return false
  }

  return project.tasks.some((task) => isUserAssignedToTask(task, userEmail))
}

/**
 * Get all subtasks assigned to a user across an array of projects
 */
export function getAllUserAssignedSubtasks(projects: Project[], userEmail: string): Subtask[] {
  const assignedSubtasks: Subtask[] = []

  projects.forEach((project) => {
    project.tasks.forEach((task) => {
      task.subtasks.forEach((subtask) => {
        if (isUserAssignedToSubtask(subtask, userEmail)) {
          // Add task and project references to the subtask for context
          const enhancedSubtask = {
            ...subtask,
            taskId: task.id,
            taskTitle: task.title,
            projectId: project.id,
            projectTitle: project.title,
          }
          assignedSubtasks.push(enhancedSubtask)
        }
      })
    })
  })

  return assignedSubtasks
}

/**
 * Debug helper to log assignment information
 */
export function logAssignmentInfo(
  projects: Project[],
  userEmail: string,
): { projectCount: number; taskCount: number; subtaskCount: number; assignedSubtaskCount: number } {
  let projectCount = 0
  let taskCount = 0
  let subtaskCount = 0
  let assignedSubtaskCount = 0

  projects.forEach((project) => {
    projectCount++
    project.tasks.forEach((task) => {
      taskCount++
      task.subtasks.forEach((subtask) => {
        subtaskCount++
        if (subtask.assignedUsers && subtask.assignedUsers.includes(userEmail)) {
          assignedSubtaskCount++
        }
      })
    })
  })

  console.log(`Assignment info for ${userEmail}:`)
  console.log(`- Projects: ${projectCount}`)
  console.log(`- Tasks: ${taskCount}`)
  console.log(`- Subtasks: ${subtaskCount}`)
  console.log(`- Assigned subtasks: ${assignedSubtaskCount}`)

  return { projectCount, taskCount, subtaskCount, assignedSubtaskCount }
}
