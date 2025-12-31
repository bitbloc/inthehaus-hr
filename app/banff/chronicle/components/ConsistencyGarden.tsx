'use client';

import React from 'react';
import { interpolateRgb } from 'd3-interpolate';
import { format, eachDayOfInterval, subDays, startOfWeek, endOfWeek, isSameDay } from 'date-fns';

// ---------------------------
// Type Definitions
// ---------------------------
type DailyLog = {
    date: Date;
    count: number; // Habit count
    mood?: number; // Avg mood 0-100
};

interface ConsistencyGardenProps {
    data: DailyLog[]; // Expects array of logs
}

// ---------------------------
// Helper: Color Scale
// ---------------------------
// Black (Empty) -> Emerald (Full)
const getColor = (count: number, max: number) => {
    if (count === 0) return '#18181b'; // zinc-900
    const intensity = Math.min(count / Math.max(max, 1), 1);
    // Simple interpolation or class based 
    // Let's use classes for glow effects mainly, but inline color for precision if needed
    // Actually, requested "Glowing Dots".
    if (intensity < 0.3) return 'bg-emerald-900/40 shadow-none';
    if (intensity < 0.6) return 'bg-emerald-600/60 shadow-[0_0_8px_rgba(16,185,129,0.4)]';
    return 'bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]';
};

export default function ConsistencyGarden({ data }: ConsistencyGardenProps) {
    // Generate last 365 days or similarly large range
    const today = new Date();
    // Start from 52 weeks ago
    // const startDate = startOfWeek(subDays(today, 364)); // Roughly 1 year
    // Actually typically GitHub style is ~53 columns
    const startDate = subDays(today, 365);

    const days = eachDayOfInterval({ start: startDate, end: today });

    // Map data for fast lookup
    const dataMap = new Map<string, DailyLog>();
    let maxCount = 0;
    data.forEach(d => {
        const k = format(d.date, 'yyyy-MM-dd');
        dataMap.set(k, d);
        if (d.count > maxCount) maxCount = d.count;
    });

    // Group by weeks for Grid (Column = Week, Row = Day)
    // CSS Grid Flow Column is easier: 
    // grid-template-rows: repeat(7, 1fr)
    // grid-auto-flow: column

    return (
        <div className="w-full overflow-x-auto pb-4 custom-scrollbar">
            <div className="inline-grid grid-rows-7 grid-flow-col gap-1.5 p-2">
                {days.map((day) => {
                    const dateKey = format(day, 'yyyy-MM-dd');
                    const log = dataMap.get(dateKey);
                    const count = log?.count || 0;
                    const mood = log?.mood ?? 0;

                    const colorClass = getColor(count, maxCount || 5); // Default max 5 habits

                    return (
                        <div
                            key={dateKey}
                            data-tooltip-id="garden-tooltip"
                            data-tooltip-content={`${dateKey}: ${count} habits, Mood: ${mood}`}
                            className={`w-3 h-3 rounded-full transition-all duration-300 hover:scale-125 ${colorClass}`}
                        >
                            {/* Hidden text/readers */}
                            <span className="sr-only">{dateKey}: {count} habits</span>
                        </div>
                    );
                })}
            </div>
            {/* Legend / Scrollytelling hints could go here */}
            <div className="mt-2 flex justify-end items-center gap-2 text-xs text-zinc-500 pr-4">
                <span>Less</span>
                <div className="w-2 h-2 rounded-full bg-emerald-900/40" />
                <div className="w-2 h-2 rounded-full bg-emerald-600/60" />
                <div className="w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_12px_rgba(52,211,153,0.8)]" />
                <span>More</span>
            </div>
        </div>
    );
}
