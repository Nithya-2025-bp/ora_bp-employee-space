"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Clock3, RefreshCw, ThumbsUp, ThumbsDown, User, Briefcase } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import {
  getUserPendingSubmissions,
  updateSubmissionStatus,
  type TimesheetSubmission,
  type DailyDetail,
  type EntryDetail,
  getUserSubmissions,
  getSubmissionDetails,
} from "@/lib/actions/timesheet-approval-actions"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

interface TimesheetApprovalModalProps {
  userEmail: string
  userName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onApproved: () => void
}

export default function TimesheetApprovalModal({
  userEmail,
  userName = userEmail,
  open,
  onOpenChange,
  onApproved,
}: TimesheetApprovalModalProps) {
  const [submissions, setSubmissions] = useState<TimesheetSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSubmission, setSelectedSubmission] = useState<TimesheetSubmission | null>(null)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectionComments, setRejectionComments] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("pending")
  const [isLoadingDetails, setIsLoadingDetails] = useState(false)

  // Load submissions when the modal opens
  useEffect(() => {
    if (open) {
      loadSubmissions()
    }
  }, [open, activeTab, userEmail]) // Added missing userEmail dependency

  // Load submission details when active submission changes
  useEffect(() => {
    if (activeSubmissionId && submissions.length > 0) {
      loadSubmissionDetails(activeSubmissionId)
    }
  }, [activeSubmissionId, submissions.length]) // Added submissions.length to prevent stale data

  const loadSubmissions = async () => {
    setIsLoading(true)
    try {
      // Get submissions based on the active tab
      const timeSheetSubmissions =
        activeTab === "pending" ? await getUserPendingSubmissions(userEmail) : await getUserSubmissions(userEmail)

      // If on pending tab, filter to only show pending submissions
      const filteredSubmissions =
        activeTab === "pending" ? timeSheetSubmissions.filter((sub) => sub.status === "pending") : timeSheetSubmissions

      setSubmissions(filteredSubmissions)

      // Set the first submission as active if available
      if (filteredSubmissions.length > 0) {
        setActiveSubmissionId(filteredSubmissions[0].id)
      } else {
        setActiveSubmissionId(null)
      }
    } catch (error) {
      console.error("Error loading submissions:", error)
      toast({
        title: "Error",
        description: "Failed to load timesheet submissions",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // New function to load submission details including daily breakdown
  const loadSubmissionDetails = async (submissionId: string) => {
    setIsLoadingDetails(true)
    try {
      const submission = submissions.find((s) => s.id === submissionId)
      if (!submission) {
        console.error("Submission not found:", submissionId)
        return
      }

      console.log("Loading details for submission:", {
        id: submission.id,
        userId: submission.userId,
        userEmail: submission.userEmail,
        startDate: submission.startDate,
        endDate: submission.endDate,
        status: submission.status,
      })

      // If we already have daily details, no need to fetch again
      if (submission.dailyDetails && submission.dailyDetails.length > 0) {
        setSelectedSubmission(submission)
        setIsLoadingDetails(false)
        return
      }

      // Check if submission has the required date fields
      if (!submission.startDate || !submission.endDate) {
        console.error("Submission missing date fields:", submission)
        toast({
          title: "Error",
          description: "Submission data is incomplete - missing date information",
          variant: "destructive",
        })
        setSelectedSubmission(submission)
        setIsLoadingDetails(false)
        return
      }

      console.log("Calling getSubmissionDetails with submissionId:", submissionId)

      // Fetch detailed submission data including daily details
      const detailedSubmission = await getSubmissionDetails(submissionId)

      console.log("getSubmissionDetails returned:", detailedSubmission)

      if (detailedSubmission && detailedSubmission.dailyDetails) {
        console.log("Loaded daily details:", detailedSubmission.dailyDetails)

        // Update the submission in the list with the detailed data
        const updatedSubmissions = submissions.map((s) =>
          s.id === submissionId ? { ...s, dailyDetails: detailedSubmission.dailyDetails } : s,
        )

        setSubmissions(updatedSubmissions)
        setSelectedSubmission(updatedSubmissions.find((s) => s.id === submissionId) || null)
      } else {
        console.warn("No detailed submission data returned or no daily details")
        setSelectedSubmission(submission)
        toast({
          title: "Warning",
          description: "Could not load detailed information for this submission",
          variant: "destructive",
        })
      }
    } catch (error: any) {
      console.error("Error loading submission details:", error)

      // Show user-friendly error message
      const errorMessage = error.message?.includes("Database service temporarily unavailable")
        ? "Database service is temporarily unavailable. Please try again in a moment."
        : `Failed to load submission details: ${error.message || "Unknown error"}`

      toast({
        title: "Error",
        description: errorMessage,
        variant: "destructive",
      })

      // Still show the basic submission without details
      const submission = submissions.find((s) => s.id === submissionId)
      if (submission) {
        setSelectedSubmission(submission)
      }
    } finally {
      setIsLoadingDetails(false)
    }
  }

  const handleStatusUpdate = async (
    submission: TimesheetSubmission,
    status: "approved" | "rejected",
    comments?: string,
  ) => {
    setIsProcessing(true)
    try {
      const result = await updateSubmissionStatus(submission.id, status, comments)

      if (result.success) {
        toast({
          title: "Success",
          description: `Timesheet ${status} successfully`,
        })

        // Update the submission status in the local state instead of removing it
        const now = new Date()
        const updatedSubmission: TimesheetSubmission = {
          ...submission,
          status: status,
          approvedBy: "admin", // You might want to get the actual admin email
          approvedAt: now,
          comments: status === "rejected" ? comments : submission.comments,
        }

        // Update the submission in the list
        setSubmissions((prevSubmissions) =>
          prevSubmissions.map((s) => (s.id === submission.id ? updatedSubmission : s)),
        )

        // Update the selected submission as well
        setSelectedSubmission(updatedSubmission)

        // Close the reject dialog if open
        if (status === "rejected") {
          setIsRejectDialogOpen(false)
          setRejectionComments("")
        }

        // Notify parent component
        onApproved()

        // If we're on the pending tab and this was approved/rejected, move to next pending item
        if (activeTab === "pending") {
          const remainingPendingSubmissions = submissions.filter(
            (s) => s.id !== submission.id && s.status === "pending",
          )

          if (remainingPendingSubmissions.length > 0) {
            setActiveSubmissionId(remainingPendingSubmissions[0].id)
          } else {
            // No more pending submissions, close modal
            setTimeout(() => onOpenChange(false), 1000)
          }
        }
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error(`Error ${status} timesheet:`, error)
      toast({
        title: "Error",
        description: `Failed to ${status} timesheet`,
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleApprove = (submission: TimesheetSubmission) => {
    handleStatusUpdate(submission, "approved")
  }

  const openRejectDialog = (submission: TimesheetSubmission) => {
    setSelectedSubmission(submission)
    setRejectionComments("")
    setIsRejectDialogOpen(true)
  }

  const handleReject = () => {
    if (!selectedSubmission) return
    handleStatusUpdate(selectedSubmission, "rejected", rejectionComments)
  }

  // Format date for display
  const formatDateStr = (dateString: string | null | undefined) => {
    if (!dateString) return "Invalid Date"

    try {
      const date = new Date(dateString)
      if (isNaN(date.getTime())) {
        console.warn("Invalid date string:", dateString)
        return "Invalid Date"
      }
      return format(date, "MMM d, yyyy")
    } catch (error) {
      console.warn("Error formatting date:", dateString, error)
      return "Invalid Date"
    }
  }

  // Get the active submission
  const activeSubmission = submissions.find((s) => s.id === activeSubmissionId) || null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white text-gray-900 border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Pending Timesheet Approvals</DialogTitle>
            <DialogDescription className="text-gray-700">
              Review and approve timesheets submitted by {userName}
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="pending">Pending</TabsTrigger>
              <TabsTrigger value="all">All Submissions</TabsTrigger>
            </TabsList>
          </Tabs>

          <div className="flex-1 overflow-hidden flex flex-col">
            {isLoading ? (
              <div className="flex justify-center items-center h-40">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0051FF]"></div>
              </div>
            ) : submissions.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-gray-700">No {activeTab === "pending" ? "pending" : ""} timesheet submissions</p>
              </div>
            ) : (
              <div className="flex flex-1 overflow-hidden">
                {/* Submissions list */}
                <div className="w-1/3 border-r pr-4 overflow-y-auto">
                  <h3 className="font-medium text-sm mb-2 text-gray-700">
                    {activeTab === "pending" ? "Pending Submissions" : "All Submissions"}
                  </h3>
                  <div className="space-y-2">
                    {submissions.map((submission) => (
                      <div
                        key={submission.id}
                        className={`p-3 rounded-md border cursor-pointer transition-colors ${
                          activeSubmissionId === submission.id
                            ? "bg-gray-100 border-gray-400 text-gray-900"
                            : "border-gray-200 hover:bg-gray-50 text-gray-900"
                        }`}
                        onClick={() => setActiveSubmissionId(submission.id)}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">
                              {formatDateStr(submission.startDate)} - {formatDateStr(submission.endDate)}
                            </p>
                            <p className="text-sm text-gray-700">
                              Submitted on{" "}
                              {submission.submittedAt ? formatDateStr(submission.submittedAt.toString()) : "Unknown"}
                            </p>
                          </div>
                          <Badge
                            className={
                              submission.status === "approved"
                                ? "bg-green-100 text-green-800"
                                : submission.status === "rejected"
                                  ? "bg-red-100 text-red-800"
                                  : "bg-yellow-100 text-yellow-800"
                            }
                          >
                            {submission.status === "approved"
                              ? "Approved"
                              : submission.status === "rejected"
                                ? "Rejected"
                                : "Pending"}
                          </Badge>
                        </div>
                        <div className="mt-2">
                          <p className="text-sm text-gray-900">
                            <strong>Total Hours:</strong> {submission.totalHours}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Submission details */}
                <div className="w-2/3 pl-4 overflow-y-auto">
                  {activeSubmission ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-medium text-lg flex items-center text-gray-900">
                            <User className="h-4 w-4 mr-2" />
                            {activeSubmission.userId}
                          </h3>
                          <p className="text-sm text-gray-700">
                            Week of {formatDateStr(activeSubmission.startDate)} to{" "}
                            {formatDateStr(activeSubmission.endDate)}
                          </p>
                        </div>
                        <Badge
                          className={
                            activeSubmission.status === "approved"
                              ? "bg-green-100 text-green-800"
                              : activeSubmission.status === "rejected"
                                ? "bg-red-100 text-red-800"
                                : "bg-yellow-100 text-yellow-800"
                          }
                        >
                          {activeSubmission.status === "approved"
                            ? "Approved"
                            : activeSubmission.status === "rejected"
                              ? "Rejected"
                              : "Pending"}
                        </Badge>
                      </div>

                      <div className="border rounded-md p-4 bg-gray-100 text-gray-900">
                        <h4 className="font-medium mb-2 flex items-center text-gray-900">
                          <Clock3 className="h-4 w-4 mr-2" />
                          Daily Breakdown
                        </h4>

                        {isLoadingDetails ? (
                          <div className="flex justify-center items-center h-40">
                            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-[#0051FF]"></div>
                          </div>
                        ) : activeSubmission.dailyDetails && activeSubmission.dailyDetails.length > 0 ? (
                          <div className="space-y-4">
                            {activeSubmission.dailyDetails.map((day: DailyDetail) => (
                              <div key={day.date} className="border-b pb-3 last:border-b-0 last:pb-0">
                                <div className="flex justify-between items-center mb-2">
                                  <h5 className="font-medium text-gray-900">
                                    {day.dayOfWeek}, {formatDateStr(day.date)}
                                  </h5>
                                  <span className="font-bold text-gray-900">{day.totalHours}</span>
                                </div>

                                {day.entries.length > 0 ? (
                                  <div className="space-y-2">
                                    {day.entries.map((entry: EntryDetail) => (
                                      <div key={entry.id} className="bg-white p-2 rounded border text-sm text-gray-900">
                                        <div className="flex justify-between items-start">
                                          <div>
                                            <div className="flex items-center">
                                              <Briefcase className="h-3 w-3 mr-1 text-gray-600" />
                                              <span className="font-medium text-gray-900">{entry.projectTitle}</span>
                                            </div>
                                            <div className="ml-4 text-gray-700">
                                              {entry.taskTitle} / {entry.subtaskTitle}
                                            </div>
                                            {entry.notes && (
                                              <div className="ml-4 text-blue-600 italic text-xs mt-1">
                                                "{entry.notes}"
                                              </div>
                                            )}
                                          </div>
                                          <span className="font-medium text-gray-900">{entry.hours}</span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-gray-700 italic">No entries for this day</p>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-4">
                            <p className="text-sm text-gray-700 italic mb-2">
                              {activeSubmission.dailyDetails === undefined
                                ? "Daily details could not be loaded"
                                : "No timesheet entries found for this week"}
                            </p>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => loadSubmissionDetails(activeSubmission.id)}
                              className="text-gray-600 hover:text-gray-800"
                            >
                              <RefreshCw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                            <div className="mt-2 text-xs text-gray-500">
                              Debug Info:
                              <br />
                              Submission ID: {activeSubmission.id}
                              <br />
                              User ID: {activeSubmission.userId}
                              <br />
                              User Email: {activeSubmission.userEmail}
                              <br />
                              Start Date: {activeSubmission.startDate}
                              <br />
                              End Date: {activeSubmission.endDate}
                              <br />
                              Status: {activeSubmission.status}
                              <br />
                              Daily Details:{" "}
                              {activeSubmission.dailyDetails
                                ? `${activeSubmission.dailyDetails.length} days`
                                : "undefined"}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="flex justify-end space-x-2">
                        <Button
                          variant="outline"
                          className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700 bg-transparent"
                          onClick={() => openRejectDialog(activeSubmission)}
                          disabled={isProcessing}
                        >
                          <ThumbsDown className="h-4 w-4 mr-1" />
                          Reject
                        </Button>
                        <Button
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => handleApprove(activeSubmission)}
                          disabled={isProcessing}
                        >
                          {isProcessing ? (
                            <>
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                              Processing...
                            </>
                          ) : (
                            <>
                              <ThumbsUp className="h-4 w-4 mr-1" />
                              Approve
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <p className="text-gray-700">Select a submission to view details</p>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} className="text-white">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="bg-white text-gray-900 border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Reject Timesheet</DialogTitle>
            <DialogDescription className="text-gray-700">
              Please provide a reason for rejecting this timesheet.
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Employee</p>
                  <p className="font-medium text-gray-900">{selectedSubmission.userId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Week Period</p>
                  <p className="font-medium text-gray-900">
                    {formatDateStr(selectedSubmission.startDate)} - {formatDateStr(selectedSubmission.endDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Total Hours</p>
                  <p className="font-medium text-gray-900">{selectedSubmission.totalHours}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="comments" className="text-sm font-medium text-gray-900">
                  Rejection Reason
                </label>
                <Textarea
                  id="comments"
                  value={rejectionComments}
                  onChange={(e) => setRejectionComments(e.target.value)}
                  placeholder="Please provide feedback on why this timesheet is being rejected"
                  className="min-h-[100px] bg-white text-gray-900 border-gray-300 placeholder:text-gray-500"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setIsRejectDialogOpen(false)}
              disabled={isProcessing}
              className="bg-white text-gray-900 border-gray-300 hover:bg-gray-50"
            >
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isProcessing || !rejectionComments.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ThumbsDown className="h-4 w-4 mr-1" />
                  Reject Timesheet
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
