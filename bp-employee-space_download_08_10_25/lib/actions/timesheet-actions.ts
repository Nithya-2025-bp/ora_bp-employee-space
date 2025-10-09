"use server"

import { getProjects } from "./project-actions"
import type { Project, Task, Subtask } from "../task-types"
import type { TimeEntry, TimesheetRow } from "../timesheet-types"
import { getCurrentUser } from "../auth"
import { formatDate, debugDateInfo } from "../time-utils"
import * as db from "../db/supabase-timesheet"
import { getSupabaseServerActionClient } from "../supabase/server"

// Fix the missing import for uuidv4
import { v4 as uuidv4 } from "uuid"

// Define the TimesheetSubmission interface
interface TimesheetSubmission {
  id: string
  userId: string
  startDate: string
  endDate: string
  status: string
  submittedAt: Date
  approvedBy?: string
  approvedAt?: Date
  comments?: string
  totalHours: string
}

// Update the getAvailableTimesheetRows function to remove the admin bypass

export async function getAvailableTimesheetRows(): Promise<TimesheetRow[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return []

    const userEmail = currentUser.email
    // Remove isAdmin from here since we don't want to use it for filtering

    try {
      // Get directly from the database
      const supabase = getSupabaseServerActionClient()
      console.log(`Fetching assigned subtasks for user: ${userEmail}`)

      // First, get all subtasks assigned to this user from user_subtasks table
      const { data: userAssignments, error: assignmentsError } = await supabase
        .from("user_subtasks")
        .select("subtask_id, user_email")
        .eq("user_email", userEmail)

      if (assignmentsError) {
        console.error("Error fetching user assignments:", assignmentsError)
        return []
      }

      if (!userAssignments || userAssignments.length === 0) {
        console.log(`No subtask assignments found for user ${userEmail}`)
        // Try using the projects approach as fallback
        return await getAvailableRowsFromProjects(userEmail, currentUser.isAdmin)
      }

      console.log(`Found ${userAssignments.length} subtask assignments for user ${userEmail}`)

      // Get the subtask IDs
      const subtaskIds = userAssignments.map((ua) => ua.subtask_id)

      // Get the actual subtasks
      const { data: assignedSubtasks, error: subtasksError } = await supabase
        .from("subtasks")
        .select("id, title, task_id")
        .in("id", subtaskIds)

      if (subtasksError || !assignedSubtasks) {
        console.error("Error fetching assigned subtasks:", subtasksError)
        return await getAvailableRowsFromProjects(userEmail, currentUser.isAdmin)
      }

      console.log(`Retrieved ${assignedSubtasks.length} subtasks from ${subtaskIds.length} assignments`)

      // Get the task IDs
      const taskIds = [...new Set(assignedSubtasks.map((s) => s.task_id))]

      // Get the tasks
      const { data: tasks, error: tasksError } = await supabase
        .from("tasks")
        .select("id, title, project_id")
        .in("id", taskIds)

      if (tasksError || !tasks) {
        console.error("Error fetching tasks:", tasksError)
        return await getAvailableRowsFromProjects(userEmail, currentUser.isAdmin)
      }

      // Get the project IDs
      const projectIds = [...new Set(tasks.map((t) => t.project_id))]

      // Get the projects
      const { data: projects, error: projectsError } = await supabase
        .from("projects")
        .select("id, title")
        .in("id", projectIds)

      if (projectsError || !projects) {
        console.error("Error fetching projects:", projectsError)
        return await getAvailableRowsFromProjects(userEmail, currentUser.isAdmin)
      }

      // Create a map for quick lookup
      const projectMap = new Map(projects.map((p) => [p.id, p]))
      const taskMap = new Map(tasks.map((t) => [t.id, t]))

      // Build the rows
      const rows: TimesheetRow[] = []

      for (const subtask of assignedSubtasks) {
        const task = taskMap.get(subtask.task_id)
        if (!task) continue

        const project = projectMap.get(task.project_id)
        if (!project) continue

        rows.push({
          id: `${project.id}-${task.id}-${subtask.id}`,
          userId: userEmail,
          projectId: project.id,
          taskId: task.id,
          subtaskId: subtask.id,
          projectTitle: project.title,
          taskTitle: task.title,
          subtaskTitle: subtask.title,
        })
      }

      console.log(`Built ${rows.length} timesheet rows for user ${userEmail}`)
      return rows
    } catch (error) {
      console.error("Error in direct database approach:", error)
      // Fall back to the projects approach
      return await getAvailableRowsFromProjects(userEmail, currentUser.isAdmin)
    }
  } catch (error) {
    console.error("Error in getAvailableTimesheetRows:", error)
    return []
  }
}

