import { NextResponse } from "next/server"
import fs from "fs/promises"
import { getDataPath, ensureDataDir } from "@/lib/db/file-storage"

export async function GET() {
  try {
    // Ensure data directory exists
    await ensureDataDir()

    // Create a test project
    const testProject = {
      id: "test-" + Date.now(),
      title: "Test Project",
      description: "Created by test-write API",
      tasks: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    // Write directly to projects.json
    const projectsPath = getDataPath("projects.json")

    // First check if the file exists
    let existingProjects = []
    try {
      await fs.access(projectsPath)
      const content = await fs.readFile(projectsPath, "utf8")
      if (content && content.trim()) {
        existingProjects = JSON.parse(content)
      }
    } catch (error) {
      console.log(`No existing projects file or couldn't read it: ${error.message}`)
    }

    // Add our test project
    existingProjects.push(testProject)

    // Write the updated projects
    await fs.writeFile(projectsPath, JSON.stringify(existingProjects, null, 2), "utf8")

    // Verify it was written
    const verifyContent = await fs.readFile(projectsPath, "utf8")
    const verifyProjects = JSON.parse(verifyContent)

    return NextResponse.json({
      success: true,
      message: "Test project written successfully",
      projectsPath,
      projectCount: verifyProjects.length,
      testProject,
    })
  } catch (error) {
    console.error("Error in test-write endpoint:", error)
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        stack: error.stack,
      },
      { status: 500 },
    )
  }
}
