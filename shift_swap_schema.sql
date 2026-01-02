-- 1. Shift Swap Requests Table
CREATE TABLE IF NOT EXISTS shift_swap_requests (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    requester_id BIGINT REFERENCES employees(id) ON DELETE CASCADE,
    target_date DATE NOT NULL,
    old_shift_id BIGINT REFERENCES shifts(id),
    type TEXT CHECK (type IN ('GIVE_AWAY', 'TRADE')),
    target_peer_id BIGINT REFERENCES employees(id) ON DELETE SET NULL, -- Optional (for Direct Swap)
    status TEXT DEFAULT 'PENDING_PEER' CHECK (status IN ('DRAFT', 'PENDING_PEER', 'PENDING_MANAGER', 'APPROVED', 'REJECTED', 'CANCELLED')),
    notes TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Roster Overrides Table (The Source of Truth for Daily Changes)
CREATE TABLE IF NOT EXISTS roster_overrides (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id BIGINT REFERENCES employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    
    -- "Shift ID" is mainly for reference (e.g. "Morning Shift"). 
    -- The Actual Time (custom_start_time) is what matters for Payroll to ensure "Data Freezing".
    shift_id BIGINT REFERENCES shifts(id), 
    
    is_off BOOLEAN DEFAULT FALSE, -- If TRUE, this override means "DO NOT WORK" (removes from weekly roster)
    
    custom_start_time TIME WITHOUT TIME ZONE,
    custom_end_time TIME WITHOUT TIME ZONE,
    
    reference_request_id UUID REFERENCES shift_swap_requests(id) ON DELETE SET NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    
    UNIQUE(employee_id, date) -- One override per employee per day
);

-- 3. Indexes for Performance (Aggregator needs these)
CREATE INDEX IF NOT EXISTS idx_roster_overrides_date ON roster_overrides(date);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_status ON shift_swap_requests(status);
CREATE INDEX IF NOT EXISTS idx_shift_swap_requests_requester ON shift_swap_requests(requester_id);

-- 4. Enable RLS
ALTER TABLE shift_swap_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_overrides ENABLE ROW LEVEL SECURITY;

-- Policies (Simplified for prototype, refine for production)
create policy "Enable read access for authenticated users" on shift_swap_requests for select using (auth.role() = 'authenticated');
create policy "Enable insert for authenticated users" on shift_swap_requests for insert with check (auth.role() = 'authenticated');
create policy "Enable update for authenticated users" on shift_swap_requests for update using (auth.role() = 'authenticated');

create policy "Enable read access for authenticated users" on roster_overrides for select using (auth.role() = 'authenticated');

-- 5. RPC: Atomic Accept for "Open Pool" (Race Condition Guard)
-- Usage: supabase.rpc('accept_shift_swap', { request_id, responder_id })
CREATE OR REPLACE FUNCTION accept_shift_swap(p_request_id UUID, p_responder_id BIGINT)
RETURNS JSONB AS $$
DECLARE
    v_request shift_swap_requests%ROWTYPE;
BEGIN
    -- Lock the row for update to prevent race conditions
    SELECT * INTO v_request 
    FROM shift_swap_requests 
    WHERE id = p_request_id 
    FOR UPDATE;

    -- Validation
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'message', 'Request not found');
    END IF;

    IF v_request.status != 'PENDING_PEER' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Request is no longer available');
    END IF;

    -- Update the request
    UPDATE shift_swap_requests
    SET 
        target_peer_id = p_responder_id,
        status = 'PENDING_MANAGER',
        updated_at = NOW()
    WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Shift accepted, waiting for manager approval');
EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'message', SQLERRM);
END;
$$ LANGUAGE plpgsql;

-- 6. RPC: Manager Approve (Double Insert Transaction)
-- Usage: supabase.rpc('approve_shift_swap', { request_id })
CREATE OR REPLACE FUNCTION approve_shift_swap(p_request_id UUID)
RETURNS JSONB AS $$
DECLARE
    v_req shift_swap_requests%ROWTYPE;
    v_shift shifts%ROWTYPE;
BEGIN
    SELECT * INTO v_req FROM shift_swap_requests WHERE id = p_request_id;
    
    IF NOT FOUND OR v_req.status != 'PENDING_MANAGER' THEN
        RETURN jsonb_build_object('success', false, 'message', 'Invalid request status');
    END IF;

    -- 1. Get Old Shift Details (for Data Freezing)
    SELECT * INTO v_shift FROM shifts WHERE id = v_req.old_shift_id;
    
    -- 2. Insert Override for Requester (GIVER -> OFF)
    INSERT INTO roster_overrides (employee_id, date, is_off, reference_request_id)
    VALUES (v_req.requester_id, v_req.target_date, TRUE, v_req.id)
    ON CONFLICT (employee_id, date) 
    DO UPDATE SET is_off = TRUE, reference_request_id = v_req.id;

    -- 3. Insert Override for Peer (RECEIVER -> WORK)
    IF v_req.target_peer_id IS NOT NULL THEN
        INSERT INTO roster_overrides (
            employee_id, date, shift_id, is_off, 
            custom_start_time, custom_end_time, reference_request_id
        )
        VALUES (
            v_req.target_peer_id, v_req.target_date, v_req.old_shift_id, FALSE, 
            v_shift.start_time, v_shift.end_time, v_req.id -- Copy Time Checks! Data Frozen here.
        )
        ON CONFLICT (employee_id, date)
        DO UPDATE SET 
            shift_id = v_req.old_shift_id, 
            is_off = FALSE, 
            custom_start_time = v_shift.start_time, 
            custom_end_time = v_shift.end_time,
            reference_request_id = v_req.id;
    END IF;

    -- 4. Update Request Status
    UPDATE shift_swap_requests SET status = 'APPROVED', updated_at = NOW() WHERE id = p_request_id;

    RETURN jsonb_build_object('success', true, 'message', 'Swap approved and roster updated');
END;
$$ LANGUAGE plpgsql;
