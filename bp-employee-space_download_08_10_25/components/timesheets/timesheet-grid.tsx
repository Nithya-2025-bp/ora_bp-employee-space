"use client"
import { useState, useEffect } from "react"
import { getWeekDates, formatDayMonth, formatDate } from "@/lib/time-utils"
import TimeEntryCell from "./time-entry-cell"
import { Button } from "@/components/ui/button"
import { Trash2, Save, Clock, Send, CheckCircle, Info, MessageSquare } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import TimesheetSubmission from "./timesheet-submission"
import DailyTotal from "./timesheet-daily-total"
import WeeklyTotal from "./timesheet-weekly-total"
import SingleDayCommentsModal from "./single-day-comments-modal"
// import TimeInLieuSection from "./time-in-lieu-section"

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

interface TimesheetGridProps {
  selectedDate: Date
  timesheetRows: TimesheetRow[]
  onRowsChange: (rows: TimesheetRow[]) => void
  timeEntries?: TimeEntry[]
  submissionStatus?: {
    submitted: boolean
    status?: string
    submission?: any
  }
  onRefreshStatus?: () => void
  isLoadingTimeEntries?: boolean
  isCopyingSubmission?: boolean
  isLoadingSubmissionStatus?: boolean // Add this new prop
}

// Type for tracking unsaved changes
interface PendingChange {
  projectId: string
  taskId: string
  subtaskId: string
  date: string
  hours: string
  entryId?: string // If updating an existing entry
}

