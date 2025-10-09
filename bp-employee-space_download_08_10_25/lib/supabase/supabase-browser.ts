import { createClient } from "@supabase/supabase-js"
import type { SupabaseClient } from "@supabase/supabase-js"

// Create a variable to store the client instance
let browserClient: SupabaseClient | null = null

export const getSupabaseBrowserClient = () => {
  // Return the existing instance if it exists
  if (browserClient) {
    return browserClient
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error("Missing Supabase environment variables:", {
      url: supabaseUrl ? "Set" : "Missing",
      key: supabaseAnonKey ? "Set" : "Missing",
    })
    throw new Error("Missing Supabase environment variables. Please check your .env.local file.")
  }

  try {
    // Create a new instance
    browserClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: {
        persistSession: true,
        storageKey: "bp-employee-space-auth",
      },
    })

    console.log("Supabase browser client initialized successfully")
    return browserClient
  } catch (error) {
    console.error("Error initializing Supabase client:", error)
    throw error
  }
}

// Add a function to explicitly reset the client (useful for testing or logout)
export const resetSupabaseBrowserClient = () => {
  browserClient = null
}
