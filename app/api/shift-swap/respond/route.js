import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function POST(req) {
    try {
        const body = await req.json();
        const { request_id, responder_id, action } = body;

        if (!request_id || !responder_id || !action) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        if (action === 'REJECT') {
            // Simple status update
            const { error } = await supabase
                .from('shift_swap_requests')
                .update({ status: 'REJECTED' })
                .eq('id', request_id)
                .eq('target_peer_id', responder_id); // Security check

            if (error) throw error;
            return NextResponse.json({ success: true, message: 'Rejected' });
        }

        if (action === 'ACCEPT') {
            // Atomic RPC Call
            const { data, error } = await supabase
                .rpc('accept_shift_swap', {
                    p_request_id: request_id,
                    p_responder_id: responder_id
                });

            if (error) throw error;

            if (!data.success) {
                return NextResponse.json({ error: data.message }, { status: 409 }); // Conflict
            }

            return NextResponse.json({ success: true, message: 'Accepted' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Swap Respond Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
