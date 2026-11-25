-- =============================================================================
-- DRAFT — NOT APPLIED. Run manually in the Supabase SQL editor only after the
-- owner approves. Do NOT run `supabase db push` (it would apply every file).
--
-- Goal: anon (public key) may READ roster_transactions (staff pages /checkin,
-- /shifts and realtime need it) but may no longer INSERT/UPDATE/DELETE.
-- Writes come from: signed-in admins (/admin UI and /api/roster/* routes that
-- now forward the admin's session) and the LINE webhook via the service-role key.
--
-- PREREQUISITES (in this order, or LINE leave/swap approvals and the
-- "auto-generate" chat command will fail to write the roster):
--   1. Merge + deploy the PR that adds lib/supabaseServer.js.
--   2. In Vercel → Settings → Environment Variables add SUPABASE_SERVICE_ROLE_KEY
--      (Supabase → Project Settings → API → service_role), redeploy.
--   3. Confirm a LINE leave/swap approval still updates the roster.
--
-- STEP 0 (read-only) — look at what is live right now:
--   SELECT relrowsecurity FROM pg_class WHERE oid = 'public.roster_transactions'::regclass;
--   SELECT policyname, cmd, roles, qual, with_check
--     FROM pg_policies WHERE schemaname = 'public' AND tablename = 'roster_transactions';
--   SELECT grantee, privilege_type FROM information_schema.role_table_grants
--     WHERE table_schema = 'public' AND table_name = 'roster_transactions';
--
-- ROLLBACK (if anything breaks): re-create a permissive write policy:
--   CREATE POLICY "TEMP anon write roster_transactions" ON public.roster_transactions
--     FOR ALL TO anon USING (true) WITH CHECK (true);
--   GRANT INSERT, UPDATE, DELETE ON public.roster_transactions TO anon;
-- =============================================================================

BEGIN;

ALTER TABLE public.roster_transactions ENABLE ROW LEVEL SECURITY;

-- Drop every existing policy on the table (live names may differ from the repo files).
DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'roster_transactions'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.roster_transactions', pol.policyname);
  END LOOP;
END $$;

-- Read: everyone (staff pages use the anon key).
CREATE POLICY "roster_transactions read for all"
  ON public.roster_transactions FOR SELECT
  TO anon, authenticated
  USING (true);

-- Write: signed-in users only (admin UI / admin API routes).
-- service_role bypasses RLS, so the LINE webhook keeps working once the key is set.
CREATE POLICY "roster_transactions write for authenticated"
  ON public.roster_transactions FOR ALL
  TO authenticated
  USING (true) WITH CHECK (true);

-- Belt and braces: remove table-level write privileges from anon.
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.roster_transactions FROM anon;
GRANT SELECT ON public.roster_transactions TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roster_transactions TO authenticated;
GRANT ALL ON public.roster_transactions TO service_role;

COMMIT;

-- Verify afterwards (read-only):
--   SELECT policyname, cmd, roles FROM pg_policies
--     WHERE schemaname = 'public' AND tablename = 'roster_transactions';
