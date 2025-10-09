import { type NextRequest, NextResponse } from "next/server"
import { getCurrentUser } from "@/lib/auth"
import { getSupabaseServerActionClient } from "@/lib/supabase/server"

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser()

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const { notificationId } = await request.json()

    if (!notificationId) {
      return NextResponse.json({ error: "Notification ID is required" }, { status: 400 })
    }

    const supabase = getSupabaseServerActionClient()

    // Mark the notification as dismissed
    const { error } = await supabase
      .from("notifications")
      .update({
        dismissed: true,
        dismissed_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .eq("user_email", user.email) // Ensure user can only dismiss their own notifications

    if (error) {
      console.error("Error dismissing notification:", error)
      return NextResponse.json({ error: "Failed to dismiss notification" }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Error in dismiss notification API:", error)
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
