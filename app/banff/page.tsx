'use client';
import Link from 'next/link';
import React, { useEffect } from 'react';
import { FaCog, FaBook } from 'react-icons/fa';
import { format, subDays } from 'date-fns';
import { supabase } from '@/lib/supabaseClient';
import { useBanffStore } from '@/store/useBanffStore';
import HabitGroups from './components/HabitGroups';
import { getTodayDateString } from '@/utils/date';

import HabitHeatmap from './components/HabitHeatmap';
// import HabitLogTable from './components/HabitLogTable'; // Deprecated - Removed
import TopActivitiesTable from './components/TopActivitiesTable';
import SoulCollection from './components/SoulCollection';
import WeeklyChart from './components/WeeklyChart';
import HubermanFlow from './components/HubermanFlow';
import XPBar from './components/XPBar';
import VaultWidget from './components/VaultWidget';
import LevelUpModal from './components/LevelUpModal';
import { SINGLE_USER_ID } from './constants';

export default function BanffPage() {
    const { habits, todayLogs, recentLogs, todayMetrics, totalLogs, setHabits, setTodayLogs, setRecentLogs, setTodayMetrics, setTotalLogs, updateMetricOptimistic, setProtocolActivities } = useBanffStore();
    const [showLevelUp, setShowLevelUp] = React.useState(false);
    const [prevLevel, setPrevLevel] = React.useState(1);
    const [weeklyMetrics, setWeeklyMetrics] = React.useState<any[]>([]);

    // XP Logic
    // 1 Log = 10 XP
    // Level N requires N * 100 XP (Linear scaling for MVP)
    const XP_PER_LOG = 10;
    const currentXP = totalLogs * XP_PER_LOG;
    const currentLevel = Math.floor(currentXP / 100) + 1;

    // Derived XP progress
    const xpProgress = currentXP % 100;

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
            const last7Days = subDays(new Date(), 6).toISOString(); // 7 days inclusive

            // 1. Fetch Habits
            const { data: habitsData } = await supabase.from('habits').select('*').eq('is_archived', false);
            if (habitsData) {
                // @ts-ignore
                const dayOfWeek = new Date().getDay(); // 0-6
                const todaysHabits = habitsData.filter((h: any) => {
                    if (h.frequency_days === null) return true;
                    return h.frequency_days.includes(dayOfWeek);
                });
                // @ts-ignore
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
            const { data: authData } = await supabase.auth.getUser();
            const userId = authData?.user?.id || SINGLE_USER_ID;

            const { data: metricsData } = await supabase.from('daily_metrics').select('*').eq('date', today).maybeSingle();
            if (metricsData) {
                setTodayMetrics(metricsData);
            } else {
                setTodayMetrics({
                    id: 'temp',
                    user_id: userId,
                    date: today,
                    mood_score: 0,
                    energy_score: 0,
                    focus_score: 0
                });
            }

            // 5. Fetch Weekly Metrics for Chart
            const { data: weeklyData } = await supabase
                .from('daily_metrics')
                .select('*')
                .gte('date', last7Days)
                .order('date', { ascending: true });

            if (weeklyData) {
                const formatted = weeklyData.map((d: any) => ({
                    date: format(new Date(d.date), 'EEE'),
                    mood: d.mood_score || 0,
                    energy: d.energy_score || 0,
                    focus: d.focus_score || 0
                }));
                setWeeklyMetrics(formatted);
            }

            // 6. Calculate Vault Balance
            // Fetch all logs with earned_value > 0 (or all to be safe) - strictly we need sum.
            // For MVP we might just fetch 'earned_value' column for all logs?
            // If user has 10k logs, this is heavy. 
            // Alternative: RPC 'get_vault_balance'. But we can't create RPC easily.
            // Let's try fetching just the column.
            const { data: allLogsValue } = await supabase.from('habit_logs').select('earned_value');
            const { data: allTxs } = await supabase.from('vault_transactions').select('*');

            if (allLogsValue && allTxs) {
                const logsSum = allLogsValue.reduce((sum, l: any) => sum + (l.earned_value || 0), 0);
                const txsSum = allTxs.reduce((sum, t: any) => sum + (t.amount || 0), 0);

                useBanffStore.setState({
                    vaultBalance: logsSum + txsSum,
                    vaultTransactions: allTxs
                });
            }

            // 7. Fetch Protocol Activities
            const { data: protocolData } = await supabase.from('protocol_activities').select('*').order('created_at', { ascending: true });
            if (protocolData) {
                // @ts-ignore
                setProtocolActivities(protocolData);
            }
        };

        fetchData();

        // Subscribe to changes? For now, refresh on focus or rely on optimistic.
    }, [setHabits, setTodayLogs, setRecentLogs, setTodayMetrics, setTotalLogs]);

    const completedCount = Object.keys(todayLogs).length;
    const totalRaw = habits.length;

    const handleHubermanUpdate = (key: string, value: number, noteObject?: any) => {
        // Update Optimistic Store
        updateMetricOptimistic(key as any, value);

        if (noteObject) {
            updateMetricOptimistic('note', noteObject);
        }
    };

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
                    <p className="text-zinc-400 text-xs tracking-wider uppercase">การพัฒนาตนเอง</p>
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

            {/* Vault Widget */}
            <div className="pt-2">
                <VaultWidget />
            </div>

            {/* Date Display */}
            <div className="space-y-1">
                <h2 className="text-4xl font-light text-white" suppressHydrationWarning>{format(new Date(), 'EEEE')}</h2>
                <p className="text-zinc-500" suppressHydrationWarning>{format(new Date(), 'MMM d, yyyy')}</p>
            </div>

            {/* Weekly Flow Chart */}
            <section className="bg-zinc-900/30 p-4 rounded-3xl border border-zinc-800/50 backdrop-blur-sm relative overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-zinc-400">สถิติรายสัปดาห์</h3>
                </div>
                <WeeklyChart data={weeklyMetrics} />
            </section>

            {/* Recent Souls */}
            <section className="bg-zinc-900/30 p-4 rounded-3xl border border-zinc-800/50 backdrop-blur-sm relative overflow-hidden">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-sm font-medium text-zinc-400">Soul ที่สะสมล่าสุด</h3>
                </div>
                {/* Top Activities Table (Replaces SoulCollection) */}
                <TopActivitiesTable logs={recentLogs} habits={habits} lifestyles={useBanffStore.getState().lifestyles} />
            </section>

            {/* Habits Section */}
            <section className="space-y-4">
                <div className="flex justify-between items-end">
                    <h3 className="text-lg font-medium text-emerald-100/90">นิสัยที่ต้องทำวันนี้</h3>
                    <span className="text-xs text-emerald-500/80 font-mono bg-emerald-500/10 px-2 py-1 rounded-full">
                        {completedCount}/{totalRaw} สำเร็จ
                    </span>
                </div>

                <div className="space-y-6">
                    {habits.length === 0 ? (
                        <div className="text-zinc-600 text-center py-8 border border-dashed border-zinc-800 rounded-2xl">
                            ไม่มีนิสัยที่ต้องทำสำหรับวันนี้ <br />
                            <Link href="/banff/settings" className="text-emerald-500 underline">เพิ่มนิสัยใหม่?</Link>
                        </div>
                    ) : (
                        <HabitGroups habits={habits} logs={todayLogs} />
                    )}
                </div>
            </section>

            {/* Metrics Section (Huberman Flow) */}
            <section className="space-y-6 pt-4">
                <h3 className="text-lg font-medium text-emerald-100/90">กิจวัตรประจำวัน</h3>
                <HubermanFlow metrics={todayMetrics} onUpdate={handleHubermanUpdate} />
            </section>

            {/* Heatmap Section */}
            <section className="pt-4">
                <h3 className="text-lg font-medium text-emerald-100/90 mb-4">ความสม่ำเสมอ</h3>
                <div className="bg-zinc-900/30 p-6 rounded-3xl border border-zinc-800/50">
                    <HabitHeatmap logs={recentLogs} />
                </div>
            </section>

        </div>
    );
}
