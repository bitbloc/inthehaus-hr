'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import DaySelector from './DaySelector';
import { useBanffStore } from '@/store/useBanffStore';
import { SINGLE_USER_ID } from '../constants';

export default function HabitForm() {
    const [name, setName] = useState('');
    const [frequencyDays, setFrequencyDays] = useState<number[] | null>(null);
    const [lifestyleId, setLifestyleId] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const addHabitToStore = useBanffStore((state) => state.addHabit);
    const lifestyles = useBanffStore((state) => state.lifestyles);

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);

        try {
            // SINGLE USER MODE: No Auth Check
            // const { data: { user } } = await supabase.auth.getUser();

            const newHabit = {
                user_id: SINGLE_USER_ID,
                title: name,
                frequency_days: frequencyDays, // null or array
                lifestyle_id: lifestyleId || null
            };

            const { data, error } = await supabase
                .from('habits')
                .insert([newHabit])
                .select()
                .single();

            if (error) throw error;

            // Optimistic or store update
            if (addHabitToStore && data) {
                // @ts-ignore - store types might need update strictly
                addHabitToStore(data);
            }

            // Reset
            setName('');
            setFrequencyDays(null);
            setLifestyleId('');

            // Success visual (Fly animation could be handled by parent or toast)
            alert("Habit Added!");

        } catch (error) {
            console.error('Error adding habit:', error);
            alert('Failed to add habit');
        } finally {
            setLoading(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="bg-zinc-900/40 p-6 rounded-2xl border border-zinc-800 space-y-6">
            <div className="space-y-2">
                <label className="text-xs uppercase tracking-wider text-zinc-500 font-bold">I want to...</label>
                <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Read 10 pages"
                    className="w-full bg-transparent border-b border-zinc-700 py-2 text-xl text-white placeholder-zinc-600 focus:outline-none focus:border-emerald-500 transition-colors"
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
                className="w-full py-4 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-xl transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {loading ? 'Creating...' : 'Create Habit'}
            </button>
        </form>
    );
}
