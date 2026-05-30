
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export async function GET() {
    const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    );

    try {
        const { data, error } = await supabase
            .from('announcements')
            .select('id, message, created_at, priority, expires_at')
            .eq('is_active', true)
            .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false });

        if (error) {
            throw error;
        }

        return NextResponse.json({
            announcement: data && data.length > 0 ? data[0] : null,
            announcements: data || []
        });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
