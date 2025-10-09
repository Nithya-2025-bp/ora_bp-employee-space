import { v4 as uuidv4 } from "uuid"
import type { Project, Task, Subtask } from "../task-types"
import { readJsonFile, writeJsonFile } from "./file-storage"

const PROJECTS_FILE = "projects.json"

// Helper function to read projects from JSON file
async function readProjects(): Promise<Project[]> {
  return await readJsonFile<Project[]>(PROJECTS_FILE, [])
}

// Helper function to write projects to JSON file
async function writeProjects(projects: Project[]): Promise<void> {
  await writeJsonFile(PROJECTS_FILE, projects)
}

// Get all projects
export async function getProjects(): Promise<Project[]> {
  console.log("Getting all projects")
  return await readProjects()
}

// Get a specific project by ID
export async function getProjectById(id: string): Promise<Project | null> {
  console.log(`Getting project by ID: ${id}`)
  const projects = await readProjects()
  return projects.find((project) => project.id === id) || null
}

// Create a new project
export async function createProject(title: string, description?: string): Promise<Project> {
  console.log(`Creating new project: ${title}`)
  const projects = await readProjects()

  const newProject: Project = {
    id: uuidv4(),
    title,
    description,
    tasks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  projects.push(newProject)
  await writeProjects(projects)
  console.log(`Created project with ID: ${newProject.id}`)

  return newProject
}

// Update a project
export async function updateProject(id: string, title: string, description?: string): Promise<Project | null> {
  console.log(`Updating project: ${id}`)
  const projects = await readProjects()
  const projectIndex = projects.findIndex((project) => project.id === id)

  if (projectIndex === -1) {
    console.log(`Project not found: ${id}`)
    return null
  }

  projects[projectIndex] = {
    ...projects[projectIndex],
    title,
    description,
    updatedAt: new Date(),
  }

  await writeProjects(projects)
  console.log(`Updated project: ${id}`)

  return projects[projectIndex]
}

// Delete a project
export async function deleteProject(id: string): Promise<boolean> {
  console.log(`Deleting project: ${id}`)
  const projects = await readProjects()
  const filteredProjects = projects.filter((project) => project.id !== id)

  if (filteredProjects.length === projects.length) {
    console.log(`Project not found for deletion: ${id}`)
    return false
  }

  await writeProjects(filteredProjects)
  console.log(`Deleted project: ${id}`)

  return true
}

// Create a new task in a project
export async function createTask(
  projectId: string,
  title: string,
  description?: string,
  dueDate?: Date,
): Promise<Task | null> {
  console.log(`Creating task in project ${projectId}: ${title}`)
  const projects = await readProjects()
  const projectIndex = projects.findIndex((project) => project.id === projectId)

  if (projectIndex === -1) {
    console.log(`Project not found: ${projectId}`)
    return null
  }

  const newTask: Task = {
    id: uuidv4(),
    title,
    description,
    dueDate,
    completed: false,
    subtasks: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  projects[projectIndex].tasks.push(newTask)
  projects[projectIndex].updatedAt = new Date()

  await writeProjects(projects)
  console.log(`Created task with ID: ${newTask.id}`)

  return newTask
}

// Update a task
export async function updateTask(
  projectId: string,
  taskId: string,
  title: string,
  description?: string,
  dueDate?: Date,
): Promise<Task | null> {
  console.log(`Updating task ${taskId} in project ${projectId}`)
  const projects = await readProjects()
  const projectIndex = projects.findIndex((project) => project.id === projectId)

  if (projectIndex === -1) {
    console.log(`Project not found: ${projectId}`)
    return null
  }

  const taskIndex = projects[projectIndex].tasks.findIndex((task) => task.id === taskId)

  if (taskIndex === -1) {
    console.log(`Task not found: ${taskId}`)
    return null
  }

  projects[projectIndex].tasks[taskIndex] = {
    ...projects[projectIndex].tasks[taskIndex],
    title,
    description,
    dueDate,
    updatedAt: new Date(),
  }

  projects[projectIndex].updatedAt = new Date()

  await writeProjects(projects)
  console.log(`Updated task: ${taskId}`)

  return projects[projectIndex].tasks[taskIndex]
}

// Delete a task
export async function deleteTask(projectId: string, taskId: string): Promise<boolean> {
  console.log(`Deleting task ${taskId} from project ${projectId}`)
  const projects = await readProjects()
  const projectIndex = projects.findIndex((project) => project.id === projectId)

  if (projectIndex === -1) {
    console.log(`Project not found: ${projectId}`)
    return false
  }

  const originalTasksLength = projects[projectIndex].tasks.length
  projects[projectIndex].tasks = projects[projectIndex].tasks.filter((task) => task.id !== taskId)

  if (projects[projectIndex].tasks.length === originalTasksLength) {
    console.log(`Task not found for deletion: ${taskId}`)
    return false
  }

  projects[projectIndex].updatedAt = new Date()

  await writeProjects(projects)
  console.log(`Deleted task: ${taskId}`)

  return true
}

// Toggle task completion
export async function toggleTaskCompletion(projectId: string, taskId: string): Promise<Task | null> {
  console.log(`Toggling completion for task ${taskId} in project ${projectId}`)
  const projects = await readProjects()
  const projectIndex = projects.findIndex((project) => project.id === projectId)

  if (projectIndex === -1) {
    console.log(`Project not found: ${projectId}`)
    return null
  }

  const taskIndex = projects[projectIndex].tasks.findIndex((task) => task.id === taskId)

  if (taskIndex === -1) {
    console.log(`Task not found: ${taskId}`)
    return null
  }

  projects[projectIndex].tasks[taskIndex].completed = !projects[projectIndex].tasks[taskIndex].completed
  projects[projectIndex].tasks[taskIndex].updatedAt = new Date()
  projects[projectIndex].updatedAt = new Date()

  await writeProjects(projects)
  console.log(`Toggled completion for task: ${taskId}`)

  return projects[projectIndex].tasks[taskIndex]
}

// Create a new subtask
export async function createSubtask(
  projectId: string,
  taskId: string,
  title: string,
  description?: string,
  assignedUsers: string[] = [],
): Promise<Subtask | null> {
  console.log(`Creating subtask in task ${taskId}, project ${projectId}: ${title}`)
  const projects = await readProjects()
  const projectIndex = projects.findIndex((project) => project.id === projectId)

  if (projectIndex === -1) {
    console.log(`Project not found: ${projectId}`)
    return null
  }

  const taskIndex = projects[projectIndex].tasks.findIndex((task) => task.id === taskId)

  if (taskIndex === -1) {
    console.log(`Task not found: ${taskId}`)
    return null
  }

  const newSubtask: Subtask = {
    id: uuidv4(),
    title,
    description,
    assignedUsers: assignedUsers || [],
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  projects[projectIndex].tasks[taskIndex].subtasks.push(newSubtask)
  projects[projectIndex].tasks[taskIndex].updatedAt = new Date()
  projects[projectIndex].updatedAt = new Date()

  await writeProjects(projects)
  console.log(`Created subtask with ID: ${newSubtask.id}`)

  return newSubtask
}

// Update a subtask
export async function updateSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string,
  title: string,
  description?: string,
  assignedUsers?: string[],
): Promise<Subtask | null> {
  console.log(`Updating subtask ${subtaskId} in task ${taskId}, project ${projectId}`)
  const projects = await readProjects()
  const projectIndex = projects.findIndex((project) => project.id === projectId)

  if (projectIndex === -1) {
    console.log(`Project not found: ${projectId}`)
    return null
  }

  const taskIndex = projects[projectIndex].tasks.findIndex((task) => task.id === taskId)

  if (taskIndex === -1) {
    console.log(`Task not found: ${taskId}`)
    return null
  }

  const subtaskIndex = projects[projectIndex].tasks[taskIndex].subtasks.findIndex((subtask) => subtask.id === subtaskId)

  if (subtaskIndex === -1) {
    console.log(`Subtask not found: ${subtaskId}`)
    return null
  }

  const currentSubtask = projects[projectIndex].tasks[taskIndex].subtasks[subtaskIndex]

  projects[projectIndex].tasks[taskIndex].subtasks[subtaskIndex] = {
    ...currentSubtask,
    title,
    description,
    assignedUsers: assignedUsers !== undefined ? assignedUsers : currentSubtask.assignedUsers || [],
    updatedAt: new Date(),
  }

  projects[projectIndex].tasks[taskIndex].updatedAt = new Date()
  projects[projectIndex].updatedAt = new Date()

  await writeProjects(projects)
  console.log(`Updated subtask: ${subtaskId}`)

  return projects[projectIndex].tasks[taskIndex].subtasks[subtaskIndex]
}

// Delete a subtask
export async function deleteSubtask(projectId: string, taskId: string, subtaskId: string): Promise<boolean> {
  console.log(`Deleting subtask ${subtaskId} from task ${taskId}, project ${projectId}`)
  const projects = await readProjects()
  const projectIndex = projects.findIndex((project) => project.id === projectId)

  if (projectIndex === -1) {
    console.log(`Project not found: ${projectId}`)
    return false
  }

  const taskIndex = projects[projectIndex].tasks.findIndex((task) => task.id === taskId)

  if (taskIndex === -1) {
    console.log(`Task not found: ${taskId}`)
    return false
  }

  const originalSubtasksLength = projects[projectIndex].tasks[taskIndex].subtasks.length
  projects[projectIndex].tasks[taskIndex].subtasks = projects[projectIndex].tasks[taskIndex].subtasks.filter(
    (subtask) => subtask.id !== subtaskId,
  )

  if (projects[projectIndex].tasks[taskIndex].subtasks.length === originalSubtasksLength) {
    console.log(`Subtask not found for deletion: ${subtaskId}`)
    return false
  }

  projects[projectIndex].tasks[taskIndex].updatedAt = new Date()
  projects[projectIndex].updatedAt = new Date()

  await writeProjects(projects)
  console.log(`Deleted subtask: ${subtaskId}`)

  return true
}
