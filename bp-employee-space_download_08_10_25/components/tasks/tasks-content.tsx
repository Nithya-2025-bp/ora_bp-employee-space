"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw, AlertTriangle } from "lucide-react"
import ProjectList from "./project-list"
import TaskList from "./task-list"
import TaskDetail from "./task-detail"
import CreateProjectDialog from "./create-project-dialog"
import ProjectDetail from "./project-detail"
import type { Project } from "@/lib/task-types"
import { getProjects, getAllProjects, createProject } from "@/lib/actions/project-actions"
import { toast } from "@/hooks/use-toast"
import { useRouter } from "next/navigation"

interface TasksContentProps {
  initialProjects: Project[]
  isAdmin: boolean
  userEmail: string
  initialProjectId?: string
}

export default function TasksContent({
  initialProjects = [],
  isAdmin,
  userEmail,
  initialProjectId,
}: TasksContentProps) {
  const [projects, setProjects] = useState<Project[]>(Array.isArray(initialProjects) ? initialProjects : [])
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(initialProjectId || null)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null)
  const [isCreateProjectOpen, setIsCreateProjectOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [debugInfo, setDebugInfo] = useState<string[]>([])

  const router = useRouter()

  const addDebugInfo = (info: string) => {
    setDebugInfo((prev) => [...prev, `${new Date().toLocaleTimeString()}: ${info}`])
  }

  // Determine if user has management access (admin or project manager)
  const hasManagementAccess = useCallback(async () => {
    if (isAdmin) return true

    try {
      // Check if user is a manager of any project
      const allProjects = await getAllProjects()
      return allProjects.some((project) => project.managers && project.managers.includes(userEmail))
    } catch (error) {
      console.error("Error checking management access:", error)
      return false
    }
  }, [isAdmin, userEmail])

  // Load projects from the server
  const loadProjects = async () => {
    if (isRefreshing) return // Prevent multiple simultaneous refreshes

    setIsLoading(true)
    setError(null)
    addDebugInfo("Loading projects...")

    try {
      // Check if user has management access
      const canManage = await hasManagementAccess()

      let loadedProjects: Project[]

      if (canManage) {
        // For users with management access, load all projects
        loadedProjects = await getAllProjects()
        addDebugInfo(`Loaded ${loadedProjects.length} projects for management (admin: ${isAdmin})`)
      } else {
        // For regular users, load only projects with assigned subtasks
        loadedProjects = await getProjects(userEmail)
        addDebugInfo(`Loaded ${loadedProjects.length} projects with assigned subtasks`)
      }

      setProjects(loadedProjects)

      // If we have an initialProjectId, make sure it's selected
      if (initialProjectId && !selectedProjectId) {
        setSelectedProjectId(initialProjectId)
        addDebugInfo(`Selected initial project: ${initialProjectId}`)
      }
    } catch (error) {
      console.error("Error loading projects:", error)
      addDebugInfo(`Error loading projects: ${error instanceof Error ? error.message : String(error)}`)

      // Check if this is a schema error
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes("relation") || errorMessage.includes("does not exist")) {
        setError("Database tables not initialized. Please set up the database first.")
      } else if (errorMessage.includes("Too Many Requests")) {
        setError("Rate limit exceeded. Please wait a moment and try again.")
      } else {
        setError("Failed to load projects. Please try again.")
      }

      setProjects([])
    } finally {
      setIsLoading(false)
    }
  }

  // Add debouncing to the refreshProjects function
  const refreshProjects = useCallback(async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await loadProjects()
    } finally {
      setIsRefreshing(false)
    }
  }, [isRefreshing])

  // Create a project
  const handleCreateProject = async (title: string, description?: string, manager?: string) => {
    addDebugInfo(`Creating project: ${title}`)
    try {
      const newProject = await createProject(title, description, manager)
      addDebugInfo(`Project created with ID: ${newProject.id}`)
      toast({
        title: "Project created",
        description: "Your project has been created successfully.",
      })
      await refreshProjects()
      return newProject
    } catch (error) {
      console.error("Error creating project:", error)
      addDebugInfo(`Error creating project: ${error instanceof Error ? error.message : String(error)}`)

      // Check if this is an unauthorized error
      const errorMessage = error instanceof Error ? error.message : String(error)
      if (errorMessage.includes("Unauthorized")) {
        toast({
          title: "Permission denied",
          description: "You don't have permission to create projects.",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Error",
          description: "Failed to create project. Please try again.",
          variant: "destructive",
        })
      }

      throw error
    }
  }

  // Load projects on component mount
  useEffect(() => {
    loadProjects()
  }, [])

  // Set initial selected project if available - with proper dependency array
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectId) {
      setSelectedProjectId(projects[0].id)
    }
  }, [projects, selectedProjectId])

  // Separate effect for setting the initial task to avoid dependency loops
  useEffect(() => {
    if (selectedProjectId && !selectedTaskId) {
      const project = projects.find((p) => p.id === selectedProjectId)
      if (project?.tasks && project.tasks.length > 0) {
        setSelectedTaskId(project.tasks[0].id)
      }
    }
  }, [selectedProjectId, selectedTaskId, projects])

  // Memoize these values to prevent unnecessary re-renders
  const selectedProject = projects.find((p) => p.id === selectedProjectId)
  const selectedTask = selectedProject?.tasks?.find((t) => t.id === selectedTaskId)

  // Use callbacks for selection handlers to prevent infinite loops
  const handleSelectProject = useCallback((id: string) => {
    setSelectedProjectId(id)
    setSelectedTaskId(null)
  }, [])

  const handleSelectTask = useCallback((id: string) => {
    setSelectedTaskId(id)
  }, [])

  // Check if user is the manager of the selected project
  const isProjectManager = selectedProject?.managers?.includes(userEmail)

  // Determine if the user can edit the project (admin or project manager)
  const canEditProject = isAdmin || isProjectManager

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0051FF] border-t-transparent mb-4"></div>
        <p className="text-gray-600">Loading projects...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="bg-red-50 border border-red-200 rounded-md p-6 max-w-md text-center">
          <AlertTriangle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <h2 className="text-lg font-medium text-red-800 mb-2">Error Loading Projects</h2>
          <p className="text-sm text-red-700 mb-4">{error}</p>

          {error.includes("Database tables not initialized") ? (
            <Button
              onClick={() => router.push("/setup-database")}
              className="bg-red-600 text-white hover:bg-red-700 mr-2"
            >
              Set Up Database
            </Button>
          ) : null}

          <Button onClick={refreshProjects} disabled={isRefreshing}>
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
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Removed CollapsibleStatus component as it was missing */}
      {/* Debug info can be viewed in browser console instead */}

      <div className="flex flex-1 gap-6">
        {/* Projects Sidebar */}
        <div className="w-72 bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-bold text-gray-900">Projects</h2>
            <div className="flex space-x-2">
              {isAdmin && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setIsCreateProjectOpen(true)}
                  className="flex items-center gap-1 bg-black text-white hover:bg-black/90"
                >
                  <Plus className="h-4 w-4" />
                  New
                </Button>
              )}
              {/* Refresh button removed */}
            </div>
          </div>

          {/* Removed cleanup button section as functionality was deleted */}

          <ProjectList
            projects={projects}
            selectedProjectId={selectedProjectId}
            onSelectProject={handleSelectProject}
            onProjectsChange={refreshProjects}
            isAdmin={isAdmin}
            userEmail={userEmail}
          />
        </div>

        {/* Tasks List */}
        <div className="w-96 bg-gray-50 rounded-lg p-4">
          <TaskList
            project={selectedProject}
            selectedTaskId={selectedTaskId}
            onSelectTask={handleSelectTask}
            onTasksChange={refreshProjects}
            isAdmin={canEditProject}
          />
        </div>

        {/* Task Details */}
        <div className="flex-1 bg-gray-50 rounded-lg p-4">
          <ProjectDetail project={selectedProject} onProjectUpdated={refreshProjects} isAdmin={canEditProject} />
          <TaskDetail
            task={selectedTask}
            project={selectedProject}
            onSubtasksChange={refreshProjects}
            isAdmin={canEditProject}
          />
        </div>

        {isAdmin && (
          <CreateProjectDialog
            open={isCreateProjectOpen}
            onOpenChange={setIsCreateProjectOpen}
            onProjectCreated={refreshProjects}
          />
        )}
      </div>
    </div>
  )
}
