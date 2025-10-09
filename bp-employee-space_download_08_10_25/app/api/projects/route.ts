import { NextResponse } from "next/server"
import { getSupabaseServerActionClient } from "@/lib/supabase/server"
import { getCurrentUser } from "@/lib/auth"

export async function GET() {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    const supabase = getSupabaseServerActionClient()

    // Get projects
    const { data: projects, error: projectsError } = await supabase
      .from("projects")
      .select("*")
      .order("created_at", { ascending: false })

    if (projectsError) {
      return NextResponse.json({ error: projectsError.message }, { status: 500 })
    }

    return NextResponse.json({
      projects: projects || [],
    })
  } catch (error) {
    console.error("Error in projects API:", error)
    return NextResponse.json(
      { error: `Error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
