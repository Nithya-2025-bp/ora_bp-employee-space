"use client"

import { useState, memo } from "react"
import type { Project } from "@/lib/task-types"

interface ProjectDetailProps {
  project: Project | undefined
  onProjectUpdated: () => Promise<void>
  isAdmin: boolean
}

// Use React.memo to prevent unnecessary re-renders
const ProjectDetail = memo(function ProjectDetail({ project, onProjectUpdated, isAdmin }: ProjectDetailProps) {
  const [isEditProjectOpen, setIsEditProjectOpen] = useState(false)

  if (!project) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-500 mb-4">No project selected</p>
        <p className="text-sm text-gray-400">Select a project to see details</p>
      </div>
    )
  }

  // Return an empty div to maintain the component structure but not display anything
  return <div></div>
})

export default ProjectDetail
