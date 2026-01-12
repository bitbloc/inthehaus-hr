-- Fix RLS Policies for Protocol Activities to allow unauthenticated use with SINGLE_USER_ID

ALTER TABLE protocol_activities ENABLE ROW LEVEL SECURITY;

-- Drop existing restricted policies
DROP POLICY IF EXISTS "Users can view their own protocol activities" ON protocol_activities;
DROP POLICY IF EXISTS "Users can insert their own protocol activities" ON protocol_activities;
DROP POLICY IF EXISTS "Users can update their own protocol activities" ON protocol_activities;
DROP POLICY IF EXISTS "Users can delete their own protocol activities" ON protocol_activities;

-- Create inclusive policies
-- SELECT
CREATE POLICY "Users can view their own protocol activities"
ON protocol_activities FOR SELECT
USING (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001'
);

-- INSERT
CREATE POLICY "Users can insert their own protocol activities"
ON protocol_activities FOR INSERT
WITH CHECK (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001'
);

-- UPDATE
CREATE POLICY "Users can update their own protocol activities"
ON protocol_activities FOR UPDATE
USING (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001'
);

-- DELETE
CREATE POLICY "Users can delete their own protocol activities"
ON protocol_activities FOR DELETE
USING (
    auth.uid() = user_id 
    OR 
    user_id = '00000000-0000-0000-0000-000000000001'
);

-- Grant permissions to anon role (required for unauthenticated access)
GRANT ALL ON protocol_activities TO anon, authenticated, service_role;
