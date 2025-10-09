"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { v4 as uuidv4 } from "uuid"
import type { Project, Task, Subtask } from "./task-types"

interface ProjectState {
  projects: Project[]
  selectedProjectId: string | null
  selectedTaskId: string | null

  // Project actions
  addProject: (title: string, description?: string) => void
  updateProject: (id: string, title: string, description?: string) => void
  deleteProject: (id: string) => void
  selectProject: (id: string | null) => void

  // Task actions
  addTask: (projectId: string, title: string, description?: string, dueDate?: Date) => void
  updateTask: (projectId: string, taskId: string, title: string, description?: string, dueDate?: Date) => void
  deleteTask: (projectId: string, taskId: string) => void
  selectTask: (id: string | null) => void

  // Subtask actions
  addSubtask: (projectId: string, taskId: string, title: string, description?: string) => void
  updateSubtask: (projectId: string, taskId: string, subtaskId: string, title: string, description?: string) => void
  deleteSubtask: (projectId: string, taskId: string, subtaskId: string) => void
}

export const useProjectStore = create<ProjectState>()(
  persist(
    (set) => ({
      projects: [],
      selectedProjectId: null,
      selectedTaskId: null,

      // Project actions
      addProject: (title, description) =>
        set((state) => {
          const newProject: Project = {
            id: uuidv4(),
            title,
            description,
            tasks: [],
            createdAt: new Date(),
            updatedAt: new Date(),
          }

          return {
            projects: [...state.projects, newProject],
            selectedProjectId: newProject.id,
          }
        }),

      updateProject: (id, title, description) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === id
              ? {
                  ...project,
                  title,
                  description,
                  updatedAt: new Date(),
                }
              : project,
          ),
        })),

      deleteProject: (id) =>
        set((state) => ({
          projects: state.projects.filter((project) => project.id !== id),
          selectedProjectId: state.selectedProjectId === id ? null : state.selectedProjectId,
          selectedTaskId: state.selectedProjectId === id ? null : state.selectedTaskId,
        })),

      selectProject: (id) => set({ selectedProjectId: id, selectedTaskId: null }),

      // Task actions
      addTask: (projectId, title, description, dueDate) =>
        set((state) => {
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

          return {
            projects: state.projects.map((project) =>
              project.id === projectId
                ? {
                    ...project,
                    tasks: [...project.tasks, newTask],
                    updatedAt: new Date(),
                  }
                : project,
            ),
            selectedTaskId: newTask.id,
          }
        }),

      updateTask: (projectId, taskId, title, description, dueDate) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  tasks: project.tasks.map((task) =>
                    task.id === taskId
                      ? {
                          ...task,
                          title,
                          description,
                          dueDate,
                          updatedAt: new Date(),
                        }
                      : task,
                  ),
                  updatedAt: new Date(),
                }
              : project,
          ),
        })),

      deleteTask: (projectId, taskId) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  tasks: project.tasks.filter((task) => task.id !== taskId),
                  updatedAt: new Date(),
                }
              : project,
          ),
          selectedTaskId: state.selectedTaskId === taskId ? null : state.selectedTaskId,
        })),

      selectTask: (id) => set({ selectedTaskId: id }),

      // Subtask actions
      addSubtask: (projectId, taskId, title, description) =>
        set((state) => {
          const newSubtask: Subtask = {
            id: uuidv4(),
            title,
            description,
            createdAt: new Date(),
            updatedAt: new Date(),
          }

          return {
            projects: state.projects.map((project) =>
              project.id === projectId
                ? {
                    ...project,
                    tasks: project.tasks.map((task) =>
                      task.id === taskId
                        ? {
                            ...task,
                            subtasks: [...task.subtasks, newSubtask],
                            updatedAt: new Date(),
                          }
                        : task,
                    ),
                    updatedAt: new Date(),
                  }
                : project,
            ),
          }
        }),

      updateSubtask: (projectId, taskId, subtaskId, title, description) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  tasks: project.tasks.map((task) =>
                    task.id === taskId
                      ? {
                          ...task,
                          subtasks: task.subtasks.map((subtask) =>
                            subtask.id === subtaskId
                              ? {
                                  ...subtask,
                                  title,
                                  description,
                                  updatedAt: new Date(),
                                }
                              : subtask,
                          ),
                          updatedAt: new Date(),
                        }
                      : task,
                  ),
                  updatedAt: new Date(),
                }
              : project,
          ),
        })),

      deleteSubtask: (projectId, taskId, subtaskId) =>
        set((state) => ({
          projects: state.projects.map((project) =>
            project.id === projectId
              ? {
                  ...project,
                  tasks: project.tasks.map((task) =>
                    task.id === taskId
                      ? {
                          ...task,
                          subtasks: task.subtasks.filter((subtask) => subtask.id !== subtaskId),
                          updatedAt: new Date(),
                        }
                      : task,
                  ),
                  updatedAt: new Date(),
                }
              : project,
          ),
        })),
    }),
    {
      name: "project-storage",
    },
  ),
)
