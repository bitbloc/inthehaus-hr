-- Single User Mode Schema
-- Run this in your Supabase SQL Editor to adapt the database for no-login usage.

-- 1. Lifestyles
create table if not exists public.lifestyles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null, -- Removed 'references auth.users'
  name text not null,
  color text default '#10B981',
  icon text,
  xp int default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habits
create table if not exists public.habits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null, -- Removed 'references auth.users'
  lifestyle_id uuid references public.lifestyles on delete cascade,
  title text not null,
  description text,
  frequency_days int[] default null, 
  current_streak int default 0,
  max_streak int default 0,
  is_archived boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Daily Metrics
create table if not exists public.daily_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid not null, -- Removed 'references auth.users'
  date date not null default CURRENT_DATE,
  mood_score int check (mood_score >= 0 and mood_score <= 100),
  energy_score int check (energy_score >= 0 and energy_score <= 100),
  focus_score int check (focus_score >= 0 and focus_score <= 100),
  note text,
  unique(user_id, date)
);

-- 4. Habit Logs
create table if not exists public.habit_logs (
  id uuid default gen_random_uuid() primary key,
  habit_id uuid references public.habits on delete cascade,
  user_id uuid not null, -- Removed 'references auth.users'
  log_date date not null default CURRENT_DATE,
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(habit_id, log_date)
);

-- Disable RLS for Simple Single User usage (easiest for local/personal apps)
alter table public.lifestyles disable row level security;
alter table public.habits disable row level security;
alter table public.daily_metrics disable row level security;
alter table public.habit_logs disable row level security;

-- OR if you prefer keeping RLS enabled but allowing all access (Open Access)
-- create policy "Allow all access" on public.habits for all using (true) with check (true);
-- ... repeat for others.
