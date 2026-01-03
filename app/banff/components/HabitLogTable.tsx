'use client';

import React from 'react';
import { format, parseISO, isToday, isYesterday } from 'date-fns';
import { HabitLog, Habit } from '@/types/banff';
import { useBanffStore } from '@/store/useBanffStore';

interface HabitLogTableProps {
    logs: HabitLog[];
}

export default function HabitLogTable({ logs }: HabitLogTableProps) {
    const { habits, lifestyles } = useBanffStore();

    // Sort logs by completed_at desc
    const sortedLogs = [...logs].sort((a, b) => {
        const tA = new Date(a.completed_at).getTime();
        const tB = new Date(b.completed_at).getTime();
        return tB - tA;
    });

    const getHabitInfo = (habitId: string) => {
        const habit = habits.find(h => h.id === habitId);
        if (!habit) return { title: 'Unknown Habit', color: 'zinc', lifestyle: null };

        // Find lifestyle color if any
        let color = 'zinc';
        let lifestyle = null;
        if (habit.lifestyle_id) {
            lifestyle = lifestyles.find(l => l.id === habit.lifestyle_id);
            if (lifestyle) color = lifestyle.color; // e.g. emerald, amber
        }

        return { title: habit.title, color, lifestyle };
    };

    const formatDate = (dateStr: string) => {
        const date = parseISO(dateStr);
        if (isToday(date)) return 'Today';
        if (isYesterday(date)) return 'Yesterday';
        return format(date, 'MMM d');
    };

    const formatTime = (isoString?: string) => {
        if (!isoString) return '--:--';
        return format(parseISO(isoString), 'HH:mm');
    };

    // Take recent 10-15 logs
    const displayLogs = sortedLogs.slice(0, 15);

    if (displayLogs.length === 0) {
        return (
            <div className="text-center py-8 text-zinc-600 italic">
                No recent activity recorded.
            </div>
        );
    }

    return (
        <div className="overflow-hidden">
            <table className="w-full text-left text-sm">
                <thead className="text-xs text-zinc-500 uppercase border-b border-zinc-800">
                    <tr>
                        <th className="pb-3 pl-2 font-medium">Activity</th>
                        <th className="pb-3 font-medium text-right">Time</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-zinc-800/50">
                    {displayLogs.map((log) => {
                        const { title, color } = getHabitInfo(log.habit_id);
                        const dateLabel = formatDate(log.log_date);
                        const timeLabel = formatTime(log.completed_at);

                        return (
                            <tr key={log.id} className="group hover:bg-white/5 transition-colors">
                                <td className="py-3 pl-2">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2 h-2 rounded-full bg-${color}-500 shadow-[0_0_8px_rgba(16,185,129,0.4)] shadow-${color}-500/40`} />
                                        <div className="flex flex-col">
                                            <span className="text-zinc-200 font-medium group-hover:text-white transition-colors">{title}</span>
                                            <span className="text-[10px] text-zinc-500">{dateLabel}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="py-3 text-right text-zinc-400 font-mono text-xs">
                                    {timeLabel}
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}
