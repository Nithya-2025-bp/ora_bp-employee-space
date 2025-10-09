// Convert decimal hours to HH:MM format
export function decimalToHHMM(decimal: number): string {
  if (decimal === 0) return "00:00"

  // Round to nearest 15 minutes (0.25 hours)
  const roundedDecimal = Math.round(decimal * 4) / 4

  const hours = Math.floor(roundedDecimal)
  const minutes = Math.round((roundedDecimal - hours) * 60)

  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`
}

// Convert HH:MM format to decimal hours
export function hhmmToDecimal(hhmm: string): number {
  if (!hhmm || hhmm === "00:00") return 0

  const [hours, minutes] = hhmm.split(":").map(Number)
  return hours + minutes / 60
}

// Parse user input (either HH:MM or HH.DD) to HH:MM format
export function parseTimeInput(input: string): string {
  if (!input) return "00:00"

  // Check if input is in decimal format (contains a period)
  if (input.includes(".")) {
    const decimal = Number.parseFloat(input)
    if (isNaN(decimal) || decimal < 0 || decimal > 16) return "00:00"
    return decimalToHHMM(decimal)
  }

  // Check if input is in HH:MM format
  if (input.includes(":")) {
    const [hours, minutes] = input.split(":").map(Number)
    if (
      isNaN(hours) ||
      isNaN(minutes) ||
      hours < 0 ||
      hours > 16 ||
      minutes < 0 ||
      minutes > 59 ||
      (hours === 16 && minutes > 0)
    ) {
      return "00:00"
    }

    // Round to nearest 15 minutes
    const totalMinutes = hours * 60 + minutes
    const roundedMinutes = Math.round(totalMinutes / 15) * 15
    const roundedHours = Math.floor(roundedMinutes / 60)
    const remainingMinutes = roundedMinutes % 60

    return `${roundedHours.toString().padStart(2, "0")}:${remainingMinutes.toString().padStart(2, "0")}`
  }

  // If input is just a number, treat as hours
  const hours = Number.parseInt(input)
  if (isNaN(hours) || hours < 0 || hours > 16) return "00:00"
  return `${hours.toString().padStart(2, "0")}:00`
}

// Get the start and end dates of a week given a date within that week
export function getWeekRange(date: Date): { start: Date; end: Date } {
  // Create a new date object to avoid modifying the original
  const d = new Date(date.getTime())

  // Get the day of the week (0 = Sunday, 1 = Monday, etc.)
  const day = d.getDay()

  // Calculate the difference to Monday (first day of the week)
  // If day is 0 (Sunday), we need to go back 6 days to get to Monday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1)

  // Create start date (Monday)
  const start = new Date(d.setDate(diff))
  start.setHours(0, 0, 0, 0)

  // Create end date (Sunday)
  const end = new Date(start.getTime())
  end.setDate(start.getDate() + 6)
  end.setHours(23, 59, 59, 999)

  return { start, end }
}

// Format date as YYYY-MM-DD with consistent timezone handling
export function formatDate(date: Date): string {
  // Create a new date to avoid modifying the original
  const d = new Date(date.getTime())

  // Get year, month, and day components
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, "0")
  const day = String(d.getDate()).padStart(2, "0")

  // Format as YYYY-MM-DD
  return `${year}-${month}-${day}`
}

// Add a helper function to normalize dates for comparison
export function normalizeDateString(dateStr: string): string {
  // If it's already in YYYY-MM-DD format, return it
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr
  }

  // Otherwise, parse and reformat
  const date = new Date(dateStr)
  return formatDate(date)
}

// Get array of dates for a week with consistent handling
export function getWeekDates(date: Date): Date[] {
  // Get the week range (Monday to Sunday)
  const { start } = getWeekRange(date)

  // Create an array to hold the dates
  const dates: Date[] = []

  // Add each day of the week
  for (let i = 0; i < 7; i++) {
    // Create a new date object for each day to avoid reference issues
    const day = new Date(start.getTime())
    day.setDate(start.getDate() + i)

    // Ensure the day is properly set
    const actualDay = day.getDay()
    const expectedDay = i === 6 ? 0 : i + 1 // Convert 0-6 to 1-7 (Monday-Sunday), with Sunday as 0

    if (actualDay !== expectedDay) {
      console.warn(`Day mismatch for index ${i}: expected day ${expectedDay}, got ${actualDay}`)
      // Fix the day if needed
      const correctedDay = new Date(start.getTime())
      correctedDay.setDate(start.getDate() + i)
      dates.push(correctedDay)
    } else {
      dates.push(day)
    }
  }

  return dates
}

// Format date as "Mon DD" with day name
export function formatDayMonth(date: Date): string {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]
  const day = days[date.getDay()]
  const dayOfMonth = date.getDate()

  return `${day} ${dayOfMonth}`
}

// Debug function to log date information
export function debugDateInfo(date: Date | string, label = "Date"): void {
  const d = typeof date === "string" ? new Date(date) : new Date(date.getTime())

  console.log(`${label}:`, {
    original: typeof date === "string" ? date : date.toISOString(),
    parsed: d.toISOString(),
    formatted: formatDate(d),
    dayOfWeek: d.getDay(), // 0 = Sunday, 1 = Monday, etc.
    dayName: ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][d.getDay()],
    utcString: d.toUTCString(),
    localString: d.toString(),
  })
}
