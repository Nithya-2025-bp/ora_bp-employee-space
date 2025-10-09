"use server"

import { getCurrentUser } from "../auth"
import { formatDate, getWeekRange } from "../time-utils"
import * as db from "../db/supabase-toil"
import type { TOILEntry, TOILBalance } from "../toil-types"
import { getSupabaseServerActionClient } from "../supabase/server"
import { v4 as uuidv4 } from "uuid"

// Add timeout wrapper with better error handling
async function withTimeout<T>(promise: Promise<T>, timeoutMs = 15000): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => reject(new Error("Request timed out")), timeoutMs)
  })

  try {
    const result = await Promise.race([promise, timeoutPromise])
    return result
  } catch (error: any) {
    // Handle non-JSON responses from Supabase
    if (error?.message?.includes("Unexpected token") || error?.message?.includes("not valid JSON")) {
      throw new Error("Database service temporarily unavailable. Please try again.")
    }
    throw error
  }
}

// Add retry wrapper for critical operations
async function withRetry<T>(operation: () => Promise<T>, maxRetries = 3, delayMs = 1000): Promise<T> {
  let lastError: Error

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation()
    } catch (error: any) {
      lastError = error

      // Don't retry on authentication errors
      if (error?.message?.includes("Not authenticated")) {
        throw error
      }

      // Don't retry on the last attempt
      if (attempt === maxRetries) {
        break
      }

      // Wait before retrying, with exponential backoff
      await new Promise((resolve) => setTimeout(resolve, delayMs * attempt))
    }
  }

  throw lastError
}

// Get TOIL entries for the current user
export async function getUserTOILEntries(): Promise<TOILEntry[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return []

    return await db.getTOILEntries(currentUser.email)
  } catch (error) {
    console.error("Error in getUserTOILEntries:", error)
    return []
  }
}

// Get all TOIL entries (admin only)
export async function getAllTOILEntries(): Promise<TOILEntry[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const { data, error } = await supabase.from("toil_entries").select("*").order("date", { ascending: false })

    if (error) {
      console.error("Error fetching all TOIL entries:", error)
      return []
    }

    return (data || []).map((entry) => ({
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
  } catch (error) {
    console.error("Error in getAllTOILEntries:", error)
    return []
  }
}

// Get TOIL entries for a specific week
export async function getTOILEntriesForWeek(startDate: Date): Promise<TOILEntry[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return []

    const { start, end } = getWeekRange(startDate)
    const startDateStr = formatDate(start)
    const endDateStr = formatDate(end)

    return await db.getTOILEntriesForWeek(currentUser.email, startDateStr, endDateStr)
  } catch (error) {
    console.error("Error in getTOILEntriesForWeek:", error)
    return []
  }
}

// Add or update a TOIL entry
export async function upsertTOILEntry(
  date: string,
  requestedHours: string,
  usedHours: string,
  comments?: string,
): Promise<{ success: boolean; message?: string; entry?: TOILEntry }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    // Calculate the week start date
    const dateObj = new Date(date)
    const { start } = getWeekRange(dateObj)
    const weekStartDate = formatDate(start)

    // Check streak limit if using TOIL
    if (usedHours && usedHours !== "00:00") {
      const streakCheck = await db.checkTOILStreakLimit(currentUser.email, date, usedHours)
      if (!streakCheck.allowed) {
        return { success: false, message: streakCheck.message }
      }
    }

    // Check capacity limit if requesting TOIL
    if (requestedHours && requestedHours !== "00:00") {
      const capacityCheck = await db.checkTOILCapacityLimit(currentUser.email, requestedHours)
      if (!capacityCheck.allowed) {
        return { success: false, message: capacityCheck.message }
      }
    }

    const entry = await db.upsertTOILEntry(currentUser.email, date, requestedHours, usedHours, weekStartDate, comments)

    if (!entry) {
      return { success: false, message: "Failed to save TOIL entry" }
    }

    return { success: true, entry }
  } catch (error) {
    console.error("Error in upsertTOILEntry:", error)
    return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// Delete a TOIL entry
export async function deleteTOILEntry(entryId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const success = await db.deleteTOILEntry(entryId)

    if (!success) {
      return { success: false, message: "Failed to delete TOIL entry" }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in deleteTOILEntry:", error)
    return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// Get TOIL balance for the current user
export async function getUserTOILBalance(): Promise<TOILBalance | null> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) return null

    return await db.getTOILBalance(currentUser.email)
  } catch (error) {
    console.error("Error in getUserTOILBalance:", error)
    return null
  }
}

// Submit TOIL entries for approval
export async function submitTOILEntries(
  weekStartDate: Date,
  comments?: string,
): Promise<{ success: boolean; message: string; submission?: any }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const { start, end } = getWeekRange(weekStartDate)
    const startDateStr = formatDate(start)
    const endDateStr = formatDate(end)

    const submission = await db.submitTOILEntries(currentUser.email, startDateStr, endDateStr, comments)

    if (!submission) {
      return { success: false, message: "Failed to submit TOIL entries" }
    }

    return {
      success: true,
      message: "TOIL entries submitted successfully",
      submission,
    }
  } catch (error) {
    console.error("Error in submitTOILEntries:", error)
    return { success: false, message: "An unexpected error occurred" }
  }
}

// Cancel TOIL submission
export async function cancelTOILSubmission(weekStartDate: Date): Promise<{ success: boolean; message: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const supabase = getSupabaseServerActionClient()

    // Calculate week range
    const { start, end } = getWeekRange(weekStartDate)
    const startDateStr = formatDate(start)
    const endDateStr = formatDate(end)

    // Find the submission for this week
    const { data: submission, error: findError } = await supabase
      .from("toil_submissions")
      .select("*")
      .eq("user_id", currentUser.email)
      .eq("week_start_date", startDateStr)
      .eq("week_end_date", endDateStr)
      .single()

    if (findError) {
      console.error("Error finding TOIL submission:", findError)
      return { success: false, message: "Failed to find TOIL submission" }
    }

    if (!submission) {
      return { success: false, message: "No submission found for this week" }
    }

    if (submission.status !== "pending") {
      return { success: false, message: `Cannot cancel a submission that is already ${submission.status}` }
    }

    // Delete the submission
    const { error: deleteError } = await supabase.from("toil_submissions").delete().eq("id", submission.id)

    if (deleteError) {
      console.error("Error deleting TOIL submission:", deleteError)
      return { success: false, message: "Failed to cancel TOIL submission" }
    }

    // Update entries back to draft status
    const { error: updateError } = await supabase
      .from("toil_entries")
      .update({ status: "draft" })
      .eq("user_id", currentUser.email)
      .gte("date", startDateStr)
      .lte("date", endDateStr)

    if (updateError) {
      console.error("Error updating TOIL entries status:", updateError)
    }

    return { success: true, message: "TOIL submission cancelled successfully" }
  } catch (error) {
    console.error("Error cancelling TOIL submission:", error)
    return { success: false, message: "An unexpected error occurred" }
  }
}

// Check if a TOIL is already submitted for a specific week
export async function checkTOILSubmission(
  weekStartDate: Date,
): Promise<{ submitted: boolean; status?: string; submission?: any }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { submitted: false }
    }

    const supabase = getSupabaseServerActionClient()

    // Calculate week range
    const { start, end } = getWeekRange(weekStartDate)
    const startDateStr = formatDate(start)
    const endDateStr = formatDate(end)

    // Check if a submission exists for this week - using correct column names
    const { data: submission, error } = await supabase
      .from("toil_submissions")
      .select("*")
      .eq("user_id", currentUser.email)
      .eq("week_start_date", startDateStr)
      .eq("week_end_date", endDateStr)
      .single()

    if (error) {
      if (error.code === "PGRST116") {
        return { submitted: false }
      }
      console.error("Error checking TOIL submission:", error)
      return { submitted: false }
    }

    return {
      submitted: true,
      status: submission.status,
      submission: {
        id: submission.id,
        userId: submission.user_id,
        startDate: submission.week_start_date,
        endDate: submission.week_end_date,
        status: submission.status,
        submittedAt: new Date(submission.submitted_at),
        approvedBy: submission.approved_by || undefined,
        approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
        rejectedBy: submission.rejected_by || undefined,
        rejectedAt: submission.rejected_at ? new Date(submission.rejected_at) : undefined,
        comments: submission.comments || undefined,
      },
    }
  } catch (error) {
    console.error("Error checking TOIL submission:", error)
    return { submitted: false }
  }
}

