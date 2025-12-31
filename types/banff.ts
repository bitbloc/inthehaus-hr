// Database definitions if needed in future

export interface Lifestyle {
    id: string;
    name: string;
    color: string;
    icon: string;
    xp: number;
}

export interface Habit {
    id: string;
    user_id: string;
    lifestyle_id: string | null;
    title: string;
    description?: string;
    frequency_days: number[] | null; // null = everyday, 0-6 = Sun-Sat
    current_streak: number;
    max_streak: number;
    is_archived: boolean;
}

export interface HabitLog {
    id: string;
    habit_id: string;
    log_date: string; // YYYY-MM-DD
    completed_at: string;
}

export interface DailyMetric {
    id: string;
    user_id: string;
    date: string; // YYYY-MM-DD
    mood_score: number;
    energy_score: number;
    focus_score: number;
    note?: string;
}

export type DayOfWeek = 0 | 1 | 2 | 3 | 4 | 5 | 6;
