'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useBanffStore } from '@/store/useBanffStore';
import { Habit, HabitLog } from '@/types/banff';
import HabitRow from './HabitRow';
import { FaHeart, FaBrain, FaWallet, FaLeaf, FaLayerGroup, FaDumbbell, FaGamepad, FaMoon, FaWater, FaSun, FaStar } from 'react-icons/fa';

interface HabitGroupsProps {
    habits: Habit[];
    logs: Record<string, HabitLog>;
}

// Icon mapping (should ideally be shared or dynamic)
const ICONS: Record<string, React.ReactNode> = {
    heart: <FaHeart />,
    brain: <FaBrain />,
    wallet: <FaWallet />,
    leaf: <FaLeaf />,
    dumbbell: <FaDumbbell />,
    gamepad: <FaGamepad />,
    moon: <FaMoon />,
    water: <FaWater />,
    sun: <FaSun />,
    star: <FaStar />,
};

export default function HabitGroups({ habits, logs }: HabitGroupsProps) {
    const lifestyles = useBanffStore(state => state.lifestyles);
    const selectedLifestyleId = useBanffStore(state => state.selectedLifestyleId);

    // Group habits by lifestyle_id
    const groupedHabits = React.useMemo(() => {
        const groups: Record<string, Habit[]> = {};
        habits.forEach(habit => {
            const lid = habit.lifestyle_id || 'uncategorized';
            if (!groups[lid]) groups[lid] = [];
            groups[lid].push(habit);
        });
        return groups;
    }, [habits]);

    // Filter Lifestyles based on selection
    const visibleLifestyles = React.useMemo(() => {
        if (selectedLifestyleId) {
            return lifestyles.filter(l => l.id === selectedLifestyleId);
        }
        return lifestyles;
    }, [lifestyles, selectedLifestyleId]);

    // Check if we should show uncategorized
    const showUncategorized = !selectedLifestyleId && groupedHabits['uncategorized'] && groupedHabits['uncategorized'].length > 0;

    return (
        <div className="space-y-6">
            <AnimatePresence mode="popLayout">
                {visibleLifestyles.map(lifestyle => {
                    const lifestyleHabits = groupedHabits[lifestyle.id];
                    if (!lifestyleHabits || lifestyleHabits.length === 0) return null;

                    const allCompleted = lifestyleHabits.every(h => !!logs[h.id]);

                    return (
                        <motion.div
                            key={lifestyle.id}
                            layoutId={`group-${lifestyle.id}`}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            className="space-y-3"
                        >
                            {/* Header */}
                            <div className="flex items-center gap-3 px-1">
                                <div className={`
                                    p-2 rounded-xl text-white shadow-lg
                                    bg-gradient-to-br ${getGradientFromColor(lifestyle.color)}
                                `}>
                                    {ICONS[lifestyle.icon] || <FaLayerGroup />}
                                </div>
                                <div>
                                    <h3 className="text-zinc-200 font-bold text-sm tracking-wide">{lifestyle.name}</h3>
                                    <p className="text-[10px] text-zinc-500 font-mono">
                                        {lifestyleHabits.filter(h => logs[h.id]).length}/{lifestyleHabits.length} DONE
                                    </p>
                                </div>
                                {/* Line decoration */}
                                <div className="h-px flex-1 bg-gradient-to-r from-zinc-800 to-transparent ml-4" />
                            </div>

                            {/* Habits List */}
                            <div className="grid gap-3">
                                {lifestyleHabits.map(habit => (
                                    <HabitRow key={habit.id} habit={habit} log={logs[habit.id]} />
                                ))}
                            </div>
                        </motion.div>
                    );
                })}

                {/* Handle Uncategorized */}
                {showUncategorized && (
                    <motion.div
                        key="uncategorized"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="space-y-3 pt-4 border-t border-zinc-800/50"
                    >
                        <div className="flex items-center gap-3 px-1 opacity-60">
                            <div className="p-2 rounded-xl bg-zinc-800 text-zinc-400">
                                <FaLayerGroup />
                            </div>
                            <h3 className="text-zinc-400 font-bold text-sm">Others</h3>
                        </div>
                        <div className="grid gap-3">
                            {groupedHabits['uncategorized'].map(habit => (
                                <HabitRow key={habit.id} habit={habit} log={logs[habit.id]} />
                            ))}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Empty State for Filter */}
            {selectedLifestyleId && groupedHabits[selectedLifestyleId]?.length === 0 && (
                <div className="text-center py-12 opacity-50">
                    <p className="text-sm text-zinc-500">No active quests in this Soul.</p>
                </div>
            )}
        </div>
    );
}

// Helper to map color names (e.g., 'bg-red-500') to gradients
// Assuming 'color' in lifestyle corresponds to tailwind classes or similar
function getGradientFromColor(colorClass: string): string {
    // Very naive mapping based on expected inputs like 'bg-red-500' or just 'red'
    // If the input is 'bg-emerald-500', we want 'from-emerald-500 to-emerald-600'

    // Extract color name if possible
    let base = 'emerald';
    if (!colorClass) return `from-emerald-500 to-emerald-600`;

    if (colorClass.includes('red')) base = 'red';
    else if (colorClass.includes('blue')) base = 'blue';
    else if (colorClass.includes('indigo')) base = 'indigo';
    else if (colorClass.includes('purple')) base = 'purple';
    else if (colorClass.includes('pink')) base = 'pink';
    else if (colorClass.includes('orange')) base = 'orange';
    else if (colorClass.includes('amber')) base = 'amber';
    else if (colorClass.includes('yellow')) base = 'yellow';
    else if (colorClass.includes('lime')) base = 'lime';
    else if (colorClass.includes('green')) base = 'green';
    else if (colorClass.includes('teal')) base = 'teal';
    else if (colorClass.includes('cyan')) base = 'cyan';
    else if (colorClass.includes('sky')) base = 'sky';
    else if (colorClass.includes('violet')) base = 'violet';
    else if (colorClass.includes('fuchsia')) base = 'fuchsia';
    else if (colorClass.includes('rose')) base = 'rose';

    return `from-${base}-500 to-${base}-600`;
}
