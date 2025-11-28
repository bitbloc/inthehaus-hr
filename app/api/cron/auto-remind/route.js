import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

// ✅ Group ID เดิมของคุณ
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function GET(request) {
  try {
    // 1. คำนวณเวลาไทยแบบ Manual (UTC+7) แม่นยำ 100%
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    
    const currentMinutes = thaiTime.getHours() * 60 + thaiTime.getMinutes();
    const timeString = `${thaiTime.getHours()}:${thaiTime.getMinutes()}`;
    
    console.log(`🕒 Cron Check at: ${timeString} (${currentMinutes} mins)`);

    // 2. ดึงกะทั้งหมด
    const { data: shifts } = await supabase.from('shifts').select('*');
    if (!shifts) return NextResponse.json({ message: "No shifts" });

    const liffUrl = "https://liff.line.me/2008567449-W868y8RY"; 
    let messages = [];

    for (const shift of shifts) {
        // แปลงเวลา Start/End ของกะ
        const [sHour, sMin] = shift.start_time.split(':').map(Number);
        const startMinutes = sHour * 60 + sMin;
        
        const [eHour, eMin] = shift.end_time.split(':').map(Number);
        const endMinutes = eHour * 60 + eMin;

        // คำนวณส่วนต่างเวลา
        const diffStart = startMinutes - currentMinutes; // อีกกี่นาทีจะเริ่ม
        const diffEnd = endMinutes - currentMinutes;     // อีกกี่นาทีจะจบ

        console.log(`Checking ${shift.name}: Start in ${diffStart}m | End in ${diffEnd}m`);

        // --- LOGIC 1: เตือนเข้างาน (ขยายเวลาเป็น 50-70 นาที) ---
        // เผื่อ GitHub มาช้าหรือเร็วไปนิดหน่อย
        if (diffStart >= 60 && diffStart <= 70) {
            messages.push({
                type: 'flex',
                altText: `⏰ แจ้งเตือนเข้างาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#ff9900', layout: 'vertical', contents: [{ type: 'text', text: '⏰ เตรียมตัวเข้างาน (1 ชม.)', color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg' },
                      { type: 'text', text: `เวลา: ${shift.start_time} - ${shift.end_time}`, size: 'md', color: '#555555', margin: 'md' }
                    ]
                  },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#06c755', action: { type: 'uri', label: '📍 กดลงเวลา', uri: liffUrl } }] }
                }
            });
        }

        // --- LOGIC 2: เตือนเลิกงาน (ขยายเวลาเป็น 5-25 นาที) ---
        if (diffEnd >= 20 && diffEnd <= 30) {
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

    // 3. ส่งข้อความ (ถ้ามีเงื่อนไขตรง)
    if (messages.length > 0) {
        console.log(`🚀 Sending ${messages.length} alerts to Group`);
        await client.pushMessage(GROUP_ID, messages.slice(0, 5));
        return NextResponse.json({ success: true, count: messages.length });
    }

    return NextResponse.json({ success: true, message: "No matching time window" });

  } catch (error) {
    console.error("Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}