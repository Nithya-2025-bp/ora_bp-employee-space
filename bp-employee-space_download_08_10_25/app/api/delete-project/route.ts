import { NextResponse } from "next/server"
import { deleteProject } from "@/lib/actions/project-actions"
import { getCurrentUser } from "@/lib/auth"

export async function POST(request: Request) {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
    }

    if (!currentUser.isAdmin) {
      return NextResponse.json({ error: "Not authorized" }, { status: 403 })
    }

    const body = await request.json()
    const { projectId } = body

    if (!projectId) {
      return NextResponse.json({ error: "Project ID is required" }, { status: 400 })
    }

    const result = await deleteProject(projectId)

    return NextResponse.json({
      success: result,
      message: result ? "Project deleted successfully" : "Failed to delete project",
    })
  } catch (error) {
    console.error("Error in delete-project API:", error)
    return NextResponse.json(
      { error: `Error: ${error instanceof Error ? error.message : String(error)}` },
      { status: 500 },
    )
  }
}
