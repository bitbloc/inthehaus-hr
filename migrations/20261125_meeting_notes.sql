-- ==============================================================================
-- In The Haus HR: Meeting Notes (บันทึกการประชุม) — PDF uploads
-- Date: 2026-11-25
-- Description:
--   1. Table public.meeting_notes (metadata of each uploaded meeting-notes PDF)
--   2. Private storage bucket 'meeting-notes' (PDF only, max 20 MB)
--   3. RLS: admins (Supabase Auth 'authenticated') can write; staff read through
--      /api/meetings which checks the LINE user is an active employee and returns
--      short-lived signed URLs.
-- ==============================================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.meeting_notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    meeting_date DATE NOT NULL DEFAULT CURRENT_DATE,
    summary TEXT,
    file_path TEXT NOT NULL,          -- object path inside the 'meeting-notes' bucket
    file_name TEXT,                   -- original file name shown to staff
    file_size BIGINT,
    created_by TEXT,                  -- admin email
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_meeting_notes_date ON public.meeting_notes(meeting_date DESC, created_at DESC);

ALTER TABLE public.meeting_notes ENABLE ROW LEVEL SECURITY;
GRANT SELECT ON TABLE public.meeting_notes TO anon;
GRANT ALL ON TABLE public.meeting_notes TO authenticated, service_role;

DROP POLICY IF EXISTS "Read meeting_notes" ON public.meeting_notes;
CREATE POLICY "Read meeting_notes"
    ON public.meeting_notes FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Admins insert meeting_notes" ON public.meeting_notes;
CREATE POLICY "Admins insert meeting_notes"
    ON public.meeting_notes FOR INSERT
    TO authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Admins update meeting_notes" ON public.meeting_notes;
CREATE POLICY "Admins update meeting_notes"
    ON public.meeting_notes FOR UPDATE
    TO authenticated
    USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Admins delete meeting_notes" ON public.meeting_notes;
CREATE POLICY "Admins delete meeting_notes"
    ON public.meeting_notes FOR DELETE
    TO authenticated
    USING (true);

-- 2. Private storage bucket (PDF only, 20 MB)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('meeting-notes', 'meeting-notes', false, 20971520, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = 20971520,
    allowed_mime_types = ARRAY['application/pdf'];

-- 3. Storage policies
-- SELECT is needed so the API route (anon key) can create signed URLs.
DROP POLICY IF EXISTS "Read meeting-notes files" ON storage.objects;
CREATE POLICY "Read meeting-notes files" ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'meeting-notes');

DROP POLICY IF EXISTS "Admins upload meeting-notes files" ON storage.objects;
CREATE POLICY "Admins upload meeting-notes files" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'meeting-notes');

DROP POLICY IF EXISTS "Admins update meeting-notes files" ON storage.objects;
CREATE POLICY "Admins update meeting-notes files" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'meeting-notes') WITH CHECK (bucket_id = 'meeting-notes');

DROP POLICY IF EXISTS "Admins delete meeting-notes files" ON storage.objects;
CREATE POLICY "Admins delete meeting-notes files" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'meeting-notes');
