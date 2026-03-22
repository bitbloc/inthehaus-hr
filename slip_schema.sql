-- Table for storing bank slip transactions
CREATE TABLE IF NOT EXISTS public.slip_transactions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    group_id TEXT,
    user_id TEXT REFERENCES public.employees(line_user_id) ON DELETE SET NULL,
    amount NUMERIC(10, 2) NOT NULL,
    slip_url TEXT,
    timestamp TIMESTAMPTZ DEFAULT now(),
    date DATE DEFAULT CURRENT_DATE,
    is_deleted BOOLEAN DEFAULT false
);

ALTER TABLE public.slip_transactions ENABLE ROW LEVEL SECURITY;

-- Allow all access for anon and authenticated (matching the project's permission pattern)
DROP POLICY IF EXISTS "Admins can manage slip_transactions" ON public.slip_transactions;
DROP POLICY IF EXISTS "Enable all access" ON public.slip_transactions;
CREATE POLICY "Enable all access" 
ON public.slip_transactions 
FOR ALL 
TO anon, authenticated 
USING (true) 
WITH CHECK (true);

-- Creating the storage bucket for slips if it doesn't already exist
INSERT INTO storage.buckets (id, name, public) 
VALUES ('yuzu-slips', 'yuzu-slips', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for the new bucket
DROP POLICY IF EXISTS "Anyone can upload slips" ON storage.objects;
CREATE POLICY "Anyone can upload slips"
ON storage.objects FOR INSERT TO public WITH CHECK (bucket_id = 'yuzu-slips');

DROP POLICY IF EXISTS "Anyone can view slips" ON storage.objects;
CREATE POLICY "Anyone can view slips"
ON storage.objects FOR SELECT TO public USING (bucket_id = 'yuzu-slips');

DROP POLICY IF EXISTS "Anyone can update slips" ON storage.objects;
CREATE POLICY "Anyone can update slips"
ON storage.objects FOR UPDATE TO public USING (bucket_id = 'yuzu-slips');

DROP POLICY IF EXISTS "Anyone can delete slips" ON storage.objects;
CREATE POLICY "Anyone can delete slips"
ON storage.objects FOR DELETE TO public USING (bucket_id = 'yuzu-slips');
