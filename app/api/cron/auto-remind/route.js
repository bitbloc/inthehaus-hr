import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';
const client = new Client({ channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET });
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    const currentTotalMinutes = thaiTime.getHours() * 60 + thaiTime.getMinutes();
    const timeString = `${String(thaiTime.getHours()).padStart(2, '0')}:${String(thaiTime.getMinutes()).padStart(2, '0')}`;
    console.log(`🕒 Cron Check at: ${timeString} (${currentTotalMinutes})`);

    const { data: shifts } = await supabase.from('shifts').select('*');
    if (!shifts) return NextResponse.json({ message: "No shifts" });

    const liffUrl = "https://liff.line.me/2008567449-W868y8RY"; 
    let messages = [];
    let debugLog = [];

    for (const shift of shifts) {
        let diffIn = 9999, diffOut = 9999;

        // ✅ เช็คว่าเปิดใช้งานไหม (notify_in_enabled)
        if (shift.notify_in_enabled && shift.notify_time_in) {
            const [h, m] = shift.notify_time_in.split(':').map(Number);
            diffIn = Math.abs(currentTotalMinutes - (h * 60 + m));
        }

        // ✅ เช็คว่าเปิดใช้งานไหม (notify_out_enabled)
        if (shift.notify_out_enabled && shift.notify_time_out) {
            const [h, m] = shift.notify_time_out.split(':').map(Number);
            diffOut = Math.abs(currentTotalMinutes - (h * 60 + m));
        }

        debugLog.push(`${shift.name}: In-Diff=${diffIn}, Out-Diff=${diffOut}`);

        // Alert In (±5 mins)
        if (diffIn <= 5) {
            messages.push({
                type: 'flex', altText: `⏰ แจ้งเตือนเข้างาน ${shift.name}`,
                contents: {
                  type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#ff9900', contents: [{ type: 'text', text: `⏰ เตรียมตัวเข้างาน`, color: '#ffffff', weight: 'bold' }] },
                  body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg' }, { type: 'text', text: `เริ่มงาน: ${shift.start_time}`, size: 'md', color: '#555555', margin: 'md' }] },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#06c755', action: { type: 'uri', label: '📍 กดลงเวลา', uri: liffUrl } }] }
                }
            });
        }

        // Alert Out (±5 mins)
        if (diffOut <= 5) {
             messages.push({
                type: 'flex', altText: `🌙 แจ้งเตือนเลิกงาน ${shift.name}`,
                contents: {
                  type: 'bubble', header: { type: 'box', layout: 'vertical', backgroundColor: '#333333', contents: [{ type: 'text', text: `🌙 ได้เวลาเลิกงานแล้ว`, color: '#ffffff', weight: 'bold' }] },
                  body: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg' }, { type: 'text', text: `เลิกงาน: ${shift.end_time}`, size: 'md', color: '#ff334b', margin: 'md' }] },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#ff334b', action: { type: 'uri', label: '🔴 กดเช็คเอาท์', uri: liffUrl } }] }
                }
            });
        }
    }

    if (messages.length > 0) {
        try { await client.pushMessage(GROUP_ID, messages.slice(0, 5)); return NextResponse.json({ success: true, count: messages.length, debug: debugLog }); }
        catch (e) { return NextResponse.json({ success: false, warning: "LINE Fail", details: e.message, debug: debugLog }, { status: 200 }); }
    }
    return NextResponse.json({ success: true, message: "No match", debug: debugLog });
  } catch (error) { return NextResponse.json({ error: error.message }, { status: 500 }); }
}