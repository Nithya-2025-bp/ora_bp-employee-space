"use server"

import { getCurrentUser } from "../auth"
import { formatDate } from "../time-utils"
import { getSupabaseServerActionClient } from "../supabase/server"
import { v4 as uuidv4 } from "uuid"

// Define interfaces for the actions
interface DailyCommentsUpdate {
  entryId: string
  comments: string
}

interface TicketData {
  title: string
  description?: string
  ticketType?: "support" | "bug" | "feature" | "maintenance"
}

interface Ticket {
  id: string
  timesheetEntryId: string
  title: string
  description?: string
  ticketType: "support" | "bug" | "feature" | "maintenance"
  assignedTo?: string
  createdBy: string
  actualHours?: number
  allocatedHours?: number // Added allocated_hours
  assignedSubtaskId?: string // Added assigned_subtask_id
  dueDate?: string
  createdAt: Date
  updatedAt: Date
}

interface WeeklyTimesheetData {
  entryId: string
  userId: string
  date: string
  subtaskId: string
  hours: string
  notes?: string
  dailyComments?: string
  commentsUpdatedAt?: Date
  projectTitle: string
  taskTitle: string
  subtaskTitle: string
  tickets: Ticket[]
}

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

interface ResolvedTimeEntry extends TimeEntry {
  projectTitle: string
  taskTitle: string
  subtaskTitle: string
}

async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, timeoutMs = 15000): Promise<T> {
  let lastError: any

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      // Create timeout promise
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
      })

      // Race between operation and timeout
      const result = await Promise.race([operation(), timeoutPromise])
      return result
    } catch (error: any) {
      lastError = error

      // Check if it's a rate limit error
      const isRateLimit =
        error?.message?.includes("Too Many") ||
        error?.message?.includes("429") ||
        error?.message?.includes("not valid JSON") ||
        error?.code === "429"

      // If it's a rate limit error and we have retries left, wait and retry
      if (isRateLimit && attempt < maxRetries - 1) {
        // Exponential backoff with jitter: 1s, 2s, 4s
        const baseDelay = Math.pow(2, attempt) * 1000
        const jitter = Math.random() * 1000
        const delay = baseDelay + jitter

        console.log(
          `[v0] Rate limit detected, retrying in ${Math.round(delay)}ms (attempt ${attempt + 1}/${maxRetries})`,
        )

        await new Promise((resolve) => setTimeout(resolve, delay))
        continue
      }

      // If it's not a rate limit error or we're out of retries, throw
      if (attempt === maxRetries - 1) {
        // Provide user-friendly error messages
        if (isRateLimit) {
          throw new Error("Database is temporarily busy. Please wait a moment and try again.")
        }
        if (error?.message?.includes("timeout")) {
          throw new Error("Request timed out. Please check your connection and try again.")
        }
        throw error
      }
    }
  }

  throw lastError
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
  return withRetry(() => promise, 3, timeoutMs)
}

export async function resolveTimeEntriesAction(
  timeEntries: TimeEntry[],
): Promise<{ success: boolean; data?: ResolvedTimeEntry[]; error?: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, error: "Not authenticated" }
    }

    if (!timeEntries || timeEntries.length === 0) {
      return { success: true, data: [] }
    }

    const supabase = getSupabaseServerActionClient()

    // Get unique subtask IDs to minimize database queries
    const subtaskIds = [...new Set(timeEntries.map((entry) => entry.subtaskId))]

    const { data: subtaskDetails, error } = await withRetry(() =>
      supabase
        .from("subtasks")
        .select(`
          id,
          title,
          tasks!inner(
            id,
            title,
            projects!inner(
              id,
              title
            )
          )
        `)
        .in("id", subtaskIds),
    )

    if (error) {
      console.error("Error fetching subtask details:", error)
      return { success: false, error: "Failed to resolve time entry details" }
    }

    // Create a lookup map for quick access
    const subtaskLookup = new Map<string, { projectTitle: string; taskTitle: string; subtaskTitle: string }>()

    if (subtaskDetails) {
      subtaskDetails.forEach((subtask: any) => {
        subtaskLookup.set(subtask.id, {
          projectTitle: subtask.tasks.projects.title,
          taskTitle: subtask.tasks.title,
          subtaskTitle: subtask.title,
        })
      })
    }

    // Resolve all time entries with their details
    const resolvedEntries: ResolvedTimeEntry[] = timeEntries.map((entry) => {
      const details = subtaskLookup.get(entry.subtaskId)
      return {
        ...entry,
        projectTitle: details?.projectTitle || "Unknown Project",
        taskTitle: details?.taskTitle || "Unknown Task",
        subtaskTitle: details?.subtaskTitle || "Unknown Subtask",
      }
    })

    return { success: true, data: resolvedEntries }
  } catch (error: any) {
    console.error("Error in resolveTimeEntriesAction:", error)
    return {
      success: false,
      error: error?.message || "Failed to resolve time entry details",
    }
  }
}

