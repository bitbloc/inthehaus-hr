-- Table Reservations Management
CREATE TABLE IF NOT EXISTS public.table_reservations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    reservation_date DATE NOT NULL,
    reservation_time TEXT, -- Stores '18:30', '19:00', etc.
    guests INTEGER DEFAULT 1,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'CONFIRMED', 'COMPLETED', 'CANCELLED'
    staff_id TEXT, -- LINE ID of recorder
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.table_reservations ENABLE ROW LEVEL SECURITY;

-- Simple policies for service role / authenticated
DROP POLICY IF EXISTS "Allow all for authenticated" ON public.table_reservations;
CREATE POLICY "Allow all for authenticated" ON public.table_reservations FOR ALL USING (true);

-- Function to handle updated_at
CREATE OR REPLACE FUNCTION update_modified_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_reservations_modtime
    BEFORE UPDATE ON public.table_reservations
    FOR EACH ROW
    EXECUTE PROCEDURE update_modified_column();
