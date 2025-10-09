"use server"

import { getAvailableTimesheetRows } from "./timesheet-actions"
import { getCurrentUser } from "../auth"

/**
 * Refreshes the available timesheet rows for the current user
 * This ensures that deleted tasks/subtasks don't show up in the timesheet
 */
export async function refreshTimesheetAvailableRows() {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      console.log("No user found, returning empty array")
      return { success: false, rows: [] }
    }

    console.log(`Refreshing timesheet available rows for ${currentUser.email}...`)
    const rows = await getAvailableTimesheetRows()
    console.log(`Found ${rows.length} available rows after refresh`)

    return {
      success: true,
      rows,
      message: `Successfully refreshed available rows (${rows.length} rows found)`,
    }
  } catch (error) {
    console.error("Error refreshing timesheet available rows:", error)
    return {
      success: false,
      rows: [],
      error: error instanceof Error ? error.message : String(error),
      message: "Failed to refresh available rows",
    }
  }
}

export async function invalidateTimesheetCache() {
  console.log("Invalidating timesheet cache on server")
  // This is a placeholder for future server-side cache invalidation
  // Currently, cache invalidation happens on the client side
  return { success: true }
}
