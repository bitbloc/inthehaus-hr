'use client';

import React, { useState } from 'react';
import { motion, useMotionValue, useTransform } from 'framer-motion';

interface LiquidSliderProps {
    label: string;
    value: number; // 0-100
    onChange: (value: number) => void;
    color?: string; // Tailwind color class prefix e.g 'emerald'
}

export default function LiquidSlider({ label, value, onChange, color = 'emerald' }: LiquidSliderProps) {
    const [isDragging, setIsDragging] = useState(false);
    // We can use a simple range input for logic, and customize the visual

    return (
        <div className="space-y-2">
            <div className="flex justify-between text-xs uppercase tracking-wider font-bold text-zinc-500">
                <span>{label}</span>
                <span>{value}%</span>
            </div>

            <div className="relative h-12 w-full touch-none select-none">
                {/* Background Track */}
                <div className="absolute inset-0 bg-zinc-900 rounded-2xl overflow-hidden border border-zinc-800">
                    {/* Liquid Fill */}
                    <motion.div
                        className={`h-full bg-${color}-500/20`}
                        style={{ width: `${value}%` }}
                        animate={{ width: `${value}%` }}
                        transition={{ type: 'spring', bounce: 0, duration: 0.3 }}
                    >
                        {/* Shimmer effect could go here */}
                    </motion.div>
                </div>

                {/* Input (Invisible but interactive) */}
                <input
                    type="range"
                    min="0"
                    max="100"
                    value={value}
                    onChange={(e) => onChange(parseInt(e.target.value))}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                />

                {/* Knob / Visual Indicator */}
                <motion.div
                    className="absolute top-0 bottom-0 w-1 bg-white/50 pointer-events-none"
                    style={{ left: `${value}%` }}
                    animate={{ left: `${value}%` }}
                    transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
                />
            </div>
        </div>
    );
}
