-- Fix mutable search_path warnings for database functions
-- This script dynamically finds and fixes all functions with mutable search_path

-- Using dynamic SQL to find and alter all versions of the function
DO $$
DECLARE
    func_record RECORD;
    alter_statement TEXT;
BEGIN
    -- Find all versions of get_tasks_with_hours_for_date function
    FOR func_record IN 
        SELECT 
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as arguments,
            n.nspname as schema_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname = 'get_tasks_with_hours_for_date'
        AND n.nspname = 'public'
    LOOP
        -- Build and execute ALTER FUNCTION statement
        alter_statement := format(
            'ALTER FUNCTION %I.%I(%s) SET search_path = public',
            func_record.schema_name,
            func_record.function_name,
            func_record.arguments
        );
        
        RAISE NOTICE 'Executing: %', alter_statement;
        EXECUTE alter_statement;
    END LOOP;
    
    -- Also fix other functions that might have mutable search_path
    FOR func_record IN 
        SELECT 
            p.proname as function_name,
            pg_get_function_identity_arguments(p.oid) as arguments,
            n.nspname as schema_name
        FROM pg_proc p
        JOIN pg_namespace n ON p.pronamespace = n.oid
        WHERE p.proname IN ('get_user_tickets', 'update_tickets_updated_at', 'get_current_user_email')
        AND n.nspname = 'public'
    LOOP
        alter_statement := format(
            'ALTER FUNCTION %I.%I(%s) SET search_path = public',
            func_record.schema_name,
            func_record.function_name,
            func_record.arguments
        );
        
        RAISE NOTICE 'Executing: %', alter_statement;
        EXECUTE alter_statement;
    END LOOP;
END $$;

-- Verify the changes
SELECT 
    p.proname as function_name,
    pg_get_function_identity_arguments(p.oid) as arguments,
    p.prosecdef as security_definer,
    p.proconfig as config_settings
FROM pg_proc p
JOIN pg_namespace n ON p.pronamespace = n.oid
WHERE p.proname IN ('get_tasks_with_hours_for_date', 'get_user_tickets', 'update_tickets_updated_at', 'get_current_user_email')
AND n.nspname = 'public';
