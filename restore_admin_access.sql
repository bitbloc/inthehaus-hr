-- RESTORE ADMIN ACCESS (Fix "Old Data Not Showing")
-- Run this script in the Supabase SQL Editor.

-- Explainer:
-- The Admin dashboard likely accesses data without a full user session (anon), or the Auth state isn't persisting.
-- Previously, these tables had RLS DISABLED, so they were public.
-- Enabling RLS with "authenticated only" policies blocked this access.
-- This script updates the policies to allow "anon" (Public) access again, but keeps RLS enabled.

-- ==============================================================================
-- 1. Update Policies to Allow Public (Eq. to previous state)
-- ==============================================================================

-- Table: attendance_logs
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.attendance_logs;
CREATE POLICY "Enable all access for all users (public)" ON public.attendance_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: shifts
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.shifts;
CREATE POLICY "Enable all access for all users (public)" ON public.shifts FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: employee_schedules
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.employee_schedules;
CREATE POLICY "Enable all access for all users (public)" ON public.employee_schedules FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: leave_requests
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.leave_requests;
CREATE POLICY "Enable all access for all users (public)" ON public.leave_requests FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: payroll_config
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.payroll_config;
CREATE POLICY "Enable all access for all users (public)" ON public.payroll_config FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: payroll_deductions
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.payroll_deductions;
CREATE POLICY "Enable all access for all users (public)" ON public.payroll_deductions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- 2. Ensure Employees is also accessible (Double Check)
-- ==============================================================================
-- Just in case fix_permissions.sql wasn't run or was overwritten.
DROP POLICY IF EXISTS "Allow all access" ON public.employees;
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.employees;

-- Re-apply full public access
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access (public)" ON public.employees FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
GRANT ALL ON TABLE public.employees TO anon, authenticated, service_role;

-- Done!
