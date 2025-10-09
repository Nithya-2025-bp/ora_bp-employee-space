"use server"

import { cookies } from "next/headers"
import type { User } from "./users"
import { getSupabaseServerActionClient } from "./supabase/server"

// Development mode flag - set to true to bypass password change requirement
const DEVELOPMENT_MODE = true

export async function authenticateUser(
  email: string,
  password: string,
): Promise<{ success: boolean; user?: User; requirePasswordChange?: boolean }> {
  try {
    // Get Supabase client
    const supabase = getSupabaseServerActionClient()

    // Find the user by email - use ilike for case-insensitive matching
    const { data: userData, error } = await supabase
      .from("employees")
      .select("*")
      .ilike("email", email.trim()) // Add trim() to remove any whitespace
      .maybeSingle()

    // If user not found or error
    if (error) {
      console.error("Error fetching user:", error)
      return { success: false }
    }

    if (!userData) {
      console.log(`No user found with email: ${email}`)

      // Fallback to the static users array for development/testing
      const { users } = await import("./users")
      const staticUser = users.find((u) => u.email.toLowerCase() === email.toLowerCase())

      if (!staticUser || staticUser.password !== password) {
        return { success: false }
      }

      // Set a cookie to maintain the session
      const cookieStore = cookies()
      cookieStore.set("user_email", staticUser.email, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        maxAge: 60 * 60 * 24, // 1 day
        path: "/",
      })

      // In development mode, don't require password change
      if (!staticUser.passwordChanged && !DEVELOPMENT_MODE) {
        return { success: true, user: staticUser, requirePasswordChange: true }
      }

      return { success: true, user: staticUser, requirePasswordChange: false }
    }

    // Check password
    if (userData.password !== password) {
      return { success: false }
    }

    // Map database fields to User interface
    const user: User = {
      email: userData.email,
      firstName: userData.first_name,
      lastName: userData.last_name,
      isAdmin: userData.is_admin,
      password: userData.password,
      passwordChanged: userData.password_changed,
      profilePicture: userData.profile_picture_url,
    }

    // Set a cookie to maintain the session
    const cookieStore = cookies()
    cookieStore.set("user_email", user.email, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 60 * 60 * 24, // 1 day
      path: "/",
    })

    // In development mode, don't require password change
    if (!user.passwordChanged && !DEVELOPMENT_MODE) {
      return { success: true, user, requirePasswordChange: true }
    }

    return { success: true, user, requirePasswordChange: false }
  } catch (error) {
    console.error("Authentication error:", error)
    return { success: false }
  }
}

export async function getCurrentUser(): Promise<User | null> {
  try {
    const cookieStore = cookies()
    const userEmail = cookieStore.get("user_email")?.value

    if (!userEmail) {
      return null
    }

    // Get Supabase client
    const supabase = getSupabaseServerActionClient()

    // Find the user by email - use ilike for case-insensitive matching
    const { data: userData, error } = await supabase
      .from("employees")
      .select("*")
      .ilike("email", userEmail.trim()) // Add trim() to remove any whitespace
      .maybeSingle()

    // If user not found in database, try the static array
    if (!userData || error) {
      console.log(`User ${userEmail} not found in database, checking static array`)

      // Fallback to the static users array
      const { users } = await import("./users")
      const staticUser = users.find((u) => u.email.toLowerCase() === userEmail.toLowerCase())

      return staticUser || null
    }

    // Map database fields to User interface
    const user: User = {
      email: userData.email,
      firstName: userData.first_name,
      lastName: userData.last_name,
      isAdmin: userData.is_admin,
      password: userData.password,
      passwordChanged: userData.password_changed,
      profilePicture: userData.profile_picture_url,
    }

    return user
  } catch (error) {
    console.error("Error getting current user:", error)
    return null
  }
}

// Update the dashboard page to bypass password change check in development mode
export async function shouldForcePasswordChange(user: User): Promise<boolean> {
  return !user.passwordChanged && !DEVELOPMENT_MODE
}

export async function changePassword(
  email: string,
  currentPassword: string,
  newPassword: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const supabase = getSupabaseServerActionClient()

    // First, verify the current password by checking the employees table
    const { data: userData, error: fetchError } = await supabase
      .from("employees")
      .select("password")
      .ilike("email", email.trim()) // Add trim() to remove any whitespace
      .maybeSingle()

    if (fetchError) {
      console.error("Error fetching user for password verification:", fetchError)
      return {
        success: false,
        message: "Failed to verify current password",
      }
    }

    if (!userData) {
      // Fallback to static users array
      const { users } = await import("./users")
      const staticUser = users.find((u) => u.email.toLowerCase() === email.toLowerCase())

      if (!staticUser) {
        return {
          success: false,
          message: "User not found",
        }
      }

      if (staticUser.password !== currentPassword) {
        return {
          success: false,
          message: "Current password is incorrect",
        }
      }

      // For static users, we can't update the password in the database
      // This would need to be handled differently in a real application
      return {
        success: false,
        message: "Password change not supported for static users",
      }
    }

    // Verify the current password matches what's in the database
    if (userData.password !== currentPassword) {
      return {
        success: false,
        message: "Current password is incorrect",
      }
    }

    // Update the password in the employees table
    const { error: updateError } = await supabase
      .from("employees")
      .update({
        password: newPassword,
        password_changed: true,
        updated_at: new Date().toISOString(),
      })
      .ilike("email", email.trim()) // Add trim() to remove any whitespace

    if (updateError) {
      console.error("Error updating password:", updateError)
      return {
        success: false,
        message: "Failed to update password",
      }
    }

    return { success: true }
  } catch (error) {
    console.error("Error changing password:", error)
    return {
      success: false,
      message: "An unexpected error occurred",
    }
  }
}

export async function logout(): Promise<void> {
  const cookieStore = cookies()
  cookieStore.delete("user_email")
}
