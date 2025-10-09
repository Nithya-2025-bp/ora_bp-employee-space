export interface TimeEntry {
  id: string
  userId: string // Add user ID
  projectId: string
  taskId: string
  subtaskId: string
  date: string // YYYY-MM-DD format
  hours: string // HH:MM format
  notes?: string
  createdAt: Date
  updatedAt: Date
}

export interface TimesheetRow {
  id: string
  userId?: string // Add optional user ID
  projectId: string
  taskId: string
  subtaskId: string
  projectTitle: string
  taskTitle: string
  subtaskTitle: string
}

export interface TemplateTimeEntry {
  subtaskId: string
  dayOfWeek: number // 0-6 (Sunday-Saturday)
  hours: string
}

export interface TimesheetTemplate {
  id: string
  name: string
  rows: TimesheetRow[]
  timeEntries: TemplateTimeEntry[] // Add time entries to the template
  createdAt: Date
}

export interface TimesheetStore {
  entries: TimeEntry[]
  timesheetRows: TimesheetRow[]
  currentUserId: string | null // Add current user ID
  templates: TimesheetTemplate[] // Add templates

  // Set current user
  setCurrentUser: (userId: string) => void

  // Entry management
  addEntry: (entry: Omit<TimeEntry, "id" | "userId" | "createdAt" | "updatedAt">) => void
  updateEntry: (id: string, hours: string, notes?: string) => void
  deleteEntry: (id: string) => void
  getEntriesForWeek: (startDate: Date) => TimeEntry[]
  getEntryForDay: (subtaskId: string, date: string) => TimeEntry | undefined

  // Row management
  addTimesheetRow: (row: Omit<TimesheetRow, "id" | "userId">) => void
  removeTimesheetRow: (id: string) => void
  getTimesheetRows: () => TimesheetRow[]

  // Template management
  addTemplate: (name: string, rows: TimesheetRow[], timeEntries: TimeEntry[]) => void
  deleteTemplate: (id: string) => void
  getTemplates: () => TimesheetTemplate[]
}
