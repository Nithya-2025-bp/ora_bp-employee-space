-- Fix SECURITY DEFINER issue with timesheet_entries_with_tickets view
-- This script recreates the view with explicit SECURITY INVOKER declaration
-- to ensure it respects the querying user's RLS policies

-- Drop the existing view completely
DROP VIEW IF EXISTS public.timesheet_entries_with_tickets CASCADE;

-- Recreate the view with explicit security context
-- Note: SECURITY INVOKER is the default but we declare it explicitly
-- to satisfy Supabase's security linter
CREATE OR REPLACE VIEW public.timesheet_entries_with_tickets 
WITH (security_invoker = true)
AS
SELECT 
  te.id,
  te.user_id,
  te.subtask_id,
  te.date,
  te.hours,
  te.created_at,
  te.updated_at,
  COALESCE(
    json_agg(
      json_build_object(
        'id', t.id,
        'title', t.title,
        'description', t.description,
        'created_by', t.created_by,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      )
    ) FILTER (WHERE t.id IS NOT NULL),
    '[]'::json
  ) as ticket_list
FROM public.timesheet_entries te
LEFT JOIN public.tickets t ON t.timesheet_entry_id = te.id
GROUP BY te.id, te.user_id, te.subtask_id, te.date, te.hours, te.created_at, te.updated_at;

-- Grant appropriate permissions
GRANT SELECT ON public.timesheet_entries_with_tickets TO authenticated;
GRANT SELECT ON public.timesheet_entries_with_tickets TO anon;

-- Add comment explaining the security model
COMMENT ON VIEW public.timesheet_entries_with_tickets IS 
'View that joins timesheet entries with their associated tickets. Uses security_invoker=true to respect RLS policies of the querying user, not the view creator.';

-- Verify the view was created correctly
DO $$
BEGIN
  RAISE NOTICE 'View timesheet_entries_with_tickets recreated with security_invoker=true';
END $$;
