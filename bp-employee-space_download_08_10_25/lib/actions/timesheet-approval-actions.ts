"use server"

import { getCurrentUser } from "../auth"
import { formatDate, getWeekRange } from "../time-utils"
import { getSupabaseServerActionClient } from "../supabase/server"
import { v4 as uuidv4 } from "uuid"
import type { DailyDetail, EntryDetail, TimesheetApprovalStatus } from "@/lib/timesheet-types"
import { revalidatePath } from "next/cache"

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

// Enhanced retry logic with better error handling for rate limits and JSON parsing
async function fetchWithRetry(fetcher: () => Promise<any>, maxRetries = 3): Promise<any> {
  let retries = 0

  while (retries < maxRetries) {
    try {
      const result = await fetcher()
      return result
    } catch (error: any) {
      console.error(`Attempt ${retries + 1}/${maxRetries} failed:`, error)

      // Check for rate limiting or JSON parsing errors
      const isRateLimit =
        (error.message &&
          (error.message.includes("Too Many Requests") ||
            error.message.includes("429") ||
            error.message.includes("Unexpected token 'T'") ||
            error.message.includes("is not valid JSON"))) ||
        (error.code && error.code === 429)

      const isNetworkError =
        error.message &&
        (error.message.includes("fetch") || error.message.includes("network") || error.message.includes("timeout"))

      if ((isRateLimit || isNetworkError) && retries < maxRetries - 1) {
        // Exponential backoff with jitter: wait longer between each retry
        const baseDelay = Math.pow(2, retries) * 1000
        const jitter = Math.random() * 1000
        const delay = baseDelay + jitter

        console.log(
          `Rate limit or network error detected, retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`,
        )
        await new Promise((resolve) => setTimeout(resolve, delay))
        retries++
      } else {
        // If it's not a retryable error or we've exhausted retries, throw the error
        throw error
      }
    }
  }
}

// Add a wrapper for Supabase operations with better error handling
async function executeSupabaseOperation(operation: () => Promise<any>, operationName: string): Promise<any> {
  try {
    return await fetchWithRetry(async () => {
      const result = await operation()

      // Check if the result has an error property (Supabase pattern)
      if (result && result.error) {
        throw result.error
      }

      return result
    })
  } catch (error: any) {
    console.error(`Supabase operation '${operationName}' failed:`, error)

    // Handle specific error types
    if (error.message && error.message.includes("JSON")) {
      throw new Error(
        `Database returned invalid response. This may be due to rate limiting. Please try again in a moment.`,
      )
    }

    if (error.message && (error.message.includes("Too Many Requests") || error.message.includes("429"))) {
      throw new Error(`Database is currently busy. Please try again in a moment.`)
    }

    throw error
  }
}

export interface TimesheetSubmission {
  id: string
  userEmail: string
  weekEnding: Date
  status: TimesheetApprovalStatus
  submittedAt: Date
  approvedAt?: Date
  approvedBy?: string
  rejectedAt?: Date
  rejectedBy?: string
  rejectionReason?: string
  timesheetData: any
  dailyDetails?: DailyDetail[] // Added for completeness
  totalHours: string
  comments?: string
}

// Create a notification for the user
async function createNotification(
  userEmail: string,
  type: string,
  title: string,
  message: string,
  metadata?: any,
): Promise<boolean> {
  try {
    const supabase = getSupabaseServerActionClient()
    const notificationId = uuidv4()
    const now = new Date().toISOString()

    const { error } = await supabase.from("notifications").insert({
      id: notificationId,
      user_email: userEmail,
      type,
      title,
      message,
      metadata: metadata || {},
      created_at: now,
      read: false,
      dismissed: false,
    })

    if (error) {
      console.error("Error creating notification:", error)
      return false
    }

    console.log(`Created notification for user ${userEmail}: ${title}`)
    return true
  } catch (error) {
    console.error("Error in createNotification:", error)
    return false
  }
}

// Submit timesheet for approval
export async function submitTimesheet(
  weekStartDate: Date,
  totalHours: string,
  comments?: string,
): Promise<{ success: boolean; message: string; submission?: TimesheetSubmission }> {
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
    const { data: existingSubmissions, error: checkError } = await supabase
      .from("timesheet_submissions")
      .select("*")
      .eq("user_id", currentUser.email)
      .eq("start_date", startDateStr)
      .eq("end_date", endDateStr)

    if (checkError) {
      console.error("Error checking for existing submission:", checkError)
      return { success: false, message: "Failed to check for existing submission" }
    }

    if (existingSubmissions && existingSubmissions.length > 0) {
      const existingSubmission = existingSubmissions[0]
      return {
        success: false,
        message: `You already have a ${existingSubmission.status} submission for this week`,
      }
    }

    // Get timesheet entries for the week
    const { data: entries, error: entriesError } = await supabase
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", currentUser.email)
      .gte("date", startDateStr)
      .lte("date", endDateStr)

    if (entriesError) {
      console.error("Error fetching timesheet entries:", entriesError)
      return { success: false, message: "Failed to fetch timesheet entries" }
    }

    if (!entries || entries.length === 0) {
      return { success: false, message: "No timesheet entries found for this week" }
    }

    // Create submission
    const submissionId = uuidv4()
    const now = new Date().toISOString()

    const { data: submission, error: submissionError } = await supabase
      .from("timesheet_submissions")
      .insert({
        id: submissionId,
        user_id: currentUser.email,
        start_date: startDateStr,
        end_date: endDateStr,
        status: "pending",
        submitted_at: now,
        total_hours: totalHours,
        comments: comments || null,
      })
      .select()
      .single()

    if (submissionError) {
      console.error("Error creating timesheet submission:", submissionError)
      return { success: false, message: "Failed to create timesheet submission" }
    }

    return {
      success: true,
      message: "Timesheet submitted successfully",
      submission: {
        id: submission.id,
        userEmail: submission.user_id,
        weekEnding: new Date(submission.end_date),
        status: submission.status as TimesheetApprovalStatus,
        submittedAt: new Date(submission.submitted_at),
        totalHours: submission.total_hours,
        comments: submission.comments || undefined,
        timesheetData: undefined,
      },
    }
  } catch (error) {
    console.error("Error submitting timesheet:", error)
    return { success: false, message: "An unexpected error occurred" }
  }
}

