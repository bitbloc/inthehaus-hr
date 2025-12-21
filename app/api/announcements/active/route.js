
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
            .select('message, created_at, priority, expires_at')
            .eq('is_active', true)
            .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
            .order('priority', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is no rows returned, which is fine
            throw error;
        }

        return NextResponse.json({ announcement: data || null });
    } catch (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
