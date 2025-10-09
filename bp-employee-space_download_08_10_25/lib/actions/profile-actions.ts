"use server"

import { revalidatePath } from "next/cache"
import { getSupabaseServerActionClient } from "../supabase/server"
import { ensureEmployeesBucketExists } from "../supabase/storage-utils"

interface ProfileUpdateParams {
  email: string
  firstName: string
  lastName: string
  profilePicture?: string | null
}

export async function updateUserProfile(params: ProfileUpdateParams): Promise<{ success: boolean; message?: string }> {
  try {
    const { email, firstName, lastName, profilePicture } = params
    const supabase = getSupabaseServerActionClient()

    // Update the user profile in the database
    const { error } = await supabase
      .from("employees")
      .update({
        first_name: firstName,
        last_name: lastName,
        profile_picture_url: profilePicture,
        updated_at: new Date().toISOString(),
      })
      .eq("email", email)

    if (error) {
      console.error("Error updating profile:", error)
      return { success: false, message: "Failed to update profile" }
    }

    // Revalidate the dashboard path to reflect changes
    revalidatePath("/dashboard")

    return { success: true }
  } catch (error) {
    console.error("Error in updateUserProfile:", error)
    return { success: false, message: "An unexpected error occurred" }
  }
}

export async function uploadProfilePicture(
  email: string,
  file: File,
): Promise<{ success: boolean; message?: string; url?: string }> {
  try {
    // Ensure the employees bucket exists
    const bucketResult = await ensureEmployeesBucketExists()
    if (!bucketResult.success) {
      return { success: false, message: bucketResult.message }
    }

    // Get file data as ArrayBuffer
    const fileArrayBuffer = await file.arrayBuffer()

    // Create a unique filename based on email and timestamp
    const timestamp = Date.now()
    const fileExtension = file.name.split(".").pop()
    const fileName = `${email.replace(/[^a-zA-Z0-9]/g, "_")}_${timestamp}.${fileExtension}`
    const filePath = `profiles/${fileName}`

    // Upload the file to Supabase Storage
    const supabase = getSupabaseServerActionClient()
    const { error: uploadError, data } = await supabase.storage.from("employees").upload(filePath, fileArrayBuffer, {
      contentType: file.type,
      upsert: true,
    })

    if (uploadError) {
      console.error("Error uploading profile picture:", uploadError)
      return { success: false, message: "Failed to upload profile picture" }
    }

    // Get the public URL for the uploaded file
    const {
      data: { publicUrl },
    } = supabase.storage.from("employees").getPublicUrl(filePath)

    return { success: true, url: publicUrl }
  } catch (error) {
    console.error("Error in uploadProfilePicture:", error)
    return { success: false, message: "An unexpected error occurred during upload" }
  }
}