// Update daily comments for a timesheet entry
export async function updateDailyComments(
  entryId: string,
  comments: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const supabase = getSupabaseServerActionClient()

    const { error } = await withTimeout(
      supabase
        .from("timesheet_entries")
        .update({
          notes: comments.trim() || null,
        })
        .eq("id", entryId)
        .eq("user_id", currentUser.email), // Ensure user can only update their own entries
    )

    if (error) {
      console.error("Error updating daily comments:", error)
      return { success: false, message: "Failed to update comments" }
    }

    return { success: true, message: "Comments updated successfully" }
  } catch (error) {
    console.error("Error in updateDailyComments:", error)
    return { success: false, message: "Failed to update comments" }
  }
}

// Update daily comments for multiple entries (batch update for a day)
export async function updateDailyCommentsForDay(
  updates: DailyCommentsUpdate[],
): Promise<{ success: boolean; message: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const supabase = getSupabaseServerActionClient()

    // Process updates in batches
    const updatePromises = updates.map(async (update) => {
      return supabase
        .from("timesheet_entries")
        .update({
          notes: update.comments.trim() || null,
        })
        .eq("id", update.entryId)
        .eq("user_id", currentUser.email)
    })

    const results = await Promise.all(updatePromises.map((promise) => withTimeout(promise)))

    const errors = results.filter((result) => result.error)
    if (errors.length > 0) {
      console.error("Errors updating daily comments:", errors)
      return { success: false, message: `Failed to update ${errors.length} comments` }
    }

    return { success: true, message: "All comments updated successfully" }
  } catch (error) {
    console.error("Error in updateDailyCommentsForDay:", error)
    return { success: false, message: "Failed to update comments" }
  }
}

// Get daily comments for a week
export async function getDailyCommentsForWeek(startDate: Date): Promise<WeeklyTimesheetData[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return []

    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + 6)

    const startDateStr = formatDate(startDate)
    const endDateStr = formatDate(endDate)

    const supabase = getSupabaseServerActionClient()

    const { data: timeEntries, error } = await withTimeout(
      supabase
        .from("timesheet_entries")
        .select("*")
        .eq("user_id", currentUser.email)
        .gte("date", startDateStr)
        .lte("date", endDateStr)
        .order("date", { ascending: true }),
    )

    if (error) {
      console.error("Error getting weekly timesheet data:", error)
      return []
    }

    if (!timeEntries || timeEntries.length === 0) return []

    // Get unique subtask IDs and fetch their details separately
    const subtaskIds = [...new Set(timeEntries.map((entry: any) => entry.subtask_id))]

    const { data: subtaskDetails, error: subtaskError } = await withTimeout(
      supabase
        .from("subtasks")
        .select(`
          id,
          title,
          tasks!inner(
            id,
            title,
            projects!inner(
              id,
              title
            )
          )
        `)
        .in("id", subtaskIds),
    )

    if (subtaskError) {
      console.error("Error getting subtask details:", subtaskError)
      return []
    }

    // Create a lookup map for subtask details
    const subtaskLookup = new Map()
    if (subtaskDetails) {
      subtaskDetails.forEach((subtask: any) => {
        subtaskLookup.set(subtask.id, {
          projectTitle: subtask.tasks.projects.title,
          taskTitle: subtask.tasks.title,
          subtaskTitle: subtask.title,
        })
      })
    }

    // Transform the data to match our interface
    return timeEntries.map((row: any) => {
      const details = subtaskLookup.get(row.subtask_id) || {
        projectTitle: "Unknown Project",
        taskTitle: "Unknown Task",
        subtaskTitle: "Unknown Subtask",
      }

      return {
        entryId: row.id,
        userId: row.user_id,
        date: row.date,
        subtaskId: row.subtask_id,
        hours: row.hours,
        notes: row.notes,
        dailyComments: row.notes, // Use notes as daily comments since daily_comments column doesn't exist
        commentsUpdatedAt: row.updated_at ? new Date(row.updated_at) : undefined,
        projectTitle: details.projectTitle,
        taskTitle: details.taskTitle,
        subtaskTitle: details.subtaskTitle,
        tickets: [], // Will be populated separately
      }
    })
  } catch (error) {
    console.error("Error in getDailyCommentsForWeek:", error)
    return []
  }
}

