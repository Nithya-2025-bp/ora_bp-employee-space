"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"
import { v4 as uuidv4 } from "uuid"
import type { TimeEntry, TimesheetRow, TimesheetStore, TimesheetTemplate, TemplateTimeEntry } from "./timesheet-types"
import { formatDate } from "./time-utils"

export const useTimesheetStore = create<TimesheetStore>()(
  persist(
    (set, get) => ({
      entries: [],
      timesheetRows: [],
      currentUserId: null,
      templates: [],

      setCurrentUser: (userId) => {
        console.log("Setting current user ID in store:", userId)
        set({ currentUserId: userId })
      },

      addEntry: (entry) =>
        set((state) => {
          if (!state.currentUserId) {
            console.error("Cannot add entry: No current user set")
            return state
          }

          // Check if entry already exists for this user
          const existingEntryIndex = state.entries.findIndex(
            (e) => e.userId === state.currentUserId && e.subtaskId === entry.subtaskId && e.date === entry.date,
          )

          if (existingEntryIndex >= 0) {
            // Update existing entry
            const updatedEntries = [...state.entries]
            updatedEntries[existingEntryIndex] = {
              ...updatedEntries[existingEntryIndex],
              hours: entry.hours,
              notes: entry.notes,
              updatedAt: new Date(),
            }
            return { entries: updatedEntries }
          }

          // Add new entry
          const newEntry: TimeEntry = {
            id: uuidv4(),
            userId: state.currentUserId,
            ...entry,
            createdAt: new Date(),
            updatedAt: new Date(),
          }

          return { entries: [...state.entries, newEntry] }
        }),

      updateEntry: (id, hours, notes) =>
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id
              ? {
                  ...entry,
                  hours,
                  notes,
                  updatedAt: new Date(),
                }
              : entry,
          ),
        })),

      deleteEntry: (id) =>
        set((state) => ({
          entries: state.entries.filter((entry) => entry.id !== id),
        })),

      getEntriesForWeek: (startDate) => {
        const { entries, currentUserId } = get()
        if (!currentUserId) return []

        const endDate = new Date(startDate)
        endDate.setDate(startDate.getDate() + 6)

        const startDateStr = formatDate(startDate)
        const endDateStr = formatDate(endDate)

        return entries.filter(
          (entry) => entry.userId === currentUserId && entry.date >= startDateStr && entry.date <= endDateStr,
        )
      },

      getEntryForDay: (subtaskId, date) => {
        const { entries, currentUserId } = get()
        if (!currentUserId) return undefined

        return entries.find(
          (entry) => entry.userId === currentUserId && entry.subtaskId === subtaskId && entry.date === date,
        )
      },

      addTimesheetRow: (row) =>
        set((state) => {
          if (!state.currentUserId) {
            console.error("Cannot add timesheet row: No current user set")
            return state
          }

          // Check if row already exists for this user
          const exists = state.timesheetRows.some(
            (r) =>
              r.userId === state.currentUserId &&
              r.projectId === row.projectId &&
              r.taskId === row.taskId &&
              r.subtaskId === row.subtaskId,
          )

          if (exists) return state

          const newRow: TimesheetRow = {
            id: uuidv4(),
            userId: state.currentUserId,
            ...row,
          }

          return { timesheetRows: [...state.timesheetRows, newRow] }
        }),

      removeTimesheetRow: (id) =>
        set((state) => ({
          timesheetRows: state.timesheetRows.filter((row) => row.id !== id),
        })),

      getTimesheetRows: () => {
        const { timesheetRows, currentUserId } = get()
        if (!currentUserId) return []

        return timesheetRows.filter((row) => row.userId === currentUserId)
      },

      // Template management
      addTemplate: (name, rows, timeEntries) =>
        set((state) => {
          const userId = state.currentUserId
          if (!userId) {
            console.error("Cannot add template: No current user set")
            // Instead of just returning state, we'll throw an error that can be caught
            throw new Error("Cannot add template: No current user set")
          }

          // Log the time entries being created
          console.log("Creating template with time entries:", timeEntries)

          // Convert time entries to template format (storing day of week instead of specific dates)
          const templateTimeEntries: TemplateTimeEntry[] = timeEntries
            .filter((entry) => {
              // Only include entries for the subtasks in the rows
              return rows.some((row) => row.subtaskId === entry.subtaskId)
            })
            .map((entry) => {
              const date = new Date(entry.date)
              const dayOfWeek = date.getDay() // 0-6 (Sunday-Saturday)

              return {
                subtaskId: entry.subtaskId,
                dayOfWeek: dayOfWeek,
                hours: entry.hours,
              }
            })

          console.log("Final template time entries:", templateTimeEntries)

          const newTemplate: TimesheetTemplate = {
            id: uuidv4(),
            name,
            rows: rows.map((row) => ({
              ...row,
              userId,
            })),
            timeEntries: templateTimeEntries,
            createdAt: new Date(),
          }

          return { templates: [...state.templates, newTemplate] }
        }),

      deleteTemplate: (id) =>
        set((state) => ({
          templates: state.templates.filter((template) => template.id !== id),
        })),

      getTemplates: () => {
        const { templates, currentUserId } = get()
        if (!currentUserId) return []

        return templates.filter((template) => template.rows.some((row) => row.userId === currentUserId))
      },
    }),
    {
      name: "timesheet-storage",
    },
  ),
)