export default function TimesheetGrid({
  selectedDate,
  timesheetRows,
  onRowsChange,
  timeEntries = [],
  submissionStatus = { submitted: false },
  onRefreshStatus,
  isLoadingTimeEntries = false,
  isCopyingSubmission = false,
  isLoadingSubmissionStatus = false, // Add this new prop
}: TimesheetGridProps) {
  const [entries, setEntries] = useState<TimeEntry[]>(timeEntries)
  const [isLoading, setIsLoading] = useState(false)
  const [isRemoving, setIsRemoving] = useState<Record<string, boolean>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [pendingChanges, setPendingChanges] = useState<PendingChange[]>([])
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false)
  const [openDayModals, setOpenDayModals] = useState<Record<string, boolean>>({})
  const [gridKey, setGridKey] = useState(0) // Add a key to force re-renders

  useEffect(() => {
    setEntries(timeEntries)
    setGridKey((prev) => prev + 1)
  }, [timeEntries])

  const weekDates = getWeekDates(selectedDate)

  const formattedDates = weekDates.map((date) => formatDate(date))

  const isEditingDisabled =
    isLoadingSubmissionStatus || submissionStatus.status === "pending" || submissionStatus.status === "approved"

  const getEntryForDay = (subtaskId: string, date: string): TimeEntry | undefined => {
    const entry = entries.find((entry) => entry.subtaskId === subtaskId && entry.date === date)
    return entry
  }

  const hasPendingChange = (subtaskId: string, date: string): boolean => {
    return pendingChanges.some((change) => change.subtaskId === subtaskId && change.date === date)
  }

  const handleCellChange = (projectId: string, taskId: string, subtaskId: string, date: string, hours: string) => {
    if (isEditingDisabled) return

    console.log(`handleCellChange called for ${date} with hours: ${hours}`)

    const existingEntry = getEntryForDay(subtaskId, date)

    const filteredChanges = pendingChanges.filter((change) => !(change.subtaskId === subtaskId && change.date === date))

    if (!hours) {
      if (existingEntry) {
        setPendingChanges([
          ...filteredChanges,
          {
            projectId,
            taskId,
            subtaskId,
            date,
            hours: "",
            entryId: existingEntry.id,
          },
        ])
      }
      return
    }

    const newChanges = [
      ...filteredChanges,
      {
        projectId,
        taskId,
        subtaskId,
        date,
        hours,
        entryId: existingEntry?.id,
      },
    ]

    console.log(`Setting pending changes for ${date}: ${hours}`, newChanges)
    setPendingChanges(newChanges)
  }

  const handleRemoveRow = async (rowId: string) => {
    if (isRemoving[rowId] || isEditingDisabled) return

    setIsRemoving((prev) => ({ ...prev, [rowId]: true }))

    try {
      const rowToRemove = timesheetRows.find((row) => row.id === rowId)
      if (!rowToRemove) return

      const newChanges = [...pendingChanges]
      const filteredChanges = newChanges.filter((change) => change.subtaskId !== rowToRemove.subtaskId)

      formattedDates.forEach((date) => {
        const existingEntry = getEntryForDay(rowToRemove.subtaskId, date)
        if (existingEntry) {
          filteredChanges.push({
            projectId: rowToRemove.projectId,
            taskId: rowToRemove.taskId,
            subtaskId: rowToRemove.subtaskId,
            date,
            hours: "",
            entryId: existingEntry.id,
          })
        }
      })

      setPendingChanges(filteredChanges)

      const updatedEntries = entries.filter((entry) => entry.subtaskId !== rowToRemove.subtaskId)
      setEntries(updatedEntries)

      const updatedRows = timesheetRows.filter((row) => row.id !== rowId)
      onRowsChange(updatedRows)

      toast({
        title: "Row Removed",
        description: "The row has been removed and hours set to 0",
      })
    } finally {
      setIsRemoving((prev) => ({ ...prev, [rowId]: false }))
    }
  }

  const saveChanges = async () => {
    if (pendingChanges.length === 0 || isSaving || isEditingDisabled) return

    setIsSaving(true)
    try {
      const { upsertTimeEntry, deleteTimeEntry } = await import("@/lib/actions/timesheet-actions")

      const newEntries = [...entries]
      const results = []
      const deletedEntries = []

      for (const change of pendingChanges) {
        try {
          if (!change.hours) {
            if (change.entryId) {
              await deleteTimeEntry(change.entryId)
              deletedEntries.push(change.entryId)

              const entryIndex = newEntries.findIndex((e) => e.id === change.entryId)
              if (entryIndex >= 0) {
                newEntries.splice(entryIndex, 1)
              }
            }
          } else {
            const result = await upsertTimeEntry(
              change.projectId,
              change.taskId,
              change.subtaskId,
              change.date,
              change.hours,
            )

            if (result) {
              const entryIndex = newEntries.findIndex((e) => e.subtaskId === change.subtaskId && e.date === change.date)

              if (entryIndex >= 0) {
                newEntries[entryIndex] = result
              } else {
                newEntries.push(result)
              }

              results.push(result)
            }
          }
        } catch (error) {
          console.error("Error processing change:", change, error)
        }
      }

      setEntries(newEntries)
      setGridKey((prev) => prev + 1)

      setPendingChanges([])

      toast({
        title: "Success",
        description: `Saved ${results.length} time entries and deleted ${deletedEntries.length} entries`,
      })
    } catch (error) {
      console.error("Error saving time entries:", error)
      toast({
        title: "Error",
        description: "Failed to save some time entries. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const refreshEntries = async () => {
    if (isLoading) return

    setIsLoading(true)
    try {
      const { getTimeEntriesForWeek } = await import("@/lib/actions/timesheet-actions")
      const refreshedEntries = await getTimeEntriesForWeek(selectedDate)
      setEntries(refreshedEntries)
      setGridKey((prev) => prev + 1)

      toast({
        title: "Refreshed",
        description: "Timesheet data has been refreshed",
      })
    } catch (error) {
      console.error("Error refreshing entries:", error)
      toast({
        title: "Error",
        description: "Failed to refresh timesheet data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleQuickFill = (row: TimesheetRow) => {
    if (isSaving || isEditingDisabled) return

    const filledDays: { date: string; dayName: string; dayNumber: number }[] = []

    const newChanges: PendingChange[] = [...pendingChanges]

    weekDates.forEach((date, index) => {
      const dayOfWeek = date.getDay()
      const formattedDate = formattedDates[index]
      const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

      if (dayOfWeek >= 1 && dayOfWeek <= 5) {
        filledDays.push({
          date: formattedDate,
          dayName: dayNames[dayOfWeek],
          dayNumber: dayOfWeek,
        })

        const existingEntry = getEntryForDay(row.subtaskId, formattedDate)

        const changeIndex = newChanges.findIndex(
          (change) => change.subtaskId === row.subtaskId && change.date === formattedDate,
        )

        if (changeIndex >= 0) {
          newChanges.splice(changeIndex, 1)
        }

        newChanges.push({
          projectId: row.projectId,
          taskId: row.taskId,
          subtaskId: row.subtaskId,
          date: formattedDate,
          hours: "08:00",
          entryId: existingEntry?.id,
        })
      }
    })

    setPendingChanges(newChanges)

    toast({
      title: "Quick Fill",
      description: `Filled ${filledDays.length} weekdays with 8 hours`,
    })
  }

  const calculateWeeklyTotal = () => {
    let totalMinutes = 0

    entries.forEach((entry) => {
      const [hours, minutes] = entry.hours.split(":").map(Number)
      totalMinutes += hours * 60 + minutes
    })

    pendingChanges.forEach((change) => {
      if (change.hours) {
        const [hours, minutes] = change.hours.split(":").map(Number)
        const existingEntry = entries.find(
          (entry) => entry.subtaskId === change.subtaskId && entry.date === change.date,
        )

        if (existingEntry) {
          const [existingHours, existingMinutes] = existingEntry.hours.split(":").map(Number)
          totalMinutes -= existingHours * 60 + existingMinutes
        }

        totalMinutes += hours * 60 + minutes
      } else if (change.entryId) {
        const existingEntry = entries.find((entry) => entry.id === change.entryId)
        if (existingEntry) {
          const [hours, minutes] = existingEntry.hours.split(":").map(Number)
          totalMinutes -= hours * 60 + minutes
        }
      }
    })

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60
    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  }

  const handleDayModalOpen = (date: string) => {
    setOpenDayModals((prev) => ({ ...prev, [date]: true }))
  }

  const handleDayModalClose = (date: string) => {
    setOpenDayModals((prev) => ({ ...prev, [date]: false }))
  }

  const handleCommentsUpdated = (updatedEntries: Array<{ id: string; notes: string }>) => {
    console.log("[v0] handleCommentsUpdated called with:", updatedEntries)

    // Update the entries state with the new comment data
    setEntries((prevEntries) => {
      console.log("[v0] Previous entries count:", prevEntries.length)

      const newEntries = prevEntries.map((entry) => {
        const update = updatedEntries.find((u) => u.id === entry.id)
        if (update) {
          console.log("[v0] Updating entry", entry.id, "with notes:", update.notes)
          return {
            ...entry,
            notes: update.notes,
          }
        }
        return entry
      })

      console.log("[v0] New entries count:", newEntries.length)
      return newEntries
    })

    // Force re-render and refresh status
    console.log("[v0] Incrementing gridKey and calling onRefreshStatus")
    setGridKey((prev) => prev + 1)
    onRefreshStatus?.()

    console.log("[v0] handleCommentsUpdated complete")
  }

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-500 mb-4">Loading timesheet data...</p>
      </div>
    )
  }

  if (timesheetRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-center">
        <p className="text-gray-500 mb-4">No subtasks added to timesheet</p>
        <p className="text-sm text-gray-400">Use the dropdown above to add subtasks</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <div className="flex space-x-2">
          <Button
            onClick={saveChanges}
            disabled={pendingChanges.length === 0 || isSaving || isEditingDisabled}
            className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50"
          >
            {isSaving ? (
              <>
                <Save className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Changes ({pendingChanges.length})
              </>
            )}
          </Button>

          <Button
            onClick={() => setIsSubmitDialogOpen(true)}
            disabled={entries.length === 0}
            className="bg-[#0051FF] hover:bg-[#0051FF]/90 text-white"
          >
            {submissionStatus.status === "pending" ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                View Approval
              </>
            ) : submissionStatus.submitted && submissionStatus.status === "approved" ? (
              <>
                <CheckCircle className="h-4 w-4 mr-2" />
                View Approval
              </>
            ) : (
              <>
                <Send className="h-4 w-4 mr-2" />
                Submit for Approval
              </>
            )}
          </Button>
        </div>

        <div className="flex items-center space-x-4">
          {submissionStatus.status === "pending" && (
            <div className="text-blue-600 text-sm flex items-center">
              <Info className="h-4 w-4 mr-2" />
              <span>
                To make changes to your submission, please cancel your current submission and resubmit after your
                changes are made.
              </span>
            </div>
          )}

          {pendingChanges.length > 0 && !isEditingDisabled && (
            <div className="text-yellow-600 text-sm flex items-center">
              <span className="w-3 h-3 bg-yellow-400 rounded-full mr-2"></span>
              You have unsaved changes
            </div>
          )}
        </div>
      </div>

      {(isLoadingTimeEntries || isCopyingSubmission) && (
        <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
          <div className="flex items-center">
            <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent mr-2"></div>
            <span className="text-blue-700 text-sm">
              {isCopyingSubmission ? "Copying previous submission data..." : "Loading time entries..."}
            </span>
          </div>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full" key={gridKey}>
          <thead className="sticky top-0 bg-white z-10">
            <tr className="shadow-sm">
              <th className="p-2 text-left w-80 font-medium text-black">Project / Task / Subtask</th>
              {weekDates.map((date, index) => (
                <th key={index} className="p-2 text-center w-32 font-medium text-black">
                  {formatDayMonth(date)}
                </th>
              ))}
              <th className="p-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {timesheetRows.map((row) => (
              <tr key={row.id} className="hover:bg-gray-50">
                <td className="p-2 text-left">
                  <div className="flex flex-col">
                    <div className="text-xs text-gray-500">{row.projectTitle}</div>
                    <div className="text-xs text-gray-500">→ {row.taskTitle}</div>
                    <div className="text-sm font-medium text-black">→ {row.subtaskTitle}</div>
                  </div>
                </td>
                {formattedDates.map((date, index) => {
                  const entry = getEntryForDay(row.subtaskId, date)
                  const pendingChange = pendingChanges.find(
                    (change) => change.subtaskId === row.subtaskId && change.date === date,
                  )

                  const effectiveEntry = pendingChange
                    ? {
                        ...entry,
                        hours: pendingChange.hours,
                      }
                    : entry

                  const cellKey = `${row.subtaskId}-${date}-${entry?.id || "new"}-${entry?.hours || "empty"}-${gridKey}`

                  return (
                    <td key={index} className="p-2">
                      <TimeEntryCell
                        key={cellKey}
                        projectId={row.projectId}
                        taskId={row.taskId}
                        subtaskId={row.subtaskId}
                        date={date}
                        existingEntry={effectiveEntry}
                        onChange={(hours) => handleCellChange(row.projectId, row.taskId, row.subtaskId, date, hours)}
                        isDirty={hasPendingChange(row.subtaskId, date)}
                        isSaving={isSaving}
                        disabled={isEditingDisabled}
                        isLoadingEntries={isLoadingTimeEntries || isCopyingSubmission || isLoadingSubmissionStatus}
                      />
                    </td>
                  )
                })}
                <td className="p-2 flex space-x-1">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleQuickFill(row)}
                    disabled={isSaving || isEditingDisabled}
                    className="text-xs px-2 bg-[#0051FF] text-white border-[#0051FF] hover:bg-[#0051FF]/90 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isEditingDisabled ? "Cannot edit - timesheet is submitted" : "Fill weekdays with 8 hours"}
                  >
                    <Clock className="h-3 w-3 mr-1" />
                    Quick Fill
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleRemoveRow(row.id)}
                    disabled={isRemoving[row.id] || isSaving || isEditingDisabled}
                    className="h-8 w-8 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    title={isEditingDisabled ? "Cannot edit - timesheet is submitted" : "Remove row"}
                  >
                    <Trash2 className="h-4 w-4" />
                    <span className="sr-only">Remove</span>
                  </Button>
                </td>
              </tr>
            ))}
            <tr className="font-medium bg-gray-50">
              <td className="p-2 text-left text-black">Daily Total</td>
              {formattedDates.map((date, index) => (
                <DailyTotal key={`${date}-${gridKey}`} date={date} entries={entries} pendingChanges={pendingChanges} />
              ))}
              <td className="p-2"></td>
            </tr>
            <tr className="bg-gray-75">
              <td className="p-2 text-left text-black font-medium">Comments & Tickets</td>
              {weekDates.map((date, index) => (
                <td key={index} className="p-2 text-center">
                  <Button
                    onClick={() => handleDayModalOpen(formattedDates[index])}
                    disabled={timesheetRows.length === 0}
                    size="sm"
                    className="bg-black hover:bg-gray-800 text-white border border-black disabled:opacity-50 text-xs px-2 py-0.5 h-6"
                    title={`Add comments and tickets for ${formatDayMonth(date)}`}
                  >
                    <MessageSquare className="h-3 w-3" />
                  </Button>
                </td>
              ))}
              <td className="p-2"></td>
            </tr>
            <tr className="font-medium bg-gray-100">
              <td className="p-2 text-left text-black">Weekly Total</td>
              <WeeklyTotal
                key={`weekly-${gridKey}`}
                formattedDates={formattedDates}
                entries={entries}
                pendingChanges={pendingChanges}
              />
              <td className="p-2"></td>
            </tr>
          </tbody>
        </table>
      </div>

      {weekDates.map((date, index) => {
        const formattedDate = formattedDates[index]
        return (
          <SingleDayCommentsModal
            key={formattedDate}
            selectedDate={date}
            timesheetRows={timesheetRows}
            timeEntries={entries}
            open={openDayModals[formattedDate] || false}
            onOpenChange={(open) => {
              if (open) {
                handleDayModalOpen(formattedDate)
              } else {
                handleDayModalClose(formattedDate)
              }
            }}
            onCommentsUpdated={handleCommentsUpdated}
          />
        )
      })}

      <TimesheetSubmission
        selectedDate={selectedDate}
        totalHours={calculateWeeklyTotal()}
        hasEntries={entries.length > 0}
        timeEntries={entries}
        timesheetRows={timesheetRows}
        isOpen={isSubmitDialogOpen}
        onOpenChange={setIsSubmitDialogOpen}
        onStatusChange={onRefreshStatus}
        submissionStatus={submissionStatus}
      />
    </div>
  )
}
