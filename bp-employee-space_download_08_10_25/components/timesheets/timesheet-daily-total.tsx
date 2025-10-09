"use client"

import { useState, useEffect } from "react"
import { decimalToHHMM } from "@/lib/time-utils"
import type { TimeEntry } from "@/lib/timesheet-types"

interface PendingChange {
  subtaskId: string
  date: string
  hours: string
}

interface DailyTotalProps {
  date: string
  entries: TimeEntry[]
  pendingChanges: PendingChange[]
}

export default function DailyTotal({ date, entries, pendingChanges }: DailyTotalProps) {
  const [total, setTotal] = useState("00:00")

  useEffect(() => {
    let totalMinutes = 0

    // Calculate total from existing entries for the specific date
    entries.forEach((entry) => {
      if (entry.date === date) {
        const [hours, minutes] = entry.hours.split(":").map(Number)
        totalMinutes += hours * 60 + minutes
      }
    })

    // Adjust total based on pending changes for the specific date
    pendingChanges.forEach((change) => {
      if (change.date === date) {
        // Find if there was an original entry for this cell
        const originalEntry = entries.find((entry) => entry.subtaskId === change.subtaskId && entry.date === date)

        // Subtract original value if it exists
        if (originalEntry) {
          const [hours, minutes] = originalEntry.hours.split(":").map(Number)
          totalMinutes -= hours * 60 + minutes
        }

        // Add new value if it's not a deletion
        if (change.hours) {
          const [hours, minutes] = change.hours.split(":").map(Number)
          totalMinutes += hours * 60 + minutes
        }
      }
    })

    setTotal(decimalToHHMM(totalMinutes / 60))
  }, [date, entries, pendingChanges])

  return <td className="p-2 text-center text-black">{total}</td>
}
