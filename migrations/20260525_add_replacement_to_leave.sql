-- SQL Migration: Add replacement employee to leave requests
-- Run this script in the Supabase SQL Editor.

ALTER TABLE public.leave_requests 
ADD COLUMN IF NOT EXISTS replacement_employee_id BIGINT REFERENCES public.employees(id) ON DELETE SET NULL;
