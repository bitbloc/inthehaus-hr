'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaSun, FaSnowflake, FaCoffee, FaBed, FaUserFriends, FaWalking, FaBrain, FaHeadphones, FaHourglassHalf, FaChevronDown, FaChevronUp } from 'react-icons/fa';
import { useBanffStore } from '@/store/useBanffStore';
import { debounce } from '@/utils/debounce';

// Huberman Protocols
const PROTOCOLS = {
    MOOD: [
        { id: 'sunlight', label: 'รับแสงแดดยามเช้า (10-30 น.)', icon: FaSun, weight: 40 },
        { id: 'sleep', label: 'นอนหลับอย่างมีคุณภาพ (7 ชม.+)', icon: FaBed, weight: 30 },
        { id: 'social', label: 'การพบปะผู้คน / สังคม', icon: FaUserFriends, weight: 30 },
    ],
    ENERGY: [
        { id: 'cold', label: 'อาบน้ำเย็น / ความเย็น (1-3 น.)', icon: FaSnowflake, weight: 30 },
        { id: 'caffeine', label: 'คาเฟอีน (90 น. หลังตื่น)', icon: FaCoffee, weight: 30 },
        { id: 'movement', label: 'การเคลื่อนไหว / ออกกำลังกาย', icon: FaWalking, weight: 40 },
    ],
    FOCUS: [
        { id: 'nsdr', label: 'NSDR / ทำสมาธิ', icon: FaBrain, weight: 30 },
        { id: 'deepwork', label: 'ช่วงเวลา Deep Work (90 น.)', icon: FaHourglassHalf, weight: 40 },
        { id: 'binaural', label: 'คลื่นเสียง Binaural / White Noise', icon: FaHeadphones, weight: 30 },
    ]
};

interface HubermanFlowProps {
    metrics: any; // DailyMetric
    onUpdate: (key: string, value: number, noteObject?: any) => void;
}

export default function HubermanFlow({ metrics, onUpdate }: HubermanFlowProps) {
    const [openCategory, setOpenCategory] = useState<string | null>('MOOD');

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
        // Sync incoming metrics note changes if needed (e.g. initial load)
        if (metrics?.note && metrics.note.startsWith('{')) {
            try {
                const parsed = JSON.parse(metrics.note);
                // Only update if different to avoid loop? 
                // Actually simpler: we trust local state after init. 
            } catch (e) { }
        }
    }, [metrics?.id]); // Only on new metric load

    const calculateScore = (category: 'MOOD' | 'ENERGY' | 'FOCUS', currentChecked: string[]) => {
        const items = PROTOCOLS[category];
        let score = 0;
        items.forEach(item => {
            if (currentChecked.includes(item.id)) score += item.weight;
        });
        return Math.min(100, score);
    };

    const handleToggle = (itemId: string, category: 'MOOD' | 'ENERGY' | 'FOCUS') => {
        const newChecked = checkedItems.includes(itemId)
            ? checkedItems.filter(i => i !== itemId)
            : [...checkedItems, itemId];

        setCheckedItems(newChecked);

        // meaningful score updates
        const newScore = calculateScore(category, newChecked);
        const fieldMap = {
            'MOOD': 'mood_score',
            'ENERGY': 'energy_score',
            'FOCUS': 'focus_score'
        };

        // Create new Note object
        const newNote = JSON.stringify({ checklist: newChecked });

        onUpdate(fieldMap[category], newScore, newNote);
    };

    const categories = [
        { key: 'MOOD', label: 'อารมณ์', color: 'indigo', score: metrics?.mood_score || 0 },
        { key: 'ENERGY', label: 'พลังงาน', color: 'amber', score: metrics?.energy_score || 0 },
        { key: 'FOCUS', label: 'สมาธิ', color: 'emerald', score: metrics?.focus_score || 0 },
    ];

    return (
        <div className="space-y-4">
            {categories.map((cat) => {
                const isOpen = openCategory === cat.key;
                return (
                    <motion.div
                        key={cat.key}
                        className={`bg-zinc-900/50 border border-zinc-800 rounded-3xl overflow-hidden transition-all ${isOpen ? 'ring-1 ring-' + cat.color + '-500/50' : ''}`}
                    >
                        {/* Header / Summary */}
                        <div
                            onClick={() => setOpenCategory(isOpen ? null : cat.key)}
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-white/5 transition-colors"
                        >
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full bg-${cat.color}-500/20 flex items-center justify-center text-${cat.color}-400 font-bold`}>
                                    {cat.score}
                                </div>
                                <div className="flex flex-col">
                                    <span className="font-medium text-zinc-200">{cat.label}</span>
                                    {isOpen && <span className="text-[10px] text-zinc-500 uppercase tracking-wider">Huberman Protocol</span>}
                                </div>
                            </div>
                            {isOpen ? <FaChevronUp className="text-zinc-600" /> : <FaChevronDown className="text-zinc-600" />}
                        </div>

                        {/* Checklist Body */}
                        <AnimatePresence>
                            {isOpen && (
                                <motion.div
                                    initial={{ height: 0, opacity: 0 }}
                                    animate={{ height: 'auto', opacity: 1 }}
                                    exit={{ height: 0, opacity: 0 }}
                                    className="border-t border-zinc-800/50"
                                >
                                    <div className="p-4 space-y-2">
                                        {PROTOCOLS[cat.key as keyof typeof PROTOCOLS].map((item) => {
                                            const isChecked = checkedItems.includes(item.id);
                                            const Icon = item.icon;
                                            return (
                                                <div
                                                    key={item.id}
                                                    onClick={() => handleToggle(item.id, cat.key as any)}
                                                    className={`
                                                        flex items-center gap-3 p-3 rounded-xl cursor-pointer transition-all duration-300
                                                        ${isChecked
                                                            ? `bg-${cat.color}-500/10 border border-${cat.color}-500/30`
                                                            : 'bg-zinc-800/30 border border-transparent hover:bg-zinc-800/50'}
                                                    `}
                                                >
                                                    <div className={`
                                                        w-6 h-6 rounded-full border flex items-center justify-center transition-colors
                                                        ${isChecked
                                                            ? `bg-${cat.color}-500 border-${cat.color}-500 text-black`
                                                            : `border-zinc-600 text-transparent`}
                                                    `}>
                                                        <FaSun className="w-3 h-3" /> {/* Checkmark or Icon */}
                                                    </div>

                                                    <div className="flex-1">
                                                        <span className={`text-sm ${isChecked ? 'text-white' : 'text-zinc-400'}`}>{item.label}</span>
                                                    </div>

                                                    <Icon className={`text-lg ${isChecked ? `text-${cat.color}-400` : 'text-zinc-600'}`} />
                                                </div>
                                            );
                                        })}
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
