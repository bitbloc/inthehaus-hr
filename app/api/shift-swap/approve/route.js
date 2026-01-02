import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Shared Group ID (Consider moving to env or DB config in future)
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(req) {
    try {
        const body = await req.json();
        const { request_id, action, manager_note } = body;

        if (!request_id || !action) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        // 1. REJECT Logic
        if (action === 'REJECT') {
            const { error } = await supabase
                .from('shift_swap_requests')
                .update({ status: 'REJECTED', notes: manager_note })
                .eq('id', request_id);

            if (error) throw error;
            return NextResponse.json({ success: true, message: 'Request Rejected' });
        }

        // 2. APPROVE Logic (RPC + LINE)
        if (action === 'APPROVE') {
            // A. Call Transactional RPC
            const { data: rpcData, error: rpcError } = await supabase
                .rpc('approve_shift_swap', { p_request_id: request_id });

            if (rpcError) throw rpcError;
            if (!rpcData.success) {
                return NextResponse.json({ error: rpcData.message }, { status: 400 });
            }

            // B. Fetch Data for Notification (Hydrate names/dates)
            const { data: reqData, error: fetchError } = await supabase
                .from('shift_swap_requests')
                .select(`
                    *,
                    requester:employees!requester_id(name),
                    peer:employees!target_peer_id(name),
                    shift:shifts!old_shift_id(name, start_time, end_time)
                `)
                .eq('id', request_id)
                .single();

            if (!fetchError && reqData) {
                // C. Send LINE Notification
                const message = {
                    type: 'flex',
                    altText: '🔄 อนุมัติการสลับกะ (Shift Swap Approved)',
                    contents: {
                        type: 'bubble', // Using 'bubble' container
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            contents: [
                                { type: 'text', text: '🔄 Shift Swap Approved', weight: 'bold', size: 'md', color: '#1DB446' },
                                { type: 'separator', margin: 'md' },
                                {
                                    type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
                                    contents: [
                                        { type: 'text', text: `Date: ${reqData.target_date}`, size: 'sm', weight: 'bold' },
                                        { type: 'text', text: `Shift: ${reqData.shift?.name} (${reqData.shift?.start_time}-${reqData.shift?.end_time})`, size: 'xs', color: '#aaaaaa' },
                                        { type: 'separator', margin: 'sm' },
                                        {
                                            type: 'box', layout: 'horizontal', margin: 'sm',
                                            contents: [
                                                { type: 'text', text: 'FROM:', size: 'xs', color: '#aaaaaa', flex: 1 },
                                                { type: 'text', text: reqData.requester?.name, size: 'xs', weight: 'bold', flex: 3 }
                                            ]
                                        },
                                        {
                                            type: 'box', layout: 'horizontal',
                                            contents: [
                                                { type: 'text', text: 'TO:', size: 'xs', color: '#aaaaaa', flex: 1 },
                                                { type: 'text', text: reqData.peer?.name, size: 'xs', weight: 'bold', color: '#007bff', flex: 3 }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    }
                };

                await client.pushMessage(GROUP_ID, [message]);
            }

            return NextResponse.json({ success: true, message: 'Approved and Notified' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Swap Approve Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
