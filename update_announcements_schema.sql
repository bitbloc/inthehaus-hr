-- Add new columns for robust announcement management
ALTER TABLE announcements 
ADD COLUMN IF NOT EXISTS priority INTEGER DEFAULT 1, -- 1=Normal, 2=High
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP WITH TIME ZONE;
