-- Migration: Allow Suspended (พักงาน) and Vacation (พักร้อน) in employment_status
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_employment_status_check;

ALTER TABLE employees ADD CONSTRAINT employees_employment_status_check 
CHECK (employment_status IN ('Probation', 'Fulltime', 'Contract', 'Resigned', 'Suspended', 'Vacation'));
