-- Drop the foreign key constraint that blocks unrecognized LINE users from saving slips
ALTER TABLE public.slip_transactions DROP CONSTRAINT IF EXISTS slip_transactions_user_id_fkey;
