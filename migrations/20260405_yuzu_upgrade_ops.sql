-- Track prices weekly
CREATE TABLE IF NOT EXISTS public.ingredient_prices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    item_name TEXT NOT NULL,
    source TEXT NOT NULL, -- 'TalaadThai' or 'Makro'
    price DECIMAL(10,2) NOT NULL,
    unit TEXT,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Manage Phone Orders
CREATE TABLE IF NOT EXISTS public.phone_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    items_json JSONB NOT NULL,
    customer_phone TEXT,
    customer_name TEXT,
    status TEXT DEFAULT 'PENDING', -- 'PENDING', 'CONFIRMED', 'DONE'
    staff_id TEXT, -- LINE ID of recorder
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    confirmed_at TIMESTAMP WITH TIME ZONE,
    done_at TIMESTAMP WITH TIME ZONE
);

-- Manage Tasks from Audio/Chat
CREATE TABLE IF NOT EXISTS public.staff_tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    description TEXT NOT NULL,
    status TEXT DEFAULT 'TODO', -- 'TODO', 'DONE'
    source_message_id TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    completed_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS (though usually handled by Supabase Dashboard, good to have)
ALTER TABLE public.ingredient_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.phone_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.staff_tasks ENABLE ROW LEVEL SECURITY;

-- Simple policies for service role / authenticated (adjust if needed)
CREATE POLICY "Allow all for authenticated" ON public.ingredient_prices FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON public.phone_orders FOR ALL USING (true);
CREATE POLICY "Allow all for authenticated" ON public.staff_tasks FOR ALL USING (true);
