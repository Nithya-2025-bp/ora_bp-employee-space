"use client"

import { useState, useEffect, useCallback, useMemo, useRef } from "react"
import WeekSelector from "./week-selector"
import SubtaskSelector from "./subtask-selector"
import TimesheetGrid from "./timesheet-grid"
import CopySubmissionManager from "./copy-submission-manager"
import TimesheetSubmission from "./timesheet-submission"
import type { User } from "@/lib/users"
import { Button } from "@/components/ui/button"
import { RefreshCw } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { formatDate } from "@/lib/time-utils"
import { useTimesheetStore } from "@/lib/timesheet-store"

// Define TimeEntry interface directly to avoid import issues
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

// Define TimesheetRow interface directly to avoid import issues
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

interface TimesheetContentProps {
  initialAvailableRows: TimesheetRow[]
  user: User
  submissionStatus?: {
    submitted: boolean
    status?: string
    submission?: any
  }
  onRefreshStatus?: () => void
  onDateChange?: (date: Date) => void
}

export default function TimesheetContent({
  initialAvailableRows,
  user,
  submissionStatus = { submitted: false },
  onRefreshStatus,
  onDateChange,
}: TimesheetContentProps) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [timesheetRows, setTimesheetRows] = useState<TimesheetRow[]>([])
  const [availableRows, setAvailableRows] = useState<TimesheetRow[]>(initialAvailableRows || [])
  const [timeEntries, setTimeEntries] = useState<TimeEntry[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSubmissionDialogOpen, setIsSubmissionDialogOpen] = useState(false)
  // Store selected subtasks per week
  const [weeklySubtasks, setWeeklySubtasks] = useState<Record<string, TimesheetRow[]>>({})
  const [isLoadingTimeEntries, setIsLoadingTimeEntries] = useState(false)
  const [isCopyingSubmission, setIsCopyingSubmission] = useState(false)
  const [isLoadingSubmissionStatus, setIsLoadingSubmissionStatus] = useState(true)

  // Get the setCurrentUser function from the store
  const setCurrentUser = useTimesheetStore((state) => state.setCurrentUser)

  // Set the current user ID when the component mounts
  useEffect(() => {
    if (user?.email) {
      console.log("Setting current user ID:", user.email)
      setCurrentUser(user.email)
    }
  }, [user?.email, setCurrentUser])

  // Notify parent of date changes
  useEffect(() => {
    if (onDateChange) {
      onDateChange(selectedDate)
    }
  }, [selectedDate, onDateChange])

  // Get a key for the current week
  const getWeekKey = (date: Date) => {
    // Use the Monday of the week as the key
    const d = new Date(date)
    const day = d.getDay()
    const diff = d.getDate() - day + (day === 0 ? -6 : 1)
    const monday = new Date(d.setDate(diff))
    return formatDate(monday)
  }

  const loadDataRef = useRef<Promise<void> | null>(null)
  const lastLoadedWeekRef = useRef<string>("")
  const availableRowsCacheRef = useRef<{ data: TimesheetRow[]; timestamp: number } | null>(null)
  const CACHE_DURATION = 5 * 60 * 1000 // 5 minutes

  const currentWeekKey = useMemo(() => getWeekKey(selectedDate), [selectedDate])

  const hasValidEntries = useMemo(() => timeEntries.some((entry) => Number.parseFloat(entry.hours) > 0), [timeEntries])

  // Load timesheet data when component mounts or selected date changes
  useEffect(() => {
    loadData()
  }, [selectedDate])

  // Function to refresh submission status
  const refreshSubmissionStatus = async () => {
    setIsLoadingSubmissionStatus(true)
    try {
      console.log("[v0] TimesheetContent: Refreshing submission status...")
      invalidateAllCaches()

      if (onRefreshStatus) {
        await onRefreshStatus()
      }
    } catch (error) {
      console.error("Error refreshing submission status:", error)
    } finally {
      setIsLoadingSubmissionStatus(false)
    }
  }

  // Function to refresh time entries
  const refreshTimeEntries = async () => {
    setIsLoadingTimeEntries(true)
    try {
      const { getTimeEntriesForWeek } = await import("@/lib/actions/timesheet-actions")
      const refreshedEntries = await getTimeEntriesForWeek(selectedDate)
      console.log("Refreshed time entries:", refreshedEntries)
      setTimeEntries(refreshedEntries || [])
      return refreshedEntries || []
    } catch (error) {
      console.error("Error refreshing time entries:", error)
      return []
    } finally {
      setIsLoadingTimeEntries(false)
    }
  }

  const loadData = useCallback(async () => {
    if (loadDataRef.current) {
      console.log("Load data already in progress, waiting...")
      return loadDataRef.current
    }

    const weekKey = getWeekKey(selectedDate)

    if (lastLoadedWeekRef.current === weekKey) {
      console.log(`Data already loaded for week ${weekKey}, skipping...`)
      return
    }

    console.log(`Loading data for week ${weekKey}`)

    const loadPromise = (async () => {
      setIsLoading(true)
      setIsLoadingTimeEntries(true)
      setError(null)

      try {
        const { getAvailableTimesheetRows, getUserTimesheetRows, getTimeEntriesForWeek } = await import(
          "@/lib/actions/timesheet-actions"
        )

        let latestAvailableRows: TimesheetRow[] = []
        const now = Date.now()

        if (availableRowsCacheRef.current && now - availableRowsCacheRef.current.timestamp < CACHE_DURATION) {
          console.log("Using cached available rows")
          latestAvailableRows = availableRowsCacheRef.current.data
        } else {
          try {
            console.log("Fetching fresh available rows")
            latestAvailableRows = await getAvailableTimesheetRows()
            availableRowsCacheRef.current = { data: latestAvailableRows, timestamp: now }
            console.log("Cached available rows:", latestAvailableRows.length)
          } catch (error) {
            console.error("Error loading available rows:", error)
            latestAvailableRows = initialAvailableRows || []
          }
        }

        const [savedRows, entries] = await Promise.all([
          getUserTimesheetRows().catch((error) => {
            console.error("Error loading saved timesheet rows:", error)
            return []
          }),
          getTimeEntriesForWeek(selectedDate).catch((error) => {
            console.error("Error loading time entries:", error)
            return []
          }),
        ])

        console.log("Loaded saved timesheet rows:", savedRows.length)
        console.log("Loaded time entries for week:", entries.length)

        setIsLoading(false)
        setTimeEntries(entries || [])
        setIsLoadingTimeEntries(false)

        setAvailableRows(latestAvailableRows || [])

        const weekEntries = entries
          ? entries.filter((entry) => {
              const entryDate = new Date(entry.date)
              return getWeekKey(entryDate) === weekKey
            })
          : []

        const weekSubtaskIds = new Set(weekEntries.map((entry) => entry.subtaskId))

        if (weeklySubtasks[weekKey]) {
          console.log(`Using cached subtasks for week ${weekKey}:`, weeklySubtasks[weekKey].length)
          setTimesheetRows(weeklySubtasks[weekKey])
        } else if (savedRows && savedRows.length > 0) {
          const relevantRows = savedRows.filter(
            (row) =>
              weekSubtaskIds.has(row.subtaskId) ||
              entries.some(
                (entry) => entry.subtaskId === row.subtaskId && getWeekKey(new Date(entry.date)) === weekKey,
              ),
          )

          console.log(`No cached subtasks for week ${weekKey}, using filtered rows:`, relevantRows.length)
          setTimesheetRows(relevantRows)

          setWeeklySubtasks((prev) => ({
            ...prev,
            [weekKey]: relevantRows,
          }))
        } else {
          console.log(`No saved subtasks for week ${weekKey}, starting empty`)
          setTimesheetRows([])
        }

        lastLoadedWeekRef.current = weekKey

        await refreshSubmissionStatus()
      } catch (error) {
        console.error("Error loading data:", error)
        setError("Failed to load timesheet data. Please try again later.")
        setIsLoadingTimeEntries(false)
      } finally {
        setIsLoading(false)
      }
    })()

    loadDataRef.current = loadPromise

    try {
      await loadPromise
    } finally {
      loadDataRef.current = null
    }
  }, [selectedDate, weeklySubtasks, initialAvailableRows])

  const invalidateAllCaches = useCallback(() => {
    console.log("[v0] Invalidating all caches")
    availableRowsCacheRef.current = null
    lastLoadedWeekRef.current = ""
  }, [])

  const refreshAvailableRows = useCallback(async () => {
    if (isLoading) {
      console.log("Already loading, skipping refresh")
      return
    }

    setIsLoading(true)
    try {
      invalidateAllCaches()

      const { refreshTimesheetAvailableRows } = await import("@/lib/actions/refresh-timesheet")
      const result = await refreshTimesheetAvailableRows()

      if (result.success && result.rows) {
        setAvailableRows(result.rows)
        // Update cache
        availableRowsCacheRef.current = { data: result.rows, timestamp: Date.now() }
        toast({
          title: "Refreshed",
          description: "Available tasks have been updated",
        })
      } else {
        await loadData()
      }
    } catch (error) {
      console.error("Error refreshing timesheet rows:", error)
      await loadData()
    } finally {
      setIsLoading(false)
    }
  }, [isLoading, loadData, invalidateAllCaches])

  const handleTimesheetRowsChange = useCallback(
    async (newRows: TimesheetRow[]) => {
      // Update UI immediately for better UX
      setWeeklySubtasks((prev) => ({
        ...prev,
        [currentWeekKey]: newRows,
      }))
      setTimesheetRows(newRows)

      try {
        const { addTimesheetRow, removeTimesheetRow } = await import("@/lib/actions/timesheet-actions")

        const addedRows = newRows.filter((newRow) => !timesheetRows.some((existingRow) => existingRow.id === newRow.id))
        const removedRows = timesheetRows.filter(
          (existingRow) => !newRows.some((newRow) => newRow.id === existingRow.id),
        )

        // Process operations in parallel
        const operations = [
          ...addedRows.map((row) =>
            addTimesheetRow(
              row.projectId,
              row.taskId,
              row.subtaskId,
              row.projectTitle,
              row.taskTitle,
              row.subtaskTitle,
            ),
          ),
          ...removedRows.map((row) => removeTimesheetRow(row.id)),
        ]

        if (operations.length > 0) {
          await Promise.allSettled(operations)
          console.log(`Processed ${operations.length} timesheet row operations`)

          invalidateAllCaches()
        }
      } catch (error) {
        console.error("Error saving timesheet rows:", error)
        toast({
          title: "Error",
          description: "Failed to save timesheet rows. Please try again.",
          variant: "destructive",
        })
      }
    },
    [timesheetRows, currentWeekKey, invalidateAllCaches],
  )

  // Handle copying from previous submission - ONLY copy data, do NOT create any submission
  const handleCopyFromSubmission = useCallback(
    async (submissionRows: TimesheetRow[], submissionEntries: TimeEntry[]) => {
      console.log("=== COPY OPERATION START - NO SUBMISSION LOGIC ===")
      console.log("This operation will ONLY copy data to UI and save individual entries")
      console.log("NO SUBMISSION will be created or modified")

      // Set loading state immediately when copy starts
      setIsCopyingSubmission(true)

      try {
        // Import ONLY the functions we need for saving individual data
        const { addTimesheetRow } = await import("@/lib/actions/timesheet-actions")

        // Generate new IDs for the submission rows to avoid conflicts
        const newSubmissionRows = submissionRows.map((row) => ({
          ...row,
          id: crypto.randomUUID(),
        }))

        // Get the current subtask IDs to avoid duplicates
        const currentSubtaskIds = new Set(timesheetRows.map((row) => row.subtaskId))

        // Filter out submission rows that already exist in the current selection
        const filteredSubmissionRows = newSubmissionRows.filter((row) => !currentSubtaskIds.has(row.subtaskId))

        console.log("New rows to add:", filteredSubmissionRows)

        // STEP 1: Save new subtask rows to database (individual rows only)
        const savedRows = []
        for (const row of filteredSubmissionRows) {
          try {
            console.log(`Adding individual subtask row: ${row.subtaskTitle}`)
            const savedRow = await addTimesheetRow(
              row.projectId,
              row.taskId,
              row.subtaskId,
              row.projectTitle,
              row.taskTitle,
              row.subtaskTitle,
            )
            if (savedRow) {
              savedRows.push(row)
            }
          } catch (error) {
            console.error("Error saving individual subtask row:", error)
          }
        }

        // STEP 2: Update UI state with merged rows
        const mergedRows = [...timesheetRows, ...savedRows]
        setTimesheetRows(mergedRows)
        setWeeklySubtasks((prev) => ({
          ...prev,
          [currentWeekKey]: mergedRows,
        }))

        // STEP 3: Save time entries using the API route
        if (submissionEntries && submissionEntries.length > 0) {
          console.log("Saving time entries using server action...")

          const saveEntriesResponse = await fetch("/api/save-time-entries", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              entries: submissionEntries.map((entry) => ({
                userId: user.email,
                projectId: entry.projectId,
                taskId: entry.taskId,
                subtaskId: entry.subtaskId,
                date: entry.date,
                hours: entry.hours,
                notes: entry.notes,
              })),
            }),
          })

          if (saveEntriesResponse.ok) {
            const result = await saveEntriesResponse.json()
            console.log("Time entries saved successfully:", result)

            invalidateAllCaches()

            // STEP 4: Immediately refresh the time entries to update the UI
            console.log("Refreshing time entries to update UI...")
            const updatedEntries = await refreshTimeEntries()

            // Force a small delay to ensure the UI updates
            await new Promise((resolve) => setTimeout(resolve, 100))

            toast({
              title: "Data Copied Successfully",
              description: `Copied ${savedRows.length} subtasks and ${submissionEntries.length} time entries. This is draft data only - no submission created.`,
            })
          } else {
            console.error("Failed to save time entries")
            toast({
              title: "Partial Success",
              description: `Copied ${savedRows.length} subtasks but failed to save time entries. Please try again.`,
              variant: "destructive",
            })
          }
        } else {
          toast({
            title: "Subtasks Copied",
            description: `Copied ${savedRows.length} subtasks. This is draft data only - no submission created.`,
          })
        }

        console.log("=== COPY OPERATION COMPLETE - NO SUBMISSION CREATED ===")
      } catch (error) {
        console.error("Error in copy operation:", error)
        toast({
          title: "Error",
          description: "Failed to copy data. Please try again.",
          variant: "destructive",
        })
      } finally {
        // Clear loading state when copy operation is complete
        setIsCopyingSubmission(false)
      }
    },
    [timesheetRows, currentWeekKey, selectedDate, user.email, invalidateAllCaches],
  )

  const submissionData = useMemo(
    () =>
      timesheetRows.map((row) => ({
        date: selectedDate,
        project: row.projectTitle,
        task: row.taskTitle,
        hours: timeEntries
          .filter((entry) => entry.subtaskId === row.subtaskId)
          .reduce((sum, entry) => sum + Number.parseFloat(entry.hours || "0"), 0),
        notes: timeEntries
          .filter((entry) => entry.subtaskId === row.subtaskId)
          .map((entry) => entry.notes)
          .filter(Boolean)
          .join("; "),
      })),
    [timesheetRows, selectedDate, timeEntries],
  )

  // Don't render if user is not available
  if (!user || !user.email) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-600">Loading user information...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="bg-red-50 border border-red-200 rounded-md p-4 max-w-md">
          <h2 className="text-lg font-medium text-red-800 mb-2">Error Loading Timesheet</h2>
          <p className="text-sm text-red-700">{error}</p>
          <Button onClick={loadData} className="mt-4 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700">
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        </div>
      </div>
    )
  }

  if (isLoading) {
    return (
      <div className="h-full flex flex-col items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0051FF] border-t-transparent mb-4"></div>
          <p className="text-gray-600">Loading timesheet data...</p>
        </div>
      </div>
    )
  }

  const handleDateChange = (newDate: Date) => {
    setSelectedDate(newDate)
  }

  return (
    <div className="flex flex-col">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold text-black">Timesheet</h1>
      </div>

      <div className="flex justify-between items-center mb-6">
        <WeekSelector selectedDate={selectedDate} onChange={handleDateChange} />
        <CopySubmissionManager
          currentRows={timesheetRows}
          onApplySubmission={handleCopyFromSubmission}
          currentUser={user.email}
          selectedDate={selectedDate}
          timeEntries={timeEntries}
        />
      </div>

      <SubtaskSelector
        availableRows={availableRows}
        timesheetRows={timesheetRows}
        onRowsChange={handleTimesheetRowsChange}
        onRefresh={refreshAvailableRows}
      />

      <TimesheetGrid
        selectedDate={selectedDate}
        timesheetRows={timesheetRows}
        onRowsChange={handleTimesheetRowsChange}
        timeEntries={timeEntries}
        submissionStatus={submissionStatus}
        onRefreshStatus={refreshSubmissionStatus}
        isLoadingTimeEntries={isLoadingTimeEntries}
        isCopyingSubmission={isCopyingSubmission}
        isLoadingSubmissionStatus={isLoadingSubmissionStatus}
      />

      <TimesheetSubmission
        selectedDate={selectedDate}
        totalHours={timeEntries.reduce((sum, entry) => sum + Number.parseFloat(entry.hours || "0"), 0)}
        hasEntries={hasValidEntries}
        timeEntries={timeEntries}
        timesheetRows={submissionData}
        isOpen={isSubmissionDialogOpen}
        onOpenChange={(open) => {
          setIsSubmissionDialogOpen(open)
          if (!open) {
            invalidateAllCaches()
            refreshSubmissionStatus()
          }
        }}
        onStatusChange={refreshSubmissionStatus}
        submissionStatus={submissionStatus}
      />

      {availableRows.length === 0 && timesheetRows.length === 0 && (
        <div className="flex items-center justify-center py-8">
          <div className="text-center p-6 bg-gray-50 rounded-lg">
            <h3 className="text-lg font-medium text-gray-900 mb-2">No timesheet data available</h3>
            <p className="text-gray-600">There are currently no tasks assigned to you for timesheet entry.</p>
          </div>
        </div>
      )}
    </div>
  )
}
