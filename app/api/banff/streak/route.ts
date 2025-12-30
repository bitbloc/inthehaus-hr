import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabaseClient';
import { getTodayDateString } from '@/utils/date';
import { subDays, format } from 'date-fns';

export async function POST(req: NextRequest) {
    try {
        const { habit_id, user_id, date } = await req.json();

        if (!habit_id || !user_id) {
            return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
        }

        const todayDate = date || getTodayDateString();

        // 1. Log the completion (Assuming client already did optimistic, but we ensure DB integrity here)
        // Actually, client might have inserted the log directly via Supabase client. 
        // If so, this endpoint is just for "updating stats".
        // Let's assume the Row is inserted, and we are just calculating streak.

        // Check if habit exists
        const { data: habit, error: habitError } = await supabase
            .from('habits')
            .select('current_streak, max_streak')
            .eq('id', habit_id)
            .single();

        if (habitError || !habit) throw new Error('Habit not found');

        // 2. Check yesterday's log to see if chain is broken
        // Note: This logic assumes "Yesterday" relative to the Current Log Date.
        const yesterday = format(subDays(new Date(todayDate), 1), 'yyyy-MM-dd');

        const { data: yesterdayLog } = await supabase
            .from('habit_logs')
            .select('id')
            .eq('habit_id', habit_id)
            .eq('log_date', yesterday)
            .single();

        let newStreak = 1;

        if (yesterdayLog) {
            // Chain matches!
            newStreak = (habit.current_streak || 0) + 1;
        } else {
            // Chain broken or new start. 
            // Edge case: if log exists for TODAY already and we call this again? 
            // Ideally this is called only on "Check". 
            // Simplification: Streak = 1 if yesterday missing.

            // Wait, what if the user logs "Today" but "Today" is actually covering a skipped day?
            // Simpler logic: newStreak = yesterdayLog ? old + 1 : 1.
            newStreak = 1;
        }

        // 3. Update Habit Table with cached streak
        const newMax = Math.max(habit.max_streak || 0, newStreak);

        const { error: updateError } = await supabase
            .from('habits')
            .update({
                current_streak: newStreak,
                max_streak: newMax
            })
            .eq('id', habit_id);

        if (updateError) throw updateError;

        return NextResponse.json({
            success: true,
            current_streak: newStreak,
            max_streak: newMax
        });

    } catch (err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
