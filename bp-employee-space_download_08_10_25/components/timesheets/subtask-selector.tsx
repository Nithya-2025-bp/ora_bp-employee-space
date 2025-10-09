"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw, AlertTriangle, List, Info } from "lucide-react"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { v4 as uuidv4 } from "uuid"
import { refreshTimesheetAvailableRows } from "@/lib/actions/refresh-timesheet"
import { toast } from "@/hooks/use-toast"
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"

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

// Update the interface to include an onRefresh function
interface SubtaskSelectorProps {
  availableRows: TimesheetRow[]
  timesheetRows: TimesheetRow[]
  onRowsChange: (rows: TimesheetRow[]) => void
  onRefresh?: () => Promise<void>
}

export default function SubtaskSelector({
  availableRows,
  timesheetRows,
  onRowsChange,
  onRefresh,
}: SubtaskSelectorProps) {
  const [selectedRowId, setSelectedRowId] = useState<string>("")
  const [isAdding, setIsAdding] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isOpen, setIsOpen] = useState(false)
  const [showDebugInfo, setShowDebugInfo] = useState(false)
  const availableRowsRef = useRef(availableRows)

  useEffect(() => {
    availableRowsRef.current = availableRows
  }, [availableRows])

  // Filter out rows that are already in the timesheet
  const filteredAvailableRows = (availableRows || []).filter((availableRow) => {
    const isAlreadyInTimesheet = timesheetRows.some((row) => row.subtaskId === availableRow.subtaskId)
    return !isAlreadyInTimesheet
  })

  // Add a refresh function
  const handleRefresh = async () => {
    if (isRefreshing) return

    setIsRefreshing(true)
    setError(null)

    try {
      if (onRefresh) {
        await onRefresh()
        toast({
          title: "Refreshed",
          description: "Available tasks have been refreshed",
        })
      } else {
        // Call the server action directly if no refresh callback provided
        const result = await refreshTimesheetAvailableRows()
        if (!result.success) {
          setError(`Failed to refresh available tasks: ${result.message}`)
          toast({
            title: "Error",
            description: `Failed to refresh available tasks: ${result.message}`,
            variant: "destructive",
          })
        } else {
          toast({
            title: "Refreshed",
            description: "Available tasks have been refreshed",
          })
        }
      }
    } catch (err) {
      console.error("Error refreshing available tasks:", err)
      setError("Failed to refresh available tasks. Please try again.")
      toast({
        title: "Error",
        description: "Failed to refresh available tasks",
        variant: "destructive",
      })
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleAddSubtask = async () => {
    if (!selectedRowId || isAdding) return

    setIsAdding(true)
    setError(null)

    try {
      const selectedRow = availableRowsRef.current.find(
        (row) => `${row.projectId}-${row.taskId}-${row.subtaskId}` === selectedRowId,
      )

      if (!selectedRow) {
        setError("Selected task not found")
        toast({
          title: "Error",
          description: "Selected task not found",
          variant: "destructive",
        })
        return
      }

      // Import the addTimesheetRow function
      const { addTimesheetRow } = await import("@/lib/actions/timesheet-actions")

      // Add to database first
      const result = await addTimesheetRow(
        selectedRow.projectId,
        selectedRow.taskId,
        selectedRow.subtaskId,
        selectedRow.projectTitle,
        selectedRow.taskTitle,
        selectedRow.subtaskTitle,
      )

      if (result) {
        // Use the returned row from the database
        onRowsChange([...timesheetRows, result])
        toast({
          title: "Success",
          description: "Task added to timesheet",
        })
      } else {
        // Fallback to creating a local row if database operation failed
        const newRow = {
          ...selectedRow,
          id: uuidv4(),
        }
        onRowsChange([...timesheetRows, newRow])
        toast({
          title: "Warning",
          description: "Task added locally, but not saved to database",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error adding timesheet row:", error)
      setError("An error occurred while adding the task")
      toast({
        title: "Error",
        description: "Failed to add task to timesheet",
        variant: "destructive",
      })
    } finally {
      setIsAdding(false)
      setSelectedRowId("")
      setIsOpen(false)
    }
  }

  // Group rows by project and task
  const groupedRows: Record<string, Record<string, TimesheetRow[]>> = {}

  filteredAvailableRows.forEach((row) => {
    if (!groupedRows[row.projectTitle]) {
      groupedRows[row.projectTitle] = {}
    }

    if (!groupedRows[row.projectTitle][row.taskTitle]) {
      groupedRows[row.projectTitle][row.taskTitle] = []
    }

    groupedRows[row.projectTitle][row.taskTitle].push(row)
  })

  return (
    <div className="mb-6">
      <div className="flex items-end space-x-4">
        <div className="w-full">
          <div className="flex justify-between mb-1">
            <label className="block text-sm font-medium text-black">Select Subtask</label>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6"
                      onClick={() => setShowDebugInfo(!showDebugInfo)}
                    >
                      <Info className="h-4 w-4" />
                      <span className="sr-only">Subtask Information</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View debug information about available subtasks</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <Select value={selectedRowId} onValueChange={setSelectedRowId} open={isOpen} onOpenChange={setIsOpen}>
            <SelectTrigger className="bg-[#0051FF] text-white border-[#0051FF] focus:ring-[#0051FF]/20">
              <SelectValue placeholder="Select a subtask" />
            </SelectTrigger>
            <SelectContent
              className="bg-[#0051FF] data-[state=open]:bg-[#0051FF] text-white border-[#0051FF] z-50"
              position="popper"
              sideOffset={5}
            >
              {filteredAvailableRows.length === 0 && availableRows.length === 0 ? (
                <div className="px-2 py-1 text-sm text-white/80">No subtasks assigned</div>
              ) : filteredAvailableRows.length === 0 ? (
                <div className="px-2 py-1 text-sm text-white/80">No available subtasks to add</div>
              ) : (
                Object.entries(groupedRows).map(([projectTitle, tasks]) => (
                  <div key={projectTitle} className="mb-2">
                    <div className="px-2 py-1 text-sm font-semibold text-white/80 bg-[#0051FF]/80">{projectTitle}</div>
                    {Object.entries(tasks).map(([taskTitle, subtasks]) => (
                      <div key={`${projectTitle}-${taskTitle}`} className="pl-2">
                        <div className="px-2 py-1 text-xs font-medium text-white/70 bg-[#0051FF]/70">{taskTitle}</div>
                        {subtasks.map((subtask) => (
                          <SelectItem
                            key={`${subtask.projectId}-${subtask.taskId}-${subtask.subtaskId}`}
                            value={`${subtask.projectId}-${subtask.taskId}-${subtask.subtaskId}`}
                            className="pl-4 text-white focus:bg-white/20 focus:text-white data-[highlighted]:bg-white/20 data-[highlighted]:text-white"
                          >
                            {subtask.subtaskTitle}
                          </SelectItem>
                        ))}
                      </div>
                    ))}
                  </div>
                ))
              )}
            </SelectContent>
          </Select>
        </div>

        <div className="flex space-x-2">
          <Button
            onClick={handleAddSubtask}
            disabled={!selectedRowId || isAdding}
            className="flex items-center gap-1 bg-[#0051FF] text-white hover:bg-[#0051FF]/90"
          >
            <Plus className="h-4 w-4" />
            {isAdding ? "Adding..." : "Add to Timesheet"}
          </Button>

          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            variant="outline"
            className="flex items-center gap-1 bg-black text-white border-black hover:bg-[#0051FF] hover:border-[#0051FF] disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>
        </div>
      </div>

      {error && <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">{error}</div>}

      {/* Add a message when no subtasks are assigned */}
      {availableRows.length === 0 && (
        <div className="mt-4 p-4 bg-yellow-50 rounded-md border border-yellow-200">
          <div className="flex items-start">
            <AlertTriangle className="h-5 w-5 text-yellow-500 mr-2 mt-0.5" />
            <div>
              <h3 className="font-medium text-yellow-800">No subtasks assigned</h3>
              <p className="text-sm text-yellow-700 mt-1">
                You don't have any subtasks assigned to you. Please contact your project manager to get assigned to
                tasks.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Show debug information when enabled */}
      {showDebugInfo && (
        <div className="mt-4 p-4 bg-gray-50 rounded-md border border-gray-200">
          <h4 className="font-medium text-gray-700 mb-2 flex items-center">
            <List className="h-4 w-4 mr-1" />
            Subtask Assignment Debug
          </h4>
          <div className="space-y-2 text-xs text-gray-600">
            <p>Available rows: {availableRows.length}</p>
            <p>Filtered available rows: {filteredAvailableRows.length}</p>
            <p>Current timesheet rows: {timesheetRows.length}</p>
            <p>Projects with subtasks: {Object.keys(groupedRows).length}</p>
            {Object.entries(groupedRows).map(([project, tasks]) => (
              <div key={project} className="ml-4">
                <p>
                  • {project}: {Object.values(tasks).flat().length} subtasks
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// Note: Please check the subtask-selector.tsx file to ensure there's no admin-specific filtering
// that would show all subtasks to admins. The component should only display subtasks that are
// in the availableRows prop, which we've already filtered in getAvailableTimesheetRows.
