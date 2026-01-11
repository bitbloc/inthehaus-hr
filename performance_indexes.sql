-- PERFORMANCE OPTIMIZATION & MONITORING
-- Run this script in the Supabase SQL Editor.

-- ==============================================================================
-- 1. Enable Monitoring Extension
-- ==============================================================================
-- pg_stat_statements tracks execution statistics of all SQL statements executed.
-- It helps identify slow queries.
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ==============================================================================
-- 2. Add Missing Indexes to Foreign Keys (Optimize Joins)
-- ==============================================================================

-- A. Habits System (Often filtered by Lifestyle)
CREATE INDEX IF NOT EXISTS idx_habits_lifestyle_id ON public.habits(lifestyle_id);

-- B. Vault / Gamification (Often filtered by User)
-- Note: 'vault_wishlist' and 'vault_transactions' might not have been created yet depending on previous runs,
-- so we wrap them in checks or just attempt creation if table exists.
-- Assumption: Tables exist based on previous context.
CREATE INDEX IF NOT EXISTS idx_vault_wishlist_user_id ON public.vault_wishlist(user_id);
CREATE INDEX IF NOT EXISTS idx_vault_transactions_user_id ON public.vault_transactions(user_id);

-- C. Shift Management (The "Work Tables" mentioned)
-- Optimizing Swap Requests lookups
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_old_shift_id ON public.shift_swap_requests(old_shift_id);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_target_peer_id ON public.shift_swap_requests(target_peer_id);

-- Optimizing Roster Overrides (Heavy usage in "getEffectiveDailyRoster")
-- We frequently join overrides with employees and shifts.
CREATE INDEX IF NOT EXISTS idx_roster_overrides_shift_id ON public.roster_overrides(shift_id);

-- Composite index for Roster Generation: 
-- When fetching the roster for a day, we check employee_id + date.
-- Including 'is_off' and 'shift_id' in the index (covering index) can avoid table lookups for simple status checks.
CREATE INDEX IF NOT EXISTS idx_roster_overrides_agg_check ON public.roster_overrides(employee_id, date) INCLUDE (is_off, shift_id);


-- ==============================================================================
-- 3. Monitoring Queries (For your "PgHero" dashboard style view)
-- ==============================================================================

/* 
-- Q1: Find the Top 10 Slowest Queries by Mean Execution Time
SELECT 
    round((mean_exec_time::numeric), 2) as mean_ms,
    calls,
    query
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Q2: Find Queries that eat the most CPU (Total Time)
SELECT 
    round((total_exec_time::numeric), 2) as total_ms,
    calls,
    query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- Q3: Check Cache Hit Rate (Should be > 99%)
SELECT 
    sum(heap_blks_read) as heap_read,
    sum(heap_blks_hit)  as heap_hit,
    sum(heap_blks_hit) / (sum(heap_blks_hit) + sum(heap_blks_read)) as ratio
FROM pg_statio_user_tables;
*/

-- Done!
