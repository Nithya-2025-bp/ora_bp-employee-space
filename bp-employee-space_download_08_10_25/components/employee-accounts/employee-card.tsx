"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { User, Mail, Shield, ShieldAlert, Briefcase, Clock, ClipboardList } from "lucide-react"
import type { User as UserType } from "@/lib/users"
import EditEmployeeDialog from "./edit-employee-dialog"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import TimesheetApprovalModal from "./timesheet-approval-modal"
import { getUserPendingSubmissionsCount } from "@/lib/actions/timesheet-approval-actions"
import TOILApprovalModal from "./toil-approval-modal"

interface EmployeeCardProps {
  employee: UserType
  currentUser: UserType
  onUpdate: (updatedEmployee: UserType) => Promise<boolean>
  onApprovalProcessed?: () => void
  // Pre-computed data to avoid individual API calls
  assignedProjects?: { id: string; title: string; taskCount: number }[]
  pendingCounts?: {
    timesheets: number
    toil: number
  }
}

export default function EmployeeCard({
  employee,
  currentUser,
  onUpdate,
  onApprovalProcessed,
  assignedProjects: precomputedProjects,
  pendingCounts: precomputedCounts,
}: EmployeeCardProps) {
  const [assignedProjects, setAssignedProjects] = useState<{ id: string; title: string; taskCount: number }[]>(
    precomputedProjects || [],
  )
  const [isLoading, setIsLoading] = useState(!precomputedProjects)
  const [pendingApprovals, setPendingApprovals] = useState(0)
  const [isApprovalModalOpen, setIsApprovalModalOpen] = useState(false)
  const [isToilModalOpen, setIsToilModalOpen] = useState(false)
  const [pendingTimesheets, setPendingTimesheets] = useState(precomputedCounts?.timesheets || 0)
  const [pendingTOIL, setPendingTOIL] = useState(precomputedCounts?.toil || 0)
  const [countsLoaded, setCountsLoaded] = useState(!!precomputedCounts)

  // Load assigned projects only if not pre-computed
  useEffect(() => {
    if (precomputedProjects) {
      setAssignedProjects(precomputedProjects)
      setIsLoading(false)
      return
    }

    const loadData = async () => {
      setIsLoading(true)
      try {
        // Load projects - use getAllProjects for admin to see all projects,
        // or getProjects for the specific user if viewing their own card
        const { getProjects, getAllProjects } = await import("@/lib/actions/project-actions")

        let projects
        if (currentUser.isAdmin && currentUser.email !== employee.email) {
          // Admin viewing another user's card - get all projects to check assignments
          console.log(`Admin ${currentUser.email} loading all projects to check assignments for ${employee.email}`)
          projects = await getAllProjects()
        } else {
          // User viewing their own card - get their specific projects
          console.log(`Loading projects for user ${employee.email}`)
          projects = await getProjects()
        }

        // Track projects and count of tasks the user is assigned to
        const projectMap = new Map<string, { id: string; title: string; taskCount: number }>()

        if (Array.isArray(projects)) {
          projects.forEach((project) => {
            let hasAssignedTasks = false
            let taskCount = 0

            // Check if this employee is a manager of the project
            const isManager = project.managers && project.managers.includes(employee.email)

            if (project.tasks && Array.isArray(project.tasks)) {
              project.tasks.forEach((task) => {
                if (task.subtasks && Array.isArray(task.subtasks)) {
                  task.subtasks.forEach((subtask) => {
                    if (subtask.assignedUsers && subtask.assignedUsers.includes(employee.email)) {
                      hasAssignedTasks = true
                      taskCount++
                    }
                  })
                }
              })
            }

            // Include project if user is manager or has assigned tasks
            if (isManager || hasAssignedTasks) {
              projectMap.set(project.id, {
                id: project.id,
                title: project.title,
                taskCount: taskCount,
              })
            }
          })
        }

        const assignedProjectsList = Array.from(projectMap.values())
        console.log(
          `Found ${assignedProjectsList.length} projects for employee ${employee.email}:`,
          assignedProjectsList.map((p) => p.title),
        )
        setAssignedProjects(assignedProjectsList)

        // If current user is admin, load pending approvals for this employee
        if (currentUser.isAdmin) {
          const count = await getUserPendingSubmissionsCount(employee.email)
          setPendingApprovals(count)
        }
      } catch (error) {
        console.error("Error loading data:", error)
      } finally {
        setIsLoading(false)
      }
    }

    loadData()
  }, [employee.email, currentUser.isAdmin, currentUser.email, precomputedProjects])

  // Load pending counts only when needed and not pre-computed
  useEffect(() => {
    if (precomputedCounts) {
      setPendingTimesheets(precomputedCounts.timesheets)
      setPendingTOIL(precomputedCounts.toil)
      setCountsLoaded(true)
      return
    }

    if (currentUser?.isAdmin && !countsLoaded) {
      // Add a small delay based on employee email hash to stagger requests
      const delay = Math.abs(employee.email.split("").reduce((a, b) => a + b.charCodeAt(0), 0)) % 2000
      setTimeout(() => {
        loadPendingCounts()
      }, delay)
    }
  }, [currentUser?.isAdmin, employee.email, countsLoaded, precomputedCounts])

  const loadPendingCounts = async () => {
    if (countsLoaded) return // Prevent duplicate loading

    try {
      setCountsLoaded(true) // Mark as loaded to prevent duplicate calls

      // Load pending timesheet submissions count only
      try {
        const timesheetCount = await getUserPendingSubmissionsCount(employee.email)
        setPendingTimesheets(timesheetCount)
      } catch (timesheetError) {
        console.error("Error loading pending timesheet submissions count:", timesheetError)
        setPendingTimesheets(0)
      }

      // Add delay between requests to prevent rate limiting
      await new Promise((resolve) => setTimeout(resolve, 500))

      // Load pending TOIL submissions count only
      try {
        const { getUserPendingTOILSubmissionsCount } = await import("@/lib/actions/toil-actions")
        if (typeof getUserPendingTOILSubmissionsCount === "function") {
          const toilCount = await getUserPendingTOILSubmissionsCount(employee.email)
          setPendingTOIL(typeof toilCount === "number" ? toilCount : 0)
        } else {
          console.warn("getUserPendingTOILSubmissionsCount function not available")
          setPendingTOIL(0)
        }
      } catch (toilError) {
        console.error("Error loading TOIL count:", toilError)
        setPendingTOIL(0)
      }
    } catch (error) {
      console.error("Error loading pending counts:", error)
      setPendingTimesheets(0)
      setPendingTOIL(0)
    }
  }

  const isCurrentUser = currentUser.email === employee.email

  const handleApprovalProcessed = () => {
    // Refresh the pending approvals count
    getUserPendingSubmissionsCount(employee.email).then(setPendingApprovals)

    // Refresh pending counts
    setCountsLoaded(false) // Reset to allow reloading
    loadPendingCounts()

    // Call the parent callback if provided
    if (onApprovalProcessed) {
      onApprovalProcessed()
    }
  }

  const handleTimesheetModalOpen = () => {
    setIsApprovalModalOpen(true)
    // Refresh counts when opening modal to ensure accuracy
    if (!countsLoaded) {
      loadPendingCounts()
    }
  }

  const handleToilModalOpen = () => {
    setIsToilModalOpen(true)
    // Refresh counts when opening modal to ensure accuracy
    if (!countsLoaded) {
      loadPendingCounts()
    }
  }

  return (
    <Card className={`overflow-hidden w-full bg-white ${isCurrentUser ? "border-[#0051FF]" : ""}`}>
      <CardContent className="p-4">
        <div className="flex flex-wrap items-center gap-4">
          {/* Profile Photo */}
          <div className="h-12 w-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
            {employee.profilePicture ? (
              <Image
                src={employee.profilePicture || "/placeholder.svg"}
                alt={`${employee.firstName} ${employee.lastName}`}
                width={48}
                height={48}
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="h-full w-full flex items-center justify-center bg-gray-100">
                <svg className="h-8 w-8 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              </div>
            )}
          </div>

          {/* User info section */}
          <div className="flex items-center min-w-[300px]">
            <User className="h-5 w-5 mr-2 text-gray-600 shrink-0" />
            <div>
              <div className="font-bold text-black flex items-center">
                {employee.firstName} {employee.lastName}
                {isCurrentUser && (
                  <Badge variant="outline" className="ml-2 bg-[#0051FF]/10 text-[#0051FF] border-[#0051FF]/20">
                    You
                  </Badge>
                )}
              </div>
              <div className="text-sm text-gray-600 flex items-center">
                <Mail className="h-3 w-3 mr-1 text-gray-500" />
                {employee.email}
              </div>
            </div>
          </div>

          {/* Admin badge */}
          <Badge
            variant={employee.isAdmin ? "default" : "outline"}
            className={`${employee.isAdmin ? "bg-[#0051FF] text-white" : "text-black"} shrink-0`}
          >
            {employee.isAdmin ? (
              <>
                <ShieldAlert className="h-3 w-3 mr-1" /> Admin
              </>
            ) : (
              <>
                <Shield className="h-3 w-3 mr-1" /> User
              </>
            )}
          </Badge>

          {/* Pending Approvals Badge - Only visible to admins */}
          {currentUser.isAdmin && pendingApprovals > 0 && (
            <Badge
              variant="outline"
              className="bg-yellow-50 text-yellow-700 border-yellow-200 cursor-pointer hover:bg-yellow-100"
              onClick={handleTimesheetModalOpen}
            >
              <Clock className="h-3 w-3 mr-1" />
              {pendingApprovals} Pending Approval{pendingApprovals !== 1 && "s"}
            </Badge>
          )}

          {/* Projects section */}
          <div className="flex items-center flex-grow">
            <Briefcase className="h-4 w-4 mr-2 text-gray-600 shrink-0" />
            <div>
              <span className="text-xs font-medium text-gray-500 mr-2">Projects:</span>
              {isLoading ? (
                <span className="text-sm text-gray-600">Loading...</span>
              ) : assignedProjects.length > 0 ? (
                <div className="flex flex-wrap gap-1">
                  {assignedProjects.map((project) => (
                    <Badge key={project.id} variant="outline" className="bg-gray-50 text-black text-xs">
                      {project.title}
                      <span className="ml-1 text-xs text-gray-500">({project.taskCount})</span>
                    </Badge>
                  ))}
                </div>
              ) : (
                <span className="text-sm text-gray-600">None</span>
              )}
            </div>
          </div>

          {/* Action buttons */}
          <div className="ml-auto flex flex-col items-end">
            {/* Timesheet and TOIL Approval Buttons - Only visible to admins */}
            {currentUser.isAdmin && (
              <div className="flex mt-2 space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs relative bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:text-gray-600"
                  onClick={handleTimesheetModalOpen}
                >
                  <ClipboardList className="h-3 w-3 mr-1" />
                  Review Timesheets
                  {countsLoaded && pendingTimesheets > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                      {pendingTimesheets}
                    </span>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs relative bg-white text-gray-700 border-gray-300 hover:bg-gray-50 hover:text-gray-600"
                  onClick={handleToilModalOpen}
                >
                  <Clock className="h-3 w-3 mr-1" />
                  Review TOIL
                  {countsLoaded && pendingTOIL > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] text-white">
                      {pendingTOIL}
                    </span>
                  )}
                </Button>
              </div>
            )}

            {/* Settings button - only visible to admins */}
            {currentUser.isAdmin && (
              <div>
                <EditEmployeeDialog employee={employee} onUpdate={onUpdate} />
              </div>
            )}
          </div>
        </div>
      </CardContent>

      {/* Timesheet Approval Modal */}
      {currentUser.isAdmin && (
        <TimesheetApprovalModal
          userEmail={employee.email}
          userName={`${employee.firstName} ${employee.lastName}`}
          open={isApprovalModalOpen}
          onOpenChange={setIsApprovalModalOpen}
          onApproved={handleApprovalProcessed}
        />
      )}
      {currentUser.isAdmin && (
        <TOILApprovalModal
          userEmail={employee.email}
          userName={`${employee.firstName} ${employee.lastName}`}
          open={isToilModalOpen}
          onOpenChange={setIsToilModalOpen}
          onApproved={handleApprovalProcessed}
        />
      )}
    </Card>
  )
}
