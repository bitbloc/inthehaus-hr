'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { FaArrowLeft, FaWallet, FaHistory, FaPiggyBank, FaUniversity, FaQrcode, FaCheckCircle, FaTimes } from 'react-icons/fa';
import { useBanffStore } from '@/store/useBanffStore';
import { format, parseISO } from 'date-fns';

export default function VaultPage() {
    const { vaultBalance, vaultTransactions, recentLogs, habits, redeemVault } = useBanffStore();
    const [showRedeem, setShowRedeem] = useState(false);
    const [redeemSuccess, setRedeemSuccess] = useState(false);

    // Merge History: Transactions + Earnings from Logs
    const history = React.useMemo(() => {
        const earnings = recentLogs
            .filter(l => (l.earned_value || 0) > 0)
            .map(l => {
                const habit = habits.find(h => h.id === l.habit_id);
                return {
                    id: l.id,
                    type: 'EARN',
                    amount: l.earned_value || 0,
                    description: habit ? (habit.is_saver ? `${habit.title} saved` : `${habit.title} earned`) : 'Habit Activity',
                    date: l.completed_at
                };
            });

        const txs = vaultTransactions.map(t => ({
            id: t.id,
            type: t.type, // 'REDEEM' | 'PENALTY'
            amount: t.amount, // Negative usually
            description: t.description,
            date: t.created_at
        }));

        return [...earnings, ...txs].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    }, [recentLogs, vaultTransactions, habits]);

    // Wishlist Logic (MVP Hardcoded or Local State)
    const wishlist = [
        { id: 1, name: 'Garmin Forerunner', price: 15000, image: '⌚' },
        { id: 2, name: 'New Bicycle Wheel', price: 20000, image: '🚲' }
    ];

    const handleCommit = () => {
        // Commit logic: Redeem current week's earnings or fixed amount?
        // Scenario says "Commit to Savings" -> Transfer real money.
        // Let's assume we transfer EVERYTHING available? Or user inputs?
        // Let's default to a "Weekly round up" or just "Transfer 500".
        // Simpler: Transfer accumulated balance.
        if (vaultBalance <= 0) return;

        redeemVault(vaultBalance, 'Transfer to Savings Account');
        setRedeemSuccess(true);
        setTimeout(() => {
            setRedeemSuccess(false);
            setShowRedeem(false);
        }, 3000);
    };

    return (
        <div className="min-h-screen bg-black text-white p-6 pb-24 font-sans">
            {/* Header */}
            <div className="flex items-center gap-4 mb-8">
                <Link href="/banff" className="p-2 rounded-full bg-zinc-900 text-zinc-400 hover:text-white transition-colors">
                    <FaArrowLeft />
                </Link>
                <h1 className="text-xl font-bold">The Virtue Vault</h1>
            </div>

            {/* Main Balance Card */}
            <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-gradient-to-br from-zinc-900 to-zinc-950 border border-zinc-800 p-8 rounded-[2rem] flex flex-col items-center justify-center relative overflow-hidden shadow-2xl mb-8"
            >
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(16,185,129,0.15),transparent_70%)]" />

                <span className="text-zinc-500 uppercase tracking-widest text-xs font-bold mb-2 z-10">Total Savings</span>
                <h2 className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-b from-white to-zinc-400 font-mono z-10 tracking-tighter">
                    ฿{vaultBalance.toLocaleString()}
                </h2>

                <button
                    onClick={() => setShowRedeem(true)}
                    className="mt-8 px-6 py-3 bg-emerald-500 hover:bg-emerald-400 text-black font-bold rounded-full shadow-lg shadow-emerald-500/20 active:scale-95 transition-all z-10 flex items-center gap-2"
                >
                    <FaUniversity /> Commit to Savings
                </button>
            </motion.div>

            {/* Wishlist Progress */}
            <div className="space-y-4 mb-10">
                <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                    <FaPiggyBank /> Wishlist Targets
                </h3>
                {wishlist.map(item => {
                    const progress = Math.min(100, Math.max(0, (vaultBalance / item.price) * 100));
                    const remaining = Math.max(0, item.price - vaultBalance);

                    return (
                        <div key={item.id} className="bg-zinc-900/50 p-4 rounded-2xl border border-zinc-800/50">
                            <div className="flex justify-between items-center mb-2">
                                <span className="font-medium flex items-center gap-2">
                                    <span className="text-2xl">{item.image}</span> {item.name}
                                </span>
                                <span className="text-xs text-zinc-500 font-mono">{Math.round(progress)}%</span>
                            </div>
                            <div className="h-2 bg-zinc-800 rounded-full overflow-hidden">
                                <motion.div
                                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 1, delay: 0.5 }}
                                />
                            </div>
                            {remaining > 0 ? (
                                <p className="text-xs text-zinc-500 mt-2 text-right">Need ฿{remaining.toLocaleString()} more</p>
                            ) : (
                                <p className="text-xs text-emerald-400 mt-2 text-right font-bold">Ready to Buy!</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Transaction History */}
            <div className="space-y-4">
                <h3 className="text-sm font-medium text-zinc-400 flex items-center gap-2">
                    <FaHistory /> Recent Flows
                </h3>
                <div className="space-y-3">
                    {history.length === 0 ? (
                        <p className="text-zinc-600 text-center py-4 text-sm">No transactions yet.</p>
                    ) : (
                        history.map((tx, i) => (
                            <motion.div
                                key={tx.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="flex items-center justify-between p-4 bg-zinc-900/30 border border-zinc-800/30 rounded-xl"
                            >
                                <div className="flex flex-col">
                                    <span className="font-medium text-zinc-200">{tx.description}</span>
                                    <span className="text-xs text-zinc-500">{format(new Date(tx.date), 'MMM d, h:mm a')}</span>
                                </div>
                                <span className={`font-mono font-bold ${tx.amount > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                    {tx.amount > 0 ? '+' : ''}{tx.amount.toLocaleString()}
                                </span>
                            </motion.div>
                        ))
                    )}
                </div>
            </div>

            {/* Redeem/Commit Modal */}
            <AnimatePresence>
                {showRedeem && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
                        <motion.div
                            initial={{ scale: 0.9, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.9, opacity: 0 }}
                            className="bg-zinc-900 border border-zinc-800 rounded-3xl w-full max-w-sm p-6 relative overflow-hidden text-center"
                        >
                            {!redeemSuccess ? (
                                <>
                                    <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mx-auto mb-4 text-emerald-500">
                                        <FaUniversity className="text-3xl" />
                                    </div>
                                    <h3 className="text-xl font-bold mb-2">Transfer to Savings</h3>
                                    <p className="text-zinc-400 text-sm mb-6">
                                        Move your mental wealth to real wealth. Transfer <span className="text-white font-bold">฿{vaultBalance.toLocaleString()}</span> to your savings account.
                                    </p>

                                    {/* Mock QR */}
                                    <div className="bg-white p-4 rounded-xl w-48 h-48 mx-auto mb-6 flex items-center justify-center">
                                        <FaQrcode className="text-black text-6xl opacity-20" />
                                        <p className="absolute text-black font-bold text-xs opacity-50">PROMPTPAY QR</p>
                                    </div>

                                    <div className="flex gap-3">
                                        <button
                                            onClick={() => setShowRedeem(false)}
                                            className="flex-1 py-3 rounded-xl bg-zinc-800 hover:bg-zinc-700 text-zinc-300 transition-colors"
                                        >
                                            Cancel
                                        </button>
                                        <button
                                            onClick={handleCommit}
                                            className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-bold transition-colors"
                                        >
                                            Done
                                        </button>
                                    </div>
                                </>
                            ) : (
                                <div className="py-10">
                                    <motion.div
                                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                                        className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center mx-auto mb-4"
                                    >
                                        <FaCheckCircle className="text-black text-4xl" />
                                    </motion.div>
                                    <h3 className="text-2xl font-bold text-emerald-400 mb-2">Wealth Secured!</h3>
                                    <p className="text-zinc-500">Your savings are now real.</p>
                                </div>
                            )}
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </div>
    );
}
