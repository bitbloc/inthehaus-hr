'use client';

import React from 'react';
import { FaUserAstronaut } from 'react-icons/fa';

interface ProfileCardProps {
    level: number;
    currentXP: number;
    nextLevelXP: number; // e.g. 100
}

export default function ProfileCard({ level, currentXP, nextLevelXP }: ProfileCardProps) {
    const progress = (currentXP / nextLevelXP) * 100;

    return (
        <div className="bg-gradient-to-br from-zinc-900 to-black border border-zinc-800 p-6 rounded-3xl flex items-center gap-6 relative overflow-hidden">
            {/* Background Glow */}
            <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/10 rounded-full blur-3xl -mr-10 -mt-10" />

            <div className="w-20 h-20 rounded-full bg-zinc-800 border-2 border-zinc-700 flex items-center justify-center text-3xl text-zinc-400 shadow-xl relative z-10">
                <FaUserAstronaut />
                <div className="absolute -bottom-1 bg-zinc-950 text-emerald-400 text-[10px] font-bold px-2 py-0.5 rounded-full border border-emerald-500/30">
                    LVL {level}
                </div>
            </div>

            <div className="flex-1 relative z-10">
                <h2 className="text-xl font-bold text-white mb-1">Traveler</h2>
                <div className="flex justify-between text-xs text-zinc-500 mb-2 uppercase tracking-wider font-medium">
                    <span>XP Progress</span>
                    <span>{currentXP} / {nextLevelXP}</span>
                </div>

                <div className="h-2 w-full bg-zinc-800 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>
        </div>
    );
}
