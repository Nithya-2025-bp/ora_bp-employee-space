"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { createSubtask } from "@/lib/actions/project-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Save, ChevronDown, ChevronRight, Search } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface CreateSubtaskDialogProps {
  projectId: string
  taskId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSubtaskCreated: () => Promise<void>
}

export default function CreateSubtaskDialog({
  projectId,
  taskId,
  open,
  onOpenChange,
  onSubtaskCreated,
}: CreateSubtaskDialogProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [assignedUsers, setAssignedUsers] = useState<string[]>([])
  const [employees, setEmployees] = useState<{ email: string; name: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isClosing, setIsClosing] = useState(false)
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false)
  const [isUsersOpen, setIsUsersOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    const loadEmployees = async () => {
      if (!open) return

      setIsLoadingEmployees(true)
      try {
        const { getEmployees } = await import("@/lib/actions/employee-actions")
        const employeesList = await getEmployees()

        const formattedEmployees = employeesList.map((emp) => ({
          email: emp.email,
          name: `${emp.firstName} ${emp.lastName}`,
        }))

        setEmployees(formattedEmployees)
      } catch (error) {
        console.error("Error loading employees:", error)
        setEmployees([
          { email: "john.doe@example.com", name: "John Doe" },
          { email: "jane.smith@example.com", name: "Jane Smith" },
        ])
      } finally {
        setIsLoadingEmployees(false)
      }
    }

    loadEmployees()
  }, [open])

  const filteredEmployees = employees.filter(
    (employee) =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  useEffect(() => {
    if (!open && isClosing) {
      const timer = setTimeout(() => {
        setTitle("")
        setDescription("")
        setAssignedUsers([])
        setError(null)
        setIsClosing(false)
      }, 300)

      return () => clearTimeout(timer)
    }
  }, [open, isClosing])

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      setIsClosing(true)
    }
    onOpenChange(open)
  }

  const toggleUser = (email: string) => {
    setAssignedUsers((prev) => {
      if (prev.includes(email)) {
        return prev.filter((e) => e !== email)
      } else {
        return [...prev, email]
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)
    setError(null)

    try {
      console.log("Creating subtask with data:", {
        projectId,
        taskId,
        title,
        description,
        assignedUsers,
      })

      await createSubtask(projectId, taskId, title, description, assignedUsers)
      setIsClosing(true)
      onOpenChange(false)
      window.location.reload()
    } catch (error) {
      console.error(error)
      if (error instanceof Error && error.message.includes("Unauthorized")) {
        setError("You don't have permission to create subtasks. Only admins can manage tasks.")
      } else {
        setError("An error occurred while creating the subtask.")
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="relative">
            <DialogTitle>Create New Subtask</DialogTitle>
            <DialogDescription>Add a new subtask to break down your task.</DialogDescription>
            <Button
              type="submit"
              disabled={isSubmitting || !title.trim()}
              size="icon"
              className="absolute top-0 right-8 h-6 w-6"
            >
              <Save className="h-4 w-4" />
            </Button>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {error && <div className="bg-red-50 p-3 rounded-md text-red-600 text-sm">{error}</div>}
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Subtask title"
                required
              />
            </div>
            <div className="grid gap-2">
              <Collapsible open={isUsersOpen} onOpenChange={setIsUsersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="flex items-center justify-between w-full p-0 h-auto">
                    <Label className="cursor-pointer">Assign Users ({assignedUsers.length} selected)</Label>
                    {isUsersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent className="space-y-2">
                  {isLoadingEmployees ? (
                    <div className="text-sm text-gray-500">Loading employees...</div>
                  ) : (
                    <>
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search employees..."
                          value={searchTerm}
                          onChange={(e) => setSearchTerm(e.target.value)}
                          className="pl-10"
                        />
                      </div>
                      <div className="border rounded-md">
                        <ScrollArea className="h-[200px] p-3">
                          <div className="space-y-3">
                            {filteredEmployees.map((employee) => (
                              <div key={employee.email} className="flex items-center space-x-3">
                                <Checkbox
                                  id={`user-${employee.email}`}
                                  checked={assignedUsers.includes(employee.email)}
                                  onCheckedChange={() => toggleUser(employee.email)}
                                />
                                <Label htmlFor={`user-${employee.email}`} className="cursor-pointer text-sm flex-1">
                                  <div className="font-medium">{employee.name}</div>
                                  <div className="text-xs text-gray-500">{employee.email}</div>
                                </Label>
                              </div>
                            ))}
                            {filteredEmployees.length === 0 && searchTerm && (
                              <div className="text-sm text-gray-500 text-center py-4">
                                No employees found matching "{searchTerm}"
                              </div>
                            )}
                          </div>
                        </ScrollArea>
                      </div>
                    </>
                  )}
                  <p className="text-xs text-gray-500">
                    Assigned users will be responsible for completing this subtask.
                  </p>
                </CollapsibleContent>
              </Collapsible>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Subtask description"
                className="resize-none"
              />
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
