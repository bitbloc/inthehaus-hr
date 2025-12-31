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

    updateMetricOptimistic: (key, value) => set((state) => ({
        todayMetrics: state.todayMetrics ? { ...state.todayMetrics, [key]: value } : null
    }))
}));
