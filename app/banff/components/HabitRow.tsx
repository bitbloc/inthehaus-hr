'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaCheck, FaEllipsisV, FaTrash, FaPen, FaClock } from 'react-icons/fa';
import { Habit, HabitLog } from '@/types/banff';
import { useBanffStore } from '@/store/useBanffStore';
import { supabase } from '@/lib/supabaseClient';
import PomodoroModal from './PomodoroModal';
import HabitEditModal from './HabitEditModal';

interface HabitRowProps {
    habit: Habit;
    log?: HabitLog;
}

export default function HabitRow({ habit, log }: HabitRowProps) {
    const toggleHabit = useBanffStore(state => state.toggleHabitOptimistic);
    const deleteHabitInStore = useBanffStore(state => state.deleteHabit);

    // UI State
    const [showMenu, setShowMenu] = React.useState(false);
    const [showPomodoro, setShowPomodoro] = React.useState(false);
    const [showEdit, setShowEdit] = React.useState(false);

    const isCompleted = !!log;

    const handleClick = async () => {
        // Toggle Logic (Only when clicking the main row body)
        toggleHabit(habit.id);

        if (!isCompleted) {
            try {
                await fetch('/api/banff/streak', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        habit_id: habit.id,
                        user_id: habit.user_id,
                        date: new Date().toISOString()
                    })
                });
            } catch (e) {
                console.error("Streak update failed", e);
            }
        }
    };

    const handleDelete = async (e: React.MouseEvent) => {
        e.stopPropagation(); // Prevent toggle
        if (!confirm("Are you sure you want to delete this habit?")) return;

        deleteHabitInStore(habit.id); // Optimistic

        const { error } = await supabase
            .from('habits')
            .delete()
            .eq('id', habit.id);

        if (error) {
            alert("Failed to delete from DB");
            // Optionally rollback store here if needed
        }
    };

    const handleEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowMenu(false);
        setShowEdit(true);
    };

    const handlePomodoro = (e: React.MouseEvent) => {
        e.stopPropagation();
        setShowMenu(false);
        setShowPomodoro(true);
    };

    return (
        <>
            <motion.div
                layoutId={`habit-${habit.id}`}
                className={`
        relative overflow-hidden group
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
                    {/* Main Click Area */}
                    <div className="flex items-center gap-4 flex-1 cursor-pointer" onClick={handleClick}>
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

                    {/* Actions Menu */}
                    <div className="relative ml-2">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                            className="text-zinc-600 hover:text-zinc-400 p-2 rounded-full hover:bg-zinc-800 transition-colors"
                        >
                            <FaEllipsisV />
                        </button>

                        <AnimatePresence>
                            {showMenu && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 10 }}
                                    animate={{ opacity: 1, scale: 1, y: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                    className="absolute right-0 top-8 z-50 bg-zinc-900 border border-zinc-800 rounded-xl shadow-xl w-40 overflow-hidden"
                                >
                                    <div className="flex flex-col text-sm">
                                        <button onClick={handlePomodoro} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 text-zinc-300 text-left">
                                            <FaClock className="text-indigo-400" /> Focus
                                        </button>
                                        <button onClick={handleEdit} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 text-zinc-300 text-left">
                                            <FaPen className="text-amber-400" /> Edit
                                        </button>
                                        <button onClick={handleDelete} className="flex items-center gap-3 px-4 py-3 hover:bg-red-900/20 text-red-400 text-left">
                                            <FaTrash /> Delete
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                </div>
            </motion.div>

            {/* Modals */}
            <PomodoroModal
                isOpen={showPomodoro}
                onClose={() => setShowPomodoro(false)}
                habitTitle={habit.title}
                onComplete={() => {
                    // Optional: Mark done?
                    // toggleHabit(habit.id);
                }}
            />
            <HabitEditModal
                isOpen={showEdit}
                onClose={() => setShowEdit(false)}
                habit={habit}
            />
        </>
    );
}
