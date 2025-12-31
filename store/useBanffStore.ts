import { create } from 'zustand';
import { Lifestyle, Habit, HabitLog, DailyMetric } from '../types/banff';
import { getTodayDateString } from '../utils/date';

interface BanffState {
    lifestyles: Lifestyle[];
    habits: Habit[];
    todayLogs: Record<string, HabitLog>; // habit_id -> log
    totalLogs: number; // For XP
    todayMetrics: DailyMetric | null;

    // Actions
    setLifestyles: (lifestyles: Lifestyle[]) => void;
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

export const useBanffStore = create<BanffState>((set) => ({
    lifestyles: [],
    habits: [],
    todayLogs: {},
    totalLogs: 0,
    todayMetrics: null,

    setLifestyles: (lifestyles) => set({ lifestyles }),
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

        if (exists) {
            delete newLogs[habitId];
            // Logic to decrement streak would happen here or waiting for server re-fetch
        } else {
            newLogs[habitId] = {
                id: 'optimistic-' + Math.random(),
                habit_id: habitId,
                log_date: getTodayDateString(),
                completed_at: new Date().toISOString()
            };
        }

        return { todayLogs: newLogs };
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

