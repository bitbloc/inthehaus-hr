'use client';

import React from 'react';
import { eachDayOfInterval, subDays, format, isSameDay } from 'date-fns';
import { clsx } from 'clsx';
import { Tooltip } from 'react-tooltip'; // Use basic css or custom for now if not installed

interface HabitHeatmapProps {
    logs: { date: string; count: number }[]; // Date string YYYY-MM-DD
}

export default function HabitHeatmap({ logs }: HabitHeatmapProps) {
    // Generate last 28 days for a small mobile-friendly grid
    const today = new Date();
    const days = eachDayOfInterval({
        start: subDays(today, 27),
        end: today,
    });

    const getIntensity = (dateStr: string) => {
        const log = logs.find(l => l.date === dateStr);
        if (!log) return 0;
        // Simple intensity: 0=none, 1=some, 2=good, 3=great
        if (log.count >= 5) return 3;
        if (log.count >= 3) return 2;
        if (log.count >= 1) return 1;
        return 0;
    };

    const getColor = (intensity: number) => {
        switch (intensity) {
            case 0: return 'bg-zinc-800';
            case 1: return 'bg-emerald-900';
            case 2: return 'bg-emerald-600';
            case 3: return 'bg-emerald-400';
            default: return 'bg-zinc-800';
        }
    };

    return (
        <div className="grid grid-cols-7 gap-1 w-full max-w-xs mx-auto">
            {days.map((day, i) => {
                const dateStr = format(day, 'yyyy-MM-dd');
                const intensity = getIntensity(dateStr);

                return (
                    <div
                        key={dateStr}
                        data-tooltip-id="heatmap-tooltip"
                        data-tooltip-content={`${dateStr}: ${intensity > 0 ? 'Active' : 'Rest'}`}
                        className={clsx(
                            "w-full pt-[100%] relative rounded-md transition-colors duration-300",
                            getColor(intensity)
                        )}
                    >
                        {/* Square aspect ratio hack */}
                    </div>
                );
            })}
        </div>
    );
}
