'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { useBanffStore } from '@/store/useBanffStore';
import { ProtocolActivity } from '@/types/banff';
import { SINGLE_USER_ID } from '../constants';
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

export default function AddProtocolModal({ isOpen, onClose, category, initialData }: AddProtocolModalProps & { initialData?: ProtocolActivity }) {
    const { addProtocolActivity, updateProtocolActivity } = useBanffStore();
    const [label, setLabel] = useState(initialData?.label || '');
    const [description, setDescription] = useState(initialData?.description || '');
    const [selectedIcon, setSelectedIcon] = useState(initialData?.icon || 'FaCoffee');
    const [loading, setLoading] = useState(false);

    // Reset state when modal opens/closes or initialData changes
    useEffect(() => {
        if (isOpen) {
            setLabel(initialData?.label || '');
            setDescription(initialData?.description || '');
            setSelectedIcon(initialData?.icon || 'FaCoffee');
        }
    }, [isOpen, initialData]);

    if (!isOpen) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        try {
            const { data: { user } } = await supabase.auth.getUser();
            const userId = user?.id || SINGLE_USER_ID;

            const activityData = {
                user_id: userId,
                category,
                label,
                description,
                icon: selectedIcon,
                weight: 1,
                is_default: false
            };

            let data, error;

            if (initialData) {
                // Update existing
                const result = await supabase
                    .from('protocol_activities')
                    .update(activityData)
                    .eq('id', initialData.id)
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            } else {
                // Insert new
                const result = await supabase
                    .from('protocol_activities')
                    .insert(activityData)
                    .select()
                    .single();
                data = result.data;
                error = result.error;
            }

            if (error) throw error;

            if (data) {
                if (initialData) {
                    // @ts-ignore
                    updateProtocolActivity(data as ProtocolActivity);
                } else {
                    // @ts-ignore
                    addProtocolActivity(data as ProtocolActivity);
                }
                onClose();
                setLabel('');
                setDescription('');
            }
        } catch (error) {
            console.error("Failed to save activity:", error);
            alert("Failed to save activity. Please try again.");
        } finally {
            setLoading(false);
        }
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

                <h2 className="text-xl font-bold text-white mb-1">{initialData ? 'Edit' : 'Add'} {category} Activity</h2>
                <p className="text-sm text-zinc-500 mb-6">{initialData ? 'Modify your routine details.' : 'Create a new routine for your protocol.'}</p>

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
                        {loading ? 'Saving...' : <>{initialData ? <FaPlus className="rotate-45" /> : <FaPlus />} {initialData ? 'Save Changes' : 'Add Activity'}</>}
                    </button>
                </form>
            </div>
        </div>
    );
}
