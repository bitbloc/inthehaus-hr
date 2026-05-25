import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// Shared Group ID (Consider moving to env or DB config in future)
// ✅ Group IDs (กลุ่มหลัก และ กลุ่มแผนกอื่น)
const GROUP_IDS = [
    'C1210c7a0601b5a675060e312efe10bff',
    'C71db3c7339b11f43dc8f1ec34bf46f43'
];

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
                // B.1 Sync with Roster Transactions (Source of Truth for new Roster)
                // 1. Mark Giver (Requester) as OFF
                await supabase.from('roster_transactions').upsert({
                    employee_id: reqData.requester_id,
                    date: reqData.target_date,
                    is_off: true,
                    slot_type: 'MAIN',
                    status: 'PUBLISHED'
                }, { onConflict: 'employee_id, date, slot_type' });

                // 2. Mark Receiver (Peer) as Working Giver's Shift
                if (reqData.target_peer_id) {
                    await supabase.from('roster_transactions').upsert({
                        employee_id: reqData.target_peer_id,
                        date: reqData.target_date,
                        shift_id: reqData.old_shift_id,
                        custom_start_time: reqData.shift?.start_time || null,
                        custom_end_time: reqData.shift?.end_time || null,
                        is_off: false,
                        slot_type: 'MAIN',
                        status: 'PUBLISHED'
                    }, { onConflict: 'employee_id, date, slot_type' });
                }

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

                await Promise.all(
                    GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
                );
            }

            return NextResponse.json({ success: true, message: 'Approved and Notified' });
        }

        return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

    } catch (error) {
        console.error('Swap Approve Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
