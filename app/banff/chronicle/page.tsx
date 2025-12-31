import React from 'react';
import Link from 'next/link';
import { FaChevronLeft, FaChevronRight, FaArrowLeft } from 'react-icons/fa';
import { supabase } from '@/lib/supabaseClient'; // Ensure this client works on server (read-only anon is fine)
// @ts-ignore
import { SINGLE_USER_ID } from '../constants';
import LifeShape from './components/LifeShape';
import ConsistencyGarden from './components/ConsistencyGarden';
import CorrelationChart from './components/CorrelationChart';

// Force dynamic to ensure data is fresh on navigation
export const dynamic = 'force-dynamic';

export default async function ChroniclePage() {
    // 1. Fetch all data in parallel
    const [lifestyleRes, monthlyRes, dailyLogsRes, dailyMetricsRes] = await Promise.all([
        // A. Life Shape Data
        supabase
            .from('view_lifestyle_balance')
            .select('*')
            .eq('user_id', SINGLE_USER_ID),

        // B. Monthly Summary (for Correlation Chart)
        supabase
            .from('view_monthly_summary')
            .select('*')
            .eq('user_id', SINGLE_USER_ID)
            .order('month', { ascending: true })
            .limit(12),

        // C. Daily Habit Logs (for Consistency Garden)
        // Group by date logic is a bit heavy for client if many rows, 
        // but for 365 days * 5 habits = ~1800 rows, it's fast enough to process here.
        supabase
            .from('habit_logs')
            .select('log_date')
            .eq('user_id', SINGLE_USER_ID)
            .gte('log_date', new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString()),

        // D. Daily Metrics (for Consistency Garden tooltips)
        supabase
            .from('daily_metrics')
            .select('date, mood_score')
            .eq('user_id', SINGLE_USER_ID)
            .gte('date', new Date(new Date().setFullYear(new Date().getFullYear() - 1)).toISOString())
    ]);

    // 2. Process Data for Components

    // Life Shape
    const lifeShapeData = lifestyleRes.data || [];

    // Correlation Chart 
    // Map view columns to component props
    const correlationData = (monthlyRes.data || []).map((m: any) => ({
        name: new Date(m.month).toLocaleDateString('en-US', { month: 'short' }),
        questCount: m.total_habits_done,
        mood: Number(m.avg_mood)
    }));

    // Consistency Garden
    // Need to merge logs count and mood score by date
    // Create a map of date -> count
    const logCounts: Record<string, number> = {};
    (dailyLogsRes.data || []).forEach((l: any) => {
        const d = l.log_date;
        logCounts[d] = (logCounts[d] || 0) + 1;
    });

    // Create array merging mood
    const gardenData = Object.entries(logCounts).map(([date, count]) => {
        // Find mood
        const metric = (dailyMetricsRes.data || []).find((m: any) => m.date === date);
        return {
            date: new Date(date),
            count,
            mood: metric ? metric.mood_score : undefined
        };
    });


    return (
        <div className="min-h-screen bg-zinc-950 text-zinc-100 p-6 space-y-12 pb-24">

            {/* Header */}
            <header className="flex justify-between items-center">
                <div className="flex items-center gap-4">
                    <Link href="/banff" className="p-2 rounded-full hover:bg-zinc-800 transition-colors">
                        <FaArrowLeft className="text-zinc-500" />
                    </Link>
                    <div>
                        <h1 className="text-xl font-bold font-serif tracking-wide bg-gradient-to-r from-emerald-200 to-teal-400 bg-clip-text text-transparent">
                            The Chronicle
                        </h1>
                        <p className="text-zinc-500 text-xs uppercase tracking-wider">Year 2024</p>
                    </div>
                </div>
                <div className="flex gap-2">
                    <button className="p-2 rounded-full hover:bg-zinc-800 text-zinc-600"><FaChevronLeft /></button>
                    <button className="p-2 rounded-full hover:bg-zinc-800 text-zinc-600"><FaChevronRight /></button>
                </div>
            </header>

            {/* Section 1: Shape of You */}
            <section className="flex flex-col items-center space-y-6">
                <div className="text-center space-y-2">
                    <h2 className="text-2xl font-light font-serif text-emerald-100">Shape of You</h2>
                    <p className="text-zinc-500 text-sm max-w-xs mx-auto">
                        Your lifestyle balance visualized as a living form.
                    </p>
                </div>

                <div className="py-8">
                    <LifeShape data={lifeShapeData} width={320} height={320} />
                </div>
            </section>

            {/* Section 2: Consistency Garden */}
            <section className="space-y-4">
                <div className="flex items-end justify-between px-2">
                    <h3 className="text-lg font-medium text-emerald-100/90">Consistency Garden</h3>
                    <span className="text-xs text-emerald-500/80 font-mono">365 Days</span>
                </div>
                <div className="bg-zinc-900/40 p-4 rounded-3xl border border-zinc-800/50 backdrop-blur-sm overflow-hidden">
                    <ConsistencyGarden data={gardenData} />
                </div>
            </section>

            {/* Section 3: Correlation Discovery */}
            <section className="space-y-4">
                <div className="flex items-end justify-between px-2">
                    <h3 className="text-lg font-medium text-emerald-100/90">Correlation Discovery</h3>
                    <span className="text-xs text-zinc-500">Monthly Trends</span>
                </div>
                <div className="bg-zinc-900/40 p-4 rounded-3xl border border-zinc-800/50 backdrop-blur-sm">
                    <CorrelationChart data={correlationData} />
                    <div className="mt-4 text-center">
                        <p className="text-zinc-400 text-xs italic">
                            "Higher activity levels in <strong className="text-emerald-400">March</strong> correlated with better mood."
                        </p>
                    </div>
                </div>
            </section>

        </div>
    );
}
