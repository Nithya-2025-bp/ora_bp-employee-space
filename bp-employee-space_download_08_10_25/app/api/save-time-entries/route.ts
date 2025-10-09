import { type NextRequest, NextResponse } from "next/server"
import { getSupabaseServerActionClient } from "@/lib/supabase/server"

interface TimeEntryData {
  userId: string
  projectId: string
  taskId: string
  subtaskId: string
  date: string
  hours: string
  notes?: string
}

export async function POST(request: NextRequest) {
  try {
    const { entries }: { entries: TimeEntryData[] } = await request.json()

    if (!entries || !Array.isArray(entries)) {
      return NextResponse.json({ error: "Invalid entries data" }, { status: 400 })
    }

    const supabase = getSupabaseServerActionClient()
    const savedEntries = []
    const errors = []

    for (const entry of entries) {
      try {
        // Check if entry already exists
        const { data: existingEntries } = await supabase
          .from("timesheet_entries")
          .select("id")
          .eq("user_id", entry.userId)
          .eq("subtask_id", entry.subtaskId)
          .eq("date", entry.date)

        const now = new Date().toISOString()

        if (existingEntries && existingEntries.length > 0) {
          // Update existing entry
          const { data, error } = await supabase
            .from("timesheet_entries")
            .update({
              hours: entry.hours,
              notes: entry.notes,
              updated_at: now,
            })
            .eq("id", existingEntries[0].id)
            .select()
            .single()

          if (error) {
            console.error("Error updating time entry:", error)
            errors.push(`Failed to update entry for ${entry.subtaskId} on ${entry.date}`)
          } else if (data) {
            savedEntries.push(data)
          }
        } else {
          // Create new entry
          const entryId = crypto.randomUUID()
          const { data, error } = await supabase
            .from("timesheet_entries")
            .insert({
              id: entryId,
              user_id: entry.userId,
              project_id: entry.projectId,
              task_id: entry.taskId,
              subtask_id: entry.subtaskId,
              date: entry.date,
              hours: entry.hours,
              notes: entry.notes,
              created_at: now,
              updated_at: now,
            })
            .select()
            .single()

          if (error) {
            console.error("Error creating time entry:", error)
            errors.push(`Failed to create entry for ${entry.subtaskId} on ${entry.date}`)
          } else if (data) {
            savedEntries.push(data)
          }
        }
      } catch (err) {
        console.error("Error processing time entry:", err)
        errors.push(`Failed to process entry for ${entry.subtaskId} on ${entry.date}`)
      }
    }

    return NextResponse.json({
      success: true,
      savedCount: savedEntries.length,
      errors: errors.length > 0 ? errors : undefined,
    })
  } catch (error) {
    console.error("Error in save-time-entries API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
