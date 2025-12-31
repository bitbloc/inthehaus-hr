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
}

export default function LiquidSlider({
    value,
    onChange,
    min = 0,
    max = 10,
    leftIcon,
    rightIcon,
    colorFrom = 'from-cyan-500',
    colorTo = 'to-blue-500'
}: LiquidSliderProps) {
    const percentage = ((value - min) / (max - min)) * 100;

    const handleInteraction = (e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>) => {
        const rect = e.currentTarget.getBoundingClientRect();
        const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
        const x = Math.max(0, Math.min(clientX - rect.left, rect.width));
        const newValue = Math.round((x / rect.width) * (max - min) + min);
        onChange(newValue);
    };

    return (
        <div className="flex items-center gap-4 w-full">
            {/* Left Icon */}
            <motion.div
                animate={{ scale: percentage < 30 ? 1.2 : 1, opacity: percentage < 30 ? 1 : 0.5 }}
                className="text-2xl transition-colors"
            >
                {leftIcon}
            </motion.div>

            {/* Slider Track */}
            <div
                className="relative h-12 flex-1 bg-gray-800/50 rounded-full overflow-hidden backdrop-blur-sm border border-white/5 cursor-pointer touch-none"
                onClick={handleInteraction}
                onMouseMove={(e) => e.buttons === 1 && handleInteraction(e)}
                onTouchMove={handleInteraction}
            >
                {/* Liquid Fill */}
                <motion.div
                    layoutId="liquid-fill"
                    className={`absolute top-0 left-0 h-full bg-gradient-to-r ${colorFrom} ${colorTo} shadow-[0_0_15px_rgba(255,255,255,0.2)]`}
                    style={{ width: `${percentage}%` }}
                    transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                />

                {/* Number Overlay */}
                <span className="absolute inset-0 flex items-center justify-center font-bold text-lg text-white mix-blend-overlay pointer-events-none">
                    {value}
                </span>
            </div>

            {/* Right Icon */}
            <motion.div
                animate={{ scale: percentage > 70 ? 1.2 : 1, opacity: percentage > 70 ? 1 : 0.5 }}
                className="text-2xl transition-colors"
            >
                {rightIcon}
            </motion.div>
        </div>
    );
}
