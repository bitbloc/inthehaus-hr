'use client';

import React, { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useBanffStore } from '@/store/useBanffStore';
import { ProtocolActivity } from '@/types/banff';
import { FaTimes, FaPlus, FaCoffee, FaClock, FaWalking, FaListUl, FaTv, FaBook, FaDumbbell, FaMusic } from 'react-icons/fa';

interface AddProtocolModalProps {
    isOpen: boolean;
    onClose: () => void;
    category: 'MORNING' | 'DAYTIME' | 'EVENING';
}

const ICONS = [
    { name: 'FaCoffee', icon: FaCoffee },
    { name: 'FaClock', icon: FaClock },
    { name: 'FaWalking', icon: FaWalking },
    { name: 'FaListUl', icon: FaListUl },
    { name: 'FaTv', icon: FaTv },
    { name: 'FaBook', icon: FaBook },
    { name: 'FaDumbbell', icon: FaDumbbell },
    { name: 'FaMusic', icon: FaMusic },
];

export default function AddProtocolModal({ isOpen, onClose, category }: AddProtocolModalProps) {
    const { addProtocolActivity } = useBanffStore();
    const [label, setLabel] = useState('');
    const [description, setDescription] = useState('');
    const [selectedIcon, setSelectedIcon] = useState('FaCoffee');
    const [loading, setLoading] = useState(false);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const newActivity = {
            user_id: user.id,
            category,
            label,
            description,
            icon: selectedIcon,
            weight: 1,
            is_default: false
        };

        const { data, error } = await supabase
            .from('protocol_activities')
            .insert(newActivity)
            .select()
            .single();

        if (data) {
            // @ts-ignore
            addProtocolActivity(data as ProtocolActivity);
            onClose();
            setLabel('');
            setDescription('');
        } else {
            console.error(error);
        }
        setLoading(false);
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
            <div className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-md p-6 relative">
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-zinc-500 hover:text-zinc-300"
                >
                    <FaTimes />
                </button>

                <h2 className="text-xl font-bold text-white mb-1">Add {category} Activity</h2>
                <p className="text-sm text-zinc-500 mb-6">Create a new routine for your protocol.</p>

                <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Label</label>
                        <input
                            type="text"
                            value={label}
                            onChange={(e) => setLabel(e.target.value)}
                            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-emerald-500"
                            placeholder="e.g. Read 10 pages"
                            required
                        />
                    </div>

                    <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-1">Description (Why?)</label>
                        <textarea
                            value={description}
                            onChange={(e) => setDescription(e.target.value)}
                            className="w-full bg-zinc-800/50 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 outline-none focus:border-emerald-500"
                            placeholder="Briefly explain the benefit..."
                            rows={2}
                        />
                    </div>

                    <div>
                        <label className="block text-xs uppercase text-zinc-500 font-bold mb-2">Icon</label>
                        <div className="flex gap-2 check-overflow-x-auto pb-2">
                            {ICONS.map((item) => {
                                const Icon = item.icon;
                                return (
                                    <button
                                        key={item.name}
                                        type="button"
                                        onClick={() => setSelectedIcon(item.name)}
                                        className={`p-3 rounded-xl border transition-all ${selectedIcon === item.name
                                                ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                                                : 'bg-zinc-800/30 border-zinc-700 text-zinc-500'
                                            }`}
                                    >
                                        <Icon />
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={loading}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 text-black font-bold py-3 rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                    >
                        {loading ? 'Adding...' : <><FaPlus /> Add Activity</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
