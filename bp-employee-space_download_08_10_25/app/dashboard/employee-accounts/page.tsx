import { getCurrentUser, shouldForcePasswordChange } from "@/lib/auth"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { handleLogout } from "@/lib/actions"
import Link from "next/link"
import EmployeeAccountsContent from "@/components/employee-accounts/employee-accounts-content-client"

export default async function EmployeeAccountsPage() {
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

    // If user is not an admin, redirect to dashboard
    if (!user.isAdmin) {
      redirect("/dashboard")
    }

    return (
      <DashboardLayout user={user} logoutAction={handleLogout} activeTab="Employee Accounts">
        <EmployeeAccountsContent currentUser={user} />
      </DashboardLayout>
    )
  } catch (error) {
    console.error("Error in EmployeeAccountsPage:", error)
    // Return a simple error page
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
        <p className="text-gray-600 mb-4">We're having trouble loading the employee accounts page.</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    )
  }
}
