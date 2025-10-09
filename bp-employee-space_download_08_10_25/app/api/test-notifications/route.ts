import { NextResponse } from "next/server"
import { getSupabaseServerActionClient } from "@/lib/supabase/server"

export async function GET() {
  try {
    const supabase = getSupabaseServerActionClient()

    // Test fetching notifications
    const { data: notifications, error } = await supabase.from("notifications").select("*").limit(10)

    if (error) {
      console.error("Error fetching notifications:", error)
      return NextResponse.json({ error: `Failed to fetch notifications: ${error.message}` }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      notifications,
      message: `Found ${notifications?.length || 0} notifications`,
    })
  } catch (error) {
    console.error("Error in test-notifications:", error)
    return NextResponse.json(
      { error: `Server error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
