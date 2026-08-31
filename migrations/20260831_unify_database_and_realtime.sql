-- ==============================================================================
-- In The Haus HR & Operations: Unified Database & Realtime Architecture Migration
-- Date: 2026-08-31
-- Description:
--   1. Create daily_checklist_logs table (migrating away from external Google Sheets)
--   2. Enable REPLICA IDENTITY FULL on core tables for reliable Realtime payloads
--   3. Add core tables to supabase_realtime publication
--   4. Add performance indexes for Roster Transactions, Attendance, and Requests
-- ==============================================================================

-- 1. Daily Checklist Logs Table
CREATE TABLE IF NOT EXISTS public.daily_checklist_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    date DATE NOT NULL DEFAULT CURRENT_DATE,
    shift_type TEXT NOT NULL CHECK (shift_type IN ('OPENING', 'CLOSING', 'MIDDAY', 'DAILY')),
    employee_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL,
    employee_name TEXT NOT NULL,
    tasks JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of { id, text, checked, category }
    cash_amount NUMERIC(10, 2),
    photos TEXT[] DEFAULT ARRAY[]::TEXT[],
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS on daily_checklist_logs
ALTER TABLE public.daily_checklist_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all read access for checklist logs" ON public.daily_checklist_logs;
CREATE POLICY "Allow all read access for checklist logs"
    ON public.daily_checklist_logs
    FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Allow insert and update for checklist logs" ON public.daily_checklist_logs;
CREATE POLICY "Allow insert and update for checklist logs"
    ON public.daily_checklist_logs
    FOR ALL
    USING (true)
    WITH CHECK (true);

-- Index for fast query by date and shift_type
CREATE INDEX IF NOT EXISTS idx_checklist_logs_date ON public.daily_checklist_logs(date);
CREATE INDEX IF NOT EXISTS idx_checklist_logs_employee ON public.daily_checklist_logs(employee_id, date);

-- 2. Indexes for Roster Transactions & Performance
CREATE INDEX IF NOT EXISTS idx_roster_trans_date_status ON public.roster_transactions(date, status);
CREATE INDEX IF NOT EXISTS idx_roster_trans_emp_date_status ON public.roster_transactions(employee_id, date, status);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp_time ON public.attendance_logs(employee_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_leave_requests_emp_date ON public.leave_requests(employee_id, leave_date);
CREATE INDEX IF NOT EXISTS idx_leave_requests_date_status ON public.leave_requests(leave_date, status);
CREATE INDEX IF NOT EXISTS idx_shift_swap_date_status ON public.shift_swap_requests(target_date, status);

-- 3. Set REPLICA IDENTITY FULL for Realtime DELETE & UPDATE payload integrity
ALTER TABLE public.roster_transactions REPLICA IDENTITY FULL;
ALTER TABLE public.attendance_logs REPLICA IDENTITY FULL;
ALTER TABLE public.leave_requests REPLICA IDENTITY FULL;
ALTER TABLE public.shift_swap_requests REPLICA IDENTITY FULL;
ALTER TABLE public.announcements REPLICA IDENTITY FULL;
ALTER TABLE public.daily_checklist_logs REPLICA IDENTITY FULL;

-- 4. Enable Supabase Realtime for Core Tables
-- Note: In Supabase, executing these adds tables to the realtime publication.
DO $$
BEGIN
    -- Check and add roster_transactions
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'roster_transactions'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.roster_transactions;
    END IF;

    -- Check and add attendance_logs
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'attendance_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.attendance_logs;
    END IF;

    -- Check and add leave_requests
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'leave_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.leave_requests;
    END IF;

    -- Check and add shift_swap_requests
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'shift_swap_requests'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.shift_swap_requests;
    END IF;

    -- Check and add announcements
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'announcements'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.announcements;
    END IF;

    -- Check and add daily_checklist_logs
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'daily_checklist_logs'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE public.daily_checklist_logs;
    END IF;
END $$;
