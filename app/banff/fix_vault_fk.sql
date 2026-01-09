-- Remove Foreign Key Constraints to allow Dummy User ID
ALTER TABLE vault_transactions DROP CONSTRAINT IF EXISTS vault_transactions_user_id_fkey;
ALTER TABLE vault_wishlist DROP CONSTRAINT IF EXISTS vault_wishlist_user_id_fkey;

-- Verify RLS again (just in case)
ALTER TABLE vault_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE vault_wishlist ENABLE ROW LEVEL SECURITY;
