import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

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

        // 4. Send LINE Notification
        try {
            const { data: details } = await supabase
                .from('shift_swap_requests')
                .select('*, requester:employees!requester_id(name, position), shift:shifts!old_shift_id(name, start_time, end_time)')
                .eq('id', data.id)
                .single();

            if (details) {
                const client = new Client({
                    channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
                    channelSecret: process.env.CHANNEL_SECRET,
                });

                const GROUP_ID = process.env.LINE_GROUP_ID || 'Cc2c65da5408563ef57ae61dee6ce3c1d';

                const message = {
                    type: 'flex',
                    altText: '🔄 มีคำขอเปลี่ยนกะใหม่ (Shift Swap)',
                    contents: {
                        type: 'bubble',
                        body: {
                            type: 'box', layout: 'vertical',
                            contents: [
                                { type: 'text', text: '🔄 New Swap Request', weight: 'bold', size: 'lg', color: '#1f2937' },
                                { type: 'separator', margin: 'md' },
                                {
                                    type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
                                    contents: [
                                        { type: 'text', text: `👤 ${details.requester?.name} (${details.requester?.position})`, size: 'sm', wrap: true },
                                        { type: 'text', text: `📅 ${details.target_date}`, size: 'sm' },
                                        { type: 'text', text: `⏰ ${details.shift?.name} (${details.shift?.start_time?.slice(0, 5)} - ${details.shift?.end_time?.slice(0, 5)})`, size: 'xs', color: '#6b7280' },
                                        { type: 'text', text: `📝 ${details.notes || '-'}`, size: 'xs', color: '#9ca3af', wrap: true }
                                    ]
                                },
                                { type: 'separator', margin: 'md' },
                                { type: 'text', text: details.type === 'GIVE_AWAY' ? '🎁 แจกเวร' : '🔀 แลกเวร', align: 'center', margin: 'md', weight: 'bold', color: '#3b82f6' }
                            ]
                        }
                    }
                };

                await client.pushMessage(GROUP_ID, [message]);
            }
        } catch (notifyError) {
            console.error("Notification Error:", notifyError);
            // Don't fail the request if notification fails
        }

        return NextResponse.json({ success: true, request: data });

    } catch (error) {
        console.error('Swap Request Error:', error);
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
