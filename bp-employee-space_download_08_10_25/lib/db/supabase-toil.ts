import { v4 as uuidv4 } from "uuid"
import type { TOILEntry, TOILBalance, TOILSettings, TOILSubmission } from "../toil-types"
import { getSupabaseServerActionClient } from "../supabase/server"
import { formatDate } from "../time-utils"

// Get TOIL entries for a user
export async function getTOILEntries(userEmail: string): Promise<TOILEntry[]> {
  console.log(`Getting TOIL entries for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const { data, error } = await supabase
      .from("toil_entries")
      .select("*")
      .eq("user_id", userEmail)
      .order("date", { ascending: false })

    if (error) {
      console.error("Error fetching TOIL entries:", error)
      return []
    }

    const entries = data.map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      date: entry.date,
      requestedHours: entry.requested_hours,
      usedHours: entry.used_hours,
      status: entry.status,
      comments: entry.comments || undefined,
      adminComments: entry.admin_comments || undefined,
      createdAt: new Date(entry.created_at),
      updatedAt: new Date(entry.updated_at),
      weekStartDate: entry.week_start_date,
    })) as TOILEntry[]

    console.log(`Retrieved ${entries.length} TOIL entries for user ${userEmail}`)
    return entries
  } catch (error) {
    console.error(`Error in getTOILEntries for user ${userEmail}:`, error)
    return []
  }
}

// Get TOIL entries for a specific week
export async function getTOILEntriesForWeek(
  userEmail: string,
  startDate: string,
  endDate: string,
): Promise<TOILEntry[]> {
  console.log(`Getting TOIL entries for user ${userEmail} from ${startDate} to ${endDate}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const { data, error } = await supabase
      .from("toil_entries")
      .select("*")
      .eq("user_id", userEmail)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })

    if (error) {
      console.error("Error fetching TOIL entries for week:", error)
      return []
    }

    const entries = data.map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      date: entry.date,
      requestedHours: entry.requested_hours,
      usedHours: entry.used_hours,
      status: entry.status,
      comments: entry.comments || undefined,
      adminComments: entry.admin_comments || undefined,
      createdAt: new Date(entry.created_at),
      updatedAt: new Date(entry.updated_at),
      weekStartDate: entry.week_start_date,
    })) as TOILEntry[]

    console.log(`Retrieved ${entries.length} TOIL entries for the week`)
    return entries
  } catch (error) {
    console.error(`Error in getTOILEntriesForWeek for user ${userEmail}:`, error)
    return []
  }
}

