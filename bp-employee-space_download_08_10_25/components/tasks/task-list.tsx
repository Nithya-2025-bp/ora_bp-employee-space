"use client"

import type React from "react"

import { useState, useCallback, memo } from "react"
import type { Project, Task } from "@/lib/task-types"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Trash2, MoreHorizontal, Calendar, ChevronDown, ChevronUp } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import CreateTaskDialog from "./create-task-dialog"
import EditTaskDialog from "./edit-task-dialog"
import DeleteConfirmDialog from "./delete-confirm-dialog"
import { deleteTask } from "@/lib/actions/project-actions"
import { format } from "date-fns"

interface TaskListProps {
  project: Project | undefined
  selectedTaskId: string | null
  onSelectTask: (id: string) => void
  onTasksChange: () => Promise<void>
  isAdmin: boolean
}

// Use React.memo to prevent unnecessary re-renders
const TaskList = memo(function TaskList({
  project,
  selectedTaskId,
  onSelectTask,
  onTasksChange,
  isAdmin,
}: TaskListProps) {
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [taskToEdit, setTaskToEdit] = useState<Task | null>(null)
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null)
  const [expandedTasks, setExpandedTasks] = useState<Record<string, boolean>>({})

  const handleDeleteTask = useCallback(async (projectId: string, taskId: string) => {
    try {
      await deleteTask(projectId, taskId)
      window.location.reload()
    } catch (error) {
      console.error("Failed to delete task:", error)
      alert("You don't have permission to delete this task.")
    }
  }, [])

  const toggleExpand = useCallback((taskId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card selection when clicking expand button
    setExpandedTasks((prev) => ({
      ...prev,
      [taskId]: !prev[taskId],
    }))
  }, [])

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-500 mb-4">No project selected</p>
        <p className="text-sm text-gray-400">Select or create a project to see tasks</p>
      </div>
    )
  }

  // Ensure tasks is an array
  const tasks = Array.isArray(project.tasks) ? project.tasks : []

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-black">Tasks</h2>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreateTaskOpen(true)}
            className="flex items-center gap-1 bg-black text-white hover:bg-black/90"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        )}
      </div>

      {tasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <p className="text-gray-500 mb-4">No tasks yet</p>
          {isAdmin && <p className="text-sm text-gray-400">Create a new task to get started</p>}
        </div>
      ) : (
        <div className="space-y-3 overflow-y-auto">
          {tasks.map((task) => {
            const isExpanded = expandedTasks[task.id] || false

            return (
              <div
                key={task.id}
                className={`p-4 rounded-md cursor-pointer border flex flex-col justify-between transition-all duration-200 ${
                  selectedTaskId === task.id
                    ? "bg-[#0051FF]/5 border-[#0051FF]"
                    : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                }`}
                onClick={() => onSelectTask(task.id)}
              >
                <div className="flex items-start justify-between">
                  <h3 className="font-medium text-lg text-black">{task.title}</h3>

                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      onClick={(e) => toggleExpand(task.id, e)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span className="sr-only">{isExpanded ? "Collapse" : "Expand"}</span>
                    </Button>

                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-8 w-8 p-0 bg-black text-white hover:bg-black/80"
                          >
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Open menu</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => setTaskToEdit(task)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => setTaskToDelete(task)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Only show description when expanded */}
                {isExpanded && task.description && (
                  <p className="text-sm text-gray-600 mt-2 mb-2">{task.description}</p>
                )}

                <div className="flex items-center justify-between mt-auto">
                  <p className="text-xs text-gray-500">
                    {task.subtasks?.length || 0} {(task.subtasks?.length || 0) === 1 ? "subtask" : "subtasks"}
                  </p>

                  {task.dueDate && (
                    <div className="flex items-center text-xs text-gray-500">
                      <Calendar className="h-3 w-3 mr-1" />
                      {format(new Date(task.dueDate), "MMM d, yyyy")}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <>
          <CreateTaskDialog
            projectId={project.id}
            open={isCreateTaskOpen}
            onOpenChange={setIsCreateTaskOpen}
            onTaskCreated={onTasksChange}
          />

          {taskToEdit && (
            <EditTaskDialog
              projectId={project.id}
              task={taskToEdit}
              open={!!taskToEdit}
              onOpenChange={(open) => !open && setTaskToEdit(null)}
              onTaskUpdated={onTasksChange}
            />
          )}

          {taskToDelete && (
            <DeleteConfirmDialog
              title="Delete Task"
              description="Are you sure you want to delete this task? This will also delete all subtasks within it."
              open={!!taskToDelete}
              onOpenChange={(open) => !open && setTaskToDelete(null)}
              onConfirm={async () => {
                if (taskToDelete && project) {
                  await handleDeleteTask(project.id, taskToDelete.id)
                  setTaskToDelete(null)
                }
              }}
            />
          )}
        </>
      )}
    </div>
  )
})

export default TaskList