// Submit TOIL for approval (legacy function for compatibility)
export async function submitTOIL(
  weekStartDate: Date,
  totalHours: string,
  reason: string,
  comments?: string,
): Promise<{ success: boolean; message: string; submission?: any }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const supabase = getSupabaseServerActionClient()

    // Calculate week range
    const { start, end } = getWeekRange(weekStartDate)
    const startDateStr = formatDate(start)
    const endDateStr = formatDate(end)

    // Check if a submission already exists for this week
    const { data: existingSubmission, error: checkError } = await supabase
      .from("toil_submissions")
      .select("*")
      .eq("user_id", currentUser.email)
      .eq("week_start_date", startDateStr)
      .eq("week_end_date", endDateStr)
      .single()

    if (checkError && checkError.code !== "PGRST116") {
      console.error("Error checking for existing TOIL submission:", checkError)
      return { success: false, message: "Failed to check for existing submission" }
    }

    if (existingSubmission) {
      return {
        success: false,
        message: `You already have a ${existingSubmission.status} TOIL submission for this week`,
      }
    }

    // Create submission
    const submissionId = uuidv4()
    const now = new Date().toISOString()

    const { data: submission, error: submissionError } = await supabase
      .from("toil_submissions")
      .insert({
        id: submissionId,
        user_id: currentUser.email,
        week_start_date: startDateStr,
        week_end_date: endDateStr,
        status: "pending",
        submitted_at: now,
        comments: comments || null,
      })
      .select()
      .single()

    if (submissionError) {
      console.error("Error creating TOIL submission:", submissionError)
      return { success: false, message: "Failed to create TOIL submission" }
    }

    return {
      success: true,
      message: "TOIL submitted successfully",
      submission: {
        id: submission.id,
        userId: submission.user_id,
        startDate: submission.week_start_date,
        endDate: submission.week_end_date,
        status: submission.status,
        submittedAt: new Date(submission.submitted_at),
        comments: submission.comments || undefined,
      },
    }
  } catch (error) {
    console.error("Error submitting TOIL:", error)
    return { success: false, message: "An unexpected error occurred" }
  }
}

// Get all TOIL submissions (admin only)
export async function getAllTOILSubmissions(): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    // Get all submissions
    const { data: submissions, error: submissionsError } = await supabase
      .from("toil_submissions")
      .select("*")
      .order("submitted_at", { ascending: false })

    if (submissionsError) {
      console.error("Error fetching all TOIL submissions:", submissionsError)
      return []
    }

    // Get entries for each submission
    const submissionsWithEntries = await Promise.all(
      (submissions || []).map(async (submission) => {
        const entries = await db.getTOILEntriesForWeek(
          submission.user_id,
          submission.week_start_date,
          submission.week_end_date,
        )

        return {
          id: submission.id,
          userId: submission.user_id,
          weekStartDate: submission.week_start_date,
          weekEndDate: submission.week_end_date,
          status: submission.status,
          submittedAt: new Date(submission.submitted_at),
          approvedBy: submission.approved_by || undefined,
          approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
          comments: submission.comments || undefined,
          entries: entries || [],
        }
      }),
    )

    return submissionsWithEntries
  } catch (error) {
    console.error("Error in getAllTOILSubmissions:", error)
    return []
  }
}

// Get pending TOIL submissions (admin only)
export async function getPendingTOILSubmissions(): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    // Get pending submissions
    const { data: submissions, error: submissionsError } = await supabase
      .from("toil_submissions")
      .select("*")
      .eq("status", "pending")
      .order("submitted_at", { ascending: false })

    if (submissionsError) {
      console.error("Error fetching pending TOIL submissions:", submissionsError)
      return []
    }

    // Get entries for each submission
    const submissionsWithEntries = await Promise.all(
      (submissions || []).map(async (submission) => {
        const entries = await db.getTOILEntriesForWeek(
          submission.user_id,
          submission.week_start_date,
          submission.week_end_date,
        )

        return {
          id: submission.id,
          userId: submission.user_id,
          weekStartDate: submission.week_start_date,
          weekEndDate: submission.week_end_date,
          status: submission.status,
          submittedAt: new Date(submission.submitted_at),
          approvedBy: submission.approved_by || undefined,
          approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
          comments: submission.comments || undefined,
          entries: entries || [],
        }
      }),
    )

    return submissionsWithEntries
  } catch (error) {
    console.error("Error in getPendingTOILSubmissions:", error)
    return []
  }
}

