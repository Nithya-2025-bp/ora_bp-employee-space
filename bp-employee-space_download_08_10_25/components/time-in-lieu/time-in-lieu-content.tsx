"use client"

import { useState } from "react"
import TimeInLieuSection from "@/components/timesheets/time-in-lieu-section"
import WeekSelector from "@/components/timesheets/week-selector"

interface TimeInLieuContentProps {
  user: any
}

export default function TimeInLieuContent({ user }: TimeInLieuContentProps) {
  const [selectedDate, setSelectedDate] = useState(new Date())
  const [refreshKey, setRefreshKey] = useState(0)

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1)
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-black">Time in Lieu</h1>
      </div>

      {/* Week Navigation */}
      <div className="flex justify-between items-center mb-6">
        <WeekSelector selectedDate={selectedDate} onChange={setSelectedDate} />
      </div>

      {/* Time in Lieu Section */}
      <TimeInLieuSection key={refreshKey} selectedDate={selectedDate} onRefresh={handleRefresh} />
    </div>
  )
}
