export interface Subtask {
  id: string
  title: string
  description?: string
  assignedUsers: string[] // Array of user emails
  createdAt: Date
  updatedAt: Date
}

export interface Task {
  id: string
  title: string
  description?: string
  dueDate?: Date
  completed: boolean
  subtasks: Subtask[]
  createdAt: Date
  updatedAt: Date
}

export interface Project {
  id: string
  title: string
  description?: string
  managers: string[] // Array of manager emails (changed from manager?: string)
  tasks: Task[]
  createdAt: Date
  updatedAt: Date
}
