'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { FaHeart, FaBrain, FaWallet, FaLeaf, FaPlus } from 'react-icons/fa';
import { Lifestyle } from '@/types/banff';
import ColorOrbs from './ColorOrbs';

// Map icons roughly for MVP demo
const ICONS: Record<string, React.ReactNode> = {
    heart: <FaHeart />,
    brain: <FaBrain />,
    wallet: <FaWallet />,
    leaf: <FaLeaf />,
};

interface LifestyleGridProps {
    lifestyles: Lifestyle[];
}

import LifestyleForm from './LifestyleForm';
import { AnimatePresence } from 'framer-motion';
import { FaTimes } from 'react-icons/fa';

export default function LifestyleGrid({ lifestyles }: LifestyleGridProps) {
    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [showAdd, setShowAdd] = React.useState(false);

    // Filter out lifestyles that are already in the list if passed from props
    // but in this component we might just display what's passed.

    // Quick handle color change (mock for now or wired to store if we passed a handler)
    const handleColorChange = (id: string, color: string) => {
        console.log("Color changed", id, color);
    };

    return (
        <>
            <div className="grid grid-cols-2 gap-3 text-white">
                {lifestyles.map((item) => (
                    <motion.div
                        key={item.id}
                        layoutId={`lifestyle-${item.id}`}
                        className="relative bg-zinc-900 border border-zinc-800 rounded-2xl p-4 flex flex-col justify-between h-32 overflow-hidden group hover:border-zinc-700 transition-colors cursor-pointer"
                        onClick={() => setEditingId(editingId === item.id ? null : item.id)}
                    >
                        <div className="flex justify-between items-start">
                            <div className={`p-2 rounded-full bg-zinc-800 text-zinc-400 group-hover:text-white transition-colors`}>
                                {ICONS[item.icon] || <FaPlus />}
                            </div>
                            <div className={`w-3 h-3 rounded-full ${item.color} shadow-[0_0_10px_rgba(255,255,255,0.3)]`} />
                        </div>

                        <div>
                            <h3 className="font-bold text-lg tracking-tight">{item.name}</h3>
                            <p className="text-[10px] text-zinc-500 uppercase tracking-widest">Lv. 1</p>
                        </div>

                        {/* Edit Overlay (Color Orbs) */}
                        {editingId === item.id && (
                            <motion.div
                                initial={{ opacity: 0, backdropFilter: 'blur(0px)' }}
                                animate={{ opacity: 1, backdropFilter: 'blur(8px)' }}
                                className="absolute inset-0 bg-black/60 z-10 flex flex-col items-center justify-center p-2"
                            >
                                <ColorOrbs
                                    selectedColor={item.color}
                                    onSelect={(c) => handleColorChange(item.id, c)}
                                />
                            </motion.div>
                        )}
                    </motion.div>
                ))}

                {/* Add New Card */}
                <button
                    onClick={() => setShowAdd(true)}
                    className="h-32 rounded-2xl border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-all gap-2"
                >
                    <FaPlus className="text-xl" />
                    <span className="text-xs font-bold uppercase tracking-widest">Add Soul</span>
                </button>
            </div>

            {/* Modal for Adding Lifestyle */}
            <AnimatePresence>
                {showAdd && (
                    <>
                        <motion.div
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
                            onClick={() => setShowAdd(false)}
                        />
                        <motion.div
                            initial={{ opacity: 0, scale: 0.9, y: 20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.9, y: 20 }}
                            className="fixed inset-x-4 top-[10%] max-w-sm mx-auto bg-zinc-900 border border-zinc-800 rounded-3xl p-6 z-50 overflow-hidden"
                        >
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="text-xl font-bold text-white">New Soul</h3>
                                <button onClick={() => setShowAdd(false)} className="text-zinc-500 hover:text-white"><FaTimes /></button>
                            </div>
                            <LifestyleForm onClose={() => setShowAdd(false)} />
                        </motion.div>
                    </>
                )}
            </AnimatePresence>
        </>
    );
}
