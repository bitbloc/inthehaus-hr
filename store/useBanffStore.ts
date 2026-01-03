import { create } from 'zustand';
import { Lifestyle, Habit, HabitLog, DailyMetric } from '../types/banff';
import { getTodayDateString } from '../utils/date';

interface BanffState {
    lifestyles: Lifestyle[];
    habits: Habit[];
    todayLogs: Record<string, HabitLog>; // habit_id -> log
    recentLogs: HabitLog[]; // Last 30 days for charts/table
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
    setRecentLogs: (logs: HabitLog[]) => void;
    setTotalLogs: (count: number) => void;
    setTodayMetrics: (metrics: DailyMetric) => void;

    // Timer State
    timer: {
        active: boolean;
        mode: 'WORK' | 'SHORT' | 'LONG';
        endTime: number | null; // Timestamp
        duration: number; // Minutes
        habitId: string | null;
        habitTitle: string | null;
    };

    // Timer Actions
    startTimer: (habitId: string | null, habitTitle: string | null, mode: 'WORK' | 'SHORT' | 'LONG', durationMinutes: number) => void;
    stopTimer: () => void;
    checkTimer: () => void; // Helper to check completion

    // Vault State
    vaultTransactions: any[]; // VaultTransaction[]
    vaultBalance: number;
    setVaultTransactions: (txs: any[]) => void;
    redeemVault: (amount: number, description: string) => Promise<void>;

    toggleHabitOptimistic: (habitId: string) => void;
    updateMetricOptimistic: (key: keyof DailyMetric, value: number | string) => void;
}

export const useBanffStore = create<BanffState>((set, get) => ({
    lifestyles: [],
    habits: [],
    todayLogs: {},
    recentLogs: [],
    totalLogs: 0,
    todayMetrics: null,
    selectedLifestyleId: null,

    // Vault
    vaultTransactions: [],
    vaultBalance: 0,

    timer: {
        active: false,
        mode: 'WORK',
        endTime: null,
        duration: 25,
        habitId: null,
        habitTitle: null
    },

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
        // Recalculate balance potentially? 
        // For MVP, page.tsx calculates initial balance. Here we just maintain generic state updates.
    },
    setRecentLogs: (logs) => set({ recentLogs: logs }),
    setTotalLogs: (count) => set({ totalLogs: count }),
    setTodayMetrics: (metrics) => set({ todayMetrics: metrics }),

    setVaultTransactions: (txs) => set({ vaultTransactions: txs }),

    redeemVault: async (amount, description) => {
        // Optimistic
        set(state => ({
            vaultTransactions: [{
                id: 'opt-' + Date.now(),
                amount: -amount,
                type: 'REDEEM',
                description,
                created_at: new Date().toISOString()
            } as any, ...state.vaultTransactions],
            vaultBalance: state.vaultBalance - amount
        }));

        // DB Insert
        const { error } = await supabase.from('vault_transactions').insert({
            user_id: (await supabase.auth.getUser()).data.user?.id || '00000000-0000-0000-0000-000000000001',
            amount: -amount,
            type: 'REDEEM',
            description
        });

        if (error) {
            console.error("Redeem failed", error);
            // Revert? For MVP, just log.
        }
    },

    startTimer: (habitId, habitTitle, mode, durationMinutes) => set({
        timer: {
            active: true,
            mode,
            endTime: Date.now() + durationMinutes * 60 * 1000,
            duration: durationMinutes,
            habitId,
            habitTitle
        }
    }),

    stopTimer: () => set((state) => ({
        timer: { ...state.timer, active: false, endTime: null }
    })),

    checkTimer: () => {
        const state = get();
        if (state.timer.active && state.timer.endTime && Date.now() >= state.timer.endTime) {
            set({ timer: { ...state.timer, active: false } });
            // Sound and side effects should be handled by the listener
        }
    },

    toggleHabitOptimistic: (habitId) => set((state) => {
        const exists = !!state.todayLogs[habitId];
        const newLogs = { ...state.todayLogs };
        const habit = state.habits.find(h => h.id === habitId);
        let newLifestyles = [...state.lifestyles];
        let newTotalLogs = state.totalLogs;
        let newBalance = state.vaultBalance;

        if (exists) {
            // UNDO: Remove log
            const logToRemove = newLogs[habitId];
            delete newLogs[habitId];
            newTotalLogs = Math.max(0, newTotalLogs - 1);

            // Decrement XP
            if (habit && habit.lifestyle_id) {
                newLifestyles = newLifestyles.map(l =>
                    l.id === habit.lifestyle_id ? { ...l, xp: Math.max(0, (l.xp || 0) - 10) } : l
                );
                updateLifestyleXP(habit.lifestyle_id, -10);
            }

            // Decrement Money (Refund)
            // We use the recorded earned_value if available, else habit value
            const refundValue = logToRemove.earned_value || (habit?.money_value || 0);
            newBalance -= refundValue;

            // Trigger DB delete log
            deleteLogFromDb(state.todayLogs[habitId].id);

        } else {
            // DO: Add log
            const earnedValue = habit?.money_value || 0;
            const newLog: HabitLog = {
                id: 'optimistic-' + Math.random(),
                habit_id: habitId,
                log_date: getTodayDateString(),
                completed_at: new Date().toISOString(),
                earned_value: earnedValue
            };
            newLogs[habitId] = newLog;
            newTotalLogs += 1;

            // Increment XP
            if (habit && habit.lifestyle_id) {
                newLifestyles = newLifestyles.map(l =>
                    l.id === habit.lifestyle_id ? { ...l, xp: (l.xp || 0) + 10 } : l
                );
                updateLifestyleXP(habit.lifestyle_id, 10);
            }

            // Increment Money
            newBalance += earnedValue;

            // Trigger DB insert log
            insertLogToDb(newLog.habit_id, earnedValue);
        }

        return { todayLogs: newLogs, lifestyles: newLifestyles, totalLogs: newTotalLogs, vaultBalance: newBalance };
    }),

    updateMetricOptimistic: (key, value) => {
        set((state) => {
            const currentMetrics = state.todayMetrics || {
                id: 'temp',
                user_id: '00000000-0000-0000-0000-000000000001', // Fallback SINGLE_USER_ID
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
    const { error } = await supabase
        .from('daily_metrics')
        .upsert({
            user_id: metrics.user_id,
            date: metrics.date,
            mood_score: metrics.mood_score,
            energy_score: metrics.energy_score,
            focus_score: metrics.focus_score,
            note: metrics.note
        }, { onConflict: 'user_id, date' });

    if (error) console.error("Auto-save metrics failed:", error);
}, 1000);

const insertLogToDb = async (habitId: string, earnedValue: number) => {
    const { error } = await supabase.from('habit_logs').insert({
        habit_id: habitId,
        user_id: (await supabase.auth.getUser()).data.user?.id || '00000000-0000-0000-0000-000000000001', // Fallback
        log_date: getTodayDateString(),
        earned_value: earnedValue
    });
    if (error) console.error("Failed to insert log", error);
};

const deleteLogFromDb = async (logId: string) => {
    if (logId.startsWith('optimistic')) {
        console.warn("Skipping delete of optimistic ID, reliance on refresh or implementation needed.");
        return;
    }

    const { error } = await supabase.from('habit_logs').delete().eq('id', logId);
    if (error) console.error("Failed to delete log", error);
};

