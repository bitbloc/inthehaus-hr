'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

interface WeeklyChartProps {
    data: {
        date: string; // 'Short Day' e.g. "Mon"
        mood: number;
        energy: number;
    }[];
}

// Custom Tooltip
const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
        return (
            <div className="bg-zinc-900 border border-zinc-800 p-3 rounded-xl shadow-xl">
                <p className="text-zinc-400 text-xs mb-1">{label}</p>
                <p className="text-indigo-400 text-sm font-bold">Mood: {payload[0].value}</p>
                <p className="text-amber-400 text-sm font-bold">Energy: {payload[1].value}</p>
            </div>
        );
    }
    return null;
};

export default function WeeklyChart({ data }: WeeklyChartProps) {
    // If no data, show mockup for visual
    const chartData = data.length > 0 ? data : [
        { date: 'Mon', mood: 40, energy: 60 },
        { date: 'Tue', mood: 55, energy: 50 },
        { date: 'Wed', mood: 70, energy: 75 },
        { date: 'Thu', mood: 60, energy: 65 },
        { date: 'Fri', mood: 85, energy: 80 },
        { date: 'Sat', mood: 90, energy: 85 },
        { date: 'Sun', mood: 75, energy: 70 },
    ];

    return (
        <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                        <linearGradient id="colorMood" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorEnergy" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.3} />
                            <stop offset="95%" stopColor="#fbbf24" stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    <XAxis
                        dataKey="date"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#71717a', fontSize: 12 }}
                        dy={10}
                    />
                    <YAxis hide domain={[0, 100]} />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                        type="monotone"
                        dataKey="mood"
                        stroke="#818cf8"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorMood)"
                    />
                    <Area
                        type="monotone"
                        dataKey="energy"
                        stroke="#fbbf24"
                        strokeWidth={3}
                        fillOpacity={1}
                        fill="url(#colorEnergy)"
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
}
