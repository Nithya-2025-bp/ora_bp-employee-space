"use server"

import { getCurrentUser } from "../auth"
import { getSupabaseServerActionClient } from "../supabase/server"
import { getProjectById } from "./project-actions"

interface EmployeeHours {
  email: string
  totalHours: number
  subtaskBreakdown: {
    subtaskId: string
    subtaskTitle: string
    taskTitle: string
    hours: number
  }[]
}

interface TaskHours {
  taskId: string
  taskTitle: string
  totalHours: number
  subtasks: {
    subtaskId: string
    subtaskTitle: string
    hours: number
  }[]
}

interface ProjectReportData {
  project: {
    id: string
    title: string
    description?: string
    managers: string[]
  }
  dateRange: {
    startDate: string
    endDate: string
  }
  totalHours: number
  employeeBreakdown: EmployeeHours[]
  taskBreakdown: TaskHours[]
}

// Helper function to convert HH:MM format to decimal hours
function timeToDecimal(timeStr: string): number {
  if (!timeStr || timeStr === "00:00") return 0
  const [hours, minutes] = timeStr.split(":").map(Number)
  return hours + minutes / 60
}

// Helper function to convert decimal hours back to HH:MM format
function decimalToTime(decimal: number): string {
  const hours = Math.floor(decimal)
  const minutes = Math.round((decimal - hours) * 60)
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
}