// Check if a timesheet is already submitted for a specific week
export async function checkTimesheetSubmission(
  weekStartDate: Date,
): Promise<{ submitted: boolean; status?: string; submission?: TimesheetSubmission }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      console.log("[v0] checkTimesheetSubmission: No current user")
      return { submitted: false }
    }

    const supabase = getSupabaseServerActionClient()

    // Calculate week range
    const { start, end } = getWeekRange(weekStartDate)
    const startDateStr = formatDate(start)
    const endDateStr = formatDate(end)

    console.log(
      `[v0] checkTimesheetSubmission: Checking for user ${currentUser.email}, week ${startDateStr} to ${endDateStr}`,
    )

    // Check if a submission exists for this week
    const { data: submissions, error } = await supabase
      .from("timesheet_submissions")
      .select("*")
      .eq("user_id", currentUser.email)
      .eq("start_date", startDateStr)
      .eq("end_date", endDateStr)

    if (error) {
      console.error("[v0] checkTimesheetSubmission: Error checking timesheet submission:", error)
      return { submitted: false }
    }

    console.log(`[v0] checkTimesheetSubmission: Found ${submissions?.length || 0} submissions for this week`)

    if (!submissions || submissions.length === 0) {
      return { submitted: false }
    }

    const submission = submissions[0] // Get the first (and should be only) submission

    console.log(`[v0] checkTimesheetSubmission: Submission status is "${submission.status}"`)

    return {
      submitted: true,
      status: submission.status,
      submission: {
        id: submission.id,
        userEmail: submission.user_id,
        weekEnding: new Date(submission.end_date),
        status: submission.status as TimesheetApprovalStatus,
        submittedAt: new Date(submission.submitted_at),
        approvedBy: submission.approved_by || undefined,
        approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
        comments: submission.comments || undefined,
        totalHours: submission.total_hours,
      },
    }
  } catch (error) {
    console.error("[v0] checkTimesheetSubmission: Error checking timesheet submission:", error)
    return { submitted: false }
  }
}

// Cancel a timesheet submission
export async function cancelTimesheetSubmission(submissionId: string): Promise<{ success: boolean; message: string }> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    const supabase = getSupabaseServerActionClient()

    // Check if the submission exists and belongs to the current user
    const { data: submission, error: checkError } = await supabase
      .from("timesheet_submissions")
      .select("*")
      .eq("id", submissionId)
      .eq("user_id", currentUser.email)
      .single()

    if (checkError) {
      console.error("Error checking timesheet submission:", checkError)
      return { success: false, message: "Failed to check timesheet submission" }
    }

    if (!submission) {
      return { success: false, message: "Submission not found or does not belong to you" }
    }

    if (submission.status !== "pending") {
      return { success: false, message: `Cannot cancel a submission that is already ${submission.status}` }
    }

    // Delete the submission
    const { error: deleteError } = await supabase.from("timesheet_submissions").delete().eq("id", submissionId)

    if (deleteError) {
      console.error("Error deleting timesheet submission:", deleteError)
      return { success: false, message: "Failed to cancel timesheet submission" }
    }

    return { success: true, message: "Timesheet submission cancelled successfully" }
  } catch (error) {
    console.error("Error cancelling timesheet submission:", error)
    return { success: false, message: "An unexpected error occurred" }
  }
}

