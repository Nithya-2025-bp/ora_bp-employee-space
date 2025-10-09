"use server"

import { getSupabaseServerActionClient } from "../supabase/server"
import { ensureEmployeesBucketExists } from "../supabase/storage-utils"
import type { User } from "../users"
import { getCurrentUser } from "../auth"

// Mock users array for fallback
const users: User[] = [
  {
    email: "john.doe@example.com",
    firstName: "John",
    lastName: "Doe",
    isAdmin: true,
    password: "password123",
    passwordChanged: false,
    profilePicture: null,
  },
  {
    email: "jane.smith@example.com",
    firstName: "Jane",
    lastName: "Smith",
    isAdmin: false,
    password: "password456",
    passwordChanged: true,
    profilePicture: null,
  },
]

// Get all employees from the database
export async function getEmployees(): Promise<User[]> {
  try {
    // Check if user is authenticated
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return []
    }

    const supabase = getSupabaseServerActionClient()

    try {
      // Get all employees
      const { data, error } = await supabase.from("employees").select("*").order("first_name", { ascending: true })

      if (error) {
        console.error("Error fetching employees:", error)
        // Fall back to static users array
        console.log("Falling back to static users array")
        return [...users]
      }

      if (!data || data.length === 0) {
        console.log("No employees found in database, falling back to static users array")
        return [...users]
      }

      // Map database fields to User interface
      return data.map((employee) => ({
        email: employee.email,
        firstName: employee.first_name,
        lastName: employee.last_name,
        isAdmin: employee.is_admin,
        password: employee.password,
        passwordChanged: employee.password_changed,
        profilePicture: employee.profile_picture_url,
      }))
    } catch (dbError) {
      console.error("Database error in getEmployees:", dbError)
      // Fall back to static users array
      console.log("Falling back to static users array due to database error")
      return [...users]
    }
  } catch (error) {
    console.error("Error in getEmployees:", error)
    // Fall back to static users array
    return [...users]
  }
}

