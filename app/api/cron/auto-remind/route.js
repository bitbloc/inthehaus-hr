import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

// ✅ ใส่ Group ID ตรงนี้ครับ
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function GET(request) {
  try {
    // 1. ดึงเวลาปัจจุบัน (UTC+7 Thailand)
    const now = new Date();
    const thaiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    
    // แปลงเวลาปัจจุบันเป็น "นาทีนับจากเที่ยงคืน" (เช่น 10:30 = 630 นาที)
    const currentMinutes = thaiTime.getHours() * 60 + thaiTime.getMinutes();
    
    console.log(`Cron running at: ${thaiTime.getHours()}:${thaiTime.getMinutes()} (${currentMinutes} mins)`);

    // 2. ดึงข้อมูลกะทั้งหมด
    const { data: shifts } = await supabase.from('shifts').select('*');
    if (!shifts) return NextResponse.json({ message: "No shifts found" });

    const liffUrl = "https://liff.line.me/2008567449-W868y8RY"; 
    let messages = [];

    for (const shift of shifts) {
        // แปลงเวลา Start/End ของกะ เป็นนาที
        const [sHour, sMin] = shift.start_time.split(':').map(Number);
        const startMinutes = sHour * 60 + sMin;
        
        const [eHour, eMin] = shift.end_time.split(':').map(Number);
        const endMinutes = eHour * 60 + eMin;

        // --- LOGIC 1: เตือนเข้างาน (ล่วงหน้า 55-65 นาที) ---
        // Cron ทำงานทุก 10 นาที ดังนั้นต้องเช็คเป็นช่วงเวลา
        const diffStart = startMinutes - currentMinutes;
        if (diffStart >= 55 && diffStart <= 65) {
            messages.push({
                type: 'flex',
                altText: `⏰ แจ้งเตือนเข้างาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#ff9900', layout: 'vertical', contents: [{ type: 'text', text: '⏰ อีก 1 ชม. เข้างาน', color: '#ffffff', weight: 'bold' }] },
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

        // --- LOGIC 2: เตือนเลิกงาน (ล่วงหน้า 10-20 นาที) ---
        const diffEnd = endMinutes - currentMinutes;
        if (diffEnd >= 10 && diffEnd <= 20) {
             messages.push({
                type: 'flex',
                altText: `🌙 แจ้งเตือนเลิกงาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#333333', layout: 'vertical', contents: [{ type: 'text', text: '🌙 ใกล้เวลาเลิกงาน', color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg', color: '#333333' },
                      { type: 'text', text: `เลิกงาน: ${shift.end_time}`, size: 'md', color: '#ff334b', margin: 'md' },
                      { type: 'text', text: 'อย่าลืมกด Check-out!', size: 'sm', color: '#aaaaaa', margin: 'xs' }
                    ]
                  },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#ff334b', action: { type: 'uri', label: '🔴 กดเช็คเอาท์', uri: liffUrl } }] }
                }
            });
        }
    }

    // 3. ส่งข้อความ (ถ้ามี)
    if (messages.length > 0) {
        // ✅ แก้ตรงนี้: ใช้ pushMessage ระบุ Group ID
        await client.pushMessage(GROUP_ID, messages.slice(0, 5));
        
        return NextResponse.json({ success: true, count: messages.length });
    }

    return NextResponse.json({ success: true, message: "No alerts in this window" });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}