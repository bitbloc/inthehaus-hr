-- SECURITY FIXES REPORT 05 JAN 2026
-- Run this script in the Supabase SQL Editor.

-- ==============================================================================
-- 1. Enable RLS on tables that have policies but RLS was disabled
-- ==============================================================================

ALTER TABLE public.daily_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.habits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifestyles ENABLE ROW LEVEL SECURITY;

-- ==============================================================================
-- 2. Fix Security Definer Views
-- We allow these views to respect RLS by adding WITH (security_invoker = true)
-- ==============================================================================

-- Recreate view_monthly_summary with security_invoker
CREATE OR REPLACE VIEW public.view_monthly_summary 
WITH (security_invoker = true) 
AS
WITH habits AS (
    SELECT 
        habit_logs.user_id,
        date_trunc('month'::text, habit_logs.log_date) AS month,
        count(*) AS total_habits_done
    FROM public.habit_logs
    GROUP BY habit_logs.user_id, (date_trunc('month'::text, habit_logs.log_date))
), metrics AS (
    SELECT 
        daily_metrics.user_id,
        date_trunc('month'::text, daily_metrics.date) AS month,
        avg(daily_metrics.mood_score) AS avg_mood,
        avg(daily_metrics.energy_score) AS avg_energy
    FROM public.daily_metrics
    GROUP BY daily_metrics.user_id, (date_trunc('month'::text, daily_metrics.date))
)
SELECT 
    COALESCE(h.month, m.month) AS month,
    COALESCE(h.user_id, m.user_id) AS user_id,
    round((COALESCE(m.avg_mood, (0)::numeric))::numeric, 1) AS avg_mood,
    round((COALESCE(m.avg_energy, (0)::numeric))::numeric, 1) AS avg_energy,
    COALESCE(h.total_habits_done, (0)::bigint) AS total_habits_done
FROM (metrics m
    FULL JOIN habits h ON (((h.user_id = m.user_id) AND (h.month = m.month))));


-- Recreate view_lifestyle_balance with security_invoker
CREATE OR REPLACE VIEW public.view_lifestyle_balance 
WITH (security_invoker = true) 
AS
WITH max_xp AS (
    SELECT lifestyles.user_id,
        max(lifestyles.xp) AS max_val
    FROM public.lifestyles
    GROUP BY lifestyles.user_id
)
SELECT 
    l.id,
    l.user_id,
    l.name,
    l.color,
    l.icon,
    l.xp,
    CASE
        WHEN (COALESCE(m.max_val, 0) = 0) THEN 10
        ELSE (((l.xp)::double precision / (m.max_val)::double precision) * (100)::double precision)::integer
    END AS normalized_score
FROM (public.lifestyles l
    LEFT JOIN max_xp m ON ((l.user_id = m.user_id)));


-- ==============================================================================
-- 3. Enable RLS on Public Tables and Add Default Policies
-- These tables were public but had RLS disabled. We secure them but allow 
-- authenticated access to preserve functionality.
-- ==============================================================================

-- Table: attendance_logs
ALTER TABLE public.attendance_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.attendance_logs;
CREATE POLICY "Enable all access for authenticated users" ON public.attendance_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: shifts
ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.shifts;
CREATE POLICY "Enable all access for authenticated users" ON public.shifts FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: employee_schedules
ALTER TABLE public.employee_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.employee_schedules;
CREATE POLICY "Enable all access for authenticated users" ON public.employee_schedules FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: leave_requests
ALTER TABLE public.leave_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.leave_requests;
CREATE POLICY "Enable all access for authenticated users" ON public.leave_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: payroll_config
ALTER TABLE public.payroll_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.payroll_config;
CREATE POLICY "Enable all access for authenticated users" ON public.payroll_config FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Table: payroll_deductions
ALTER TABLE public.payroll_deductions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.payroll_deductions;
CREATE POLICY "Enable all access for authenticated users" ON public.payroll_deductions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Done!
