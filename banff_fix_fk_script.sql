-- Fix: Remove Foreign Key Constraints for Single User Mode
-- Run this in Supabase SQL Editor to fix the "Key (user_id)=... is not present in table users" error.

-- 1. Drop Foreign Key Constraints linking to auth.users
ALTER TABLE public.habits DROP CONSTRAINT IF EXISTS habits_user_id_fkey;
ALTER TABLE public.habit_logs DROP CONSTRAINT IF EXISTS habit_logs_user_id_fkey;
ALTER TABLE public.daily_metrics DROP CONSTRAINT IF EXISTS daily_metrics_user_id_fkey;
ALTER TABLE public.lifestyles DROP CONSTRAINT IF EXISTS lifestyles_user_id_fkey;

-- 2. Disable Row Level Security (RLS) to ensure no policy blocks access
ALTER TABLE public.habits DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.habit_logs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_metrics DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.lifestyles DISABLE ROW LEVEL SECURITY;

-- 3. (Optional) Manual cleanup if needed, but the above allows inserting any user_id.
