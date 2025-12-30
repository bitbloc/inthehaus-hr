'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaCheck } from 'react-icons/fa';
import { Habit, HabitLog } from '@/types/banff';
import { useBanffStore } from '@/store/useBanffStore';
// import useSound from 'use-sound'; // Add later if installed

interface HabitRowProps {
    habit: Habit;
    log?: HabitLog;
}

export default function HabitRow({ habit, log }: HabitRowProps) {
    const toggleHabit = useBanffStore(state => state.toggleHabitOptimistic);
    // const [play] = useSound('/pop.mp3'); 

    const isCompleted = !!log;

    const handleClick = async () => {
        // if (!isCompleted) play();
        toggleHabit(habit.id);

        // Call Streak API (Fire and forget, or handle optimistic rollback on error)
        if (!isCompleted) { // Only calculate streak on Completion, not un-check
            try {
                await fetch('/api/banff/streak', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        habit_id: habit.id,
                        user_id: habit.user_id, // We need user_id in Habit interface
                        date: new Date().toISOString() // or getTodayDateString
                    })
                });
            } catch (e) {
                console.error("Streak update failed", e);
            }
        } else {
            // Handle un-check logic (decrement streak?) - Optional for MVP
        }
    };

    return (
        <motion.div
            layoutId={`habit-${habit.id}`}
            onClick={handleClick}
            className={`
        relative overflow-hidden cursor-pointer group
        p-4 rounded-2xl border transition-all duration-300
        ${isCompleted
                    ? 'bg-emerald-900/20 border-emerald-500/30'
                    : 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                }
      `}
        >
            {/* Liquid Fill Animation */}
            <AnimatePresence>
                {isCompleted && (
                    <motion.div
                        initial={{ width: '0%', opacity: 0 }}
                        animate={{ width: '100%', opacity: 1 }}
                        exit={{ width: '0%', opacity: 0 }}
                        transition={{ type: 'spring', damping: 20, stiffness: 100 }}
                        className="absolute inset-0 bg-emerald-500/10 z-0"
                    />
                )}
            </AnimatePresence>

            <div className="relative z-10 flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <div className={`
            w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors
            ${isCompleted ? 'bg-emerald-500 border-emerald-500' : 'border-zinc-600 group-hover:border-emerald-500'}
          `}>
                        <motion.div
                            initial={false}
                            animate={{ scale: isCompleted ? 1 : 0 }}
                            transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                        >
                            <FaCheck className="text-black text-[10px]" />
                        </motion.div>
                    </div>

                    <div className="flex flex-col">
                        <span className={`text-sm font-medium transition-colors ${isCompleted ? 'text-emerald-100 line-through decoration-emerald-500/50' : 'text-zinc-200'}`}>
                            {habit.title}
                        </span>
                        {habit.current_streak > 0 && (
                            <span className="text-[10px] text-zinc-500">
                                🔥 {habit.current_streak} day streak
                            </span>
                        )}
                    </div>
                </div>
            </div>
        </motion.div>
    );
}
