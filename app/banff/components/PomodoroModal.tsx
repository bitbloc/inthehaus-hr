'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaPlay, FaPause, FaStop, FaTimes, FaPlus, FaMinus } from 'react-icons/fa';
import { useBanffStore } from '@/store/useBanffStore';

interface PomodoroModalProps {
    isOpen: boolean;
    onClose: () => void;
    habitTitle?: string;
    habitId?: string; // Need Habit ID to link
    onComplete?: () => void;
}

const MODES = {
    WORK: { id: 'work', label: 'Flow', minutes: 25, color: 'text-emerald-400', bg: 'bg-emerald-500' },
    SHORT: { id: 'short', label: 'Rest', minutes: 5, color: 'text-indigo-400', bg: 'bg-indigo-500' },
    LONG: { id: 'long', label: 'Recharge', minutes: 15, color: 'text-amber-400', bg: 'bg-amber-500' },
};

export default function PomodoroModal({ isOpen, onClose, habitTitle, habitId, onComplete }: PomodoroModalProps) {
    const { timer, startTimer, stopTimer } = useBanffStore();

    // We keep local mode selection before ensuring start
    const [localMode, setLocalMode] = useState<keyof typeof MODES>('WORK');
    const [timeLeft, setTimeLeft] = useState(MODES.WORK.minutes * 60);
    const [maxTime, setMaxTime] = useState(MODES.WORK.minutes * 60);

    // Sync with global timer if active
    useEffect(() => {
        let interval: NodeJS.Timeout;

        if (timer.active && timer.endTime) {
            // If timer runs for THIS habit (or generic if we want global singular timer)
            // Ideally we only show running state if we are THE timer modal or if we want to show global timer.
            // Let's assume global timer takeover:

            setLocalMode(timer.mode as keyof typeof MODES);
            setMaxTime(timer.duration * 60);

            const tick = () => {
                const now = Date.now();
                const diff = Math.max(0, Math.floor((timer.endTime! - now) / 1000));
                setTimeLeft(diff);
                if (diff <= 0) {
                    // Handled by GlobalListener mostly, but we can do UI cleanup
                    if (onComplete && timer.mode === 'WORK' && timer.habitId === habitId) onComplete();
                }
            };

            tick(); // Immediate
            interval = setInterval(tick, 1000);
        } else {
            // If not active, reset to local selection
            if (!isOpen) {
                // Background reset if needed
            }
        }

        return () => clearInterval(interval);
    }, [timer.active, timer.endTime, timer.mode, timer.duration, timer.habitId, habitId, onComplete, isOpen]);

    // Update local display when switching modes manually (only if timer NOT active)
    useEffect(() => {
        if (!timer.active) {
            setTimeLeft(MODES[localMode].minutes * 60);
            setMaxTime(MODES[localMode].minutes * 60);
        }
    }, [localMode, timer.active]);

    const handleStart = () => {
        if (timer.active) {
            // Pause? Or Stop? "Pause" in timestamp logic deletes endTime but keeps remaining.
            // For MVP: Stop.
            stopTimer();
        } else {
            // Start
            startTimer(
                habitId || null,
                habitTitle || 'Focus',
                localMode,
                timeLeft / 60
            );
        }
    };

    const handleStop = () => {
        stopTimer();
        const defaultTime = MODES[localMode].minutes * 60;
        setTimeLeft(defaultTime);
    };

    const adjustTime = (minutes: number) => {
        if (timer.active) return; // Don't adjust while running
        setTimeLeft(prev => Math.max(60, prev + minutes * 60));
    };

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    };

    const progress = 1 - (timeLeft / maxTime);

    // If modal is closed, we don't render? wrapper handles that. 
    // BUT if timer is running globally, we might want to show this modal?
    // User flow: Click habit -> Open Modal -> Start.
    // If they close modal -> Timer runs in bg.
    // If they open modal again -> They see running timer.

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
                            className={`h-full ${MODES[localMode].bg}`}
                            style={{ width: `${progress * 100}%` }}
                        />
                    </div>

                    {/* Header */}
                    <div className="flex justify-between items-start mb-8">
                        <div>
                            <h2 className="text-xl font-bold text-white">{habitTitle || (timer.active ? timer.habitTitle : 'Focus Timer')}</h2>
                            <p className="text-zinc-500 text-xs uppercase tracking-wider">{MODES[localMode].label} Mode</p>
                        </div>
                        <button onClick={onClose} className="p-2 hover:bg-zinc-800 rounded-full text-zinc-400">
                            <FaTimes />
                        </button>
                    </div>

                    {/* Timer Display with Adjustment controls */}
                    <div className="flex items-center justify-center gap-4 py-8">
                        {!timer.active && (
                            <button onClick={() => adjustTime(-5)} className="text-zinc-600 hover:text-white transition-colors p-2">
                                <FaMinus />
                            </button>
                        )}

                        <div className={`text-7xl font-mono font-bold ${MODES[localMode].color} tracking-tighter w-64 text-center select-none`}>
                            {formatTime(timeLeft)}
                        </div>

                        {!timer.active && (
                            <button onClick={() => adjustTime(5)} className="text-zinc-600 hover:text-white transition-colors p-2">
                                <FaPlus />
                            </button>
                        )}
                    </div>

                    {/* Controls */}
                    <div className="flex justify-center gap-4 mb-8">
                        <button
                            onClick={handleStart}
                            className={`w-16 h-16 rounded-full flex items-center justify-center text-xl transition-all ${timer.active ? 'bg-zinc-800 text-zinc-300' : `${MODES[localMode].bg} text-black font-bold shadow-lg shadow-${MODES[localMode].bg}/20`}`}
                        >
                            {timer.active ? <FaPause /> : <FaPlay className="ml-1" />}
                        </button>
                        <button
                            onClick={handleStop}
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
                                onClick={() => !timer.active && setLocalMode(m as any)}
                                className={`px-3 py-1 rounded-full text-xs font-bold transition-colors ${localMode === m ? `${MODES[m].bg} text-black` : 'bg-zinc-800 text-zinc-500 hover:text-zinc-300'} ${timer.active ? 'opacity-50 cursor-not-allowed' : ''}`}
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
