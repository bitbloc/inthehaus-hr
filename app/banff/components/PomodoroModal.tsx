'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlay, FaPause, FaStop, FaTimes } from 'react-icons/fa';

interface PomodoroModalProps {
    isOpen: boolean;
    onClose: () => void;
    habitTitle?: string;
    onComplete?: () => void;
}

const MODES = {
    WORK: { id: 'work', label: 'Flow', minutes: 25, color: 'text-emerald-400', bg: 'bg-emerald-500' },
    SHORT_BREAK: { id: 'short', label: 'Rest', minutes: 5, color: 'text-indigo-400', bg: 'bg-indigo-500' },
    LONG_BREAK: { id: 'long', label: 'Recharge', minutes: 15, color: 'text-amber-400', bg: 'bg-amber-500' },
};

export default function PomodoroModal({ isOpen, onClose, habitTitle, onComplete }: PomodoroModalProps) {
    const [mode, setMode] = useState<keyof typeof MODES>('WORK');
    const [timeLeft, setTimeLeft] = useState(MODES.WORK.minutes * 60);
    const [isActive, setIsActive] = useState(false);

    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (isActive && timeLeft > 0) {
            interval = setInterval(() => {
                setTimeLeft((prev) => prev - 1);
            }, 1000);
        } else if (timeLeft === 0) {
            setIsActive(false);
            // Play sound?
            if (onComplete && mode === 'WORK') onComplete();
            alert("Timer Finished!");
        }

        return () => clearInterval(interval);
    }, [isActive, timeLeft, onComplete, mode]);

    const toggleTimer = () => setIsActive(!isActive);
    const resetTimer = () => {
        setIsActive(false);
        setTimeLeft(MODES[mode].minutes * 60);
    };

    const switchMode = (newMode: keyof typeof MODES) => {
        setMode(newMode);
        setIsActive(false);
        setTimeLeft(MODES[newMode].minutes * 60);
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const progress = 1 - (timeLeft / (MODES[mode].minutes * 60));

    if (!isOpen) return null;

    return (
        <AnimatePresence>
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-md">
                <motion.div
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    exit={{ scale: 0.9, opacity: 0 }}
                    className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 relative overflow-hidden shadow-2xl"
                >
                    {/* Background Progress */}
                    <div className="absolute inset-x-0 bottom-0 h-1 bg-zinc-800">
                        <motion.div
                            className={`h-full ${MODES[mode].bg}`}
                            style={{ width: `${progress * 100}%` }}
                        />
                    </div>

                    {/* Header */}
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-xl font-bold text-white">{habitTitle || 'Focus Timer'}</h2>
                            <p className="text-zinc-500 text-xs uppercase tracking-wider">{MODES[mode].label} Mode</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
                            <FaTimes />
                        </button>
                    </div>

                    {/* Timer Display */}
                    <div className="text-center py-8">
                        <div className={`text-7xl font-mono font-bold ${MODES[mode].color} tracking-tighter`}>
                            {formatTime(timeLeft)}
                        </div>
                    </div>

                    {/* Controls */}
                    <div className="flex justify-center gap-4 mb-8">
                        <button
                            onClick={toggleTimer}
                            className={`w-16 h-16 rounded-full flex items-center justify-center text-xl transition-all ${isActive ? 'bg-zinc-800 text-zinc-300' : `${MODES[mode].bg} text-black font-bold shadow-lg shadow-${MODES[mode].bg}/20`}`}
                        >
                            {isActive ? <FaPause /> : <FaPlay className="ml-1" />}
                        </button>
                        <button
                            onClick={resetTimer}
                            className="w-16 h-16 rounded-full flex items-center justify-center text-xl bg-zinc-800 text-zinc-400 hover:bg-zinc-700 transition-colors"
                        >
                            <FaStop />
                        </button>
                    </div>

                    {/* Mode Switcher */}
                    <div className="flex justify-center gap-2">
                        {(Object.keys(MODES) as Array<keyof typeof MODES>).map((m) => (
                            <button
                                key={m}
                                onClick={() => switchMode(m)}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${mode === m ? `${MODES[m].bg} text-black` : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
                            >
                                {MODES[m].label}
                            </button>
                        ))}
                    </div>
                </motion.div>
            </div>
        </AnimatePresence>
    );
}
