"use client"

import { Button } from "@/components/ui/button"
import { ChevronLeft, ChevronRight, CalendarIcon } from "lucide-react"
import { getWeekRange } from "@/lib/time-utils"
import { format } from "date-fns"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { useState } from "react"

interface WeekSelectorProps {
  selectedDate: Date
  onChange: (date: Date) => void
}

export default function WeekSelector({ selectedDate, onChange }: WeekSelectorProps) {
  const { start, end } = getWeekRange(selectedDate)
  const [isCalendarOpen, setIsCalendarOpen] = useState(false)

  const handlePreviousWeek = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() - 7)
    onChange(newDate)
  }

  const handleNextWeek = () => {
    const newDate = new Date(selectedDate)
    newDate.setDate(newDate.getDate() + 7)
    onChange(newDate)
  }

  const handleCurrentWeek = () => {
    onChange(new Date())
  }

  const handleSelectDate = (date: Date | undefined) => {
    if (date) {
      onChange(date)
      setIsCalendarOpen(false)
    }
  }

  return (
    <div className="flex items-center space-x-2">
      <Button variant="outline" size="sm" onClick={handlePreviousWeek} className="h-8 w-8 p-0">
        <ChevronLeft className="h-4 w-4" />
        <span className="sr-only">Previous week</span>
      </Button>

      <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="h-8 flex items-center gap-2 min-w-[180px] justify-center">
            <CalendarIcon className="h-4 w-4" />
            <span>
              {format(start, "MMM d")} - {format(end, "MMM d, yyyy")}
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-0 z-50" align="center">
          <Calendar mode="single" selected={selectedDate} onSelect={handleSelectDate} initialFocus />
        </PopoverContent>
      </Popover>

      <Button variant="outline" size="sm" onClick={handleCurrentWeek} className="h-8">
        Current Week
      </Button>

      <Button variant="outline" size="sm" onClick={handleNextWeek} className="h-8 w-8 p-0">
        <ChevronRight className="h-4 w-4" />
        <span className="sr-only">Next week</span>
      </Button>
    </div>
  )
}
