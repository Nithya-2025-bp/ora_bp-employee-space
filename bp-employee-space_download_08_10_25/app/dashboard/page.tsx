import { getCurrentUser, shouldForcePasswordChange } from "@/lib/auth"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import { handleLogout } from "@/lib/actions"
import { NotificationsTile } from "@/components/notifications/notifications-tile"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Lightbulb } from "lucide-react"
import { Suspense } from "react"

// Triggering deployment to sync Vercel settings - updated from v0
export default async function DashboardPage() {
  const user = await getCurrentUser()

  // If no user is logged in, redirect to login
  if (!user) {
    redirect("/")
  }

  // If user hasn't changed password and not in development mode, redirect to change password page
  if (await shouldForcePasswordChange(user)) {
    redirect("/change-password")
  }

  return (
    <DashboardLayout user={user} logoutAction={handleLogout} activeTab="Home">
      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Welcome, {user.firstName || user.email}!</h1>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Notifications Tile */}
          <Suspense
            fallback={
              <Card className="h-full">
                <CardHeader>
                  <CardTitle>Loading notifications...</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="animate-pulse h-32 bg-gray-200 rounded"></div>
                </CardContent>
              </Card>
            }
          >
            <NotificationsTile />
          </Suspense>

          {/* Quick Tips */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-600" />
                Quick Tips
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4 text-sm">
                <div className="p-3 bg-blue-50 rounded-lg">
                  <h4 className="font-medium text-blue-900 mb-1">Timesheet Reminder</h4>
                  <p className="text-blue-700">Don't forget to submit your timesheet by Friday each week.</p>
                </div>
                <div className="p-3 bg-green-50 rounded-lg">
                  <h4 className="font-medium text-green-900 mb-1">Project Updates</h4>
                  <p className="text-green-700">Keep your project tasks updated for better tracking.</p>
                </div>
                <div className="p-3 bg-purple-50 rounded-lg">
                  <h4 className="font-medium text-purple-900 mb-1">Time in Lieu</h4>
                  <p className="text-purple-700">Check your TOIL balance regularly and plan your time off.</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  )
}
