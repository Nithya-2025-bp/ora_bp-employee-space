import type React from "react"
import type { Metadata } from "next"
import { Inter } from "next/font/google"
import "./globals.css"
import { ThemeProvider } from "@/components/theme-provider"
// Add the import for SupabaseProvider
import SupabaseProvider from "@/components/supabase-provider"
import { Toaster } from "@/components/ui/toaster"

const inter = Inter({ subsets: ["latin"] })

export const metadata: Metadata = {
  title: "Blu Pantera Employee Space",
  description: "Secure portal for Blu Pantera employees",
  icons: {
    icon: "/favicon.ico",
  },
    generator: 'v0.app'
}

// Update the RootLayout component to wrap children with SupabaseProvider
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
          <SupabaseProvider>{children}</SupabaseProvider>
        </ThemeProvider>
        <Toaster />
      </body>
    </html>
  )
}
