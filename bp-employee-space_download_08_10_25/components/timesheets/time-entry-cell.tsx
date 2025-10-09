"use client"

import type React from "react"
import { useState, useEffect, memo } from "react"
import { Input } from "@/components/ui/input"
import { parseTimeInput } from "@/lib/time-utils"
import type { TimeEntry } from "@/lib/timesheet-types"

interface TimeEntryCellProps {
  projectId: string
  taskId: string
  subtaskId: string
  date: string
  existingEntry?: TimeEntry
  onChange: (hours: string) => void
  isDirty: boolean
  isSaving: boolean
  disabled?: boolean
  isLoadingEntries?: boolean // Keep this new prop
  key?: string
}

const TimeEntryCell = memo(function TimeEntryCell({
  projectId,
  taskId,
  subtaskId,
  date,
  existingEntry,
  onChange,
  isDirty,
  isSaving,
  disabled = false,
  isLoadingEntries = false,
}: TimeEntryCellProps) {
  const [inputValue, setInputValue] = useState(existingEntry?.hours || "")
  const [displayValue, setDisplayValue] = useState(existingEntry?.hours || "")
  const [isFocused, setIsFocused] = useState(false)

  const entryKey = `${subtaskId}-${date}-${existingEntry?.id || "new"}-${existingEntry?.hours || "empty"}`

  useEffect(() => {}, [isDirty, date, displayValue, inputValue])

  useEffect(() => {
    const newHours = existingEntry?.hours || ""
    if (process.env.NODE_ENV === "development" && false) {
      console.log(`TimeEntryCell for ${date} updating from existingEntry:`, {
        entryId: existingEntry?.id,
        hours: newHours,
        entryKey,
      })
    }

    setDisplayValue(newHours)
    setInputValue(newHours)
  }, [existingEntry?.id, existingEntry?.hours, date, entryKey])

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (disabled || isLoadingEntries) return // Don't allow changes when disabled or loading
    setInputValue(e.target.value)
  }

  const handleBlur = () => {
    if (disabled || isLoadingEntries) return

    setIsFocused(false)

    if (!inputValue) {
      setDisplayValue("")
      onChange("")
      return
    }

    const formattedTime = parseTimeInput(inputValue)
    setDisplayValue(formattedTime)

    if (process.env.NODE_ENV === "development" && false) {
      console.log(`Cell for ${date} formatted time: ${formattedTime}, existing: ${existingEntry?.hours}`)
    }

    // Only notify parent if the value has changed
    if (formattedTime !== existingEntry?.hours) {
      onChange(formattedTime)
    }
  }

  const handleFocus = () => {
    if (disabled || isLoadingEntries) return // Don't allow focus when disabled or loading
    setIsFocused(true)
  }

  const cellClass = `h-10 text-center bg-white text-black border-gray-200 
  ${isSaving ? "opacity-50" : ""} 
  ${isDirty && !disabled && !isLoadingEntries ? "border-yellow-400 border-2" : ""}
  ${disabled ? "bg-gray-100 text-gray-500 cursor-not-allowed" : ""}
  ${isLoadingEntries ? "bg-gray-50 animate-pulse cursor-wait" : ""}`

  // Show loading state when entries are being loaded OR when checking submission status
  if (isLoadingEntries) {
    return (
      <div className="relative">
        <Input
          type="text"
          value=""
          className="h-10 text-center bg-gray-50 animate-pulse cursor-wait border-gray-200"
          disabled={true}
          readOnly
          placeholder="..."
        />
      </div>
    )
  }

  return (
    <Input
      type="text"
      value={isLoadingEntries ? "" : isFocused ? (inputValue ?? "") : (displayValue ?? "")}
      onChange={handleChange}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={cellClass}
      placeholder={isLoadingEntries ? "..." : "0:00"}
      maxLength={5}
      disabled={isSaving || disabled || isLoadingEntries}
      title={
        isLoadingEntries
          ? "Loading..."
          : disabled
            ? "Timesheet is submitted - cannot edit"
            : "Enter time in HH:MM format"
      }
    />
  )
})

export default TimeEntryCell
