-- Protocol Activities Table
create table if not exists public.protocol_activities (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  category text not null check (category in ('MORNING', 'DAYTIME', 'EVENING')),
  label text not null,
  description text,
  icon text, -- Icon name string from react-icons (e.g., 'FaCoffee')
  weight int default 1,
  is_default boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table public.protocol_activities enable row level security;

-- Policies
create policy "Users can view their own protocol activities" on public.protocol_activities for select using (auth.uid() = user_id);
create policy "Users can insert their own protocol activities" on public.protocol_activities for insert with check (auth.uid() = user_id);
create policy "Users can update their own protocol activities" on public.protocol_activities for update using (auth.uid() = user_id);
create policy "Users can delete their own protocol activities" on public.protocol_activities for delete using (auth.uid() = user_id);

-- Seed Data (Optional: Run manually or via migration system)
-- Note: Replace 'USER_ID_HERE' with actual ID if running manually, or logic to seed on user creation.
-- This block is for reference or one-time run.
-- INSERT INTO public.protocol_activities (user_id, category, label, description, icon, weight, is_default)
-- VALUES 
-- ('USER_UUID', 'MORNING', 'Delayed Input (30 นาทีแรก)', 'ห้ามจับมือถือ/ข่าว. ตื่นมาดื่มน้ำ ดูต้นไม้ หรือชงกาแฟ (โฟกัสกลิ่น/เสียง).', 'FaCoffee', 1, true),
-- ('USER_UUID', 'MORNING', 'Unfiltered Brain Dump (10 นาที)', 'เขียน Morning Pages. ขีดเส้นใต้ 1 อย่างที่ต้องทำวันนี้. ที่เหลือเขียน "Pending".', 'FaPen', 1, true),
-- ('USER_UUID', 'DAYTIME', 'The "Good Enough" Timer', 'ตั้งเวลาทำงาน (เช่น 45 นาที). พอหมดเวลาถามตัวเอง "ดีระดับ 80% หรือยัง?" ถ้าถึงแล้วให้พอ.', 'FaClock', 1, true),
-- ('USER_UUID', 'DAYTIME', 'Active Sensing Break (ทุก 2 ชม.)', 'เมื่อหัวบวม ให้ลุกทันที. วาดรูปสั้นๆ, ล้างจาน, รดน้ำต้นไม้.', 'FaWalking', 1, true),
-- ('USER_UUID', 'EVENING', 'The "Not-To-Do" List', 'เช็คว่าวันนี้สำเร็จในการ "ไม่ทำ" อะไรบ้าง (เช่น ไม่ตอบไลน์หลัง 2 ทุ่ม).', 'FaListUl', 1, true),
-- ('USER_UUID', 'EVENING', 'Passive Entertainment (Low-Res)', 'ดูหนังเก่า/Sitcom ที่ไม่ต้องลุ้น. ห้ามดูอะไรที่ "พัฒนาตัวเอง" หลัง 3 ทุ่ม.', 'FaTv', 1, true);
