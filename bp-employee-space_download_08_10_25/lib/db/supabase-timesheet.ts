import { v4 as uuidv4 } from "uuid"
import type { TimeEntry, TimesheetRow } from "../timesheet-types"
import { getSupabaseServerActionClient } from "../supabase/server"
import { debugDateInfo, formatDate } from "../time-utils"

// Add a retry utility function at the top of the file, after the imports
async function retryOperation<T>(operation: () => Promise<T>, maxRetries = 3, delay = 1000): Promise<T> {
  let lastError: any

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error) {
      lastError = error
      console.log(`Operation failed (attempt ${attempt}/${maxRetries}):`, error)

      // Check if this is a rate limit error
      const isRateLimit =
        error instanceof Error && (error.message.includes("Too Many") || error.message.includes("429"))

      if (attempt === maxRetries || !isRateLimit) {
        break
      }

      // Exponential backoff with jitter
      const backoffDelay = delay * Math.pow(2, attempt - 1) * (0.5 + Math.random() * 0.5)
      console.log(`Retrying after ${backoffDelay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, backoffDelay))
    }
  }

  throw lastError
}

function deduplicateEntries(entries: TimeEntry[]): TimeEntry[] {
  const seen = new Map<string, TimeEntry>()

  for (const entry of entries) {
    const key = `${entry.userId}-${entry.subtaskId}-${entry.date}`
    const existing = seen.get(key)

    // Keep the most recently updated entry
    if (!existing || new Date(entry.updatedAt) > new Date(existing.updatedAt)) {
      seen.set(key, entry)
    }
  }

  return Array.from(seen.values())
}

// Get all timesheet entries for a user
export async function getTimeEntries(userEmail: string): Promise<TimeEntry[]> {
  console.log(`Getting timesheet entries for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const { data, error } = await supabase
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", userEmail)
      .order("date", { ascending: false })

    if (error) {
      console.error("Error fetching timesheet entries:", error)
      return []
    }

    const entries = data.map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      projectId: entry.project_id,
      taskId: entry.task_id,
      subtaskId: entry.subtask_id,
      date: entry.date,
      hours: entry.hours,
      notes: entry.notes || undefined,
      createdAt: new Date(entry.created_at),
      updatedAt: new Date(entry.updated_at),
    })) as TimeEntry[]

    console.log(`Retrieved ${entries.length} timesheet entries for user ${userEmail}`)
    return entries
  } catch (error) {
    console.error(`Error in getTimeEntries for user ${userEmail}:`, error)
    return []
  }
}

// Get timesheet entries for a specific week
export async function getTimeEntriesForWeek(
  userEmail: string,
  startDate: string,
  endDate: string,
): Promise<TimeEntry[]> {
  console.log(`Getting timesheet entries for user ${userEmail} from ${startDate} to ${endDate}`)
  debugDateInfo(startDate, "Start date")
  debugDateInfo(endDate, "End date")

  const supabase = getSupabaseServerActionClient()

  try {
    return await retryOperation(async () => {
      // Use date range filter in the query instead of fetching all entries
      const { data, error } = await supabase
        .from("timesheet_entries")
        .select("*")
        .eq("user_id", userEmail)
        .gte("date", startDate)
        .lte("date", endDate)
        .order("date", { ascending: true })
        .order("updated_at", { ascending: false }) // Order by updated_at to get latest first

      if (error) {
        console.error("Error fetching timesheet entries for week:", error)
        throw error
      }

      console.log(`Retrieved ${data.length} raw entries for week`)

      const entries = data.map((entry) => ({
        id: entry.id,
        userId: entry.user_id,
        projectId: entry.project_id,
        taskId: entry.task_id,
        subtaskId: entry.subtask_id,
        date: entry.date,
        hours: entry.hours,
        notes: entry.notes || undefined,
        createdAt: new Date(entry.created_at),
        updatedAt: new Date(entry.updated_at),
      })) as TimeEntry[]

      const deduplicatedEntries = deduplicateEntries(entries)

      if (entries.length !== deduplicatedEntries.length) {
        console.log(`Removed ${entries.length - deduplicatedEntries.length} duplicate entries`)
      }

      console.log(`Returning ${deduplicatedEntries.length} deduplicated timesheet entries`)

      return deduplicatedEntries
    })
  } catch (error) {
    console.error(`All retries failed for getTimeEntriesForWeek(${userEmail}):`, error)
    return []
  }
}

