import { NextResponse } from "next/server"
import fs from "fs/promises"
import path from "path"
import { getDataPath, ensureDataDir } from "@/lib/db/file-storage"

export async function GET() {
  try {
    // Ensure data directory exists
    await ensureDataDir()

    // Get list of files in the data directory
    const dataDir = getDataPath("")
    const files = await fs.readdir(dataDir)

    // Get details for each file
    const fileDetails = await Promise.all(
      files.map(async (file) => {
        const filePath = path.join(dataDir, file)
        try {
          const stats = await fs.stat(filePath)

          let content = null
          if (file.endsWith(".json") && stats.size > 0 && stats.size < 1024 * 1024) {
            // Only read JSON files smaller than 1MB
            try {
              const data = await fs.readFile(filePath, "utf8")
              content = JSON.parse(data)
            } catch (readError) {
              content = { error: `Could not read file: ${readError.message}` }
            }
          }

          return {
            name: file,
            path: filePath,
            size: stats.size,
            isDirectory: stats.isDirectory(),
            modified: stats.mtime,
            content,
          }
        } catch (error) {
          return {
            name: file,
            path: filePath,
            error: error.message,
          }
        }
      }),
    )

    return NextResponse.json({
      dataDirectory: dataDir,
      files: fileDetails,
    })
  } catch (error) {
    console.error("Error in storage-check endpoint:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
