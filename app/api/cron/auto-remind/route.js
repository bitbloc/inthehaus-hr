import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    // 1. เวลาปัจจุบัน (UTC+7)
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
        // ดึงเวลาแจ้งเตือนที่ตั้งไว้ (ถ้าไม่มี ให้ข้าม)
        if (!shift.notify_time_in || !shift.notify_time_out) continue;

        // แปลงเวลา Alert In
        const [hIn, mIn] = shift.notify_time_in.split(':').map(Number);
        const alertInMinutes = hIn * 60 + mIn;

        // แปลงเวลา Alert Out
        const [hOut, mOut] = shift.notify_time_out.split(':').map(Number);
        const alertOutMinutes = hOut * 60 + mOut;

        const diffIn = Math.abs(currentTotalMinutes - alertInMinutes);
        const diffOut = Math.abs(currentTotalMinutes - alertOutMinutes);

        debugLog.push(`${shift.name}: In ${diffIn}m ago, Out ${diffOut}m ago`);

        // --- Logic: ถ้าเวลาปัจจุบัน ตรงกับเวลาแจ้งเตือน (บวกลบไม่เกิน 5 นาที) ---
        // (เผื่อ Cron มาช้า/เร็ว นิดหน่อย)
        
        // 1. แจ้งเข้า
        if (diffIn <= 5) {
            messages.push({
                type: 'flex',
                altText: `⏰ แจ้งเตือนเข้างาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#ff9900', layout: 'vertical', contents: [{ type: 'text', text: '⏰ ได้เวลาเตรียมตัวเข้างาน', color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg' },
                      { type: 'text', text: `เวลาเริ่ม: ${shift.start_time}`, size: 'md', color: '#555555', margin: 'md' }
                    ]
                  },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#06c755', action: { type: 'uri', label: '📍 กดลงเวลา', uri: liffUrl } }] }
                }
            });
        }

        // 2. แจ้งออก
        if (diffOut <= 5) {
             messages.push({
                type: 'flex',
                altText: `🌙 แจ้งเตือนเลิกงาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#333333', layout: 'vertical', contents: [{ type: 'text', text: '🌙 ได้เวลาเลิกงานแล้ว', color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg', color: '#333333' },
                      { type: 'text', text: `เวลาเลิก: ${shift.end_time}`, size: 'md', color: '#ff334b', margin: 'md' },
                      { type: 'text', text: 'อย่าลืมกด Check-out นะครับ!', size: 'sm', color: '#aaaaaa', margin: 'xs' }
                    ]
                  },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#ff334b', action: { type: 'uri', label: '🔴 กดเช็คเอาท์', uri: liffUrl } }] }
                }
            });
        }
    }

    if (messages.length > 0) {
        await client.pushMessage(GROUP_ID, messages.slice(0, 5));
        return NextResponse.json({ success: true, count: messages.length });
    }

    return NextResponse.json({ success: true, message: "No alert time matched", debug: debugLog });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}