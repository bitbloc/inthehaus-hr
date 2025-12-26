-- Drop existing policies to start fresh
DROP POLICY IF EXISTS "Enable read access for all users" ON announcements;
DROP POLICY IF EXISTS "Enable insert/update for authenticated users only" ON announcements;
DROP POLICY IF EXISTS "Allow all access" ON announcements;

-- Grant permissions explicitly
GRANT ALL ON TABLE announcements TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE announcements_id_seq TO anon, authenticated, service_role;

-- Re-enable RLS for announcements
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow all access" ON announcements FOR ALL USING (true);


-- ==========================================
-- FIX PERMISSIONS FOR EMPLOYEES (Staff Delete Issue)
-- ==========================================
-- Ensure policies are reset
DROP POLICY IF EXISTS "Allow all access" ON employees;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- Grant Table Permissions
GRANT ALL ON TABLE employees TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE employees_id_seq TO anon, authenticated, service_role;

-- Full Access Policy (for your internal tool usage)
CREATE POLICY "Allow all access" ON employees FOR ALL USING (true);


-- ==========================================
-- FIX PERMISSIONS FOR JOB APPLICATIONS
-- ==========================================
-- Ensure policies are reset
DROP POLICY IF EXISTS "Allow all access" ON job_applications;
ALTER TABLE job_applications ENABLE ROW LEVEL SECURITY;

-- Grant Table Permissions
GRANT ALL ON TABLE job_applications TO anon, authenticated, service_role;

-- NOTE: job_applications uses UUID primary key, so NO SEQUENCE grant is needed.

-- Full Access Policy
CREATE POLICY "Allow all access" ON job_applications FOR ALL USING (true);
