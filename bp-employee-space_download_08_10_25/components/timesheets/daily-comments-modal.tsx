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
import { getWeekDates, formatDayMonth, formatDate } from "@/lib/time-utils"
import {
  getTicketsForWeek,
  saveWeeklyCommentsAndTickets,
  removeTicket as removeTicketAction,
  resolveTimeEntriesAction, // Import the new server action
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
  ticketType: "support" | "other" // Updated to match new ticket types
  createdAt: Date
  allocatedHours?: number
  assignedSubtaskId?: string
  assignedSubtaskTitle?: string
  assignedTaskTitle?: string
  assignedProjectTitle?: string
}

interface DailyData {
  date: string
  dayName: string
  entries: (TimeEntry & { projectTitle: string; taskTitle: string; subtaskTitle: string })[]
  comments: string
  tickets: Ticket[]
}

interface DailyCommentsModalProps {
  selectedDate: Date
  timesheetRows: TimesheetRow[]
  timeEntries: TimeEntry[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onCommentsUpdated?: () => void
}

interface ExistingTicket {
  id: string
  title: string
  description?: string
  ticketType: "support" | "other"
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

interface EnhancedTicket extends Ticket {
  assignedTaskId?: string
  allocatedHours?: number
}

export default function DailyCommentsModal({
  selectedDate,
  timesheetRows,
  timeEntries,
  open,
  onOpenChange,
  onCommentsUpdated,
}: DailyCommentsModalProps) {
  const [dailyData, setDailyData] = useState<DailyData[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [newTickets, setNewTickets] = useState<
    Record<
      string,
      {
        title: string
        description: string
        isExistingTicket: boolean
        existingTicketId?: string
        assignedTaskId?: string
        allocatedHours: number
        ticketType?: "support" | "other"
      }
    >
  >({})
  const [hasChanges, setHasChanges] = useState(false)
  const [originalComments, setOriginalComments] = useState<Record<string, string>>({})

  const [existingTickets, setExistingTickets] = useState<ExistingTicket[]>([])
  const [tasksWithHours, setTasksWithHours] = useState<Record<string, TaskWithHours[]>>({})
  const [loadError, setLoadError] = useState<string | null>(null)

  // Generate week dates and organize data by day
  useEffect(() => {
    if (open) {
      loadWeeklyData()
    }
  }, [open, selectedDate, timeEntries, timesheetRows])

  // Load weekly data including comments and tickets
  const loadWeeklyData = async () => {
    setIsLoading(true)
    setLoadError(null) // Clear previous errors
    try {
      const weekDates = getWeekDates(selectedDate)
      const formattedDates = weekDates.map((date) => formatDate(date))

      // Load existing tickets and tasks with hours in parallel
      const [tickets, existingTicketsData, resolvedEntriesResult] = await Promise.all([
        getTicketsForWeek(selectedDate),
        getExistingTicketsForUser(),
        resolveTimeEntriesAction(timeEntries),
      ])

      if (!resolvedEntriesResult.success) {
        setLoadError(resolvedEntriesResult.error || "Failed to resolve time entries")
        throw new Error(resolvedEntriesResult.error || "Failed to resolve time entries")
      }

      const resolvedTimeEntries = resolvedEntriesResult.data

      const tasksPromises = formattedDates.map(async (date) => {
        try {
          const dayEntries = resolvedTimeEntries.filter((entry) => entry.date === date)
          const tasksMap = new Map<string, TaskWithHours>()

          dayEntries.forEach((entry) => {
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

          return { date, tasks: Array.from(tasksMap.values()) }
        } catch (error) {
          console.error(`Error loading tasks for ${date}:`, error)
          return { date, tasks: [] }
        }
      })

      const tasksResults = await Promise.all(tasksPromises)
      const tasksMap: Record<string, TaskWithHours[]> = {}
      tasksResults.forEach(({ date, tasks }) => {
        tasksMap[date] = tasks
      })

      setExistingTickets(existingTicketsData)
      setTasksWithHours(tasksMap)

      // Organize data by day
      const organizedData: DailyData[] = weekDates.map((date, index) => {
        const formattedDate = formattedDates[index]
        const dayName = format(date, "EEEE")

        const dayEntries = resolvedTimeEntries.filter((entry) => entry.date === formattedDate)

        // Get tickets for this day's entries and enhance with subtask information
        const dayTickets = tickets
          .filter((ticket) => dayEntries.some((entry) => entry.id === ticket.timesheetEntryId))
          .map((ticket) => {
            const assignedSubtask = timesheetRows.find((row) => row.subtaskId === ticket.assignedSubtaskId)
            console.log(
              "[v0] Processing ticket:",
              ticket.id,
              "assignedSubtaskId:",
              ticket.assignedSubtaskId,
              "found subtask:",
              assignedSubtask,
            )
            return {
              ...ticket,
              assignedSubtaskId: ticket.assignedSubtaskId,
              assignedSubtaskTitle: assignedSubtask?.subtaskTitle,
              assignedTaskTitle: assignedSubtask?.taskTitle,
              assignedProjectTitle: assignedSubtask?.projectTitle,
            }
          })

        // Use the first entry's daily comments as the day's comments
        const dayComments = dayEntries[0]?.dailyComments || ""

        return {
          date: formattedDate,
          dayName,
          entries: dayEntries,
          comments: dayComments,
          tickets: dayTickets,
        }
      })

      setDailyData(organizedData)

      // Store original comments for change detection
      const originalCommentsMap: Record<string, string> = {}
      organizedData.forEach((day) => {
        originalCommentsMap[day.date] = day.comments
      })
      setOriginalComments(originalCommentsMap)
    } catch (error: any) {
      console.error("Error loading weekly data:", error)
      const errorMessage = error?.message || "Failed to load weekly data"
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

  // Handle comment changes
  const handleCommentChange = (date: string, comments: string) => {
    console.log("[v0] handleCommentChange - date:", date, "comments:", comments, "original:", originalComments[date])

    setDailyData((prev) => prev.map((day) => (day.date === date ? { ...day, comments } : day)))

    // Check if comments have changed from original
    const hasChanged = comments !== originalComments[date]
    const hasNewTickets = Object.keys(newTickets).some((key) => newTickets[key]?.title?.trim())

    console.log("[v0] hasChanged:", hasChanged, "hasNewTickets:", hasNewTickets)
    setHasChanges(hasChanged || hasNewTickets)
  }

  const handleNewTicketChange = (
    date: string,
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
    setNewTickets((prev) => {
      const current = prev[date] || {
        title: "",
        description: "",
        isExistingTicket: false,
        allocatedHours: 0,
        ticketType: "support" as const,
      }

      const updated = { ...current, [field]: value }

      // Reset related fields when switching between new/existing ticket
      if (field === "isExistingTicket") {
        if (value) {
          updated.title = ""
          updated.description = ""
          updated.ticketType = "support"
        } else {
          updated.existingTicketId = undefined
        }
      }

      return { ...prev, [date]: updated }
    })

    setHasChanges(true)
  }

  const addTicket = async (date: string) => {
    const ticketData = newTickets[date]

    // Validation for existing ticket selection
    if (ticketData?.isExistingTicket && !ticketData.existingTicketId) {
      toast({
        title: "Error",
        description: "Please select an existing ticket",
        variant: "destructive",
      })
      return
    }

    // Validation for new ticket creation
    if (!ticketData?.isExistingTicket && !ticketData?.title.trim()) {
      toast({
        title: "Error",
        description: "Ticket title is required",
        variant: "destructive",
      })
      return
    }

    // Find the first entry for this date to attach the ticket to
    const dayData = dailyData.find((day) => day.date === date)
    if (!dayData || dayData.entries.length === 0) {
      toast({
        title: "Error",
        description: "No time entries found for this day",
        variant: "destructive",
      })
      return
    }

    try {
      const result = await createEnhancedTicket(dayData.entries[0].id, {
        title: ticketData.title,
        description: ticketData.description,
        ticketType: ticketData.ticketType || "support",
        isExistingTicket: ticketData.isExistingTicket,
        existingTicketId: ticketData.existingTicketId,
        assignedTaskId: ticketData.assignedTaskId,
        allocatedHours: ticketData.allocatedHours,
      })

      if (result.success) {
        // Create a new ticket object for the UI
        let newTicket: Ticket

        if (ticketData.isExistingTicket && ticketData.existingTicketId) {
          const existingTicket = existingTickets.find((t) => t.id === ticketData.existingTicketId)
          newTicket = {
            id: ticketData.existingTicketId,
            title: existingTicket?.title || "Unknown Ticket",
            description: existingTicket?.description,
            ticketType: existingTicket?.ticketType || "support",
            createdAt: existingTicket?.createdAt || new Date(),
            allocatedHours: existingTicket?.allocatedHours,
            assignedSubtaskId: existingTicket?.assignedSubtaskId,
            assignedSubtaskTitle: existingTicket?.assignedSubtaskTitle,
            assignedTaskTitle: existingTicket?.assignedTaskTitle,
            assignedProjectTitle: existingTicket?.assignedProjectTitle,
          }
        } else {
          newTicket = {
            id: result.ticketId!,
            title: ticketData.title,
            description: ticketData.description,
            ticketType: ticketData.ticketType || "support",
            createdAt: new Date(),
            allocatedHours: ticketData.allocatedHours,
            assignedSubtaskId: ticketData.assignedTaskId,
            assignedSubtaskTitle: timesheetRows.find((row) => row.subtaskId === ticketData.assignedTaskId)
              ?.subtaskTitle,
            assignedTaskTitle: timesheetRows.find((row) => row.subtaskId === ticketData.assignedTaskId)?.taskTitle,
            assignedProjectTitle: timesheetRows.find((row) => row.subtaskId === ticketData.assignedTaskId)
              ?.projectTitle,
          }
        }

        // Update daily data with new ticket
        setDailyData((prev) =>
          prev.map((day) => (day.date === date ? { ...day, tickets: [...day.tickets, newTicket] } : day)),
        )

        // Clear new ticket form
        setNewTickets((prev) => ({
          ...prev,
          [date]: {
            title: "",
            description: "",
            isExistingTicket: false,
            allocatedHours: 0,
            ticketType: "support",
          },
        }))

        toast({
          title: "Success",
          description: ticketData.isExistingTicket
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

  // Save all changes
  const saveChanges = async () => {
    if (!hasChanges) return

    setIsSaving(true)
    try {
      // Prepare comments updates
      const commentsUpdates = []

      for (const day of dailyData) {
        if (day.comments !== originalComments[day.date] && day.entries.length > 0) {
          // Update all entries for this day with the same daily comment
          for (const entry of day.entries) {
            commentsUpdates.push({
              entryId: entry.id,
              comments: day.comments,
            })
          }
        }
      }

      // Prepare new tickets
      const newTicketsToCreate = []
      for (const [date, ticketData] of Object.entries(newTickets)) {
        if (ticketData.title?.trim()) {
          const dayData = dailyData.find((day) => day.date === date)
          if (dayData && dayData.entries.length > 0) {
            newTicketsToCreate.push({
              timesheetEntryId: dayData.entries[0].id,
              ticketData: {
                title: ticketData.title,
                description: ticketData.description,
                ticketType: ticketData.ticketType || ("support" as const),
              },
            })
          }
        }
      }

      // Save everything
      const result = await saveWeeklyCommentsAndTickets(commentsUpdates, newTicketsToCreate)

      if (result.success) {
        setHasChanges(false)
        setNewTickets({})

        // Update original comments
        const newOriginalComments: Record<string, string> = {}
        dailyData.forEach((day) => {
          newOriginalComments[day.date] = day.comments
        })
        setOriginalComments(newOriginalComments)

        onCommentsUpdated?.()

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
      console.error("Error saving changes:", error)
      toast({
        title: "Error",
        description: "Failed to save changes",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  const removeTicket = async (ticketId: string, date: string) => {
    try {
      const result = await removeTicketAction(ticketId)

      if (result.success) {
        // Update UI by removing ticket from daily data
        setDailyData((prev) =>
          prev.map((day) =>
            day.date === date ? { ...day, tickets: day.tickets.filter((ticket) => ticket.id !== ticketId) } : day,
          ),
        )

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

  const clearComments = (date: string) => {
    handleCommentChange(date, "")
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl max-h-[90vh] overflow-hidden flex flex-col bg-white text-gray-900 border border-gray-200">
        <DialogHeader>
          <DialogTitle className="text-gray-900 flex items-center">
            <MessageSquare className="h-5 w-5 mr-2" />
            Daily Comments & Tickets
          </DialogTitle>
          <DialogDescription className="text-gray-700">
            Add comments and tickets for each day of the week ({format(selectedDate, "MMM d")} -{" "}
            {format(getWeekDates(selectedDate)[6], "MMM d, yyyy")})
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
              <Button onClick={loadWeeklyData} variant="outline" className="mt-2 bg-transparent">
                <RefreshCw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              {dailyData.map((day) => (
                <div key={day.date} className="border rounded-lg p-4 bg-gray-50">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center">
                      <Calendar className="h-4 w-4 mr-2 text-gray-600" />
                      <h3 className="font-medium text-gray-900">
                        {day.dayName}, {formatDayMonth(new Date(day.date))}
                      </h3>
                      {day.entries.length > 0 && (
                        <Badge variant="outline" className="ml-2 text-gray-700 border-gray-300">
                          {day.entries
                            .reduce((total, entry) => {
                              const [hours, minutes] = entry.hours.split(":").map(Number)
                              return total + hours + minutes / 60
                            }, 0)
                            .toFixed(1)}
                          h
                        </Badge>
                      )}
                    </div>
                    {day.tickets.length > 0 && (
                      <Badge variant="outline" className="text-blue-600 border-blue-200">
                        {day.tickets.length} ticket{day.tickets.length !== 1 ? "s" : ""}
                      </Badge>
                    )}
                  </div>

                  {/* Show entries for this day */}
                  {day.entries.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Time Entries:</h4>
                      <div className="space-y-2">
                        {day.entries.map((entry) => (
                          <div key={entry.id} className="bg-white p-2 rounded border text-sm">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="font-medium text-gray-900">{entry.projectTitle}</div>
                                <div className="text-gray-600">
                                  {entry.taskTitle} / {entry.subtaskTitle}
                                </div>
                                {entry.notes && (
                                  <div className="text-blue-600 italic text-xs mt-1">"{entry.notes}"</div>
                                )}
                              </div>
                              <div className="flex items-center text-gray-600">
                                <Clock className="h-3 w-3 mr-1" />
                                <span className="font-medium">{entry.hours}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Daily Comments */}
                  <div className="mb-4">
                    <div className="flex justify-between items-center mb-2">
                      <label className="block text-sm font-medium text-gray-700">Daily Comments</label>
                      {day.comments && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => clearComments(day.date)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 px-2"
                        >
                          Clear
                        </Button>
                      )}
                    </div>
                    <Textarea
                      value={day.comments}
                      onChange={(e) => handleCommentChange(day.date, e.target.value)}
                      placeholder={
                        day.entries.length > 0 ? "Add comments for this day..." : "No time entries for this day"
                      }
                      className="min-h-[80px] bg-white text-gray-900 border-gray-300 placeholder:text-gray-500"
                      disabled={day.entries.length === 0}
                    />
                  </div>

                  {/* Existing Tickets */}
                  {day.tickets.length > 0 && (
                    <div className="mb-4">
                      <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                        <TicketIcon className="h-4 w-4 mr-1" />
                        Tickets
                      </h4>
                      <div className="space-y-2">
                        {day.tickets.map((ticket) => (
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
                                  onClick={() => removeTicket(ticket.id, day.date)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50 h-6 w-6 p-0"
                                >
                                  ×
                                </Button>
                              </div>
                            </div>
                            {ticket.description && <p className="text-sm text-gray-600 mb-2">{ticket.description}</p>}
                            {ticket.assignedSubtaskTitle && (
                              <div className="text-xs text-blue-600 mb-2 bg-blue-50 px-2 py-1 rounded">
                                <strong>Assigned to:</strong> {ticket.assignedProjectTitle} / {ticket.assignedTaskTitle}{" "}
                                / {ticket.assignedSubtaskTitle}
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

                  {day.entries.length > 0 && (
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
                            value={newTickets[day.date]?.isExistingTicket ? "existing" : "new"}
                            onValueChange={(value) =>
                              handleNewTicketChange(day.date, "isExistingTicket", value === "existing")
                            }
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
                        {newTickets[day.date]?.isExistingTicket && (
                          <div>
                            <Label className="text-sm font-medium text-gray-700">Select Existing Ticket</Label>
                            <Select
                              value={newTickets[day.date]?.existingTicketId || ""}
                              onValueChange={(value) => handleNewTicketChange(day.date, "existingTicketId", value)}
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
                        {!newTickets[day.date]?.isExistingTicket && (
                          <>
                            <div>
                              <Label className="text-sm font-medium text-gray-700">Ticket Type</Label>
                              <Select
                                value={newTickets[day.date]?.ticketType || "support"}
                                onValueChange={(value) => handleNewTicketChange(day.date, "ticketType", value)}
                              >
                                <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                                  <SelectValue placeholder="Select ticket type" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="support">Support</SelectItem>
                                  <SelectItem value="other">Other</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-gray-700">Ticket Title</Label>
                              <Input
                                value={newTickets[day.date]?.title || ""}
                                onChange={(e) => handleNewTicketChange(day.date, "title", e.target.value)}
                                placeholder="Enter ticket title..."
                                className="bg-white text-gray-900 border-gray-300 placeholder:text-gray-500"
                              />
                            </div>
                            <div>
                              <Label className="text-sm font-medium text-gray-700">Description (Optional)</Label>
                              <Textarea
                                value={newTickets[day.date]?.description || ""}
                                onChange={(e) => handleNewTicketChange(day.date, "description", e.target.value)}
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
                            value={newTickets[day.date]?.assignedTaskId || ""}
                            onValueChange={(value) => handleNewTicketChange(day.date, "assignedTaskId", value)}
                          >
                            <SelectTrigger className="bg-white text-gray-900 border-gray-300">
                              <SelectValue placeholder="Select a subtask with hours" />
                            </SelectTrigger>
                            <SelectContent>
                              {(tasksWithHours[day.date] || []).map((task) => (
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
                        {newTickets[day.date]?.assignedTaskId && (
                          <div>
                            <Label className="text-sm font-medium text-gray-700 mb-2 block">
                              Allocate Hours: {newTickets[day.date]?.allocatedHours?.toFixed(1) || "0.0"}h
                            </Label>
                            <div className="px-2">
                              <Slider
                                value={[newTickets[day.date]?.allocatedHours || 0]}
                                onValueChange={(value) => handleNewTicketChange(day.date, "allocatedHours", value[0])}
                                max={
                                  tasksWithHours[day.date]?.find(
                                    (t) => t.subtaskId === newTickets[day.date]?.assignedTaskId,
                                  )?.totalHours || 8
                                }
                                min={0}
                                step={0.1}
                                className="w-full"
                              />
                              <div className="flex justify-between text-xs text-gray-500 mt-1">
                                <span>0h</span>
                                <span>
                                  {tasksWithHours[day.date]
                                    ?.find((t) => t.subtaskId === newTickets[day.date]?.assignedTaskId)
                                    ?.totalHours?.toFixed(1) || "8.0"}
                                  h
                                </span>
                              </div>
                            </div>
                          </div>
                        )}

                        <Button
                          onClick={() => addTicket(day.date)}
                          disabled={
                            (newTickets[day.date]?.isExistingTicket && !newTickets[day.date]?.existingTicketId) ||
                            (!newTickets[day.date]?.isExistingTicket && !newTickets[day.date]?.title?.trim())
                          }
                          size="sm"
                          className="bg-[#0051FF] hover:bg-[#0051FF]/90 text-white w-full"
                        >
                          <Plus className="h-3 w-3 mr-1" />
                          {newTickets[day.date]?.isExistingTicket ? "Assign Existing Ticket" : "Create New Ticket"}
                        </Button>
                      </div>
                    </div>
                  )}

                  {/* No entries message */}
                  {day.entries.length === 0 && (
                    <div className="text-center py-4 text-gray-500">
                      <AlertCircle className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm">No time entries for this day</p>
                      <p className="text-xs">Add time entries to enable comments and tickets</p>
                    </div>
                  )}
                </div>
              ))}
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
              onClick={() => {
                console.log("[v0] Save button clicked, hasChanges:", hasChanges, "isSaving:", isSaving)
                saveChanges()
              }}
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
