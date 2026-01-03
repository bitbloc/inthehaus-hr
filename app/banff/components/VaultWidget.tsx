'use client';

import Link from 'next/link';
import { useBanffStore } from '@/store/useBanffStore';
import { motion } from 'framer-motion';
import { FaWallet, FaArrowRight } from 'react-icons/fa';

export default function VaultWidget() {
    const { vaultBalance } = useBanffStore();

    return (
        <Link href="/banff/vault">
            <motion.div
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                className="bg-gradient-to-r from-zinc-900 to-zinc-900 border border-zinc-800 p-4 rounded-3xl flex items-center justify-between cursor-pointer group shadow-lg hover:shadow-emerald-500/10 hover:border-emerald-500/30 transition-all"
            >
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                        <FaWallet className="text-xl" />
                    </div>
                    <div>
                        <p className="text-zinc-500 text-xs uppercase tracking-wider font-semibold">Virtue Vault</p>
                        <p className="text-2xl font-bold text-white font-mono">฿ {vaultBalance.toLocaleString()}</p>
                    </div>
                </div>

                <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-zinc-400 group-hover:bg-emerald-500 group-hover:text-white transition-colors">
                    <FaArrowRight className="text-sm" />
                </div>
            </motion.div>
        </Link>
    );
}