// Get all timesheet submissions (admin only) - with improved error handling
export async function getAllSubmissions(): Promise<TimesheetSubmission[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const submissions = await executeSupabaseOperation(
      () => supabase.from("timesheet_submissions").select("*").order("submitted_at", { ascending: false }).limit(50), // Limit to prevent overwhelming the database
      "getAllSubmissions",
    )

    // For each submission, get the daily details (but limit this to prevent overload)
    const submissionsWithDetails: TimesheetSubmission[] = []

    // Process in smaller batches to avoid rate limiting
    const batchSize = 5
    for (let i = 0; i < Math.min(submissions.length, 20); i += batchSize) {
      const batch = submissions.slice(i, i + batchSize)

      if (i > 0) {
        // Add delay between batches
        await new Promise((resolve) => setTimeout(resolve, 1000))
      }

      const batchPromises = batch.map(async (submission) => {
        try {
          const dailyDetails = await getDailyDetails(submission.user_id, submission.start_date, submission.end_date)

          return {
            id: submission.id,
            userEmail: submission.user_id,
            weekEnding: new Date(submission.end_date),
            status: submission.status as TimesheetApprovalStatus,
            submittedAt: new Date(submission.submitted_at),
            approvedBy: submission.approved_by || undefined,
            approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
            comments: submission.comments || undefined,
            totalHours: submission.total_hours,
            dailyDetails,
          }
        } catch (error) {
          console.warn(`Could not load details for submission ${submission.id}:`, error)
          // Return submission without details rather than failing completely
          return {
            id: submission.id,
            userEmail: submission.user_id,
            weekEnding: new Date(submission.end_date),
            status: submission.status as TimesheetApprovalStatus,
            submittedAt: new Date(submission.submitted_at),
            approvedBy: submission.approved_by || undefined,
            approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
            comments: submission.comments || undefined,
            totalHours: submission.total_hours,
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      submissionsWithDetails.push(...batchResults)
    }

    return submissionsWithDetails
  } catch (error: any) {
    console.error("Error in getAllSubmissions:", error)
    if (error.message?.includes("Database service temporarily unavailable")) {
      throw error
    }
    return []
  }
}

// Get pending timesheet submissions (admin only) - with improved error handling
export async function getPendingSubmissions(): Promise<TimesheetSubmission[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const submissions = await executeSupabaseOperation(
      () =>
        supabase
          .from("timesheet_submissions")
          .select("*")
          .eq("status", "pending")
          .order("submitted_at", { ascending: false })
          .limit(20), // Limit to prevent overwhelming the database
      "getPendingSubmissions",
    )

    // For each submission, get the daily details with better error handling
    const submissionsWithDetails: TimesheetSubmission[] = []

    // Process in smaller batches
    const batchSize = 3
    for (let i = 0; i < submissions.length; i += batchSize) {
      const batch = submissions.slice(i, i + batchSize)

      if (i > 0) {
        // Add delay between batches
        await new Promise((resolve) => setTimeout(resolve, 800))
      }

      const batchPromises = batch.map(async (submission) => {
        try {
          const dailyDetails = await getDailyDetails(submission.user_id, submission.start_date, submission.end_date)

          return {
            id: submission.id,
            userEmail: submission.user_id,
            weekEnding: new Date(submission.end_date),
            status: submission.status as TimesheetApprovalStatus,
            submittedAt: new Date(submission.submitted_at),
            approvedBy: submission.approved_by || undefined,
            approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
            comments: submission.comments || undefined,
            totalHours: submission.total_hours,
            dailyDetails,
          }
        } catch (error) {
          console.warn(`Could not load details for submission ${submission.id}:`, error)
          // Return submission without details
          return {
            id: submission.id,
            userEmail: submission.user_id,
            weekEnding: new Date(submission.end_date),
            status: submission.status as TimesheetApprovalStatus,
            submittedAt: new Date(submission.submitted_at),
            approvedBy: submission.approved_by || undefined,
            approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
            comments: submission.comments || undefined,
            totalHours: submission.total_hours,
          }
        }
      })

      const batchResults = await Promise.all(batchPromises)
      submissionsWithDetails.push(...batchResults)
    }

    return submissionsWithDetails
  } catch (error: any) {
    console.error("Error in getPendingSubmissions:", error)
    if (error.message?.includes("Database service temporarily unavailable")) {
      throw error
    }
    return []
  }
}

// Fetch all submissions for a specific user - with improved error handling
export async function getUserSubmissions(userEmail: string): Promise<TimesheetSubmission[]> {
  console.log(`Getting timesheet submissions for user: ${userEmail}`)

  try {
    const supabase = getSupabaseServerActionClient()

    // Add a small delay to prevent overwhelming the database
    await new Promise((resolve) => setTimeout(resolve, 100))

    const { data, error } = await executeSupabaseOperation(
      () =>
        supabase
          .from("timesheet_submissions")
          .select("*")
          .eq("user_id", userEmail)
          .order("end_date", { ascending: false }),
      "getUserSubmissions",
    )

    if (error) {
      console.error(`Error fetching submissions for ${userEmail}:`, error)
      throw error
    }

    if (!data) {
      console.log(`No submissions found for user: ${userEmail}`)
      return []
    }

    const submissions: TimesheetSubmission[] = data.map((submission) => ({
      id: submission.id,
      userEmail: submission.user_id,
      userId: submission.user_id, // Add this field for compatibility
      startDate: submission.start_date, // Add this field
      endDate: submission.end_date, // Add this field
      weekEnding: new Date(submission.end_date),
      status: submission.status as TimesheetApprovalStatus,
      submittedAt: new Date(submission.submitted_at),
      approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
      approvedBy: submission.approved_by || undefined,
      rejectedAt: submission.rejected_at ? new Date(submission.rejected_at) : undefined,
      rejectedBy: submission.rejected_by || undefined,
      rejectionReason: submission.rejection_reason || undefined,
      timesheetData: submission.timesheet_data,
      totalHours: submission.total_hours || "0:00",
      comments: submission.comments || undefined,
    }))

    console.log(`Found ${submissions.length} submissions for user: ${userEmail}`)
    return submissions
  } catch (error) {
    console.error(`Error in getUserSubmissions for ${userEmail}:`, error)
    throw error
  }
}

// Fetch pending submissions for a specific user - with improved error handling
export async function getUserPendingSubmissions(userEmail: string): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const result = await withTimeout(
      supabase
        .from("timesheet_submissions")
        .select("*")
        .eq("user_id", userEmail)
        .eq("status", "pending")
        .order("submitted_at", { ascending: false }),
      8000,
    )

    const { data, error } = result

    if (error) {
      console.error("Error fetching user pending timesheet submissions:", error)
      return []
    }

    return (data || []).map((submission) => ({
      id: submission.id,
      userId: submission.user_id,
      startDate: submission.start_date, // Add this field
      endDate: submission.end_date, // Add this field
      weekStartDate: submission.start_date,
      weekEndDate: submission.end_date,
      status: submission.status,
      submittedAt: new Date(submission.submitted_at),
      approvedBy: submission.approved_by || undefined,
      approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
      rejectedBy: submission.rejected_by || undefined,
      rejectedAt: submission.rejected_at ? new Date(submission.rejected_at) : undefined,
      comments: submission.comments || undefined,
      totalHours: submission.total_hours || "0:00",
    }))
  } catch (error: any) {
    if (error.message === "Request timed out") {
      console.warn(`Timeout getting pending timesheet submissions for user ${userEmail}`)
    } else {
      console.error("Error in getUserPendingSubmissions:", error)
    }
    return []
  }
}

