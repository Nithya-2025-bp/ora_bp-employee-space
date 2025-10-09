import { NextResponse } from "next/server"
import { testConnection } from "@/lib/db/supabase-db"

export async function GET() {
  try {
    const result = await testConnection()

    return NextResponse.json(result)
  } catch (error) {
    console.error("Error in test-supabase API:", error)
    return NextResponse.json(
      {
        success: false,
        message: `Error: ${error instanceof Error ? error.message : String(error)}`,
        stack: error instanceof Error ? error.stack : "No stack trace available",
      },
      { status: 500 },
    )
  }
}
