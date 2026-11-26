import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/supabaseServer';
import { Client } from '@/utils/lineClient';
import { BRAND } from '@/utils/brand';

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
  // Admin-only route: verify the Supabase Auth session sent by adminFetch().
  const auth = await requireAdmin(req);
  if (auth.response) return auth.response;
  const supabase = auth.db; // write roster as the signed-in admin
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
                        type: 'bubble',
                        header: {
                            type: 'box', layout: 'vertical', backgroundColor: BRAND.plum, paddingAll: '16px',
                            contents: [
                                { type: 'text', text: 'อนุมัติการสลับกะแล้ว', weight: 'bold', size: 'md', color: BRAND.cream, wrap: true },
                                { type: 'text', text: 'Shift swap', size: 'xs', color: BRAND.onPlum2, margin: 'xs' }
                            ]
                        },
                        body: {
                            type: 'box',
                            layout: 'vertical',
                            backgroundColor: BRAND.cream,
                            spacing: 'sm',
                            contents: [
                                { type: 'text', text: `วันที่ ${reqData.target_date || 'ไม่ระบุ'}`, size: 'sm', weight: 'bold', color: BRAND.charcoal },
                                { type: 'text', text: `กะ ${reqData.shift?.name || 'ไม่ระบุ'} (${reqData.shift?.start_time?.slice(0, 5) || '-'}-${reqData.shift?.end_time?.slice(0, 5) || '-'})`, size: 'xs', color: BRAND.neutral, wrap: true },
                                { type: 'separator', margin: 'sm', color: BRAND.rule },
                                {
                                    type: 'box', layout: 'horizontal', margin: 'sm',
                                    contents: [
                                        { type: 'text', text: 'จาก', size: 'xs', color: BRAND.neutral, flex: 1 },
                                        { type: 'text', text: reqData.requester?.name || 'ไม่ระบุ', size: 'xs', weight: 'bold', color: BRAND.charcoal, flex: 3, wrap: true }
                                    ]
                                },
                                {
                                    type: 'box', layout: 'horizontal',
                                    contents: [
                                        { type: 'text', text: 'ให้', size: 'xs', color: BRAND.neutral, flex: 1 },
                                        { type: 'text', text: reqData.peer?.name || 'ไม่ระบุ', size: 'xs', weight: 'bold', color: BRAND.plum, flex: 3, wrap: true }
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
