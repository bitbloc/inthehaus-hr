'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { FaHeart, FaBrain, FaWallet, FaLeaf, FaDumbbell, FaGamepad, FaMoon, FaWater, FaSun, FaStar, FaCheck } from 'react-icons/fa';
import ColorOrbs, { LIFESTYLE_COLORS } from './ColorOrbs';
import { supabase } from '@/lib/supabaseClient';
import { useBanffStore } from '@/store/useBanffStore';
import { clsx } from 'clsx';
import { SINGLE_USER_ID } from '../constants';

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

interface LifestyleFormProps {
    onClose: () => void;
}

export default function LifestyleForm({ onClose }: LifestyleFormProps) {
    const [name, setName] = useState('');
    const [color, setColor] = useState(LIFESTYLE_COLORS[0].value);
    const [icon, setIcon] = useState('heart');
    const { lifestyles, setLifestyles } = useBanffStore();

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!name.trim()) return;

        // Optimistic Update
        const newLifestyle = {
            id: 'temp-' + Date.now(),
            user_id: SINGLE_USER_ID,
            name,
            color,
            icon,
            sort_order: lifestyles.length
        };

        // @ts-ignore
        setLifestyles([...lifestyles, newLifestyle]);
        onClose();

        // DB Update
        const { data, error } = await supabase.from('lifestyles').insert([{
            name, color, icon, user_id: SINGLE_USER_ID, sort_order: lifestyles.length
        }]).select().single();

        if (data) {
            // Replace temp with real
            // @ts-ignore
            setLifestyles([...lifestyles, data]);
        }
        if (error) console.error("Failed to add lifestyle", error);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-zinc-500">Name</label>
                <input
                    autoFocus
                    type="text"
                    value={name} onChange={e => setName(e.target.value)}
                    placeholder="e.g. Creativity"
                    className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500"
                />
            </div>

            <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-zinc-500">Color</label>
                <ColorOrbs selectedColor={color} onSelect={setColor} />
            </div>

            <div className="space-y-2">
                <label className="text-xs uppercase font-bold text-zinc-500">Icon</label>
                <div className="grid grid-cols-5 gap-3">
                    {ICONS.map((item) => (
                        <button
                            key={item.id}
                            type="button"
                            onClick={() => setIcon(item.id)}
                            className={clsx(
                                "aspect-square rounded-xl flex items-center justify-center text-xl transition-all",
                                icon === item.id
                                    ? "bg-zinc-800 text-white ring-2 ring-emerald-500"
                                    : "bg-zinc-800/30 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-300"
                            )}
                        >
                            {item.icon}
                        </button>
                    ))}
                </div>
            </div>

            <button type="submit" className="w-full py-3 bg-emerald-500 rounded-xl font-bold text-black hover:bg-emerald-400">
                Create Soul
            </button>
        </form>
    );
}
