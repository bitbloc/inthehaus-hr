-- Banff Chronicle Views
-- Run this script in Supabase SQL Editor

-- 0. Schema Migration (Fix missing columns for features)
alter table public.lifestyles add column if not exists xp int default 0;
alter table public.lifestyles add column if not exists color text default '#10B981';
alter table public.lifestyles add column if not exists icon text;

-- 1. Optimizing lookups
create index if not exists idx_habit_logs_user_date on public.habit_logs(user_id, log_date);
create index if not exists idx_daily_metrics_user_date on public.daily_metrics(user_id, date);

-- 2. View: Monthly Summary (For Consistency Garden & Correlation context)
create or replace view view_monthly_summary as
with habits as (
    select 
        user_id, 
        date_trunc('month', log_date) as month, 
        count(*) as total_habits_done
    from public.habit_logs 
    group by 1, 2
),
metrics as (
    select 
        user_id, 
        date_trunc('month', date) as month, 
        avg(mood_score) as avg_mood,
        avg(energy_score) as avg_energy
    from public.daily_metrics 
    group by 1, 2
)
select 
    coalesce(h.month, m.month) as month,
    coalesce(h.user_id, m.user_id) as user_id,
    round(coalesce(m.avg_mood, 0)::numeric, 1) as avg_mood,
    round(coalesce(m.avg_energy, 0)::numeric, 1) as avg_energy,
    coalesce(h.total_habits_done, 0) as total_habits_done
from metrics m
full outer join habits h on h.user_id = m.user_id and h.month = m.month;

-- 3. View: Lifestyle Balance (For Life Shape Blob)
-- Normalizes XP to 0-100 scale based on the user's maximum lifestyle XP
create or replace view view_lifestyle_balance as
with max_xp as (
  select user_id, max(xp) as max_val from public.lifestyles group by 1
)
select 
  l.id,
  l.user_id,
  l.name,
  l.color,
  l.icon,
  l.xp,
  case 
    when coalesce(m.max_val, 0) = 0 then 10 -- Minimum size if everything is 0
    else cast((l.xp::float / m.max_val::float) * 100 as int) 
  end as normalized_score
from public.lifestyles l
left join max_xp m on l.user_id = m.user_id;

-- Comment: Views created successfully.
