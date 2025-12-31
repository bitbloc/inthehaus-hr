import { create } from 'zustand';
import { Lifestyle, Habit, HabitLog, DailyMetric } from '../types/banff';
import { getTodayDateString } from '../utils/date';

interface BanffState {
    lifestyles: Lifestyle[];
    habits: Habit[];
    todayLogs: Record<string, HabitLog>; // habit_id -> log
    totalLogs: number; // For XP
    todayMetrics: DailyMetric | null;
    selectedLifestyleId: string | null;

    // Actions
    setLifestyles: (lifestyles: Lifestyle[]) => void;
    setSelectedLifestyleId: (id: string | null) => void;
    setHabits: (habits: Habit[]) => void;
    addHabit: (habit: Habit) => void;
    deleteHabit: (id: string) => void;
    updateHabit: (habit: Habit) => void;
    setTodayLogs: (logs: HabitLog[]) => void;
    setTotalLogs: (count: number) => void;
    setTodayMetrics: (metrics: DailyMetric) => void;

    toggleHabitOptimistic: (habitId: string) => void;
    updateMetricOptimistic: (key: keyof DailyMetric, value: number | string) => void;
}

export const useBanffStore = create<BanffState>((set, get) => ({
    lifestyles: [],
    habits: [],
    todayLogs: {},
    totalLogs: 0,
    todayMetrics: null,
    selectedLifestyleId: null,

    setLifestyles: (lifestyles) => set({ lifestyles: lifestyles.map(l => ({ ...l, xp: l.xp || 0 })) }),
    setSelectedLifestyleId: (id) => set({ selectedLifestyleId: id }),
    setHabits: (habits) => set({ habits }),
    addHabit: (habit) => set((state) => ({ habits: [...state.habits, habit] })),
    deleteHabit: (id) => set((state) => ({
        habits: state.habits.filter(h => h.id !== id)
    })),
    updateHabit: (updatedHabit) => set((state) => ({
        habits: state.habits.map(h => h.id === updatedHabit.id ? updatedHabit : h)
    })),
    setTodayLogs: (logs) => {
        const logMap: Record<string, HabitLog> = {};
        logs.forEach(log => {
            logMap[log.habit_id] = log;
        });
        set({ todayLogs: logMap });
    },
    setTotalLogs: (count) => set({ totalLogs: count }),
    setTodayMetrics: (metrics) => set({ todayMetrics: metrics }),

    toggleHabitOptimistic: (habitId) => set((state) => {
        const exists = !!state.todayLogs[habitId];
        const newLogs = { ...state.todayLogs };
        const habit = state.habits.find(h => h.id === habitId);
        let newLifestyles = [...state.lifestyles];

        if (exists) {
            delete newLogs[habitId];
            // Decrement XP if habit belongs to a lifestyle
            if (habit && habit.lifestyle_id) {
                newLifestyles = newLifestyles.map(l =>
                    l.id === habit.lifestyle_id ? { ...l, xp: Math.max(0, (l.xp || 0) - 10) } : l
                );
                // Also trigger DB update for XP decrement (async)
                updateLifestyleXP(habit.lifestyle_id, -10);
            }
        } else {
            newLogs[habitId] = {
                id: 'optimistic-' + Math.random(),
                habit_id: habitId,
                log_date: getTodayDateString(),
                completed_at: new Date().toISOString()
            };
            // Increment XP
            if (habit && habit.lifestyle_id) {
                newLifestyles = newLifestyles.map(l =>
                    l.id === habit.lifestyle_id ? { ...l, xp: (l.xp || 0) + 10 } : l
                );
                // Also trigger DB update for XP increment (async)
                updateLifestyleXP(habit.lifestyle_id, 10);
            }
        }

        return { todayLogs: newLogs, lifestyles: newLifestyles };
    }),

    updateMetricOptimistic: (key, value) => {
        set((state) => {
            const currentMetrics = state.todayMetrics || {
                id: 'temp',
                user_id: '00000000-0000-0000-0000-000000000001', // Fallback SINGLE_USER_ID if null, but should be set by init
                date: getTodayDateString(),
                mood_score: 50,
                energy_score: 50,
                focus_score: 50
            };

            const newMetrics = { ...currentMetrics, [key]: value };

            // Trigger side effect
            saveMetricsToDb(newMetrics);

            return { todayMetrics: newMetrics };
        });
    }
}));

// Helper to update XP in DB
const updateLifestyleXP = async (lifestyleId: string, amount: number) => {
    // We need to fetch current first to be safe or use an RPC. 
    // For MVP/Single User, we can just assume the client state is roughly correct 
    // BUT strictly, we should increment in DB. 
    // Supabase doesn't have an atomic increment via simple client SDK update easily without RPC.
    // So we fetch, then update.

    try {
        const { data: current } = await supabase.from('lifestyles').select('xp').eq('id', lifestyleId).single();
        if (current) {
            const newXP = Math.max(0, (current.xp || 0) + amount);
            await supabase.from('lifestyles').update({ xp: newXP }).eq('id', lifestyleId);
        }
    } catch (e) {
        console.error("Failed to update XP", e);
    }
};

// Debounced Saver (outside hook to persist closure)
import { supabase } from '@/lib/supabaseClient';
import { debounce } from '@/utils/debounce';

const saveMetricsToDb = debounce(async (metrics: DailyMetric) => {
    // Upsert to handle both insert and update
    // Requires database to have unique constraint on (user_id, date)
    const { error } = await supabase
        .from('daily_metrics')
        .upsert({
            user_id: metrics.user_id,
            date: metrics.date,
            mood_score: metrics.mood_score,
            energy_score: metrics.energy_score,
            focus_score: metrics.focus_score
        }, { onConflict: 'user_id, date' }); // Supabase syntax might vary slightly based on client version but usually 'user_id, date' string works if constraint exists

    if (error) console.error("Auto-save metrics failed:", error);
}, 1000);

