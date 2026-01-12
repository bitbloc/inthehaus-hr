-- Fix Foreign Key Constraint Violation (Code 23503)
-- The error occurs because '00000000-0000-0000-0000-000000000001' (SINGLE_USER_ID) 
-- does not exist in the real 'auth.users' table.
-- To fix this, we remove the strict foreign key requirement.

-- 1. Drop the existing foreign key constraint
ALTER TABLE protocol_activities
DROP CONSTRAINT IF EXISTS protocol_activities_user_id_fkey;

-- 2. (Optional) Re-add a simplified check or just leave it loop
-- We leave it loose to allow the fallback ID.

-- 3. Ensure RLS still permits the fallback (Reinforcing previous fix)
ALTER TABLE protocol_activities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can insert protocol activities" ON protocol_activities;
CREATE POLICY "Users can insert protocol activities"
ON protocol_activities FOR INSERT
WITH CHECK (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001'
);
