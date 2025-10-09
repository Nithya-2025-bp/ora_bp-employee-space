import { getSupabaseServerActionClient } from "./server"

export async function ensureEmployeesBucketExists(): Promise<{ success: boolean; message: string }> {
  try {
    const supabase = getSupabaseServerActionClient()

    // Check if the bucket already exists
    const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets()

    if (bucketsError) {
      console.error("Error listing buckets:", bucketsError)
      return { success: false, message: `Error listing buckets: ${bucketsError.message}` }
    }

    const bucketExists = buckets.some((bucket) => bucket.name === "employees")

    if (bucketExists) {
      console.log("Employees bucket already exists")
      return { success: true, message: "Employees bucket already exists" }
    }

    // Create the bucket
    const { data, error } = await supabase.storage.createBucket("employees", {
      public: true,
      fileSizeLimit: 5242880, // 5MB
      allowedMimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp"],
    })

    if (error) {
      console.error("Error creating employees bucket:", error)
      return { success: false, message: `Error creating employees bucket: ${error.message}` }
    }

    console.log("Employees bucket created successfully")
    return { success: true, message: "Employees bucket created successfully" }
  } catch (error) {
    console.error("Error in ensureEmployeesBucketExists:", error)
    return {
      success: false,
      message: `Error ensuring employees bucket exists: ${error instanceof Error ? error.message : String(error)}`,
    }
  }
}

export async function getPublicUrl(bucketName: string, filePath: string): Promise<string> {
  const supabase = getSupabaseServerActionClient()
  const { data } = supabase.storage.from(bucketName).getPublicUrl(filePath)
  return data.publicUrl
}
