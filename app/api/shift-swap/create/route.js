import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

// Initialize Supabase (Use service key if available for RLS bypass, or standard client)
// For internal API, using standard client might handle auth automatically if passed headers, 
// but usually in Next.js API routes we instantiate a new client.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req) {
    try {
        const body = await req.json();
        const { requester_id, target_date, old_shift_id, type, target_peer_id, notes } = body;

        // 1. Basic Validation
        if (!requester_id || !target_date || !type) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // 2. The Guard Logic (Preliminary)
        // Check if requester actually has a shift that day? 
        // (UI should handle this, but good to verify)
        // ...Skipping deep verify for MVP, relying on UI input validity...

        // 3. Insert Request
        const { data, error } = await supabase
            .from('shift_swap_requests')
            .insert({
                requester_id,
                target_date,
                old_shift_id,
                type,
                target_peer_id: type === 'TRADE' || (type === 'GIVE_AWAY' && target_peer_id) ? target_peer_id : null,
                status: 'PENDING_PEER', // Default
                notes
            })
            .select()
            .single();

        if (error) throw error;

        return NextResponse.json({ success: true, request: data });

    } catch (error) {
        console.error('Swap Request Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
