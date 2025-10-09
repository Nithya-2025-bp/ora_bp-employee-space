"use client"

import dynamic from "next/dynamic"
import { useState, useEffect, useCallback } from "react"
import { useToast } from "@/hooks/use-toast"
import type { User } from "@/lib/users"
import { formatDate, getWeekRange } from "@/lib/time-utils"

const TimesheetContent = dynamic(() => import("@/components/timesheets/timesheet-content"), {
  loading: () => (
    <div className="flex flex-col items-center justify-center h-64">
      <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0051FF] border-t-transparent mb-4"></div>
      <p className="text-gray-600">Loading timesheet interface...</p>
    </div>
  ),
  ssr: false,
})

interface TimesheetRow {
  id: string
  userId?: string
  projectId: string
  taskId: string
  subtaskId: string
  projectTitle: string
  taskTitle: string
  subtaskTitle: string
}

interface TimesheetContentClientProps {
  initialAvailableRows: TimesheetRow[]
  user: User
}

export default function TimesheetContentClient({ initialAvailableRows, user }: TimesheetContentClientProps) {
  const [submissionStatusByWeek, setSubmissionStatusByWeek] = useState<
    Map<
      string,
      {
        submitted: boolean
        status?: string
        submission?: any
      }
    >
  >(new Map())
  const [selectedDate, setSelectedDate] = useState<Date>(new Date())
  const { toast } = useToast()

  const getWeekKey = useCallback((date: Date) => {
    const { start, end } = getWeekRange(date)
    return `${formatDate(start)}_${formatDate(end)}`
  }, [])

  const currentWeekKey = getWeekKey(selectedDate)

  const submissionStatus = submissionStatusByWeek.get(currentWeekKey) || { submitted: false }

  const checkSubmissionStatus = useCallback(async () => {
    try {
      const weekKey = getWeekKey(selectedDate)
      console.log(`[v0] Checking submission status for week: ${weekKey}`)

      const { checkTimesheetSubmission } = await import("@/lib/actions/timesheet-approval-actions")
      const status = await checkTimesheetSubmission(selectedDate)

      console.log(`[v0] Received status for week ${weekKey}:`, status)

      setSubmissionStatusByWeek((prev) => {
        const newMap = new Map(prev)
        newMap.set(weekKey, status)
        return newMap
      })
    } catch (error) {
      console.error("Error checking submission status:", error)
    }
  }, [selectedDate, getWeekKey])

  useEffect(() => {
    if (selectedDate) {
      const weekKey = getWeekKey(selectedDate)

      if (!submissionStatusByWeek.has(weekKey)) {
        console.log(`[v0] No cached status for week ${weekKey}, fetching...`)
        const timeoutId = setTimeout(() => {
          checkSubmissionStatus()
        }, 300)

        return () => clearTimeout(timeoutId)
      } else {
        console.log(`[v0] Using cached status for week ${weekKey}`)
      }
    }
  }, [selectedDate, checkSubmissionStatus, getWeekKey, submissionStatusByWeek])

  if (!user || !user.email) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <div className="text-center">
          <p className="text-gray-600">Loading user information...</p>
        </div>
      </div>
    )
  }

  return (
    <TimesheetContent
      initialAvailableRows={initialAvailableRows}
      user={user}
      submissionStatus={submissionStatus}
      onRefreshStatus={checkSubmissionStatus}
      onDateChange={setSelectedDate}
    />
  )
}
