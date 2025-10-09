"use client"

import { useState, useEffect } from "react"
import { decimalToHHMM } from "@/lib/time-utils"
import type { TimeEntry } from "@/lib/timesheet-types"

interface PendingChange {
  subtaskId: string
  date: string
  hours: string
}

interface WeeklyTotalProps {
  formattedDates: string[]
  entries: TimeEntry[]
  pendingChanges: PendingChange[]
}

export default function WeeklyTotal({ formattedDates, entries, pendingChanges }: WeeklyTotalProps) {
  const [total, setTotal] = useState("00:00")

  useEffect(() => {
    let totalMinutes = 0

    // Calculate total from existing entries
    entries.forEach((entry) => {
      const [hours, minutes] = entry.hours.split(":").map(Number)
      totalMinutes += hours * 60 + minutes
    })

    // Create a map of original entries to avoid double counting
    const originalEntriesMap = new Map<string, string>()
    entries.forEach((entry) => {
      originalEntriesMap.set(`${entry.subtaskId}-${entry.date}`, entry.hours)
    })

    // Adjust total based on pending changes
    pendingChanges.forEach((change) => {
      const key = `${change.subtaskId}-${change.date}`
      const originalHours = originalEntriesMap.get(key)

      if (originalHours) {
        const [h, m] = originalHours.split(":").map(Number)
        totalMinutes -= h * 60 + m
        originalEntriesMap.delete(key) // Processed, so remove
      }

      if (change.hours) {
        const [h, m] = change.hours.split(":").map(Number)
        totalMinutes += h * 60 + m
      }
    })

    setTotal(decimalToHHMM(totalMinutes / 60))
  }, [entries, pendingChanges])

  return (
    <td colSpan={formattedDates.length} className="p-2 text-center text-black">
      {total}
    </td>
  )
}