// Add or update a timesheet entry
export async function upsertTimeEntry(
  userEmail: string,
  projectId: string,
  taskId: string,
  subtaskId: string,
  date: string,
  hours: string,
  notes?: string,
): Promise<TimeEntry | null> {
  console.log(`Upserting timesheet entry for user ${userEmail}, date ${date}, hours ${hours}`)
  debugDateInfo(date, "Date to upsert")

  const supabase = getSupabaseServerActionClient()

  try {
    // Ensure consistent date format
    const dateObj = new Date(date)
    const formattedDate = formatDate(dateObj)

    console.log(`Original date: ${date}, Formatted date: ${formattedDate}`)

    // Check if entry already exists
    const { data: existingEntries, error: fetchError } = await supabase
      .from("timesheet_entries")
      .select("id")
      .eq("user_id", userEmail)
      .eq("subtask_id", subtaskId)
      .eq("date", formattedDate)

    if (fetchError) {
      console.error("Error checking for existing timesheet entry:", fetchError)
      return null
    }

    console.log(`Found ${existingEntries?.length || 0} existing entries for this date/subtask`)

    const now = new Date().toISOString()
    let result

    if (existingEntries && existingEntries.length > 0) {
      // Update existing entry
      const entryId = existingEntries[0].id
      console.log(`Updating existing entry ${entryId} for date ${formattedDate}`)

      const { data, error } = await supabase
        .from("timesheet_entries")
        .update({
          hours,
          notes,
          updated_at: now,
        })
        .eq("id", entryId)
        .select()
        .single()

      if (error) {
        console.error(`Error updating timesheet entry ${entryId}:`, error)
        return null
      }

      result = data
      console.log(`Updated timesheet entry: ${entryId}`)
    } else {
      const { data: allOldEntries, error: oldEntriesError } = await supabase
        .from("timesheet_entries")
        .select("id")
        .eq("user_id", userEmail)
        .eq("subtask_id", subtaskId)
        .eq("date", formattedDate)

      if (oldEntriesError) {
        console.error("Error checking for old entries:", oldEntriesError)
      }

      // Create new entry
      const entryId = uuidv4()
      console.log(`Creating new entry ${entryId} for date ${formattedDate}`)

      const { data, error } = await supabase
        .from("timesheet_entries")
        .insert({
          id: entryId,
          user_id: userEmail,
          project_id: projectId,
          task_id: taskId,
          subtask_id: subtaskId,
          date: formattedDate,
          hours,
          notes,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating timesheet entry:", error)
        return null
      }

      result = data
      console.log(`Created timesheet entry: ${entryId}`)

      if (allOldEntries && allOldEntries.length > 0) {
        const oldEntryIds = allOldEntries.map((entry) => entry.id)
        console.log(`Checking for tickets linked to old entries: ${oldEntryIds.join(", ")}`)

        const { data: ticketsToUpdate, error: ticketsError } = await supabase
          .from("tickets")
          .select("id, timesheet_entry_id")
          .in("timesheet_entry_id", oldEntryIds)

        if (ticketsError) {
          console.error("Error finding tickets to update:", ticketsError)
        } else if (ticketsToUpdate && ticketsToUpdate.length > 0) {
          console.log(`Found ${ticketsToUpdate.length} tickets to update`)

          // Update all tickets to point to the new entry
          const { error: updateTicketsError } = await supabase
            .from("tickets")
            .update({
              timesheet_entry_id: entryId,
              updated_at: now,
            })
            .in("timesheet_entry_id", oldEntryIds)

          if (updateTicketsError) {
            console.error("Error updating ticket links:", updateTicketsError)
          } else {
            console.log(`Successfully updated ${ticketsToUpdate.length} tickets to link to new entry ${entryId}`)
          }
        }
      }
    }

    return {
      id: result.id,
      userId: result.user_id,
      projectId: result.project_id,
      taskId: result.task_id,
      subtaskId: result.subtask_id,
      date: result.date,
      hours: result.hours,
      notes: result.notes || undefined,
      createdAt: new Date(result.created_at),
      updatedAt: new Date(result.updated_at),
    } as TimeEntry
  } catch (error) {
    console.error(`Error in upsertTimeEntry for user ${userEmail}:`, error)
    return null
  }
}

// Delete a timesheet entry
export async function deleteTimeEntry(entryId: string): Promise<boolean> {
  console.log(`Deleting timesheet entry: ${entryId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const { error } = await supabase.from("timesheet_entries").delete().eq("id", entryId)

    if (error) {
      console.error(`Error deleting timesheet entry ${entryId}:`, error)
      return false
    }

    console.log(`Deleted timesheet entry: ${entryId}`)
    return true
  } catch (error) {
    console.error(`Error in deleteTimeEntry(${entryId}):`, error)
    return false
  }
}

// Get timesheet rows for a user
export async function getTimesheetRows(userEmail: string): Promise<TimesheetRow[]> {
  console.log(`Getting timesheet rows for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    return await retryOperation(async () => {
      try {
        const { data, error } = await supabase
          .from("timesheet_rows")
          .select("*")
          .eq("user_id", userEmail)
          .order("created_at", { ascending: false })

        if (error) {
          console.error("Error fetching timesheet rows:", error)
          return []
        }

        const rows = data.map((row) => ({
          id: row.id,
          userId: row.user_id,
          projectId: row.project_id,
          taskId: row.task_id,
          subtaskId: row.subtask_id,
          projectTitle: row.project_title,
          taskTitle: row.task_title,
          subtaskTitle: row.subtask_title,
        })) as TimesheetRow[]

        console.log(`Retrieved ${rows.length} timesheet rows for user ${userEmail}`)
        return rows
      } catch (error) {
        // Improve error logging to capture more details
        if (error instanceof Error) {
          console.error(`Error in getTimesheetRows for user ${userEmail}:`, {
            message: error.message,
            stack: error.stack,
            name: error.name,
          })
        } else {
          console.error(`Unknown error in getTimesheetRows for user ${userEmail}:`, error)
        }
        throw error // Rethrow to allow retry
      }
    })
  } catch (finalError) {
    console.error(`All retries failed for getTimesheetRows(${userEmail}):`, finalError)
    return []
  }
}

// Add a timesheet row
export async function addTimesheetRow(
  userEmail: string,
  projectId: string,
  taskId: string,
  subtaskId: string,
  projectTitle: string,
  taskTitle: string,
  subtaskTitle: string,
): Promise<TimesheetRow | null> {
  console.log(`Adding timesheet row for user ${userEmail}, subtask ${subtaskId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // Check if row already exists
    const { data: existingRows, error: fetchError } = await supabase
      .from("timesheet_rows")
      .select("id")
      .eq("user_id", userEmail)
      .eq("project_id", projectId)
      .eq("task_id", taskId)
      .eq("subtask_id", subtaskId)

    if (fetchError) {
      console.error("Error checking for existing timesheet row:", fetchError)
      return null
    }

    if (existingRows && existingRows.length > 0) {
      console.log(`Timesheet row already exists for subtask ${subtaskId}`)
      return {
        id: existingRows[0].id,
        userId: userEmail,
        projectId,
        taskId,
        subtaskId,
        projectTitle,
        taskTitle,
        subtaskTitle,
      }
    }

    const rowId = uuidv4()
    const now = new Date().toISOString()

    const { data, error } = await supabase
      .from("timesheet_rows")
      .insert({
        id: rowId,
        user_id: userEmail,
        project_id: projectId,
        task_id: taskId,
        subtask_id: subtaskId,
        project_title: projectTitle,
        task_title: taskTitle,
        subtask_title: subtaskTitle,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating timesheet row:", error)
      return null
    }

    console.log(`Created timesheet row: ${rowId}`)
    return {
      id: data.id,
      userId: data.user_id,
      projectId: data.project_id,
      taskId: data.task_id,
      subtaskId: data.subtask_id,
      projectTitle: data.project_title,
      taskTitle: data.task_title,
      subtaskTitle: data.subtask_title,
    } as TimesheetRow
  } catch (error) {
    console.error(`Error in addTimesheetRow for user ${userEmail}:`, error)
    return null
  }
}

// Remove a timesheet row
export async function removeTimesheetRow(rowId: string): Promise<boolean> {
  console.log(`Removing timesheet row: ${rowId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const { error } = await supabase.from("timesheet_rows").delete().eq("id", rowId)

    if (error) {
      console.error(`Error removing timesheet row ${rowId}:`, error)
      return false
    }

    console.log(`Removed timesheet row: ${rowId}`)
    return true
  } catch (error) {
    console.error(`Error in removeTimesheetRow(${rowId}):`, error)
    return false
  }
}
