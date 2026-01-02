-- Add shift_rates column to employees table to store per-shift daily wage rates
-- Example structure: {"morning": 500, "evening": 600, "double": 1000}
ALTER TABLE employees 
ADD COLUMN IF NOT EXISTS shift_rates JSONB DEFAULT '{}'::jsonb;
