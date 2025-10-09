import { NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getSupabaseServerActionClient } from "@/lib/supabase/server"
import { formatDate } from "@/lib/time-utils"

export async function GET(request: Request) {
  try {
    // Get the current user
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const startDateParam = searchParams.get("startDate")
    const endDateParam = searchParams.get("endDate")
    const specificDate = searchParams.get("date")

    // Get the Supabase client
    const supabase = getSupabaseServerActionClient()

    // Get all timesheet entries for the user
    const { data: allEntries, error: entriesError } = await supabase
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", currentUser.email)

    if (entriesError) {
      return NextResponse.json({ error: `Error fetching entries: ${entriesError.message}` }, { status: 500 })
    }

    // Get all subtasks the user has access to
    const { data: userSubtasks, error: subtasksError } = await supabase
      .from("user_subtasks")
      .select("subtask_id")
      .eq("user_email", currentUser.email)

    if (subtasksError) {
      return NextResponse.json({ error: `Error fetching user subtasks: ${subtasksError.message}` }, { status: 500 })
    }

    // Create a set of subtask IDs the user has access to
    const accessibleSubtaskIds = new Set(userSubtasks.map((us) => us.subtask_id))

    // Filter entries based on date range or specific date
    let filteredEntries = [...allEntries]

    if (specificDate) {
      // Filter for a specific date
      const dateObj = new Date(specificDate)
      const formattedDate = formatDate(dateObj)
      filteredEntries = allEntries.filter((entry) => entry.date === formattedDate)
    } else if (startDateParam && endDateParam) {
      // Filter for a date range
      const startDate = new Date(startDateParam)
      const endDate = new Date(endDateParam)
      filteredEntries = allEntries.filter((entry) => {
        const entryDate = new Date(entry.date)
        return entryDate >= startDate && entryDate <= endDate
      })
    }

    // Identify orphaned entries (entries for subtasks the user no longer has access to)
    const orphanedEntries = filteredEntries.filter((entry) => !accessibleSubtaskIds.has(entry.subtask_id))

    // Group entries by date for easier analysis
    const entriesByDate = filteredEntries.reduce((acc, entry) => {
      if (!acc[entry.date]) {
        acc[entry.date] = []
      }
      acc[entry.date].push(entry)
      return acc
    }, {})

    // Calculate total hours per date
    const totalsByDate = {}
    Object.entries(entriesByDate).forEach(([date, entries]) => {
      totalsByDate[date] = entries.reduce((total, entry) => {
        const [hours, minutes] = entry.hours.split(":").map(Number)
        return total + hours + minutes / 60
      }, 0)
    })

    return NextResponse.json({
      user: currentUser.email,
      totalEntries: allEntries.length,
      filteredEntries: filteredEntries.length,
      orphanedEntries,
      entriesByDate,
      totalsByDate,
      accessibleSubtaskIds: Array.from(accessibleSubtaskIds),
    })
  } catch (error) {
    console.error("Error in timesheet-diagnostics API:", error)
    return NextResponse.json(
      { error: `Error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}

export async function DELETE(request: Request) {
  try {
    // Get the current user
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    // Only admins can delete entries
    if (!currentUser.isAdmin) {
      return NextResponse.json({ error: "Only admins can delete orphaned entries" }, { status: 403 })
    }

    const body = await request.json()
    const { entryIds } = body

    if (!entryIds || !Array.isArray(entryIds) || entryIds.length === 0) {
      return NextResponse.json({ error: "No entry IDs provided" }, { status: 400 })
    }

    // Get the Supabase client
    const supabase = getSupabaseServerActionClient()

    // Delete the specified entries
    const { error } = await supabase.from("timesheet_entries").delete().in("id", entryIds)

    if (error) {
      return NextResponse.json({ error: `Error deleting entries: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      message: `Successfully deleted ${entryIds.length} entries`,
      deletedIds: entryIds,
    })
  } catch (error) {
    console.error("Error in timesheet-diagnostics DELETE API:", error)
    return NextResponse.json(
      { error: `Error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