export async function generateProjectReport(
  projectId: string,
  startDate: Date,
  endDate: Date,
): Promise<ProjectReportData> {
  console.log(
    `[v0] Generating project report for ${projectId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
  )

  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      throw new Error("No user found in session")
    }

    // Get project details
    const project = await getProjectById(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    // Check if user is admin or project manager
    const isProjectManager = project.managers && project.managers.includes(currentUser.email)
    if (!currentUser.isAdmin && !isProjectManager) {
      throw new Error(`User ${currentUser.email} is not authorized to generate reports for this project`)
    }

    const supabase = getSupabaseServerActionClient()

    // Format dates for database query
    const startDateStr = startDate.toISOString().split("T")[0]
    const endDateStr = endDate.toISOString().split("T")[0]

    console.log(`[v0] Querying approved submissions between ${startDateStr} and ${endDateStr}`)

    const { data: approvedSubmissions, error: submissionsError } = await supabase
      .from("timesheet_submissions")
      .select("user_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", endDateStr)
      .gte("end_date", startDateStr)

    if (submissionsError) {
      console.error("Error fetching approved submissions:", submissionsError)
      throw new Error("Failed to fetch approved submissions")
    }

    console.log(`[v0] Found ${approvedSubmissions?.length || 0} approved submissions`)
    if (approvedSubmissions && approvedSubmissions.length > 0) {
      console.log(`[v0] First submission example:`, approvedSubmissions[0])
    }

    if (!approvedSubmissions || approvedSubmissions.length === 0) {
      const { data: allSubmissions } = await supabase
        .from("timesheet_submissions")
        .select("user_id, start_date, end_date, status")
        .lte("start_date", endDateStr)
        .gte("end_date", startDateStr)

      console.log(`[v0] Total submissions in date range: ${allSubmissions?.length || 0}`)
      if (allSubmissions && allSubmissions.length > 0) {
        console.log(
          `[v0] Submission statuses:`,
          allSubmissions.map((s) => s.status),
        )
      }

      return {
        project: {
          id: project.id,
          title: project.title,
          description: project.description,
          managers: project.managers || [],
        },
        dateRange: {
          startDate: startDateStr,
          endDate: endDateStr,
        },
        totalHours: 0,
        employeeBreakdown: [],
        taskBreakdown: [],
      }
    }

    const timeEntriesPromises = approvedSubmissions.map(async (submission) => {
      const entryStartDate = startDateStr > submission.start_date ? startDateStr : submission.start_date
      const entryEndDate = endDateStr < submission.end_date ? endDateStr : submission.end_date

      console.log(`[v0] Querying entries for user ${submission.user_id} from ${entryStartDate} to ${entryEndDate}`)

      const { data: entries, error } = await supabase
        .from("timesheet_entries")
        .select("id, user_id, project_id, task_id, subtask_id, date, hours")
        .eq("project_id", projectId)
        .eq("user_id", submission.user_id)
        .gte("date", entryStartDate)
        .lte("date", entryEndDate)

      if (error) {
        console.error("Error fetching timesheet entries for submission:", error)
        return []
      }

      console.log(`[v0] Found ${entries?.length || 0} entries for user ${submission.user_id}`)
      return entries || []
    })

    const timeEntriesArrays = await Promise.all(timeEntriesPromises)
    const timeEntries = timeEntriesArrays.flat()

    console.log(`[v0] Total timesheet entries found: ${timeEntries?.length || 0}`)

    if (!timeEntries || timeEntries.length === 0) {
      const { data: allProjectEntries } = await supabase
        .from("timesheet_entries")
        .select("id, user_id, date")
        .eq("project_id", projectId)
        .gte("date", startDateStr)
        .lte("date", endDateStr)

      console.log(`[v0] Total entries for project ${projectId} in date range: ${allProjectEntries?.length || 0}`)

      return {
        project: {
          id: project.id,
          title: project.title,
          description: project.description,
          managers: project.managers || [],
        },
        dateRange: {
          startDate: startDateStr,
          endDate: endDateStr,
        },
        totalHours: 0,
        employeeBreakdown: [],
        taskBreakdown: [],
      }
    }

    // Get all unique subtask IDs from the entries
    const subtaskIds = [...new Set(timeEntries.map((entry) => entry.subtask_id))]

    // Get subtask and task information
    const { data: subtasks, error: subtasksError } = await supabase
      .from("subtasks")
      .select("id, title, task_id, tasks(id, title)")
      .in("id", subtaskIds)

    if (subtasksError) {
      console.error("Error fetching subtasks:", subtasksError)
      throw new Error("Failed to fetch subtask information")
    }

    const entryIds = timeEntries.map((entry) => entry.id)
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("timesheet_entry_id, title")
      .in("timesheet_entry_id", entryIds)

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError)
      throw new Error("Failed to fetch ticket information")
    }

    const ticketsLookup = new Map<string, string[]>()
    tickets?.forEach((ticket) => {
      const entryId = ticket.timesheet_entry_id
      if (!ticketsLookup.has(entryId)) {
        ticketsLookup.set(entryId, [])
      }
      ticketsLookup.get(entryId)!.push(ticket.title)
    })

    const subtaskLookup = new Map()
    const taskLookup = new Map()

    subtasks?.forEach((subtask) => {
      subtaskLookup.set(subtask.id, {
        title: subtask.title,
        taskId: subtask.task_id,
        taskTitle: subtask.tasks?.title || "Unknown Task",
      })

      if (subtask.tasks) {
        taskLookup.set(subtask.task_id, subtask.tasks.title)
      }
    })

    const employeeHoursMap = new Map<string, EmployeeHours>()
    const taskHoursMap = new Map<string, TaskHours>()
    let totalProjectHours = 0

    for (const entry of timeEntries) {
      const userEmail = entry.user_id
      const subtaskId = entry.subtask_id
      const subtaskInfo = subtaskLookup.get(subtaskId)

      if (!subtaskInfo) {
        console.warn(`Subtask info not found for ID: ${subtaskId}`)
        continue
      }

      const subtaskTitle = subtaskInfo.title
      const taskId = subtaskInfo.taskId
      const taskTitle = subtaskInfo.taskTitle
      const hours = timeToDecimal(entry.hours)

      totalProjectHours += hours

      if (!employeeHoursMap.has(userEmail)) {
        employeeHoursMap.set(userEmail, {
          email: userEmail,
          totalHours: 0,
          subtaskBreakdown: [],
        })
      }

      const employeeData = employeeHoursMap.get(userEmail)!
      employeeData.totalHours += hours

      let subtaskEntry = employeeData.subtaskBreakdown.find((s) => s.subtaskId === subtaskId)
      if (!subtaskEntry) {
        subtaskEntry = {
          subtaskId,
          subtaskTitle,
          taskTitle,
          hours: 0,
        }
        employeeData.subtaskBreakdown.push(subtaskEntry)
      }
      subtaskEntry.hours += hours

      if (!taskHoursMap.has(taskId)) {
        taskHoursMap.set(taskId, {
          taskId,
          taskTitle,
          totalHours: 0,
          subtasks: [],
        })
      }

      const taskData = taskHoursMap.get(taskId)!
      taskData.totalHours += hours

      let taskSubtaskEntry = taskData.subtasks.find((s) => s.subtaskId === subtaskId)
      if (!taskSubtaskEntry) {
        taskSubtaskEntry = {
          subtaskId,
          subtaskTitle,
          hours: 0,
        }
        taskData.subtasks.push(taskSubtaskEntry)
      }
      taskSubtaskEntry.hours += hours
    }

    const employeeBreakdown = Array.from(employeeHoursMap.values()).sort((a, b) => b.totalHours - a.totalHours)

    const taskBreakdown = Array.from(taskHoursMap.values()).sort((a, b) => b.totalHours - a.totalHours)

    employeeBreakdown.forEach((emp) => {
      emp.subtaskBreakdown.sort((a, b) => b.hours - a.hours)
    })

    taskBreakdown.forEach((task) => {
      task.subtasks.sort((a, b) => b.hours - a.hours)
    })

    const reportData: ProjectReportData = {
      project: {
        id: project.id,
        title: project.title,
        description: project.description,
        managers: project.managers || [],
      },
      dateRange: {
        startDate: startDateStr,
        endDate: endDateStr,
      },
      totalHours: totalProjectHours,
      employeeBreakdown,
      taskBreakdown,
    }

    console.log(
      `[v0] Generated report for project ${projectId}: ${totalProjectHours} total hours, ${employeeBreakdown.length} employees, ${taskBreakdown.length} tasks`,
    )

    return reportData
  } catch (error) {
    console.error(`[v0] Error generating project report for ${projectId}:`, error)
    throw error
  }
}

export async function generateProjectSpreadsheet(projectId: string, startDate: Date, endDate: Date): Promise<string> {
  console.log(
    `[v0] Generating spreadsheet for project ${projectId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
  )

  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      throw new Error("No user found in session")
    }

    const project = await getProjectById(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    const isProjectManager = project.managers && project.managers.includes(currentUser.email)
    if (!currentUser.isAdmin && !isProjectManager) {
      throw new Error(`User ${currentUser.email} is not authorized to generate reports for this project`)
    }

    const supabase = getSupabaseServerActionClient()

    const startDateStr = startDate.toISOString().split("T")[0]
    const endDateStr = endDate.toISOString().split("T")[0]

    const { data: approvedSubmissions, error: submissionsError } = await supabase
      .from("timesheet_submissions")
      .select("user_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", endDateStr)
      .gte("end_date", startDateStr)

    if (submissionsError) {
      console.error("Error fetching approved submissions:", submissionsError)
      throw new Error("Failed to fetch approved submissions")
    }

    if (!approvedSubmissions || approvedSubmissions.length === 0) {
      return "User,Project,Task,Subtask,Ticket,Date,Hours,Notes\n"
    }

    const timeEntriesPromises = approvedSubmissions.map(async (submission) => {
      const entryStartDate = startDateStr > submission.start_date ? startDateStr : submission.start_date
      const entryEndDate = endDateStr < submission.end_date ? endDateStr : submission.end_date

      console.log(`[v0] Querying entries for user ${submission.user_id} from ${entryStartDate} to ${entryEndDate}`)

      const { data: entries, error } = await supabase
        .from("timesheet_entries")
        .select("id, user_id, project_id, task_id, subtask_id, date, hours, notes")
        .eq("project_id", projectId)
        .eq("user_id", submission.user_id)
        .gte("date", entryStartDate)
        .lte("date", entryEndDate)

      if (error) {
        console.error("Error fetching timesheet entries for submission:", error)
        return []
      }

      console.log(`[v0] Found ${entries?.length || 0} entries for user ${submission.user_id}`)
      return entries || []
    })

    const timeEntriesArrays = await Promise.all(timeEntriesPromises)
    const timeEntries = timeEntriesArrays.flat()

    console.log(`[v0] Total timesheet entries found: ${timeEntries?.length || 0}`)

    const subtaskIds = [...new Set(timeEntries.map((entry) => entry.subtask_id))]

    const { data: subtasks, error: subtasksError } = await supabase
      .from("subtasks")
      .select("id, title, task_id, tasks(id, title)")
      .in("id", subtaskIds)

    if (subtasksError) {
      console.error("Error fetching subtasks:", subtasksError)
      throw new Error("Failed to fetch subtask information")
    }

    const entryIds = timeEntries.map((entry) => entry.id)
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("timesheet_entry_id, title")
      .in("timesheet_entry_id", entryIds)

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError)
      throw new Error("Failed to fetch ticket information")
    }

    const ticketsLookup = new Map<string, string[]>()
    tickets?.forEach((ticket) => {
      const entryId = ticket.timesheet_entry_id
      if (!ticketsLookup.has(entryId)) {
        ticketsLookup.set(entryId, [])
      }
      ticketsLookup.get(entryId)!.push(ticket.title)
    })

    const subtaskLookup = new Map()

    subtasks?.forEach((subtask) => {
      subtaskLookup.set(subtask.id, {
        title: subtask.title,
        taskId: subtask.task_id,
        taskTitle: subtask.tasks?.title || "Unknown Task",
      })
    })

    const csvRows = ["User,Project,Task,Subtask,Ticket,Date,Hours,Notes"]

    for (const entry of timeEntries) {
      const userEmail = entry.user_id
      const subtaskInfo = subtaskLookup.get(entry.subtask_id)

      if (!subtaskInfo) {
        console.warn(`Subtask info not found for ID: ${entry.subtask_id}`)
        continue
      }

      const projectTitle = project.title
      const taskTitle = subtaskInfo.taskTitle
      const subtaskTitle = subtaskInfo.title
      const ticketTitles = ticketsLookup.get(entry.id) || []
      const ticket = ticketTitles.join(", ")
      const date = entry.date
      const hours = entry.hours
      const notes = entry.notes || ""

      const escapeCsvValue = (value: string) => {
        if (value.includes(",") || value.includes('"') || value.includes("\n")) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      }

      const csvRow = [
        escapeCsvValue(userEmail),
        escapeCsvValue(projectTitle),
        escapeCsvValue(taskTitle),
        escapeCsvValue(subtaskTitle),
        escapeCsvValue(ticket),
        date,
        hours,
        escapeCsvValue(notes),
      ].join(",")

      csvRows.push(csvRow)
    }

    const csvContent = csvRows.join("\n")
    console.log(`Generated spreadsheet with ${csvRows.length - 1} entries for project ${projectId}`)

    return csvContent
  } catch (error) {
    console.error(`[v0] Error generating spreadsheet for ${projectId}:`, error)
    throw error
  }
}

