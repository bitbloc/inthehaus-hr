'use client';

import Link from 'next/link';
import HabitForm from '../components/HabitForm';
import LifestyleGrid from '../components/LifestyleGrid';
import HabitManager from '../components/HabitManager';
import ProfileCard from '../components/ProfileCard';
import { useBanffStore } from '@/store/useBanffStore';

export default function BanffSettingsPage() {
    const { habits, totalLogs, lifestyles } = useBanffStore();

    // XP Logic Reused (Should ideally be in a hook/helper)
    const XP_PER_LOG = 10;
    const currentXP = totalLogs * XP_PER_LOG;
    const currentLevel = Math.floor(currentXP / 100) + 1;
    const xpWithinLevel = currentXP % 100;

    return (
        <div className="p-6 space-y-8 min-h-screen pb-24">
            <header className="flex items-center gap-4">
                <Link href="/banff" className="p-2 -ml-2 text-zinc-400 hover:text-white transition-colors">
                    ← Back
                </Link>
                <h1 className="text-xl font-bold hidden">Settings</h1>
            </header>

            {/* Account & System */}
            <ProfileCard level={currentLevel} currentXP={xpWithinLevel} nextLevelXP={100} />

            {/* Lifestyle Manager */}
            <section>
                <div className="flex justify-between items-end mb-4">
                    <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest">Soul / Lifestyles</h2>
                    <span className="text-[10px] text-zinc-600 bg-zinc-900 px-2 py-1 rounded">Drag to Reorder</span>
                </div>
                <LifestyleGrid />
            </section>

            {/* Active Quests */}
            <section>
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">Active Quests</h2>
                <HabitManager habits={habits} />
            </section>

            {/* Create New */}
            <section>
                <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest mb-4">New Contract</h2>
                <HabitForm />
            </section>
        </div>
    );
}
