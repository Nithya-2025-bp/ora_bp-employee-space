"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
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
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  User,
  Calendar,
  Clock3,
  FileText,
  ChevronDown,
  ChevronUp,
  Briefcase,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import {
  getAllSubmissions,
  getPendingSubmissions,
  updateSubmissionStatus,
  type TimesheetSubmission,
  type DailyDetail,
  type EntryDetail,
} from "@/lib/actions/timesheet-approval-actions"

export default function TimesheetApprovals() {
  const [submissions, setSubmissions] = useState<TimesheetSubmission[]>([])
  const [pendingSubmissions, setPendingSubmissions] = useState<TimesheetSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState("pending")
  const [expandedSubmissions, setExpandedSubmissions] = useState<Record<string, boolean>>({})

  // For approval/rejection dialog
  const [selectedSubmission, setSelectedSubmission] = useState<TimesheetSubmission | null>(null)
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectionComments, setRejectionComments] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [viewDetailsSubmission, setViewDetailsSubmission] = useState<TimesheetSubmission | null>(null)
  const [isDetailsDialogOpen, setIsDetailsDialogOpen] = useState(false)

  // Load submissions
  useEffect(() => {
    loadSubmissions()
  }, [])

  const loadSubmissions = async () => {
    setIsLoading(true)
    try {
      // Add timeout handling for the main approval functions
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error("Load submissions timeout")), 15000)
      })

      const loadPromise = Promise.all([getAllSubmissions(), getPendingSubmissions()])

      try {
        const [allData, pendingData] = await Promise.race([loadPromise, timeoutPromise])
        setSubmissions(allData)
        setPendingSubmissions(pendingData)
      } catch (timeoutError) {
        if (timeoutError.message === "Load submissions timeout") {
          console.warn("Submissions loading timed out, retrying with basic data...")
          // Fallback to just getting pending submissions without daily details
          try {
            const pendingData = await getPendingSubmissions()
            setSubmissions(pendingData)
            setPendingSubmissions(pendingData)
          } catch (fallbackError) {
            console.error("Fallback loading also failed:", fallbackError)
            throw fallbackError
          }
        } else {
          throw timeoutError
        }
      }
    } catch (error) {
      console.error("Error loading submissions:", error)
      toast({
        title: "Error",
        description: "Failed to load timesheet submissions. Some data may be temporarily unavailable.",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)

    try {
      await loadSubmissions()
      toast({
        title: "Success",
        description: "Timesheet submissions refreshed",
      })
    } catch (error) {
      console.error("Error refreshing submissions:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleApprove = async () => {
    if (!selectedSubmission || isProcessing) return
    setIsProcessing(true)

    try {
      const result = await updateSubmissionStatus(selectedSubmission.id, "approved")

      if (result.success) {
        toast({
          title: "Success",
          description: "Timesheet approved successfully",
        })

        // Update local state immediately instead of reloading all data
        const now = new Date()
        const updatedSubmission: TimesheetSubmission = {
          ...selectedSubmission,
          status: "approved",
          approvedBy: "admin", // You might want to get the actual admin email
          approvedAt: now,
        }

        // Update the all submissions list
        setSubmissions((prev) => prev.map((sub) => (sub.id === selectedSubmission.id ? updatedSubmission : sub)))

        // Remove from pending submissions
        setPendingSubmissions((prev) => prev.filter((sub) => sub.id !== selectedSubmission.id))

        setIsApproveDialogOpen(false)
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error approving timesheet:", error)
      toast({
        title: "Error",
        description: "Failed to approve timesheet",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleReject = async () => {
    if (!selectedSubmission || isProcessing) return
    setIsProcessing(true)

    try {
      const result = await updateSubmissionStatus(selectedSubmission.id, "rejected", rejectionComments)

      if (result.success) {
        toast({
          title: "Success",
          description: "Timesheet rejected successfully",
        })

        // Update local state immediately instead of reloading all data
        const now = new Date()
        const updatedSubmission: TimesheetSubmission = {
          ...selectedSubmission,
          status: "rejected",
          approvedBy: "admin", // You might want to get the actual admin email
          approvedAt: now,
          comments: rejectionComments,
        }

        // Update the all submissions list
        setSubmissions((prev) => prev.map((sub) => (sub.id === selectedSubmission.id ? updatedSubmission : sub)))

        // Remove from pending submissions
        setPendingSubmissions((prev) => prev.filter((sub) => sub.id !== selectedSubmission.id))

        setIsRejectDialogOpen(false)
        setRejectionComments("")
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error rejecting timesheet:", error)
      toast({
        title: "Error",
        description: "Failed to reject timesheet",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // Format date for display
  const formatDate = (dateString: string) => {
    return format(new Date(dateString), "MMM d, yyyy")
  }

  // Get status badge
  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">
            <Clock className="h-3 w-3 mr-1" />
            Pending
          </Badge>
        )
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        )
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800 hover:bg-red-100">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        )
      default:
        return null
    }
  }

  // Toggle expanded state for a submission
  const toggleExpand = (id: string) => {
    setExpandedSubmissions((prev) => ({
      ...prev,
      [id]: !prev[id],
    }))
  }

  // View detailed daily breakdown
  const viewDetails = (submission: TimesheetSubmission) => {
    setViewDetailsSubmission(submission)
    setIsDetailsDialogOpen(true)
  }

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0051FF]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">Timesheet Approvals</h2>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="pending" className="relative">
            Pending
            {pendingSubmissions.length > 0 && (
              <span className="absolute top-0 right-0 -mt-1 -mr-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                {pendingSubmissions.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="all">All Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="mt-4">
          {pendingSubmissions.length === 0 ? (
            <Card className="bg-white text-gray-900">
              <CardContent className="pt-6 text-center">
                <p className="text-gray-700">No pending timesheet submissions</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingSubmissions.map((submission) => (
                <Card key={submission.id} className="bg-white text-gray-900">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center text-gray-900">
                          <User className="h-4 w-4 mr-2" />
                          {submission.userId}
                        </CardTitle>
                        <CardDescription>
                          Submitted on {format(submission.submittedAt, "MMM d, yyyy 'at' h:mm a")}
                        </CardDescription>
                      </div>
                      {getStatusBadge(submission.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-700 flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          Week Period
                        </p>
                        <p className="font-medium">
                          {formatDate(submission.startDate)} - {formatDate(submission.endDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-700 flex items-center">
                          <Clock3 className="h-4 w-4 mr-1" />
                          Total Hours
                        </p>
                        <p className="font-medium">{submission.totalHours}</p>
                      </div>
                    </div>

                    {/* Daily breakdown summary */}
                    {submission.dailyDetails && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-gray-700 flex items-center">
                            <FileText className="h-4 w-4 mr-1" />
                            Daily Breakdown
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleExpand(submission.id)}
                          >
                            {expandedSubmissions[submission.id] ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        {expandedSubmissions[submission.id] && (
                          <div className="space-y-2 mt-2 bg-gray-100 p-3 rounded-md">
                            {submission.dailyDetails.map((day: DailyDetail) => (
                              <div
                                key={day.date}
                                className="flex justify-between items-center py-1 border-b last:border-b-0"
                              >
                                <span className="text-sm">
                                  {day.dayOfWeek}, {formatDate(day.date)}
                                </span>
                                <span className="font-medium text-sm">{day.totalHours}</span>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-2 text-xs"
                              onClick={() => viewDetails(submission)}
                            >
                              View Full Details
                            </Button>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="flex justify-end space-x-2 pt-2">
                    <Button
                      variant="outline"
                      className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                      onClick={() => {
                        setSelectedSubmission(submission)
                        setIsRejectDialogOpen(true)
                      }}
                    >
                      <ThumbsDown className="h-4 w-4 mr-1" />
                      Reject
                    </Button>
                    <Button
                      className="bg-green-600 hover:bg-green-700"
                      onClick={() => {
                        setSelectedSubmission(submission)
                        setIsApproveDialogOpen(true)
                      }}
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" />
                      Approve
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="all" className="mt-4">
          {submissions.length === 0 ? (
            <Card className="bg-white text-gray-900">
              <CardContent className="pt-6 text-center">
                <p className="text-gray-700">No timesheet submissions found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <Card key={submission.id} className="bg-white text-gray-900">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center text-gray-900">
                          <User className="h-4 w-4 mr-2" />
                          {submission.userId}
                        </CardTitle>
                        <CardDescription>
                          Submitted on {format(submission.submittedAt, "MMM d, yyyy 'at' h:mm a")}
                        </CardDescription>
                      </div>
                      {getStatusBadge(submission.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm text-gray-700 flex items-center">
                          <Calendar className="h-4 w-4 mr-1" />
                          Week Period
                        </p>
                        <p className="font-medium">
                          {formatDate(submission.startDate)} - {formatDate(submission.endDate)}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-gray-700 flex items-center">
                          <Clock3 className="h-4 w-4 mr-1" />
                          Total Hours
                        </p>
                        <p className="font-medium">{submission.totalHours}</p>
                      </div>
                    </div>

                    {/* Daily breakdown summary for all submissions */}
                    {submission.dailyDetails && (
                      <div className="mt-4">
                        <div className="flex items-center justify-between mb-2">
                          <p className="text-sm font-medium text-gray-700 flex items-center">
                            <FileText className="h-4 w-4 mr-1" />
                            Daily Breakdown
                          </p>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0"
                            onClick={() => toggleExpand(submission.id)}
                          >
                            {expandedSubmissions[submission.id] ? (
                              <ChevronUp className="h-4 w-4" />
                            ) : (
                              <ChevronDown className="h-4 w-4" />
                            )}
                          </Button>
                        </div>

                        {expandedSubmissions[submission.id] && (
                          <div className="space-y-2 mt-2 bg-gray-100 p-3 rounded-md">
                            {submission.dailyDetails.map((day: DailyDetail) => (
                              <div
                                key={day.date}
                                className="flex justify-between items-center py-1 border-b last:border-b-0"
                              >
                                <span className="text-sm">
                                  {day.dayOfWeek}, {formatDate(day.date)}
                                </span>
                                <span className="font-medium text-sm">{day.totalHours}</span>
                              </div>
                            ))}
                            <Button
                              variant="outline"
                              size="sm"
                              className="w-full mt-2 text-xs"
                              onClick={() => viewDetails(submission)}
                            >
                              View Full Details
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {submission.status !== "pending" && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-700">
                          {submission.status === "approved" ? "Approved" : "Rejected"} by {submission.approvedBy}
                          {" on "}
                          {submission.approvedAt && format(submission.approvedAt, "MMM d, yyyy 'at' h:mm a")}
                        </p>

                        {submission.status === "rejected" && submission.comments && (
                          <div className="mt-2 bg-red-50 p-3 rounded-md text-red-800 text-sm">
                            <p className="font-medium mb-1">Rejection Reason:</p>
                            <p>{submission.comments}</p>
                          </div>
                        )}
                      </div>
                    )}
                  </CardContent>

                  {submission.status === "pending" && (
                    <CardFooter className="flex justify-end space-x-2">
                      <Button
                        variant="outline"
                        className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        onClick={() => {
                          setSelectedSubmission(submission)
                          setIsRejectDialogOpen(true)
                        }}
                      >
                        <ThumbsDown className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                      <Button
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          setSelectedSubmission(submission)
                          setIsApproveDialogOpen(true)
                        }}
                      >
                        <ThumbsUp className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </CardFooter>
                  )}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Approve Dialog */}
      <Dialog open={isApproveDialogOpen} onOpenChange={setIsApproveDialogOpen}>
        <DialogContent className="bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Approve Timesheet</DialogTitle>
            <DialogDescription>Are you sure you want to approve this timesheet?</DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-sm text-gray-700">Employee</p>
                  <p className="font-medium">{selectedSubmission.userId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Week Period</p>
                  <p className="font-medium">
                    {formatDate(selectedSubmission.startDate)} - {formatDate(selectedSubmission.endDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Total Hours</p>
                  <p className="font-medium">{selectedSubmission.totalHours}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Submitted On</p>
                  <p className="font-medium">{format(selectedSubmission.submittedAt, "MMM d, yyyy")}</p>
                </div>
              </div>

              {/* Show daily summary in approval dialog */}
              {selectedSubmission.dailyDetails && (
                <div className="mt-4 border-t pt-4">
                  <h3 className="text-sm font-medium mb-2">Daily Hours Summary</h3>
                  <div className="bg-gray-50 p-3 rounded-md">
                    {selectedSubmission.dailyDetails.map((day: DailyDetail) => (
                      <div key={day.date} className="flex justify-between items-center py-1 border-b last:border-b-0">
                        <span className="text-sm">
                          {day.dayOfWeek}, {formatDate(day.date)}
                        </span>
                        <span className="font-medium text-sm">{day.totalHours}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsApproveDialogOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button onClick={handleApprove} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
              {isProcessing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Processing...
                </>
              ) : (
                <>
                  <ThumbsUp className="h-4 w-4 mr-1" />
                  Approve Timesheet
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Reject Timesheet</DialogTitle>
            <DialogDescription>Please provide a reason for rejecting this timesheet.</DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-700">Employee</p>
                  <p className="font-medium">{selectedSubmission.userId}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Week Period</p>
                  <p className="font-medium">
                    {formatDate(selectedSubmission.startDate)} - {formatDate(selectedSubmission.endDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Total Hours</p>
                  <p className="font-medium">{selectedSubmission.totalHours}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Submitted On</p>
                  <p className="font-medium">{format(selectedSubmission.submittedAt, "MMM d, yyyy")}</p>
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="comments" className="text-sm font-medium">
                  Rejection Reason
                </label>
                <Textarea
                  id="comments"
                  value={rejectionComments}
                  onChange={(e) => setRejectionComments(e.target.value)}
                  placeholder="Please provide feedback on why this timesheet is being rejected"
                  className="min-h-[100px]"
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRejectDialogOpen(false)} disabled={isProcessing}>
              Cancel
            </Button>
            <Button
              onClick={handleReject}
              disabled={isProcessing || !rejectionComments.trim()}
              className="bg-red-600 hover:bg-red-700"
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

      {/* Details Dialog */}
      <Dialog open={isDetailsDialogOpen} onOpenChange={setIsDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto bg-white text-gray-900">
          <DialogHeader>
            <DialogTitle>Timesheet Details</DialogTitle>
            <DialogDescription>
              {viewDetailsSubmission && (
                <>
                  {viewDetailsSubmission.userId} - Week of {formatDate(viewDetailsSubmission.startDate)} to{" "}
                  {formatDate(viewDetailsSubmission.endDate)}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {viewDetailsSubmission && viewDetailsSubmission.dailyDetails && (
            <div className="py-4 space-y-6">
              {viewDetailsSubmission.dailyDetails.map((day: DailyDetail) => (
                <div key={day.date} className="border rounded-md overflow-hidden">
                  <div className="bg-gray-100 p-3 flex justify-between items-center">
                    <h3 className="font-medium text-gray-900">
                      {day.dayOfWeek}, {formatDate(day.date)}
                    </h3>
                    <span className="font-bold">{day.totalHours}</span>
                  </div>

                  <div className="p-3">
                    {day.entries.length > 0 ? (
                      <div className="space-y-3">
                        {day.entries.map((entry: EntryDetail) => (
                          <div key={entry.id} className="bg-white p-3 rounded border">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center">
                                  <Briefcase className="h-4 w-4 mr-1 text-gray-500" />
                                  <span className="font-medium">{entry.projectTitle}</span>
                                </div>
                                <div className="ml-5 text-gray-800">
                                  {entry.taskTitle} / {entry.subtaskTitle}
                                </div>
                              </div>
                              <span className="font-medium">{entry.hours}</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-gray-700 italic">No entries for this day</p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDetailsDialogOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
