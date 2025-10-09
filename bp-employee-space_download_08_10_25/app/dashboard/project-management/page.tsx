import { getCurrentUser, shouldForcePasswordChange } from "@/lib/auth"
import { redirect } from "next/navigation"
import DashboardLayout from "@/components/dashboard-layout"
import TasksContent from "@/components/tasks/tasks-content"
import { handleLogout } from "@/lib/actions"
import Link from "next/link"
import { getProjectById, getAllProjects } from "@/lib/actions/project-actions"

export default async function TasksPage({ searchParams }: { searchParams: { project?: string } }) {
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

    // Check if the user is accessing a specific project
    const projectId = searchParams.project

    // If a project ID is provided, check if the user has access to it
    if (projectId) {
      const project = await getProjectById(projectId)

      // If the project doesn't exist, redirect to the dashboard
      if (!project) {
        redirect("/dashboard")
      }

      // Check access: admin, project manager, or assigned user
      const hasAccess =
        user.isAdmin ||
        (project.managers && project.managers.includes(user.email)) ||
        project.tasks.some((task) =>
          task.subtasks.some((subtask) => subtask.assignedUsers && subtask.assignedUsers.includes(user.email)),
        )

      if (!hasAccess) {
        redirect("/dashboard")
      }
    } else {
      // If no project ID is provided, check if user has any management access
      if (!user.isAdmin) {
        try {
          const allProjects = await getAllProjects()
          const hasManagementAccess = allProjects.some(
            (project) => project.managers && project.managers.includes(user.email),
          )

          if (!hasManagementAccess) {
            // User has no management access and no assigned subtasks, redirect to dashboard
            redirect("/dashboard")
          }
        } catch (error) {
          console.error("Error checking management access:", error)
          // On error, allow access but let the component handle the error display
        }
      }
    }

    // We'll pass an empty array for initial projects and let the client component handle loading
    const initialProjects = []

    return (
      <DashboardLayout user={user} logoutAction={handleLogout} activeTab="Project Management">
        <TasksContent
          initialProjects={initialProjects}
          isAdmin={user.isAdmin}
          userEmail={user.email}
          initialProjectId={projectId}
        />
      </DashboardLayout>
    )
  } catch (error) {
    console.error("Error in TasksPage:", error)
    // Return a simple error page
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl font-bold mb-4">Something went wrong</h1>
        <p className="text-gray-600 mb-4">We're having trouble loading your tasks data.</p>
        <Link href="/dashboard" className="text-blue-600 hover:underline">
          Return to Dashboard
        </Link>
      </div>
    )
  }
}
