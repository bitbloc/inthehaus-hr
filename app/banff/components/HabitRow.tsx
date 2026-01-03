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

// Helper to extract base color safely
const getBaseColor = (colorClass?: string) => {
    if (!colorClass) return 'emerald';
    // Expects 'bg-emerald-400'
    const parts = colorClass.split('-');
    if (parts.length >= 2) return parts[1];
    return 'emerald';
};

interface HabitRowProps {
    habit: Habit;
    log?: HabitLog;
    color?: string; // Expects 'bg-emerald-400' format or similar
}

export default function HabitRow({ habit, log, color }: HabitRowProps) {
    const toggleHabit = useBanffStore(state => state.toggleHabitOptimistic);
    const deleteHabitInStore = useBanffStore(state => state.deleteHabit);

    // UI State
    const [showMenu, setShowMenu] = React.useState(false);
    const [showPomodoro, setShowPomodoro] = React.useState(false);
    const [showEdit, setShowEdit] = React.useState(false);

    const isCompleted = !!log;
    const baseColor = getBaseColor(color);

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
                style={{ zIndex: showMenu ? 50 : 1 }}
                className={`
        relative group
        rounded-3xl border transition-all duration-500
        ${isCompleted
                        ? `bg-${baseColor}-500/10 border-${baseColor}-500/30`
                        : 'bg-white/5 border-white/5 hover:border-white/10 hover:bg-white/10'
                    }
        backdrop-blur-md shadow-lg
      `}
            >
                {/* Clipped Background Layer for Liquid/Corner effects */}
                <div className="absolute inset-0 overflow-hidden rounded-3xl z-0 pointer-events-none">
                    {/* Liquid Fill Animation (Subtle Background Flow) */}
                    <AnimatePresence>
                        {isCompleted && (
                            <motion.div
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className={`absolute inset-0 bg-gradient-to-r from-${baseColor}-500/10 to-${baseColor}-600/10 z-0`}
                            />
                        )}
                    </AnimatePresence>
                </div>

                {/* Content Container */}
                <div className="relative z-10 p-4 flex items-center justify-between">
                    {/* Main Click Area */}
                    <div
                        className={`flex items-center gap-5 flex-1 transition-colors ${isCompleted ? 'cursor-default opacity-80' : 'cursor-pointer'}`}
                        onClick={() => !isCompleted && handleClick()}
                    >
                        {/* Interactive Checkbox */}
                        <div className={`
                            relative w-8 h-8 rounded-full flex items-center justify-center transition-all duration-300
                            ${isCompleted
                                ? `bg-gradient-to-br from-${baseColor}-400 to-${baseColor}-500 shadow-[0_0_12px_rgba(255,255,255,0.3)] scale-110` // Simplified shadow to avoid color parsing
                                : 'bg-zinc-800/50 border border-zinc-600 group-hover:border-emerald-500/50'
                            }
                        `}>
                            <motion.div
                                initial={false}
                                animate={{ scale: isCompleted ? 1 : 0, rotate: isCompleted ? 0 : -90 }}
                                transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                            >
                                <FaCheck className="text-white text-sm drop-shadow-md" />
                            </motion.div>
                        </div>

                        {/* Money Float Animation */}
                        <AnimatePresence>
                            {isCompleted && habit.money_value && habit.money_value > 0 && (
                                <motion.div
                                    initial={{ opacity: 0, y: 10, scale: 0.5 }}
                                    animate={{ opacity: 1, y: -20, scale: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                    className="absolute left-4 top-0 -mt-2 z-50 pointer-events-none"
                                >
                                    <span className="text-emerald-400 font-bold font-mono text-lg drop-shadow-md">
                                        +฿{habit.money_value}
                                    </span>
                                </motion.div>
                            )}
                        </AnimatePresence>

                        <div className="flex flex-col">
                            <span className={`text-base font-medium transition-all duration-300 ${isCompleted ? `text-${baseColor}-100/70 line-through decoration-${baseColor}-500/50` : 'text-zinc-100 group-hover:text-white'}`}>
                                {habit.title}
                            </span>
                            {habit.current_streak > 0 && (
                                <span className="text-[10px] text-zinc-400 font-medium tracking-wide">
                                    🔥 {habit.current_streak} DAY STREAK
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Actions Menu */}
                    <div className="relative ml-2 z-20">
                        <button
                            onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
                            className="text-zinc-500 hover:text-white p-2 rounded-full hover:bg-white/10 transition-colors"
                        >
                            <FaEllipsisV />
                        </button>

                        <AnimatePresence>
                            {showMenu && (
                                <motion.div
                                    initial={{ opacity: 0, scale: 0.9, y: 10, x: 0 }}
                                    animate={{ opacity: 1, scale: 1, y: 0, x: 0 }}
                                    exit={{ opacity: 0, scale: 0.9, y: 10 }}
                                    className="absolute right-0 top-full mt-2 z-50 bg-zinc-900/95 backdrop-blur-xl border border-zinc-700/50 rounded-2xl shadow-2xl w-48 overflow-hidden py-1 ring-1 ring-black/50 origin-top-right"
                                    style={{ zIndex: 100 }} // Force high Z
                                >
                                    <div className="flex flex-col text-sm">
                                        <button onClick={handlePomodoro} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 text-zinc-300 text-left">
                                            <FaClock className="text-indigo-400" /> Focus
                                        </button>
                                        <button onClick={handleEdit} className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 text-zinc-300 text-left">
                                            <FaPen className="text-amber-400" /> Edit
                                        </button>

                                        {/* Undo Option if Completed */}
                                        {isCompleted && (
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    toggleHabit(habit.id); // Toggle works as undo if logic handles it
                                                    setShowMenu(false);
                                                }}
                                                className="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800 text-zinc-300 text-left border-t border-zinc-800"
                                            >
                                                <FaCheck className="text-zinc-500" /> Undo Check-in
                                            </button>
                                        )}

                                        <button onClick={handleDelete} className="flex items-center gap-3 px-4 py-3 hover:bg-red-900/20 text-red-400 text-left border-t border-zinc-800">
                                            <FaTrash /> Delete Habit
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
                    if (!isCompleted) toggleHabit(habit.id);
                    setShowPomodoro(false);
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
