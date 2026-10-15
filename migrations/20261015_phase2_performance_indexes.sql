-- Migration: Phase 2 Database Performance Indexes
-- Purpose: Supercharge query execution for slip verification, yuzu history deduplication, and attendance.

-- 1. Index for slip verification & duplicate prevention
CREATE INDEX IF NOT EXISTS idx_slip_transactions_ref_date 
ON slip_transactions (transaction_ref, date) 
WHERE is_deleted = false;

-- 2. Composite index for same-day slip amount check (Layer 2 composite duplicate matching)
CREATE INDEX IF NOT EXISTS idx_slip_transactions_amount_date 
ON slip_transactions (amount, date) 
WHERE is_deleted = false;

-- 3. Index for Yuzu Chat History locking & deduplication
CREATE INDEX IF NOT EXISTS idx_yuzu_chat_history_lock_lookup 
ON yuzu_chat_history (content, message_type) 
WHERE message_type = 'lock';

-- 4. Index for Yuzu Chat History recent messages per group/user
CREATE INDEX IF NOT EXISTS idx_yuzu_chat_history_lookup 
ON yuzu_chat_history (group_id, user_id, message_type, created_at DESC);

-- 5. Index for employee lookup by LINE IDs
CREATE INDEX IF NOT EXISTS idx_employees_line_bot_id 
ON employees (line_bot_id) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_employees_line_user_id 
ON employees (line_user_id) 
WHERE is_active = true;

-- 6. Index for attendance logs
CREATE INDEX IF NOT EXISTS idx_attendance_employee_time 
ON attendance_logs (employee_id, timestamp DESC);

-- 7. Index for staff tasks
CREATE INDEX IF NOT EXISTS idx_staff_tasks_status_assigned 
ON staff_tasks (status, assigned_to, created_at DESC);
