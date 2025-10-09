"use client"

import type React from "react"

import { useState, useEffect } from "react"
import type { Project } from "@/lib/task-types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { updateProject } from "@/lib/actions/project-actions"
import { Checkbox } from "@/components/ui/checkbox"
import { ScrollArea } from "@/components/ui/scroll-area"
import { toast } from "@/hooks/use-toast"
import { Save, ChevronDown, ChevronRight, Search } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"

interface EditProjectDialogProps {
  project: Project
  open: boolean
  onOpenChange: (open: boolean) => void
  onProjectUpdated: () => Promise<void>
}

export default function EditProjectDialog({ project, open, onOpenChange, onProjectUpdated }: EditProjectDialogProps) {
  const [title, setTitle] = useState(project.title)
  const [description, setDescription] = useState(project.description || "")
  const [selectedManagers, setSelectedManagers] = useState<string[]>(project.managers || [])
  const [employees, setEmployees] = useState<{ email: string; name: string }[]>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false)
  const [isManagersOpen, setIsManagersOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")

  useEffect(() => {
    setTitle(project.title)
    setDescription(project.description || "")
    setSelectedManagers(project.managers || [])
  }, [project])

  // Load employees for manager selection
  useEffect(() => {
    const loadEmployees = async () => {
      if (!open) return

      setIsLoadingEmployees(true)
      try {
        // Import the getEmployees function
        const { getEmployees } = await import("@/lib/actions/employee-actions")
        const employeesList = await getEmployees()

        // Format employees for the dropdown
        const formattedEmployees = employeesList.map((emp) => ({
          email: emp.email,
          name: `${emp.firstName} ${emp.lastName}`,
        }))

        setEmployees(formattedEmployees)
      } catch (error) {
        console.error("Error loading employees:", error)
        // Use a fallback list if API fails
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

  // Filter employees based on search term
  const filteredEmployees = employees.filter(
    (employee) =>
      employee.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      employee.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  const toggleManager = (email: string) => {
    setSelectedManagers((prev) => {
      if (prev.includes(email)) {
        return prev.filter((e) => e !== email)
      } else {
        return [...prev, email]
      }
    })
  }

  // Update the handleSubmit function to ensure managers are properly passed
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      console.log("Updating project with managers:", selectedManagers)

      await updateProject(project.id, title, description, selectedManagers)
      onOpenChange(false)
      window.location.reload()

      toast({
        title: "Success",
        description: "Project updated successfully",
      })
    } catch (error) {
      console.error(error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      toast({
        title: "Error",
        description: "Failed to update project. Please try again.",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader className="relative">
            <DialogTitle>Edit Project</DialogTitle>
            <DialogDescription>Make changes to your project.</DialogDescription>
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
            <div className="grid gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Project title"
                required
              />
            </div>
            <div className="grid gap-2">
              <Collapsible open={isManagersOpen} onOpenChange={setIsManagersOpen}>
                <CollapsibleTrigger asChild>
                  <Button variant="ghost" className="flex items-center justify-between w-full p-0 h-auto">
                    <Label className="cursor-pointer">Project Managers ({selectedManagers.length} selected)</Label>
                    {isManagersOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
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
                                  id={`manager-${employee.email}`}
                                  checked={selectedManagers.includes(employee.email)}
                                  onCheckedChange={() => toggleManager(employee.email)}
                                />
                                <Label htmlFor={`manager-${employee.email}`} className="cursor-pointer text-sm flex-1">
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
                  <p className="text-xs text-gray-500">Project managers can create tasks and assign users to them.</p>
                </CollapsibleContent>
              </Collapsible>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="description">Description (optional)</Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Add a description for your project"
                className="resize-none"
              />
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
