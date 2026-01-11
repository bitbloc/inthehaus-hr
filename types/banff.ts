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
    // Virtue Vault
    money_value: number; // Value in THB
    is_saver: boolean; // true = Saver (Abstinence), false = Earner (Action)
}

export interface HabitLog {
    id: string;
    habit_id: string;
    log_date: string; // YYYY-MM-DD
    completed_at: string;
    earned_value?: number; // Snapshot of value earned
}

export interface VaultTransaction {
    id: string;
    user_id: string;
    amount: number;
    type: 'REDEEM' | 'PENALTY' | 'ADJUSTMENT';
    description: string;
    created_at: string;
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

export interface ProtocolActivity {
    id: string;
    user_id: string;
    category: 'MORNING' | 'DAYTIME' | 'EVENING';
    label: string;
    description?: string;
    icon?: string;
    weight: number;
    is_default: boolean;
}
