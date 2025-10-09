import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getSupabaseServerActionClient } from "@/lib/supabase/server"

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = getSupabaseServerActionClient()

    // Get all non-dismissed notifications for the user
    const { data: notifications, error } = await supabase
      .from("notifications")
      .select("*")
      .eq("user_email", user.email)
      .eq("dismissed", false)
      .order("created_at", { ascending: false })
      .limit(20)

    if (error) {
      console.error("Error fetching notifications:", error)
      return NextResponse.json({ error: "Failed to fetch notifications" }, { status: 500 })
    }

    return NextResponse.json({
      notifications: notifications || [],
      count: notifications?.length || 0,
    })
  } catch (error) {
    console.error("Error in user notifications API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
