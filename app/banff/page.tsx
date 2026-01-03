'use client';
import Link from 'next/link';
import React, { useEffect } from 'react';
import { FaCog, FaBook } from 'react-icons/fa';
import { format, subDays } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import { useBanffStore } from '@/store/useBanffStore';
import HabitGroups from './components/HabitGroups';
import LiquidSlider from './components/LiquidSlider';
import { getTodayDateString } from '@/utils/date';

import HabitHeatmap from './components/HabitHeatmap';
import HabitLogTable from './components/HabitLogTable';
import XPBar from './components/XPBar';
import LevelUpModal from './components/LevelUpModal';
import { SINGLE_USER_ID } from './constants';

export default function BanffPage() {
    const { habits, todayLogs, recentLogs, todayMetrics, totalLogs, setHabits, setTodayLogs, setRecentLogs, setTodayMetrics, setTotalLogs, updateMetricOptimistic } = useBanffStore();
    const [showLevelUp, setShowLevelUp] = React.useState(false);
    const [prevLevel, setPrevLevel] = React.useState(1);

    // XP Logic
    // 1 Log = 10 XP
    // Level N requires N * 100 XP (Linear scaling for MVP)
    const XP_PER_LOG = 10;
    const currentXP = totalLogs * XP_PER_LOG;
    const currentLevel = Math.floor(currentXP / 100) + 1;
    const nextLevelXP = currentLevel * 100; // Total XP needed for NEXT level (absolute)
    const xpProgress = currentXP % 100; // XP within current level

    useEffect(() => {
        if (currentLevel > prevLevel && prevLevel !== 1) {
            setShowLevelUp(true);
        }
        setPrevLevel(currentLevel);
    }, [currentLevel, prevLevel]);

    useEffect(() => {
        const fetchData = async () => {
            const today = getTodayDateString();
            const last30Days = subDays(new Date(), 30).toISOString();

            // 1. Fetch Habits
            // Single User Mode: No auth check needed, just fetch or use generic ID if RLS disabled/open
            const { data: habitsData } = await supabase.from('habits').select('*').eq('is_archived', false);
            if (habitsData) {
                // Filter for today logic could be here or refined in query if we had backend logic.
                // For now, client side filter (Simple)
                // Note: DB `frequency_days` is int[]

                const dayOfWeek = new Date().getDay(); // 0-6
                // @ts-ignore
                const todaysHabits = habitsData.filter((h: any) => {
                    if (h.frequency_days === null) return true;
                    // @ts-ignore
                    return h.frequency_days.includes(dayOfWeek);
                });

                // @ts-ignore - type mismatch on frequency_days possibly if JSON vs Array
                setHabits(todaysHabits);
            }

            // 2. Fetch Lifestyles
            const { data: lifestylesData } = await supabase.from('lifestyles').select('*');
            if (lifestylesData) {
                // @ts-ignore
                useBanffStore.getState().setLifestyles(lifestylesData);
            }

            // 2. Fetch Logs (Total for XP)
            const { count } = await supabase.from('habit_logs').select('*', { count: 'exact', head: true });
            if (count !== null) setTotalLogs(count);

            // 3. Fetch Recent Logs (Last 30 Days)
            const { data: logsData } = await supabase
                .from('habit_logs')
                .select('*')
                .gte('log_date', last30Days)
                .order('completed_at', { ascending: false });

            if (logsData) {
                // @ts-ignore
                setRecentLogs(logsData);
                // Filter for today
                // @ts-ignore
                const todayOnly = logsData.filter((l: any) => l.log_date === today);
                setTodayLogs(todayOnly);
            }

            // 4. Fetch Metrics (Today)
            // Use SINGLE_USER_ID or assume only one user's data exists 
            const { data: metricsData } = await supabase.from('daily_metrics').select('*').eq('date', today).maybeSingle();
            if (metricsData) {
                setTodayMetrics(metricsData);
            } else {
                // Initialize if empty? Or just leave null until interaction
                setTodayMetrics({
                    id: 'temp',
                    user_id: SINGLE_USER_ID,
                    date: today,
                    mood_score: 50,
                    energy_score: 50,
                    focus_score: 50
                });
            }
        };

        fetchData();
    }, [setHabits, setTodayLogs, setRecentLogs, setTodayMetrics, setTotalLogs]);

    const completedCount = Object.keys(todayLogs).length;
    const totalRaw = habits.length;

    return (
        <div className="p-6 space-y-8 min-h-screen pb-24">
            {/* Level Up Modal */}
            <LevelUpModal level={currentLevel} show={showLevelUp} onClose={() => setShowLevelUp(false)} />

            {/* Header */}
            <header className="flex justify-between items-center">
                <div>
                    <h1 className="text-2xl font-bold bg-gradient-to-r from-emerald-400 to-teal-500 bg-clip-text text-transparent">
                        Banff.
                    </h1>
                    <p className="text-zinc-400 text-xs tracking-wider uppercase">Quantified Self</p>
                </div>
                <div className="flex items-center gap-2">
                    <Link href="/banff/chronicle" className="p-2 bg-zinc-800/50 rounded-full hover:bg-zinc-700/50 transition-colors" title="The Chronicle">
                        <FaBook className="text-emerald-400" />
                    </Link>
                    <Link href="/banff/settings" className="p-2 bg-zinc-800/50 rounded-full hover:bg-zinc-700/50 transition-colors">
                        <FaCog className="text-zinc-400" />
                    </Link>
                </div>
            </header>

            {/* XP Bar */}
            <XPBar currentXP={xpProgress} level={currentLevel} nextLevelXP={100} />

            {/* Date Display */}
            <div className="space-y-1">
                <h2 className="text-4xl font-light text-white" suppressHydrationWarning>{format(new Date(), 'EEEE')}</h2>
                <p className="text-zinc-500" suppressHydrationWarning>{format(new Date(), 'MMM d, yyyy')}</p>
            </div>

            {/* Recent Activity Table (Replaces Weekly Flow) */}
            <section className="bg-zinc-900/30 p-4 rounded-3xl border border-zinc-800/50 backdrop-blur-sm relative overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-zinc-400">Recent Activity</h3>
                </div>
                <HabitLogTable logs={recentLogs} />
            </section>

            {/* Habits Section */}
            <section className="space-y-4">
                <div className="flex justify-between items-end">
                    <h3 className="text-lg font-medium text-emerald-100/90">Today's Habits</h3>
                    <span className="text-xs text-emerald-500/80 font-mono bg-emerald-500/10 px-2 py-1 rounded-full">
                        {completedCount}/{totalRaw} Completed
                    </span>
                </div>

                <div className="space-y-6">
                    {habits.length === 0 ? (
                        <div className="text-zinc-600 text-center py-8 border border-dashed border-zinc-800 rounded-2xl">
                            No habits for today. <br />
                            <Link href="/banff/settings" className="text-emerald-500 underline">Add one?</Link>
                        </div>
                    ) : (
                        <HabitGroups habits={habits} logs={todayLogs} />
                    )}
                </div>
            </section>

            {/* Metrics Section */}
            <section className="space-y-6 pt-4">
                <h3 className="text-lg font-medium text-emerald-100/90">Daily Flow</h3>
                <div className="space-y-4 bg-zinc-900/30 p-6 rounded-3xl border border-zinc-800/50 backdrop-blur-sm">
                    <LiquidSlider
                        label="Mood"
                        value={todayMetrics?.mood_score ?? 50}
                        onChange={(v) => updateMetricOptimistic('mood_score', v)}
                        color="indigo"
                    />
                    <LiquidSlider
                        label="Energy"
                        value={todayMetrics?.energy_score ?? 50}
                        onChange={(v) => updateMetricOptimistic('energy_score', v)}
                        color="amber"
                    />
                    <LiquidSlider
                        label="Focus"
                        value={todayMetrics?.focus_score ?? 50}
                        onChange={(v) => updateMetricOptimistic('focus_score', v)}
                        color="emerald"
                    />
                </div>
            </section>

            {/* Heatmap Section */}
            <section className="pt-4">
                <h3 className="text-lg font-medium text-emerald-100/90 mb-4">Consistency</h3>
                <div className="bg-zinc-900/30 p-6 rounded-3xl border border-zinc-800/50">
                    <HabitHeatmap logs={recentLogs} />
                    {/* Data fetched and passed correctly */}
                </div>
            </section>

        </div>
    );
}
