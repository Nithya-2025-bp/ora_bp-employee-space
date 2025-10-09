import { NextResponse } from "next/server"
import fs from "fs/promises"
import os from "os"
import { getDataPath, ensureDataDir } from "@/lib/db/file-storage"

export async function GET() {
  try {
    // Get system information
    const systemInfo = {
      platform: process.platform,
      nodeVersion: process.version,
      cwd: process.cwd(),
      tmpdir: os.tmpdir(),
      homedir: os.homedir(),
      hostname: os.hostname(),
      environment: process.env.NODE_ENV || "development",
      env: {
        DATA_DIR: process.env.DATA_DIR || "(not set)",
      },
    }

    // Check data directory
    const dataDirectoryInfo = {
      path: getDataPath(""),
      exists: false,
      canWrite: false,
      error: null,
      projectsFile: {
        path: getDataPath("projects.json"),
        exists: false,
        size: 0,
        projectsCount: 0,
        error: null,
      },
    }

    try {
      await ensureDataDir()
      dataDirectoryInfo.exists = true

      // Test write permissions
      try {
        const testPath = getDataPath("debug-test.txt")
        await fs.writeFile(testPath, "test", "utf8")
        dataDirectoryInfo.canWrite = true

        try {
          await fs.unlink(testPath)
        } catch (unlinkError) {
          console.log("Could not delete test file, but write succeeded")
        }
      } catch (writeError) {
        dataDirectoryInfo.error = `Write test failed: ${writeError.message}`
      }

      // Check projects file
      const projectsPath = getDataPath("projects.json")
      try {
        await fs.access(projectsPath)
        dataDirectoryInfo.projectsFile.exists = true

        try {
          const stats = await fs.stat(projectsPath)
          dataDirectoryInfo.projectsFile.size = stats.size

          if (stats.size > 0) {
            const content = await fs.readFile(projectsPath, "utf8")
            try {
              const projects = JSON.parse(content)
              dataDirectoryInfo.projectsFile.projectsCount = projects.length
            } catch (parseError) {
              dataDirectoryInfo.projectsFile.error = `Parse error: ${parseError.message}`
            }
          }
        } catch (statError) {
          dataDirectoryInfo.projectsFile.error = `Stat error: ${statError.message}`
        }
      } catch (accessError) {
        dataDirectoryInfo.projectsFile.error = `Access error: ${accessError.message}`
      }
    } catch (dirError) {
      dataDirectoryInfo.error = `Directory error: ${dirError.message}`
    }

    // Return debug information
    return NextResponse.json({
      systemInfo,
      dataDirectory: dataDirectoryInfo,
    })
  } catch (error) {
    console.error("Error in debug endpoint:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
