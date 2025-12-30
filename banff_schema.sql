-- 1. Lifestyles: Dimensions/Attributes of life (e.g., Health, Work, Soul)
create table if not exists public.lifestyles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  name text not null,
  color text default '#10B981', -- Hex color code for UI
  icon text, -- Icon name string (e.g., 'heart', 'book')
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Habits: Quests/Activities tied to a Lifestyle
create table if not exists public.habits (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  lifestyle_id uuid references public.lifestyles on delete cascade,
  title text not null,
  description text,
  
  -- Logic: null = everyday, array of ints (0-6) = specific days
  frequency_days int[] default null, 
  
  -- Logic: Cached streak stats
  current_streak int default 0,
  max_streak int default 0,
  
  is_archived boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 3. Daily Metrics: Abstract values (Mood, Energy) measured via sliders 0-100
create table if not exists public.daily_metrics (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  date date not null default CURRENT_DATE,
  mood_score int check (mood_score >= 0 and mood_score <= 100),
  energy_score int check (energy_score >= 0 and energy_score <= 100),
  focus_score int check (focus_score >= 0 and focus_score <= 100),
  note text, -- Short diary
  unique(user_id, date) -- Constraint: 1 record per day
);

-- 4. Habit Logs: Action records (Checking off a habit)
create table if not exists public.habit_logs (
  id uuid default gen_random_uuid() primary key,
  habit_id uuid references public.habits on delete cascade,
  user_id uuid references auth.users not null,
  
  -- Use date type to handle simple daily uniqueness regardless of timezones
  log_date date not null default CURRENT_DATE,
  
  completed_at timestamp with time zone default timezone('utc'::text, now()) not null,
  unique(habit_id, log_date) -- Prevent duplicate check-ins for the same habit on the same day
);

-- Enable RLS (Row Level Security)
alter table public.lifestyles enable row level security;
alter table public.habits enable row level security;
alter table public.daily_metrics enable row level security;
alter table public.habit_logs enable row level security;

-- Policies: Users can only see/edit their own data

-- Lifestyles Policies
create policy "Users can view their own lifestyles" on public.lifestyles for select using (auth.uid() = user_id);
create policy "Users can insert their own lifestyles" on public.lifestyles for insert with check (auth.uid() = user_id);
create policy "Users can update their own lifestyles" on public.lifestyles for update using (auth.uid() = user_id);
create policy "Users can delete their own lifestyles" on public.lifestyles for delete using (auth.uid() = user_id);

-- Habits Policies
create policy "Users can view their own habits" on public.habits for select using (auth.uid() = user_id);
create policy "Users can insert their own habits" on public.habits for insert with check (auth.uid() = user_id);
create policy "Users can update their own habits" on public.habits for update using (auth.uid() = user_id);
create policy "Users can delete their own habits" on public.habits for delete using (auth.uid() = user_id);

-- Daily Metrics Policies
create policy "Users can view their own daily metrics" on public.daily_metrics for select using (auth.uid() = user_id);
create policy "Users can insert their own daily metrics" on public.daily_metrics for insert with check (auth.uid() = user_id);
create policy "Users can update their own daily metrics" on public.daily_metrics for update using (auth.uid() = user_id);

-- Habit Logs Policies
create policy "Users can view their own habit logs" on public.habit_logs for select using (auth.uid() = user_id);
create policy "Users can insert their own habit logs" on public.habit_logs for insert with check (auth.uid() = user_id);
create policy "Users can update their own habit logs" on public.habit_logs for update using (auth.uid() = user_id);
create policy "Users can delete their own habit logs" on public.habit_logs for delete using (auth.uid() = user_id);
