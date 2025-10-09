"use client"

import { useState, useEffect } from "react"
import { usePathname, useRouter } from "next/navigation"
import type React from "react"
import Image from "next/image"
import { BugIcon, LightbulbIcon, Settings, Loader2 } from "lucide-react"
import type { User } from "@/lib/users"
import { Button } from "@/components/ui/button"
import { ProfileEditDialog } from "@/components/profile/profile-edit-dialog"

interface DashboardLayoutProps {
  user: User
  logoutAction: () => Promise<void>
  activeTab: string
  children: React.ReactNode
}

export default function DashboardLayout({ user, logoutAction, activeTab, children }: DashboardLayoutProps) {
  const { isAdmin } = user
  const regularTabs = ["Home", "Timesheets", "Time in Lieu", "Projects"]
  const adminTabs = isAdmin ? ["Project Management", "Employee Accounts"] : []
  const tabs = [...regularTabs, ...adminTabs]
  const [profileDialogOpen, setProfileDialogOpen] = useState(false)

  const [isNavigating, setIsNavigating] = useState(false)
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    // When the pathname changes, the navigation is complete.
    if (isNavigating) {
      setIsNavigating(false)
    }
  }, [pathname, isNavigating])

  const handleNavigate = (href: string) => {
    // Prevent navigation if already navigating or to the same page
    if (isNavigating || pathname === href) {
      return
    }
    setIsNavigating(true)
    router.push(href)
  }

  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Navigation Loading Overlay */}
      {isNavigating && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-sm cursor-wait">
          <Loader2 className="h-12 w-12 animate-spin text-white" />
        </div>
      )}

      {/* Background Image */}
      <div className="absolute inset-0 z-0">
        <Image src="/panther1.png" alt="Blu Pantera Background" fill priority className="object-cover" />
      </div>

      {/* Main Layout */}
      <div className="relative z-10 flex h-screen">
        {/* Left Sidebar */}
        <div className="flex w-[120px] flex-col items-center bg-white/80 py-6">
          <div className="mb-4">
            <Image src="/ora-logo-transparent.png" alt="Ora Logo" width={80} height={30} className="h-auto" />
          </div>

          {/* User Profile */}
          <div className="flex flex-col items-center p-3 relative w-full">
            {/* Settings button - positioned absolutely relative to the container */}
            <button
              onClick={() => setProfileDialogOpen(true)}
              className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-[#0051FF] text-white shadow-md hover:bg-[#0051FF]/90 transition-transform hover:scale-105 z-10"
              title="Edit Profile"
              aria-label="Edit Profile"
            >
              <Settings className="h-4 w-4" />
            </button>

            <div className="h-20 w-20 overflow-hidden rounded-full bg-gray-300">
              {user.profilePicture ? (
                <Image
                  src={user.profilePicture || "/placeholder.svg"}
                  alt={`${user.firstName} ${user.lastName}`}
                  width={80}
                  height={80}
                  className="h-full w-full object-cover"
                />
              ) : (
                /* Placeholder avatar */
                <svg className="h-full w-full text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              )}
            </div>

            <div className="mt-3 text-center w-full px-2">
              <h2
                className="font-bold leading-tight break-words"
                style={{
                  fontSize: `${Math.min(18, Math.max(12, 120 / Math.max(user.firstName.length + user.lastName.length, 8)))}px`,
                }}
              >
                <span className="text-black">{user.firstName} </span>
                <span className="text-[#0051FF]">{user.lastName}</span>
              </h2>
              <p className="text-xs text-gray-600 mt-1">{user.isAdmin ? "ADMIN" : "USER"}</p>
            </div>

            <form action={logoutAction} className="mt-2">
              <Button
                type="submit"
                className="rounded-full bg-[#0051FF] px-4 py-1 text-xs text-white hover:bg-[#0051FF]/90"
              >
                Logout
              </Button>
            </form>

            {/* Profile Edit Dialog */}
            <ProfileEditDialog user={user} open={profileDialogOpen} onOpenChange={setProfileDialogOpen} />
          </div>

          {/* App Icons */}
          <div className="mt-6 flex flex-col space-y-4">
            {/* SharePoint Icon */}
            <a
              href="https://blupantera.sharepoint.com/sites/BluePantera"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-transform hover:scale-110"
              title="SharePoint"
            >
              <Image src="/new-sharepoint-logo.png" alt="SharePoint" width={40} height={40} className="rounded-md" />
            </a>

            {/* Teams Icon - Updated */}
            <a
              href="https://teams.microsoft.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-transform hover:scale-110"
              title="Microsoft Teams"
            >
              <Image src="/teams-logo.png" alt="Microsoft Teams" width={40} height={40} className="rounded-md" />
            </a>

            {/* Outlook Icon - Updated */}
            <a
              href="https://outlook.office.com"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-transform hover:scale-110"
              title="Microsoft Outlook"
            >
              <Image src="/outlook-logo.png" alt="Microsoft Outlook" width={40} height={40} className="rounded-md" />
            </a>

            {/* Report Bug Button */}
            <a
              href="https://blupantera.sharepoint.com/sites/BluePantera/_layouts/15/listforms.aspx?cid=MzE0OGI2NWQtYmQ2Ny00M2Q0LWFmZGUtNTRiNDMzODAwNDRl&nav=NDkxYzBhZDctMGE2Ni00ZDQxLTg0YjMtOTM0M2VlMzI3YzIz"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-md bg-red-600 text-white transition-transform hover:scale-110"
              title="Report Bug"
            >
              <BugIcon className="h-6 w-6" />
            </a>

            {/* Feature Request Button */}
            <a
              href="https://blupantera.sharepoint.com/:l:/s/BluePantera/FMpK0gIWBNxJgntrBcT4t_YBHKP9271yHg8bxlRWOYpOvw?nav=ZDkzNDI3NDAtYjRmZi00ZWU2LWI4ZTItNmMwMTg1MDdmNzA1"
              target="_blank"
              rel="noopener noreferrer"
              className="flex h-10 w-10 items-center justify-center rounded-md bg-green-600 text-white transition-transform hover:scale-110"
              title="Request Feature"
            >
              <LightbulbIcon className="h-6 w-6" />
            </a>
          </div>
        </div>

        {/* Main Content Area */}
        <div className="flex flex-1 flex-col">
          {/* Top padding */}
          <div className="pt-6">
            {/* Top Header with Logo and Navigation */}
            <div className="flex items-center justify-between px-6 py-4">
              {/* Navigation Tabs - Left Side */}
              <div className="flex rounded-full bg-white/90 px-6 py-2 shadow-md">
                {tabs.map((tab) => {
                  // Determine the correct href based on tab name
                  let href = `/dashboard${tab.toLowerCase() === "home" ? "" : `/${tab.toLowerCase().replace(" ", "-")}`}`

                  // Special case for Project Management tab
                  if (tab === "Project Management") {
                    href = "/dashboard/project-management"
                  }

                  // Special case for Employee Accounts tab
                  if (tab === "Employee Accounts") {
                    href = "/dashboard/employee-accounts"
                  }

                  // Special case for Time in Lieu tab
                  if (tab === "Time in Lieu") {
                    href = "/dashboard/time-in-lieu"
                  }

                  const isCurrentPage = activeTab === tab

                  return (
                    <button
                      key={tab}
                      onClick={() => handleNavigate(href)}
                      disabled={isNavigating || isCurrentPage}
                      className={`px-4 py-1 text-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                        isCurrentPage ? "text-[#0051FF]" : "text-gray-600 hover:text-[#0051FF]/70"
                      }`}
                    >
                      {tab}
                    </button>
                  )
                })}
              </div>

              {/* Logo - Right Side - Increased size by 50% */}
              <div>
                <Image
                  src="/blu-pantera-dashboard-logo.png"
                  alt="Blu Pantera Logo"
                  width={270}
                  height={72}
                  style={{ width: "270px", height: "auto" }}
                  className="h-auto"
                />
              </div>
            </div>
          </div>

          {/* Content Area */}
          <div className="flex-1 p-6 pt-6">
            {/* Check the content area background */}
            <div className="rounded-3xl bg-white/90 p-6 shadow-lg overflow-y-auto max-h-[calc(100vh-140px)] relative z-0">
              {children}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
