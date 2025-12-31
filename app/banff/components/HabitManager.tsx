'use client';

import React from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { FaTrash, FaArchive, FaBell, FaBellSlash } from 'react-icons/fa';
import { Habit } from '@/types/banff';
import { useBanffStore } from '@/store/useBanffStore';
import { supabase } from '@/lib/supabaseClient';

interface HabitManagerProps {
    habits: Habit[];
}

export default function HabitManager({ habits }: HabitManagerProps) {
    // Group by lifestyle (mock logic for now if lifestyle_id is missing or generic)
    // For MVP, just list flat

    return (
        <div className="space-y-3">
            {habits.length === 0 && <div className="text-zinc-500 text-sm text-center py-4">No active quests found.</div>}

            {habits.map(habit => (
                <SwipeableHabitRow key={habit.id} habit={habit} />
            ))}
        </div>
    );
}

function SwipeableHabitRow({ habit }: { habit: Habit }) {
    const deleteHabitInStore = useBanffStore(state => state.deleteHabit);
    // const [isNotify, setIsNotify] = React.useState(true); // Mock

    const handleDelete = async () => {
        if (!confirm(`Delete quest "${habit.title}"?`)) return;

        deleteHabitInStore(habit.id);
        await supabase.from('habits').delete().eq('id', habit.id);
    };

    // Swipe logic requires more complex setup with framer-motion drag
    // For MVP reliability, let's use a revealed actionable row or simple buttons first
    // but user asked for "Swipe". Let's try a simple drag-to-reveal.

    const x = useMotionValue(0);
    const backgroundOpacity = useTransform(x, [-100, 0], [1, 0]);

    return (
        <div className="relative overflow-hidden rounded-xl bg-red-900/20 group">
            {/* Background Actions (Delete) */}
            <motion.div
                style={{ opacity: backgroundOpacity }}
                className="absolute inset-y-0 right-0 w-24 flex items-center justify-center bg-red-500/20 text-red-400 z-0"
            >
                <FaTrash />
            </motion.div>

            <motion.div
                drag="x"
                dragConstraints={{ left: -100, right: 0 }}
                style={{ x }}
                className="relative z-10 bg-zinc-900 border border-zinc-800 p-4 rounded-xl flex justify-between items-center group-active:cursor-grabbing cursor-grab touch-pan-y"
                onDragEnd={(e, { offset, velocity }) => {
                    if (offset.x < -50) {
                        handleDelete();
                    }
                }}
            >
                <div className="flex items-center gap-3">
                    <div className="w-2 h-8 rounded-full bg-zinc-800" /> {/* Lifestyle Color Indicator PArholder */}
                    <div>
                        <h4 className="font-bold text-zinc-200">{habit.title}</h4>
                        <p className="text-[10px] text-zinc-500">{habit.frequency_days ? 'Specific Days' : 'Every Day'}</p>
                    </div>
                </div>

                {/* Toggle Notification (Mock) */}
                <button className="text-zinc-600 hover:text-zinc-400 transition-colors">
                    <FaBellSlash />
                </button>
            </motion.div>
        </div>
    );
}
