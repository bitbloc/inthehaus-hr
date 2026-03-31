-- Roster Requests Table for Audit Trail and Approvals
CREATE TABLE IF NOT EXISTS roster_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('LEAVE', 'SWAP', 'CHANGE')),
    requester_id BIGINT REFERENCES employees(id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    
    -- For SWAP
    target_peer_id BIGINT REFERENCES employees(id) ON DELETE SET NULL,
    
    -- For CHANGE (Shift or Time)
    new_shift_id BIGINT REFERENCES shifts(id),
    custom_start_time TIME,
    custom_end_time TIME,
    
    reason TEXT,
    status TEXT DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    manager_id BIGINT REFERENCES employees(id),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE roster_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Enable all access for authenticated users" ON roster_requests FOR ALL USING (auth.role() = 'authenticated');
