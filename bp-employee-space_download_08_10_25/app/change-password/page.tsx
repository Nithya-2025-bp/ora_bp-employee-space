import ChangePasswordForm from "@/components/change-password-form"
import { getCurrentUser, shouldForcePasswordChange } from "@/lib/auth"
import { redirect } from "next/navigation"

export default async function ChangePasswordPage() {
  const user = await getCurrentUser()

  // If no user is logged in, redirect to login
  if (!user) {
    redirect("/")
  }

  // If user has already changed password or in development mode, redirect to dashboard
  if (!(await shouldForcePasswordChange(user))) {
    redirect("/dashboard")
  }

  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden">
      <div className="w-full max-w-md px-4">
        <ChangePasswordForm userEmail={user.email} />
      </div>
    </main>
  )
}
