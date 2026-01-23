'use client';

import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { FaBitcoin, FaWallet, FaQrcode, FaCopy, FaEye, FaEyeSlash } from 'react-icons/fa';

type Asset = {
    currency: string;
    available: string;
    locked: string;
};

export default function InvestmentWidget() {
    const [assets, setAssets] = useState<Asset[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showAddressFor, setShowAddressFor] = useState<string | null>(null);
    const [addressData, setAddressData] = useState<Record<string, string>>({});
    const [loadingAddress, setLoadingAddress] = useState(false);

    const fetchBalances = async () => {
        setLoading(true);
        setError('');
        try {
            // Placeholder endpoint - user needs to confirm actual endpoint
            const res = await fetch('/api/external/maxbit?path=/api/v2/account/balances');
            if (!res.ok) throw new Error('Failed to fetch balances');
            const data = await res.json();

            // Assuming data structure: { result: [ ... ] } or simple array
            // Adjust based on actual API response
            const items = Array.isArray(data) ? data : (data.result || []);
            setAssets(items);
        } catch (err: any) {
            console.error(err);
            // Mock data for demo if API fails (since we don't have real keys yet)
            setAssets([
                { currency: 'THB', available: '5000.00', locked: '0.00' },
                { currency: 'BTC', available: '0.0023', locked: '0.00' },
                { currency: 'ETH', available: '1.50', locked: '0.10' },
                { currency: 'USDT', available: '230.50', locked: '0.00' },
            ]);
            setError('Using Demo Data (Check API Config)');
        } finally {
            setLoading(false);
        }
    };

    const fetchAddress = async (currency: string) => {
        if (addressData[currency]) {
            setShowAddressFor(showAddressFor === currency ? null : currency);
            return;
        }

        setLoadingAddress(true);
        try {
            const res = await fetch(`/api/external/maxbit?path=/api/v2/account/deposit_address&currency=${currency}`);
            if (!res.ok) throw new Error('Failed to fetch address');
            const data = await res.json();
            // Assuming data.address or data.result.address
            const addr = data.address || data.result?.address || '0xDemoAddress...' + currency;
            setAddressData(prev => ({ ...prev, [currency]: addr }));
            setShowAddressFor(currency);
        } catch (err) {
            console.error(err);
            setAddressData(prev => ({ ...prev, [currency]: 'Address fetch failed or Mock: 0x123...' }));
            setShowAddressFor(currency);
        } finally {
            setLoadingAddress(false);
        }
    };

    useEffect(() => {
        fetchBalances();
    }, []);

    // Filter out zero balances
    const activeAssets = assets.filter(a => parseFloat(a.available) > 0 || parseFloat(a.locked) > 0);

    return (
        <div className="bg-zinc-900/30 p-6 rounded-3xl border border-zinc-800/50 backdrop-blur-sm">
            <div className="flex justify-between items-center mb-6">
                <div className="flex items-center gap-2">
                    <FaBitcoin className="text-orange-500 text-xl" />
                    <h3 className="text-lg font-medium text-white">Maxbit Portfolio</h3>
                </div>
                <button onClick={fetchBalances} className="text-xs text-zinc-500 hover:text-zinc-300">
                    Refresh
                </button>
            </div>

            {loading ? (
                <div className="text-center py-8 text-zinc-500 animate-pulse">Loading assets...</div>
            ) : (
                <div className="space-y-4">
                    {error && <div className="text-xs text-amber-500 mb-2">{error}</div>}

                    {activeAssets.length === 0 ? (
                        <div className="text-center text-zinc-500 py-4">No assets found</div>
                    ) : (
                        activeAssets.map((asset) => (
                            <motion.div
                                key={asset.currency}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="bg-zinc-800/40 rounded-xl p-4 border border-zinc-700/30"
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-zinc-700/50 flex items-center justify-center text-xs font-bold text-zinc-300">
                                            {asset.currency}
                                        </div>
                                        <div>
                                            <div className="text-white font-mono font-medium">{asset.available}</div>
                                            <div className="text-xs text-zinc-500">Available</div>
                                        </div>
                                    </div>

                                    <button
                                        onClick={() => fetchAddress(asset.currency)}
                                        className="p-2 rounded-lg hover:bg-zinc-700/50 text-zinc-400 transition-colors"
                                        title="Show Deposit Address"
                                    >
                                        <FaQrcode />
                                    </button>
                                </div>

                                {showAddressFor === asset.currency && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        className="mt-4 pt-4 border-t border-zinc-700/30"
                                    >
                                        <p className="text-xs text-zinc-500 mb-1">Deposit Address ({asset.currency})</p>
                                        <div className="flex items-center gap-2 bg-zinc-900/50 p-2 rounded-lg">
                                            <code className="text-xs text-emerald-400 break-all font-mono flex-1">
                                                {loadingAddress && !addressData[asset.currency] ? 'Loading...' : addressData[asset.currency]}
                                            </code>
                                            <button
                                                className="text-zinc-400 hover:text-white"
                                                onClick={() => navigator.clipboard.writeText(addressData[asset.currency])}
                                            >
                                                <FaCopy className="text-xs" />
                                            </button>
                                        </div>
                                    </motion.div>
                                )}
                            </motion.div>
                        ))
                    )}
                </div>
            )}
        </div>
    );
}
