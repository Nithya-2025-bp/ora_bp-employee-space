"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Calendar } from "@/components/ui/calendar"
import { CalendarIcon, FileText, ChevronDown, Loader2 } from "lucide-react"
import { format } from "date-fns"
import { cn } from "@/lib/utils"
import ProjectReportDisplay from "./project-report-display"

interface ProjectReportModalProps {
  projectId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  userEmail: string
  isAdmin: boolean
}

export default function ProjectReportModal({
  projectId,
  open,
  onOpenChange,
  userEmail,
  isAdmin,
}: ProjectReportModalProps) {
  const [startDate, setStartDate] = useState<Date>()
  const [endDate, setEndDate] = useState<Date>()
  const [showReport, setShowReport] = useState(false)
  const [reportData, setReportData] = useState<any>(null)
  const [startDateOpen, setStartDateOpen] = useState(false)
  const [endDateOpen, setEndDateOpen] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)

  const handleGenerateReport = async () => {
    if (!startDate || !endDate) {
      return
    }

    setIsGenerating(true)

    try {
      const { generateProjectReport } = await import("@/lib/actions/report-actions")
      const data = await generateProjectReport(projectId, startDate, endDate)
      setReportData(data)
      setShowReport(true)
    } catch (error) {
      console.error("Error generating report:", error)
    } finally {
      setIsGenerating(false)
    }
  }

  const handleBackToDateSelection = () => {
    setShowReport(false)
    setReportData(null)
  }

  const handleStartDateSelect = (date: Date | undefined) => {
    setStartDate(date)
    setStartDateOpen(false)
  }

  const handleEndDateSelect = (date: Date | undefined) => {
    setEndDate(date)
    setEndDateOpen(false)
  }

  if (showReport && reportData) {
    return (
      <ProjectReportDisplay
        projectId={projectId}
        reportData={reportData}
        startDate={startDate!}
        endDate={endDate!}
        open={open}
        onOpenChange={onOpenChange}
        onBack={handleBackToDateSelection}
      />
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Generate Project Report
          </DialogTitle>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <div className="grid gap-2">
            <Label>Start Date</Label>
            <div className="relative">
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !startDate && "text-muted-foreground")}
                onClick={() => setStartDateOpen(!startDateOpen)}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {startDate ? format(startDate, "PPP") : "Pick a start date"}
                <ChevronDown className="ml-auto h-4 w-4" />
              </Button>
              {startDateOpen && (
                <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                  <Calendar
                    mode="single"
                    selected={startDate}
                    onSelect={handleStartDateSelect}
                    initialFocus
                    className="p-3"
                  />
                </div>
              )}
            </div>
          </div>

          <div className="grid gap-2">
            <Label>End Date</Label>
            <div className="relative">
              <Button
                variant="outline"
                className={cn("w-full justify-start text-left font-normal", !endDate && "text-muted-foreground")}
                onClick={() => setEndDateOpen(!endDateOpen)}
              >
                <CalendarIcon className="mr-2 h-4 w-4" />
                {endDate ? format(endDate, "PPP") : "Pick an end date"}
                <ChevronDown className="ml-auto h-4 w-4" />
              </Button>
              {endDateOpen && (
                <div className="absolute top-full left-0 z-50 mt-1 bg-white border border-gray-200 rounded-md shadow-lg">
                  <Calendar
                    mode="single"
                    selected={endDate}
                    onSelect={handleEndDateSelect}
                    initialFocus
                    className="p-3"
                  />
                </div>
              )}
            </div>
          </div>

          <Button onClick={handleGenerateReport} disabled={!startDate || !endDate || isGenerating} className="w-full">
            {isGenerating ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating Report...
              </>
            ) : (
              "Generate"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
