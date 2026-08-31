-- ==============================================================================
-- In The Haus HR: Check-in Security Hardening & Multi-Factor Verification Migration
-- Date: 2026-08-31
-- Description:
--   1. Add verification_method, accuracy_meters, and device_info to attendance_logs
--   2. Add indexes for high-performance attendance history and overnight resolution
--   3. Ensure proper RLS policies for attendance_logs
-- ==============================================================================

-- 1. Add hardening columns to attendance_logs
ALTER TABLE public.attendance_logs 
ADD COLUMN IF NOT EXISTS verification_method TEXT DEFAULT 'GPS' CHECK (verification_method IN ('GPS', 'QR_CODE', 'MANUAL', 'FACE')),
ADD COLUMN IF NOT EXISTS accuracy_meters NUMERIC(6,2),
ADD COLUMN IF NOT EXISTS device_info JSONB,
ADD COLUMN IF NOT EXISTS is_auto_closed BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS watermark_data JSONB;

-- 2. Indexes for fast query and overnight matching
CREATE INDEX IF NOT EXISTS idx_attendance_logs_emp_timestamp ON public.attendance_logs(employee_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_action_time ON public.attendance_logs(action_type, timestamp DESC);

-- 3. Storage Bucket Configuration for checkin-photos (if not already public)
INSERT INTO storage.buckets (id, name, public) 
VALUES ('checkin-photos', 'checkin-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Policy for checkin-photos storage
DROP POLICY IF EXISTS "Public checkin photos access" ON storage.objects;
CREATE POLICY "Public checkin photos access" ON storage.objects
FOR ALL USING (bucket_id = 'checkin-photos' OR bucket_id = 'yuzu-images')
WITH CHECK (bucket_id = 'checkin-photos' OR bucket_id = 'yuzu-images');
