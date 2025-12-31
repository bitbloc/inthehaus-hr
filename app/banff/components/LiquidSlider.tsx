'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { IconType } from 'react-icons';

interface LiquidSliderProps {
    value: number;
    onChange: (val: number) => void;
    min?: number;
    max?: number;
    leftIcon?: React.ReactNode;
    rightIcon?: React.ReactNode;
    colorFrom?: string;
    colorTo?: string;
    label?: string;
    color?: string;
}

export default function LiquidSlider({
    value,
    onChange,
    min = 0,
    max = 100,
    leftIcon,
    rightIcon,
    colorFrom,
    colorTo,
    label,
    color
}: LiquidSliderProps) {
    const percentage = ((value - min) / (max - min)) * 100;

    // Color Mapping
    const COLOR_VARIANTS: Record<string, { from: string; to: string }> = {
        indigo: { from: 'from-indigo-500', to: 'to-indigo-600' },
        amber: { from: 'from-amber-400', to: 'to-amber-600' }, // Adjusted for visibility
        emerald: { from: 'from-emerald-500', to: 'to-emerald-600' },
        cyan: { from: 'from-cyan-500', to: 'to-cyan-600' },
        blue: { from: 'from-blue-500', to: 'to-blue-600' },
        rose: { from: 'from-rose-500', to: 'to-rose-600' },
        purple: { from: 'from-purple-500', to: 'to-purple-600' },
    };

    // Determine colors
    let effectiveFrom = colorFrom || 'from-cyan-500';
    let effectiveTo = colorTo || 'to-blue-500';

    if (color && COLOR_VARIANTS[color]) {
        effectiveFrom = COLOR_VARIANTS[color].from;
        effectiveTo = COLOR_VARIANTS[color].to;
    }

    const handleInteraction = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const newValue = Math.round((x / rect.width) * (max - min) + min);
        onChange(newValue);
    };

    return (
        <div className="w-full">
            {label && (
                <div className="flex justify-between mb-1.5 px-1">
                    <span className="text-sm font-medium text-zinc-300">{label}</span>
                    <span className="text-xs text-zinc-500 font-mono self-end pb-0.5">{value}%</span>
                </div>
            )}
            <div className="flex items-center gap-4 w-full">
                {/* Left Icon */}
                {leftIcon && (
                    <motion.div
                        animate={{ scale: percentage < 30 ? 1.2 : 1, opacity: percentage < 30 ? 1 : 0.5 }}
                        className="text-2xl transition-colors"
                    >
                        {leftIcon}
                    </motion.div>
                )}

                {/* Slider Track */}
                <div
                    className="relative h-10 flex-1 bg-gray-800/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/5 cursor-pointer touch-none"
                    onClick={handleInteraction}
                    onMouseMove={(e) => e.buttons === 1 && handleInteraction(e)}
                    onTouchMove={handleInteraction}
                >
                    {/* Liquid Fill */}
                    <motion.div
                        layoutId={`liquid-fill-${label || 'default'}`}
                        className={`absolute top-0 left-0 h-full bg-gradient-to-r ${effectiveFrom} ${effectiveTo} shadow-[0_0_15px_rgba(255,255,255,0.2)]`}
                        style={{ width: `${percentage}%` }}
                        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                    />

                    {/* Number Overlay */}
                    <span className="absolute inset-0 flex items-center justify-center font-bold text-sm text-white mix-blend-overlay pointer-events-none">
                        {value}
                    </span>
                </div>

                {/* Right Icon */}
                {rightIcon && (
                    <motion.div
                        animate={{ scale: percentage > 70 ? 1.2 : 1, opacity: percentage > 70 ? 1 : 0.5 }}
                        className="text-2xl transition-colors"
                    >
                        {rightIcon}
                    </motion.div>
                )}
            </div>
        </div>
    );
}
