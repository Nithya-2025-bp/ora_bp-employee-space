"use client"

import type React from "react"

import { createContext, useContext, useState, useEffect } from "react"
import { createClientComponentClient } from "@supabase/auth-helpers-nextjs"
import type { SupabaseClient } from "@supabase/auth-helpers-nextjs"

type SupabaseContext = {
  supabase: SupabaseClient | null
  isSupabaseConnected: boolean
}

const Context = createContext<SupabaseContext>({
  supabase: null,
  isSupabaseConnected: false,
})

export default function SupabaseProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [supabase, setSupabase] = useState<SupabaseClient | null>(null)
  const [isSupabaseConnected, setIsSupabaseConnected] = useState(false)

  useEffect(() => {
    try {
      // Check if Supabase environment variables are available
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
      const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

      if (!supabaseUrl || !supabaseAnonKey) {
        console.warn("Missing Supabase environment variables:", {
          url: supabaseUrl ? "Available" : "Missing",
          key: supabaseAnonKey ? "Available" : "Missing",
        })
        setIsSupabaseConnected(false)
        return
      }

      const supabaseClient = createClientComponentClient()
      setSupabase(supabaseClient)

      // Simply assume connection is available if env vars are present
      console.log("Supabase client initialized")
      setIsSupabaseConnected(true)
    } catch (error) {
      console.warn("Error initializing Supabase client:", error)
      setIsSupabaseConnected(false)
    }
  }, [])

  return <Context.Provider value={{ supabase, isSupabaseConnected }}>{children}</Context.Provider>
}

export const useSupabase = () => useContext(Context)
