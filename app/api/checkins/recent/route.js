
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    try {
        // Fetch last 10 logs with employee details, sorting by timestamp desc
        const { data, error } = await supabase
            .from('attendance_logs')
            .select(`
        id,
        timestamp,
        action_type,
        mood_status,
        employees (
          name,
          position
        ),
        photo_url
      `)
            .order('timestamp', { ascending: false })
            .limit(10);

        if (error) throw error;

        return NextResponse.json({ recentCheckins: data });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