// Get count of pending timesheet submissions for a specific user
export async function getUserPendingSubmissionsCount(userId: string): Promise<number> {
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
          .from("timesheet_submissions")
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
      console.warn(`Timeout getting pending timesheet submissions count for user ${userId}`)
    } else if (error.message?.includes("Database service temporarily unavailable")) {
      console.warn(`Database temporarily unavailable for timesheet count for user ${userId}`)
    } else {
      console.error("Error in getUserPendingSubmissionsCount:", error)
    }
    return 0
  }
}

// Fetch all timesheet submissions for a specific user
export async function getUserTimesheetSubmissions(userEmail: string): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const result = await withTimeout(
      supabase
        .from("timesheet_submissions")
        .select("*")
        .eq("user_id", userEmail)
        .order("submitted_at", { ascending: false }),
      8000,
    )

    const { data, error } = result

    if (error) {
      console.error("Error fetching user timesheet submissions:", error)
      return []
    }

    return (data || []).map((submission) => ({
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
      totalHours: submission.total_hours || "0:00",
    }))
  } catch (error: any) {
    if (error.message === "Request timed out") {
      console.warn(`Timeout getting timesheet submissions for user ${userEmail}`)
    } else {
      console.error("Error in getUserTimesheetSubmissions:", error)
    }
    return []
  }
}

// Get all pending timesheet submissions (admin only)
export async function getAllPendingTimesheetSubmissions(): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const { data, error } = await supabase
      .from("timesheet_submissions")
      .select("*")
      .eq("status", "pending")
      .order("submitted_at", { ascending: false })

    if (error) {
      console.error("Error fetching all pending timesheet submissions:", error)
      return []
    }

    return (data || []).map((submission) => ({
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
      totalHours: submission.total_hours || "0:00",
    }))
  } catch (error) {
    console.error("Error in getAllPendingTimesheetSubmissions:", error)
    return []
  }
}

// Get all timesheet submissions (admin only)
export async function getAllTimesheetSubmissions(): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const { data, error } = await supabase
      .from("timesheet_submissions")
      .select("*")
      .order("submitted_at", { ascending: false })

    if (error) {
      console.error("Error fetching all timesheet submissions:", error)
      return []
    }

    return (data || []).map((submission) => ({
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
      totalHours: submission.total_hours || "0:00",
    }))
  } catch (error) {
    console.error("Error in getAllTimesheetSubmissions:", error)
    return []
  }
}

// Get detailed submission data including daily details - with improved error handling
export async function getSubmissionDetails(submissionId: string): Promise<TimesheetSubmission | null> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return null
    }

    const supabase = getSupabaseServerActionClient()

    console.log("Getting submission details for ID:", submissionId)

    // Get the submission with retry logic
    const { data: submission, error } = await executeSupabaseOperation(
      () => supabase.from("timesheet_submissions").select("*").eq("id", submissionId).single(),
      "getSubmissionDetails",
    )

    if (error) {
      console.error("Error fetching submission:", error)
      return null
    }

    if (!submission) {
      console.log("No submission found for ID:", submissionId)
      return null
    }

    console.log("Found submission:", {
      id: submission.id,
      user_id: submission.user_id,
      start_date: submission.start_date,
      end_date: submission.end_date,
      status: submission.status,
    })

    // Get daily details for the submission with error handling
    let dailyDetails: DailyDetail[] = []
    try {
      // Validate that we have the required fields
      if (!submission.user_id || !submission.start_date || !submission.end_date) {
        console.error("Submission missing required fields:", {
          user_id: submission.user_id,
          start_date: submission.start_date,
          end_date: submission.end_date,
        })
        throw new Error("Submission data is incomplete")
      }

      dailyDetails = await getDailyDetails(submission.user_id, submission.start_date, submission.end_date)
    } catch (error) {
      console.warn("Could not load daily details:", error)
      // Continue without daily details rather than failing completely
    }

    return {
      id: submission.id,
      userEmail: submission.user_id,
      weekEnding: new Date(submission.end_date),
      status: submission.status as TimesheetApprovalStatus,
      submittedAt: new Date(submission.submitted_at),
      approvedBy: submission.approved_by || undefined,
      approvedAt: submission.approved_at ? new Date(submission.approved_at) : undefined,
      comments: submission.comments || undefined,
      totalHours: submission.total_hours,
      dailyDetails,
    }
  } catch (error: any) {
    console.error("Error in getSubmissionDetails:", error)

    // Return a more user-friendly error
    if (error.message?.includes("Database service temporarily unavailable")) {
      throw error
    }

    return null
  }
}

