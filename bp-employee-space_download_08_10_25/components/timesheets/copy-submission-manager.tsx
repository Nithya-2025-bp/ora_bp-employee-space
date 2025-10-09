"use client"

import { useState, useEffect, useCallback } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Copy, ChevronDown, Calendar } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { formatDate, getWeekDates } from "@/lib/time-utils"

// Define interfaces locally to avoid import issues
interface TimeEntry {
  id: string
  userId: string
  projectId: string
  taskId: string
  subtaskId: string
  date: string
  hours: string
  notes?: string
  createdAt: Date
  updatedAt: Date
}

interface TimesheetRow {
  id: string
  userId?: string
  projectId: string
  taskId: string
  subtaskId: string
  projectTitle: string
  taskTitle: string
  subtaskTitle: string
}

interface ApprovedSubmission {
  id: string
  startDate: string
  endDate: string
  submittedAt: Date
  approvedAt: Date
  totalHours: string
  entries: TimeEntry[]
  rows: TimesheetRow[]
}

interface CopySubmissionManagerProps {
  currentRows: TimesheetRow[]
  onApplySubmission: (rows: TimesheetRow[], timeEntries: TimeEntry[]) => void
  currentUser: string
  selectedDate?: Date
  timeEntries?: TimeEntry[]
}

export default function CopySubmissionManager({
  currentRows,
  onApplySubmission,
  currentUser,
  selectedDate = new Date(),
  timeEntries = [],
}: CopySubmissionManagerProps) {
  const [isApplyOpen, setIsApplyOpen] = useState(false)
  const [approvedSubmissions, setApprovedSubmissions] = useState<ApprovedSubmission[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [lastLoadTime, setLastLoadTime] = useState<number>(0)
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  const loadApprovedSubmissions = useCallback(
    async (forceRefresh = false) => {
      const now = Date.now()

      if (!forceRefresh && now - lastLoadTime < CACHE_DURATION && approvedSubmissions.length > 0) {
        console.log("[v0] Using cached approved submissions")
        return
      }

      console.log("[v0] Loading approved submissions from API")
      setIsLoading(true)
      try {
        const response = await fetch("/api/approved-submissions")
        if (response.ok) {
          const data = await response.json()
          setApprovedSubmissions(data.submissions || [])
          setLastLoadTime(now)
        } else {
          console.error("Failed to load approved submissions")
          setApprovedSubmissions([])
        }
      } catch (error) {
        console.error("Error loading approved submissions:", error)
        setApprovedSubmissions([])
      } finally {
        setIsLoading(false)
      }
    },
    [lastLoadTime, approvedSubmissions.length],
  )

  useEffect(() => {
    loadApprovedSubmissions()
  }, [currentUser])

  const handleCopySubmission = async (submission: ApprovedSubmission) => {
    try {
      console.log("[v0] Copying submission:", submission.id)

      // Create a deep copy of the submission rows to avoid reference issues
      const rowsCopy = JSON.parse(JSON.stringify(submission.rows))

      // Get the week dates for the current selected week
      const weekDates = getWeekDates(selectedDate)

      const existingEntriesMap = new Map<string, boolean>()
      timeEntries.forEach((entry) => {
        const key = `${entry.subtaskId}-${entry.date}`
        existingEntriesMap.set(key, true)
      })

      // Convert submission time entries to time entries for the current week
      const generatedEntries: TimeEntry[] = []

      if (submission.entries && submission.entries.length > 0) {
        // Create a map of original dates to new dates
        const originalWeekDates = getWeekDates(new Date(submission.startDate))
        const dateMapping = new Map<string, string>()

        // Map each day of the original week to the corresponding day of the current week
        originalWeekDates.forEach((originalDate, index) => {
          if (index < weekDates.length) {
            const originalDateStr = formatDate(originalDate)
            const newDateStr = formatDate(weekDates[index])
            dateMapping.set(originalDateStr, newDateStr)
          }
        })

        // Generate entries for the current week based on the submission
        submission.entries.forEach((originalEntry) => {
          const newDate = dateMapping.get(originalEntry.date)

          if (newDate) {
            // Find the corresponding row for this subtask
            const row = rowsCopy.find((r) => r.subtaskId === originalEntry.subtaskId)

            if (row) {
              const entryKey = `${row.subtaskId}-${newDate}`
              if (!existingEntriesMap.has(entryKey)) {
                // Create a new time entry with a new ID - this is just for UI display
                generatedEntries.push({
                  id: crypto.randomUUID(),
                  userId: currentUser,
                  projectId: row.projectId,
                  taskId: row.taskId,
                  subtaskId: row.subtaskId,
                  date: newDate,
                  hours: originalEntry.hours,
                  notes: originalEntry.notes,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                })
                console.log(`[v0] Created entry for ${entryKey}`)
              } else {
                console.log(`[v0] Skipping duplicate entry for ${entryKey}`)
              }
            }
          }
        })
      }

      console.log(`[v0] Generated ${generatedEntries.length} new entries (skipped duplicates)`)

      // Apply the data to the current timesheet UI (NO SUBMISSION LOGIC)
      await onApplySubmission(rowsCopy, generatedEntries)

      const weekStart = formatSubmissionDate(submission.startDate)
      const weekEnd = formatSubmissionDate(submission.endDate)

      toast({
        title: "Data Copied",
        description: `Copied timesheet data from ${weekStart} - ${weekEnd} to the current week. No submission created.`,
      })

      setIsApplyOpen(false)
    } catch (error) {
      console.error("Error copying submission data:", error)
      toast({
        title: "Error",
        description: "Failed to copy submission data. Please try again.",
        variant: "destructive",
      })
    }
  }

  const formatSubmissionDate = (dateStr: string) => {
    const date = new Date(dateStr)
    return date.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    })
  }

  return (
    <div className="flex space-x-2">
      {/* Copy from Previous Submission Dropdown */}
      <DropdownMenu open={isApplyOpen} onOpenChange={setIsApplyOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="outline"
            className="flex items-center gap-1 bg-gray-900 text-white border-gray-700 hover:bg-blue-600"
          >
            <Copy className="h-4 w-4 mr-1" />
            Copy Previous Submission
            <ChevronDown className="h-4 w-4 ml-1" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-80">
          {isLoading ? (
            <div className="px-2 py-4 text-center text-sm text-gray-500">Loading submissions...</div>
          ) : approvedSubmissions.length === 0 ? (
            <div className="px-2 py-4 text-center text-sm text-gray-500">No approved submissions found</div>
          ) : (
            approvedSubmissions.map((submission) => (
              <DropdownMenuItem
                key={submission.id}
                className="flex items-center justify-between px-3 py-3 cursor-pointer hover:bg-blue-50 hover:text-blue-700"
                onClick={() => handleCopySubmission(submission)}
              >
                <div className="flex items-center">
                  <Calendar className="h-4 w-4 mr-3 text-gray-500" />
                  <div className="flex flex-col">
                    <span className="font-medium">
                      {formatSubmissionDate(submission.startDate)} - {formatSubmissionDate(submission.endDate)}
                    </span>
                    <span className="text-xs text-gray-500">
                      {submission.totalHours} hours • Approved {formatSubmissionDate(submission.approvedAt.toString())}
                    </span>
                  </div>
                </div>
              </DropdownMenuItem>
            ))
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
