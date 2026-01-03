'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { format, parseISO } from 'date-fns';
import { Lifestyle, HabitLog, Habit } from '@/types/banff';
import { useBanffStore } from '@/store/useBanffStore';
import * as FaIcons from 'react-icons/fa'; // Dynamic icon loading? Or just subset
// If icons are strings like 'FaDumbbell', we need a mapper. 
// Assuming lifestyles have an icon string. For MVP, I might map or just use a generic if specific not found.
// Actually, earlier files showed `icon.tsx` usage or just FaIcons imports.
// Let's assume the icon string in DB is like "FaBolt".

const IconMap: Record<string, any> = {
    ...FaIcons
};

interface SoulCollectionProps {
    logs: HabitLog[];
}

export default function SoulCollection({ logs }: SoulCollectionProps) {
    const { habits, lifestyles } = useBanffStore();

    // Take top 12 recent logs
    const displayLogs = logs.slice(0, 12);

    const getLogDetails = (log: HabitLog) => {
        const habit = habits.find(h => h.id === log.habit_id);
        if (!habit) return { title: 'ไม่ระบุ', color: 'zinc', icon: 'FaQuestion', lifestyleName: 'ไม่ระบุ' };

        let color = 'zinc';
        let icon = 'FaCircle';
        let lifestyleName = '';

        if (habit.lifestyle_id) {
            const lifestyle = lifestyles.find(l => l.id === habit.lifestyle_id);
            if (lifestyle) {
                color = lifestyle.color;
                icon = lifestyle.icon;
                lifestyleName = lifestyle.name;
            }
        }

        return { title: habit.title, color, icon, lifestyleName };
    };

    if (displayLogs.length === 0) {
        return (
            <div className="py-8 flex flex-col items-center justify-center text-zinc-600 gap-2">
                <div className="w-12 h-12 rounded-full border-2 border-dashed border-zinc-700 mx-auto" />
                <span className="text-xs">ยังไม่มี Soul ที่สะสมเร็วๆ นี้</span>
            </div>
        );
    }

    return (
        <div className="flex flex-wrap gap-4 items-center justify-center p-4">
            {displayLogs.map((log, index) => {
                const { title, color, icon, lifestyleName } = getLogDetails(log);
                const IconComponent = IconMap[icon as keyof typeof IconMap] || FaIcons.FaCircle;
                const timeLabel = log.completed_at ? format(parseISO(log.completed_at), 'HH:mm') : '';

                return (
                    <div key={log.id} className="relative group">
                        {/* Orb */}
                        <motion.div
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            transition={{ delay: index * 0.05, type: 'spring' }}
                            className={`
                                w-14 h-14 rounded-full 
                                bg-gradient-to-br from-${color}-400 to-${color}-600 
                                flex items-center justify-center
                                shadow-[0_0_15px_rgba(0,0,0,0.3)]
                                shadow-${color}-500/40
                                cursor-pointer
                                border border-white/10
                                relative z-10
                            `}
                        >
                            <IconComponent className="text-white text-xl drop-shadow-md" />
                        </motion.div>

                        {/* Tooltip / Details Pop */}
                        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 group-hover:-translate-y-[140%] transition-all duration-300 pointer-events-none z-20 w-max">
                            <div className="bg-zinc-900/90 backdrop-blur-md border border-zinc-700 rounded-xl px-3 py-2 shadow-2xl flex flex-col items-center text-center">
                                <span className={`text-[10px] uppercase font-bold tracking-wider text-${color}-400`}>{lifestyleName}</span>
                                <span className="text-sm font-medium text-white">{title}</span>
                                <span className="text-[10px] text-zinc-500 font-mono">{timeLabel}</span>

                                {/* Little arrow */}
                                <div className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-zinc-900 border-r border-b border-zinc-700 rotate-45"></div>
                            </div>
                        </div>
                    </div>
                );
            })}
        </div>
    );
}
