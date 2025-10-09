"use client"

import { useState, useEffect } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { AlertTriangle, ExternalLink } from "lucide-react"
import Link from "next/link"
import OfflineModeBanner from "./offline-mode-banner"

export default function SupabaseStatus() {
  const [status, setStatus] = useState<"checking" | "connected" | "error">("checking")
  const [error, setError] = useState<string | null>(null)
  const [isChecking, setIsChecking] = useState(false)
  const [isSchemaError, setIsSchemaError] = useState(false)

  const checkConnection = async () => {
    setIsChecking(true)
    setStatus("checking")
    setError(null)
    setIsSchemaError(false)

    try {
      // First check if the Supabase URL and anon key are defined
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl) {
        throw new Error("Supabase URL is not configured")
      }

      if (!supabaseAnonKey) {
        throw new Error("Supabase Anon Key is not configured")
      }

      // Try a simple fetch to the Supabase health endpoint with proper authentication
      const response = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          apikey: supabaseAnonKey,
          Authorization: `Bearer ${supabaseAnonKey}`,
        },
      })

      if (!response.ok) {
        throw new Error(`Cannot reach Supabase: ${response.status}`)
      }

      // If we get here, basic connectivity is successful
      setStatus("connected")

      // Now try to access a specific table to check if schema is initialized
      try {
        const schemaTestResponse = await fetch(`${supabaseUrl}/rest/v1/projects?limit=1`, {
          method: "GET",
          headers: {
            "Content-Type": "application/json",
            apikey: supabaseAnonKey,
            Authorization: `Bearer ${supabaseAnonKey}`,
          },
        })

        if (!schemaTestResponse.ok) {
          // If we get a 404 or other error, it might be a schema issue
          if (
            schemaTestResponse.status === 404 ||
            schemaTestResponse.status === 400 ||
            schemaTestResponse.status === 500
          ) {
            setIsSchemaError(true)
            setError("Database tables not initialized")
          }
        }
      } catch (schemaErr) {
        // If there's an error checking the schema, mark it as a schema issue
        console.error("Schema check error:", schemaErr)
        setIsSchemaError(true)
        setError("Database tables not initialized")
      }
    } catch (err) {
      console.error("Supabase connection error:", err)

      // This is a connection error
      setStatus("error")
      setError(err instanceof Error ? err.message : "Unknown error")
    } finally {
      setIsChecking(false)
    }
  }

  useEffect(() => {
    checkConnection()
  }, [])

  return (
    <>
      {error && !isSchemaError && <OfflineModeBanner isSchemaError={false} />}
      {error && isSchemaError && <OfflineModeBanner isSchemaError={true} />}
      <Card className="mb-4">
        <CardContent className="pt-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div
                className={`w-3 h-3 rounded-full ${
                  status === "connected" ? "bg-green-500" : status === "error" ? "bg-red-500" : "bg-yellow-500"
                }`}
              />
              <div>
                <p className="text-sm">
                  Supabase: {status === "connected" ? "Connected" : status === "error" ? "Error" : "Checking..."}
                </p>
                {error && !isSchemaError && (
                  <div className="flex items-center text-xs text-red-500 mt-1">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    <span>Working in offline mode - changes will not be saved</span>
                  </div>
                )}
                {error && isSchemaError && (
                  <div className="flex items-center text-xs text-yellow-500 mt-1">
                    <AlertTriangle className="h-3 w-3 mr-1" />
                    <span>Database tables not initialized</span>
                  </div>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={checkConnection} disabled={isChecking}>
                {isChecking ? "Checking..." : "Check"}
              </Button>
              {status === "error" && (
                <Link href="/supabase-test" className="text-xs text-blue-600 hover:underline flex items-center">
                  Diagnose <ExternalLink className="h-3 w-3 ml-1" />
                </Link>
              )}
              {isSchemaError && (
                <Link href="/setup-database" className="text-xs text-blue-600 hover:underline flex items-center">
                  Setup DB <ExternalLink className="h-3 w-3 ml-1" />
                </Link>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </>
  )
}