// Get tickets for timesheet entries in a week
export async function getTicketsForWeek(startDate: Date): Promise<Ticket[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return []

    const endDate = new Date(startDate)
    endDate.setDate(startDate.getDate() + 6)

    const startDateStr = formatDate(startDate)
    const endDateStr = formatDate(endDate)

    const supabase = getSupabaseServerActionClient()

    const { data, error } = await withTimeout(
      supabase
        .from("tickets")
        .select(`
          *,
          timesheet_entries!inner(
            id,
            user_id,
            date
          )
        `)
        .eq("timesheet_entries.user_id", currentUser.email)
        .gte("timesheet_entries.date", startDateStr)
        .lte("timesheet_entries.date", endDateStr)
        .order("created_at", { ascending: false }),
    )

    if (error) {
      console.error("Error getting tickets for week:", error)
      return []
    }

    if (!data) return []

    return data.map((ticket: any) => ({
      id: ticket.id,
      timesheetEntryId: ticket.timesheet_entry_id,
      title: ticket.title,
      description: ticket.description,
      ticketType: ticket.ticket_type,
      assignedTo: ticket.assigned_to,
      createdBy: ticket.created_by,
      actualHours: ticket.actual_hours,
      allocatedHours: ticket.allocated_hours,
      assignedSubtaskId: ticket.assigned_subtask_id,
      dueDate: ticket.due_date,
      createdAt: new Date(ticket.created_at),
      updatedAt: new Date(ticket.updated_at),
    }))
  } catch (error) {
    console.error("Error in getTicketsForWeek:", error)
    return []
  }
}

// Save weekly comments and tickets (comprehensive save function)
export async function saveWeeklyCommentsAndTickets(
  commentsUpdates: DailyCommentsUpdate[],
  newTickets: { timesheetEntryId: string; ticketData: TicketData }[],
): Promise<{ success: boolean; message: string; createdTickets?: string[] }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    // Update comments
    if (commentsUpdates.length > 0) {
      const commentsResult = await updateDailyCommentsForDay(commentsUpdates)
      if (!commentsResult.success) {
        return commentsResult
      }
    }

    // Create tickets
    const createdTickets: string[] = []
    if (newTickets.length > 0) {
      for (const ticketRequest of newTickets) {
        const ticketResult = await createTicket(ticketRequest.timesheetEntryId, ticketRequest.ticketData)
        if (ticketResult.success && ticketResult.ticketId) {
          createdTickets.push(ticketResult.ticketId)
        } else {
          console.error("Failed to create ticket:", ticketResult.message)
        }
      }
    }

    return {
      success: true,
      message: `Updated ${commentsUpdates.length} comments and created ${createdTickets.length} tickets`,
      createdTickets,
    }
  } catch (error) {
    console.error("Error in saveWeeklyCommentsAndTickets:", error)
    return { success: false, message: "Failed to save changes" }
  }
}

// Get tickets for a specific day
export async function getTicketsForDay(date: Date): Promise<Ticket[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return []

    const dateStr = formatDate(date)
    const supabase = getSupabaseServerActionClient()

    const { data, error } = await withRetry(() =>
      supabase
        .from("tickets")
        .select(`
          *,
          timesheet_entries!inner(
            id,
            user_id,
            date
          )
        `)
        .eq("timesheet_entries.user_id", currentUser.email)
        .eq("timesheet_entries.date", dateStr)
        .order("created_at", { ascending: false }),
    )

    if (error) {
      console.error("Error getting tickets for day:", error)
      return []
    }

    if (!data) return []

    return data.map((ticket: any) => ({
      id: ticket.id,
      timesheetEntryId: ticket.timesheet_entry_id,
      title: ticket.title,
      description: ticket.description,
      ticketType: ticket.ticket_type,
      assignedTo: ticket.assigned_to,
      createdBy: ticket.created_by,
      actualHours: ticket.actual_hours,
      allocatedHours: ticket.allocated_hours,
      assignedSubtaskId: ticket.assigned_subtask_id,
      dueDate: ticket.due_date,
      createdAt: new Date(ticket.created_at),
      updatedAt: new Date(ticket.updated_at),
    }))
  } catch (error) {
    console.error("Error in getTicketsForDay:", error)
    return []
  }
}

