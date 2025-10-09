"use client"

import type React from "react"

import { useState } from "react"
import { Eye, EyeOff, Lock } from "lucide-react"
import Image from "next/image"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { changePassword } from "@/lib/auth"

interface ChangePasswordFormProps {
  userEmail: string
}

export default function ChangePasswordForm({ userEmail }: ChangePasswordFormProps) {
  const router = useRouter()
  const [showCurrentPassword, setShowCurrentPassword] = useState(false)
  const [showNewPassword, setShowNewPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [currentPassword, setCurrentPassword] = useState("")
  const [newPassword, setNewPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState("")
  const [passwordStrength, setPasswordStrength] = useState(0)

  // Password strength checker
  const checkPasswordStrength = (password: string) => {
    let strength = 0

    if (password.length >= 8) strength += 1
    if (/[A-Z]/.test(password)) strength += 1
    if (/[a-z]/.test(password)) strength += 1
    if (/[0-9]/.test(password)) strength += 1
    if (/[^A-Za-z0-9]/.test(password)) strength += 1

    setPasswordStrength(strength)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    // Validate passwords
    if (newPassword !== confirmPassword) {
      setError("New passwords do not match")
      setIsLoading(false)
      return
    }

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long")
      setIsLoading(false)
      return
    }

    if (passwordStrength < 3) {
      setError("Password is not strong enough")
      setIsLoading(false)
      return
    }

    try {
      const result = await changePassword(userEmail, currentPassword, newPassword)

      if (result.success) {
        // Redirect to dashboard
        router.push("/dashboard")
      } else {
        setError(result.message)
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
          <Image
            src="/blu-pantera-dashboard-logo.png"
            alt="Blu Pantera Logo"
            width={300}
            height={80}
            className="h-auto w-auto"
          />
          <p className="mt-2 text-xl font-semibold text-[#0051FF]">Employee</p>
        </div>
        <CardTitle className="text-xl font-bold text-center">Change Your Password</CardTitle>
        <CardDescription className="text-center text-gray-700">
          You must change your password before continuing
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="rounded-md bg-red-50 p-3 text-sm text-red-500">{error}</div>}
          <div className="space-y-2">
            <Label htmlFor="current-password" className="text-gray-700">
              Current Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="current-password"
                type={showCurrentPassword ? "text" : "password"}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="border-[#0051FF]/30 bg-[#f5f5f5] pl-10 text-black placeholder:text-gray-500 focus:border-[#0051FF] focus:ring-[#0051FF]/10"
              />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showCurrentPassword ? "Hide password" : "Show password"}</span>
              </button>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-password" className="text-gray-700">
              New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="new-password"
                type={showNewPassword ? "text" : "password"}
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value)
                  checkPasswordStrength(e.target.value)
                }}
                required
                className="border-[#0051FF]/30 bg-[#f5f5f5] pl-10 text-black placeholder:text-gray-500 focus:border-[#0051FF] focus:ring-[#0051FF]/10"
              />
              <button
                type="button"
                onClick={() => setShowNewPassword(!showNewPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showNewPassword ? "Hide password" : "Show password"}</span>
              </button>
            </div>
            {newPassword && (
              <div className="mt-2">
                <div className="flex h-2 w-full overflow-hidden rounded-full bg-gray-200">
                  <div
                    className={`h-full ${
                      passwordStrength <= 2 ? "bg-red-500" : passwordStrength <= 3 ? "bg-yellow-500" : "bg-green-500"
                    }`}
                    style={{ width: `${(passwordStrength / 5) * 100}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-gray-500">
                  {passwordStrength <= 2 && "Weak password"}
                  {passwordStrength === 3 && "Moderate password"}
                  {passwordStrength === 4 && "Strong password"}
                  {passwordStrength === 5 && "Very strong password"}
                </p>
              </div>
            )}
            <p className="text-xs text-gray-500">
              Password must be at least 8 characters and include uppercase, lowercase, numbers, and special characters.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm-password" className="text-gray-700">
              Confirm New Password
            </Label>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                id="confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                className="border-[#0051FF]/30 bg-[#f5f5f5] pl-10 text-black placeholder:text-gray-500 focus:border-[#0051FF] focus:ring-[#0051FF]/10"
              />
              <button
                type="button"
                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
              >
                {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                <span className="sr-only">{showConfirmPassword ? "Hide password" : "Show password"}</span>
              </button>
            </div>
            {confirmPassword && newPassword !== confirmPassword && (
              <p className="text-xs text-red-500">Passwords do not match</p>
            )}
          </div>
          <Button type="submit" disabled={isLoading} className="w-full bg-[#0051FF] text-white hover:bg-[#0051FF]/90">
            {isLoading ? "Changing Password..." : "Change Password"}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4 border-t border-[#0051FF]/20 pt-4">
        <div className="text-center text-xs text-gray-500">
          &copy; {new Date().getFullYear()} Blu Pantera. All rights reserved.
        </div>
      </CardFooter>
    </Card>
  )
}
