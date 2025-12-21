-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Enable read access for all users" ON announcements;
DROP POLICY IF EXISTS "Enable insert/update for authenticated users only" ON announcements;
DROP POLICY IF EXISTS "Allow all access" ON announcements;

-- Grant permissions explicitly (Fixes 401/403 often caused by missing table grants)
GRANT ALL ON TABLE announcements TO anon;
GRANT ALL ON TABLE announcements TO authenticated;
GRANT ALL ON TABLE announcements TO service_role;

-- Grant sequence permissions (Fixes ID generation errors)
GRANT ALL ON SEQUENCE announcements_id_seq TO anon;
GRANT ALL ON SEQUENCE announcements_id_seq TO authenticated;
GRANT ALL ON SEQUENCE announcements_id_seq TO service_role;

-- Re-enable RLS
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;

-- Create a permissive policy for testing (Allows everyone to Read/Write)
-- CAUTION: If your Admin page is public, anyone can post. 
-- Since you are getting 401s, this ensures it works for now. 
CREATE POLICY "Allow all access" ON announcements FOR ALL USING (true);
