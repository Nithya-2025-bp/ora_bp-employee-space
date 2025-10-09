"use client"

import type React from "react"

import { useState, useCallback, memo } from "react"
import type { Project, Task, Subtask } from "@/lib/task-types"
import { Button } from "@/components/ui/button"
import { Plus, Edit, Trash2, MoreHorizontal, Users, ChevronDown, ChevronUp } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import CreateSubtaskDialog from "./create-subtask-dialog"
import EditSubtaskDialog from "./edit-subtask-dialog"
import DeleteConfirmDialog from "./delete-confirm-dialog"
import { deleteSubtask } from "@/lib/actions/project-actions"
import { Badge } from "@/components/ui/badge"
import { users } from "@/lib/users"

interface TaskDetailProps {
  task: Task | undefined
  project: Project | undefined
  onSubtasksChange: () => Promise<void>
  isAdmin: boolean
}

// Use React.memo to prevent unnecessary re-renders
const TaskDetail = memo(function TaskDetail({ task, project, onSubtasksChange, isAdmin }: TaskDetailProps) {
  const [isCreateSubtaskOpen, setIsCreateSubtaskOpen] = useState(false)
  const [subtaskToEdit, setSubtaskToEdit] = useState<Subtask | null>(null)
  const [subtaskToDelete, setSubtaskToDelete] = useState<Subtask | null>(null)
  const [expandedSubtasks, setExpandedSubtasks] = useState<Record<string, boolean>>({})

  const handleDeleteSubtask = useCallback(async (projectId: string, taskId: string, subtaskId: string) => {
    try {
      await deleteSubtask(projectId, taskId, subtaskId)
      window.location.reload()
    } catch (error) {
      console.error("Failed to delete subtask:", error)
      alert("You don't have permission to delete this subtask.")
    }
  }, [])

  const toggleExpand = useCallback((subtaskId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent unintended interactions
    setExpandedSubtasks((prev) => ({
      ...prev,
      [subtaskId]: !prev[subtaskId],
    }))
  }, [])

  // Helper function to get user names from emails
  const getUserNames = useCallback((emails: string[]): string[] => {
    return emails.map((email) => {
      const user = users.find((u) => u.email === email)
      return user ? `${user.firstName} ${user.lastName}` : email
    })
  }, [])

  if (!project || !task) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-500 mb-4">No task selected</p>
        <p className="text-sm text-gray-400">Select a task to see details</p>
      </div>
    )
  }

  // Ensure subtasks is an array
  const subtasks = Array.isArray(task.subtasks) ? task.subtasks : []

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-bold text-black">Subtasks</h2>
        {isAdmin && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setIsCreateSubtaskOpen(true)}
            className="flex items-center gap-1 bg-black text-white hover:bg-black/90"
          >
            <Plus className="h-4 w-4" />
            New
          </Button>
        )}
      </div>

      {subtasks.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 text-center">
          <p className="text-gray-500 mb-4">No subtasks yet</p>
          {isAdmin && <p className="text-sm text-gray-400">Add subtasks to break down this task</p>}
        </div>
      ) : (
        <div className="space-y-3 overflow-y-auto">
          {subtasks.map((subtask) => {
            const isExpanded = expandedSubtasks[subtask.id] || false
            const hasAssignedUsers = subtask.assignedUsers && subtask.assignedUsers.length > 0

            return (
              <div
                key={subtask.id}
                className="p-4 rounded-md border border-gray-200 hover:border-gray-300 hover:bg-gray-50 flex flex-col transition-all duration-200"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center">
                    <h4 className="font-medium text-lg text-black">{subtask.title}</h4>
                    {hasAssignedUsers && !isExpanded && (
                      <Badge variant="outline" className="ml-2 text-xs text-[#0051FF]">
                        {subtask.assignedUsers.length} assigned
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center space-x-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                      onClick={(e) => toggleExpand(subtask.id, e)}
                    >
                      {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                      <span className="sr-only">{isExpanded ? "Collapse" : "Expand"}</span>
                    </Button>

                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
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
                          <DropdownMenuItem onClick={() => setSubtaskToEdit(subtask)}>
                            <Edit className="mr-2 h-4 w-4" />
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-red-600" onClick={() => setSubtaskToDelete(subtask)}>
                            <Trash2 className="mr-2 h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>

                {/* Only show description and assigned users when expanded */}
                {isExpanded && (
                  <div className="mt-3 space-y-3">
                    {subtask.description && <p className="text-sm text-gray-600">{subtask.description}</p>}

                    {/* Display assigned users */}
                    {hasAssignedUsers && (
                      <div className="mt-2">
                        <div className="flex items-center text-sm text-gray-600 mb-2">
                          <Users className="h-4 w-4 mr-2" />
                          <span>Assigned to:</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {getUserNames(subtask.assignedUsers).map((name, index) => (
                            <Badge
                              key={index}
                              variant="outline"
                              className="text-xs py-1 px-2 text-black bg-gray-100 text-gray-800 border-gray-300"
                            >
                              {name}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {isAdmin && (
        <>
          <CreateSubtaskDialog
            projectId={project.id}
            taskId={task.id}
            open={isCreateSubtaskOpen}
            onOpenChange={setIsCreateSubtaskOpen}
            onSubtaskCreated={onSubtasksChange}
          />

          {subtaskToEdit && (
            <EditSubtaskDialog
              projectId={project.id}
              taskId={task.id}
              subtask={subtaskToEdit}
              open={!!subtaskToEdit}
              onOpenChange={(open) => !open && setSubtaskToEdit(null)}
              onSubtaskUpdated={onSubtasksChange}
            />
          )}

          {subtaskToDelete && (
            <DeleteConfirmDialog
              title="Delete Subtask"
              description="Are you sure you want to delete this subtask?"
              open={!!subtaskToDelete}
              onOpenChange={(open) => !open && setSubtaskToDelete(null)}
              onConfirm={async () => {
                if (subtaskToDelete && project && task) {
                  await handleDeleteSubtask(project.id, task.id, subtaskToDelete.id)
                  setSubtaskToDelete(null)
                }
              }}
            />
          )}
        </>
      )}
    </div>
  )
})

export default TaskDetail