// Fetch all TOIL submissions for a specific user
export async function getUserTOILSubmissions(userEmail: string): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const result = await withTimeout(
      supabase
        .from("toil_submissions")
        .select("*")
        .eq("user_id", userEmail)
        .order("submitted_at", { ascending: false }),
      8000,
    )

    const { data: submissions, error: submissionsError } = result

    if (submissionsError) {
      console.error("Error fetching user TOIL submissions:", submissionsError)
      return []
    }

    // Get entries for each submission
    const submissionsWithEntries = await Promise.all(
      (submissions || []).map(async (submission) => {
        const entries = await db.getTOILEntriesForWeek(
          submission.user_id,
          submission.week_start_date,
          submission.week_end_date,
        )

        return {
          id: submission.id,
          userId: submission.user_id,
          weekStartDate: submission.week_start_date,
          weekEndDate: submission.week_end_date,
          status: submission.status,
          submittedAt: new Date(submission.submitted_at),
          approvedBy: submission.approved_by || undefined,
          approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
          rejectedBy: submission.rejected_by || undefined,
          rejectedAt: submission.rejected_at ? new Date(submission.rejected_at) : undefined,
          comments: submission.comments || undefined,
          entries: entries || [],
        }
      }),
    )

    return submissionsWithEntries
  } catch (error: any) {
    if (error.message === "Request timed out") {
      console.warn(`Timeout getting TOIL submissions for user ${userEmail}`)
    } else {
      console.error("Error in getUserTOILSubmissions:", error)
    }
    return []
  }
}

// Fetch pending TOIL submissions for a specific user
export async function getUserPendingTOILSubmissions(userEmail: string): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const result = await withTimeout(
      supabase
        .from("toil_submissions")
        .select("*")
        .eq("user_id", userEmail)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false }),
      8000,
    )

    const { data: submissions, error: submissionsError } = result

    if (submissionsError) {
      console.error("Error fetching user pending TOIL submissions:", submissionsError)
      return []
    }

    // Get entries for each submission
    const submissionsWithEntries = await Promise.all(
      (submissions || []).map(async (submission) => {
        const entries = await db.getTOILEntriesForWeek(
          submission.user_id,
          submission.week_start_date,
          submission.week_end_date,
        )

        return {
          id: submission.id,
          userId: submission.user_id,
          weekStartDate: submission.week_start_date,
          weekEndDate: submission.week_end_date,
          status: submission.status,
          submittedAt: new Date(submission.submitted_at),
          approvedBy: submission.approved_by || undefined,
          approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
          rejectedBy: submission.rejected_by || undefined,
          rejectedAt: submission.rejected_at ? new Date(submission.rejected_at) : undefined,
          comments: submission.comments || undefined,
          entries: entries || [],
        }
      }),
    )

    return submissionsWithEntries
  } catch (error: any) {
    if (error.message === "Request timed out") {
      console.warn(`Timeout getting pending TOIL submissions for user ${userEmail}`)
    } else {
      console.error("Error in getUserPendingTOILSubmissions:", error)
    }
    return []
  }
}

// Get count of pending TOIL submissions for a specific user
export async function getUserPendingTOILSubmissionsCount(userId: string): Promise<number> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return 0
    }

    const supabase = getSupabaseServerActionClient()

    // Use withRetry and withTimeout to handle rate limiting and timeouts
    const count = await withRetry(async () => {
      const result = await withTimeout(
        supabase
          .from("toil_submissions")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending")
          .eq("user_id", userId),
        8000,
      )

      if (result.error) {
        throw new Error(`Database error: ${result.error.message}`)
      }

      return result.count || 0
    })

    return count
  } catch (error: any) {
    if (error.message === "Request timed out") {
      console.warn(`Timeout getting pending TOIL submissions count for user ${userId}`)
    } else if (error.message?.includes("Database service temporarily unavailable")) {
      console.warn(`Database temporarily unavailable for TOIL count for user ${userId}`)
    } else {
      console.error("Error in getUserPendingTOILSubmissionsCount:", error)
    }
    return 0
  }
}

// Update TOIL submission status (admin only)
export async function updateTOILSubmissionStatus(
  submissionId: string,
  status: "approved" | "rejected",
  comments?: string,
): Promise<{ success: boolean; message: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    if (!currentUser.isAdmin) {
      return { success: false, message: "Only admins can update submission status" }
    }

    return await db.updateTOILSubmissionStatus(submissionId, status, currentUser.email, comments)
  } catch (error) {
    console.error("Error updating TOIL submission:", error)
    return { success: false, message: "An unexpected error occurred" }
  }
}
