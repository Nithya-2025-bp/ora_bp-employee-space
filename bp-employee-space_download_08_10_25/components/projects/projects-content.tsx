"use client"

import { useState, useEffect } from "react"
import { getProjects, getAllProjects } from "@/lib/actions/project-actions"
import type { Project, Task } from "@/lib/task-types"
import type { User } from "@/lib/users"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { RefreshCw, Calendar, CheckCircle2, CircleX, Clock, Settings, AlertTriangle, FileText } from "lucide-react"
import { format } from "date-fns"
import { toast } from "@/hooks/use-toast"
import ProjectManagementModal from "./project-management-modal"
import ProjectReportModal from "./project-report-modal"
import { isUserAssignedToTask, isUserAssignedToSubtask, logAssignmentInfo } from "@/lib/task-utils"

interface ProjectsContentProps {
  user: User
}

export default function ProjectsContent({ user }: ProjectsContentProps) {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null)
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)
  const [selectedProjectForManagement, setSelectedProjectForManagement] = useState<string | null>(null)
  const [isManagementModalOpen, setIsManagementModalOpen] = useState(false)
  const [selectedProjectForReport, setSelectedProjectForReport] = useState<string | null>(null)
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [assignmentStats, setAssignmentStats] = useState<{
    projectCount: number
    taskCount: number
    subtaskCount: number
    assignedSubtaskCount: number
  } | null>(null)
  const [allProjectsForManagement, setAllProjectsForManagement] = useState<Project[]>([])

  // Load projects
  useEffect(() => {
    loadProjects()
    loadAllProjectsForManagement()
  }, [])

  // Load projects
  const loadProjects = async () => {
    setIsLoading(true)
    setError(null)

    try {
      const loadedProjects = await getProjects()
      console.log(`Loaded ${loadedProjects.length} projects from server`)

      // Log assignment statistics for debugging
      const stats = logAssignmentInfo(loadedProjects, user.email)
      setAssignmentStats(stats)

      // For non-admin users, we need to ensure they can see their assigned tasks
      if (!user.isAdmin) {
        console.log(`Applying non-admin filtering for user: ${user.email}`)
      }

      // Set projects with minimal filtering - the database query should have handled permission filtering
      setProjects(loadedProjects)
    } catch (error) {
      console.error("Error loading projects:", error)
      setError("Failed to load projects. Please try again.")
      toast({
        title: "Error",
        description: "Failed to load projects. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadAllProjectsForManagement = async () => {
    try {
      if (user.isAdmin) {
        // Admins can manage all projects
        const allProjects = await getAllProjects()
        setAllProjectsForManagement(allProjects)
        console.log(`Loaded ${allProjects.length} projects for admin management`)
      } else {
        // For non-admins, check if they're managers of any projects
        const allProjects = await getAllProjects()
        const managedProjects = allProjects.filter(
          (project) => project.managers && project.managers.includes(user.email),
        )
        setAllProjectsForManagement(managedProjects)
        console.log(`Loaded ${managedProjects.length} projects for user management`)
      }
    } catch (error) {
      console.error("Error loading projects for management:", error)
    }
  }

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)

    try {
      await loadProjects()
      await loadAllProjectsForManagement()
      toast({
        title: "Success",
        description: "Projects refreshed successfully",
      })
    } catch (error) {
      console.error("Error refreshing projects:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  // Helper function to count assigned subtasks for a task
  const countAssignedSubtasks = (task: Task): number => {
    if (!task.subtasks) return 0

    // Remove the admin exception so admins only see subtasks assigned to them
    return task.subtasks.filter((subtask) => subtask.assignedUsers && subtask.assignedUsers.includes(user.email)).length
  }

  // Helper function to check if a task has any subtasks assigned to the user
  const hasAssignedSubtasks = (task: Task): boolean => {
    if (!task.subtasks) return false

    // Remove the admin exception so admins only see tasks with subtasks assigned to them
    return isUserAssignedToTask(task, user.email)
  }

  // Helper function to check if user is one of the project managers
  const isProjectManager = (project: Project): boolean => {
    return project.managers && project.managers.includes(user.email)
  }

  const canManageProject = (projectId: string): boolean => {
    const project = projects.find((p) => p.id === projectId)
    return project ? project.managers && project.managers.includes(user.email) : false
  }

  // Handle opening the manage modal
  const handleManageProject = (projectId: string) => {
    setSelectedProjectId(projectId)
    setIsManageModalOpen(true)
  }

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
          <h2 className="text-lg font-medium text-red-800 mb-2">Error Loading Projects</h2>
          <p className="text-sm text-red-700 mb-4">{error}</p>
          <Button onClick={handleRefresh} disabled={isRefreshing} className="bg-black text-white hover:bg-gray-800">
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

  if (projects.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="bg-gray-50 border border-gray-200 rounded-md p-6 max-w-md text-center">
          <h2 className="text-lg font-medium text-gray-800 mb-2">No Projects Found</h2>
          <p className="text-sm text-gray-600 mb-4">
            {assignmentStats && assignmentStats.assignedSubtaskCount === 0
              ? "You don't have any subtasks assigned to you."
              : "You can't see any projects. This might be an access issue."}
          </p>
          <Button onClick={handleRefresh} disabled={isRefreshing} className="bg-black text-white hover:bg-gray-800">
            {isRefreshing ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Refreshing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </>
            )}
          </Button>
        </div>
      </div>
    )
  }

  // Count projects with tasks that have subtasks assigned to the user
  const projectsWithAssignedTasks = projects.filter((project) =>
    project.tasks.some((task) => hasAssignedSubtasks(task)),
  )

  if (projectsWithAssignedTasks.length === 0) {
    return (
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-black">My Projects</h1>
          <Button
            variant="outline"
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 bg-black text-white border-black hover:bg-gray-800"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>

        <div className="bg-yellow-50 border border-yellow-200 rounded-md p-6 text-center">
          <div className="flex flex-col items-center">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mb-4" />
            <h2 className="text-lg font-medium text-yellow-800 mb-2">No Tasks Assigned</h2>
            <p className="text-sm text-yellow-700 mb-4">
              You can see {projects.length} project(s), but none have tasks assigned to you.
              {assignmentStats &&
                ` The system found ${assignmentStats.subtaskCount} subtasks but none are assigned to your account.`}
            </p>
            <p className="text-sm text-yellow-700">
              Please contact a project manager or administrator to get assigned to tasks.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-black">My Projects</h1>
        <Button
          variant="outline"
          onClick={handleRefresh}
          disabled={isRefreshing}
          className="flex items-center gap-1 bg-black text-white border-black hover:bg-gray-800"
        >
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <div className="space-y-6">
        {projects.map((project) => (
          <Card key={project.id} className="overflow-hidden bg-white">
            <CardHeader className="bg-gray-50">
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="text-xl text-gray-900">{project.title}</CardTitle>
                  {project.description && <p className="text-gray-600 text-sm">{project.description}</p>}

                  {/* Display project managers */}
                  {project.managers && project.managers.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      <span className="text-xs text-gray-500 mr-1">Managers:</span>
                      {project.managers.map((manager) => (
                        <span
                          key={manager}
                          className={`text-xs px-2 py-1 rounded-md ${
                            manager === user.email ? "text-[#0051FF] font-medium" : "text-gray-700"
                          }`}
                        >
                          {manager}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center space-x-2">
                  {canManageProject(project.id) && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1 bg-gray-100 text-gray-700 border-gray-300 hover:bg-gray-200"
                        onClick={() => {
                          setSelectedProjectForReport(project.id)
                          setIsReportModalOpen(true)
                        }}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        Generate Report
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center gap-1 bg-black text-white border-black hover:bg-gray-800"
                        onClick={() => {
                          setSelectedProjectForManagement(project.id)
                          setIsManagementModalOpen(true)
                        }}
                      >
                        <Settings className="h-4 w-4 mr-1" />
                        Manage
                      </Button>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-4 bg-white">
              <Accordion type="multiple" className="space-y-2">
                {project.tasks
                  // Either show all tasks if admin, or only tasks with assigned subtasks
                  .filter((task) => hasAssignedSubtasks(task))
                  .map((task) => (
                    <AccordionItem key={task.id} value={task.id} className="border rounded-md overflow-hidden">
                      <AccordionTrigger className="px-4 py-2 hover:bg-gray-50">
                        <div className="flex items-center justify-between w-full pr-4">
                          <div className="flex items-center">
                            <span className="font-medium text-gray-900">{task.title}</span>
                            <Badge
                              variant={task.completed ? "default" : "outline"}
                              className={`ml-2 ${task.completed ? "bg-green-500" : "bg-gray-100 text-gray-700"}`}
                            >
                              {task.completed ? (
                                <>
                                  <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
                                </>
                              ) : (
                                <>
                                  <CircleX className="h-3 w-3 mr-1" /> In Progress
                                </>
                              )}
                            </Badge>
                          </div>
                          <div className="flex items-center text-sm text-gray-500">
                            <span className="mr-4">
                              {countAssignedSubtasks(task)} subtask{countAssignedSubtasks(task) !== 1 ? "s" : ""}
                            </span>
                            {task.dueDate && (
                              <span className="flex items-center">
                                <Calendar className="h-3 w-3 mr-1" />
                                {format(new Date(task.dueDate), "MMM d, yyyy")}
                              </span>
                            )}
                          </div>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent className="bg-gray-50 px-4 py-2">
                        {task.description && <p className="text-gray-600 mb-4">{task.description}</p>}
                        <div className="space-y-2">
                          {task.subtasks
                            // Filter subtasks: show all for admin/manager, or only assigned ones for regular users
                            .filter(
                              (subtask) => isProjectManager(project) || isUserAssignedToSubtask(subtask, user.email),
                            )
                            .map((subtask) => (
                              <div key={subtask.id} className="bg-white p-3 rounded-md border border-gray-200">
                                <div className="flex justify-between items-start">
                                  <div>
                                    <h4 className="font-medium text-gray-900">{subtask.title}</h4>
                                    {subtask.description && (
                                      <p className="text-sm text-gray-600 mt-1">{subtask.description}</p>
                                    )}
                                  </div>
                                  <div className="flex flex-col items-end text-black">
                                    {subtask.assignedUsers && subtask.assignedUsers.length > 0 && (
                                      <div className="flex flex-col text-xs mb-1 items-end text-black">
                                        <span className="mb-1">Assigned to:</span>
                                        <div className="flex flex-wrap gap-1 justify-end">
                                          {subtask.assignedUsers.map((email) => (
                                            <span
                                              key={email}
                                              className={`text-xs px-2 py-1 rounded-md ${
                                                email === user.email ? "text-[#0051FF] font-medium" : "text-gray-700"
                                              }`}
                                            >
                                              {email}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                    <div className="text-xs text-gray-500 flex items-center mt-2">
                                      <Clock className="h-3 w-3 mr-1" />
                                      Updated {format(new Date(subtask.updatedAt), "MMM d, yyyy")}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                      </AccordionContent>
                    </AccordionItem>
                  ))}
              </Accordion>
            </CardContent>
          </Card>
        ))}
      </div>

      {selectedProjectForManagement && (
        <ProjectManagementModal
          projectId={selectedProjectForManagement}
          open={isManagementModalOpen}
          onOpenChange={setIsManagementModalOpen}
          userEmail={user.email}
          isAdmin={user.isAdmin}
        />
      )}

      {selectedProjectForReport && (
        <ProjectReportModal
          projectId={selectedProjectForReport}
          open={isReportModalOpen}
          onOpenChange={setIsReportModalOpen}
          userEmail={user.email}
          isAdmin={user.isAdmin}
        />
      )}
    </div>
  )
}