export async function generateTaskSpreadsheet(
  projectId: string,
  taskId: string,
  startDate: Date,
  endDate: Date,
): Promise<string> {
  console.log(
    `Generating task spreadsheet for task ${taskId} in project ${projectId} from ${startDate.toISOString()} to ${endDate.toISOString()}`,
  )

  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      throw new Error("No user found in session")
    }

    const project = await getProjectById(projectId)
    if (!project) {
      throw new Error(`Project not found: ${projectId}`)
    }

    const isProjectManager = project.managers && project.managers.includes(currentUser.email)
    if (!currentUser.isAdmin && !isProjectManager) {
      throw new Error(`User ${currentUser.email} is not authorized to generate reports for this project`)
    }

    const supabase = getSupabaseServerActionClient()

    const startDateStr = startDate.toISOString().split("T")[0]
    const endDateStr = endDate.toISOString().split("T")[0]

    const { data: approvedSubmissions, error: submissionsError } = await supabase
      .from("timesheet_submissions")
      .select("user_id, start_date, end_date")
      .eq("status", "approved")
      .lte("start_date", endDateStr)
      .gte("end_date", startDateStr)

    if (submissionsError) {
      console.error("Error fetching approved submissions:", submissionsError)
      throw new Error("Failed to fetch approved submissions")
    }

    if (!approvedSubmissions || approvedSubmissions.length === 0) {
      return "User,Task,Subtask,Ticket,Date,Hours,Notes\n"
    }

    const timeEntriesPromises = approvedSubmissions.map(async (submission) => {
      const entryStartDate = startDateStr > submission.start_date ? startDateStr : submission.start_date
      const entryEndDate = endDateStr < submission.end_date ? endDateStr : submission.end_date

      console.log(`[v0] Querying entries for user ${submission.user_id} from ${entryStartDate} to ${entryEndDate}`)

      const { data: entries, error } = await supabase
        .from("timesheet_entries")
        .select("id, user_id, project_id, task_id, subtask_id, date, hours, notes")
        .eq("project_id", projectId)
        .eq("task_id", taskId)
        .eq("user_id", submission.user_id)
        .gte("date", entryStartDate)
        .lte("date", entryEndDate)

      if (error) {
        console.error("Error fetching timesheet entries for submission:", error)
        return []
      }
      return entries || []
    })

    const timeEntriesArrays = await Promise.all(timeEntriesPromises)
    const timeEntries = timeEntriesArrays.flat()

    if (!timeEntries || timeEntries.length === 0) {
      return "User,Task,Subtask,Ticket,Date,Hours,Notes\n"
    }

    const subtaskIds = [...new Set(timeEntries.map((entry) => entry.subtask_id))]

    const { data: subtasks, error: subtasksError } = await supabase
      .from("subtasks")
      .select("id, title, task_id, tasks(id, title)")
      .in("id", subtaskIds)

    if (subtasksError) {
      console.error("Error fetching subtasks:", subtasksError)
      throw new Error("Failed to fetch subtask information")
    }

    const entryIds = timeEntries.map((entry) => entry.id)
    const { data: tickets, error: ticketsError } = await supabase
      .from("tickets")
      .select("timesheet_entry_id, title")
      .in("timesheet_entry_id", entryIds)

    if (ticketsError) {
      console.error("Error fetching tickets:", ticketsError)
      throw new Error("Failed to fetch ticket information")
    }

    const ticketsLookup = new Map<string, string[]>()
    tickets?.forEach((ticket) => {
      const entryId = ticket.timesheet_entry_id
      if (!ticketsLookup.has(entryId)) {
        ticketsLookup.set(entryId, [])
      }
      ticketsLookup.get(entryId)!.push(ticket.title)
    })

    const subtaskLookup = new Map()

    subtasks?.forEach((subtask) => {
      subtaskLookup.set(subtask.id, {
        title: subtask.title,
        taskId: subtask.task_id,
        taskTitle: subtask.tasks?.title || "Unknown Task",
      })
    })

    const csvRows = ["User,Task,Subtask,Ticket,Date,Hours,Notes"]

    for (const entry of timeEntries) {
      const userEmail = entry.user_id
      const subtaskInfo = subtaskLookup.get(entry.subtask_id)

      if (!subtaskInfo) {
        console.warn(`Subtask info not found for ID: ${entry.subtask_id}`)
        continue
      }

      const taskTitle = subtaskInfo.taskTitle
      const subtaskTitle = subtaskInfo.title
      const ticketTitles = ticketsLookup.get(entry.id) || []
      const ticket = ticketTitles.join(", ")
      const date = entry.date
      const hours = entry.hours
      const notes = entry.notes || ""

      const escapeCsvValue = (value: string) => {
        if (value.includes(",") || value.includes('"') || value.includes("\n")) {
          return `"${value.replace(/"/g, '""')}"`
        }
        return value
      }

      const csvRow = [
        escapeCsvValue(userEmail),
        escapeCsvValue(taskTitle),
        escapeCsvValue(subtaskTitle),
        escapeCsvValue(ticket),
        date,
        hours,
        escapeCsvValue(notes),
      ].join(",")

      csvRows.push(csvRow)
    }

    const csvContent = csvRows.join("\n")
    console.log(`Generated task spreadsheet with ${csvRows.length - 1} entries for task ${taskId}`)

    return csvContent
  } catch (error) {
    console.error(`Error generating task spreadsheet for ${taskId}:`, error)
    throw error
  }
}