// Batch processing function to handle multiple operations with delays
export async function batchProcessSubmissions<T>(
  items: T[],
  processor: (item: T) => Promise<any>,
  batchSize = 5,
  delayBetweenBatches = 500,
): Promise<any[]> {
  const results: any[] = []

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)

    try {
      const batchResults = await Promise.allSettled(batch.map((item) => processor(item)))

      // Process results and handle failures gracefully
      batchResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          results.push(result.value)
        } else {
          console.error(`Batch item ${i + index} failed:`, result.reason)
          results.push(null) // Add null for failed items
        }
      })

      // Add delay between batches to prevent overwhelming the database
      if (i + batchSize < items.length) {
        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches))
      }
    } catch (error) {
      console.error(`Batch processing failed for items ${i} to ${i + batchSize - 1}:`, error)
      // Add nulls for the entire failed batch
      for (let j = 0; j < batch.length; j++) {
        results.push(null)
      }
    }
  }

  return results
}

// Helper function to get daily details for a submission - with robust error handling
async function getDailyDetails(userId: string, startDate: string, endDate: string): Promise<DailyDetail[]> {
  try {
    console.log(`Getting daily details for user ${userId} from ${startDate} to ${endDate}`)

    // Validate input parameters more thoroughly
    if (!userId || typeof userId !== "string" || userId.trim() === "") {
      console.error("Invalid userId:", userId)
      throw new Error("Invalid userId provided")
    }

    if (!startDate || typeof startDate !== "string" || startDate.trim() === "") {
      console.error("Invalid startDate:", startDate)
      throw new Error("Invalid startDate provided")
    }

    if (!endDate || typeof endDate !== "string" || endDate.trim() === "") {
      console.error("Invalid endDate:", endDate)
      throw new Error("Invalid endDate provided")
    }

    const supabase = getSupabaseServerActionClient()

    // First, let's check what timesheet entries exist for this user around this time period
    const { data: allEntries, error: allEntriesError } = await supabase
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", userId)
      .order("date", { ascending: true })
      .limit(100)

    if (allEntriesError) {
      console.error("Error fetching all timesheet entries:", allEntriesError)
    } else {
      console.log(`Found ${allEntries?.length || 0} total entries for user ${userId}`)
      if (allEntries && allEntries.length > 0) {
        console.log("Sample entries:", allEntries.slice(0, 3))
        console.log("Date range in entries:", {
          earliest: allEntries[0]?.date,
          latest: allEntries[allEntries.length - 1]?.date,
        })
      }
    }

    // Now try to get entries for the specific week with different date formats
    console.log("Trying exact date match...")
    let { data: entries, error } = await supabase
      .from("timesheet_entries")
      .select("*")
      .eq("user_id", userId)
      .gte("date", startDate)
      .lte("date", endDate)
      .order("date", { ascending: true })

    if (error) {
      console.error("Error fetching timesheet entries:", error)
      throw new Error(`Failed to fetch timesheet entries: ${error.message || "Unknown error"}`)
    }

    console.log(`Found ${entries?.length || 0} timesheet entries for exact date range`)

    // If no entries found, try with ISO date format
    if (!entries || entries.length === 0) {
      console.log("Trying with ISO date format...")

      // Safely parse dates
      let startDateISO: string = startDate
      let endDateISO: string = endDate

      try {
        // Check if the date strings are valid
        if (typeof startDate === "string" && typeof endDate === "string") {
          const startDateObj = new Date(startDate)
          const endDateObj = new Date(endDate)

          if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
            startDateISO = startDateObj.toISOString().split("T")[0]
            endDateISO = endDateObj.toISOString().split("T")[0]
          } else {
            // Try direct string manipulation as fallback
            if (startDate.includes && startDate.includes("T")) {
              startDateISO = startDate.split("T")[0]
            }
            if (endDate.includes && endDate.includes("T")) {
              endDateISO = endDate.split("T")[0]
            }
          }
        }
      } catch (dateError) {
        console.error("Error parsing dates:", dateError)
        // Use original dates as fallback
        startDateISO = startDate
        endDateISO = endDate
      }

      console.log(`Trying ISO dates: ${startDateISO} to ${endDateISO}`)

      const { data: isoEntries, error: isoError } = await supabase
        .from("timesheet_entries")
        .select("*")
        .eq("user_id", userId)
        .gte("date", startDateISO)
        .lte("date", endDateISO)
        .order("date", { ascending: true })

      if (isoError) {
        console.error("Error with ISO date format:", isoError)
      } else {
        entries = isoEntries
        console.log(`Found ${entries?.length || 0} entries with ISO date format`)
      }
    }

    // If still no entries, try a broader search
    if (!entries || entries.length === 0) {
      console.log("Trying broader date search...")

      try {
        if (typeof startDate === "string" && typeof endDate === "string") {
          const startDateObj = new Date(startDate)
          const endDateObj = new Date(endDate)

          if (!isNaN(startDateObj.getTime()) && !isNaN(endDateObj.getTime())) {
            // Expand the search by a few days in each direction
            const expandedStart = new Date(startDateObj.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]
            const expandedEnd = new Date(endDateObj.getTime() + 3 * 24 * 60 * 60 * 1000).toISOString().split("T")[0]

            console.log(`Trying expanded range: ${expandedStart} to ${expandedEnd}`)

            const { data: expandedEntries, error: expandedError } = await supabase
              .from("timesheet_entries")
              .select("*")
              .eq("user_id", userId)
              .gte("date", expandedStart)
              .lte("date", expandedEnd)
              .order("date", { ascending: true })

            if (expandedError) {
              console.error("Error with expanded date search:", expandedError)
            } else {
              entries = expandedEntries
              console.log(`Found ${entries?.length || 0} entries with expanded date range`)
              if (entries && entries.length > 0) {
                console.log(
                  "Expanded entries dates:",
                  entries.map((e) => e.date),
                )
              }
            }
          }
        }
      } catch (dateError) {
        console.error("Error in expanded date search:", dateError)
      }
    }

    if (!entries || entries.length === 0) {
      console.log("No entries found with any date format, returning empty array")
      return []
    }

    console.log(
      "Processing entries:",
      entries.map((e) => ({ date: e.date, hours: e.hours, project_id: e.project_id })),
    )

    // Group entries by date
    const entriesByDate = new Map<string, any[]>()
    for (const entry of entries) {
      if (entry && entry.date) {
        if (!entriesByDate.has(entry.date)) {
          entriesByDate.set(entry.date, [])
        }
        entriesByDate.get(entry.date)?.push(entry)
      }
    }

    console.log(`Grouped entries into ${entriesByDate.size} days`)

    // Get all unique IDs for batch fetching
    const projectIds = [...new Set(entries.filter((e) => e && e.project_id).map((e) => e.project_id))]
    const taskIds = [...new Set(entries.filter((e) => e && e.task_id).map((e) => e.task_id))]
    const subtaskIds = [...new Set(entries.filter((e) => e && e.subtask_id).map((e) => e.subtask_id))]

    console.log(
      `Fetching details for ${projectIds.length} projects, ${taskIds.length} tasks, ${subtaskIds.length} subtasks`,
    )

    // Fetch project, task, and subtask details
    const [projectsRes, tasksRes, subtasksRes] = await Promise.allSettled([
      projectIds.length > 0
        ? supabase.from("projects").select("id, title").in("id", projectIds)
        : Promise.resolve({ data: [] }),
      taskIds.length > 0 ? supabase.from("tasks").select("id, title").in("id", taskIds) : Promise.resolve({ data: [] }),
      subtaskIds.length > 0
        ? supabase.from("subtasks").select("id, title").in("id", subtaskIds)
        : Promise.resolve({ data: [] }),
    ])

    // Build lookup maps
    const projectMap = new Map()
    const taskMap = new Map()
    const subtaskMap = new Map()

    if (projectsRes.status === "fulfilled" && projectsRes.value?.data) {
      projectsRes.value.data.forEach((p) => projectMap.set(p.id, p.title))
    }
    if (tasksRes.status === "fulfilled" && tasksRes.value?.data) {
      tasksRes.value.data.forEach((t) => taskMap.set(t.id, t.title))
    }
    if (subtasksRes.status === "fulfilled" && subtasksRes.value?.data) {
      subtasksRes.value.data.forEach((s) => subtaskMap.set(s.id, s.title))
    }

    // Build daily details
    const dailyDetails: DailyDetail[] = []
    for (const [date, dateEntries] of entriesByDate.entries()) {
      // Safely get day of week
      let dayOfWeek = "Unknown"
      try {
        if (date && typeof date === "string") {
          const dateObj = new Date(date)
          if (!isNaN(dateObj.getTime())) {
            dayOfWeek = dateObj.toLocaleDateString("en-US", { weekday: "long" })
          }
        }
      } catch (error) {
        console.warn("Error parsing date for day of week:", date, error)
      }

      // Calculate total hours for the day
      let totalMinutes = 0
      for (const entry of dateEntries) {
        try {
          if (entry && entry.hours && typeof entry.hours === "string") {
            const [hours, minutes] = entry.hours.split(":").map(Number)
            if (!isNaN(hours) && !isNaN(minutes)) {
              totalMinutes += hours * 60 + (minutes || 0)
            }
          }
        } catch (error) {
          console.warn("Error parsing hours:", entry?.hours, error)
        }
      }
      const totalHours = `${Math.floor(totalMinutes / 60)
        .toString()
        .padStart(2, "0")}:${(totalMinutes % 60).toString().padStart(2, "0")}`

      // Build entry details
      const entryDetails: EntryDetail[] = dateEntries
        .filter((entry) => entry && entry.id) // Filter out invalid entries
        .map((entry) => ({
          id: entry.id,
          projectId: entry.project_id || "",
          taskId: entry.task_id || "",
          subtaskId: entry.subtask_id || "",
          projectTitle: projectMap.get(entry.project_id) || `Project ${(entry.project_id || "").slice(-8)}`,
          taskTitle: taskMap.get(entry.task_id) || `Task ${(entry.task_id || "").slice(-8)}`,
          subtaskTitle: subtaskMap.get(entry.subtask_id) || `Subtask ${(entry.subtask_id || "").slice(-8)}`,
          hours: entry.hours || "0:00",
          notes: entry.notes || undefined,
        }))

      dailyDetails.push({
        date,
        dayOfWeek,
        totalHours,
        entries: entryDetails,
      })
    }

    console.log(`Built ${dailyDetails.length} daily detail entries`)
    return dailyDetails
  } catch (error) {
    console.error("Error getting daily details:", error)
    throw error
  }
}

