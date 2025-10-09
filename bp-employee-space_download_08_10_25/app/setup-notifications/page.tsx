"use client"

import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export default function SetupNotificationsPage() {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<string>("")

  const setupDatabase = async () => {
    setIsLoading(true)
    setResult("")

    try {
      const response = await fetch("/api/setup-database", {
        method: "POST",
      })

      const data = await response.json()

      if (data.success) {
        setResult("✅ Database setup completed successfully!")
      } else {
        setResult(`❌ Database setup failed: ${data.error}`)
      }
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  const testNotifications = async () => {
    setIsLoading(true)
    setResult("")

    try {
      const response = await fetch("/api/test-notifications", {
        method: "GET",
      })

      const data = await response.json()

      if (response.ok) {
        setResult(`✅ Notifications test successful! Found ${data.notifications?.length || 0} notifications.`)
      } else {
        setResult(`❌ Notifications test failed: ${data.error}`)
      }
    } catch (error) {
      setResult(`❌ Error: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="container mx-auto p-6">
      <Card>
        <CardHeader>
          <CardTitle>Setup Notifications Database</CardTitle>
          <CardDescription>Set up the notifications table and test the system</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-4">
            <Button onClick={setupDatabase} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700">
              {isLoading ? "Setting up..." : "Setup Database"}
            </Button>

            <Button onClick={testNotifications} disabled={isLoading} variant="outline">
              {isLoading ? "Testing..." : "Test Notifications"}
            </Button>
          </div>

          {result && (
            <div className="p-4 bg-gray-100 rounded-md">
              <pre className="whitespace-pre-wrap">{result}</pre>
            </div>
          )}

          <div className="text-sm text-gray-600">
            <p>
              <strong>Instructions:</strong>
            </p>
            <ol className="list-decimal list-inside space-y-1">
              <li>First, run the SQL script in your Supabase dashboard to create the notifications table</li>
              <li>Then click "Setup Database" to verify all tables exist</li>
              <li>Click "Test Notifications" to check if the API is working</li>
            </ol>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