// Add or update a TOIL entry
export async function upsertTOILEntry(
  userEmail: string,
  date: string,
  requestedHours: string,
  usedHours: string,
  weekStartDate: string,
  comments?: string,
): Promise<TOILEntry | null> {
  console.log(`Upserting TOIL entry for user ${userEmail}, date ${date}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // Ensure consistent date format
    const dateObj = new Date(date)
    const formattedDate = formatDate(dateObj)

    // Check if entry already exists
    const { data: existingEntries, error: fetchError } = await supabase
      .from("toil_entries")
      .select("id")
      .eq("user_id", userEmail)
      .eq("date", formattedDate)

    if (fetchError) {
      console.error("Error checking for existing TOIL entry:", fetchError)
      return null
    }

    const now = new Date().toISOString()
    let result

    if (existingEntries && existingEntries.length > 0) {
      // Update existing entry
      const entryId = existingEntries[0].id
      console.log(`Updating existing TOIL entry ${entryId} for date ${formattedDate}`)

      const { data, error } = await supabase
        .from("toil_entries")
        .update({
          requested_hours: requestedHours,
          used_hours: usedHours,
          comments,
          updated_at: now,
        })
        .eq("id", entryId)
        .select()
        .single()

      if (error) {
        console.error(`Error updating TOIL entry ${entryId}:`, error)
        return null
      }

      result = data
    } else {
      // Create new entry
      const entryId = uuidv4()
      console.log(`Creating new TOIL entry ${entryId} for date ${formattedDate}`)

      const { data, error } = await supabase
        .from("toil_entries")
        .insert({
          id: entryId,
          user_id: userEmail,
          date: formattedDate,
          requested_hours: requestedHours,
          used_hours: usedHours,
          status: "pending",
          comments,
          week_start_date: weekStartDate,
          created_at: now,
          updated_at: now,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating TOIL entry:", error)
        return null
      }

      result = data
    }

    // Update the TOIL balance
    await updateTOILBalance(userEmail)

    return {
      id: result.id,
      userId: result.user_id,
      date: result.date,
      requestedHours: result.requested_hours,
      usedHours: result.used_hours,
      status: result.status,
      comments: result.comments || undefined,
      adminComments: result.admin_comments || undefined,
      createdAt: new Date(result.created_at),
      updatedAt: new Date(result.updated_at),
      weekStartDate: result.week_start_date,
    } as TOILEntry
  } catch (error) {
    console.error(`Error in upsertTOILEntry for user ${userEmail}:`, error)
    return null
  }
}

// Delete a TOIL entry
export async function deleteTOILEntry(entryId: string): Promise<boolean> {
  console.log(`Deleting TOIL entry: ${entryId}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // Get the user ID from the entry before deleting
    const { data: entry, error: fetchError } = await supabase
      .from("toil_entries")
      .select("user_id")
      .eq("id", entryId)
      .single()

    if (fetchError) {
      console.error(`Error fetching TOIL entry ${entryId}:`, fetchError)
      return false
    }

    const { error } = await supabase.from("toil_entries").delete().eq("id", entryId)

    if (error) {
      console.error(`Error deleting TOIL entry ${entryId}:`, error)
      return false
    }

    // Update the TOIL balance
    if (entry) {
      await updateTOILBalance(entry.user_id)
    }

    console.log(`Deleted TOIL entry: ${entryId}`)
    return true
  } catch (error) {
    console.error(`Error in deleteTOILEntry(${entryId}):`, error)
    return false
  }
}

