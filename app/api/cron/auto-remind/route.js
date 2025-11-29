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
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    
    const currentTotalMinutes = thaiTime.getHours() * 60 + thaiTime.getMinutes();
    const timeString = `${String(thaiTime.getHours()).padStart(2, '0')}:${String(thaiTime.getMinutes()).padStart(2, '0')}`;
    
    console.log(`🕒 Cron Check at: ${timeString} (${currentTotalMinutes} mins)`);

    const { data: shifts } = await supabase.from('shifts').select('*');
    if (!shifts) return NextResponse.json({ message: "No shifts" });

    const liffUrl = "https://liff.line.me/2008567449-W868y8RY"; 
    let messages = [];
    let debugLog = [];

    for (const shift of shifts) {
        if (!shift.start_time || !shift.end_time) continue;

        // ✅ ดึงค่าการตั้งค่าจาก DB (ถ้าไม่มีให้ใช้ค่า Default 60/15)
        const alertStart = shift.alert_before_start || 60;
        const alertEnd = shift.alert_before_end || 15;

        // แปลงเวลา
        const [sHour, sMin] = shift.start_time.split(':').map(Number);
        const startTotalMinutes = sHour * 60 + sMin;
        const [eHour, eMin] = shift.end_time.split(':').map(Number);
        const endTotalMinutes = eHour * 60 + eMin;

        const diffStart = startTotalMinutes - currentTotalMinutes; 
        const diffEnd = endTotalMinutes - currentTotalMinutes;     

        debugLog.push(`${shift.name}: Start in ${diffStart}m (Alert at ${alertStart}), End in ${diffEnd}m (Alert at ${alertEnd})`);

        // --- LOGIC 1: เตือนเข้างาน (ช่วง ±10 นาที จากค่าที่ตั้ง) ---
        // เช่น ตั้ง 60 นาที -> จะเตือนช่วง 50 ถึง 70
        if (diffStart >= (alertStart - 10) && diffStart <= (alertStart + 10)) {
            messages.push({
                type: 'flex',
                altText: `⏰ แจ้งเตือนเข้างาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#ff9900', layout: 'vertical', contents: [{ type: 'text', text: `⏰ เตรียมตัวเข้างาน (${alertStart} นาที)`, color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg' },
                      { type: 'text', text: `เริ่มงาน: ${shift.start_time}`, size: 'md', color: '#555555', margin: 'md' }
                    ]
                  },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#06c755', action: { type: 'uri', label: '📍 กดลงเวลา', uri: liffUrl } }] }
                }
            });
        }

        // --- LOGIC 2: เตือนเลิกงาน (ช่วง ±10 นาที จากค่าที่ตั้ง) ---
        if (diffEnd >= (alertEnd - 10) && diffEnd <= (alertEnd + 10)) {
             messages.push({
                type: 'flex',
                altText: `🌙 แจ้งเตือนเลิกงาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#333333', layout: 'vertical', contents: [{ type: 'text', text: '🌙 ใกล้เลิกงานแล้ว', color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg', color: '#333333' },
                      { type: 'text', text: `เวลาเลิก: ${shift.end_time}`, size: 'md', color: '#ff334b', margin: 'md' },
                      { type: 'text', text: 'อย่าลืม Check-out นะครับ!', size: 'sm', color: '#aaaaaa', margin: 'xs' }
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

    return NextResponse.json({ success: true, message: "No match", debug: debugLog });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}