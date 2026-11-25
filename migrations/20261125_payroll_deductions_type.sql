-- ==============================================================================
-- In The Haus HR: adjustment type for payroll_deductions
-- Date: 2026-11-25
-- The payroll page saves a type (deduction | advance | bonus) but the column was
-- missing, so every save failed. Additive and safe: existing rows become 'deduction'.
-- Apply with a single query (never `supabase db push`).
-- ==============================================================================

ALTER TABLE public.payroll_deductions
    ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'deduction'
    CHECK (type IN ('deduction', 'advance', 'bonus'));