// Fallback approach using projects
async function getAvailableRowsFromProjects(userEmail: string, isAdmin: boolean): Promise<TimesheetRow[]> {
  console.log(`Using fallback approach to get available rows for user: ${userEmail}`)
  try {
    // Get all projects
    const projects = await getProjects(userEmail)
    const rows: TimesheetRow[] = []

    console.log(`Found ${projects.length} projects for user: ${userEmail}`)

    // Build rows from projects, tasks, and subtasks
    projects.forEach((project) => {
      project.tasks.forEach((task) => {
        task.subtasks.forEach((subtask) => {
          // Check if this subtask is assigned to the user
          const isAssignedToUser = subtask.assignedUsers && subtask.assignedUsers.includes(userEmail)

          // Include only if the subtask is assigned to the user, regardless of admin status
          if (isAssignedToUser) {
            rows.push({
              id: `${project.id}-${task.id}-${subtask.id}`,
              userId: userEmail,
              projectId: project.id,
              taskId: task.id,
              subtaskId: subtask.id,
              projectTitle: project.title,
              taskTitle: task.title,
              subtaskTitle: subtask.title,
            })
          }
        })
      })
    })

    console.log(`Built ${rows.length} timesheet rows using fallback approach`)
    return rows
  } catch (error) {
    console.error("Error getting projects for timesheet rows:", error)
    return []
  }
}

// Get a specific project, task, and subtask by their IDs
export async function getProjectTaskSubtask(
  projectId: string,
  taskId: string,
  subtaskId: string,
): Promise<{ project: Project | null; task: Task | null; subtask: Subtask | null }> {
  const projects = await getProjects()

  const project = projects.find((p) => p.id === projectId) || null
  const task = project?.tasks.find((t) => t.id === taskId) || null
  const subtask = task?.subtasks.find((s) => s.id === subtaskId) || null

  return { project, task, subtask }
}

// Get timesheet entries for a user
export async function getUserTimeEntries(): Promise<TimeEntry[]> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return []

  return await db.getTimeEntries(currentUser.email)
}

// Get timesheet entries for a specific week with special handling for Monday and Tuesday
export async function getTimeEntriesForWeek(startDate: Date): Promise<TimeEntry[]> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return []

  const endDate = new Date(startDate)
  endDate.setDate(startDate.getDate() + 6)

  // Ensure consistent date formatting
  const startDateStr = formatDate(startDate)
  const endDateStr = formatDate(endDate)

  console.log(`Getting entries from ${startDateStr} to ${endDateStr}`)
  debugDateInfo(startDate, "Start date object")
  debugDateInfo(endDate, "End date object")

  // Get entries from the database
  const entries = await db.getTimeEntriesForWeek(currentUser.email, startDateStr, endDateStr)

  // Calculate the Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, and Sunday dates for this week
  const mondayDate = new Date(startDate)
  const day = mondayDate.getDay()
  const diff = mondayDate.getDate() - day + (day === 0 ? -6 : 1)
  mondayDate.setDate(diff)

  const tuesdayDate = new Date(mondayDate)
  tuesdayDate.setDate(mondayDate.getDate() + 1)

  const wednesdayDate = new Date(mondayDate)
  wednesdayDate.setDate(mondayDate.getDate() + 2)

  const thursdayDate = new Date(mondayDate)
  thursdayDate.setDate(mondayDate.getDate() + 3)

  const fridayDate = new Date(mondayDate)
  fridayDate.setDate(mondayDate.getDate() + 4)

  const saturdayDate = new Date(mondayDate)
  saturdayDate.setDate(mondayDate.getDate() + 5)

  const sundayDate = new Date(mondayDate)
  sundayDate.setDate(mondayDate.getDate() + 6)

  const mondayStr = formatDate(mondayDate)
  const tuesdayStr = formatDate(tuesdayDate)
  const wednesdayStr = formatDate(wednesdayDate)
  const thursdayStr = formatDate(thursdayDate)
  const fridayStr = formatDate(fridayDate)
  const saturdayStr = formatDate(saturdayDate)
  const sundayStr = formatDate(sundayDate)

  console.log(`Monday date: ${mondayStr}, Tuesday date: ${tuesdayStr}, Wednesday date: ${wednesdayStr}`)
  console.log(
    `Thursday date: ${thursdayStr}, Friday date: ${fridayStr}, Saturday date: ${saturdayStr}, Sunday date: ${sundayStr}`,
  )

  // Direct database query for all days of the week
  const supabase = getSupabaseServerActionClient()

  // Get all entries for the user
  const { data: allEntries, error: allEntriesError } = await supabase
    .from("timesheet_entries")
    .select("*")
    .eq("user_id", currentUser.email)

  if (allEntriesError) {
    console.error("Error fetching all entries:", allEntriesError)
  } else if (allEntries) {
    // Find entries for each day of the week
    const dayEntries = [
      { day: "Monday", date: mondayDate, entries: [] },
      { day: "Tuesday", date: tuesdayDate, entries: [] },
      { day: "Wednesday", date: wednesdayDate, entries: [] },
      { day: "Thursday", date: thursdayDate, entries: [] },
      { day: "Friday", date: fridayDate, entries: [] },
      { day: "Saturday", date: saturdayDate, entries: [] },
      { day: "Sunday", date: sundayDate, entries: [] },
    ]

    // Process each day
    for (const dayInfo of dayEntries) {
      const dayEntries = allEntries.filter((entry) => {
        const entryDate = new Date(entry.date)
        return (
          entryDate.getFullYear() === dayInfo.date.getFullYear() &&
          entryDate.getMonth() === dayInfo.date.getMonth() &&
          entryDate.getDate() === dayInfo.date.getDate()
        )
      })

      console.log(`Found ${dayEntries.length} ${dayInfo.day} entries`)

      // Add entries for this day if they're not already in the results
      const existingIds = new Set(entries.map((e) => e.id))

      for (const entry of dayEntries) {
        if (!existingIds.has(entry.id)) {
          entries.push({
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
          })
          existingIds.add(entry.id)
          console.log(`Added ${dayInfo.day} entry: ${entry.id} for date ${entry.date}`)
        }
      }
    }
  }

  return entries
}

