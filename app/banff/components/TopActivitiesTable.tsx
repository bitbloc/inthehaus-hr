'use client';

import React, { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Habit, HabitLog, Lifestyle } from '@/types/banff';
import { FaTrophy, FaMedal, FaHeart, FaBrain, FaWallet, FaLeaf, FaLayerGroup, FaDumbbell, FaGamepad, FaMoon, FaWater, FaSun, FaStar } from 'react-icons/fa';

// Icon mapping (Duplicated for independence, ideally shared)
const ICONS: Record<string, React.ElementType> = {
    heart: FaHeart,
    brain: FaBrain,
    wallet: FaWallet,
    leaf: FaLeaf,
    dumbbell: FaDumbbell,
    gamepad: FaGamepad,
    moon: FaMoon,
    water: FaWater,
    sun: FaSun,
    star: FaStar,
};

interface TopActivitiesTableProps {
    logs: HabitLog[];
    habits: Habit[];
    lifestyles: Lifestyle[];
}

export default function TopActivitiesTable({ logs, habits, lifestyles }: TopActivitiesTableProps) {

    // 1. Calculate Frequency & Rank
    const rankedData = useMemo(() => {
        const counts: Record<string, number> = {};

        logs.forEach(log => {
            counts[log.habit_id] = (counts[log.habit_id] || 0) + 1;
        });

        const sorted = Object.entries(counts)
            .map(([habitId, count]) => {
                const habit = habits.find(h => h.id === habitId);
                const lifestyle = habit ? lifestyles.find(l => l.id === habit.lifestyle_id) : null;
                return {
                    id: habitId,
                    title: habit?.title || 'Unknown Habit',
                    count,
                    lifestyleName: lifestyle?.name || 'Uncategorized',
                    lifestyleColor: lifestyle?.color || 'bg-zinc-500', // Expected 'bg-emerald-500' format
                    lifestyleIcon: lifestyle ? ICONS[lifestyle.icon] : FaLayerGroup
                };
            })
            .sort((a, b) => b.count - a.count)
            .slice(0, 5); // Top 5

        return sorted;
    }, [logs, habits, lifestyles]);

    // Helper for Rank Icons
    const getRankIcon = (index: number) => {
        if (index === 0) return <FaTrophy className="text-amber-400 drop-shadow-md text-lg" />;
        if (index === 1) return <FaMedal className="text-zinc-300 drop-shadow-md text-lg" />;
        if (index === 2) return <FaMedal className="text-amber-700 drop-shadow-md text-lg" />;
        return <span className="text-zinc-600 font-mono font-bold">#{index + 1}</span>;
    };

    // Helper for Color Style
    const getColorClasses = (colorClass: string) => {
        const base = colorClass.split('-')[1] || 'zinc';
        return {
            bg: `bg-${base}-500/10`,
            text: `text-${base}-400`,
            border: `border-${base}-500/20`,
            ring: `ring-${base}-500/20`
        };
    };

    if (rankedData.length === 0) {
        return (
            <div className="p-8 text-center border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
                <p className="text-zinc-500 text-sm">No activity data yet.</p>
            </div>
        );
    }

    const maxCount = rankedData[0].count;

    return (
        <div className="space-y-4">
            <h2 className="text-sm font-bold text-zinc-500 uppercase tracking-widest pl-2">Top Performance (30 Days)</h2>

            <div className="bg-zinc-900/40 backdrop-blur-md border border-zinc-800/50 rounded-3xl overflow-hidden shadow-xl">
                <table className="w-full text-left text-sm">
                    <thead className="bg-zinc-900/80 text-zinc-500 text-[10px] uppercase font-bold tracking-wider">
                        <tr>
                            <th className="py-4 pl-6 w-16 text-center">Rank</th>
                            <th className="py-4">Activity</th>
                            <th className="py-4 text-center w-16">Soul</th>
                            <th className="py-4 pr-6 text-right">Count</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-800/50">
                        {rankedData.map((item, index) => {
                            const colors = getColorClasses(item.lifestyleColor);
                            const LifestyleIcon = item.lifestyleIcon;
                            return (
                                <motion.tr
                                    key={item.id}
                                    initial={{ opacity: 0, x: -10 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: index * 0.1 }}
                                    className="group hover:bg-white/5 transition-colors"
                                >
                                    <td className="py-4 pl-6 text-center">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-full bg-zinc-800/50 group-hover:scale-110 transition-transform">
                                            {getRankIcon(index)}
                                        </div>
                                    </td>
                                    <td className="py-4 font-medium text-zinc-200">
                                        {item.title}
                                    </td>
                                    <td className="py-4 text-center">
                                        <div
                                            className={`mx-auto w-8 h-8 rounded-full flex items-center justify-center border ${colors.bg} ${colors.border} ${colors.text} hover:scale-110 transition-transform cursor-help`}
                                            title={item.lifestyleName}
                                        >
                                            {LifestyleIcon ? <LifestyleIcon className="text-lg" /> : <div className={`w-3 h-3 rounded-full bg-current opacity-80`} />}
                                        </div>
                                    </td>
                                    <td className="py-4 pr-6">
                                        <div className="flex flex-col items-end gap-1">
                                            <span className="font-mono font-bold text-white text-base">{item.count}</span>
                                            {/* Activity Bar relative to max */}
                                            <div className="w-24 h-1 bg-zinc-800 rounded-full overflow-hidden">
                                                <motion.div
                                                    className="h-full bg-emerald-500"
                                                    initial={{ width: 0 }}
                                                    animate={{ width: `${(item.count / maxCount) * 100}%` }}
                                                    transition={{ duration: 1, delay: 0.5 + (index * 0.1) }}
                                                />
                                            </div>
                                        </div>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
