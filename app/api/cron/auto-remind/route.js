import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

// ✅ Group ID
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export const dynamic = 'force-dynamic'; // บังคับไม่ให้ Cache (สำคัญมากสำหรับ Vercel)

export async function GET(request) {
  try {
    // 1. ดึงเวลาปัจจุบัน (UTC+7 Thailand)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    
    const currentHour = thaiTime.getHours();
    const currentMinute = thaiTime.getMinutes();
    const currentTotalMinutes = currentHour * 60 + currentMinute;
    
    const timeString = `${String(currentHour).padStart(2, '0')}:${String(currentMinute).padStart(2, '0')}`;
    
    // Debug Info: เก็บข้อมูลไว้ดูว่าเกิดอะไรขึ้น
    let debugInfo = {
        serverTime: timeString,
        totalMinutes: currentTotalMinutes,
        shiftsCheck: [],
        alertsSent: 0
    };

    // 2. ดึงข้อมูลกะ
    const { data: shifts } = await supabase.from('shifts').select('*');
    if (!shifts) return NextResponse.json({ message: "No shifts found", debug: debugInfo });

    const liffUrl = "https://liff.line.me/2008567449-W868y8RY"; 
    let messages = [];

    for (const shift of shifts) {
        // แปลงเวลา Start
        const [sHour, sMin] = shift.start_time.split(':').map(Number);
        const startTotalMinutes = sHour * 60 + sMin;
        
        // แปลงเวลา End
        const [eHour, eMin] = shift.end_time.split(':').map(Number);
        const endTotalMinutes = eHour * 60 + eMin;

        // คำนวณส่วนต่าง
        const diffStart = startTotalMinutes - currentTotalMinutes; 
        const diffEnd = endTotalMinutes - currentTotalMinutes;     

        // บันทึกผลการคำนวณลง Debug
        debugInfo.shiftsCheck.push({
            name: shift.name,
            start: shift.start_time,
            end: shift.end_time,
            minutesUntilStart: diffStart,
            minutesUntilEnd: diffEnd
        });

        // --- LOGIC 1: เตือนเข้างาน (ช่วง 50-70 นาทีก่อนเริ่ม) ---
        if (diffStart >= 50 && diffStart <= 70) {
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

        // --- LOGIC 2: เตือนเลิกงาน (ช่วง 5-25 นาทีก่อนเลิก) ---
        if (diffEnd >= 5 && diffEnd <= 25) {
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
                      { type: 'text', text: `เลิกงาน: ${shift.end_time}`, size: 'md', color: '#ff334b', margin: 'md' },
                      { type: 'text', text: 'อย่าลืม Check-out นะครับ!', size: 'sm', color: '#aaaaaa', margin: 'xs' }
                    ]
                  },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#ff334b', action: { type: 'uri', label: '🔴 กดเช็คเอาท์', uri: liffUrl } }] }
                }
            });
        }
    }

    // 3. ส่งข้อความ
    if (messages.length > 0) {
        await client.pushMessage(GROUP_ID, messages.slice(0, 5));
        debugInfo.alertsSent = messages.length;
        return NextResponse.json({ success: true, message: "Alert sent", debug: debugInfo });
    }

    return NextResponse.json({ success: true, message: "No matching time window", debug: debugInfo });

  } catch (error) {
    console.error("Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}