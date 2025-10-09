# BP Employee Space - Project Map

## Core Structure
- `app/` - Next.js app router pages and API routes
- `components/` - Reusable UI components
- `lib/` - Utility functions, types, and business logic

## Key Features
1. **Authentication** - `lib/auth.ts`
2. **Projects Management** - `lib/actions/project-actions.ts`
3. **Tasks Management** - `components/tasks/` and `lib/task-utils.ts`
4. **Timesheet System** - `components/timesheets/` and `lib/actions/timesheet-actions.ts`
5. **Employee Management** - `components/employee-accounts/` and `lib/actions/employee-actions.ts`

## Database Access
- Supabase integration - `lib/supabase/`
- Database utilities - `lib/db/`

## Main Pages
- Dashboard - `app/dashboard/page.tsx`
- Timesheets - `app/dashboard/timesheets/page.tsx`
- Projects - `app/dashboard/projects/page.tsx`
- Tasks - `app/dashboard/tasks/page.tsx`
- Employee Accounts - `app/dashboard/employee-accounts/page.tsx`
\`\`\`

Now, let's implement some improvements to make the codebase more manageable and performant:

### 1. First, let's implement code splitting for the timesheet page which is quite large:
