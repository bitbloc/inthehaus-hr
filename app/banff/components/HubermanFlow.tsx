'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaSun, FaCoffee, FaPen,
    FaClock, FaWalking, FaPalette, FaBroom,
    FaListUl, FaTv, FaBan,
    FaChevronDown, FaChevronUp, FaInfoCircle,
    FaPlus, FaTrash
} from 'react-icons/fa';
import * as FaIcons from 'react-icons/fa';
import { useBanffStore } from '@/store/useBanffStore';
import AddProtocolModal from './AddProtocolModal';
import { supabase } from '@/lib/supabaseClient';

// Protocol Metadata (Static info)
const PROTOCOL_META = {
    MORNING: {
        title: 'Morning Protocol',
        subtitle: '"Cache Clearing" (07:00 - 09:00)',
        color: 'amber', // Maps to ENERGY (Yellow/Amber)
        metricKey: 'energy_score',
    },
    DAYTIME: {
        title: 'Daytime Protocol',
        subtitle: '"Reality Anchoring" (10:00 - 17:00)',
        color: 'emerald', // Maps to FOCUS (Green/Emerald)
        metricKey: 'focus_score',
    },
    EVENING: {
        title: 'Evening Protocol',
        subtitle: '"System Shutdown" (19:00 - 22:00)',
        color: 'indigo', // Maps to MOOD (Blue/Indigo)
        metricKey: 'mood_score',
    }
};

interface HubermanFlowProps {
    metrics: any; // DailyMetric
    onUpdate: (key: string, value: number, noteObject?: any) => void;
}

