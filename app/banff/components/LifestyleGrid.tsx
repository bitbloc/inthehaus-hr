'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FaHeart, FaBrain, FaWallet, FaLeaf, FaPlus, FaCog, FaDumbbell, FaGamepad, FaMoon, FaWater, FaSun, FaStar } from 'react-icons/fa';
import { useBanffStore } from '@/store/useBanffStore';
import ColorOrbs from './ColorOrbs';
import LifestyleForm from './LifestyleForm';
import LifestyleEditModal from './LifestyleEditModal';
import { FaTimes } from 'react-icons/fa';

// Map icons roughly - ideally this should be a shared helper or dynamic
const ICONS: Record<string, React.ReactNode> = {
    heart: <FaHeart />,
    brain: <FaBrain />,
    wallet: <FaWallet />,
    leaf: <FaLeaf />,
    dumbbell: <FaDumbbell />,
    gamepad: <FaGamepad />,
    moon: <FaMoon />,
    water: <FaWater />,
    sun: <FaSun />,
    star: <FaStar />,
};

// Helper for Level Calculation
const calculateLevel = (xp: number = 0) => {
    // Simple formula: Level = floor(sqrt(xp / 100)) + 1
    // e.g. 0-99 = Lv1, 100-399 = Lv2, 400-899 = Lv3...
    return Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1;
};

// Helper for Progress % (within current level)
const calculateProgress = (xp: number = 0) => {
    const level = calculateLevel(xp);
    // XP required for current level start
    // Reverse formula: xp = (level - 1)^2 * 100
    const currentLevelBaseXP = Math.pow(level - 1, 2) * 100;
    const nextLevelBaseXP = Math.pow(level, 2) * 100;

    const xpInLevel = xp - currentLevelBaseXP;
    const xpNeeded = nextLevelBaseXP - currentLevelBaseXP;

    return Math.min(100, Math.max(0, (xpInLevel / xpNeeded) * 100));
};

export default function LifestyleGrid() {
    // Connect to Store
    const lifestyles = useBanffStore(state => state.lifestyles);
    const selectedLifestyleId = useBanffStore(state => state.selectedLifestyleId);
    const setSelectedLifestyleId = useBanffStore(state => state.setSelectedLifestyleId);

    const [editingId, setEditingId] = React.useState<string | null>(null);
    const [showAdd, setShowAdd] = React.useState(false);

    const handleCardClick = (id: string) => {
        if (selectedLifestyleId === id) {
            setSelectedLifestyleId(null); // Deselect
        } else {
            setSelectedLifestyleId(id); // Select
        }
    };

    const handleEditClick = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setEditingId(id);
    };

    const editingLifestyle = React.useMemo(() =>
        lifestyles.find(l => l.id === editingId),
        [lifestyles, editingId]);

    return (
        <>
            <div className="grid grid-cols-2 gap-3 text-white">
                {lifestyles.map((item) => {
                    const isSelected = selectedLifestyleId === item.id;
                    const isDimmed = selectedLifestyleId !== null && !isSelected;
                    const level = calculateLevel(item.xp);
                    const progress = calculateProgress(item.xp);

                    // Dynamic styling based on selection
                    let borderColor = 'emerald';
                    if (item.color?.startsWith('bg-')) {
                        borderColor = item.color.split('-')[1];
                    } else if (item.color?.startsWith('#')) {
                        // Very rough fallback if hex is used; for now default to emerald to avoid broken classes
                        // or try to map?
                        borderColor = 'emerald';
                    }

                    return (
                        <motion.div
                            key={item.id}
                            layoutId={`lifestyle-${item.id}`}
                            className={`
                                relative rounded-2xl p-4 flex flex-col justify-between h-36 overflow-hidden transition-all duration-300 cursor-pointer
                                ${isSelected
                                    ? `bg-zinc-900 border-2 border-${borderColor}-500 shadow-[0_0_20px_rgba(255,255,255,0.1)]`
                                    : 'bg-zinc-900 border border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800'}
                                ${isDimmed ? 'opacity-30 grayscale-[50%] scale-95' : 'opacity-100 scale-100'}
                            `}
                            onClick={() => handleCardClick(item.id)}
                        >
                            {/* Header */}
                            <div className="flex justify-between items-start z-10">
                                <div className={`p-2 rounded-xl bg-zinc-800/50 text-zinc-400 ${isSelected ? `text-${borderColor}-400 bg-${borderColor}-500/10` : 'group-hover:text-white'} transition-colors`}>
                                    {ICONS[item.icon] || <FaPlus />}
                                </div>

                                <button
                                    onClick={(e) => handleEditClick(e, item.id)}
                                    className="p-2 text-zinc-600 hover:text-white transition-colors"
                                >
                                    <FaCog />
                                </button>
                            </div>

                            {/* Body */}
                            <div className="z-10 mt-2">
                                <h3 className={`font-bold text-lg tracking-tight leading-none mb-1 ${isSelected ? 'text-white' : 'text-zinc-200'}`}>
                                    {item.name}
                                </h3>

                                <div className="flex items-center gap-2">
                                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">LV. {level}</span>
                                    {/* XP Bar */}
                                    <div className="flex-1 h-1.5 bg-zinc-800 rounded-full overflow-hidden">
                                        <motion.div
                                            className={`h-full bg-${borderColor}-500`}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${progress}%` }}
                                            transition={{ duration: 1, ease: "easeOut" }}
                                        />
                                    </div>
                                </div>
                            </div>

                            {/* Background Glow for Selected */}
                            {isSelected && (
                                <div className={`absolute inset-0 bg-${borderColor}-500/5 z-0`} />
                            )}
                        </motion.div>
                    );
                })}

                {/* Add New Card */}
                <button
                    onClick={() => setShowAdd(true)}
                    className={`h-36 rounded-2xl border-2 border-dashed border-zinc-800 flex flex-col items-center justify-center text-zinc-600 hover:text-zinc-400 hover:border-zinc-600 transition-all gap-2 ${selectedLifestyleId ? 'opacity-30' : ''}`}
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

            {/* Edit Modal */}
            {editingLifestyle && (
                <LifestyleEditModal
                    isOpen={!!editingLifestyle}
                    onClose={() => setEditingId(null)}
                    lifestyle={editingLifestyle}
                />
            )}
        </>
    );
}
