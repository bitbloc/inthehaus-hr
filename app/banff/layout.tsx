import React from 'react';
import GlobalTimerListener from './components/GlobalTimerListener';

export default function BanffLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500/30">
            <GlobalTimerListener />
            <main className="max-w-md mx-auto min-h-screen relative overflow-hidden bg-black/20 shadow-2xl ring-1 ring-white/5">
                {children}
            </main>
        </div>
    );
}

