export interface TOILEntry {
  id: string
  userId: string
  date: string
  requestedHours: string // Format: "HH:MM"
  usedHours: string // Format: "HH:MM"
  status: "pending" | "approved" | "rejected"
  comments?: string
  adminComments?: string
  createdAt: Date
  updatedAt: Date
  weekStartDate: string // To group entries by week
}

export interface TOILBalance {
  userId: string
  totalHours: string // Format: "HH:MM"
  updatedAt: Date
}

export interface TOILSettings {
  userId: string
  maxCapacity: string // Default: "40:00"
  maxStreakHours: string // Default: "16:00"
  maxStreakDays: number // Default: 2
}

export interface TOILSubmission {
  id: string
  userId: string
  weekStartDate: string
  weekEndDate: string
  status: "pending" | "approved" | "rejected"
  submittedAt: Date
  approvedBy?: string
  approvedAt?: Date
  comments?: string
  entries: TOILEntry[]
}
