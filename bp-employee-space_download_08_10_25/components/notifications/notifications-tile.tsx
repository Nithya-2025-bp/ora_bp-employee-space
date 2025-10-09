"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Bell, X, Calendar, AlertTriangle, Check } from "lucide-react"
import { useToast } from "@/components/ui/use-toast"

interface Notification {
  id: string
  type: string
  title: string
  message: string
  week_start_date?: string
  week_end_date?: string
  created_at: string
  dismissed: boolean
}

export function NotificationsTile() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)
  const [dismissingIds, setDismissingIds] = useState<Set<string>>(new Set())
  const { toast } = useToast()

  useEffect(() => {
    fetchNotifications()
  }, [])

  const fetchNotifications = async () => {
    try {
      const response = await fetch("/api/user-timesheet-rejections")
      if (response.ok) {
        const data = await response.json()
        setNotifications(data.notifications || [])
      } else {
        console.error("Failed to fetch notifications")
      }
    } catch (error) {
      console.error("Error fetching notifications:", error)
    } finally {
      setLoading(false)
    }
  }

  const dismissNotification = async (notificationId: string) => {
    // Add to dismissing set to show loading state
    setDismissingIds((prev) => new Set(prev).add(notificationId))

    try {
      const response = await fetch("/api/dismiss-notification", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ notificationId }),
      })

      if (response.ok) {
        // Remove from notifications list with animation
        setNotifications((prev) => prev.filter((n) => n.id !== notificationId))
        toast({
          title: "Notification dismissed",
          description: "The notification has been removed.",
        })
      } else {
        toast({
          title: "Error",
          description: "Failed to dismiss notification.",
          variant: "destructive",
        })
      }
    } catch (error) {
      console.error("Error dismissing notification:", error)
      toast({
        title: "Error",
        description: "An unexpected error occurred.",
        variant: "destructive",
      })
    } finally {
      // Remove from dismissing set
      setDismissingIds((prev) => {
        const newSet = new Set(prev)
        newSet.delete(notificationId)
        return newSet
      })
    }
  }

  const dismissAllNotifications = async () => {
    if (notifications.length === 0) return

    const allIds = notifications.map((n) => n.id)
    setDismissingIds(new Set(allIds))

    try {
      const promises = notifications.map((notification) =>
        fetch("/api/dismiss-notification", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ notificationId: notification.id }),
        }),
      )

      const results = await Promise.all(promises)
      const successCount = results.filter((r) => r.ok).length

      if (successCount === notifications.length) {
        setNotifications([])
        toast({
          title: "All notifications dismissed",
          description: `Successfully dismissed ${successCount} notifications.`,
        })
      } else {
        toast({
          title: "Partial success",
          description: `Dismissed ${successCount} of ${notifications.length} notifications.`,
          variant: "destructive",
        })
        // Refresh to get current state
        fetchNotifications()
      }
    } catch (error) {
      console.error("Error dismissing all notifications:", error)
      toast({
        title: "Error",
        description: "Failed to dismiss all notifications.",
        variant: "destructive",
      })
      fetchNotifications()
    } finally {
      setDismissingIds(new Set())
    }
  }

  const formatWeekPeriod = (startDate: string, endDate: string) => {
    const start = new Date(startDate).toLocaleDateString()
    const end = new Date(endDate).toLocaleDateString()
    return `${start} - ${end}`
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }

  if (loading) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Notifications
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="animate-pulse space-y-3">
            <div className="h-4 bg-gray-200 rounded w-3/4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
            <div className="h-4 bg-gray-200 rounded w-2/3"></div>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Bell className="h-5 w-5 text-blue-600" />
            Notifications
            {notifications.length > 0 && (
              <span className="ml-2 bg-red-500 text-white text-xs px-2 py-1 rounded-full">{notifications.length}</span>
            )}
          </CardTitle>
          {notifications.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={dismissAllNotifications}
              disabled={dismissingIds.size > 0}
              className="text-xs"
            >
              {dismissingIds.size > 0 ? (
                <>
                  <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-gray-900 mr-1"></div>
                  Dismissing...
                </>
              ) : (
                <>
                  <Check className="h-3 w-3 mr-1" />
                  Dismiss All
                </>
              )}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {notifications.length === 0 ? (
          <div className="text-center py-8">
            <Bell className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500 text-sm">No new notifications</p>
            <p className="text-gray-400 text-xs mt-1">You're all caught up!</p>
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-y-auto">
            {notifications.map((notification) => {
              const isDismissing = dismissingIds.has(notification.id)
              return (
                <div
                  key={notification.id}
                  className={`relative p-4 bg-red-50 border border-red-200 rounded-lg transition-all duration-200 ${
                    isDismissing ? "opacity-50 scale-95" : "opacity-100 scale-100"
                  }`}
                >
                  {/* Top-right X button */}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="absolute top-2 right-2 h-6 w-6 p-0 hover:bg-red-100 transition-colors"
                    onClick={() => dismissNotification(notification.id)}
                    disabled={isDismissing}
                    title="Dismiss notification"
                  >
                    {isDismissing ? (
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-red-600"></div>
                    ) : (
                      <X className="h-4 w-4 text-red-600" />
                    )}
                  </Button>

                  <div className="pr-8">
                    <div className="flex items-start gap-2 mb-2">
                      <AlertTriangle className="h-4 w-4 text-red-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <h4 className="font-medium text-red-900 text-sm">{notification.title}</h4>
                        {notification.week_start_date && notification.week_end_date && (
                          <div className="flex items-center gap-1 mt-1">
                            <Calendar className="h-3 w-3 text-red-600" />
                            <span className="text-xs text-red-700">
                              Week: {formatWeekPeriod(notification.week_start_date, notification.week_end_date)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <p className="text-sm text-red-800 mb-2 leading-relaxed">{notification.message}</p>

                    <p className="text-xs text-red-600">{formatDate(notification.created_at)}</p>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
