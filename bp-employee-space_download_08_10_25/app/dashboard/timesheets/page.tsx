import { getCurrentUser, shouldForcePasswordChange } from "@/lib/auth"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { handleLogout } from "@/lib/actions"
import Link from "next/link"
import TimesheetContent from "@/components/timesheets/timesheet-content-client"

// Define TimesheetRow interface directly to avoid import issues
interface TimesheetRow {
  id: string
  userId?: string
  projectId: string
  taskId: string
  subtaskId: string
  projectTitle: string
  taskTitle: string
  subtaskTitle: string
}

export default async function TimesheetsPage() {
  try {
    const user = await getCurrentUser()

    // If no user is logged in, redirect to login
    if (!user) {
      redirect("/")
    }

    // If user hasn't changed password and not in development mode, redirect to change password page
    if (await shouldForcePasswordChange(user)) {
      redirect("/change-password")
    }

    // We'll use an empty array for initial rows and let the client component handle loading
    const initialRows: TimesheetRow[] = []

    return (
      <DashboardLayout user={user} logoutAction={handleLogout} activeTab="Timesheets">
        <TimesheetContent initialAvailableRows={initialRows} user={user} />
      </DashboardLayout>
    )
  } catch (error) {
    console.error("Error in TimesheetsPage:", error)
    // Return a simple error page
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
        <p className="text-gray-600 mb-4">We're having trouble loading your timesheet data.</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    )
  }
}
