-- In The Haus HR: Migration for Espresso Logs & Staff Tasks Enhancements

-- 1. Create espresso_logs table for Grind Calibration History Tracking
CREATE TABLE IF NOT EXISTS public.espresso_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    group_id TEXT,
    user_id TEXT,
    operator_name TEXT,
    raw_text TEXT NOT NULL,
    dose NUMERIC(5,2),
    dose_status TEXT,
    yield NUMERIC(5,2),
    yield_status TEXT,
    first_drop NUMERIC(5,2),
    first_drop_status TEXT,
    total_time NUMERIC(5,2),
    total_time_status TEXT,
    grind_adjustment TEXT,
    is_grind_correct BOOLEAN,
    taste_profile TEXT,
    recommendation TEXT,
    weather_temp NUMERIC(4,1),
    weather_humidity NUMERIC(4,1),
    weather_condition TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

ALTER TABLE public.espresso_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all access to espresso_logs" ON public.espresso_logs;
CREATE POLICY "Allow all access to espresso_logs" 
ON public.espresso_logs 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- 2. Enhance staff_tasks table for Auto-Task Ingestion from Voice Notes
ALTER TABLE public.staff_tasks 
ADD COLUMN IF NOT EXISTS assigned_to TEXT,
ADD COLUMN IF NOT EXISTS source_user_id TEXT,
ADD COLUMN IF NOT EXISTS source_group_id TEXT;
