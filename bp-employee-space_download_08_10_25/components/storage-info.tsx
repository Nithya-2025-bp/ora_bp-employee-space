"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { getProjects } from "@/lib/actions/project-actions"

export default function StorageInfo() {
  const [projectCount, setProjectCount] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [dataDir, setDataDir] = useState<string | null>(null)

  const fetchInfo = async () => {
    setIsLoading(true)
    try {
      // Get projects to check count
      const projects = await getProjects()
      setProjectCount(projects.length)

      // Get data directory info
      const response = await fetch("/api/storage-check")
      if (response.ok) {
        const data = await response.json()
        setDataDir(data.dataDirectory)
      }
    } catch (error) {
      console.error("Error fetching storage info:", error)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchInfo()
  }, [])

  return (
    <Card className="mb-4">
      <CardContent className="pt-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">Storage: {dataDir ? dataDir : "Loading..."}</p>
            <p className="text-sm text-gray-500">Projects: {projectCount !== null ? projectCount : "Loading..."}</p>
          </div>
          <Button variant="outline" size="sm" onClick={fetchInfo} disabled={isLoading}>
            {isLoading ? "..." : "Refresh"}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
