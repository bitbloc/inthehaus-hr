'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaTimes, FaSave } from 'react-icons/fa';
import { supabase } from '@/lib/supabaseClient';
import { useBanffStore } from '@/store/useBanffStore';
import { Habit } from '@/types/banff';
import DaySelector from './DaySelector';

interface HabitEditModalProps {
    habit: Habit;
    isOpen: boolean;
    onClose: () => void;
}

export default function HabitEditModal({ habit, isOpen, onClose }: HabitEditModalProps) {
    const [title, setTitle] = useState(habit.title);
    const [frequencyDays, setFrequencyDays] = useState<number[] | null>(habit.frequency_days);
    const [loading, setLoading] = useState(false);

    const updateHabitInStore = useBanffStore(state => state.updateHabit);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const updates = {
                title,
                frequency_days: frequencyDays,
                // user_id is implicit/constant, no need to change
            };

            const { error } = await supabase
                .from('habits')
                .update(updates)
                .eq('id', habit.id);

            if (error) throw error;

            updateHabitInStore({ ...habit, ...updates });
            onClose();

        } catch (error) {
            console.error("Error updating habit:", error);
            alert("Failed to update habit.");
        } finally {
            setLoading(false);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                <motion.div
                    initial={{ scale: 0.95, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.95, opacity: 0 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 relative shadow-2xl space-y-6"
                >
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-white">Edit Habit</h2>
                        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
                            <FaTimes />
                        </button>
                    </div>

                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Habit Name</label>
                            <input
                                type="text"
                                value={title}
                                onChange={(e) => setTitle(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Frequency</label>
                            <DaySelector selectedDays={frequencyDays} onChange={setFrequencyDays} />
                            <p className="text-xs text-zinc-600 text-center pt-2">
                                {frequencyDays === null ? "Every Day" : "Specific Days"}
                            </p>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl flex items-center justify-center gap-2 transition-transform active:scale-95"
                        >
                            {loading ? 'Saving...' : <><FaSave /> Save Changes</>}
                        </button>
                    </form>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
