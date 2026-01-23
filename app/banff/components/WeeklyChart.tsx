'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

interface WeeklyChartProps {
    data: {
        date: string; // 'Mon'
        mood: number;
        energy: number;
        focus: number;
    }[];
}

const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900/95 backdrop-blur border border-zinc-800 p-4 rounded-xl shadow-2xl">
                <p className="text-zinc-400 text-xs mb-2 uppercase font-bold tracking-wider">{label}</p>
                <div className="space-y-1">
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-indigo-400" />
                        <span className="text-zinc-300 text-xs">อารมณ์:</span>
                        <span className="text-white text-xs font-mono">{payload[0].value}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-amber-400" />
                        <span className="text-zinc-300 text-xs">พลังงาน:</span>
                        <span className="text-white text-xs font-mono">{payload[1].value}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="w-2 h-2 rounded-full bg-emerald-400" />
                        <span className="text-zinc-300 text-xs">สมาธิ:</span>
                        <span className="text-white text-xs font-mono">{payload[2].value}</span>
                    </div>
                </div>
            </div>
        );
    }
    return null;
};

export default function WeeklyChart({ data }: WeeklyChartProps) {
    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) {
        return <div className="h-48 w-full flex items-center justify-center text-zinc-800 text-xs">กำลังโหลดกราฟ...</div>;
    }

    // Gradient definitions
    return (
        <div className="h-56 w-full -ml-2">
            <ResponsiveContainer width="100%" height="100%" minHeight={100}>
                <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorMood" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorFocus" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#34d399" stopOpacity={0.2} />
                            <stop offset="95%" stopColor="#34d399" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#27272a" opacity={0.5} />
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#71717a', fontSize: 10 }}
                        dy={10}
                    />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#52525b', strokeWidth: 1, strokeDasharray: '4 4' }} />

                    <Area type="monotone" dataKey="mood" stroke="#818cf8" strokeWidth={2} fillOpacity={1} fill="url(#colorMood)" />
                    <Area type="monotone" dataKey="energy" stroke="#fbbf24" strokeWidth={2} fillOpacity={1} fill="url(#colorEnergy)" />
                    <Area type="monotone" dataKey="focus" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#colorFocus)" />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
