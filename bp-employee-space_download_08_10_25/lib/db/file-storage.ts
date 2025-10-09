import fs from "fs/promises"
import path from "path"

// Determine the best storage location based on environment
function getStorageDirectory() {
  // First check if DATA_DIR is set
  const configuredDir = process.env.DATA_DIR
  if (configuredDir && configuredDir.trim() !== "") {
    console.log(`Using configured DATA_DIR: ${configuredDir}`)

    // If DATA_DIR is in /tmp, create a more persistent alternative
    if (configuredDir.startsWith("/tmp/")) {
      try {
        // Try to use a directory in the project root instead
        const projectDir = path.join(process.cwd(), ".data")
        console.log(`DATA_DIR is in /tmp, using more persistent location: ${projectDir}`)
        return projectDir
      } catch (error) {
        console.log(`Could not use project directory, falling back to configured DATA_DIR: ${configuredDir}`)
        return configuredDir
      }
    }

    return configuredDir
  }

  // Use a directory in the project that should persist
  const projectDir = path.join(process.cwd(), ".data")
  console.log(`Using project directory: ${projectDir}`)
  return projectDir
}

// Base directory for all data files
const DATA_DIR = getStorageDirectory()

console.log(`Using data directory: ${DATA_DIR}`)

/**
 * Ensures the data directory exists
 */
export async function ensureDataDir(): Promise<void> {
  try {
    // Create directory if it doesn't exist
    await fs.mkdir(DATA_DIR, { recursive: true })
    console.log(`Ensured data directory exists: ${DATA_DIR}`)

    // Create a marker file to verify we can write
    const markerPath = path.join(DATA_DIR, ".marker")
    await fs.writeFile(markerPath, new Date().toISOString(), "utf8")
    console.log(`Created marker file at: ${markerPath}`)
  } catch (error) {
    console.error(`Error creating data directory: ${error}`)
    throw error
  }
}

/**
 * Gets the full path for a data file
 */
export function getDataPath(filename: string): string {
  return path.join(DATA_DIR, filename)
}

/**
 * Reads data from a JSON file
 */
export async function readJsonFile<T>(filename: string, defaultValue: T): Promise<T> {
  const filePath = getDataPath(filename)
  console.log(`Reading JSON from: ${filePath}`)

  try {
    await ensureDataDir()

    let fileExists = false
    try {
      await fs.access(filePath)
      fileExists = true
      console.log(`File ${filename} exists`)
    } catch (error) {
      console.log(`File ${filename} does not exist, will create with default value`)
    }

    if (!fileExists) {
      await writeJsonFile(filename, defaultValue)
      return defaultValue
    }

    try {
      const data = await fs.readFile(filePath, "utf8")
      console.log(`Read ${data.length} bytes from ${filename}`)

      if (!data || !data.trim()) {
        console.log(`File ${filename} is empty, using default value`)
        await writeJsonFile(filename, defaultValue)
        return defaultValue
      }

      const parsed = JSON.parse(data) as T
      if (Array.isArray(parsed)) {
        console.log(`Parsed ${parsed.length} items from ${filename}`)
      }
      return parsed
    } catch (error) {
      console.error(`Error reading or parsing ${filename}:`, error)
      return defaultValue
    }
  } catch (error) {
    console.error(`Error in readJsonFile for ${filename}:`, error)
    return defaultValue
  }
}

/**
 * Writes data to a JSON file
 */
export async function writeJsonFile<T>(filename: string, data: T): Promise<void> {
  const filePath = getDataPath(filename)
  console.log(`Writing JSON to: ${filePath}`)

  try {
    await ensureDataDir()

    // Directly write the file - simplified approach
    const jsonData = JSON.stringify(data, null, 2)

    try {
      await fs.writeFile(filePath, jsonData, "utf8")
      console.log(`Successfully wrote ${filename} (${jsonData.length} bytes)`)

      // Verify the file was written
      try {
        const stats = await fs.stat(filePath)
        console.log(`Verified ${filename} exists with size ${stats.size} bytes`)
      } catch (statError) {
        console.error(`Could not verify ${filename} was written:`, statError)
      }
    } catch (writeError) {
      console.error(`Error writing ${filename}:`, writeError)
      throw writeError
    }
  } catch (error) {
    console.error(`Error in writeJsonFile for ${filename}:`, error)
    throw error
  }
}