// Save comments and tickets for a single day
export async function saveDayCommentsAndTickets(
  commentsUpdates: DailyCommentsUpdate[],
  newTickets: { timesheetEntryId: string; ticketData: TicketData }[],
): Promise<{ success: boolean; message: string; createdTickets?: string[] }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    // Update comments
    if (commentsUpdates.length > 0) {
      const commentsResult = await updateDailyCommentsForDay(commentsUpdates)
      if (!commentsResult.success) {
        return commentsResult
      }
    }

    // Create tickets
    const createdTickets: string[] = []
    if (newTickets.length > 0) {
      for (const ticketRequest of newTickets) {
        const ticketResult = await createTicket(ticketRequest.timesheetEntryId, ticketRequest.ticketData)
        if (ticketResult.success && ticketResult.ticketId) {
          createdTickets.push(ticketResult.ticketId)
        } else {
          console.error("Failed to create ticket:", ticketResult.message)
        }
      }
    }

    return {
      success: true,
      message: `Updated ${commentsUpdates.length} comments and created ${createdTickets.length} tickets`,
      createdTickets,
    }
  } catch (error) {
    console.error("Error in saveDayCommentsAndTickets:", error)
    return { success: false, message: "Failed to save changes" }
  }
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

interface EnhancedTicketData extends TicketData {
  assignedTaskId?: string
  allocatedHours?: number
  isExistingTicket?: boolean
  existingTicketId?: string
}

export async function getExistingTicketsForUser(): Promise<ExistingTicket[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return []

    const supabase = getSupabaseServerActionClient()

    // This avoids complex joins that might fail with RLS
    const { data: tickets, error: ticketsError } = await withRetry(() =>
      supabase
        .from("tickets")
        .select(`
          id,
          title,
          description,
          ticket_type,
          created_at,
          timesheet_entry_id
        `)
        .eq("created_by", currentUser.email)
        .order("created_at", { ascending: false })
        .limit(50),
    )

    console.log("[v0] getExistingTicketsForUser: Found", tickets?.length || 0, "tickets for", currentUser.email)

    if (ticketsError) {
      console.error("[v0] Error getting tickets:", ticketsError)
      return []
    }

    if (!tickets || !Array.isArray(tickets) || tickets.length === 0) {
      console.log("[v0] No tickets found for user")
      return []
    }

    const ticketEntryIds = tickets.map((ticket) => ticket.timesheet_entry_id)
    const { data: entriesWithDetails, error: detailsError } = await withRetry(() =>
      supabase
        .from("timesheet_entries")
        .select(`
          id,
          date,
          subtask_id
        `)
        .in("id", ticketEntryIds),
    )

    if (detailsError || !entriesWithDetails) {
      console.error("[v0] Error getting entry details:", detailsError)
      return []
    }

    const subtaskIds = [...new Set(entriesWithDetails.map((entry: any) => entry.subtask_id))]
    const { data: subtaskDetails, error: subtaskError } = await withRetry(() =>
      supabase
        .from("subtasks")
        .select(`
          id,
          title,
          tasks!inner(
            id,
            title,
            projects!inner(
              id,
              title
            )
          )
        `)
        .in("id", subtaskIds),
    )

    // Create lookup maps
    const entryLookup = new Map()
    entriesWithDetails.forEach((entry: any) => {
      entryLookup.set(entry.id, entry)
    })

    const subtaskLookup = new Map()
    if (subtaskDetails) {
      subtaskDetails.forEach((subtask: any) => {
        subtaskLookup.set(subtask.id, {
          projectTitle: subtask.tasks.projects.title,
          taskTitle: subtask.tasks.title,
          subtaskTitle: subtask.title,
        })
      })
    }

    const result = tickets.map((ticket: any) => {
      const entry = entryLookup.get(ticket.timesheet_entry_id)
      const details = entry ? subtaskLookup.get(entry.subtask_id) : null

      return {
        id: ticket.id,
        title: ticket.title,
        description: ticket.description,
        ticketType: ticket.ticket_type,
        createdAt: new Date(ticket.created_at),
        timesheetEntryDate: entry?.date || "Unknown",
        projectTitle: details?.projectTitle || "Unknown Project",
        taskTitle: details?.taskTitle || "Unknown Task",
        subtaskTitle: details?.subtaskTitle || "Unknown Subtask",
      }
    })

    console.log("[v0] Returning", result.length, "tickets with details")
    return result
  } catch (error: any) {
    console.error("[v0] Error in getExistingTicketsForUser:", error)
    return []
  }
}

