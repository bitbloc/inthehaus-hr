'use client';

import React from 'react';
import { motion } from 'framer-motion';

interface XPBarProps {
    currentXP: number;
    level: number;
    nextLevelXP: number;
}

export default function XPBar({ currentXP, level, nextLevelXP }: XPBarProps) {
    const progress = (currentXP / nextLevelXP) * 100;

    return (
        <div className="relative pt-4">
            <div className="flex justify-between items-end mb-1 px-1">
                <span className="text-xs font-bold text-emerald-400 tracking-wider">LVL {level}</span>
                <span className="text-[10px] text-zinc-500">{currentXP} / {nextLevelXP} XP</span>
            </div>

            <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden relative">
                <motion.div
                    className="absolute top-0 bottom-0 left-0 bg-gradient-to-r from-emerald-600 to-teal-400"
                    initial={{ width: 0 }}
                    animate={{ width: `${progress}%` }}
                    transition={{ type: 'spring', damping: 20, stiffness: 60 }}
                />
                {/* Glow effect */}
                <motion.div
                    className="absolute top-0 bottom-0 w-2 bg-white/50 blur-[2px]"
                    style={{ left: `${progress}%` }}
                    animate={{ left: `${progress}%` }}
                />
            </div>
        </div>
    );
}
