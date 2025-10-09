"use client"

import type React from "react"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Checkbox } from "@/components/ui/checkbox"
import { toast } from "@/hooks/use-toast"
import { Settings, Loader2 } from "lucide-react"
import Image from "next/image"
import type { User } from "@/lib/users"
import { uploadProfilePicture } from "@/lib/actions/employee-actions"

interface EditEmployeeDialogProps {
  employee: User
  onUpdate: (updatedEmployee: User) => Promise<boolean>
}

export default function EditEmployeeDialog({ employee, onUpdate }: EditEmployeeDialogProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [firstName, setFirstName] = useState(employee.firstName)
  const [lastName, setLastName] = useState(employee.lastName)
  const [isAdmin, setIsAdmin] = useState(employee.isAdmin)
  const [profilePicture, setProfilePicture] = useState<string | null>(employee.profilePicture || null)
  const [profilePictureFile, setProfilePictureFile] = useState<File | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset form when dialog opens or employee changes
  useEffect(() => {
    if (isOpen) {
      setFirstName(employee.firstName)
      setLastName(employee.lastName)
      setIsAdmin(employee.isAdmin)
      setProfilePicture(employee.profilePicture || null)
      setProfilePictureFile(null)
    }
  }, [isOpen, employee])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      console.log("[v0] Starting form submission")
      let profilePictureUrl = employee.profilePicture

      // Upload profile picture if a new one was selected
      if (profilePictureFile) {
        console.log("[v0] Uploading profile picture file:", profilePictureFile.name)
        try {
          const uploadResult = await uploadProfilePicture(employee.email, profilePictureFile)
          console.log("[v0] Upload result:", uploadResult)
          if (uploadResult.success && uploadResult.url) {
            profilePictureUrl = uploadResult.url
            console.log("[v0] Profile picture uploaded successfully:", profilePictureUrl)
          } else {
            console.error("[v0] Upload failed:", uploadResult.message)
            toast({
              title: "Warning",
              description: "Failed to upload profile picture, but other changes will be saved",
              variant: "destructive",
            })
          }
        } catch (uploadError) {
          console.error("[v0] Upload error:", uploadError)
          toast({
            title: "Warning",
            description: "Failed to upload profile picture, but other changes will be saved",
            variant: "destructive",
          })
        }
      }

      console.log("[v0] Creating updated employee object")
      // Create updated employee object
      const updatedEmployee: User = {
        ...employee,
        firstName,
        lastName,
        isAdmin,
        profilePicture: profilePictureUrl,
      }

      console.log("[v0] Calling onUpdate with:", updatedEmployee)
      // Call the onUpdate callback
      const success = await onUpdate(updatedEmployee)

      if (success) {
        console.log("[v0] Update successful, closing dialog")
        setIsOpen(false)
      } else {
        console.log("[v0] Update failed")
      }
    } catch (error) {
      console.error("[v0] Error in handleSubmit:", error)
      toast({
        title: "Error",
        description: "Failed to update employee information",
        variant: "destructive",
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleProfilePictureChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      // Check file size (max 5MB)
      if (file.size > 5 * 1024 * 1024) {
        toast({
          title: "Error",
          description: "Profile picture must be less than 5MB",
          variant: "destructive",
        })
        return
      }

      // Check file type
      if (!file.type.startsWith("image/")) {
        toast({
          title: "Error",
          description: "File must be an image",
          variant: "destructive",
        })
        return
      }

      setProfilePictureFile(file)

      // Create a preview URL
      const reader = new FileReader()
      reader.onload = () => {
        setProfilePicture(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="h-8 w-8 rounded-full bg-gray-100 hover:bg-gray-200 border-gray-300"
        >
          <Settings className="h-4 w-4 text-gray-700" />
          <span className="sr-only">Edit employee</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <DialogTitle>Edit Employee</DialogTitle>
          <DialogDescription>Make changes to the employee's profile information.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="grid gap-4 py-4">
            {/* Profile Picture */}
            <div className="flex flex-col items-center gap-2">
              <div className="h-24 w-24 overflow-hidden rounded-full bg-gray-200 flex items-center justify-center">
                {profilePicture ? (
                  <Image
                    src={profilePicture || "/placeholder.svg"}
                    alt="Profile preview"
                    width={96}
                    height={96}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <svg className="h-12 w-12 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M24 20.993V24H0v-2.996A14.977 14.977 0 0112.004 15c4.904 0 9.26 2.354 11.996 5.993zM16.002 8.999a4 4 0 11-8 0 4 4 0 018 0z" />
                  </svg>
                )}
              </div>
              <Label htmlFor="picture" className="cursor-pointer text-sm text-blue-600 hover:underline">
                Change profile picture
              </Label>
              <Input
                id="picture"
                type="file"
                accept="image/*"
                onChange={handleProfilePictureChange}
                className="hidden"
              />
            </div>

            {/* Name Fields */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
              </div>
              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
              </div>
            </div>

            {/* Email Field (Disabled) */}
            <div>
              <Label htmlFor="email">Email</Label>
              <Input id="email" type="email" value={employee.email} disabled className="bg-gray-100 text-gray-800" />
              <p className="text-xs text-gray-500 mt-1">Email cannot be changed</p>
            </div>

            {/* Admin Status */}
            <div className="flex items-center space-x-2">
              <Checkbox id="isAdmin" checked={isAdmin} onCheckedChange={(checked) => setIsAdmin(checked === true)} />
              <Label htmlFor="isAdmin" className="cursor-pointer">
                Admin privileges
              </Label>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsOpen(false)} disabled={isSubmitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || !firstName || !lastName}
              className="bg-[#0051FF] hover:bg-[#0051FF]/90"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