export async function getTasksWithHoursForDate(date: string): Promise<TaskWithHours[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return []

    const supabase = getSupabaseServerActionClient()

    const { data: timeEntries, error } = await withTimeout(
      supabase.from("timesheet_entries").select("subtask_id, hours").eq("user_id", currentUser.email).eq("date", date),
    )

    if (error) {
      console.error("Error getting tasks with hours:", error)
      return []
    }

    if (!timeEntries || timeEntries.length === 0) return []

    // Get unique subtask IDs and fetch their details
    const subtaskIds = [...new Set(timeEntries.map((entry: any) => entry.subtask_id))]

    const { data: subtaskDetails, error: subtaskError } = await withTimeout(
      supabase
        .from("subtasks")
        .select(`
          id,
          title,
          tasks!inner(
            id,
            title,
            projects!inner(
              id,
              title
            )
          )
        `)
        .in("id", subtaskIds),
    )

    if (subtaskError) {
      console.error("Error getting subtask details:", subtaskError)
      return []
    }

    // Create lookup map
    const subtaskLookup = new Map()
    if (subtaskDetails) {
      subtaskDetails.forEach((subtask: any) => {
        subtaskLookup.set(subtask.id, {
          projectTitle: subtask.tasks.projects.title,
          taskTitle: subtask.tasks.title,
          subtaskTitle: subtask.title,
        })
      })
    }

    // Group by subtask and sum hours
    const tasksMap = new Map<string, TaskWithHours>()

    timeEntries.forEach((entry: any) => {
      const subtaskId = entry.subtask_id
      const details = subtaskLookup.get(subtaskId)

      if (!details) return // Skip if we can't find subtask details

      const [hours, minutes] = entry.hours.split(":").map(Number)
      const totalHours = hours + minutes / 60

      if (tasksMap.has(subtaskId)) {
        const existing = tasksMap.get(subtaskId)!
        existing.totalHours += totalHours
        const newHours = Math.floor(existing.totalHours)
        const newMinutes = Math.round((existing.totalHours % 1) * 60)
        existing.hours = `${newHours}:${newMinutes.toString().padStart(2, "0")}`
      } else {
        tasksMap.set(subtaskId, {
          subtaskId: subtaskId,
          projectTitle: details.projectTitle,
          taskTitle: details.taskTitle,
          subtaskTitle: details.subtaskTitle,
          hours: entry.hours,
          totalHours: totalHours,
        })
      }
    })

    return Array.from(tasksMap.values())
  } catch (error) {
    console.error("Error in getTasksWithHoursForDate:", error)
    return []
  }
}

export async function removeTicket(ticketId: string): Promise<{ success: boolean; message: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const supabase = getSupabaseServerActionClient()

    const { data: tickets, error: ticketError } = await withTimeout(
      supabase.from("tickets").select("id, created_by").eq("id", ticketId),
    )

    if (ticketError) {
      console.error("Error fetching ticket:", ticketError)
      return { success: false, message: "Failed to fetch ticket" }
    }

    if (!tickets || tickets.length === 0) {
      return { success: false, message: "Ticket not found" }
    }

    const ticket = tickets[0]
    if (ticket.created_by !== currentUser.email) {
      return { success: false, message: "Access denied" }
    }

    const { error } = await withTimeout(supabase.from("tickets").delete().eq("id", ticketId))

    if (error) {
      console.error("Error removing ticket:", error)
      return { success: false, message: "Failed to remove ticket" }
    }

    return { success: true, message: "Ticket removed successfully" }
  } catch (error) {
    console.error("Error in removeTicket:", error)
    return { success: false, message: "Failed to remove ticket" }
  }
}

