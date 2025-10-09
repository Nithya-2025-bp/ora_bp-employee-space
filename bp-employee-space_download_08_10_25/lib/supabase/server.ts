import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

// Server-side singleton
let serverClient: SupabaseClient | null = null

// Create a Supabase client for server components with better error handling
export function getSupabaseServerClient() {
  if (serverClient) {
    return serverClient
  }

  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables in getSupabaseServerClient")
    throw new Error("Missing Supabase environment variables")
  }

  try {
    serverClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    })

    return serverClient
  } catch (error) {
    console.error("Error creating Supabase server client:", error)
    throw new Error(`Failed to create Supabase client: ${error.message}`)
  }
}

// For server actions, create a function that returns a new client
export function getSupabaseServerActionClient() {
  const supabaseUrl = process.env.SUPABASE_URL
  const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase environment variables in getSupabaseServerActionClient")
    throw new Error("Missing Supabase environment variables")
  }

  try {
    return createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        persistSession: false,
      },
    })
  } catch (error) {
    console.error("Error creating Supabase action client:", error)
    throw new Error(`Failed to create Supabase client: ${error.message}`)
  }
}
