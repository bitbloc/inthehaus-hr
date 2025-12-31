'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaHeart, FaBrain, FaWallet, FaLeaf, FaTimes, FaTrash, FaDumbbell, FaGamepad, FaMoon, FaWater, FaSun, FaStar } from 'react-icons/fa';
import ColorOrbs, { LIFESTYLE_COLORS } from './ColorOrbs';
import { supabase } from '@/lib/supabaseClient';
import { useBanffStore } from '@/store/useBanffStore';
import { clsx } from 'clsx';
import { Lifestyle } from '@/types/banff';

const ICONS = [
    { id: 'heart', icon: <FaHeart /> },
    { id: 'brain', icon: <FaBrain /> },
    { id: 'wallet', icon: <FaWallet /> },
    { id: 'leaf', icon: <FaLeaf /> },
    { id: 'dumbbell', icon: <FaDumbbell /> },
    { id: 'gamepad', icon: <FaGamepad /> },
    { id: 'moon', icon: <FaMoon /> },
    { id: 'water', icon: <FaWater /> },
    { id: 'sun', icon: <FaSun /> },
    { id: 'star', icon: <FaStar /> },
];

interface LifestyleEditModalProps {
    isOpen: boolean;
    onClose: () => void;
    lifestyle: Lifestyle;
}

export default function LifestyleEditModal({ isOpen, onClose, lifestyle }: LifestyleEditModalProps) {
    const [name, setName] = useState(lifestyle.name);
    const [color, setColor] = useState(lifestyle.color);
    const [icon, setIcon] = useState(lifestyle.icon);

    // Store Actions
    const setLifestyles = useBanffStore(state => state.setLifestyles);
    const lifestyles = useBanffStore(state => state.lifestyles);
    const habits = useBanffStore(state => state.habits);

    const handleUpdate = async (e: React.FormEvent) => {
        e.preventDefault();

        // Optimistic Update
        const updatedLifestyle = { ...lifestyle, name, color, icon };
        const newLifestyles = lifestyles.map(l => l.id === lifestyle.id ? updatedLifestyle : l);
        setLifestyles(newLifestyles);

        onClose();

        // DB Update
        const { error } = await supabase
            .from('lifestyles')
            .update({ name, color, icon })
            .eq('id', lifestyle.id);

        if (error) {
            console.error("Failed to update lifestyle", error);
            // Revert? (For MVP we skip revert logic, relying on next fetch or manual fix)
        }
    };

    const handleDelete = async () => {
        // Check for active habits
        const activeHabits = habits.filter(h => h.lifestyle_id === lifestyle.id && !h.is_archived);
        if (activeHabits.length > 0) {
            alert(`Cannot delete soul "${lifestyle.name}" while it has ${activeHabits.length} active quests. Please delete or archive them first.`);
            return;
        }

        if (!confirm(`Permanently delete "${lifestyle.name}"? This action cannot be undone.`)) return;

        // Optimistic Delete
        const newLifestyles = lifestyles.filter(l => l.id !== lifestyle.id);
        setLifestyles(newLifestyles);
        onClose();

        // DB Delete
        const { error } = await supabase
            .from('lifestyles')
            .delete()
            .eq('id', lifestyle.id);

        if (error) {
            console.error("Failed to delete lifestyle", error);
        }
    };

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4"
                onClick={onClose}
            >
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 space-y-6 shadow-2xl relative overflow-hidden"
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div className="flex justify-between items-center">
                        <h2 className="text-xl font-bold text-white">Edit Soul</h2>
                        <button onClick={onClose} className="text-zinc-500 hover:text-white transition-colors">
                            <FaTimes />
                        </button>
                    </div>

                    <form onSubmit={handleUpdate} className="space-y-6">
                        {/* Name Input */}
                        <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500">Name</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 transition-colors"
                            />
                        </div>

                        {/* Color Picker */}
                        <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500">Aura Color</label>
                            <ColorOrbs selectedColor={color} onSelect={setColor} />
                        </div>

                        {/* Icon Grid */}
                        <div className="space-y-2">
                            <label className="text-xs uppercase font-bold text-zinc-500">Icon</label>
                            <div className="grid grid-cols-5 gap-2">
                                {ICONS.map((item) => (
                                    <button
                                        key={item.id}
                                        type="button"
                                        onClick={() => setIcon(item.id)}
                                        className={clsx(
                                            "aspect-square rounded-xl flex items-center justify-center text-lg transition-all",
                                            icon === item.id
                                                ? `bg-zinc-800 text-white ring-2 ${color?.startsWith('bg-') ? `ring-${color.split('-')[1]}-500` : 'ring-emerald-500'} scale-110`
                                                : "bg-zinc-950 text-zinc-600 hover:bg-zinc-800 hover:text-zinc-300"
                                        )}
                                    >
                                        {item.icon}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="pt-4 flex gap-3">
                            <button
                                type="button"
                                onClick={handleDelete}
                                className="flex-1 py-3 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded-xl font-bold transition-colors flex items-center justify-center gap-2"
                            >
                                <FaTrash size={14} /> Delete
                            </button>
                            <button
                                type="submit"
                                className="flex-[2] py-3 bg-white text-black rounded-xl font-bold hover:bg-zinc-200 transition-colors"
                            >
                                Save Changes
                            </button>
                        </div>
                    </form>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