export default function HubermanFlow({ metrics, onUpdate }: HubermanFlowProps) {
    const { protocolActivities, deleteProtocolActivity } = useBanffStore();
    const [openCategory, setOpenCategory] = useState<string | null>('MORNING');
    const [showAddModal, setShowAddModal] = useState(false);
    const [addCategory, setAddCategory] = useState<'MORNING' | 'DAYTIME' | 'EVENING'>('MORNING');
    const [editingActivity, setEditingActivity] = useState<any>(null);

    // Parse existing checklist from note if available
    const [checkedItems, setCheckedItems] = useState<string[]>(() => {
        try {
            if (metrics?.note && metrics.note.startsWith('{')) {
                const parsed = JSON.parse(metrics.note);
                return parsed.checklist || [];
            }
        } catch (e) { }
        return [];
    });

    useEffect(() => {
        if (metrics?.note && metrics.note.startsWith('{')) {
            try {
                const parsed = JSON.parse(metrics.note);
                if (parsed.checklist && Array.isArray(parsed.checklist)) {
                    setCheckedItems(parsed.checklist);
                }
            } catch (e) { }
        }
    }, [metrics?.note]);

    const getCategoryItems = (category: string) => {
        return protocolActivities.filter(p => p.category === category);
    };

    const calculateScore = (categoryKey: string, currentChecked: string[]) => {
        const items = getCategoryItems(categoryKey);
        if (items.length === 0) return 0;

        let totalWeight = items.reduce((sum, item) => sum + (item.weight || 1), 0);
        let checkedWeight = 0;

        items.forEach(item => {
            if (currentChecked.includes(item.id)) {
                checkedWeight += (item.weight || 1);
            }
        });

        if (totalWeight === 0) return 0;
        return Math.round((checkedWeight / totalWeight) * 100);
    };

    const handleToggle = (itemId: string, categoryKey: string) => {
        const newChecked = checkedItems.includes(itemId)
            ? checkedItems.filter(i => i !== itemId)
            : [...checkedItems, itemId];

        setCheckedItems(newChecked);

        // Calculate score for this specific category
        const newScore = calculateScore(categoryKey, newChecked);

        // @ts-ignore
        const metricKey = PROTOCOL_META[categoryKey].metricKey;

        // Create new Note object to persist checklist state
        const newNote = JSON.stringify({ checklist: newChecked });

        onUpdate(metricKey, newScore, newNote);
    };

    const handleDelete = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (!confirm('Are you sure you want to delete this activity?')) return;

        const { error } = await supabase.from('protocol_activities').delete().eq('id', id);
        if (!error) {
            deleteProtocolActivity(id);
        } else {
            alert('Failed to delete');
        }
    };

    // Helper to get current score for a category based on metrics props
    const getCategoryScore = (catKey: string) => {
        // @ts-ignore
        const key = PROTOCOL_META[catKey].metricKey;
        return metrics?.[key] || 0;
    };

    return (
        <div className="space-y-4">
            <AddProtocolModal
                isOpen={showAddModal}
                onClose={() => {
                    setShowAddModal(false);
                    setEditingActivity(null);
                }}
                category={addCategory}
                initialData={editingActivity}
            />

            {(Object.keys(PROTOCOL_META) as Array<keyof typeof PROTOCOL_META>).map((key) => {
                const category = PROTOCOL_META[key];
                const isOpen = openCategory === key;
                const score = getCategoryScore(key);
                const items = getCategoryItems(key);

                return (
                    <motion.div
                        key={key}
                        className={`bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden transition-all ${isOpen ? 'ring-1 ring-' + category.color + '-500/50' : ''}`}
                    >
                        {/* Header */}
                        <div
                            onClick={() => setOpenCategory(isOpen ? null : key)}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-4">
                                {/* Score Circle */}
                                <div className={`w-12 h-12 rounded-full bg-${category.color}-500/10 flex items-center justify-center text-${category.color}-400 font-bold text-lg border border-${category.color}-500/20`}>
                                    {score}
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-semibold text-zinc-200 text-lg">{category.title}</span>
                                    <span className="text-xs text-zinc-500 font-medium tracking-wide shadow-black drop-shadow-sm">{category.subtitle}</span>
                                </div>
                            </div>
                            {isOpen ? <FaChevronUp className="text-zinc-600" /> : <FaChevronDown className="text-zinc-600" />}
                        </div>

                        {/* Body */}
                        <AnimatePresence>
                            {isOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-zinc-800/50 bg-zinc-900/30"
                                >
                                    <div className="p-4 space-y-3">
                                        {items.length === 0 ? (
                                            <div className="text-center py-4 text-zinc-600 text-sm italic">
                                                No activities yet. Add one to start.
                                            </div>
                                        ) : (
                                            items.map((item) => {
                                                const isChecked = checkedItems.includes(item.id);
                                                // @ts-ignore
                                                const Icon = FaIcons[item.icon] || FaCoffee;

                                                return (
                                                    <div
                                                        key={item.id}
                                                        onClick={() => handleToggle(item.id, key)}
                                                        className={`
                                                        relative overflow-hidden group
                                                        flex flex-col gap-2 p-4 rounded-2xl cursor-pointer transition-all duration-300
                                                        border
                                                        ${isChecked
                                                                ? `bg-${category.color}-900/10 border-${category.color}-500/30`
                                                                : 'bg-zinc-800/20 border-zinc-800/50 hover:bg-zinc-800/40 hover:border-zinc-700'}
                                                    `}
                                                    >
                                                        <div className="flex items-start gap-4">
                                                            {/* Checkbox */}
                                                            <div className={`
                                                            mt-1 w-6 h-6 rounded-full border flex-shrink-0 flex items-center justify-center transition-all duration-300
                                                            ${isChecked
                                                                    ? `bg-${category.color}-500 border-${category.color}-500 text-black scale-110`
                                                                    : `border-zinc-600 text-transparent group-hover:border-${category.color}-400/50`}
                                                        `}>
                                                                <FaSun className="w-3 h-3" />
                                                            </div>

                                                            {/* Content */}
                                                            <div className="flex-1 space-y-1">
                                                                <div className="flex items-center justify-between">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className={`font-medium text-base ${isChecked ? 'text-zinc-300 line-through opacity-70' : 'text-zinc-200'}`}>
                                                                            {item.label}
                                                                        </span>
                                                                        <Icon className={`mx-2 text-sm ${isChecked ? `text-${category.color}-400/50` : 'text-zinc-500'}`} />
                                                                    </div>
                                                                    {/* Delete Button (Visible on Hover) */}
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            setEditingActivity(item);
                                                                            setAddCategory(key as any);
                                                                            setShowAddModal(true);
                                                                        }}
                                                                        className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-emerald-400 transition-opacity"
                                                                        title="Edit activity"
                                                                    >
                                                                        <FaPen />
                                                                    </button>
                                                                    <button
                                                                        onClick={(e) => handleDelete(e, item.id)}
                                                                        className="opacity-0 group-hover:opacity-100 p-2 text-zinc-600 hover:text-red-400 transition-opacity"
                                                                        title="Delete activity"
                                                                    >
                                                                        <FaTrash />
                                                                    </button>
                                                                </div>

                                                                {item.description && (
                                                                    <p className={`text-sm leading-relaxed ${isChecked ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                        {item.description}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                        )}

                                        {/* Add Button */}
                                        <button
                                            onClick={() => {
                                                setAddCategory(key);
                                                setShowAddModal(true);
                                            }}
                                            className="w-full py-3 rounded-2xl border border-dashed border-zinc-800 text-zinc-500 hover:text-emerald-400 hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all flex items-center justify-center gap-2 text-sm font-medium"
                                        >
                                            <FaPlus /> Add Activity
                                        </button>
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </motion.div>
                );
            })}
        </div>
    );
}

