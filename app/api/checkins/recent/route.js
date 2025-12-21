
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    try {
        // Fetch last 30 logs (to allow for filtering)
        const { data: logs, error } = await supabase
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
            .limit(30);

        if (error) throw error;

        // Filter out Owner and Develop
        const filtered = logs.filter(log => {
            const pos = log.employees?.position?.toLowerCase() || '';
            return !pos.includes('owner') && !pos.includes('develop');
        }).slice(0, 15); // Return top 15

        return NextResponse.json({ recentCheckins: filtered });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
