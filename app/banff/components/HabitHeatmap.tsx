'use client';

import React from 'react';
import { eachDayOfInterval, subDays, format, isSameDay } from 'date-fns';
import { clsx } from 'clsx';
import { Tooltip } from 'react-tooltip'; // Use basic css or custom for now if not installed

import { HabitLog } from '@/types/banff';

interface HabitHeatmapProps {
    logs: HabitLog[];
}

export default function HabitHeatmap({ logs }: HabitHeatmapProps) {
    // Generate last 28 days for a small mobile-friendly grid
    const today = new Date();
    const days = eachDayOfInterval({
        start: subDays(today, 27),
        end: today,
    });

    const getIntensity = (dateStr: string) => {
        const dayLogs = logs.filter(l => l.log_date === dateStr);
        const count = dayLogs.length;

        // Simple intensity: 0=none, 1=some, 2=good, 3=great
        if (count >= 5) return 3;
        if (count >= 3) return 2;
        if (count >= 1) return 1;
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

    const [isMounted, setIsMounted] = React.useState(false);

    React.useEffect(() => {
        setIsMounted(true);
    }, []);

    if (!isMounted) return <div className="grid grid-cols-7 gap-1 w-full max-w-xs mx-auto opacity-0" />;

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
