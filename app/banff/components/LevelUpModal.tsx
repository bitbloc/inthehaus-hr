'use client';

import React, { useEffect } from 'react';
// @ts-ignore
import confetti from 'canvas-confetti';
import { motion, AnimatePresence } from 'framer-motion';

interface LevelUpModalProps {
    level: number;
    show: boolean;
    onClose: () => void;
}

export default function LevelUpModal({ level, show, onClose }: LevelUpModalProps) {
    useEffect(() => {
        if (show) {
            const duration = 3 * 1000;
            const animationEnd = Date.now() + duration;
            const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 9999 };

            const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

            const interval: any = setInterval(function () {
                const timeLeft = animationEnd - Date.now();

                if (timeLeft <= 0) {
                    return clearInterval(interval);
                }

                const particleCount = 50 * (timeLeft / duration);
                confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
                confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
            }, 250);

            return () => clearInterval(interval);
        }
    }, [show]);

    return (
        <AnimatePresence>
            {show && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                    />
                    <motion.div
                        initial={{ scale: 0.5, y: 100, opacity: 0 }}
                        animate={{ scale: 1, y: 0, opacity: 1 }}
                        exit={{ scale: 0.9, opacity: 0 }}
                        className="relative bg-zinc-900 border border-emerald-500/50 p-8 rounded-3xl text-center max-w-sm w-full shadow-2xl shadow-emerald-500/20"
                    >
                        <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-emerald-200 mb-2">
                            LEVEL UP!
                        </h2>
                        <div className="text-6xl font-bold text-emerald-500 mb-4 drop-shadow-[0_0_15px_rgba(16,185,129,0.5)]">
                            {level}
                        </div>
                        <p className="text-zinc-400 mb-6">You are becoming a better version of yourself.</p>
                        <button
                            onClick={onClose}
                            className="px-6 py-2 bg-emerald-500 text-black font-bold rounded-full hover:bg-emerald-400 transition-colors"
                        >
                            Keep Flowing
                        </button>
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
