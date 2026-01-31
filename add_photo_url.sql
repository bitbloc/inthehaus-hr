-- Add photo_url column to employees table
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS photo_url TEXT;
