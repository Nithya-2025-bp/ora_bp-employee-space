import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getSupabaseServerActionClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const supabase = getSupabaseServerActionClient()

    // Get approved submissions for the current user
    const { data: submissions, error } = await supabase
      .from("timesheet_submissions")
      .select("*")
      .eq("user_id", currentUser.email)
      .eq("status", "approved")
      .order("end_date", { ascending: false })
      .limit(10)

    if (error) {
      console.error("Error fetching approved submissions:", error)
      return NextResponse.json({ error: "Failed to fetch submissions" }, { status: 500 })
    }

    // For each submission, get the timesheet entries
    const submissionsWithEntries = await Promise.all(
      submissions.map(async (submission) => {
        // Get timesheet entries for this submission's date range
        const { data: entries, error: entriesError } = await supabase
          .from("timesheet_entries")
          .select("*")
          .eq("user_id", currentUser.email)
          .gte("date", submission.start_date)
          .lte("date", submission.end_date)

        if (entriesError) {
          console.error("Error fetching entries for submission:", entriesError)
          return {
            id: submission.id,
            startDate: submission.start_date,
            endDate: submission.end_date,
            submittedAt: new Date(submission.submitted_at),
            approvedAt: new Date(submission.approved_at),
            totalHours: submission.total_hours || "0:00",
            entries: [],
            rows: [],
          }
        }

        // Get unique subtask IDs from entries
        const subtaskIds = [...new Set(entries.map((entry) => entry.subtask_id))]

        // Get project, task, and subtask details
        const [projectsRes, tasksRes, subtasksRes] = await Promise.all([
          supabase
            .from("projects")
            .select("id, title")
            .in("id", [...new Set(entries.map((e) => e.project_id))]),
          supabase
            .from("tasks")
            .select("id, title")
            .in("id", [...new Set(entries.map((e) => e.task_id))]),
          supabase.from("subtasks").select("id, title").in("id", subtaskIds),
        ])

        // Create lookup maps
        const projectMap = new Map()
        const taskMap = new Map()
        const subtaskMap = new Map()

        if (projectsRes.data) {
          projectsRes.data.forEach((p) => projectMap.set(p.id, p.title))
        }
        if (tasksRes.data) {
          tasksRes.data.forEach((t) => taskMap.set(t.id, t.title))
        }
        if (subtasksRes.data) {
          subtasksRes.data.forEach((s) => subtaskMap.set(s.id, s.title))
        }

        // Build timesheet rows from unique subtasks
        const rows = subtaskIds.map((subtaskId) => {
          const entry = entries.find((e) => e.subtask_id === subtaskId)
          return {
            id: crypto.randomUUID(),
            projectId: entry.project_id,
            taskId: entry.task_id,
            subtaskId: subtaskId,
            projectTitle: projectMap.get(entry.project_id) || "Unknown Project",
            taskTitle: taskMap.get(entry.task_id) || "Unknown Task",
            subtaskTitle: subtaskMap.get(subtaskId) || "Unknown Subtask",
          }
        })

        return {
          id: submission.id,
          startDate: submission.start_date,
          endDate: submission.end_date,
          submittedAt: new Date(submission.submitted_at),
          approvedAt: new Date(submission.approved_at),
          totalHours: submission.total_hours || "0:00",
          entries: entries.map((entry) => ({
            id: entry.id,
            userId: entry.user_id,
            projectId: entry.project_id,
            taskId: entry.task_id,
            subtaskId: entry.subtask_id,
            date: entry.date,
            hours: entry.hours,
            notes: entry.notes,
            createdAt: new Date(entry.created_at),
            updatedAt: new Date(entry.updated_at),
          })),
          rows,
        }
      }),
    )

    return NextResponse.json({ submissions: submissionsWithEntries })
  } catch (error) {
    console.error("Error in approved submissions API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