// Update timesheet submission status (admin only) - FIXED TO REMOVE created_at
export async function updateTimesheetSubmissionStatus(
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

    const supabase = getSupabaseServerActionClient()

    // Check if the submission exists
    const { data: submission, error: checkError } = await supabase
      .from("timesheet_submissions")
      .select("*")
      .eq("id", submissionId)
      .single()

    if (checkError) {
      console.error("Error checking timesheet submission:", checkError)
      return { success: false, message: "Failed to check timesheet submission" }
    }

    if (!submission) {
      return { success: false, message: "Submission not found" }
    }

    if (submission.status !== "pending") {
      return { success: false, message: `Cannot update a submission that is already ${submission.status}` }
    }

    const now = new Date().toISOString()

    if (status === "approved") {
      // Update the submission to approved
      const { error: updateError } = await supabase
        .from("timesheet_submissions")
        .update({
          status,
          approved_by: currentUser.email,
          approved_at: now,
          comments: comments || submission.comments,
        })
        .eq("id", submissionId)

      if (updateError) {
        console.error("Error updating timesheet submission:", updateError)
        return { success: false, message: "Failed to update timesheet submission" }
      }
    } else if (status === "rejected") {
      // Archive the submission to timesheet_rejections table before deleting
      // REMOVED created_at from the insert statement
      const { error: archiveError } = await supabase.from("timesheet_rejections").insert({
        id: uuidv4(),
        original_submission_id: submissionId,
        user_id: submission.user_id,
        start_date: submission.start_date,
        end_date: submission.end_date,
        total_hours: submission.total_hours,
        comments: submission.comments,
        timesheet_data: submission.timesheet_data,
        submitted_at: submission.submitted_at,
        rejected_by: currentUser.email,
        rejected_at: now,
        reason: comments || "No reason provided",
      })

      if (archiveError) {
        console.error("Error archiving rejected timesheet:", archiveError)
        return { success: false, message: "Failed to archive rejected timesheet" }
      }

      // Create a notification for the user
      const weekPeriod = `${new Date(submission.start_date).toLocaleDateString()} - ${new Date(submission.end_date).toLocaleDateString()}`
      const notificationTitle = "Timesheet Rejected"
      const notificationMessage = `Your timesheet for week ${weekPeriod} was rejected: ${comments || "No reason provided"}`

      const notificationCreated = await createNotification(
        submission.user_id,
        "timesheet_rejection",
        notificationTitle,
        notificationMessage,
        {
          weekStartDate: submission.start_date,
          weekEndDate: submission.end_date,
          rejectionReason: comments || "No reason provided",
          rejectedBy: currentUser.email,
          rejectedAt: now,
          archivedSubmissionId: submissionId,
        },
      )

      if (!notificationCreated) {
        console.warn("Failed to create notification for rejected timesheet")
      }

      // Delete the submission from the active submissions table
      const { error: deleteError } = await supabase.from("timesheet_submissions").delete().eq("id", submissionId)

      if (deleteError) {
        console.error("Error deleting timesheet submission:", deleteError)
        return { success: false, message: "Failed to delete timesheet submission" }
      }

      console.log(
        `Archived timesheet submission ${submissionId} to rejections table and created notification for user ${submission.user_id}`,
      )
    }

    return {
      success: true,
      message: `Timesheet ${status === "approved" ? "approved" : "rejected"} successfully`,
    }
  } catch (error) {
    console.error("Error updating timesheet submission:", error)
    return { success: false, message: "An unexpected error occurred" }
  }
}