// Add or update a timesheet entry with improved date handling for all days
export async function upsertTimeEntry(
  projectId: string,
  taskId: string,
  subtaskId: string,
  date: string,
  hours: string,
  notes?: string,
): Promise<TimeEntry | null> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  console.log(`Upserting time entry for date: ${date}`)
  debugDateInfo(date, "Date to upsert")

  // Ensure the date is in the correct format
  const dateObj = new Date(date)
  const formattedDate = formatDate(dateObj)

  // Check if this is a Monday, Tuesday, Wednesday, Thursday, Friday, Saturday, or Sunday
  const dayOfWeek = dateObj.getDay()

  // Direct database access for all days
  const supabase = getSupabaseServerActionClient()
  const now = new Date().toISOString()

  // Check if entry already exists
  const { data: existingEntries, error: fetchError } = await supabase
    .from("timesheet_entries")
    .select("id")
    .eq("user_id", currentUser.email)
    .eq("subtask_id", subtaskId)
    .eq("date", formattedDate)

  if (fetchError) {
    console.error(`Error checking for existing entry for date ${formattedDate}:`, fetchError)
    return null
  }

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
      console.error(`Error updating entry for date ${formattedDate}:`, error)
      return null
    }

    result = data
  } else {
    const { data: allOldEntries, error: oldEntriesError } = await supabase
      .from("timesheet_entries")
      .select("id")
      .eq("user_id", currentUser.email)
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
        user_id: currentUser.email,
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
      console.error(`Error creating entry for date ${formattedDate}:`, error)
      return null
    }

    result = data

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
}

// Delete a timesheet entry
export async function deleteTimeEntry(entryId: string): Promise<boolean> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return false

  return await db.deleteTimeEntry(entryId)
}

// Get timesheet rows for the current user
export async function getUserTimesheetRows(): Promise<TimesheetRow[]> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return []

  try {
    return await db.getTimesheetRows(currentUser.email)
  } catch (error) {
    console.error(`Error in getUserTimesheetRows for user ${currentUser.email}:`, error)
    // Return empty array instead of letting the error propagate
    return []
  }
}

// Add a timesheet row
export async function addTimesheetRow(
  projectId: string,
  taskId: string,
  subtaskId: string,
  projectTitle: string,
  taskTitle: string,
  subtaskTitle: string,
): Promise<TimesheetRow | null> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return null

  return await db.addTimesheetRow(
    currentUser.email,
    projectId,
    taskId,
    subtaskId,
    projectTitle,
    taskTitle,
    subtaskTitle,
  )
}

// Remove a timesheet row
export async function removeTimesheetRow(rowId: string): Promise<boolean> {
  const currentUser = await getCurrentUser()
  if (!currentUser) return false

  return await db.removeTimesheetRow(rowId)
}

// Helper function to map database record to TimesheetSubmission interface
function mapSubmission(data: any): TimesheetSubmission {
  return {
    id: data.id,
    userId: data.user_id,
    startDate: data.start_date,
    endDate: data.end_date,
    status: data.status,
    submittedAt: new Date(data.submitted_at),
    approvedBy: data.approved_by || undefined,
    approvedAt: data.approved_at ? new Date(data.approved_at) : undefined,
    comments: data.comments || undefined,
    totalHours: data.total_hours,
  }
}
