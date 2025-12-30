import React from 'react';

export default function BanffLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="min-h-screen bg-zinc-950 text-white font-sans selection:bg-emerald-500/30">
            {/* 
        Banff Dashboard Layout 
        - Force Dark Mode
        - Container constraints if needed
      */}
            <head>
                <link rel="manifest" href="/manifest.json" />
                <meta name="theme-color" content="#10b981" />
            </head>
            <main className="max-w-md mx-auto min-h-screen relative overflow-hidden bg-black/20 shadow-2xl ring-1 ring-white/5">
                {children}
            </main>
        </div>
    );
}