// Export alias for compatibility with the modal component
export const updateSubmissionStatus = updateTimesheetSubmissionStatus

// Reject timesheet
export async function rejectTimesheet(submissionId: string, rejectionReason: string) {
  try {
    const supabase = getSupabaseServerActionClient()

    // First, get the submission details before deleting
    const { data: submission, error: fetchError } = await supabase
      .from("timesheet_submissions")
      .select("user_email, week_start_date, week_end_date")
      .eq("id", submissionId)
      .single()

    if (fetchError || !submission) {
      console.error("Error fetching submission:", fetchError)
      return { success: false, error: "Failed to find timesheet submission" }
    }

    // Create a notification for the user
    const { error: notificationError } = await supabase.from("notifications").insert({
      user_email: submission.user_email,
      type: "timesheet_rejection",
      title: "Timesheet Rejected",
      message: rejectionReason,
      week_start_date: submission.week_start_date,
      week_end_date: submission.week_end_date,
      created_at: new Date().toISOString(),
      dismissed: false,
    })

    if (notificationError) {
      console.error("Error creating notification:", notificationError)
      return { success: false, error: "Failed to create notification" }
    }

    // Delete the timesheet submission
    const { error: deleteError } = await supabase.from("timesheet_submissions").delete().eq("id", submissionId)

    if (deleteError) {
      console.error("Error deleting timesheet submission:", deleteError)
      return { success: false, error: "Failed to delete timesheet submission" }
    }

    revalidatePath("/dashboard/employee-accounts")
    return { success: true }
  } catch (error) {
    console.error("Error rejecting timesheet:", error)
    return { success: false, error: "An unexpected error occurred" }
  }
}

