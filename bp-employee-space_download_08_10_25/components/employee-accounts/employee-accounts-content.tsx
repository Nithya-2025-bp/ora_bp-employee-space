"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Plus, RefreshCw } from "lucide-react"
import type { User } from "@/lib/users"
import EmployeeCard from "./employee-card"
import AddEmployeeDialog from "./add-employee-dialog"
import { toast } from "@/hooks/use-toast"
import { getEmployees, addEmployee, updateEmployee } from "@/lib/actions/employee-actions"

interface EmployeeAccountsContentProps {
  currentUser: User
}

interface EmployeeProjectData {
  employee: User
  assignedProjects: { id: string; title: string; taskCount: number }[]
}

export default function EmployeeAccountsContent({ currentUser }: EmployeeAccountsContentProps) {
  const [employees, setEmployees] = useState<User[]>([])
  const [employeeProjectData, setEmployeeProjectData] = useState<
    Map<string, { id: string; title: string; taskCount: number }[]>
  >(new Map())
  const [isLoading, setIsLoading] = useState(true)
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [activeTab, setActiveTab] = useState("employees")

  // Load employees data and their project assignments
  useEffect(() => {
    loadEmployees()
  }, [])

  const loadEmployees = async () => {
    setIsLoading(true)
    try {
      // Get employees from the database
      const dbEmployees = await getEmployees()

      // Sort employees with admins at the top
      const sortedEmployees = [...dbEmployees].sort((a, b) => {
        // Sort by admin status first (admins come first)
        if (a.isAdmin && !b.isAdmin) return -1
        if (!a.isAdmin && b.isAdmin) return 1
        // Then sort by name
        return `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`)
      })

      setEmployees(sortedEmployees)

      // If current user is admin, pre-compute project assignments for all employees
      if (currentUser.isAdmin) {
        await loadProjectAssignments(sortedEmployees)
      }
    } catch (error) {
      console.error("Error loading employees:", error)
      toast({
        title: "Error",
        description: "Failed to load employee data",
        variant: "destructive",
      })
    } finally {
      setIsLoading(false)
    }
  }

  const loadProjectAssignments = async (employeeList: User[]) => {
    try {
      console.log("Pre-computing project assignments for all employees...")

      // Get all projects once
      const { getAllProjects } = await import("@/lib/actions/project-actions")
      const allProjects = await getAllProjects()

      // Create a map of employee email to their assigned projects
      const projectDataMap = new Map<string, { id: string; title: string; taskCount: number }[]>()

      employeeList.forEach((employee) => {
        const projectMap = new Map<string, { id: string; title: string; taskCount: number }>()

        allProjects.forEach((project) => {
          let hasAssignedTasks = false
          let taskCount = 0

          // Check if this employee is a manager of the project
          const isManager = project.managers && project.managers.includes(employee.email)

          if (project.tasks && Array.isArray(project.tasks)) {
            project.tasks.forEach((task) => {
              if (task.subtasks && Array.isArray(task.subtasks)) {
                task.subtasks.forEach((subtask) => {
                  if (subtask.assignedUsers && subtask.assignedUsers.includes(employee.email)) {
                    hasAssignedTasks = true
                    taskCount++
                  }
                })
              }
            })
          }

          // Include project if user is manager or has assigned tasks
          if (isManager || hasAssignedTasks) {
            projectMap.set(project.id, {
              id: project.id,
              title: project.title,
              taskCount: taskCount,
            })
          }
        })

        projectDataMap.set(employee.email, Array.from(projectMap.values()))
      })

      console.log("Project assignments pre-computed for", projectDataMap.size, "employees")
      setEmployeeProjectData(projectDataMap)
    } catch (error) {
      console.error("Error loading project assignments:", error)
      // Don't show error toast for this as it's not critical - individual cards will load their own data
    }
  }

  const handleRefresh = async () => {
    if (isRefreshing) return
    setIsRefreshing(true)
    try {
      await loadEmployees()
      toast({
        title: "Success",
        description: "Employee data refreshed",
      })
    } catch (error) {
      console.error("Error refreshing employees:", error)
    } finally {
      setIsRefreshing(false)
    }
  }

  const handleAddEmployee = async (newEmployee: User) => {
    try {
      const result = await addEmployee(newEmployee)

      if (result.success) {
        await loadEmployees() // Reload employees from database
        toast({
          title: "Success",
          description: `Employee ${newEmployee.firstName} ${newEmployee.lastName} added successfully`,
        })
        return true
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to add employee",
          variant: "destructive",
        })
        return false
      }
    } catch (error) {
      console.error("Error adding employee:", error)
      toast({
        title: "Error",
        description: "Failed to add employee",
        variant: "destructive",
      })
      return false
    }
  }

  const handleUpdateEmployee = async (updatedEmployee: User) => {
    try {
      const result = await updateEmployee(updatedEmployee)

      if (result.success) {
        // Update the employee in the local state
        setEmployees((prev) => prev.map((emp) => (emp.email === updatedEmployee.email ? updatedEmployee : emp)))

        toast({
          title: "Success",
          description: `Employee ${updatedEmployee.firstName} ${updatedEmployee.lastName} updated successfully`,
        })
        return true
      } else {
        toast({
          title: "Error",
          description: result.message || "Failed to update employee",
          variant: "destructive",
        })
        return false
      }
    } catch (error) {
      console.error("Error updating employee:", error)
      toast({
        title: "Error",
        description: "Failed to update employee",
        variant: "destructive",
      })
      return false
    }
  }

  return (
    <div className="h-full flex flex-col">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-black">Employee Accounts</h1>
        <div className="flex space-x-2">
          {/* Database Viewer Link - Removed */}

          <Button
            onClick={handleRefresh}
            disabled={isRefreshing}
            className="flex items-center gap-1 bg-black text-white hover:bg-gray-800 disabled:bg-gray-400"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${isRefreshing ? "animate-spin" : ""}`} />
            {isRefreshing ? "Refreshing..." : "Refresh"}
          </Button>

          <Button
            onClick={() => setIsAddDialogOpen(true)}
            className="flex items-center gap-1 bg-[#0051FF] text-white hover:bg-[#0051FF]/90"
          >
            <Plus className="h-4 w-4 mr-1" />
            Add Employee
          </Button>
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-[#0051FF] border-t-transparent mb-4"></div>
            <p className="text-gray-600 ml-3">Loading employee data...</p>
          </div>
        ) : (
          <div className="w-full">
            <div className="flex flex-col space-y-4 w-full">
              {employees.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-64 text-center">
                  <p className="text-gray-500 mb-4">No employees found</p>
                  <p className="text-sm text-gray-400">Use the "Add Employee" button to add new employees</p>
                </div>
              ) : (
                employees.map((employee) => (
                  <EmployeeCard
                    key={employee.email}
                    employee={employee}
                    currentUser={currentUser}
                    onUpdate={handleUpdateEmployee}
                    onApprovalProcessed={handleRefresh}
                    assignedProjects={employeeProjectData.get(employee.email)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </div>

      <AddEmployeeDialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen} onAddEmployee={handleAddEmployee} />
    </div>
  )
}
