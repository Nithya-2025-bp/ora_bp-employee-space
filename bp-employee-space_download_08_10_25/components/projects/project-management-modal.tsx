"use client"

import { useState, useEffect, useCallback } from "react"
import type { Project } from "@/lib/task-types"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import TaskList from "@/components/tasks/task-list"
import TaskDetail from "@/components/tasks/task-detail"
import CreateTaskDialog from "@/components/tasks/create-task-dialog"
import { getProjectById } from "@/lib/actions/project-actions"
import { toast } from "@/hooks/use-toast"

interface ProjectManagementModalProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
  isAdmin: boolean
}

export default function ProjectManagementModal({
  projectId,
  open,
  onOpenChange,
  userEmail,
  isAdmin,
}: ProjectManagementModalProps) {
  const [project, setProject] = useState<Project | null>(null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isCreateTaskOpen, setIsCreateTaskOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Load project data
  const loadProject = useCallback(async () => {
    if (!projectId || !open) return

    setIsLoading(true)
    setError(null)

    try {
      const loadedProject = await getProjectById(projectId)
      setProject(loadedProject)

      // Set initial selected task if available
      if (loadedProject?.tasks && loadedProject.tasks.length > 0 && !selectedTaskId) {
        setSelectedTaskId(loadedProject.tasks[0].id)
      }
    } catch (error) {
      console.error("Error loading project:", error)
      setError("Failed to load project details. Please try again.")
      toast({
        title: "Error",
        description: "Failed to load project details.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }, [projectId, open, selectedTaskId])

  // Load project when modal opens
  useEffect(() => {
    if (open) {
      loadProject()
    }
  }, [open, loadProject])

  // Refresh project data
  const refreshProject = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)

    try {
      await loadProject()
      toast({
        title: "Success",
        description: "Project data refreshed successfully",
      })
    } catch (error) {
      console.error("Error refreshing project:", error)
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing, loadProject])

  // Handle task selection
  const handleSelectTask = useCallback((id: string) => {
    setSelectedTaskId(id)
  }, [])

  // Check if user is the manager of the project
  const isProjectManager = project?.managers && project.managers.includes(userEmail)

  // Determine if the user can edit the project (admin or project manager)
  const canEditProject = isAdmin || isProjectManager

  // Get the selected task
  const selectedTask = project?.tasks?.find((t) => t.id === selectedTaskId)

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold">
            {project ? `Manage Project: ${project.title}` : "Loading Project..."}
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0051FF] border-t-transparent mb-4"></div>
            <p className="text-gray-600 ml-3">Loading project data...</p>
          </div>
        ) : error ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="bg-red-50 border border-red-200 rounded-md p-6 max-w-md text-center">
              <p className="text-red-700 mb-4">{error}</p>
              <Button onClick={refreshProject} disabled={isRefreshing}>
                {isRefreshing ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Retrying...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Try Again
                  </>
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex-1 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center mb-4">
              <Button
                variant="outline"
                size="sm"
                onClick={refreshProject}
                disabled={isRefreshing}
                className="flex items-center gap-1 bg-transparent"
              >
                <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
                {isRefreshing ? "Refreshing..." : "Refresh"}
              </Button>
            </div>

            <div className="flex-1 flex gap-6 overflow-hidden">
              {/* Tasks List */}
              <div className="w-1/2 bg-gray-50 rounded-lg p-4 overflow-y-auto">
                {project && (
                  <TaskList
                    project={project}
                    selectedTaskId={selectedTaskId}
                    onSelectTask={handleSelectTask}
                    onTasksChange={refreshProject}
                    isAdmin={canEditProject}
                  />
                )}
              </div>

              {/* Task Details */}
              <div className="w-1/2 bg-gray-50 rounded-lg p-4 overflow-y-auto">
                <TaskDetail
                  task={selectedTask}
                  project={project}
                  onSubtasksChange={refreshProject}
                  isAdmin={canEditProject}
                />
              </div>
            </div>

            {canEditProject && project && (
              <CreateTaskDialog
                projectId={project.id}
                open={isCreateTaskOpen}
                onOpenChange={setIsCreateTaskOpen}
                onTaskCreated={refreshProject}
              />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
