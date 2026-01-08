'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    FaSun, FaCoffee, FaPen,
    FaClock, FaWalking, FaPalette, FaBroom,
    FaListUl, FaTv, FaBan,
    FaChevronDown, FaChevronUp, FaInfoCircle
} from 'react-icons/fa';

// Daily Protocols Data
const PROTOCOLS = {
    MORNING: {
        title: 'Morning Protocol',
        subtitle: '"Cache Clearing" (07:00 - 09:00)',
        color: 'amber', // Maps to ENERGY (Yellow/Amber)
        metricKey: 'energy_score',
        items: [
            {
                id: 'delayed_input',
                label: 'Delayed Input (30 นาทีแรก)',
                desc: 'ห้ามจับมือถือ/ข่าว. ตื่นมาดื่มน้ำ ดูต้นไม้ หรือชงกาแฟ (โฟกัสกลิ่น/เสียง).',
                why: 'ป้องกันสมอง Boot up เร็วเกินไป. บังคับให้อยู่ในโหมด Sensing ก่อน Thinking.',
                icon: FaCoffee,
                weight: 50
            },
            {
                id: 'brain_dump',
                label: 'Unfiltered Brain Dump (10 นาที)',
                desc: 'เขียน Morning Pages. ขีดเส้นใต้ 1 อย่างที่ต้องทำวันนี้. ที่เหลือเขียน "Pending".',
                why: 'ลด Noise ระหว่างวัน ไม่ให้รู้สึกผิดลึกๆ ว่าลืมทำอะไร.',
                icon: FaPen,
                weight: 50
            },
        ]
    },
    DAYTIME: {
        title: 'Daytime Protocol',
        subtitle: '"Reality Anchoring" (10:00 - 17:00)',
        color: 'emerald', // Maps to FOCUS (Green/Emerald)
        metricKey: 'focus_score',
        items: [
            {
                id: 'good_enough',
                label: 'The "Good Enough" Timer',
                desc: 'ตั้งเวลาทำงาน (เช่น 45 นาที). พอหมดเวลาถามตัวเอง "ดีระดับ 80% หรือยัง?" ถ้าถึงแล้วให้พอ.',
                why: 'แก้ Perfectionism. ท่องไว้ "Done is better than perfect."',
                icon: FaClock,
                weight: 50
            },
            {
                id: 'sensing_break',
                label: 'Active Sensing Break (ทุก 2 ชม.)',
                desc: 'เมื่อหัวบวม ให้ลุกทันที. วาดรูปสั้นๆ, ล้างจาน, รดน้ำต้นไม้.',
                why: 'การดึงตัวเองกลับมาอยู่กับ "ผัสสะ" ทางกายภาพ คือยาแก้แพ้ Overthinking.',
                icon: FaWalking,
                weight: 50
            },
        ]
    },
    EVENING: {
        title: 'Evening Protocol',
        subtitle: '"System Shutdown" (19:00 - 22:00)',
        color: 'indigo', // Maps to MOOD (Blue/Indigo)
        metricKey: 'mood_score',
        items: [
            {
                id: 'not_to_do',
                label: 'The "Not-To-Do" List',
                desc: 'เช็คว่าวันนี้สำเร็จในการ "ไม่ทำ" อะไรบ้าง (เช่น ไม่ตอบไลน์หลัง 2 ทุ่ม).',
                why: 'ฝึกให้เห็นคุณค่าของการ "ปฏิเสธ" และการ "หยุด".',
                icon: FaListUl,
                weight: 50
            },
            {
                id: 'passive_ent',
                label: 'Passive Entertainment (Low-Res)',
                desc: 'ดูหนังเก่า/Sitcom ที่ไม่ต้องลุ้น. ห้ามดูอะไรที่ "พัฒนาตัวเอง" หลัง 3 ทุ่ม.',
                why: 'หยุดสมองส่วน Ni (คาดเดาอนาคต).',
                icon: FaTv,
                weight: 50
            },
        ]
    }
};

interface HubermanFlowProps {
    metrics: any; // DailyMetric
    onUpdate: (key: string, value: number, noteObject?: any) => void;
}

export default function HubermanFlow({ metrics, onUpdate }: HubermanFlowProps) {
    const [openCategory, setOpenCategory] = useState<string | null>('MORNING');

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

    const calculateScore = (categoryKey: string, currentChecked: string[]) => {
        // @ts-ignore
        const categoryData = PROTOCOLS[categoryKey];
        if (!categoryData) return 0;

        let score = 0;
        categoryData.items.forEach((item: any) => {
            if (currentChecked.includes(item.id)) score += item.weight;
        });
        return Math.min(100, score);
    };

    const handleToggle = (itemId: string, categoryKey: string) => {
        const newChecked = checkedItems.includes(itemId)
            ? checkedItems.filter(i => i !== itemId)
            : [...checkedItems, itemId];

        setCheckedItems(newChecked);

        // Calculate score for this specific category
        const newScore = calculateScore(categoryKey, newChecked);

        // @ts-ignore
        const metricKey = PROTOCOLS[categoryKey].metricKey;

        // Create new Note object to persist checklist state
        const newNote = JSON.stringify({ checklist: newChecked });

        onUpdate(metricKey, newScore, newNote);
    };

    // Helper to get current score for a category based on metrics props
    // We can't rely solely on 'checkedItems' for initial render of the score number 
    // because metrics prop is the source of truth for the DB value.
    const getCategoryScore = (catKey: string) => {
        // @ts-ignore
        const key = PROTOCOLS[catKey].metricKey;
        return metrics?.[key] || 0;
    };

    return (
        <div className="space-y-4">
            {(Object.keys(PROTOCOLS) as Array<keyof typeof PROTOCOLS>).map((key) => {
                const category = PROTOCOLS[key];
                const isOpen = openCategory === key;
                const score = getCategoryScore(key);

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
                                        {category.items.map((item) => {
                                            const isChecked = checkedItems.includes(item.id);
                                            const Icon = item.icon;
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
                                                            <div className="flex items-center gap-2">
                                                                <span className={`font-medium text-base ${isChecked ? 'text-zinc-300 line-through opacity-70' : 'text-zinc-200'}`}>
                                                                    {item.label}
                                                                </span>
                                                                <Icon className={`mx-2 text-sm ${isChecked ? `text-${category.color}-400/50` : 'text-zinc-500'}`} />
                                                            </div>
                                                            <p className={`text-sm leading-relaxed ${isChecked ? 'text-zinc-500' : 'text-zinc-400'}`}>
                                                                {item.desc}
                                                            </p>
                                                            {/* Why Section */}
                                                            <div className={`text-xs mt-2 p-2 rounded-lg flex gap-2 items-start ${isChecked ? 'bg-zinc-900/30 text-zinc-600' : 'bg-zinc-900/50 text-zinc-500'}`}>
                                                                <FaInfoCircle className="flex-shrink-0 mt-0.5" />
                                                                <span><strong className="opacity-80">Why:</strong> {item.why}</span>
                                                            </div>
                                                        </div>
                                                    </div>
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
