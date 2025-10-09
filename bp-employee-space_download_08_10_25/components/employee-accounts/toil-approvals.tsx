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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
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
  ArrowUpRight,
  ArrowDownLeft,
  Scale,
  PiggyBank,
} from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import type { TOILSubmission, TOILEntry } from "@/lib/toil-types"

export default function TOILApprovals() {
  const [submissions, setSubmissions] = useState<TOILSubmission[]>([])
  const [pendingSubmissions, setPendingSubmissions] = useState<TOILSubmission[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState("pending")

  // For approval/rejection dialog
  const [selectedSubmission, setSelectedSubmission] = useState<TOILSubmission | null>(null)
  const [isApproveDialogOpen, setIsApproveDialogOpen] = useState(false)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectionComments, setRejectionComments] = useState("")
  const [isProcessing, setIsProcessing] = useState(false)

  // Load submissions
  useEffect(() => {
    loadSubmissions()
  }, [])

  const loadSubmissions = async () => {
    setIsLoading(true)
    try {
      // Import functions
      const { getAllTOILSubmissions, getPendingTOILSubmissions } = await import("@/lib/actions/toil-actions")

      // Get all submissions
      const allSubmissions = await getAllTOILSubmissions()
      setSubmissions(allSubmissions)

      // Get pending submissions
      const pending = await getPendingTOILSubmissions()
      setPendingSubmissions(pending)
    } catch (error) {
      console.error("Error loading submissions:", error)
      toast({
        title: "Error",
        description: "Failed to load TOIL submissions",
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
        description: "TOIL submissions refreshed",
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
      const { updateTOILSubmissionStatus } = await import("@/lib/actions/toil-actions")

      const result = await updateTOILSubmissionStatus(selectedSubmission.id, "approved")

      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        })

        // Update local state
        setSubmissions((prev) =>
          prev.map((s) => (s.id === selectedSubmission.id ? { ...s, status: "approved", approvedAt: new Date() } : s)),
        )
        setPendingSubmissions((prev) => prev.filter((s) => s.id !== selectedSubmission.id))

        setIsApproveDialogOpen(false)
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to approve TOIL submission",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error approving TOIL submission:", error)
      toast({
        title: "Error",
        description: "Failed to approve TOIL submission",
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
      const { updateTOILSubmissionStatus } = await import("@/lib/actions/toil-actions")

      const result = await updateTOILSubmissionStatus(selectedSubmission.id, "rejected", rejectionComments)

      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        })

        // Update local state
        setSubmissions((prev) =>
          prev.map((s) =>
            s.id === selectedSubmission.id
              ? { ...s, status: "rejected", approvedAt: new Date(), comments: rejectionComments }
              : s,
          ),
        )
        setPendingSubmissions((prev) => prev.filter((s) => s.id !== selectedSubmission.id))

        setIsRejectDialogOpen(false)
        setRejectionComments("")
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to reject TOIL submission",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error rejecting TOIL submission:", error)
      toast({
        title: "Error",
        description: "Failed to reject TOIL submission",
        variant: "destructive",
      })
    } finally {
      setIsProcessing(false)
    }
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

  if (isLoading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#0051FF]"></div>
      </div>
    )
  }

  return (
    <div className="space-y-4 text-gray-900">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold text-gray-900">TOIL Approvals</h2>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isRefreshing}>
          <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </Button>
      </div>

      <Tabs defaultValue="pending" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2 text-gray-900">
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
            <Card className="bg-white border border-gray-200">
              <CardContent className="pt-6 text-center text-gray-900">
                <p className="text-gray-900">No pending TOIL submissions</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {pendingSubmissions.map((submission) => (
                <Card key={submission.id} className="bg-white border border-gray-200">
                  <CardHeader className="text-gray-900 pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center text-gray-900">
                          <User className="h-4 w-4 mr-2" />
                          {submission.userId}
                        </CardTitle>
                        <CardDescription className="text-gray-700">
                          Submitted on {format(new Date(submission.submittedAt), "MMM d, yyyy 'at' h:mm a")}
                        </CardDescription>
                      </div>
                      {getStatusBadge(submission.status)}
                    </div>
                  </CardHeader>
                  <CardContent className="pb-2 text-gray-900">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center text-gray-700">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span className="text-sm">Week Period: </span>
                        <span className="font-medium ml-1">
                          {formatDateStr(submission.weekStartDate)} - {formatDateStr(submission.weekEndDate)}
                        </span>
                      </div>

                      <div className="flex items-center text-gray-700">
                        <PiggyBank className="h-4 w-4 mr-1" />
                        <span className="text-sm">Current TOIL Balance: </span>
                        <span
                          className={`font-medium ml-1 ${
                            calculateTOILTotals(submission.entries).netMinutes >= 0
                              ? "text-emerald-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatMinutesToTime(calculateTOILTotals(submission.entries).netMinutes)}
                        </span>
                      </div>
                    </div>

                    {/* TOIL Summary */}
                    {renderTOILSummary(submission.entries)}

                    {/* Display TOIL entries */}
                    {renderTOILEntries(submission.entries)}

                    {submission.comments && (
                      <div className="mt-4 bg-gray-100 p-3 rounded-md text-gray-900">
                        <p className="text-sm font-medium text-gray-700">Comments:</p>
                        <p className="text-sm text-gray-800">{submission.comments}</p>
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
                <p className="text-gray-700">No TOIL submissions found</p>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-4">
              {submissions.map((submission) => (
                <Card key={submission.id} className="bg-white text-gray-900">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg flex items-center">
                          <User className="h-4 w-4 mr-2" />
                          {submission.userId}
                        </CardTitle>
                        <CardDescription>
                          Submitted on {format(new Date(submission.submittedAt), "MMM d, yyyy 'at' h:mm a")}
                        </CardDescription>
                      </div>
                      {getStatusBadge(submission.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex justify-between items-center">
                      <div className="flex items-center text-gray-700">
                        <Calendar className="h-4 w-4 mr-1" />
                        <span className="text-sm">Week Period: </span>
                        <span className="font-medium ml-1">
                          {formatDateStr(submission.weekStartDate)} - {formatDateStr(submission.weekEndDate)}
                        </span>
                      </div>

                      <div className="flex items-center text-gray-700">
                        <PiggyBank className="h-4 w-4 mr-1" />
                        <span className="text-sm">TOIL Balance: </span>
                        <span
                          className={`font-medium ml-1 ${
                            calculateTOILTotals(submission.entries).netMinutes >= 0
                              ? "text-emerald-700"
                              : "text-red-600"
                          }`}
                        >
                          {formatMinutesToTime(calculateTOILTotals(submission.entries).netMinutes)}
                        </span>
                      </div>
                    </div>

                    {/* TOIL Summary */}
                    {renderTOILSummary(submission.entries)}

                    {/* Display TOIL entries */}
                    {renderTOILEntries(submission.entries)}

                    {submission.comments && (
                      <div className="mt-4 bg-gray-100 p-3 rounded-md text-gray-900">
                        <p className="text-sm font-medium text-gray-700">Comments:</p>
                        <p className="text-sm text-gray-800">{submission.comments}</p>
                      </div>
                    )}

                    {submission.status !== "pending" && (
                      <div className="mt-4 pt-4 border-t">
                        <p className="text-sm text-gray-700">
                          {submission.status === "approved" ? "Approved" : "Rejected"} by {submission.approvedBy}
                          {" on "}
                          {submission.approvedAt && format(new Date(submission.approvedAt), "MMM d, yyyy 'at' h:mm a")}
                        </p>
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
        <DialogContent className="bg-white border border-gray-200 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Approve TOIL Request</DialogTitle>
            <DialogDescription className="text-gray-700">
              Review the TOIL request details before approving
            </DialogDescription>
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
                    {formatDateStr(selectedSubmission.weekStartDate)} - {formatDateStr(selectedSubmission.weekEndDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Submitted On</p>
                  <p className="font-medium">{format(new Date(selectedSubmission.submittedAt), "MMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Net TOIL Hours</p>
                  <p
                    className={`font-medium ${
                      calculateTOILTotals(selectedSubmission.entries).netMinutes >= 0
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {formatMinutesToTime(calculateTOILTotals(selectedSubmission.entries).netMinutes)}
                  </p>
                </div>
              </div>

              {/* TOIL Summary */}
              {renderTOILSummary(selectedSubmission.entries)}

              {/* Display TOIL entries in the dialog */}
              {renderTOILEntries(selectedSubmission.entries)}

              {selectedSubmission.comments && (
                <div className="mt-4 bg-gray-100 p-3 rounded-md text-gray-900">
                  <p className="text-sm font-medium text-gray-700">Comments:</p>
                  <p className="text-sm text-gray-800">{selectedSubmission.comments}</p>
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
                  Approve TOIL Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject Dialog */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="bg-white border border-gray-200 max-w-3xl">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Reject TOIL Request</DialogTitle>
            <DialogDescription className="text-gray-700">
              Please provide a reason for rejecting this TOIL request
            </DialogDescription>
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
                    {formatDateStr(selectedSubmission.weekStartDate)} - {formatDateStr(selectedSubmission.weekEndDate)}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Submitted On</p>
                  <p className="font-medium">{format(new Date(selectedSubmission.submittedAt), "MMM d, yyyy")}</p>
                </div>
                <div>
                  <p className="text-sm text-gray-700">Net TOIL Hours</p>
                  <p
                    className={`font-medium ${
                      calculateTOILTotals(selectedSubmission.entries).netMinutes >= 0
                        ? "text-emerald-700"
                        : "text-red-600"
                    }`}
                  >
                    {formatMinutesToTime(calculateTOILTotals(selectedSubmission.entries).netMinutes)}
                  </p>
                </div>
              </div>

              {/* TOIL Summary */}
              {renderTOILSummary(selectedSubmission.entries)}

              {/* Display TOIL entries in the dialog */}
              {renderTOILEntries(selectedSubmission.entries)}

              <div className="space-y-2 mt-4">
                <label htmlFor="comments" className="text-sm font-medium text-gray-900">
                  Rejection Reason
                </label>
                <Textarea
                  id="comments"
                  value={rejectionComments}
                  onChange={(e) => setRejectionComments(e.target.value)}
                  placeholder="Please provide feedback on why this TOIL request is being rejected"
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
                  Reject TOIL Request
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
