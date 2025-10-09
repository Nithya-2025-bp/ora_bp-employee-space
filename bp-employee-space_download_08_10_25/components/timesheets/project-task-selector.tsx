"use client"

import { useEffect } from "react"
import { useProjectStore } from "@/lib/project-store"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

interface ProjectTaskSelectorProps {
  onProjectChange: (projectId: string) => void
  onTaskChange: (taskId: string) => void
  selectedProjectId: string | null
  selectedTaskId: string | null
}

export default function ProjectTaskSelector({
  onProjectChange,
  onTaskChange,
  selectedProjectId,
  selectedTaskId,
}: ProjectTaskSelectorProps) {
  const { projects } = useProjectStore()

  const selectedProject = projects.find((p) => p.id === selectedProjectId)

  const handleProjectChange = (value: string) => {
    onProjectChange(value)

    // Reset task selection when project changes
    const project = projects.find((p) => p.id === value)
    if (project && project.tasks.length > 0) {
      onTaskChange(project.tasks[0].id)
    } else {
      onTaskChange("")
    }
  }

  const handleTaskChange = (value: string) => {
    onTaskChange(value)
  }

  // Initialize with first project and task if available
  useEffect(() => {
    if (!selectedProjectId && projects.length > 0) {
      handleProjectChange(projects[0].id)
    }
  }, [projects, selectedProjectId])

  return (
    <div className="flex space-x-4 mb-4">
      <div className="w-64">
        <label className="block text-sm font-medium text-gray-700 mb-1">Project</label>
        <Select value={selectedProjectId || ""} onValueChange={handleProjectChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent>
            {projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="w-64">
        <label className="block text-sm font-medium text-gray-700 mb-1">Task</label>
        <Select
          value={selectedTaskId || ""}
          onValueChange={handleTaskChange}
          disabled={!selectedProject || selectedProject.tasks.length === 0}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a task" />
          </SelectTrigger>
          <SelectContent>
            {selectedProject?.tasks.map((task) => (
              <SelectItem key={task.id} value={task.id}>
                {task.title}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )
}
