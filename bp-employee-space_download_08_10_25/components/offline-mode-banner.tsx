"use client"

import { useState } from "react"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { AlertTriangle, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import Link from "next/link"

// Add a prop to indicate if this is a schema error rather than a connection error
interface OfflineModeBannerProps {
  isSchemaError?: boolean
}

export default function OfflineModeBanner({ isSchemaError = false }: OfflineModeBannerProps) {
  const [dismissed, setDismissed] = useState(false)

  if (dismissed) {
    return null
  }

  return (
    <Alert variant="warning" className="mb-4 bg-yellow-50 border-yellow-200">
      <div className="flex items-start justify-between">
        <div className="flex">
          <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
          <div>
            <AlertTitle className="text-yellow-800">
              {isSchemaError ? "Database Tables Not Initialized" : "Working in Offline Mode"}
            </AlertTitle>
            <AlertDescription className="text-yellow-700">
              <p className="mb-2">
                {isSchemaError
                  ? "Your Supabase connection is working, but the required database tables don't exist yet. Please set up the database to enable full functionality."
                  : "Your application is currently running in offline mode due to connectivity issues with Supabase. Changes you make will not be saved to the database."}
              </p>
              <div className="flex gap-2 mt-2">
                <Link href={isSchemaError ? "/setup-database" : "/supabase-test"}>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-yellow-800 border-yellow-300 bg-yellow-100 hover:bg-yellow-200"
                  >
                    {isSchemaError ? "Set Up Database" : "Diagnose Connection"}
                  </Button>
                </Link>
              </div>
            </AlertDescription>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="h-6 w-6 p-0 rounded-full" onClick={() => setDismissed(true)}>
          <X className="h-4 w-4" />
          <span className="sr-only">Dismiss</span>
        </Button>
      </div>
    </Alert>
  )
}
