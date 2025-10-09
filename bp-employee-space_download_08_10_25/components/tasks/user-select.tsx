"use client"

import type React from "react"

import { useState, useRef, useEffect, useCallback } from "react"
import { users as staticUsers } from "@/lib/users"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { X, Check } from "lucide-react"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Input } from "@/components/ui/input"

interface UserSelectProps {
  selectedUsers: string[]
  onSelectionChange: (selectedUsers: string[]) => void
}

export default function UserSelect({ selectedUsers, onSelectionChange }: UserSelectProps) {
  const [searchTerm, setSearchTerm] = useState("")
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [internalSelectedUsers, setInternalSelectedUsers] = useState<string[]>([])
  const [users, setUsers] = useState<{ firstName: string; lastName: string; email: string }[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const firstRenderRef = useRef(true)

  // Load users when component mounts or dropdown opens
  useEffect(() => {
    const loadUsers = async () => {
      if (!isDropdownOpen) return

      setIsLoading(true)
      try {
        // Try to fetch users from the employee actions
        const { getEmployees } = await import("@/lib/actions/employee-actions")
        const employeesList = await getEmployees()

        if (employeesList && employeesList.length > 0) {
          setUsers(employeesList)
        } else {
          // Fallback to static users if API fails
          setUsers(staticUsers)
        }
      } catch (error) {
        console.error("Error loading users:", error)
        // Fallback to static users
        setUsers(staticUsers)
      } finally {
        setIsLoading(false)
      }
    }

    loadUsers()
  }, [isDropdownOpen])

  // Initialize internal state from props on first render and when selectedUsers changes
  useEffect(() => {
    if (firstRenderRef.current) {
      setInternalSelectedUsers([...selectedUsers])
      firstRenderRef.current = false
    }
  }, [selectedUsers])

  // Handle clicks outside the dropdown to close it
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false)
        // Apply changes when dropdown closes by clicking outside
        onSelectionChange(internalSelectedUsers)
      }
    }

    // Only add the event listener when the dropdown is open
    if (isDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [isDropdownOpen, internalSelectedUsers, onSelectionChange])

  // Toggle user selection without directly modifying parent state
  const toggleUser = useCallback((email: string, event?: React.MouseEvent) => {
    // Stop propagation to prevent the dropdown from closing
    if (event) {
      event.stopPropagation()
    }

    setInternalSelectedUsers((prev) => {
      if (prev.includes(email)) {
        return prev.filter((item) => item !== email)
      } else {
        return [...prev, email]
      }
    })
  }, [])

  // Filter users based on search term
  const filteredUsers = users.filter(
    (user) =>
      user.firstName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.lastName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      user.email.toLowerCase().includes(searchTerm.toLowerCase()),
  )

  // Get user name from email
  const getUserName = useCallback(
    (email: string) => {
      const user = users.find((u) => u.email === email)
      return user ? `${user.firstName} ${user.lastName}` : email
    },
    [users],
  )

  // Toggle dropdown without directly modifying state in an event handler
  const handleToggleDropdown = useCallback(() => {
    setIsDropdownOpen((prev) => !prev)
    if (!isDropdownOpen) {
      // When opening dropdown, sync internal state with props
      setInternalSelectedUsers([...selectedUsers])
    }
  }, [isDropdownOpen, selectedUsers])

  // Clear all selections
  const handleClearAll = useCallback((e: React.MouseEvent) => {
    e.stopPropagation()
    setInternalSelectedUsers([])
  }, [])

  // Close dropdown and save changes
  const handleDone = useCallback(
    (e: React.MouseEvent) => {
      e.stopPropagation()
      setIsDropdownOpen(false)
      // Update parent state when "Done" is clicked
      onSelectionChange(internalSelectedUsers)
    },
    [internalSelectedUsers, onSelectionChange],
  )

  // Remove a single user
  const handleRemoveUser = useCallback(
    (email: string, e: React.MouseEvent) => {
      e.stopPropagation()
      const newSelection = selectedUsers.filter((item) => item !== email)
      onSelectionChange(newSelection)
      setInternalSelectedUsers(newSelection)
    },
    [selectedUsers, onSelectionChange],
  )

  return (
    <div className="space-y-2 relative">
      {/* Selected users display */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {selectedUsers.map((email) => {
            const name = getUserName(email)
            return (
              <Badge key={email} variant="secondary" className="flex items-center gap-1 py-1 px-2">
                {name}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-4 w-4 p-0 ml-1 rounded-full hover:bg-gray-200"
                  onClick={(e) => handleRemoveUser(email, e)}
                >
                  <X className="h-3 w-3" />
                  <span className="sr-only">Remove</span>
                </Button>
              </Badge>
            )
          })}
        </div>
      )}

      {/* Dropdown trigger button */}
      <Button type="button" variant="outline" className="w-full justify-between" onClick={handleToggleDropdown}>
        {selectedUsers.length > 0
          ? `${selectedUsers.length} user${selectedUsers.length > 1 ? "s" : ""} selected`
          : "Select users..."}
      </Button>

      {/* Dropdown content */}
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute z-50 w-full mt-1 bg-white border border-gray-200 rounded-md shadow-lg"
        >
          <div className="p-2">
            <div className="flex justify-between items-center mb-2">
              <Button type="button" variant="outline" size="sm" onClick={handleClearAll} className="text-xs">
                Clear All
              </Button>
              <Button type="button" size="sm" onClick={handleDone} className="text-xs">
                Done
              </Button>
            </div>
            <Input
              type="text"
              placeholder="Search users..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="mb-2"
              onClick={(e) => e.stopPropagation()}
            />
            <ScrollArea className="h-60">
              {isLoading ? (
                <div className="flex items-center justify-center h-full">
                  <p className="text-sm text-gray-500">Loading users...</p>
                </div>
              ) : (
                <div className="space-y-1">
                  {filteredUsers.length > 0 ? (
                    filteredUsers.map((user) => {
                      const isSelected = internalSelectedUsers.includes(user.email)
                      return (
                        <div
                          key={user.email}
                          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded cursor-pointer"
                          onClick={(e) => {
                            e.stopPropagation()
                            toggleUser(user.email, e)
                          }}
                        >
                          {/* Custom checkbox implementation to avoid Radix UI issues */}
                          <div
                            className={`h-4 w-4 rounded-sm border flex items-center justify-center ${
                              isSelected ? "bg-primary border-primary text-primary-foreground" : "border-primary"
                            }`}
                          >
                            {isSelected && <Check className="h-3 w-3" />}
                          </div>
                          <label className="text-sm flex-grow cursor-pointer">{`${user.firstName} ${user.lastName}`}</label>
                          {/* Show email as a smaller text */}
                          <span className="text-xs text-gray-500">{user.email.split("@")[0]}</span>
                        </div>
                      )
                    })
                  ) : (
                    <div className="p-2 text-center text-gray-500">No users found</div>
                  )}
                </div>
              )}
            </ScrollArea>
          </div>
        </div>
      )}
    </div>
  )
}