export async function createEnhancedTicket(
  timesheetEntryId: string,
  ticketData: EnhancedTicketData,
): Promise<{ success: boolean; message: string; ticketId?: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const supabase = getSupabaseServerActionClient()

    // If using existing ticket, just link it to the timesheet entry
    if (ticketData.isExistingTicket && ticketData.existingTicketId) {
      // Verify the existing ticket belongs to the user
      const { data: existingTicket, error: ticketError } = await withTimeout(
        supabase.from("tickets").select("id, created_by").eq("id", ticketData.existingTicketId).single(),
      )

      if (ticketError || !existingTicket) {
        return { success: false, message: "Existing ticket not found" }
      }

      if (existingTicket.created_by !== currentUser.email) {
        return { success: false, message: "Access denied to existing ticket" }
      }

      // Update the existing ticket with new assignment and hours
      const { error: updateError } = await withTimeout(
        supabase
          .from("tickets")
          .update({
            timesheet_entry_id: timesheetEntryId,
            assigned_subtask_id: ticketData.assignedTaskId, // This is actually a subtask ID
            allocated_hours: ticketData.allocatedHours || 0,
            updated_at: new Date().toISOString(),
          })
          .eq("id", ticketData.existingTicketId),
      )

      if (updateError) {
        console.error("Error updating existing ticket:", updateError)
        return { success: false, message: "Failed to assign existing ticket" }
      }

      return {
        success: true,
        message: "Existing ticket assigned successfully",
        ticketId: ticketData.existingTicketId,
      }
    }

    // Verify the timesheet entry belongs to the current user
    const { data: entry, error: entryError } = await withTimeout(
      supabase
        .from("timesheet_entries")
        .select("id, user_id")
        .eq("id", timesheetEntryId)
        .eq("user_id", currentUser.email)
        .single(),
    )

    if (entryError || !entry) {
      return { success: false, message: "Timesheet entry not found or access denied" }
    }

    const ticketId = uuidv4()
    const now = new Date().toISOString()

    const validTicketType = ticketData.ticketType === "other" ? "support" : ticketData.ticketType || "support"

    const { error } = await withTimeout(
      supabase.from("tickets").insert({
        id: ticketId,
        timesheet_entry_id: timesheetEntryId,
        title: ticketData.title,
        description: ticketData.description,
        ticket_type: validTicketType,
        assigned_subtask_id: ticketData.assignedTaskId, // This is actually a subtask ID
        allocated_hours: ticketData.allocatedHours || 0,
        created_by: currentUser.email,
        created_at: now,
        updated_at: now,
      }),
    )

    if (error) {
      console.error("Error creating enhanced ticket:", error)
      return { success: false, message: "Failed to create ticket" }
    }

    return { success: true, message: "Ticket created successfully", ticketId }
  } catch (error) {
    console.error("Error in createEnhancedTicket:", error)
    return { success: false, message: "Failed to create ticket" }
  }
}

// Create a new ticket for a timesheet entry
export async function createTicket(
  timesheetEntryId: string,
  ticketData: TicketData,
): Promise<{ success: boolean; message: string; ticketId?: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    // Verify the timesheet entry belongs to the current user
    const supabase = getSupabaseServerActionClient()

    const { data: entry, error: entryError } = await withTimeout(
      supabase
        .from("timesheet_entries")
        .select("id, user_id")
        .eq("id", timesheetEntryId)
        .eq("user_id", currentUser.email)
        .single(),
    )

    if (entryError || !entry) {
      return { success: false, message: "Timesheet entry not found or access denied" }
    }

    const ticketId = uuidv4()
    const now = new Date().toISOString()

    const validTicketType = ticketData.ticketType === "other" ? "support" : ticketData.ticketType || "support"

    const { error } = await withTimeout(
      supabase.from("tickets").insert({
        id: ticketId,
        timesheet_entry_id: timesheetEntryId,
        title: ticketData.title,
        description: ticketData.description,
        ticket_type: validTicketType,
        created_by: currentUser.email,
        created_at: now,
        updated_at: now,
      }),
    )

    if (error) {
      console.error("Error creating ticket:", error)
      return { success: false, message: "Failed to create ticket" }
    }

    return { success: true, message: "Ticket created successfully", ticketId }
  } catch (error) {
    console.error("Error in createTicket:", error)
    return { success: false, message: "Failed to create ticket" }
  }
}
