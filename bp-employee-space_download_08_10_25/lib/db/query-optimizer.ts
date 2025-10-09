// Create a new utility for optimizing database queries
import { getSupabaseServerActionClient } from "../supabase/server"

// Generic cache for database queries
type CacheEntry<T> = {
  data: T
  timestamp: number
  expiresAt: number
}

const queryCache = new Map<string, CacheEntry<any>>()

// Default cache duration (10 minutes)
const DEFAULT_CACHE_DURATION = 10 * 60 * 1000

/**
 * Executes a Supabase query with caching
 * @param cacheKey Unique key for caching the result
 * @param queryFn Function that executes the actual query
 * @param cacheDuration How long to cache the result in milliseconds
 */
export async function cachedQuery<T>(
  cacheKey: string,
  queryFn: (supabase: any) => Promise<{ data: T; error: any }>,
  cacheDuration: number = DEFAULT_CACHE_DURATION,
): Promise<T> {
  // Check if we have a valid cache entry
  const cachedEntry = queryCache.get(cacheKey)
  const now = Date.now()

  if (cachedEntry && now < cachedEntry.expiresAt) {
    console.log(`Using cached result for: ${cacheKey}`)
    return cachedEntry.data
  }

  // Execute the query
  const supabase = getSupabaseServerActionClient()
  const { data, error } = await queryFn(supabase)

  if (error) {
    console.error(`Error executing query for ${cacheKey}:`, error)
    throw error
  }

  // Cache the result
  queryCache.set(cacheKey, {
    data,
    timestamp: now,
    expiresAt: now + cacheDuration,
  })

  return data
}

/**
 * Invalidates a specific cache entry or all entries
 * @param cacheKey Optional key to invalidate. If not provided, all cache entries are invalidated.
 */
export function invalidateCache(cacheKey?: string): void {
  if (cacheKey) {
    queryCache.delete(cacheKey)
    console.log(`Cache invalidated for: ${cacheKey}`)
  } else {
    queryCache.clear()
    console.log("All cache entries invalidated")
  }
}

/**
 * Executes a query with retry logic for handling rate limits
 * @param queryFn Function that executes the query
 * @param maxRetries Maximum number of retries
 */
export async function queryWithRetry<T>(queryFn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let retries = 0

  while (retries < maxRetries) {
    try {
      return await queryFn()
    } catch (error) {
      const isRateLimit =
        error.message && (error.message.includes("Too Many Requests") || error.message.includes("429"))

      if (isRateLimit && retries < maxRetries - 1) {
        // Exponential backoff
        const delay = Math.pow(2, retries) * 1000 + Math.random() * 1000
        console.log(`Rate limit hit, retrying in ${delay}ms (attempt ${retries + 1}/${maxRetries})`)
        await new Promise((resolve) => setTimeout(resolve, delay))
        retries++
      } else {
        throw error
      }
    }
  }

  // This should never be reached due to the throw in the catch block
  throw new Error("Failed after maximum retries")
}
