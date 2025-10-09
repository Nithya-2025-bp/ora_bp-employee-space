"use client"

import type React from "react"

import { useState } from "react"
import type { Project } from "@/lib/task-types"
import { Button } from "@/components/ui/button"
import { Edit, Trash2, MoreHorizontal, ChevronDown, ChevronUp, FileText } from "lucide-react"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import EditProjectDialog from "./edit-project-dialog"
import DeleteConfirmDialog from "./delete-confirm-dialog"
import ProjectReportModal from "@/components/projects/project-report-modal"
import { deleteProject } from "@/lib/actions/project-actions"
import { toast } from "@/hooks/use-toast"

interface ProjectListProps {
  projects: Project[]
  selectedProjectId: string | null
  onSelectProject: (id: string) => void
  onProjectsChange: () => Promise<void>
  isAdmin: boolean
  userEmail: string
}

export default function ProjectList({
  projects = [], // Provide a default empty array
  selectedProjectId,
  onSelectProject,
  onProjectsChange,
  isAdmin,
  userEmail,
}: ProjectListProps) {
  const [projectToEdit, setProjectToEdit] = useState<Project | null>(null)
  const [projectToDelete, setProjectToDelete] = useState<Project | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({})
  const [projectForReport, setProjectForReport] = useState<Project | null>(null)

  const handleDeleteProject = async (project: Project) => {
    if (isDeleting) return

    setIsDeleting(true)
    try {
      const result = await deleteProject(project.id)
      if (result) {
        toast({
          title: "Project deleted",
          description: "The project has been deleted successfully.",
        })
        window.location.reload()
      } else {
        toast({
          title: "Error",
          description: "Failed to delete the project. Please try again.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Failed to delete project:", error)
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete the project. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsDeleting(false)
      setProjectToDelete(null)
    }
  }

  const toggleExpand = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation() // Prevent card selection when clicking expand button
    setExpandedProjects((prev) => ({
      ...prev,
      [projectId]: !prev[projectId],
    }))
  }

  const isProjectManager = (project: Project): boolean => {
    return project.managers && Array.isArray(project.managers) && project.managers.includes(userEmail)
  }

  const canEditProject = (project: Project): boolean => {
    return isAdmin || isProjectManager(project)
  }

  const projectsArray = Array.isArray(projects) ? projects : []

  if (projectsArray.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-500 mb-4">No projects yet</p>
        {isAdmin && <p className="text-sm text-gray-400">Create a new project to get started</p>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {projectsArray.map((project) => {
        const isExpanded = expandedProjects[project.id] || false
        const isManager = isProjectManager(project)

        return (
          <div
            key={project.id}
            className={`p-4 rounded-md cursor-pointer border transition-all duration-200 relative ${
              selectedProjectId === project.id
                ? "bg-[#0051FF]/5 border-[#0051FF]"
                : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
            }`}
            onClick={() => onSelectProject(project.id)}
          >
            <div className="absolute top-2 right-2 flex items-center space-x-1 z-10">
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-gray-500 hover:text-gray-700 hover:bg-gray-50"
                onClick={(e) => toggleExpand(project.id, e)}
              >
                {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                <span className="sr-only">{isExpanded ? "Collapse" : "Expand"}</span>
              </Button>

              {canEditProject(project) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                    <Button variant="ghost" size="sm" className="h-8 w-8 p-0 bg-black text-white hover:bg-black/80">
                      <MoreHorizontal className="h-4 w-4" />
                      <span className="sr-only">Open menu</span>
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" side="bottom" sideOffset={5}>
                    <DropdownMenuItem onClick={() => setProjectForReport(project)}>
                      <FileText className="mr-2 h-4 w-4" />
                      Report
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={() => setProjectToEdit(project)}>
                      <Edit className="mr-2 h-4 w-4" />
                      Edit
                    </DropdownMenuItem>
                    {isAdmin && (
                      <DropdownMenuItem className="text-red-600" onClick={() => setProjectToDelete(project)}>
                        <Trash2 className="mr-2 h-4 w-4" />
                        Delete
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </div>

            <div className="flex flex-col pr-20">
              <div className="flex items-center">
                <h3 className="font-medium text-lg text-black">{project.title}</h3>
              </div>
              {isExpanded && (
                <>
                  {project.description && <p className="text-sm text-gray-600 mt-2 mb-2">{project.description}</p>}
                  {project.managers && project.managers.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">Project Managers:</p>
                      <div className="flex flex-wrap gap-1">
                        {project.managers.map((manager) => (
                          <span
                            key={manager}
                            className={`text-xs px-2 py-1 rounded-md ${
                              manager === userEmail ? "text-[#0051FF] font-medium" : "text-gray-700"
                            }`}
                          >
                            {manager}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            <p className="text-xs text-gray-500 mt-auto">
              {project.tasks?.length || 0} {(project.tasks?.length || 0) === 1 ? "task" : "tasks"}
            </p>
          </div>
        )
      })}

      {projectToEdit && (
        <EditProjectDialog
          project={projectToEdit}
          open={!!projectToEdit}
          onOpenChange={(open) => !open && setProjectToEdit(null)}
          onProjectUpdated={onProjectsChange}
        />
      )}

      {projectForReport && (
        <ProjectReportModal
          projectId={projectForReport.id}
          open={!!projectForReport}
          onOpenChange={(open) => !open && setProjectForReport(null)}
          userEmail={userEmail}
          isAdmin={isAdmin}
        />
      )}

      {isAdmin && projectToDelete && (
        <DeleteConfirmDialog
          title="Delete Project"
          description={
            projectToDelete.tasks && projectToDelete.tasks.length > 0
              ? `Warning: This project contains ${projectToDelete.tasks.length} task${
                  projectToDelete.tasks.length === 1 ? "" : "s"
                } and all associated subtasks. Deleting this project will permanently remove all of its tasks and subtasks.`
              : "Are you sure you want to delete this project?"
          }
          open={!!projectToDelete}
          onOpenChange={(open) => !open && setProjectToDelete(null)}
          onConfirm={() => handleDeleteProject(projectToDelete)}
          isDeleting={isDeleting}
        />
      )}
    </div>
  )
}
