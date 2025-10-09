"use client"

import { DialogFooter } from "@/components/ui/dialog"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Send, CheckCircle, XCircle, Clock, RefreshCw, Calendar, Briefcase, MessageSquare, Info } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { format } from "date-fns"
import { getWeekRange } from "@/lib/time-utils"
import {
  submitTimesheet,
  checkTimesheetSubmission,
  cancelTimesheetSubmission,
  type TimesheetSubmission as TimesheetSubmissionType,
} from "@/lib/actions/timesheet-approval-actions"

interface TimesheetSubmissionProps {
  selectedDate: Date
  totalHours: string
  hasEntries: boolean
  timeEntries?: any[]
  timesheetRows?: any[]
  isOpen: boolean
  onOpenChange: (open: boolean) => void
  onStatusChange?: () => void
  submissionStatus?: {
    submitted: boolean
    status?: string
    submission?: any
  }
}

export default function TimesheetSubmission({
  selectedDate,
  totalHours,
  hasEntries,
  timeEntries = [],
  timesheetRows = [],
  isOpen,
  onOpenChange,
  onStatusChange,
  submissionStatus: parentSubmissionStatus,
}: TimesheetSubmissionProps) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isCancelling, setIsCancelling] = useState(false)
  const [submissionStatus, setSubmissionStatus] = useState<{
    submitted: boolean
    status?: string
    submission?: TimesheetSubmissionType
  }>({ submitted: false })
  const [isCheckingStatus, setIsCheckingStatus] = useState(true)
  const [activeTab, setActiveTab] = useState("summary")

  useEffect(() => {
    if (parentSubmissionStatus) {
      setSubmissionStatus(parentSubmissionStatus)
    }
  }, [parentSubmissionStatus])

  useEffect(() => {
    if (isOpen && !parentSubmissionStatus) {
      checkSubmissionStatus()
    }
  }, [isOpen])

  const checkSubmissionStatus = async () => {
    setIsCheckingStatus(true)
    try {
      const status = await checkTimesheetSubmission(selectedDate)
      setSubmissionStatus(status)
    } catch (error) {
      console.error("Error checking submission status:", error)
    } finally {
      setIsCheckingStatus(false)
    }
  }

  const handleSubmit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      const result = await submitTimesheet(selectedDate, totalHours, "")

      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        })

        await checkSubmissionStatus()

        if (onStatusChange) {
          onStatusChange()
        }

        onOpenChange(false)
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error submitting timesheet:", error)
      toast({
        title: "Error",
        description: "Failed to submit timesheet",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCancel = async () => {
    if (!submissionStatus.submission || isCancelling) return
    setIsCancelling(true)

    try {
      const result = await cancelTimesheetSubmission(submissionStatus.submission.id)

      if (result.success) {
        toast({
          title: "Success",
          description: "Timesheet submission cancelled successfully",
        })

        setSubmissionStatus({ submitted: false })

        if (onStatusChange) {
          onStatusChange()
        }

        onOpenChange(false)
      } else {
        toast({
          title: "Error",
          description: result.message,
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error cancelling submission:", error)
      toast({
        title: "Error",
        description: "Failed to cancel timesheet submission",
        variant: "destructive",
      })
    } finally {
      setIsCancelling(false)
    }
  }

  const getStatusBadge = () => {
    if (!submissionStatus.submitted || !submissionStatus.status) return null

    switch (submissionStatus.status) {
      case "pending":
        return (
          <Badge className="bg-yellow-100 text-yellow-800">
            <Clock className="h-3 w-3 mr-1" />
            Pending Approval
          </Badge>
        )
      case "approved":
        return (
          <Badge className="bg-green-100 text-green-800">
            <CheckCircle className="h-3 w-3 mr-1" />
            Approved
          </Badge>
        )
      case "rejected":
        return (
          <Badge className="bg-red-100 text-red-800">
            <XCircle className="h-3 w-3 mr-1" />
            Rejected
          </Badge>
        )
      default:
        return null
    }
  }

  const getEntriesByDate = () => {
    const entriesByDate = new Map()
    const dayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]

    const weekDates = []
    const startOfWeek = new Date(selectedDate)
    const day = startOfWeek.getDay()
    const diff = startOfWeek.getDate() - day + (day === 0 ? -6 : 1)
    startOfWeek.setDate(diff)

    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek)
      date.setDate(startOfWeek.getDate() + i)
      const dateStr = format(date, "yyyy-MM-dd")
      weekDates.push({
        date: dateStr,
        dayOfWeek: dayNames[date.getDay()],
        entries: [],
      })
      entriesByDate.set(dateStr, [])
    }

    timeEntries.forEach((entry) => {
      const dateStr = entry.date
      if (!entriesByDate.has(dateStr)) {
        entriesByDate.set(dateStr, [])
      }

      const row = timesheetRows.find((r) => r.subtaskId === entry.subtaskId)

      entriesByDate.get(dateStr).push({
        ...entry,
        projectTitle: row?.projectTitle || "Unknown Project",
        taskTitle: row?.taskTitle || "Unknown Task",
        subtaskTitle: row?.subtaskTitle || "Unknown Subtask",
      })
    })

    return weekDates.map((day) => {
      const entries = entriesByDate.get(day.date) || []
      const totalHours = entries.reduce((total, entry) => {
        const [hours, minutes] = entry.hours.split(":").map(Number)
        return total + hours + minutes / 60
      }, 0)

      const formattedHours = `${Math.floor(totalHours).toString().padStart(2, "0")}:${Math.round((totalHours % 1) * 60)
        .toString()
        .padStart(2, "0")}`

      return {
        ...day,
        entries,
        totalHours: formattedHours,
      }
    })
  }

  const getUniqueProjects = () => {
    const projectMap = new Map()

    timeEntries.forEach((entry) => {
      const row = timesheetRows.find((r) => r.subtaskId === entry.subtaskId)
      if (row) {
        projectMap.set(row.projectId, row.projectTitle)
      }
    })

    return Array.from(projectMap.entries()).map(([id, title]) => ({ id, title }))
  }

  const calculateProjectHours = (projectId) => {
    let totalMinutes = 0

    timeEntries.forEach((entry) => {
      const row = timesheetRows.find((r) => r.subtaskId === entry.subtaskId)
      if (row && row.projectId === projectId) {
        const [hours, minutes] = entry.hours.split(":").map(Number)
        totalMinutes += hours * 60 + minutes
      }
    })

    const hours = Math.floor(totalMinutes / 60)
    const minutes = totalMinutes % 60

    return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
  }

  const canSubmit = !submissionStatus.submitted || submissionStatus.status === "rejected"
  const canCancel = submissionStatus.status === "pending"

  const weekStartDate = getWeekRange(selectedDate).start

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col bg-white">
          <DialogHeader>
            <DialogTitle className="text-black">
              {submissionStatus.status === "pending" ? "Timesheet Submission" : "Submit Timesheet"}
            </DialogTitle>
            <DialogDescription>
              {submissionStatus.status === "pending"
                ? `Your timesheet for the week of ${format(weekStartDate, "MMM d, yyyy")} is pending approval.`
                : `Review your timesheet for the week of ${format(weekStartDate, "MMM d, yyyy")} before submitting for approval.`}
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-sm text-gray-500">Week Starting</p>
                <p className="font-medium text-black">{format(weekStartDate, "MMM d, yyyy")}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Hours</p>
                <p className="font-medium text-black">{totalHours}</p>
              </div>
            </div>

            <div className="bg-blue-50 border border-blue-200 rounded-md p-3 mb-4">
              <div className="flex items-start">
                <Info className="h-4 w-4 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-blue-700">
                  <p className="font-medium mb-1">Daily Comments & Tickets</p>
                  <p>
                    Use the <strong>"Daily Comments"</strong> button on the timesheet screen to add detailed comments
                    and tickets for each day. These comments are now managed separately from individual time entries and
                    provide better organization for weekly feedback.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex-1 overflow-auto">
              <div className="tabs flex border-b mb-4">
                <button
                  className={`px-4 py-2 ${activeTab === "summary" ? "border-b-2 border-[#0051FF] text-[#0051FF]" : "text-gray-500"}`}
                  onClick={() => setActiveTab("summary")}
                >
                  Summary
                </button>
                <button
                  className={`px-4 py-2 ${activeTab === "daily" ? "border-b-2 border-[#0051FF] text-[#0051FF]" : "text-gray-500"}`}
                  onClick={() => setActiveTab("daily")}
                >
                  Daily Details
                </button>
                <button
                  className={`px-4 py-2 ${activeTab === "projects" ? "border-b-2 border-[#0051FF] text-[#0051FF]" : "text-gray-500"}`}
                  onClick={() => setActiveTab("projects")}
                >
                  Projects
                </button>
              </div>

              {activeTab === "summary" && (
                <div className="space-y-6">
                  <div className="grid grid-cols-7 gap-2">
                    {getEntriesByDate().map((day) => (
                      <div key={day.date} className="border rounded-md p-2 text-center">
                        <div className="font-medium text-black">{day.dayOfWeek}</div>
                        <div className="text-sm text-gray-500">{format(new Date(day.date), "MMM d")}</div>
                        <div className="text-lg font-bold mt-1 text-black">{day.totalHours}</div>
                        <div className="text-xs text-gray-500 mt-1">
                          {day.entries.length} {day.entries.length === 1 ? "entry" : "entries"}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <h3 className="text-md font-medium mb-2 text-black">Project Summary</h3>
                    <div className="space-y-2">
                      {getUniqueProjects().map((project) => (
                        <div key={project.id} className="flex justify-between items-center border-b pb-2">
                          <div className="flex items-center">
                            <Briefcase className="h-4 w-4 mr-2 text-gray-500" />
                            <span className="text-black">{project.title}</span>
                          </div>
                          <span className="font-medium text-black">{calculateProjectHours(project.id)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "daily" && (
                <div className="space-y-6">
                  {getEntriesByDate().map((day) => (
                    <div key={day.date} className="border rounded-md p-4">
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-medium text-lg text-black">
                          {day.dayOfWeek} ({format(new Date(day.date), "MMM d, yyyy")})
                        </h3>
                        <Badge className="bg-blue-100 text-blue-800">{day.totalHours} hours</Badge>
                      </div>

                      {day.entries.length === 0 ? (
                        <p className="text-gray-500 italic">No entries for this day</p>
                      ) : (
                        <div className="space-y-3">
                          {day.entries.map((entry) => (
                            <div key={entry.id} className="bg-gray-50 p-3 rounded-md">
                              <div className="flex justify-between items-start mb-2">
                                <div>
                                  <div className="font-medium text-black">{entry.projectTitle}</div>
                                  <div className="text-sm text-gray-600">
                                    {entry.taskTitle} &gt; {entry.subtaskTitle}
                                  </div>
                                </div>
                                <Badge variant="outline" className="bg-white text-black">
                                  {entry.hours}
                                </Badge>
                              </div>
                              {entry.notes && (
                                <div className="mt-2 p-2 bg-blue-50 border border-blue-200 rounded text-sm">
                                  <div className="flex items-start">
                                    <MessageSquare className="h-3 w-3 text-blue-600 mr-1 mt-0.5 flex-shrink-0" />
                                    <div className="text-blue-700">
                                      <span className="font-medium">Entry Note:</span> {entry.notes}
                                    </div>
                                  </div>
                                </div>
                              )}
                              {entry.dailyComments && (
                                <div className="mt-2 p-2 bg-purple-50 border border-purple-200 rounded text-sm">
                                  <div className="flex items-start">
                                    <MessageSquare className="h-3 w-3 text-purple-600 mr-1 mt-0.5 flex-shrink-0" />
                                    <div className="text-purple-700">
                                      <span className="font-medium">Daily Comments:</span> {entry.dailyComments}
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {activeTab === "projects" && (
                <div className="space-y-6">
                  {getUniqueProjects().map((project) => {
                    const dailyData = getEntriesByDate()

                    return (
                      <div key={project.id} className="border rounded-md p-4">
                        <div className="flex justify-between items-center mb-3">
                          <h3 className="font-medium text-lg flex items-center text-black">
                            <Briefcase className="h-5 w-5 mr-2 text-gray-500" />
                            {project.title}
                          </h3>
                          <Badge className="bg-blue-100 text-blue-800">{calculateProjectHours(project.id)} hours</Badge>
                        </div>

                        <div className="space-y-4">
                          {dailyData.map((day) => {
                            const projectEntries = day.entries.filter((e) => {
                              const row = timesheetRows.find((r) => r.subtaskId === e.subtaskId)
                              return row && row.projectId === project.id
                            })

                            if (projectEntries.length === 0) return null

                            return (
                              <div key={day.date} className="bg-gray-50 p-3 rounded-md">
                                <div className="flex justify-between items-center mb-2">
                                  <div className="font-medium flex items-center text-black">
                                    <Calendar className="h-4 w-4 mr-1 text-gray-500" />
                                    {day.dayOfWeek} ({format(new Date(day.date), "MMM d")})
                                  </div>
                                  <div className="text-sm text-black">
                                    {projectEntries
                                      .reduce((total, entry) => {
                                        const [h, m] = entry.hours.split(":").map(Number)
                                        return total + h + m / 60
                                      }, 0)
                                      .toFixed(2)}{" "}
                                    hours
                                  </div>
                                </div>

                                <div className="space-y-2 pl-6">
                                  {projectEntries.map((entry) => (
                                    <div key={entry.id} className="flex justify-between text-sm">
                                      <div className="text-black">
                                        {entry.taskTitle} &gt; {entry.subtaskTitle}
                                      </div>
                                      <div className="font-medium text-black">{entry.hours}</div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          <DialogFooter className="mt-4 pt-4 border-t">
            <div className="flex items-center justify-between w-full">
              <div className="flex items-center">
                {submissionStatus.submitted && (
                  <>
                    <span className="mr-2 text-sm text-black">Status:</span>
                    {getStatusBadge()}
                  </>
                )}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting || isCancelling}>
                  Close
                </Button>

                {canCancel && (
                  <Button
                    onClick={handleCancel}
                    disabled={isCancelling}
                    className="bg-red-600 hover:bg-red-700 text-white"
                  >
                    {isCancelling ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Cancelling...
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 mr-1" />
                        Cancel Submission
                      </>
                    )}
                  </Button>
                )}

                {canSubmit && (
                  <Button
                    onClick={handleSubmit}
                    disabled={isSubmitting}
                    className="bg-[#0051FF] hover:bg-[#0051FF]/90 text-white"
                  >
                    {isSubmitting ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Submitting...
                      </>
                    ) : (
                      <>
                        <Send className="h-4 w-4 mr-1" />
                        Submit Timesheet
                      </>
                    )}
                  </Button>
                )}
              </div>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
