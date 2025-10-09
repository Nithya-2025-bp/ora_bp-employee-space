"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Save, RefreshCw, Send, XCircle, CheckCircle, Clock, AlertCircle, Info } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { formatDate, getWeekDates, formatDayMonth, parseTimeInput } from "@/lib/time-utils"
import type { TOILEntry, TOILBalance } from "@/lib/toil-types"

interface TimeInLieuSectionProps {
  selectedDate: Date
  onRefresh: () => void
}

// Interface for tracking input state
interface InputState {
  [date: string]: {
    requestedHours: {
      inputValue: string
      displayValue: string
      isFocused: boolean
      isDirty: boolean
    }
    usedHours: {
      inputValue: string
      displayValue: string
      isFocused: boolean
      isDirty: boolean
    }
  }
}

// Interface for tracking daily balances
interface DailyBalance {
  date: string
  netHours: string
  runningBalance: string
  isNegative: boolean
  runningBalanceMinutes: number
}

// Interface for validation errors
interface ValidationError {
  date: string
  message: string
  type: "maxBalance" | "minBalance" | "maxReduction"
}

export default function TimeInLieuSection({ selectedDate, onRefresh }: TimeInLieuSectionProps) {
  const [entries, setEntries] = useState<TOILEntry[]>([])
  const [balance, setBalance] = useState<TOILBalance | null>(null)
  const [dailyBalances, setDailyBalances] = useState<DailyBalance[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isSubmitDialogOpen, setIsSubmitDialogOpen] = useState(false)
  const [isRulesModalOpen, setIsRulesModalOpen] = useState(false)
  const [comments, setComments] = useState("")
  const [inputState, setInputState] = useState<InputState>({})
  const [isCancelling, setIsCancelling] = useState(false)
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([])
  const [submissionStatus, setSubmissionStatus] = useState<{
    submitted: boolean
    status?: string
  }>({ submitted: false })

  // Constants for validation
  const MAX_BALANCE_HOURS = 40 * 60 // 40 hours in minutes
  const MIN_BALANCE_HOURS = 0 // 0 hours in minutes
  const MAX_REDUCTION_HOURS = 16 * 60 // 16 hours in minutes

  // Generate week dates
  const weekDates = getWeekDates(selectedDate)
  const formattedDates = weekDates.map((date) => formatDate(date))

  // Load TOIL data when component mounts or selected date changes
  useEffect(() => {
    loadData()
  }, [selectedDate])

  // Calculate running balance for each day based on entries
  useEffect(() => {
    calculateDailyBalances()
  }, [entries, balance])

  // Validate entries whenever daily balances change
  useEffect(() => {
    validateEntries()
  }, [dailyBalances])

  const loadData = async () => {
    setIsLoading(true)
    try {
      // Import functions
      const { getTOILEntriesForWeek, getUserTOILBalance, getAllTOILEntries } = await import(
        "@/lib/actions/toil-actions"
      )

      // Get TOIL entries for the selected week
      const weekEntries = await getTOILEntriesForWeek(selectedDate)

      // Get TOIL balance
      const userBalance = await getUserTOILBalance()

      // Get all TOIL entries for calculating historical balance
      const allEntries = await getAllTOILEntries()

      // Initialize entries for each day of the week if they don't exist
      const initializedEntries: TOILEntry[] = []
      const newInputState: InputState = {}

      formattedDates.forEach((date) => {
        const existingEntry = weekEntries.find((entry) => entry.date === date)

        if (existingEntry) {
          initializedEntries.push(existingEntry)
          newInputState[date] = {
            requestedHours: {
              inputValue: existingEntry.requestedHours,
              displayValue: existingEntry.requestedHours,
              isFocused: false,
              isDirty: false,
            },
            usedHours: {
              inputValue: existingEntry.usedHours,
              displayValue: existingEntry.usedHours,
              isFocused: false,
              isDirty: false,
            },
          }
        } else {
          // Create a placeholder entry
          initializedEntries.push({
            id: `temp-${date}`,
            userId: "",
            date,
            requestedHours: "",
            usedHours: "",
            status: "pending",
            createdAt: new Date(),
            updatedAt: new Date(),
            weekStartDate: formatDate(weekDates[0]),
          })
          newInputState[date] = {
            requestedHours: {
              inputValue: "",
              displayValue: "",
              isFocused: false,
              isDirty: false,
            },
            usedHours: {
              inputValue: "",
              displayValue: "",
              isFocused: false,
              isDirty: false,
            },
          }
        }
      })

      setEntries(initializedEntries)
      setInputState(newInputState)
      setBalance(userBalance)
      await checkSubmissionStatus()
    } catch (error) {
      console.error("Error loading TOIL data:", error)
      toast({
        title: "Error",
        description: "Failed to load Time in Lieu data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  // Convert HH:MM format to minutes
  const convertToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0

    // Handle negative values in parentheses
    const isNegative = timeStr.startsWith("(") && timeStr.endsWith(")")
    const cleanTimeStr = isNegative ? timeStr.substring(1, timeStr.length - 1) : timeStr

    const [hours, minutes] = cleanTimeStr.split(":").map(Number)
    return (hours * 60 + minutes) * (isNegative ? -1 : 1)
  }

  // Convert minutes to HH:MM format
  const convertToHHMM = (minutes: number): string => {
    const absMinutes = Math.abs(minutes)
    const hours = Math.floor(absMinutes / 60)
    const mins = absMinutes % 60
    const formattedTime = `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`
    return minutes < 0 ? `(${formattedTime})` : formattedTime
  }

  // Calculate daily balances based on entries
  const calculateDailyBalances = () => {
    if (!entries.length) return

    // Sort entries by date
    const sortedEntries = [...entries].sort((a, b) => {
      return new Date(a.date).getTime() - new Date(b.date).getTime()
    })

    // Get starting balance (this would ideally come from a historical record)
    // For now, we'll use 0 as the starting point
    let runningBalanceMinutes = 0

    // If we have a balance from the database, use it as our starting point
    // This is a simplification - ideally we'd calculate the balance up to the start of this week
    if (balance && balance.totalHours) {
      const [hours, minutes] = balance.totalHours.replace("-", "").split(":").map(Number)
      runningBalanceMinutes = (hours * 60 + minutes) * (balance.totalHours.startsWith("-") ? -1 : 1)
    }

    const newDailyBalances: DailyBalance[] = []

    sortedEntries.forEach((entry) => {
      // Calculate net minutes for this day
      let netMinutes = 0

      if (entry.requestedHours) {
        const [reqHours, reqMinutes] = entry.requestedHours.split(":").map(Number)
        netMinutes += reqHours * 60 + reqMinutes
      }

      if (entry.usedHours) {
        const [usedHours, usedMinutes] = entry.usedHours.split(":").map(Number)
        netMinutes -= usedHours * 60 + usedMinutes
      }

      // Update running balance
      runningBalanceMinutes += netMinutes

      // Format for display
      const absRunningMinutes = Math.abs(runningBalanceMinutes)
      const runningHours = Math.floor(absRunningMinutes / 60)
      const runningMins = absRunningMinutes % 60

      const formattedRunningBalance = `${String(runningHours).padStart(2, "0")}:${String(runningMins).padStart(2, "0")}`

      // Calculate net hours for display
      const absNetMinutes = Math.abs(netMinutes)
      const netHours = Math.floor(absNetMinutes / 60)
      const netMins = absNetMinutes % 60

      const formattedNetHours = `${String(netHours).padStart(2, "0")}:${String(netMins).padStart(2, "0")}`

      newDailyBalances.push({
        date: entry.date,
        netHours: netMinutes < 0 ? `(${formattedNetHours})` : formattedNetHours,
        runningBalance: runningBalanceMinutes < 0 ? `(${formattedRunningBalance})` : formattedRunningBalance,
        isNegative: runningBalanceMinutes < 0,
        runningBalanceMinutes: runningBalanceMinutes,
      })
    })

    setDailyBalances(newDailyBalances)
  }

  // Validate entries against constraints
  const validateEntries = () => {
    if (!dailyBalances.length) return

    const errors: ValidationError[] = []

    // Check if any day's balance exceeds 40 hours
    dailyBalances.forEach((balance) => {
      if (balance.runningBalanceMinutes > MAX_BALANCE_HOURS) {
        errors.push({
          date: balance.date,
          message: `Balance exceeds 40 hours (${convertToHHMM(balance.runningBalanceMinutes)})`,
          type: "maxBalance",
        })
      }

      // Check if any day's balance goes below 0 hours
      if (balance.runningBalanceMinutes < MIN_BALANCE_HOURS) {
        errors.push({
          date: balance.date,
          message: `Balance cannot be negative (${convertToHHMM(balance.runningBalanceMinutes)})`,
          type: "minBalance",
        })
      }
    })

    // Check for reductions greater than 16 hours over consecutive days
    let consecutiveReduction = 0
    let previousBalance = dailyBalances[0].runningBalanceMinutes

    for (let i = 1; i < dailyBalances.length; i++) {
      const currentBalance = dailyBalances[i].runningBalanceMinutes
      const reduction = previousBalance - currentBalance

      if (reduction > 0) {
        consecutiveReduction += reduction

        if (consecutiveReduction > MAX_REDUCTION_HOURS) {
          errors.push({
            date: dailyBalances[i].date,
            message: `Reduction exceeds 16 hours over consecutive days (${convertToHHMM(consecutiveReduction)})`,
            type: "maxReduction",
          })
        }
      } else {
        // Reset consecutive reduction if there's no reduction
        consecutiveReduction = 0
      }

      previousBalance = currentBalance
    }

    setValidationErrors(errors)
  }

  // Check if TOIL is already submitted for the selected week
  const checkSubmissionStatus = async () => {
    try {
      const { checkTOILSubmission } = await import("@/lib/actions/toil-actions")
      const status = await checkTOILSubmission(selectedDate)
      setSubmissionStatus(status)
    } catch (error) {
      console.error("Error checking TOIL submission status:", error)
      setSubmissionStatus({ submitted: false })
    }
  }

  // Handle input change for requested hours
  const handleRequestedHoursChange = (date: string, value: string) => {
    setInputState((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        requestedHours: {
          ...prev[date].requestedHours,
          inputValue: value,
          isDirty: true,
        },
      },
    }))
  }

  // Handle focus for requested hours
  const handleRequestedHoursFocus = (date: string) => {
    setInputState((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        requestedHours: {
          ...prev[date].requestedHours,
          isFocused: true,
        },
      },
    }))
  }

  // Handle blur for requested hours
  const handleRequestedHoursBlur = (date: string) => {
    const currentValue = inputState[date]?.requestedHours?.inputValue || ""

    if (!currentValue) {
      setInputState((prev) => ({
        ...prev,
        [date]: {
          ...prev[date],
          requestedHours: {
            inputValue: "",
            displayValue: "",
            isFocused: false,
            isDirty: false,
          },
        },
      }))

      // Update the entry
      setEntries((prev) => prev.map((entry) => (entry.date === date ? { ...entry, requestedHours: "" } : entry)))
      return
    }

    // Format the time
    const formattedTime = parseTimeInput(currentValue)

    // Update the display value
    setInputState((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        requestedHours: {
          inputValue: formattedTime,
          displayValue: formattedTime,
          isFocused: false,
          isDirty: true,
        },
      },
    }))

    // Update the entry
    setEntries((prev) =>
      prev.map((entry) => (entry.date === date ? { ...entry, requestedHours: formattedTime } : entry)),
    )
  }

  // Handle input change for used hours
  const handleUsedHoursChange = (date: string, value: string) => {
    setInputState((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        usedHours: {
          ...prev[date].usedHours,
          inputValue: value,
          isDirty: true,
        },
      },
    }))
  }

  // Handle focus for used hours
  const handleUsedHoursFocus = (date: string) => {
    setInputState((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        usedHours: {
          ...prev[date].usedHours,
          isFocused: true,
        },
      },
    }))
  }

  // Handle blur for used hours
  const handleUsedHoursBlur = (date: string) => {
    const currentValue = inputState[date]?.usedHours?.inputValue || ""

    if (!currentValue) {
      setInputState((prev) => ({
        ...prev,
        [date]: {
          ...prev[date],
          usedHours: {
            inputValue: "",
            displayValue: "",
            isFocused: false,
            isDirty: false,
          },
        },
      }))

      // Update the entry
      setEntries((prev) => prev.map((entry) => (entry.date === date ? { ...entry, usedHours: "" } : entry)))
      return
    }

    // Format the time
    const formattedTime = parseTimeInput(currentValue)

    // Update the display value
    setInputState((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        usedHours: {
          inputValue: formattedTime,
          displayValue: formattedTime,
          isFocused: false,
          isDirty: true,
        },
      },
    }))

    // Update the entry
    setEntries((prev) => prev.map((entry) => (entry.date === date ? { ...entry, usedHours: formattedTime } : entry)))
  }

  // Save TOIL entries
  const saveChanges = async () => {
    if (
      Object.values(inputState).every((state) => !state.requestedHours.isDirty && !state.usedHours.isDirty) ||
      isSaving
    ) {
      return
    }

    // Check for validation errors before saving
    if (validationErrors.length > 0) {
      toast({
        title: "Validation Error",
        description: "Please fix the validation errors before saving",
        variant: "destructive",
      })
      return
    }

    setIsSaving(true)

    try {
      const { upsertTOILEntry } = await import("@/lib/actions/toil-actions")

      // Only save entries that have non-zero values or are dirty
      const entriesToSave = entries.filter((entry) => {
        const state = inputState[entry.date]
        return (entry.requestedHours || entry.usedHours) && (state?.requestedHours.isDirty || state?.usedHours.isDirty)
      })

      if (entriesToSave.length === 0) {
        toast({
          title: "No Changes",
          description: "No Time in Lieu entries to save",
        })
        setIsSaving(false)
        return
      }

      const results = []
      const errors = []

      // Process each entry sequentially to avoid race conditions
      for (const entry of entriesToSave) {
        try {
          const result = await upsertTOILEntry(entry.date, entry.requestedHours || "00:00", entry.usedHours || "00:00")

          if (result.success) {
            results.push(result.entry)
          } else {
            errors.push({ date: entry.date, message: result.message })
          }
        } catch (error) {
          console.error(`Error saving TOIL entry for ${entry.date}:`, error)
          errors.push({
            date: entry.date,
            message: error instanceof Error ? error.message : "Unknown error",
          })
        }
      }

      if (errors.length > 0) {
        // Show the first error
        toast({
          title: "Error",
          description: errors[0].message || "Failed to save some entries",
          variant: "destructive",
        })
      } else {
        toast({
          title: "Success",
          description: `Saved ${results.length} Time in Lieu entries`,
        })
      }

      // Reset dirty flags
      setInputState((prev) => {
        const newState = { ...prev }
        Object.keys(newState).forEach((date) => {
          newState[date].requestedHours.isDirty = false
          newState[date].usedHours.isDirty = false
        })
        return newState
      })

      // Refresh data
      await loadData()
      // Notify parent to refresh
      onRefresh()
    } catch (error) {
      console.error("Error saving TOIL entries:", error)
      toast({
        title: "Error",
        description: "Failed to save Time in Lieu entries",
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }

  // Submit TOIL entries for approval
  const submitEntries = async () => {
    // Check for validation errors before submitting
    if (validationErrors.length > 0) {
      toast({
        title: "Validation Error",
        description: "Please fix the validation errors before submitting",
        variant: "destructive",
      })
      return
    }

    setIsSubmitDialogOpen(true)
  }

  // Handle actual submission
  const handleSubmit = async () => {
    if (isSubmitting) return
    setIsSubmitting(true)

    try {
      const { submitTOILEntries } = await import("@/lib/actions/toil-actions")
      const result = await submitTOILEntries(selectedDate, comments)

      if (result.success) {
        toast({
          title: "Success",
          description: result.message,
        })
        setIsSubmitDialogOpen(false)
        setComments("")
        await loadData()
        onRefresh()
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to submit Time in Lieu entries",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error submitting TOIL entries:", error)
      toast({
        title: "Error",
        description: "Failed to submit Time in Lieu entries",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Cancel TOIL submission
  const cancelSubmission = async () => {
    if (isCancelling) return
    setIsCancelling(true)

    try {
      const { cancelTOILSubmission } = await import("@/lib/actions/toil-actions")
      // We need the submission ID from the status
      const result = await cancelTOILSubmission(selectedDate)

      if (result.success) {
        toast({
          title: "Success",
          description: "TOIL submission cancelled successfully",
        })

        // Refresh data
        await loadData()
        onRefresh()
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to cancel TOIL submission",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error cancelling TOIL submission:", error)
      toast({
        title: "Error",
        description: "Failed to cancel TOIL submission",
      })
    } finally {
      setIsCancelling(false)
    }
  }

  // Calculate net TOIL hours for a specific day
  const calculateNetHours = (date: string) => {
    const entry = entries.find((e) => e.date === date)
    if (!entry) return "00:00"

    const reqHours = entry.requestedHours || "00:00"
    const usedHours = entry.usedHours || "00:00"

    const [reqH, reqM] = reqHours.split(":").map(Number)
    const [usedH, usedM] = usedHours.split(":").map(Number)

    const reqTotalMinutes = reqH * 60 + reqM
    const usedTotalMinutes = usedH * 60 + usedM
    const netMinutes = reqTotalMinutes - usedTotalMinutes

    const absMinutes = Math.abs(netMinutes)
    const hours = Math.floor(absMinutes / 60)
    const minutes = absMinutes % 60

    const formattedHours = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`
    return netMinutes < 0 ? `(${formattedHours})` : formattedHours
  }

  // Get running balance for a specific day
  const getRunningBalance = (date: string) => {
    const dailyBalance = dailyBalances.find((b) => b.date === date)
    if (!dailyBalance) return "00:00"
    return dailyBalance.runningBalance
  }

  // Check if a date has validation errors
  const hasValidationError = (date: string): ValidationError | undefined => {
    return validationErrors.find((error) => error.date === date)
  }

  // Format the balance for display
  const formatBalance = (balanceStr: string) => {
    if (!balanceStr) return "00:00"
    if (balanceStr.startsWith("-")) {
      return `(${balanceStr.substring(1)})`
    }
    return balanceStr
  }

  if (isLoading) {
    return (
      <div className="mt-6 pt-4">
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-lg font-medium text-black">Time In Lieu Management</h3>
        </div>
        <div className="flex items-center justify-center h-20">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-2 border-[#0051FF] border-t-transparent"></div>
          <p className="ml-2 text-gray-600">Loading Time in Lieu data...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="mt-6 pt-4">
      <div className="mb-4">
        <div className="flex items-center mb-2">
          <h3 className="text-lg font-medium text-black">Time In Lieu Management</h3>
          <button
            onClick={() => setIsRulesModalOpen(true)}
            className="ml-2 p-1 rounded-full hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
            aria-label="TOIL Balance Rules"
            title="View TOIL Balance Rules"
          >
            <Info className="h-4 w-4 text-blue-600" />
          </button>
        </div>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <Button
              onClick={saveChanges}
              disabled={
                Object.values(inputState).every((state) => !state.requestedHours.isDirty && !state.usedHours.isDirty) ||
                isSaving ||
                validationErrors.length > 0
              }
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Save Changes{" "}
                  {Object.values(inputState).some((state) => state.requestedHours.isDirty || state.usedHours.isDirty)
                    ? `(${Object.values(inputState).filter((state) => state.requestedHours.isDirty || state.usedHours.isDirty).length})`
                    : ""}
                </>
              )}
            </Button>

            <div className="flex items-center ml-4">
              {submissionStatus.submitted && submissionStatus.status === "pending" ? (
                <Button
                  onClick={cancelSubmission}
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
                      <XCircle className="h-4 w-4 mr-2" />
                      Cancel Submission
                    </>
                  )}
                </Button>
              ) : (
                <Button
                  onClick={submitEntries}
                  disabled={
                    isSubmitting ||
                    (submissionStatus.submitted && submissionStatus.status !== "pending") ||
                    validationErrors.length > 0
                  }
                  className="bg-[#0051FF] hover:bg-[#0051FF]/90 text-white"
                >
                  <Send className="h-4 w-4 mr-2" />
                  Submit for Approval
                </Button>
              )}

              {submissionStatus.submitted && (
                <div className="ml-2 flex items-center">
                  <span className="mr-1 text-sm text-black">Status:</span>
                  <div
                    className={`text-sm px-2 py-1 rounded-full ${
                      submissionStatus.status === "pending"
                        ? "bg-yellow-100 text-yellow-800"
                        : submissionStatus.status === "approved"
                          ? "bg-green-100 text-green-800"
                          : "bg-red-100 text-red-800"
                    }`}
                  >
                    {submissionStatus.status === "pending" && (
                      <>
                        <Clock className="h-3 w-3 inline mr-1" />
                        Pending Approval
                      </>
                    )}
                    {submissionStatus.status === "approved" && (
                      <>
                        <CheckCircle className="h-3 w-3 inline mr-1" />
                        Approved
                      </>
                    )}
                    {submissionStatus.status === "rejected" && (
                      <>
                        <XCircle className="h-3 w-3 inline mr-1" />
                        Rejected
                      </>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center">
            {Object.values(inputState).some((state) => state.requestedHours.isDirty || state.usedHours.isDirty) && (
              <div className="text-yellow-600 text-sm flex items-center mr-4">
                <span className="w-3 h-3 bg-yellow-400 rounded-full mr-2"></span>
                You have unsaved changes
              </div>
            )}

            {validationErrors.length > 0 && (
              <div className="text-red-600 text-sm flex items-center">
                <AlertCircle className="h-4 w-4 mr-2" />
                {validationErrors.length} validation error{validationErrors.length > 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Validation errors summary */}
      {validationErrors.length > 0 && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md">
          <h4 className="text-red-800 font-medium flex items-center mb-2">
            <AlertCircle className="h-4 w-4 mr-2" />
            Validation Errors
          </h4>
          <ul className="text-sm text-red-700 space-y-1">
            {validationErrors.map((error, index) => (
              <li key={index} className="flex items-start">
                <span className="mr-2">•</span>
                <span>
                  {new Date(error.date).toLocaleDateString("en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                  })}
                  : {error.message}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr>
              <th className="p-2 text-left w-80 font-medium text-black">Type</th>
              {weekDates.map((date, index) => (
                <th key={index} className="p-2 text-center w-32 font-medium text-black">
                  {formatDayMonth(date)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {/* Requested Hours Row */}
            <tr className="hover:bg-gray-50">
              <td className="p-2 text-left font-medium text-black">Requested Hours</td>
              {formattedDates.map((date, index) => {
                const state = inputState[date]?.requestedHours
                const isDirty = state?.isDirty || false
                const error = hasValidationError(date)
                return (
                  <td key={index} className="p-2">
                    <div className="relative">
                      <Input
                        type="text"
                        value={state?.isFocused ? state.inputValue : state?.displayValue}
                        onChange={(e) => handleRequestedHoursChange(date, e.target.value)}
                        onFocus={() => handleRequestedHoursFocus(date)}
                        onBlur={() => handleRequestedHoursBlur(date)}
                        className={`h-10 text-center bg-white text-black ${
                          error ? "border-red-500 border-2" : isDirty ? "border-yellow-400 border-2" : "border-gray-200"
                        }`}
                        placeholder="0:00"
                        maxLength={5}
                        disabled={isSaving}
                      />
                      {error && (
                        <div className="absolute top-0 right-0 -mt-1 -mr-1">
                          <div className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                            <span className="text-xs">!</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>

            {/* Used Hours Row */}
            <tr className="hover:bg-gray-50">
              <td className="p-2 text-left font-medium text-black">Used TOIL Hours</td>
              {formattedDates.map((date, index) => {
                const state = inputState[date]?.usedHours
                const isDirty = state?.isDirty || false
                const error = hasValidationError(date)
                return (
                  <td key={index} className="p-2">
                    <div className="relative">
                      <Input
                        type="text"
                        value={state?.isFocused ? state.inputValue : state?.displayValue}
                        onChange={(e) => handleUsedHoursChange(date, e.target.value)}
                        onFocus={() => handleUsedHoursFocus(date)}
                        onBlur={() => handleUsedHoursBlur(date)}
                        className={`h-10 text-center bg-white text-black ${
                          error ? "border-red-500 border-2" : isDirty ? "border-yellow-400 border-2" : "border-gray-200"
                        }`}
                        placeholder="0:00"
                        maxLength={5}
                        disabled={isSaving}
                      />
                      {error && (
                        <div className="absolute top-0 right-0 -mt-1 -mr-1">
                          <div className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                            <span className="text-xs">!</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>

            {/* Net Hours Row */}
            <tr className="font-medium bg-gray-50">
              <td className="p-2 text-left text-black">Net TOIL Hours</td>
              {formattedDates.map((date, index) => {
                const netHours = calculateNetHours(date)
                const isNegative = netHours.includes("(")
                const error = hasValidationError(date)
                return (
                  <td
                    key={index}
                    className={`p-2 text-center font-medium ${
                      error ? "bg-red-50" : ""
                    } ${isNegative ? "text-red-600" : "text-black"}`}
                  >
                    {netHours}
                  </td>
                )
              })}
            </tr>

            {/* Running Balance Row - update the styling */}
            <tr className="font-medium bg-gray-200">
              <td className="p-2 text-left text-black">Running TOIL Balance</td>
              {formattedDates.map((date, index) => {
                const runningBalance = getRunningBalance(date)
                const isNegative = runningBalance.includes("(")
                const error = hasValidationError(date)
                return (
                  <td
                    key={index}
                    className={`p-2 text-center font-medium ${
                      error ? "bg-red-100" : ""
                    } ${isNegative ? "text-red-600" : "text-green-600"}`}
                  >
                    <div className="relative">
                      {runningBalance || "00:00"}
                      {error && (
                        <div className="absolute top-0 right-0 -mt-1 -mr-1">
                          <div className="bg-red-500 text-white rounded-full w-4 h-4 flex items-center justify-center">
                            <span className="text-xs">!</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          </tbody>
        </table>
      </div>

      {/* TOIL Rules Modal */}
      {isRulesModalOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-[500px] max-w-full">
            <h2 className="text-xl font-bold mb-4 text-black">TOIL Balance Rules</h2>
            <div className="mb-6">
              <h3 className="font-medium text-black mb-2">Balance Limits:</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Running TOIL Balance cannot exceed 40 hours</li>
                <li>Running TOIL Balance cannot go below 0 hours (no negative balance)</li>
                <li>Running TOIL Balance cannot be reduced by more than 16 hours over consecutive days</li>
              </ul>
            </div>
            <div className="mb-6">
              <h3 className="font-medium text-black mb-2">How It Works:</h3>
              <ul className="list-disc list-inside text-gray-700 space-y-2">
                <li>Requested Hours: Time you worked beyond normal hours that you want to claim as TOIL</li>
                <li>Used TOIL Hours: Time you've taken off using your accumulated TOIL balance</li>
                <li>Net TOIL Hours: The difference between requested and used hours for each day</li>
                <li>Running TOIL Balance: Your cumulative TOIL balance as it changes throughout the week</li>
              </ul>
            </div>
            <div className="flex justify-end">
              <Button onClick={() => setIsRulesModalOpen(false)} className="bg-gray-200 hover:bg-gray-300 text-black">
                Close
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Add the TimesheetSubmission component for TOIL */}
      {isSubmitDialogOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-lg shadow-lg w-[500px] max-w-full">
            <h2 className="text-xl font-bold mb-4 text-black">Submit TOIL for Approval</h2>
            <p className="mb-4 text-gray-700">
              You are about to submit your Time in Lieu entries for the week of {weekDates[0].toLocaleDateString()} to{" "}
              {weekDates[6].toLocaleDateString()}.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-1 text-gray-700">Comments (optional)</label>
              <textarea
                className="w-full border border-gray-300 rounded p-2 text-black"
                rows={3}
                placeholder="Add any comments for your manager..."
                value={comments}
                onChange={(e) => setComments(e.target.value)}
              ></textarea>
            </div>
            <div className="flex justify-end space-x-2">
              <Button variant="outline" onClick={() => setIsSubmitDialogOpen(false)} className="text-gray-700">
                Cancel
              </Button>
              <Button
                className="bg-[#0051FF] hover:bg-[#0051FF]/90 text-white"
                onClick={handleSubmit}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  "Submit"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
