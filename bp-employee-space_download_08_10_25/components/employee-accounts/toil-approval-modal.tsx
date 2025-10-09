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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import {
  CheckCircle,
  XCircle,
  Clock,
  RefreshCw,
  ThumbsUp,
  ThumbsDown,
  Clock3,
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  PiggyBank,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import type { TOILSubmission, TOILEntry } from "@/lib/toil-types"

interface TOILApprovalModalProps {
  userEmail: string
  userName?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onApproved: () => void
}

export default function TOILApprovalModal({
  userEmail,
  userName = userEmail,
  open,
  onOpenChange,
  onApproved,
}: TOILApprovalModalProps) {
  const [submissions, setSubmissions] = useState<TOILSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [selectedSubmission, setSelectedSubmission] = useState<TOILSubmission | null>(null)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectionComments, setRejectionComments] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)
  const [activeSubmissionId, setActiveSubmissionId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState("pending")

  // Load submissions when the modal opens
  useEffect(() => {
    if (open) {
      loadSubmissions()
    }
  }, [open, activeTab])

  const loadSubmissions = async () => {
    setIsLoading(true)
    try {
      // Import functions
      const { getUserTOILSubmissions, getUserPendingTOILSubmissions } = await import("@/lib/actions/toil-actions")

      // Implement retry logic with exponential backoff
      const fetchWithRetry = async (
        fetchFn: () => Promise<TOILSubmission[]>,
        maxRetries = 3,
      ): Promise<TOILSubmission[]> => {
        let retries = 0

        while (retries < maxRetries) {
          try {
            return await fetchFn()
          } catch (error) {
            retries++
            console.log(`Retry attempt ${retries} after error:`, error)

            if (retries >= maxRetries) {
              throw error
            }

            // Exponential backoff: wait longer between each retry
            await new Promise((resolve) => setTimeout(resolve, 1000 * Math.pow(2, retries)))
          }
        }

        return [] // Fallback if all retries fail
      }

      // Get all submissions or pending submissions based on active tab
      const toilSubmissions = await fetchWithRetry(() =>
        activeTab === "pending" ? getUserPendingTOILSubmissions(userEmail) : getUserTOILSubmissions(userEmail),
      )

      // Ensure we have a valid array
      const validSubmissions = Array.isArray(toilSubmissions) ? toilSubmissions : []
      setSubmissions(validSubmissions)

      // Set the first submission as active if available
      if (validSubmissions.length > 0) {
        setActiveSubmissionId(validSubmissions[0].id)
      } else {
        setActiveSubmissionId(null)
      }
    } catch (error) {
      console.error("Error loading TOIL submissions:", error)
      toast({
        title: "Error",
        description: "Failed to load TOIL submissions. Please try again later.",
        variant: "destructive",
      })
      setSubmissions([])
      setActiveSubmissionId(null)
    } finally {
      setIsLoading(false)
    }
  }

  const handleStatusUpdate = async (submission: TOILSubmission, status: "approved" | "rejected", comments?: string) => {
    setIsProcessing(true)
    try {
      const { updateTOILSubmissionStatus } = await import("@/lib/actions/toil-actions")

      const result = await updateTOILSubmissionStatus(submission.id, status, comments)

      if (result.success) {
        toast({
          title: "Success",
          description: `TOIL request ${status} successfully`,
        })

        // Remove the processed submission from the list
        setSubmissions(submissions.filter((s) => s.id !== submission.id))

        // Close the reject dialog if open
        if (status === "rejected") {
          setIsRejectDialogOpen(false)
          setRejectionComments("")
        }

        // Notify parent component
        onApproved()

        // If no more submissions, close the modal
        if (submissions.length <= 1) {
          setTimeout(() => onOpenChange(false), 500)
        } else {
          // Set the next submission as active
          const nextSubmission = submissions.find((s) => s.id !== submission.id)
          if (nextSubmission) {
            setActiveSubmissionId(nextSubmission.id)
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
      console.error(`Error ${status} TOIL request:`, error)
      toast({
        title: "Error",
        description: `Failed to ${status} TOIL request`,
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
  }

  const handleApprove = (submission: TOILSubmission) => {
    handleStatusUpdate(submission, "approved")
  }

  const openRejectDialog = (submission: TOILSubmission) => {
    setSelectedSubmission(submission)
    setRejectionComments("")
    setIsRejectDialogOpen(true)
  }

  const handleReject = () => {
    if (!selectedSubmission) return
    handleStatusUpdate(selectedSubmission, "rejected", rejectionComments)
  }

  // Format date for display
  const formatDateStr = (dateString: string) => {
    if (!dateString) return "N/A"
    try {
      return format(new Date(dateString), "MMM d, yyyy")
    } catch (error) {
      console.error("Error formatting date:", error)
      return "Invalid Date"
    }
  }

  // Parse time string (HH:MM) to minutes
  const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0

    try {
      const [hours, minutes] = timeStr.split(":").map(Number)
      return (hours || 0) * 60 + (minutes || 0)
    } catch (error) {
      console.error("Error parsing time:", error)
      return 0
    }
  }

  // Format minutes to time string (HH:MM)
  const formatMinutesToTime = (minutes: number): string => {
    if (minutes === undefined || minutes === null || isNaN(minutes)) return "00:00"

    const absMinutes = Math.abs(minutes)
    const hours = Math.floor(absMinutes / 60)
    const mins = absMinutes % 60

    return `${minutes < 0 ? "-" : ""}${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`
  }

  // Get day name from date
  const getDayName = (dateString: string) => {
    if (!dateString) return "N/A"
    try {
      return format(new Date(dateString), "EEEE")
    } catch (error) {
      console.error("Error getting day name:", error)
      return "Invalid Date"
    }
  }

  // Calculate total requested and used hours
  const calculateTOILTotals = (entries: TOILEntry[] | undefined) => {
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return { requestedMinutes: 0, usedMinutes: 0, netMinutes: 0 }
    }

    const totals = entries.reduce(
      (acc, entry) => {
        if (!entry) return acc

        const requestedMinutes = parseTimeToMinutes(entry.requestedHours || "00:00")
        const usedMinutes = parseTimeToMinutes(entry.usedHours || "00:00")

        return {
          requestedMinutes: acc.requestedMinutes + requestedMinutes,
          usedMinutes: acc.usedMinutes + usedMinutes,
          netMinutes: acc.netMinutes + (requestedMinutes - usedMinutes),
        }
      },
      { requestedMinutes: 0, usedMinutes: 0, netMinutes: 0 },
    )

    return totals
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

  // Render TOIL summary
  const renderTOILSummary = (entries: TOILEntry[] | undefined) => {
    const { requestedMinutes, usedMinutes, netMinutes } = calculateTOILTotals(entries)

    return (
      <div className="grid grid-cols-3 gap-4 mt-4 mb-2">
        <div className="bg-blue-50 p-3 rounded-md">
          <div className="flex items-center text-blue-700 mb-1">
            <ArrowUpRight className="h-4 w-4 mr-1" />
            <span className="text-sm font-medium">Hours Worked</span>
          </div>
          <p className="text-lg font-bold text-blue-800">{formatMinutesToTime(requestedMinutes)}</p>
        </div>

        <div className="bg-amber-50 p-3 rounded-md">
          <div className="flex items-center text-amber-700 mb-1">
            <ArrowDownLeft className="h-4 w-4 mr-1" />
            <span className="text-sm font-medium">Hours Used</span>
          </div>
          <p className="text-lg font-bold text-amber-800">{formatMinutesToTime(usedMinutes)}</p>
        </div>

        <div className="bg-emerald-50 p-3 rounded-md">
          <div className="flex items-center text-emerald-700 mb-1">
            <Scale className="h-4 w-4 mr-1" />
            <span className="text-sm font-medium">Net Hours</span>
          </div>
          <p className={`text-lg font-bold ${netMinutes >= 0 ? "text-emerald-800" : "text-red-600"}`}>
            {formatMinutesToTime(netMinutes)}
          </p>
        </div>
      </div>
    )
  }

  // Render TOIL entries table
  const renderTOILEntries = (entries: TOILEntry[] | undefined) => {
    if (!entries || !Array.isArray(entries) || entries.length === 0) {
      return <div className="text-center py-3 text-gray-700">No TOIL entries found for this submission</div>
    }

    return (
      <div className="mt-4">
        <h4 className="text-sm font-medium text-gray-900 mb-2 flex items-center">
          <Clock3 className="h-4 w-4 mr-1" />
          TOIL Transactions
        </h4>
        <div className="border rounded-md overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="bg-gray-50">
                <TableHead className="text-gray-900">Day</TableHead>
                <TableHead className="text-gray-900">Date</TableHead>
                <TableHead className="text-gray-900 text-right">Hours Worked</TableHead>
                <TableHead className="text-gray-900 text-right">Hours Used</TableHead>
                <TableHead className="text-gray-900 text-right">Net Hours</TableHead>
                <TableHead className="text-gray-900">Comments</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => {
                const requestedMinutes = parseTimeToMinutes(entry?.requestedHours || "00:00")
                const usedMinutes = parseTimeToMinutes(entry?.usedHours || "00:00")
                const netMinutes = requestedMinutes - usedMinutes

                return (
                  <TableRow key={index} className="text-gray-900">
                    <TableCell className="font-medium">{entry?.date ? getDayName(entry.date) : "N/A"}</TableCell>
                    <TableCell>{entry?.date ? formatDateStr(entry.date) : "N/A"}</TableCell>
                    <TableCell className="text-right font-medium text-blue-700">
                      {formatMinutesToTime(requestedMinutes)}
                    </TableCell>
                    <TableCell className="text-right font-medium text-amber-700">
                      {formatMinutesToTime(usedMinutes)}
                    </TableCell>
                    <TableCell
                      className={`text-right font-medium ${netMinutes >= 0 ? "text-emerald-700" : "text-red-600"}`}
                    >
                      {formatMinutesToTime(netMinutes)}
                    </TableCell>
                    <TableCell>{entry?.comments || "-"}</TableCell>
                  </TableRow>
                )
              })}
              <TableRow className="bg-gray-50 font-bold">
                <TableCell colSpan={2} className="text-gray-900">
                  Totals
                </TableCell>
                <TableCell className="text-right text-blue-800">
                  {formatMinutesToTime(calculateTOILTotals(entries).requestedMinutes)}
                </TableCell>
                <TableCell className="text-right text-amber-800">
                  {formatMinutesToTime(calculateTOILTotals(entries).usedMinutes)}
                </TableCell>
                <TableCell
                  className={`text-right ${calculateTOILTotals(entries).netMinutes >= 0 ? "text-emerald-800" : "text-red-700"}`}
                >
                  {formatMinutesToTime(calculateTOILTotals(entries).netMinutes)}
                </TableCell>
                <TableCell></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </div>
    )
  }

  // Get the active submission
  const activeSubmission = submissions.find((s) => s.id === activeSubmissionId) || null

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white text-gray-900 border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900">TOIL Review for {userName}</DialogTitle>
            <DialogDescription className="text-gray-700">
              Review and approve Time in Lieu requests submitted by this employee
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
                <p className="text-gray-700">No {activeTab === "pending" ? "pending" : ""} TOIL submissions found</p>
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
                              {formatDateStr(submission.weekStartDate)} - {formatDateStr(submission.weekEndDate)}
                            </p>
                            <p className="text-sm text-gray-700">
                              Submitted on {formatDateStr(submission.submittedAt)}
                            </p>
                          </div>
                          {getStatusBadge(submission.status)}
                        </div>
                        <div className="mt-2">
                          <p className="text-sm text-gray-900">
                            <strong>Net Hours:</strong>{" "}
                            <span
                              className={
                                calculateTOILTotals(submission.entries).netMinutes >= 0
                                  ? "text-emerald-700"
                                  : "text-red-600"
                              }
                            >
                              {formatMinutesToTime(calculateTOILTotals(submission.entries).netMinutes)}
                            </span>
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
                          <p className="text-sm text-gray-700">
                            Week of {formatDateStr(activeSubmission.weekStartDate)} to{" "}
                            {formatDateStr(activeSubmission.weekEndDate)}
                          </p>
                        </div>
                        {getStatusBadge(activeSubmission.status)}
                      </div>

                      <div className="border rounded-md p-4 bg-gray-50 text-gray-900">
                        <h4 className="font-medium mb-2 flex items-center text-gray-900">
                          <PiggyBank className="h-4 w-4 mr-2" />
                          TOIL Summary
                        </h4>

                        {/* TOIL Summary */}
                        {renderTOILSummary(activeSubmission.entries)}

                        {/* Display TOIL entries */}
                        {renderTOILEntries(activeSubmission.entries)}

                        {activeSubmission.comments && (
                          <div className="mt-4 bg-gray-100 p-3 rounded-md text-gray-800">
                            <p className="text-sm font-medium text-gray-700">Employee Comments:</p>
                            <p className="text-sm">{activeSubmission.comments}</p>
                          </div>
                        )}

                        {activeSubmission.status !== "pending" && (
                          <div className="mt-4 pt-4 border-t">
                            <p className="text-sm text-gray-700">
                              {activeSubmission.status === "approved" ? "Approved" : "Rejected"} by{" "}
                              {activeSubmission.approvedBy}
                              {activeSubmission.approvedAt && ` on ${formatDateStr(activeSubmission.approvedAt)}`}
                            </p>
                          </div>
                        )}
                      </div>

                      {activeSubmission.status === "pending" && (
                        <div className="flex justify-end space-x-2">
                          <Button
                            variant="outline"
                            className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
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
                      )}
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
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="bg-white text-gray-900 border border-gray-200">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Reject TOIL Request</DialogTitle>
            <DialogDescription className="text-gray-700">
              Please provide a reason for rejecting this TOIL request.
            </DialogDescription>
          </DialogHeader>

          {selectedSubmission && (
            <div className="py-4">
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm text-gray-600">Week Period</p>
                  <p className="font-medium text-gray-900">
                    {formatDateStr(selectedSubmission.weekStartDate)} - {formatDateStr(selectedSubmission.weekEndDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-600">Net Hours</p>
                  <p
                    className={`font-medium ${calculateTOILTotals(selectedSubmission.entries).netMinutes >= 0 ? "text-emerald-700" : "text-red-600"}`}
                  >
                    {formatMinutesToTime(calculateTOILTotals(selectedSubmission.entries).netMinutes)}
                  </p>
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
                  placeholder="Please provide feedback on why this TOIL request is being rejected"
                  className="min-h-[100px] text-gray-900"
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
                  Reject TOIL Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
