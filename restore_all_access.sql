-- RESTORE FULL ACCESS (Fix Vault & Dashboard)
-- Run this script in the Supabase SQL Editor.

-- Explainer:
-- The Vault balance relies on summing 'habit_logs' (Income). 
-- Because RLS hid 'habit_logs' from the application (which likely runs as 'anon'), 
-- the Income became 0, leaving only Expenses (negative balance).
-- This script opens up 'habits', 'habit_logs', and 'metrics' to 'anon' (Public) access,
-- restoring the calculation logic and the Dashboard charts.

-- ==============================================================================
-- 1. Habit System (Fix Vault Income + Charts)
-- ==============================================================================

-- Table: habit_logs
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.habit_logs;
DROP POLICY IF EXISTS "Users can view their own habit logs" ON public.habit_logs;
DROP POLICY IF EXISTS "Users can insert their own habit logs" ON public.habit_logs;
DROP POLICY IF EXISTS "Users can update their own habit logs" ON public.habit_logs;
DROP POLICY IF EXISTS "Users can delete their own habit logs" ON public.habit_logs;
-- Create comprehensive public policy
CREATE POLICY "Enable all access (restore public)" ON public.habit_logs FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: habits
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.habits;
DROP POLICY IF EXISTS "Users can view their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can insert their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can update their own habits" ON public.habits;
DROP POLICY IF EXISTS "Users can delete their own habits" ON public.habits;
CREATE POLICY "Enable all access (restore public)" ON public.habits FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: lifestyles
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.lifestyles;
DROP POLICY IF EXISTS "Users can view their own lifestyles" ON public.lifestyles;
DROP POLICY IF EXISTS "Users can insert their own lifestyles" ON public.lifestyles;
DROP POLICY IF EXISTS "Users can update their own lifestyles" ON public.lifestyles;
DROP POLICY IF EXISTS "Users can delete their own lifestyles" ON public.lifestyles;
CREATE POLICY "Enable all access (restore public)" ON public.lifestyles FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: daily_metrics
DROP POLICY IF EXISTS "Enable all access for authenticated users" ON public.daily_metrics;
DROP POLICY IF EXISTS "Users can view their own daily metrics" ON public.daily_metrics;
DROP POLICY IF EXISTS "Users can insert their own daily metrics" ON public.daily_metrics;
DROP POLICY IF EXISTS "Users can update their own daily metrics" ON public.daily_metrics;
CREATE POLICY "Enable all access (restore public)" ON public.daily_metrics FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- ==============================================================================
-- 2. Vault Tables (Ensure Access)
-- ==============================================================================

-- Table: vault_wishlist
ALTER TABLE public.vault_wishlist ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own wishlist" ON public.vault_wishlist;
CREATE POLICY "Enable all access (restore public)" ON public.vault_wishlist FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Table: vault_transactions
ALTER TABLE public.vault_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Users can manage their own transactions" ON public.vault_transactions;
CREATE POLICY "Enable all access (restore public)" ON public.vault_transactions FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);

-- Done!
