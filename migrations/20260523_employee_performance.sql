-- Migration to add employee performance and appraisal columns
ALTER TABLE employees
ADD COLUMN IF NOT EXISTS duties TEXT,
ADD COLUMN IF NOT EXISTS strengths TEXT,
ADD COLUMN IF NOT EXISTS improvements TEXT;