// Get TOIL balance for a user
export async function getTOILBalance(userEmail: string): Promise<TOILBalance | null> {
  console.log(`Getting TOIL balance for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const { data, error } = await supabase.from("toil_balances").select("*").eq("user_id", userEmail).single()

    if (error) {
      if (error.code === "PGRST116") {
        // No balance found, create a default one
        return createDefaultTOILBalance(userEmail)
      }
      console.error("Error fetching TOIL balance:", error)
      return null
    }

    return {
      userId: data.user_id,
      totalHours: data.total_hours,
      updatedAt: new Date(data.updated_at),
    }
  } catch (error) {
    console.error(`Error in getTOILBalance for user ${userEmail}:`, error)
    return null
  }
}

// Create a default TOIL balance
async function createDefaultTOILBalance(userEmail: string): Promise<TOILBalance | null> {
  console.log(`Creating default TOIL balance for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from("toil_balances")
      .insert({
        user_id: userEmail,
        total_hours: "00:00",
        updated_at: now,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating default TOIL balance:", error)
      return null
    }

    return {
      userId: data.user_id,
      totalHours: data.total_hours,
      updatedAt: new Date(data.updated_at),
    }
  } catch (error) {
    console.error(`Error in createDefaultTOILBalance for user ${userEmail}:`, error)
    return null
  }
}

// Update TOIL balance for a user
export async function updateTOILBalance(userEmail: string): Promise<TOILBalance | null> {
  console.log(`Updating TOIL balance for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // Get all approved TOIL entries
    const { data: entries, error: entriesError } = await supabase
      .from("toil_entries")
      .select("*")
      .eq("user_id", userEmail)
      .eq("status", "approved")

    if (entriesError) {
      console.error("Error fetching approved TOIL entries:", entriesError)
      return null
    }

    // Calculate total balance
    let totalMinutes = 0
    entries.forEach((entry) => {
      // Add requested hours
      const [reqHours, reqMinutes] = entry.requested_hours.split(":").map(Number)
      totalMinutes += reqHours * 60 + reqMinutes

      // Subtract used hours
      const [usedHours, usedMinutes] = entry.used_hours.split(":").map(Number)
      totalMinutes -= usedHours * 60 + usedMinutes
    })

    // Format total hours
    const totalHours = `${String(Math.floor(Math.abs(totalMinutes) / 60)).padStart(2, "0")}:${String(
      Math.abs(totalMinutes) % 60,
    ).padStart(2, "0")}`

    // Check if balance exists
    const { data: existingBalance, error: balanceError } = await supabase
      .from("toil_balances")
      .select("*")
      .eq("user_id", userEmail)

    if (balanceError && balanceError.code !== "PGRST116") {
      console.error("Error checking existing TOIL balance:", balanceError)
      return null
    }

    const now = new Date().toISOString()
    let result

    if (existingBalance && existingBalance.length > 0) {
      // Update existing balance
      const { data, error } = await supabase
        .from("toil_balances")
        .update({
          total_hours: totalMinutes >= 0 ? totalHours : `-${totalHours}`,
          updated_at: now,
        })
        .eq("user_id", userEmail)
        .select()
        .single()

      if (error) {
        console.error("Error updating TOIL balance:", error)
        return null
      }

      result = data
    } else {
      // Create new balance
      const { data, error } = await supabase
        .from("toil_balances")
        .insert({
          user_id: userEmail,
          total_hours: totalMinutes >= 0 ? totalHours : `-${totalHours}`,
          updated_at: now,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating TOIL balance:", error)
        return null
      }

      result = data
    }

    return {
      userId: result.user_id,
      totalHours: result.total_hours,
      updatedAt: new Date(result.updated_at),
    }
  } catch (error) {
    console.error(`Error in updateTOILBalance for user ${userEmail}:`, error)
    return null
  }
}

// Get TOIL settings for a user
export async function getTOILSettings(userEmail: string): Promise<TOILSettings | null> {
  console.log(`Getting TOIL settings for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const { data, error } = await supabase.from("toil_settings").select("*").eq("user_id", userEmail).single()

    if (error) {
      if (error.code === "PGRST116") {
        // No settings found, create default settings
        return createDefaultTOILSettings(userEmail)
      }
      console.error("Error fetching TOIL settings:", error)
      return null
    }

    return {
      userId: data.user_id,
      maxCapacity: data.max_capacity,
      maxStreakHours: data.max_streak_hours,
      maxStreakDays: data.max_streak_days,
    }
  } catch (error) {
    console.error(`Error in getTOILSettings for user ${userEmail}:`, error)
    return null
  }
}

// Create default TOIL settings
async function createDefaultTOILSettings(userEmail: string): Promise<TOILSettings | null> {
  console.log(`Creating default TOIL settings for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    const { data, error } = await supabase
      .from("toil_settings")
      .insert({
        user_id: userEmail,
        max_capacity: "40:00",
        max_streak_hours: "16:00",
        max_streak_days: 2,
      })
      .select()
      .single()

    if (error) {
      console.error("Error creating default TOIL settings:", error)
      return null
    }

    return {
      userId: data.user_id,
      maxCapacity: data.max_capacity,
      maxStreakHours: data.max_streak_hours,
      maxStreakDays: data.max_streak_days,
    }
  } catch (error) {
    console.error(`Error in createDefaultTOILSettings for user ${userEmail}:`, error)
    return null
  }
}

// Update TOIL settings
export async function updateTOILSettings(
  userEmail: string,
  maxCapacity: string,
  maxStreakHours: string,
  maxStreakDays: number,
): Promise<TOILSettings | null> {
  console.log(`Updating TOIL settings for user: ${userEmail}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // Check if settings exist
    const { data: existingSettings, error: settingsError } = await supabase
      .from("toil_settings")
      .select("*")
      .eq("user_id", userEmail)

    if (settingsError && settingsError.code !== "PGRST116") {
      console.error("Error checking existing TOIL settings:", settingsError)
      return null
    }

    let result

    if (existingSettings && existingSettings.length > 0) {
      // Update existing settings
      const { data, error } = await supabase
        .from("toil_settings")
        .update({
          max_capacity: maxCapacity,
          max_streak_hours: maxStreakHours,
          max_streak_days: maxStreakDays,
        })
        .eq("user_id", userEmail)
        .select()
        .single()

      if (error) {
        console.error("Error updating TOIL settings:", error)
        return null
      }

      result = data
    } else {
      // Create new settings
      const { data, error } = await supabase
        .from("toil_settings")
        .insert({
          user_id: userEmail,
          max_capacity: maxCapacity,
          max_streak_hours: maxStreakHours,
          max_streak_days: maxStreakDays,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating TOIL settings:", error)
        return null
      }

      result = data
    }

    return {
      userId: result.user_id,
      maxCapacity: result.max_capacity,
      maxStreakHours: result.max_streak_hours,
      maxStreakDays: result.max_streak_days,
    }
  } catch (error) {
    console.error(`Error in updateTOILSettings for user ${userEmail}:`, error)
    return null
  }
}

// Submit TOIL entries for approval
export async function submitTOILEntries(
  userEmail: string,
  weekStartDate: string,
  weekEndDate: string,
  comments?: string,
): Promise<TOILSubmission | null> {
  console.log(`Submitting TOIL entries for user ${userEmail}, week ${weekStartDate} to ${weekEndDate}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // Check if a submission already exists
    const { data: existingSubmission, error: checkError } = await supabase
      .from("toil_submissions")
      .select("*")
      .eq("user_id", userEmail)
      .eq("week_start_date", weekStartDate)
      .maybeSingle()

    if (checkError) {
      console.error("Error checking existing TOIL submission:", checkError)
      return null
    }

    // Get entries for the week
    const { data: weekEntries, error: entriesError } = await supabase
      .from("toil_entries")
      .select("*")
      .eq("user_id", userEmail)
      .gte("date", weekStartDate)
      .lte("date", weekEndDate)

    if (entriesError) {
      console.error("Error fetching TOIL entries for submission:", entriesError)
      return null
    }

    if (!weekEntries || weekEntries.length === 0) {
      console.log("No TOIL entries found for the week")
      return null
    }

    const submissionId = existingSubmission?.id || uuidv4()
    const now = new Date().toISOString()

    // Update entries to pending status
    for (const entry of weekEntries) {
      const { error: updateError } = await supabase
        .from("toil_entries")
        .update({
          status: "pending",
        })
        .eq("id", entry.id)

      if (updateError) {
        console.error(`Error updating TOIL entry ${entry.id} status:`, updateError)
      }
    }

    // Create or update submission
    let result
    if (existingSubmission) {
      const { data, error } = await supabase
        .from("toil_submissions")
        .update({
          status: "pending",
          comments,
          submitted_at: now,
          approved_by: null,
          approved_at: null,
        })
        .eq("id", submissionId)
        .select()
        .single()

      if (error) {
        console.error("Error updating TOIL submission:", error)
        return null
      }

      result = data
    } else {
      const { data, error } = await supabase
        .from("toil_submissions")
        .insert({
          id: submissionId,
          user_id: userEmail,
          week_start_date: weekStartDate,
          week_end_date: weekEndDate,
          status: "pending",
          comments,
          submitted_at: now,
        })
        .select()
        .single()

      if (error) {
        console.error("Error creating TOIL submission:", error)
        return null
      }

      result = data
    }

    // Map entries to TOILEntry type
    const mappedEntries = weekEntries.map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      date: entry.date,
      requestedHours: entry.requested_hours,
      usedHours: entry.used_hours,
      status: entry.status,
      comments: entry.comments || undefined,
      adminComments: entry.admin_comments || undefined,
      createdAt: new Date(entry.created_at),
      updatedAt: new Date(entry.updated_at),
      weekStartDate: entry.week_start_date,
    })) as TOILEntry[]

    return {
      id: result.id,
      userId: result.user_id,
      weekStartDate: result.week_start_date,
      weekEndDate: result.week_end_date,
      status: result.status,
      submittedAt: new Date(result.submitted_at),
      approvedBy: result.approved_by || undefined,
      approvedAt: result.approved_at ? new Date(result.approved_at) : undefined,
      comments: result.comments || undefined,
      entries: mappedEntries,
    }
  } catch (error) {
    console.error(`Error in submitTOILEntries for user ${userEmail}:`, error)
    return null
  }
}

// Approve or reject TOIL submission
export async function updateTOILSubmissionStatus(
  submissionId: string,
  status: "approved" | "rejected",
  adminEmail: string,
  adminComments?: string,
): Promise<TOILSubmission | null> {
  console.log(`Updating TOIL submission ${submissionId} status to ${status}`)
  const supabase = getSupabaseServerActionClient()

  try {
    // Get the submission
    const { data: submission, error: fetchError } = await supabase
      .from("toil_submissions")
      .select("*")
      .eq("id", submissionId)
      .single()

    if (fetchError) {
      console.error(`Error fetching TOIL submission ${submissionId}:`, fetchError)
      return null
    }

    // Get entries for the submission
    const { data: entries, error: entriesError } = await supabase
      .from("toil_entries")
      .select("*")
      .eq("user_id", submission.user_id)
      .gte("date", submission.week_start_date)
      .lte("date", submission.week_end_date)

    if (entriesError) {
      console.error("Error fetching TOIL entries for submission:", entriesError)
      return null
    }

    const now = new Date().toISOString()

    // Update submission status
    const { data: updatedSubmission, error: updateError } = await supabase
      .from("toil_submissions")
      .update({
        status,
        approved_by: adminEmail,
        approved_at: now,
        admin_comments: adminComments,
      })
      .eq("id", submissionId)
      .select()
      .single()

    if (updateError) {
      console.error(`Error updating TOIL submission ${submissionId}:`, updateError)
      return null
    }

    // Update entries status
    for (const entry of entries) {
      const { error: entryError } = await supabase
        .from("toil_entries")
        .update({
          status,
          admin_comments: adminComments,
        })
        .eq("id", entry.id)

      if (entryError) {
        console.error(`Error updating TOIL entry ${entry.id} status:`, entryError)
      }
    }

    // If approved, update the TOIL balance
    if (status === "approved") {
      await updateTOILBalance(submission.user_id)
    }

    // Map entries to TOILEntry type
    const mappedEntries = entries.map((entry) => ({
      id: entry.id,
      userId: entry.user_id,
      date: entry.date,
      requestedHours: entry.requested_hours,
      usedHours: entry.used_hours,
      status,
      comments: entry.comments || undefined,
      adminComments: adminComments || entry.admin_comments || undefined,
      createdAt: new Date(entry.created_at),
      updatedAt: new Date(entry.updated_at),
      weekStartDate: entry.week_start_date,
    })) as TOILEntry[]

    return {
      id: updatedSubmission.id,
      userId: updatedSubmission.user_id,
      weekStartDate: updatedSubmission.week_start_date,
      weekEndDate: updatedSubmission.week_end_date,
      status: updatedSubmission.status,
      submittedAt: new Date(updatedSubmission.submitted_at),
      approvedBy: updatedSubmission.approved_by,
      approvedAt: new Date(updatedSubmission.approved_at),
      comments: updatedSubmission.comments || undefined,
      entries: mappedEntries,
    }
  } catch (error) {
    console.error(`Error in updateTOILSubmissionStatus for submission ${submissionId}:`, error)
    return null
  }
}

// Check if a user has reached the TOIL streak limit
export async function checkTOILStreakLimit(
  userEmail: string,
  date: string,
  requestedHours: string,
): Promise<{ allowed: boolean; message?: string }> {
  console.log(`Checking TOIL streak limit for user ${userEmail}, date ${date}`)

  try {
    // Get user settings
    const settings = await getTOILSettings(userEmail)
    if (!settings) {
      return { allowed: false, message: "Could not retrieve TOIL settings" }
    }

    const maxStreakDays = settings.maxStreakDays
    const maxStreakHours = settings.maxStreakHours
    const [maxHours, maxMinutes] = maxStreakHours.split(":").map(Number)
    const maxStreakMinutes = maxHours * 60 + maxMinutes

    // Get the date range for the streak check
    const currentDate = new Date(date)
    const startDate = new Date(currentDate)
    startDate.setDate(currentDate.getDate() - maxStreakDays + 1)

    const formattedStartDate = formatDate(startDate)
    const formattedCurrentDate = formatDate(currentDate)

    // Get entries in the streak period
    const supabase = getSupabaseServerActionClient()
    const { data: streakEntries, error } = await supabase
      .from("toil_entries")
      .select("*")
      .eq("user_id", userEmail)
      .gte("date", formattedStartDate)
      .lt("date", formattedCurrentDate)
      .order("date", { ascending: false })
      .limit(maxStreakDays - 1)

    if (error) {
      console.error("Error fetching streak entries:", error)
      return { allowed: false, message: "Error checking streak limit" }
    }

    // Calculate total used hours in the streak period
    let totalUsedMinutes = 0
    streakEntries.forEach((entry) => {
      const [hours, minutes] = entry.used_hours.split(":").map(Number)
      totalUsedMinutes += hours * 60 + minutes
    })

    // Add the current requested hours
    const [reqHours, reqMinutes] = requestedHours.split(":").map(Number)
    const requestedMinutes = reqHours * 60 + reqMinutes

    // Check if adding the current requested hours would exceed the streak limit
    const totalMinutes = totalUsedMinutes + requestedMinutes
    if (totalMinutes > maxStreakMinutes) {
      const remainingMinutes = maxStreakMinutes - totalUsedMinutes
      const remainingHours = Math.floor(remainingMinutes / 60)
      const remainingMins = remainingMinutes % 60
      const formattedRemaining = `${String(remainingHours).padStart(2, "0")}:${String(remainingMins).padStart(2, "0")}`

      return {
        allowed: false,
        message: `You can only use ${maxStreakHours} hours of TOIL over ${maxStreakDays} days. You have ${formattedRemaining} remaining.`,
      }
    }

    return { allowed: true }
  } catch (error) {
    console.error(`Error in checkTOILStreakLimit for user ${userEmail}:`, error)
    return { allowed: false, message: "Error checking streak limit" }
  }
}

// Check if a user has reached the TOIL capacity limit
export async function checkTOILCapacityLimit(
  userEmail: string,
  requestedHours: string,
): Promise<{ allowed: boolean; message?: string }> {
  console.log(`Checking TOIL capacity limit for user ${userEmail}`)

  try {
    // Get user settings
    const settings = await getTOILSettings(userEmail)
    if (!settings) {
      return { allowed: false, message: "Could not retrieve TOIL settings" }
    }

    // Get current balance
    const balance = await getTOILBalance(userEmail)
    if (!balance) {
      return { allowed: false, message: "Could not retrieve TOIL balance" }
    }

    const maxCapacity = settings.maxCapacity
    const [maxHours, maxMinutes] = maxCapacity.split(":").map(Number)
    const maxCapacityMinutes = maxHours * 60 + maxMinutes

    // Calculate current balance in minutes
    const [balanceHours, balanceMinutes] = balance.totalHours.replace("-", "").split(":").map(Number)
    const balanceInMinutes = (balance.totalHours.startsWith("-") ? -1 : 1) * (balanceHours * 60 + balanceMinutes)

    // Calculate new balance after adding requested hours
    const [reqHours, reqMinutes] = requestedHours.split(":").map(Number)
    const requestedMinutesCapacity = reqHours * 60 + reqMinutes

    // Calculate the new balance in minutes after adding the requested hours
    const newBalanceMinutes = balanceInMinutes + requestedMinutesCapacity

    // Check if new balance would exceed capacity
    if (newBalanceMinutes > maxCapacityMinutes) {
      const remainingMinutes = maxCapacityMinutes - balanceInMinutes
      const remainingHours = Math.floor(remainingMinutes / 60)
      const remainingMins = remainingMinutes % 60
      const formattedRemaining = `${String(remainingHours).padStart(2, "0")}:${String(remainingMins).padStart(2, "0")}`

      return {
        allowed: false,
        message: `You can only accumulate ${maxCapacity} hours of TOIL. You can request up to ${formattedRemaining} more.`,
      }
    }

    return { allowed: true }
  } catch (error) {
    console.error(`Error in checkTOILCapacityLimit for user ${userEmail}:`, error)
    return { allowed: false, message: "Error checking capacity limit" }
  }
}
