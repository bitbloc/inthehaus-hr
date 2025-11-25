import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function GET(request) {
  try {
    // 1. ดึงเวลาปัจจุบัน (UTC+7)
    const now = new Date();
    const thaiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    
    // --- Logic 1: หาเวลาสำหรับเตือน "เข้างาน" (ล่วงหน้า 60 นาที) ---
    const checkInDate = new Date(thaiTime);
    checkInDate.setMinutes(checkInDate.getMinutes() + 60);
    const checkInTarget = `${String(checkInDate.getHours()).padStart(2, '0')}:${String(checkInDate.getMinutes()).padStart(2, '0')}`;

    // --- Logic 2: หาเวลาสำหรับเตือน "เลิกงาน" (ล่วงหน้า 15 นาที) ---
    const checkOutDate = new Date(thaiTime);
    checkOutDate.setMinutes(checkOutDate.getMinutes() + 15);
    const checkOutTarget = `${String(checkOutDate.getHours()).padStart(2, '0')}:${String(checkOutDate.getMinutes()).padStart(2, '0')}`;

    console.log(`Current: ${thaiTime.getHours()}:${thaiTime.getMinutes()} | Checking Start: ${checkInTarget} | Checking End: ${checkOutTarget}`);

    // 2. ดึงข้อมูลกะทั้งหมดมาเช็ค
    const { data: shifts } = await supabase.from('shifts').select('*');
    if (!shifts) return NextResponse.json({ message: "No shifts found" });

    const liffUrl = "https://liff.line.me/2008567449-W868y8RY"; 
    let messages = [];

    // 3. วนลูปเช็คกะ
    for (const shift of shifts) {
        
        // --- CASE A: เตือนเข้างาน (Start Time) ---
        if (shift.start_time === checkInTarget) {
            messages.push({
                type: 'flex',
                altText: `แจ้งเตือนเข้างาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#ff9900', layout: 'vertical', contents: [{ type: 'text', text: '⏰ อีก 1 ชม. เข้างาน', color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg' },
                      { type: 'text', text: `เวลา: ${shift.start_time} - ${shift.end_time}`, size: 'sm', color: '#555555', margin: 'md' }
                    ]
                  },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#06c755', action: { type: 'uri', label: '📍 กดเช็คอิน', uri: liffUrl } }] }
                }
            });
        }

        // --- CASE B: เตือนเลิกงาน (End Time) ---
        if (shift.end_time === checkOutTarget) {
            messages.push({
                type: 'flex',
                altText: `แจ้งเตือนเลิกงาน ${shift.name}`,
                contents: {
                  type: 'bubble',
                  header: { backgroundColor: '#333333', layout: 'vertical', contents: [{ type: 'text', text: '🌙 อีก 15 นาที เลิกงาน', color: '#ffffff', weight: 'bold' }] },
                  body: {
                    type: 'box', layout: 'vertical',
                    contents: [
                      { type: 'text', text: `กะ: ${shift.name}`, weight: 'bold', size: 'lg', color: '#333333' },
                      { type: 'text', text: `อย่าลืม Check-out!`, size: 'md', color: '#ff334b', weight: 'bold', margin: 'md' },
                      { type: 'separator', margin: 'md' },
                      { type: 'text', text: 'ตารางเวลาทำงานครบกะ:', size: 'xs', color: '#aaaaaa', margin: 'md' },
                      { type: 'text', text: `${shift.start_time} - ${shift.end_time}`, size: 'xl', weight: 'bold', color: '#333333', align: 'center', margin: 'sm' }
                    ]
                  },
                  footer: { type: 'box', layout: 'vertical', contents: [{ type: 'button', style: 'primary', color: '#ff334b', action: { type: 'uri', label: '🔴 กดเช็คเอาท์', uri: liffUrl } }] }
                }
            });
        }
    }

    // 4. ส่งข้อความ (ถ้ามี)
    if (messages.length > 0) {
        // LINE บังคับส่งได้ทีละไม่เกิน 5 ข้อความ
        await client.broadcast(messages.slice(0, 5));
        return NextResponse.json({ success: true, count: messages.length });
    }

    return NextResponse.json({ success: true, message: "No alerts matching current time" });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}