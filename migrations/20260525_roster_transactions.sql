CREATE TABLE IF NOT EXISTS public.roster_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    employee_id BIGINT REFERENCES public.employees(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    slot_type TEXT DEFAULT 'MAIN' CHECK (slot_type IN ('MAIN', 'SPLIT', 'OVERTIME')),
    shift_id BIGINT REFERENCES public.shifts(id) ON DELETE SET NULL,
    custom_start_time TIME WITHOUT TIME ZONE,
    custom_end_time TIME WITHOUT TIME ZONE,
    is_off BOOLEAN DEFAULT FALSE,
    status TEXT DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'PUBLISHED')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    
    -- Prevents double booking an employee for the same slot on the same day
    UNIQUE(employee_id, date, slot_type)
);

-- Enable RLS
ALTER TABLE public.roster_transactions ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Enable read access for authenticated users" ON public.roster_transactions FOR SELECT USING (auth.role() = 'authenticated');
CREATE POLICY "Enable all access for authenticated users" ON public.roster_transactions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Indexes for fast querying by date
CREATE INDEX IF NOT EXISTS idx_roster_transactions_date ON public.roster_transactions(date);
CREATE INDEX IF NOT EXISTS idx_roster_transactions_employee_date ON public.roster_transactions(employee_id, date);
