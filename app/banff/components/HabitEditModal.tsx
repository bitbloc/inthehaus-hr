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
    const [lifestyleId, setLifestyleId] = useState<string>(habit.lifestyle_id || '');
    const [loading, setLoading] = useState(false);

    const updateHabitInStore = useBanffStore(state => state.updateHabit);
    const lifestyles = useBanffStore(state => state.lifestyles);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const updates = {
                title,
                frequency_days: frequencyDays,
                lifestyle_id: lifestyleId || null
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

                        {/* Lifestyle Selection */}
                        <div className="space-y-3">
                            <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">Lifestyle Area</label>
                            <div className="grid grid-cols-4 gap-2">
                                {lifestyles.map(l => (
                                    <button
                                        key={l.id}
                                        type="button"
                                        onClick={() => setLifestyleId(l.id)}
                                        className={`
                                            flex flex-col items-center justify-center p-2 rounded-xl border transition-all
                                            ${lifestyleId === l.id
                                                ? `bg-zinc-800 border-${l.color?.split('-')[1] || 'emerald'}-500 ring-1 ring-${l.color?.split('-')[1] || 'emerald'}-500`
                                                : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 opacity-60 hover:opacity-100'}
                                        `}
                                    >
                                        <div className={`w-3 h-3 rounded-full mb-1 bg-${l.color?.split('-')[1] || 'gray'}-500`} />
                                        <span className="text-[10px] font-medium text-white truncate max-w-full">{l.name}</span>
                                    </button>
                                ))}
                                <button
                                    type="button"
                                    onClick={() => setLifestyleId('')}
                                    className={`
                                            flex flex-col items-center justify-center p-2 rounded-xl border transition-all
                                            ${!lifestyleId
                                            ? 'bg-zinc-800 border-zinc-500 ring-1 ring-zinc-500'
                                            : 'bg-zinc-950 border-zinc-800 hover:border-zinc-700 opacity-60 hover:opacity-100'}
                                        `}
                                >
                                    <div className="w-3 h-3 rounded-full mb-1 bg-zinc-600" />
                                    <span className="text-[10px] font-medium text-white">None</span>
                                </button>
                            </div>
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
