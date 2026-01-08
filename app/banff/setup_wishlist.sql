-- Create Wishlist Table
CREATE TABLE IF NOT EXISTS vault_wishlist (
    id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) NOT NULL,
    name TEXT NOT NULL,
    price INTEGER NOT NULL,
    image TEXT, -- Emoji or URL
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE vault_wishlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage their own wishlist" 
ON vault_wishlist FOR ALL 
USING (auth.uid() = user_id);
