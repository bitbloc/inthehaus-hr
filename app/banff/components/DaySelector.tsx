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
    const toggleDay = (index: number) => {
        if (selectedDays === null) {
            // Switch from Everyday to Specific Days. Start with just this day selected?
            // Or maybe start with all days except the one clicked?
            // Logic: User wants to limit days. If currently everyday (null), and they click 'M', maybe they mean ONLY 'M'?
            onChange([index]);
        } else {
            // Toggle logic
            if (selectedDays.includes(index)) {
                const newDays = selectedDays.filter(d => d !== index);
                // If no days selected, maybe revert to null (Everyday) or just empty?
                // Let's keep it empty to force user to pick at least one or click "Everyday" button.
                // Actually, let's treat empty as "None"? No, better logic: 
                if (newDays.length === 7) {
                    onChange(null); // All days = Everyday
                } else {
                    onChange(newDays.length === 0 ? [] : newDays);
                }
            } else {
                const newDays = [...selectedDays, index].sort();
                if (newDays.length === 7) onChange(null);
                else onChange(newDays);
            }
        }
    };

    const isSelected = (index: number) => {
        if (selectedDays === null) return true; // Everyday = all selected visually
        return selectedDays.includes(index);
    };

    return (
        <div className="flex gap-2 justify-between">
            {DAYS.map((day, index) => (
                <motion.button
                    key={index}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => toggleDay(index)}
                    type="button"
                    className={twMerge(
                        "w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors",
                        isSelected(index)
                            ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/20"
                            : "bg-zinc-800 text-zinc-500 hover:bg-zinc-700"
                    )}
                >
                    {day}
                </motion.button>
            ))}
        </div>
    );
}
