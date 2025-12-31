'use client';

import React from 'react';
import {
    ComposedChart,
    Line,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    Legend,
    ResponsiveContainer,
    Area
} from 'recharts';

interface CorrelationData {
    name: string; // Date or Month
    questCount: number;
    mood: number;
}

interface CorrelationChartProps {
    data: CorrelationData[];
}

export default function CorrelationChart({ data }: CorrelationChartProps) {
    if (!data || data.length === 0) {
        return <div className="text-zinc-500 text-center py-10">Not enough data for correlation yet.</div>;
    }

    return (
        <div className="w-full h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={data} margin={{ top: 20, right: 20, bottom: 20, left: -20 }}>
                    <CartesianGrid stroke="#3f3f46" strokeDasharray="3 3" vertical={false} opacity={0.4} />
                    <XAxis
                        dataKey="name"
                        stroke="#71717a"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                    />

                    {/* Left Axis: Quests (Bars) */}
                    <YAxis
                        yAxisId="left"
                        stroke="#71717a"
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        label={{ value: 'Habits', angle: -90, position: 'insideLeft', fill: '#52525b', fontSize: 10 }}
                    />

                    {/* Right Axis: Mood (Line) */}
                    <YAxis
                        yAxisId="right"
                        orientation="right"
                        stroke="#10B981"
                        domain={[0, 100]}
                        fontSize={10}
                        tickLine={false}
                        axisLine={false}
                        label={{ value: 'Mood', angle: 90, position: 'insideRight', fill: '#10B981', fontSize: 10 }}
                    />

                    <Tooltip
                        contentStyle={{ backgroundColor: '#18181b', borderColor: '#27272a', borderRadius: '8px' }}
                        itemStyle={{ fontSize: '12px' }}
                        labelStyle={{ color: '#a1a1aa', marginBottom: '4px' }}
                    />

                    <Bar
                        yAxisId="left"
                        dataKey="questCount"
                        barSize={20}
                        fill="#3f3f46"
                        radius={[4, 4, 0, 0]}
                        opacity={0.3}
                        name="Habits Completed"
                    />

                    <Line
                        yAxisId="right"
                        type="monotone"
                        dataKey="mood"
                        stroke="#10B981"
                        strokeWidth={3}
                        dot={false}
                        activeDot={{ r: 6, strokeWidth: 0, fill: '#34d399' }}
                        name="Average Mood"
                    />
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
}
