'use client';

import React from 'react';
import { motion } from 'framer-motion';

// Curated Neon/Pastel Palette for Dark Theme
export const LIFESTYLE_COLORS = [
    { name: 'Emerald', value: 'bg-emerald-400' },
    { name: 'Rose', value: 'bg-rose-400' },
    { name: 'Violet', value: 'bg-violet-400' },
    { name: 'Amber', value: 'bg-amber-400' },
    { name: 'Cyan', value: 'bg-cyan-400' },
    { name: 'Fuchsia', value: 'bg-fuchsia-400' },
];

interface ColorOrbsProps {
    selectedColor: string;
    onSelect: (color: string) => void;
}

export default function ColorOrbs({ selectedColor, onSelect }: ColorOrbsProps) {
    return (
        <div className="flex gap-3 justify-center py-4">
            {LIFESTYLE_COLORS.map((color) => {
                const isSelected = selectedColor === color.value;
                return (
                    <motion.button
                        key={color.name}
                        onClick={() => onSelect(color.value)}
                        whileHover={{ scale: 1.2 }}
                        whileTap={{ scale: 0.9 }}
                        className={`
                            w-8 h-8 rounded-full border-2 transition-all
                            ${color.value}
                            ${isSelected ? 'border-white ring-2 ring-white/20' : 'border-transparent opacity-60 hover:opacity-100'}
                        `}
                    />
                );
            })}
        </div>
    );
}
