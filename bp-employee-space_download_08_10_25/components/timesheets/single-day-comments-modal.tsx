"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { MessageSquare, TicketIcon, Save, Plus, Calendar, Clock, RefreshCw, AlertCircle } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { formatDayMonth, formatDate } from "@/lib/time-utils"
import {
  getTicketsForDay,
  removeTicket as removeTicketAction,
  resolveTimeEntriesAction,
  updateDailyComments, // Import individual comment update function
} from "@/lib/actions/daily-comments-actions"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Slider } from "@/components/ui/slider"
import { Label } from "@/components/ui/label"
import { createEnhancedTicket, getExistingTicketsForUser } from "@/lib/actions/daily-comments-actions"

// Define interfaces for the modal data
interface TimeEntry {
  id: string
  userId: string
  projectId: string
  taskId: string
  subtaskId: string
  date: string
  hours: string
  notes?: string
  dailyComments?: string
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

interface Ticket {
  id: string
  title: string
  description?: string
  ticketType: "support" | "bug" | "feature" | "maintenance"
  createdAt: Date
  allocatedHours?: number
  assignedSubtaskId?: string
  assignedSubtaskTitle?: string
  assignedTaskTitle?: string
  assignedProjectTitle?: string
}

interface ExistingTicket {
  id: string
  title: string
  description?: string
  ticketType: "support" | "bug" | "feature" | "maintenance"
  createdAt: Date
  timesheetEntryDate: string
  projectTitle: string
  taskTitle: string
  subtaskTitle: string
}

interface TaskWithHours {
  subtaskId: string
  projectTitle: string
  taskTitle: string
  subtaskTitle: string
  hours: string
  totalHours: number
}

interface SubtaskComment {
  subtaskId: string
  comment: string
  originalComment: string
  hasChanged: boolean
}

interface SingleDayCommentsModalProps {
  selectedDate: Date
  timesheetRows: TimesheetRow[]
  timeEntries: TimeEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCommentsUpdated?: (updatedEntries: Array<{ id: string; notes: string }>) => void
}

export default function SingleDayCommentsModal({
  selectedDate,
  timesheetRows,
  timeEntries,
  open,
  onOpenChange,
  onCommentsUpdated,
}: SingleDayCommentsModalProps) {
  const [dayEntries, setDayEntries] = useState<
    (TimeEntry & { projectTitle: string; taskTitle: string; subtaskTitle: string })[]
  >([])
  const [subtaskComments, setSubtaskComments] = useState<Map<string, SubtaskComment>>(new Map())
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newTicket, setNewTicket] = useState({
    title: "",
    description: "",
    isExistingTicket: false,
    existingTicketId: "",
    assignedTaskId: "",
    allocatedHours: 0,
    ticketType: "support" as const,
  })
  const [hasChanges, setHasChanges] = useState(false)
  const [existingTickets, setExistingTickets] = useState<ExistingTicket[]>([])
  const [tasksWithHours, setTasksWithHours] = useState<TaskWithHours[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const formattedDate = formatDate(selectedDate)

  // Load day data when modal opens
  useEffect(() => {
    if (open) {
      loadDayData()
    }
  }, [open, selectedDate, timeEntries, timesheetRows])

  const loadDayData = async () => {
    setIsLoading(true)
    setLoadError(null) // Clear previous errors
    try {
      // Load existing tickets and resolve time entries
      const [dayTickets, existingTicketsData, resolvedEntriesResult] = await Promise.all([
        getTicketsForDay(selectedDate),
        getExistingTicketsForUser(),
        resolveTimeEntriesAction(timeEntries),
      ])

      if (!resolvedEntriesResult.success) {
        setLoadError(resolvedEntriesResult.error || "Failed to resolve time entries")
        throw new Error(resolvedEntriesResult.error || "Failed to resolve time entries")
      }

      const resolvedTimeEntries = resolvedEntriesResult.data

      // Filter entries for this specific day
      const dayTimeEntries = resolvedTimeEntries.filter((entry) => entry.date === formattedDate)

      // Calculate tasks with hours for this day
      const tasksMap = new Map<string, TaskWithHours>()
      dayTimeEntries.forEach((entry) => {
        const key = entry.subtaskId
        const [hours, minutes] = entry.hours.split(":").map(Number)
        const totalHours = hours + minutes / 60

        if (tasksMap.has(key)) {
          const existing = tasksMap.get(key)!
          existing.totalHours += totalHours
          const newHours = Math.floor(existing.totalHours)
          const newMinutes = Math.round((existing.totalHours % 1) * 60)
          existing.hours = `${newHours}:${newMinutes.toString().padStart(2, "0")}`
        } else {
          tasksMap.set(key, {
            subtaskId: entry.subtaskId,
            projectTitle: entry.projectTitle,
            taskTitle: entry.taskTitle,
            subtaskTitle: entry.subtaskTitle,
            hours: entry.hours,
            totalHours: totalHours,
          })
        }
      })

      setExistingTickets(existingTicketsData)
      setTasksWithHours(Array.from(tasksMap.values()))
      setDayEntries(dayTimeEntries)

      // Get tickets for this day and enhance with subtask information
      const enhancedTickets = dayTickets
        .filter((ticket) => dayTimeEntries.some((entry) => entry.id === ticket.timesheetEntryId))
        .map((ticket) => {
          const assignedSubtask = timesheetRows.find((row) => row.subtaskId === ticket.assignedSubtaskId)
          return {
            ...ticket,
            assignedSubtaskId: ticket.assignedSubtaskId,
            assignedSubtaskTitle: assignedSubtask?.subtaskTitle,
            assignedTaskTitle: assignedSubtask?.taskTitle,
            assignedProjectTitle: assignedSubtask?.projectTitle,
          }
        })

      setTickets(enhancedTickets)

      const commentsMap = new Map<string, SubtaskComment>()
      Array.from(tasksMap.values()).forEach((task) => {
        // Find the first entry for this subtask to get existing comment
        const entryForSubtask = dayTimeEntries.find((entry) => entry.subtaskId === task.subtaskId)
        const existingComment = entryForSubtask?.notes || ""

        commentsMap.set(task.subtaskId, {
          subtaskId: task.subtaskId,
          comment: existingComment,
          originalComment: existingComment,
          hasChanged: false,
        })
      })
      setSubtaskComments(commentsMap)
    } catch (error: any) {
      console.error("Error loading day data:", error)
      const errorMessage = error?.message || "Failed to load day data"
      setLoadError(errorMessage)
      toast({
        title: "Error Loading Data",
        description: errorMessage,
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleSubtaskCommentChange = (subtaskId: string, newComment: string) => {
    let updatedMap: Map<string, SubtaskComment>

    setSubtaskComments((prev) => {
      const updated = new Map(prev)
      const current = updated.get(subtaskId)
      if (current) {
        const hasChanged = newComment !== current.originalComment
        updated.set(subtaskId, {
          ...current,
          comment: newComment,
          hasChanged,
        })
      }
      updatedMap = updated
      return updated
    })

    // Check if any comments have changes using the updated map
    const hasAnyChanges =
      Array.from(updatedMap!.values()).some(
        (comment) => comment.hasChanged || comment.comment !== comment.originalComment,
      ) || newTicket.title.trim() !== ""

    console.log("[v0] handleSubtaskCommentChange - hasAnyChanges:", hasAnyChanges, "newComment:", newComment)
    setHasChanges(hasAnyChanges)
  }

  const handleNewTicketChange = (
    field:
      | "title"
      | "description"
      | "isExistingTicket"
      | "existingTicketId"
      | "assignedTaskId"
      | "allocatedHours"
      | "ticketType",
    value: string | boolean | number,
  ) => {
    setNewTicket((prev) => {
      const updated = { ...prev, [field]: value }

      // Reset related fields when switching between new/existing ticket
      if (field === "isExistingTicket") {
        if (value) {
          updated.title = ""
          updated.description = ""
          updated.ticketType = "support"
        } else {
          updated.existingTicketId = ""
        }
      }

      return updated
    })

    setHasChanges(true)
  }

  const addTicket = async () => {
    // Validation for existing ticket selection
    if (newTicket.isExistingTicket && !newTicket.existingTicketId) {
      toast({
        title: "Error",
        description: "Please select an existing ticket",
        variant: "destructive",
      })
      return
    }

    // Validation for new ticket creation
    if (!newTicket.isExistingTicket && !newTicket.title.trim()) {
      toast({
        title: "Error",
        description: "Ticket title is required",
        variant: "destructive",
      })
      return
    }

    if (dayEntries.length === 0) {
      toast({
        title: "Error",
        description: "No time entries found for this day",
        variant: "destructive",
      })
      return
    }

    try {
      const result = await createEnhancedTicket(dayEntries[0].id, {
        title: newTicket.title,
        description: newTicket.description,
        ticketType: newTicket.ticketType,
        isExistingTicket: newTicket.isExistingTicket,
        existingTicketId: newTicket.existingTicketId,
        assignedTaskId: newTicket.assignedTaskId,
        allocatedHours: newTicket.allocatedHours,
      })

      if (result.success) {
        // Create a new ticket object for the UI
        let newTicketObj: Ticket

        if (newTicket.isExistingTicket && newTicket.existingTicketId) {
          const existingTicket = existingTickets.find((t) => t.id === newTicket.existingTicketId)
          newTicketObj = {
            id: newTicket.existingTicketId,
            title: existingTicket?.title || "Unknown Ticket",
            description: existingTicket?.description,
            ticketType: existingTicket?.ticketType || "support",
            createdAt: existingTicket?.createdAt || new Date(),
            allocatedHours: newTicket.allocatedHours,
            assignedSubtaskId: newTicket.assignedTaskId,
            assignedSubtaskTitle: timesheetRows.find((row) => row.subtaskId === newTicket.assignedTaskId)?.subtaskTitle,
            assignedTaskTitle: timesheetRows.find((row) => row.subtaskId === newTicket.assignedTaskId)?.taskTitle,
            assignedProjectTitle: timesheetRows.find((row) => row.subtaskId === newTicket.assignedTaskId)?.projectTitle,
          }
        } else {
          newTicketObj = {
            id: result.ticketId!,
            title: newTicket.title,
            description: newTicket.description,
            ticketType: newTicket.ticketType,
            createdAt: new Date(),
            allocatedHours: newTicket.allocatedHours,
            assignedSubtaskId: newTicket.assignedTaskId,
            assignedSubtaskTitle: timesheetRows.find((row) => row.subtaskId === newTicket.assignedTaskId)?.subtaskTitle,
            assignedTaskTitle: timesheetRows.find((row) => row.subtaskId === newTicket.assignedTaskId)?.taskTitle,
            assignedProjectTitle: timesheetRows.find((row) => row.subtaskId === newTicket.assignedTaskId)?.projectTitle,
          }
        }

        // Update tickets list
        setTickets((prev) => [...prev, newTicketObj])

        // Clear new ticket form
        setNewTicket({
          title: "",
          description: "",
          isExistingTicket: false,
          existingTicketId: "",
          assignedTaskId: "",
          allocatedHours: 0,
          ticketType: "support",
        })

        toast({
          title: "Success",
          description: newTicket.isExistingTicket
            ? "Existing ticket assigned successfully"
            : "Ticket created successfully",
        })
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error creating ticket:", error)
      toast({
        title: "Error",
        description: "Failed to create ticket",
        variant: "destructive",
      })
    }
  }

  const saveChanges = async () => {
    if (!hasChanges) return

    console.log("[v0] saveChanges called - hasChanges:", hasChanges)

    setIsSaving(true)
    try {
      // Save individual subtask comments
      const changedComments = Array.from(subtaskComments.values()).filter((comment) => comment.hasChanged)

      console.log("[v0] changedComments:", changedComments.length, changedComments)

      if (changedComments.length > 0) {
        const updatedEntriesData: Array<{ id: string; notes: string }> = []

        // Update each subtask's comment individually
        const updatePromises = changedComments.map(async (commentData) => {
          // Find the first entry for this subtask to update
          const entryForSubtask = dayEntries.find((entry) => entry.subtaskId === commentData.subtaskId)
          console.log("[v0] Processing comment for subtask:", commentData.subtaskId, "entry:", entryForSubtask?.id)

          if (entryForSubtask) {
            const result = await updateDailyComments(entryForSubtask.id, commentData.comment)
            console.log("[v0] Update result for entry", entryForSubtask.id, ":", result)

            if (result.success) {
              updatedEntriesData.push({
                id: entryForSubtask.id,
                notes: commentData.comment,
              })
            }
            return result
          }
          return { success: false, message: "Entry not found" }
        })

        const results = await Promise.all(updatePromises)
        const failures = results.filter((result) => !result.success)

        console.log("[v0] All updates complete. updatedEntriesData:", updatedEntriesData)
        console.log("[v0] Calling onCommentsUpdated with data:", updatedEntriesData)

        if (failures.length > 0) {
          toast({
            title: "Partial Success",
            description: `Updated ${results.length - failures.length} comments, ${failures.length} failed`,
            variant: "destructive",
          })
        } else {
          // Update the original comments to reflect saved state
          setSubtaskComments((prev) => {
            const updated = new Map(prev)
            changedComments.forEach((comment) => {
              const current = updated.get(comment.subtaskId)
              if (current) {
                updated.set(comment.subtaskId, {
                  ...current,
                  originalComment: current.comment,
                  hasChanged: false,
                })
              }
            })
            return updated
          })

          setHasChanges(false)

          console.log("[v0] About to call onCommentsUpdated callback")
          onCommentsUpdated?.(updatedEntriesData)
          console.log("[v0] onCommentsUpdated callback called")

          toast({
            title: "Success",
            description: `Updated ${changedComments.length} subtask comment${changedComments.length !== 1 ? "s" : ""}`,
          })
        }
      }
    } catch (error) {
      console.error("[v0] Error saving changes:", error)
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
      console.log("[v0] saveChanges complete")
    }
  }

  const removeTicket = async (ticketId: string) => {
    try {
      const result = await removeTicketAction(ticketId)

      if (result.success) {
        // Update UI by removing ticket
        setTickets((prev) => prev.filter((ticket) => ticket.id !== ticketId))
        setHasChanges(true)

        toast({
          title: "Success",
          description: result.message,
        })
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error removing ticket:", error)
      toast({
        title: "Error",
        description: "Failed to remove ticket",
        variant: "destructive",
      })
    }
  }

  const clearSubtaskComment = (subtaskId: string) => {
    handleSubtaskCommentChange(subtaskId, "")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white text-gray-900 border border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            Comments & Tickets - {formatDayMonth(selectedDate)}
          </DialogTitle>
          <DialogDescription className="text-gray-700">
            Add comments and tickets for {format(selectedDate, "EEEE, MMM d, yyyy")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex justify-center items-center h-40">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0051FF]"></div>
            </div>
          ) : loadError ? (
            <div className="flex flex-col justify-center items-center h-40 space-y-4">
              <AlertCircle className="h-12 w-12 text-red-500" />
              <div className="text-center">
                <p className="text-red-600 font-medium">{loadError}</p>
                <p className="text-sm text-gray-500 mt-1">
                  {loadError.includes("busy") || loadError.includes("temporarily")
                    ? "The database is experiencing high traffic. Please wait a moment."
                    : "Please try again."}
                </p>
              </div>
              <Button onClick={loadDayData} variant="outline" className="mt-2 bg-transparent">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="border rounded-lg p-4 bg-gray-50">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 mr-2 text-gray-600" />
                    <h3 className="font-medium text-gray-900">
                      {format(selectedDate, "EEEE")}, {formatDayMonth(selectedDate)}
                    </h3>
                    {dayEntries.length > 0 && (
                      <Badge variant="outline" className="ml-2 text-gray-700 border-gray-300">
                        {dayEntries
                          .reduce((total, entry) => {
                            const [hours, minutes] = entry.hours.split(":").map(Number)
                            return total + hours + minutes / 60
                          }, 0)
                          .toFixed(1)}
                        h
                      </Badge>
                    )}
                  </div>
                  {tickets.length > 0 && (
                    <Badge variant="outline" className="text-blue-600 border-blue-200">
                      {tickets.length} ticket{tickets.length !== 1 ? "s" : ""}
                    </Badge>
                  )}
                </div>

                {tasksWithHours.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3">Subtasks & Comments:</h4>
                    <div className="space-y-4">
                      {tasksWithHours.map((task) => {
                        const commentData = subtaskComments.get(task.subtaskId)
                        return (
                          <div key={task.subtaskId} className="bg-white p-4 rounded border">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1">
                                <div className="font-medium text-gray-900">{task.projectTitle}</div>
                                <div className="text-gray-600 text-sm">
                                  {task.taskTitle} / {task.subtaskTitle}
                                </div>
                              </div>
                              <div className="flex items-center text-gray-600 ml-4">
                                <Clock className="h-3 w-3 mr-1" />
                                <span className="font-medium">{task.hours}</span>
                              </div>
                            </div>

                            <div>
                              <div className="flex justify-between items-center mb-2">
                                <label className="block text-sm font-medium text-gray-700">
                                  Comment for {task.subtaskTitle}
                                </label>
                                {commentData?.comment && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => clearSubtaskComment(task.subtaskId)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 px-2"
                                  >
                                    Clear
                                  </Button>
                                )}
                              </div>
                              <Textarea
                                value={commentData?.comment || ""}
                                onChange={(e) => handleSubtaskCommentChange(task.subtaskId, e.target.value)}
                                placeholder={`Add comment for ${task.subtaskTitle}...`}
                                className="min-h-[60px] bg-white text-gray-900 border-gray-300 placeholder:text-gray-500"
                              />
                              {commentData?.hasChanged && (
                                <div className="text-xs text-yellow-600 mt-1 flex items-center">
                                  <span className="w-2 h-2 bg-yellow-400 rounded-full mr-1"></span>
                                  Unsaved changes
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Existing Tickets */}
                {tickets.length > 0 && (
                  <div className="mb-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                      <TicketIcon className="h-4 w-4 mr-1" />
                      Tickets
                    </h4>
                    <div className="space-y-2">
                      {tickets.map((ticket) => (
                        <div key={ticket.id} className="bg-white p-3 rounded border">
                          <div className="flex justify-between items-start mb-2">
                            <h5 className="font-medium text-gray-900">{ticket.title}</h5>
                            <div className="flex items-center space-x-2">
                              <Badge variant="outline" className="text-blue-600">
                                {ticket.ticketType}
                              </Badge>
                              {ticket.allocatedHours && ticket.allocatedHours > 0 && (
                                <Badge variant="outline" className="text-green-600">
                                  {ticket.allocatedHours}h
                                </Badge>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeTicket(ticket.id)}
                                className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 w-6 p-0"
                              >
                                ×
                              </Button>
                            </div>
                          </div>
                          {ticket.description && <p className="text-sm text-gray-600 mb-2">{ticket.description}</p>}
                          {ticket.assignedSubtaskTitle && (
                            <div className="text-xs text-blue-600 mb-2 bg-blue-50 px-2 py-1 rounded">
                              <strong>Assigned to:</strong> {ticket.assignedProjectTitle} / {ticket.assignedTaskTitle} /{" "}
                              {ticket.assignedSubtaskTitle}
                            </div>
                          )}
                          <p className="text-xs text-gray-500">
                            Created {format(ticket.createdAt, "MMM d, yyyy h:mm a")}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {dayEntries.length > 0 && (
                  <div className="border-t pt-4">
                    <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                      <Plus className="h-4 w-4 mr-1" />
                      Add Ticket
                    </h4>

                    <div className="space-y-4">
                      {/* Ticket Type Selection */}
                      <div>
                        <Label className="text-sm font-medium text-gray-700">Ticket Creation</Label>
                        <Select
                          value={newTicket.isExistingTicket ? "existing" : "new"}
                          onValueChange={(value) => handleNewTicketChange("isExistingTicket", value === "existing")}
                        >
                          <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                            <SelectValue placeholder="Select creation type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="new">Create New Ticket</SelectItem>
                            <SelectItem value="existing">Use Existing Ticket</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Existing Ticket Selection */}
                      {newTicket.isExistingTicket && (
                        <div>
                          <Label className="text-sm font-medium text-gray-700">Select Existing Ticket</Label>
                          <Select
                            value={newTicket.existingTicketId}
                            onValueChange={(value) => handleNewTicketChange("existingTicketId", value)}
                          >
                            <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                              <SelectValue placeholder="Choose an existing ticket" />
                            </SelectTrigger>
                            <SelectContent>
                              {existingTickets.map((ticket) => (
                                <SelectItem key={ticket.id} value={ticket.id}>
                                  <div className="flex flex-col">
                                    <span className="font-medium">{ticket.title}</span>
                                    <span className="text-xs text-gray-500">
                                      {ticket.projectTitle} / {ticket.subtaskTitle} -{" "}
                                      {format(ticket.createdAt, "MMM d")}
                                    </span>
                                  </div>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}

                      {/* New Ticket Fields */}
                      {!newTicket.isExistingTicket && (
                        <>
                          <div>
                            <Label className="text-sm font-medium text-gray-700">Ticket Type</Label>
                            <Select
                              value={newTicket.ticketType}
                              onValueChange={(value) => handleNewTicketChange("ticketType", value)}
                            >
                              <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                                <SelectValue placeholder="Select ticket type" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="support">Support</SelectItem>
                                <SelectItem value="bug">Bug</SelectItem>
                                <SelectItem value="feature">Feature</SelectItem>
                                <SelectItem value="maintenance">Maintenance</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-700">Ticket Name</Label>
                            <Input
                              value={newTicket.title}
                              onChange={(e) => handleNewTicketChange("title", e.target.value)}
                              placeholder="Enter ticket title..."
                              className="bg-white text-gray-900 border-gray-300 placeholder:text-gray-500"
                            />
                          </div>
                          <div>
                            <Label className="text-sm font-medium text-gray-700">Description (Optional)</Label>
                            <Textarea
                              value={newTicket.description}
                              onChange={(e) => handleNewTicketChange("description", e.target.value)}
                              placeholder="Enter ticket description..."
                              className="min-h-[60px] bg-white text-gray-900 border-gray-300 placeholder:text-gray-500"
                            />
                          </div>
                        </>
                      )}

                      {/* Task Assignment */}
                      <div>
                        <Label className="text-sm font-medium text-gray-700">Assign to Subtask</Label>
                        <Select
                          value={newTicket.assignedTaskId}
                          onValueChange={(value) => handleNewTicketChange("assignedTaskId", value)}
                        >
                          <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                            <SelectValue placeholder="Select a subtask with hours" />
                          </SelectTrigger>
                          <SelectContent>
                            {tasksWithHours.map((task) => (
                              <SelectItem key={task.subtaskId} value={task.subtaskId}>
                                <div className="flex flex-col">
                                  <span className="font-medium">{task.subtaskTitle}</span>
                                  <span className="text-xs text-gray-500">
                                    {task.projectTitle} / {task.taskTitle} - {task.hours}h
                                  </span>
                                </div>
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>

                      {/* Hour Allocation */}
                      {newTicket.assignedTaskId && (
                        <div>
                          <Label className="text-sm font-medium text-gray-700 mb-2 block">
                            Allocate Hours: {newTicket.allocatedHours?.toFixed(1) || "0.0"}h
                          </Label>
                          <div className="px-2">
                            <Slider
                              value={[newTicket.allocatedHours || 0]}
                              onValueChange={(value) => handleNewTicketChange("allocatedHours", value[0])}
                              max={
                                tasksWithHours.find((t) => t.subtaskId === newTicket.assignedTaskId)?.totalHours || 8
                              }
                              min={0}
                              step={0.1}
                              className="w-full"
                            />
                            <div className="flex justify-between text-xs text-gray-500 mt-1">
                              <span>0h</span>
                              <span>
                                {tasksWithHours
                                  .find((t) => t.subtaskId === newTicket.assignedTaskId)
                                  ?.totalHours?.toFixed(1) || "8.0"}
                                h
                              </span>
                            </div>
                          </div>
                        </div>
                      )}

                      <Button
                        onClick={addTicket}
                        disabled={
                          (newTicket.isExistingTicket && !newTicket.existingTicketId) ||
                          (!newTicket.isExistingTicket && !newTicket.title.trim())
                        }
                        size="sm"
                        className="bg-[#0051FF] hover:bg-[#0051FF]/90 text-white w-full"
                      >
                        <Plus className="h-3 w-3 mr-1" />
                        {newTicket.isExistingTicket ? "Assign Existing Ticket" : "Create New Ticket"}
                      </Button>
                    </div>
                  </div>
                )}

                {/* No entries message */}
                {dayEntries.length === 0 && (
                  <div className="text-center py-4 text-gray-500">
                    <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                    <p className="text-sm">No time entries for this day</p>
                    <p className="text-xs">Add time entries to enable comments and tickets</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex justify-between">
          <div className="flex items-center">
            {hasChanges && (
              <div className="text-yellow-600 text-sm flex items-center mr-4">
                <span className="w-3 h-3 bg-yellow-400 rounded-full mr-2"></span>
                You have unsaved changes
              </div>
            )}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
              className="bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button
              onClick={saveChanges}
              disabled={!hasChanges || isSaving}
              className="bg-green-600 hover:bg-green-700 text-white disabled:bg-gray-400 disabled:cursor-not-allowed"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes
                </>
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
