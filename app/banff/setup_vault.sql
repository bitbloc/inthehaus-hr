-- Add Money columns to Habits
ALTER TABLE habits 
ADD COLUMN money_value INTEGER DEFAULT 0,
ADD COLUMN is_saver BOOLEAN DEFAULT false;

-- Add Earned Value to Habit Logs (Snapshot)
ALTER TABLE habit_logs
ADD COLUMN earned_value INTEGER DEFAULT 0;

-- Create Vault Transactions Table
CREATE TABLE vault_transactions (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    amount INTEGER NOT NULL, -- Positive for manual adds (rare), Negative for Redeems/Penalties
    type TEXT NOT NULL, -- 'REDEEM', 'PENALTY', 'ADJUSTMENT'
    description TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies (Simple start)
ALTER TABLE vault_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own transactions"
ON vault_transactions FOR ALL
USING (auth.uid() = user_id);
