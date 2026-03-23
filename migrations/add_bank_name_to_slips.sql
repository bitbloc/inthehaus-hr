-- Migration to add bank_name to slip_transactions
ALTER TABLE IF EXISTS slip_transactions 
ADD COLUMN IF NOT EXISTS bank_name TEXT;

-- Update existing records if possible (optional, but good for base)
-- COMMENT: Existing records will have NULL bank_name.
