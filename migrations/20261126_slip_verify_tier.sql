-- Record how each slip was verified, for the monthly slip report.
-- NOT APPLIED YET. Run this single file in the Supabase SQL editor after the
-- owner approves. Never `supabase db push`.
--
-- Values written by app/api/webhook/handlers/slipHandler.js:
--   BANK_VERIFIED                 EasySlip confirmed the transfer with the bank
--   FORENSIC_VERIFIED_BANK_DELAY  bank had not synced yet; detailed image check passed
--   VISION_VERIFIED               read from the image only (no EasySlip result)
-- Slips saved before this column exists stay NULL (shown as "ไม่ทราบ").
--
-- Safe to re-run. Rollback: alter table public.slip_transactions drop column verify_tier;

alter table public.slip_transactions
  add column if not exists verify_tier text;

comment on column public.slip_transactions.verify_tier is
  'BANK_VERIFIED | FORENSIC_VERIFIED_BANK_DELAY | VISION_VERIFIED; null = before tracking';