// Get rejected timesheets for a user
export async function getUserRejectedTimesheets(userEmail: string): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return []
    }
    // Users can only see their own rejections, admins can see any user's rejections
    if (!currentUser.isAdmin && currentUser.email !== userEmail) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const { data, error } = await supabase
      .from("timesheet_rejections")
      .select("*")
      .eq("user_id", userEmail)
      .order("rejected_at", { ascending: false })

    if (error) {
      console.error("Error fetching rejected timesheets:", error)
      return []
    }

    return (data || []).map((rejection) => ({
      id: rejection.id,
      originalSubmissionId: rejection.original_submission_id,
      userEmail: rejection.user_id,
      startDate: rejection.start_date,
      endDate: rejection.end_date,
      totalHours: rejection.total_hours,
      comments: rejection.comments,
      timesheetData: rejection.timesheet_data,
      submittedAt: new Date(rejection.submitted_at),
      rejectedBy: rejection.rejected_by,
      rejectedAt: new Date(rejection.rejected_at),
      reason: rejection.reason,
    }))
  } catch (error) {
    console.error("Error in getUserRejectedTimesheets:", error)
    return []
  }
}

// Get all rejected timesheets (admin only)
export async function getAllRejectedTimesheets(): Promise<any[]> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    const { data, error } = await supabase
      .from("timesheet_rejections")
      .select("*")
      .order("rejected_at", { ascending: false })
      .limit(100) // Limit to prevent overwhelming the UI

    if (error) {
      console.error("Error fetching all rejected timesheets:", error)
      return []
    }

    return (data || []).map((rejection) => ({
      id: rejection.id,
      originalSubmissionId: rejection.original_submission_id,
      userEmail: rejection.user_id,
      startDate: rejection.start_date,
      endDate: rejection.end_date,
      totalHours: rejection.total_hours,
      comments: rejection.comments,
      timesheetData: rejection.timesheet_data,
      submittedAt: new Date(rejection.submitted_at),
      rejectedBy: rejection.rejected_by,
      rejectedAt: new Date(rejection.rejected_at),
      reason: rejection.reason,
    }))
  } catch (error) {
    console.error("Error in getAllRejectedTimesheets:", error)
    return []
  }
}

// Get rejection statistics (admin only)
export async function getRejectionStatistics(): Promise<{
  totalRejections: number
  rejectionsByUser: { [key: string]: number }
  rejectionsByReason: { [key: string]: number }
  recentRejections: any[]
}> {
  try {
    const currentUser = await getCurrentUser()
    if (!currentUser || !currentUser.isAdmin) {
      return {
        totalRejections: 0,
        rejectionsByUser: {},
        rejectionsByReason: {},
        recentRejections: [],
      }
    }

    const supabase = getSupabaseServerActionClient()

    const { data, error } = await supabase
      .from("timesheet_rejections")
      .select("*")
      .order("rejected_at", { ascending: false })

    if (error) {
      console.error("Error fetching rejection statistics:", error)
      return {
        totalRejections: 0,
        rejectionsByUser: {},
        rejectionsByReason: {},
        recentRejections: [],
      }
    }

    const rejections = data || []
    const rejectionsByUser: { [key: string]: number } = {}
    const rejectionsByReason: { [key: string]: number } = {}

    rejections.forEach((rejection) => {
      // Count by user
      rejectionsByUser[rejection.user_id] = (rejectionsByUser[rejection.user_id] || 0) + 1

      // Count by reason
      const reason = rejection.reason || "No reason provided"
      rejectionsByReason[reason] = (rejectionsByReason[reason] || 0) + 1
    })

    return {
      totalRejections: rejections.length,
      rejectionsByUser,
      rejectionsByReason,
      recentRejections: rejections.slice(0, 10).map((rejection) => ({
        id: rejection.id,
        userEmail: rejection.user_id,
        weekPeriod: `${new Date(rejection.start_date).toLocaleDateString()} - ${new Date(rejection.end_date).toLocaleDateString()}`,
        rejectedBy: rejection.rejected_by,
        rejectedAt: new Date(rejection.rejected_at),
        reason: rejection.reason,
      })),
    }
  } catch (error) {
    console.error("Error in getRejectionStatistics:", error)
    return {
      totalRejections: 0,
      rejectionsByUser: {},
      rejectionsByReason: {},
      recentRejections: [],
    }
  }
}
