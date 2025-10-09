"use client"

import type React from "react"

import { useState } from "react"
import { Eye, EyeOff, Lock, Mail } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { authenticateUser } from "@/lib/auth"

export default function LoginForm() {
  const router = useRouter()
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      const result = await authenticateUser(email, password)

      if (result.success) {
        if (result.requirePasswordChange) {
          // Redirect to password change page
          router.push("/change-password")
        } else {
          // Redirect to dashboard
          router.push("/dashboard")
        }
      } else {
        setError("Invalid email or password")
      }
    } catch (err) {
      setError("An error occurred. Please try again.")
      console.error(err)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <Card className="w-full border-0 bg-white/90 text-black backdrop-blur-sm">
      <CardHeader className="space-y-1">
        <div className="flex flex-col items-center justify-center mb-2">
          <Image src="/ora-logo.png" alt="Ora Logo" width={300} height={80} className="h-auto w-auto" />
        </div>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-500">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="email" className="text-gray-700">
              Email
            </Label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="email"
                type="email"
                placeholder="name@blupantera.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="border-[#0051FF]/30 bg-[#f5f5f5] pl-10 text-black placeholder:text-gray-500 focus:border-[#0051FF] focus:ring-[#0051FF]/10"
              />
            </div>
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password" className="text-gray-700">
                Password
              </Label>
              <a href="#" className="text-xs text-[#0051FF] hover:underline">
                Forgot password?
              </a>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="border-[#0051FF]/30 bg-[#f5f5f5] pl-10 text-black placeholder:text-gray-500 focus:border-[#0051FF] focus:ring-[#0051FF]/10"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showPassword ? "Hide password" : "Show password"}</span>
              </button>
            </div>
          </div>
          <Button type="submit" disabled={isLoading} className="w-full bg-[#0051FF] text-white hover:bg-[#0051FF]/90">
            {isLoading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4 border-t border-[#0051FF]/20 pt-4">
        <div className="text-center text-sm text-gray-700">
          <span>Don&apos;t have an account? </span>
          <a href="#" className="text-[#0051FF] hover:underline">
            Contact IT
          </a>
        </div>
        <div className="text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Blu Pantera. All rights reserved.
        </div>
      </CardFooter>
    </Card>
  )
}
