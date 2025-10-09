"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Users, Clock, BarChart3, User, ChevronDown, ChevronRight, Download } from "lucide-react"
import { format } from "date-fns"
import { generateProjectSpreadsheet, generateTaskSpreadsheet } from "@/lib/actions/report-actions"

interface EmployeeHours {
  email: string
  totalHours: number
  subtaskBreakdown: {
    subtaskId: string
    subtaskTitle: string
    taskTitle: string
    hours: number
  }[]
}

interface TaskHours {
  taskId: string
  taskTitle: string
  totalHours: number
  subtasks: {
    subtaskId: string
    subtaskTitle: string
    hours: number
  }[]
}

interface ProjectReportData {
  project: {
    id: string
    title: string
    description?: string
    managers: string[]
  }
  dateRange: {
    startDate: string
    endDate: string
  }
  totalHours: number
  employeeBreakdown: EmployeeHours[]
  taskBreakdown: TaskHours[]
}

interface ProjectReportDisplayProps {
  projectId: string
  reportData: ProjectReportData
  startDate: Date
  endDate: Date
  open: boolean
  onOpenChange: (open: boolean) => void
  onBack: () => void
}

export default function ProjectReportDisplay({
  projectId,
  reportData,
  startDate,
  endDate,
  open,
  onOpenChange,
  onBack,
}: ProjectReportDisplayProps) {
  const [selectedEmployee, setSelectedEmployee] = useState<string | null>(null)
  const [expandedEmployees, setExpandedEmployees] = useState<Record<string, boolean>>({})
  const [isExporting, setIsExporting] = useState(false)
  const [exportingTaskId, setExportingTaskId] = useState<string | null>(null)

  // Helper function to format decimal hours to HH:MM
  const formatHours = (decimal: number): string => {
    const hours = Math.floor(decimal)
    const minutes = Math.round((decimal - hours) * 60)
    return `${hours}h ${minutes}m`
  }

  const toggleEmployeeExpansion = (email: string) => {
    setExpandedEmployees((prev) => ({
      ...prev,
      [email]: !prev[email],
    }))
  }

  const getSelectedEmployeeData = (): EmployeeHours | null => {
    if (!selectedEmployee) return null
    return reportData.employeeBreakdown.find((emp) => emp.email === selectedEmployee) || null
  }

  const handleExportSpreadsheet = async () => {
    try {
      setIsExporting(true)
      const csvData = await generateProjectSpreadsheet(projectId, startDate, endDate)

      // Create and download the CSV file
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute(
        "download",
        `${reportData.project.title}_Report_${format(startDate, "yyyy-MM-dd")}_to_${format(endDate, "yyyy-MM-dd")}.csv`,
      )
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Error exporting spreadsheet:", error)
      alert("Failed to export spreadsheet. Please try again.")
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportTaskSpreadsheet = async (taskId: string, taskTitle: string) => {
    try {
      setExportingTaskId(taskId)
      const csvData = await generateTaskSpreadsheet(projectId, taskId, startDate, endDate)

      // Create and download the CSV file
      const blob = new Blob([csvData], { type: "text/csv;charset=utf-8;" })
      const link = document.createElement("a")
      const url = URL.createObjectURL(blob)
      link.setAttribute("href", url)
      link.setAttribute(
        "download",
        `${taskTitle}_Report_${format(startDate, "yyyy-MM-dd")}_to_${format(endDate, "yyyy-MM-dd")}.csv`,
      )
      link.style.visibility = "hidden"
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    } catch (error) {
      console.error("Error exporting task spreadsheet:", error)
      alert("Failed to export task spreadsheet. Please try again.")
    } finally {
      setExportingTaskId(null)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-6xl h-[90vh] flex flex-col bg-black text-white">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Button variant="ghost" size="sm" onClick={onBack} className="text-white hover:bg-gray-800">
                <ArrowLeft className="h-4 w-4 mr-1" />
                Back
              </Button>
              <DialogTitle className="text-xl font-bold text-white">
                Project Report: {reportData.project.title}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleExportSpreadsheet}
                disabled={isExporting}
                className="border-gray-600 text-white hover:bg-gray-700 bg-transparent"
              >
                <Download className="h-4 w-4 mr-2" />
                {isExporting ? "Exporting..." : "Export Spreadsheet"}
              </Button>
              <Badge variant="outline" className="text-sm border-gray-600 text-gray-300">
                {format(startDate, "MMM d")} - {format(endDate, "MMM d, yyyy")}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="flex-1 overflow-hidden">
          {selectedEmployee ? (
            // Employee Detail View
            <div className="h-full flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <Button
                  variant="ghost"
                  onClick={() => setSelectedEmployee(null)}
                  className="text-white hover:bg-gray-800"
                >
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Overview
                </Button>
                <h3 className="text-lg font-semibold text-white">{selectedEmployee}</h3>
              </div>

              <div className="flex-1 overflow-y-auto">
                {(() => {
                  const employeeData = getSelectedEmployeeData()
                  if (!employeeData) return <div className="text-white">Employee not found</div>

                  return (
                    <Card className="bg-gray-900 border-gray-700">
                      <CardHeader>
                        <CardTitle className="flex items-center justify-between text-white">
                          <span className="flex items-center gap-2">
                            <User className="h-5 w-5" />
                            Hours by Subtask
                          </span>
                          <Badge className="bg-blue-900 text-blue-200 border-blue-700">
                            Total: {formatHours(employeeData.totalHours)}
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {employeeData.subtaskBreakdown.map((subtask) => (
                            <div key={subtask.subtaskId} className="border border-gray-700 rounded-lg p-4 bg-gray-800">
                              <div className="flex justify-between items-start">
                                <div>
                                  <h4 className="font-medium text-white">{subtask.subtaskTitle}</h4>
                                  <p className="text-sm text-gray-400 mt-1">Task: {subtask.taskTitle}</p>
                                </div>
                                <Badge variant="outline" className="border-gray-600 text-gray-300">
                                  {formatHours(subtask.hours)}
                                </Badge>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )
                })()}
              </div>
            </div>
          ) : (
            // Overview
            <div className="h-full flex flex-col gap-6 overflow-y-auto">
              {/* Summary Cards */}
              <div className="grid grid-cols-3 gap-4">
                <Card className="bg-gray-900 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-white">
                      <Clock className="h-4 w-4" />
                      Total Hours
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">{formatHours(reportData.totalHours)}</div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-white">
                      <Users className="h-4 w-4" />
                      Employees
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">{reportData.employeeBreakdown.length}</div>
                  </CardContent>
                </Card>

                <Card className="bg-gray-900 border-gray-700">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium flex items-center gap-2 text-white">
                      <BarChart3 className="h-4 w-4" />
                      Tasks
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold text-white">{reportData.taskBreakdown.length}</div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid grid-cols-2 gap-6 flex-1 overflow-hidden">
                {/* Hours by Employee */}
                <Card className="flex flex-col bg-gray-900 border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <Users className="h-5 w-5" />
                      Hours by Employee
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    <div className="space-y-3">
                      {reportData.employeeBreakdown.map((employee) => (
                        <div key={employee.email} className="border border-gray-700 rounded-lg bg-gray-800">
                          <div className="p-4">
                            <div className="flex justify-between items-center">
                              <div className="flex items-center gap-3">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 w-6 p-0 text-white hover:bg-gray-700"
                                  onClick={() => toggleEmployeeExpansion(employee.email)}
                                >
                                  {expandedEmployees[employee.email] ? (
                                    <ChevronDown className="h-4 w-4" />
                                  ) : (
                                    <ChevronRight className="h-4 w-4" />
                                  )}
                                </Button>
                                <div>
                                  <h4 className="font-medium text-white">{employee.email}</h4>
                                  <p className="text-sm text-gray-400">
                                    {employee.subtaskBreakdown.length} subtask
                                    {employee.subtaskBreakdown.length !== 1 ? "s" : ""}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge className="bg-green-900 text-green-200 border-green-700">
                                  {formatHours(employee.totalHours)}
                                </Badge>
                                <Button
                                  variant="outline"
                                  size="sm"
                                  onClick={() => setSelectedEmployee(employee.email)}
                                  className="border-gray-600 text-white hover:bg-gray-700"
                                >
                                  View Details
                                </Button>
                              </div>
                            </div>

                            {expandedEmployees[employee.email] && (
                              <div className="mt-3 pt-3 border-t border-gray-700 space-y-2">
                                {employee.subtaskBreakdown.slice(0, 3).map((subtask) => (
                                  <div key={subtask.subtaskId} className="flex justify-between text-sm">
                                    <span className="text-gray-400 truncate">{subtask.subtaskTitle}</span>
                                    <span className="font-medium text-white">{formatHours(subtask.hours)}</span>
                                  </div>
                                ))}
                                {employee.subtaskBreakdown.length > 3 && (
                                  <div className="text-sm text-gray-500">
                                    +{employee.subtaskBreakdown.length - 3} more subtasks
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Hours by Task */}
                <Card className="flex flex-col bg-gray-900 border-gray-700">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-white">
                      <BarChart3 className="h-5 w-5" />
                      Hours by Task
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 overflow-y-auto">
                    <div className="space-y-2">
                      {reportData.taskBreakdown.map((task) => (
                        <div key={task.taskId} className="border border-gray-700 rounded-lg bg-gray-800">
                          <div className="px-4 py-3 flex justify-between items-center">
                            <div className="text-left">
                              <h4 className="font-medium text-white">{task.taskTitle}</h4>
                              <p className="text-sm text-gray-400">
                                {task.subtasks.length} subtask{task.subtasks.length !== 1 ? "s" : ""}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleExportTaskSpreadsheet(task.taskId, task.taskTitle)}
                                disabled={exportingTaskId === task.taskId}
                                className="border-gray-600 text-white hover:bg-gray-700 bg-transparent"
                              >
                                <Download className="h-3 w-3 mr-1" />
                                {exportingTaskId === task.taskId ? "..." : "CSV"}
                              </Button>
                              <Badge className="bg-blue-900 text-blue-200 border-blue-700">
                                {formatHours(task.totalHours)}
                              </Badge>
                            </div>
                          </div>

                          <Accordion type="multiple" className="border-t border-gray-700">
                            <AccordionItem value={task.taskId} className="border-0">
                              <AccordionTrigger className="px-4 py-2 hover:bg-gray-700 text-white">
                                <span className="text-sm text-gray-400">View Subtasks</span>
                              </AccordionTrigger>
                              <AccordionContent className="px-4 pb-3">
                                <div className="space-y-2">
                                  {task.subtasks.map((subtask) => (
                                    <div
                                      key={subtask.subtaskId}
                                      className="flex justify-between items-center py-2 px-3 bg-gray-700 rounded"
                                    >
                                      <span className="text-sm font-medium text-white">{subtask.subtaskTitle}</span>
                                      <Badge variant="outline" className="border-gray-600 text-gray-300">
                                        {formatHours(subtask.hours)}
                                      </Badge>
                                    </div>
                                  ))}
                                </div>
                              </AccordionContent>
                            </AccordionItem>
                          </Accordion>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
