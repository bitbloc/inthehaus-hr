'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { supabase } from '@/lib/supabaseClient';
import DaySelector from './DaySelector';
import { useBanffStore } from '@/store/useBanffStore';

export default function HabitForm() {
    const [name, setName] = useState('');
    const [frequencyDays, setFrequencyDays] = useState<number[] | null>(null);
    const [loading, setLoading] = useState(false);
    const addHabitToStore = useBanffStore((state) => state.addHabit); // Need to add this action to store

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();

            if (!user) {
                // Fallback for dev/demo if no auth, or handle error
                console.error("No user logged in");
                setLoading(false);
                return;
            }

            const newHabit = {
                user_id: user.id, // Ensure user is logged in
                title: name,
                frequency_days: frequencyDays, // null or array
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
