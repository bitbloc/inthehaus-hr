-- Fix RLS Policies for Vault Transactions (Allow SINGLE_USER_ID)
ALTER TABLE vault_transactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own transactions" ON vault_transactions;
DROP POLICY IF EXISTS "Users can insert their own transactions" ON vault_transactions;

CREATE POLICY "Users can manage their own transactions"
ON vault_transactions
FOR ALL
USING (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001' -- Allow the dev/fallback user
)
WITH CHECK (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001'
);

-- Fix RLS Policies for Vault Wishlist (Allow SINGLE_USER_ID)
ALTER TABLE vault_wishlist ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can manage their own wishlist" ON vault_wishlist;

CREATE POLICY "Users can manage their own wishlist"
ON vault_wishlist
FOR ALL
USING (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001'
)
WITH CHECK (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001'
);

-- Grant usage to potential public/anon roles if Supabase setup differs (Safety net)
GRANT ALL ON vault_transactions TO anon, authenticated, service_role;
GRANT ALL ON vault_wishlist TO anon, authenticated, service_role;
