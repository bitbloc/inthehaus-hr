import React from 'react';
import { motion } from 'framer-motion';
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

interface DaySelectorProps {
    selectedDays: number[] | null; // null = everyday
    onChange: (days: number[] | null) => void;
}

const DAYS = ['S', 'M', 'T', 'W', 'T', 'F', 'S']; // Sun to Sat

export default function DaySelector({ selectedDays, onChange }: DaySelectorProps) {
    const handlePreset = (preset: 'everyday' | 'weekdays' | 'weekends') => {
        if (preset === 'everyday') onChange(null);
        if (preset === 'weekdays') onChange([1, 2, 3, 4, 5]);
        if (preset === 'weekends') onChange([0, 6]);
    };

    const toggleDay = (index: number) => {
        if (selectedDays === null) {
            // If current is everyday, clicking a day switches to ONLY that day? 
            // Or toggles it off (meaning all others stay)? User likely wants to customize.
            // Let's assume they want to "keep everyday BUT remove this one" -> so select all others.
            const allDays = [0, 1, 2, 3, 4, 5, 6];
            const newDays = allDays.filter(d => d !== index);
            onChange(newDays);
        } else {
            if (selectedDays.includes(index)) {
                const newDays = selectedDays.filter(d => d !== index);
                if (newDays.length === 0) {
                    // If they deselect the last one, what should happen? 
                    // Let's keep it empty `[]` (meaning Never, effectively pausing?) 
                    // or revert to everyday. Let's stick to empty `[]` to be explicit.
                    onChange([]);
                } else {
                    onChange(newDays);
                }
            } else {
                const newDays = [...selectedDays, index].sort();
                if (newDays.length === 7) onChange(null); // All 7 = Everyday
                else onChange(newDays);
            }
        }
    };

    const isSelected = (index: number) => {
        if (selectedDays === null) return true;
        return selectedDays.includes(index);
    };

    return (
        <div className="space-y-4">
            {/* Presets */}
            <div className="flex gap-2 justify-center">
                <button type="button" onClick={() => handlePreset('weekdays')} className="text-[10px] font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded-full text-zinc-400 transition-colors">Weekdays</button>
                <button type="button" onClick={() => handlePreset('weekends')} className="text-[10px] font-bold uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 px-3 py-1 rounded-full text-zinc-400 transition-colors">Weekend</button>
                <button type="button" onClick={() => handlePreset('everyday')} className="text-[10px] font-bold uppercase tracking-wider bg-emerald-900/30 text-emerald-400 border border-emerald-500/30 px-3 py-1 rounded-full hover:bg-emerald-900/50 transition-colors">Everyday</button>
            </div>

            <div className="flex gap-2 justify-between">
                {DAYS.map((day, index) => (
                    <motion.button
                        key={index}
                        whileTap={{ scale: 0.9 }}
                        animate={{
                            scale: isSelected(index) ? 1.1 : 1,
                            backgroundColor: isSelected(index) ? '#10B981' : '#27272A'
                        }}
                        onClick={() => toggleDay(index)}
                        type="button"
                        className={twMerge(
                            "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors shadow-sm",
                            isSelected(index) ? "text-white shadow-emerald-500/30" : "text-zinc-500"
                        )}
                    >
                        {day}
                    </motion.button>
                ))}
            </div>
        </div>
    );
}