// Add a new employee to the database
export async function addEmployee(employee: User): Promise<{ success: boolean; message?: string }> {
  try {
    // Check if user is authenticated and is an admin
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    if (!currentUser.isAdmin) {
      return { success: false, message: "Only admins can add employees" }
    }

    const supabase = getSupabaseServerActionClient()

    // Check if employee already exists
    const { data: existingEmployee, error: checkError } = await supabase
      .from("employees")
      .select("email")
      .eq("email", employee.email.toLowerCase())
      .maybeSingle()

    if (checkError) {
      console.error("Error checking existing employee:", checkError)
      return { success: false, message: "Error checking existing employee" }
    }

    if (existingEmployee) {
      return { success: false, message: "Employee with this email already exists" }
    }

    // Insert new employee
    const { error: insertError } = await supabase.from("employees").insert({
      email: employee.email.toLowerCase(),
      first_name: employee.firstName,
      last_name: employee.lastName,
      is_admin: employee.isAdmin,
      password: employee.password,
      password_changed: employee.passwordChanged,
      profile_picture_url: employee.profilePicture || null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })

    if (insertError) {
      console.error("Error adding employee:", insertError)
      return { success: false, message: "Error adding employee" }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in addEmployee:", error)
    return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// Update an existing employee in the database
export async function updateEmployee(employee: User): Promise<{ success: boolean; message?: string }> {
  try {
    // Check if user is authenticated and is an admin
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    if (!currentUser.isAdmin) {
      return { success: false, message: "Only admins can update employees" }
    }

    const supabase = getSupabaseServerActionClient()

    // Update employee
    const { error: updateError } = await supabase
      .from("employees")
      .update({
        first_name: employee.firstName,
        last_name: employee.lastName,
        is_admin: employee.isAdmin,
        profile_picture_url: employee.profilePicture || null,
        updated_at: new Date().toISOString(),
      })
      .eq("email", employee.email)

    if (updateError) {
      console.error("Error updating employee:", updateError)
      return { success: false, message: "Error updating employee" }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in updateEmployee:", error)
    return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// Delete an employee from the database
export async function deleteEmployee(email: string): Promise<{ success: boolean; message?: string }> {
  try {
    // Check if user is authenticated and is an admin
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      return { success: false, message: "Not authenticated" }
    }

    if (!currentUser.isAdmin) {
      return { success: false, message: "Only admins can delete employees" }
    }

    const supabase = getSupabaseServerActionClient()

    // Delete employee
    const { error: deleteError } = await supabase.from("employees").delete().eq("email", email)

    if (deleteError) {
      console.error("Error deleting employee:", deleteError)
      return { success: false, message: "Error deleting employee" }
    }

    return { success: true }
  } catch (error) {
    console.error("Error in deleteEmployee:", error)
    return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}

// Upload a profile picture for an employee
export async function uploadProfilePicture(
  email: string,
  file: File,
): Promise<{ success: boolean; url?: string; message?: string }> {
  try {
    console.log("[v0] uploadProfilePicture started for:", email)

    // Check if user is authenticated and is an admin
    const currentUser = await getCurrentUser()
    if (!currentUser) {
      console.log("[v0] uploadProfilePicture: Not authenticated")
      return { success: false, message: "Not authenticated" }
    }

    if (!currentUser.isAdmin) {
      console.log("[v0] uploadProfilePicture: Not admin")
      return { success: false, message: "Only admins can upload profile pictures" }
    }

    console.log("[v0] uploadProfilePicture: User authenticated and is admin")

    // Ensure the storage bucket exists
    console.log("[v0] uploadProfilePicture: Ensuring bucket exists")
    const bucketResult = await ensureEmployeesBucketExists()
    if (!bucketResult.success) {
      console.log("[v0] uploadProfilePicture: Bucket creation failed:", bucketResult.message)
      return { success: false, message: bucketResult.message }
    }
    console.log("[v0] uploadProfilePicture: Bucket exists")

    console.log("[v0] uploadProfilePicture: Getting Supabase client")
    const supabase = getSupabaseServerActionClient()
    console.log("[v0] uploadProfilePicture: Got Supabase client")

    // Create a unique file name
    const fileName = `${email.replace(/[^a-z0-9]/gi, "_")}_${Date.now()}`
    const fileExt = file.name.split(".").pop()
    const filePath = `profiles/${fileName}.${fileExt}`
    console.log("[v0] uploadProfilePicture: File path:", filePath)

    console.log("[v0] uploadProfilePicture: Converting file to ArrayBuffer")
    const fileArrayBuffer = await file.arrayBuffer()
    console.log("[v0] uploadProfilePicture: ArrayBuffer created, size:", fileArrayBuffer.byteLength)

    // Upload file to Supabase Storage
    console.log("[v0] uploadProfilePicture: Starting upload to Supabase")
    const { data, error } = await supabase.storage.from("employees").upload(filePath, fileArrayBuffer, {
      contentType: file.type,
      upsert: true,
    })

    if (error) {
      console.error("[v0] uploadProfilePicture: Upload error:", error)
      return { success: false, message: `Error uploading profile picture: ${error.message}` }
    }

    console.log("[v0] uploadProfilePicture: Upload successful, data:", data)

    // Get public URL
    console.log("[v0] uploadProfilePicture: Getting public URL")
    const {
      data: { publicUrl },
    } = supabase.storage.from("employees").getPublicUrl(filePath)
    console.log("[v0] uploadProfilePicture: Public URL:", publicUrl)

    // Update employee record with profile picture URL
    console.log("[v0] uploadProfilePicture: Updating employee record")
    const { error: updateError } = await supabase
      .from("employees")
      .update({
        profile_picture_url: publicUrl,
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)

    if (updateError) {
      console.error("[v0] uploadProfilePicture: Update error:", updateError)
      return { success: false, message: "Error updating employee with profile picture URL" }
    }

    console.log("[v0] uploadProfilePicture: Employee record updated successfully")
    return { success: true, url: publicUrl }
  } catch (error) {
    console.error("[v0] uploadProfilePicture: Caught error:", error)
    if (error instanceof Error) {
      console.error("[v0] uploadProfilePicture: Error name:", error.name)
      console.error("[v0] uploadProfilePicture: Error message:", error.message)
      console.error("[v0] uploadProfilePicture: Error stack:", error.stack)
    }
    return { success: false, message: `Error: ${error instanceof Error ? error.message : String(error)}` }
  }
}
