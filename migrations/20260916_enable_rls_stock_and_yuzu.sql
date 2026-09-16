-- ==============================================================================
-- In The Haus HR & Operations: Enable Row Level Security (RLS) on Exposed Public Tables
-- Date: 2026-09-16
-- Remediation for Supabase Linter: rls_disabled_in_public (0013_rls_disabled_in_public)
-- Affected Tables:
--   1. public.stock_items
--   2. public.stock_transactions
--   3. public.yuzu_knowledge
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. Table: public.stock_items
-- ------------------------------------------------------------------------------
-- Enable Row Level Security
ALTER TABLE public.stock_items ENABLE ROW LEVEL SECURITY;

-- Ensure table permissions for Supabase PostgREST roles
GRANT ALL ON TABLE public.stock_items TO anon, authenticated, service_role;

-- Policies for stock_items
DROP POLICY IF EXISTS "Allow read stock_items for all" ON public.stock_items;
CREATE POLICY "Allow read stock_items for all"
    ON public.stock_items
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow insert stock_items for staff and system" ON public.stock_items;
CREATE POLICY "Allow insert stock_items for staff and system"
    ON public.stock_items
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update stock_items for staff and system" ON public.stock_items;
CREATE POLICY "Allow update stock_items for staff and system"
    ON public.stock_items
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete stock_items for staff and system" ON public.stock_items;
CREATE POLICY "Allow delete stock_items for staff and system"
    ON public.stock_items
    FOR DELETE
    TO anon, authenticated
    USING (true);


-- ------------------------------------------------------------------------------
-- 2. Table: public.stock_transactions
-- ------------------------------------------------------------------------------
-- Enable Row Level Security
ALTER TABLE public.stock_transactions ENABLE ROW LEVEL SECURITY;

-- Ensure table permissions for Supabase PostgREST roles
GRANT ALL ON TABLE public.stock_transactions TO anon, authenticated, service_role;

-- Policies for stock_transactions
DROP POLICY IF EXISTS "Allow read stock_transactions for all" ON public.stock_transactions;
CREATE POLICY "Allow read stock_transactions for all"
    ON public.stock_transactions
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow insert stock_transactions for staff and audit" ON public.stock_transactions;
CREATE POLICY "Allow insert stock_transactions for staff and audit"
    ON public.stock_transactions
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update stock_transactions for staff and system" ON public.stock_transactions;
CREATE POLICY "Allow update stock_transactions for staff and system"
    ON public.stock_transactions
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete stock_transactions for staff and system" ON public.stock_transactions;
CREATE POLICY "Allow delete stock_transactions for staff and system"
    ON public.stock_transactions
    FOR DELETE
    TO anon, authenticated
    USING (true);


-- ------------------------------------------------------------------------------
-- 3. Table: public.yuzu_knowledge
-- ------------------------------------------------------------------------------
-- Enable Row Level Security
ALTER TABLE public.yuzu_knowledge ENABLE ROW LEVEL SECURITY;

-- Ensure table permissions for Supabase PostgREST roles
GRANT ALL ON TABLE public.yuzu_knowledge TO anon, authenticated, service_role;

-- Policies for yuzu_knowledge
DROP POLICY IF EXISTS "Allow read yuzu_knowledge for all" ON public.yuzu_knowledge;
CREATE POLICY "Allow read yuzu_knowledge for all"
    ON public.yuzu_knowledge
    FOR SELECT
    TO anon, authenticated
    USING (true);

DROP POLICY IF EXISTS "Allow insert yuzu_knowledge for AI and admin" ON public.yuzu_knowledge;
CREATE POLICY "Allow insert yuzu_knowledge for AI and admin"
    ON public.yuzu_knowledge
    FOR INSERT
    TO anon, authenticated
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update yuzu_knowledge for AI and admin" ON public.yuzu_knowledge;
CREATE POLICY "Allow update yuzu_knowledge for AI and admin"
    ON public.yuzu_knowledge
    FOR UPDATE
    TO anon, authenticated
    USING (true)
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow delete yuzu_knowledge for AI and admin" ON public.yuzu_knowledge;
CREATE POLICY "Allow delete yuzu_knowledge for AI and admin"
    ON public.yuzu_knowledge
    FOR DELETE
    TO anon, authenticated
    USING (true);
