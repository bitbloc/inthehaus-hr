-- Fix RLS Policies for Vault Transactions
ALTER TABLE vault_transactions ENABLE ROW LEVEL SECURITY;

-- Drop existing policies to ensure clean slate
DROP POLICY IF EXISTS "Users can manage their own transactions" ON vault_transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON vault_transactions;

-- Create comprehensive policy for ALL operations (SELECT, INSERT, UPDATE, DELETE)
CREATE POLICY "Users can manage their own transactions"
ON vault_transactions
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Fix RLS Policies for Vault Wishlist (Preventative)
ALTER TABLE vault_wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own wishlist" ON vault_wishlist;

-- Create comprehensive policy for ALL operations
CREATE POLICY "Users can manage their own wishlist"
ON vault_wishlist
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);
