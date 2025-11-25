import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient'; // ปรับ path ให้ถูกตามโครงสร้างโฟลเดอร์
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function GET(request) {
  try {
    // 1. ดึงเวลาปัจจุบัน (UTC) แล้วแปลงเป็นเวลาไทย (UTC+7)
    const now = new Date();
    // บวก 1 ชั่วโมงล่วงหน้า (เพื่อหาว่าอีก 1 ชม. คือกี่โมง)
    now.setHours(now.getHours() + 1);

    // แปลงเป็นเวลาไทย
    const thaiTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
    
    // ดึงชั่วโมงและนาที ของ "อีก 1 ชม. ข้างหน้า"
    const currentHour = String(thaiTime.getHours()).padStart(2, '0');
    const currentMinute = String(thaiTime.getMinutes()).padStart(2, '0');
    const targetTime = `${currentHour}:${currentMinute}`; 
    // ตัวอย่าง: ถ้าตอนนี้ 09:30 -> targetTime จะเป็น "10:30"

    console.log(`Checking shifts for time: ${targetTime}`);

    // 2. ค้นหาใน Database ว่ามีกะไหนเริ่มเวลานี้ไหม?
    const { data: shifts } = await supabase
      .from('shifts')
      .select('*')
      .eq('start_time', targetTime);

    // ถ้าไม่เจอกะที่ตรงเวลาเป๊ะๆ ก็จบการทำงาน
    if (!shifts || shifts.length === 0) {
        return NextResponse.json({ message: `No shift starts at ${targetTime}` });
    }

    // 3. ถ้าเจอ! ให้วนลูปส่งแจ้งเตือน (กรณีมีหลายกะเริ่มพร้อมกัน)
    const liffUrl = "https://liff.line.me/2008567449-W868y8RY"; // ลิงก์ LIFF ของคุณ

    for (const shift of shifts) {
        const message = {
            type: 'flex',
            altText: `แจ้งเตือนเข้างาน ${shift.name}`,
            contents: {
              type: 'bubble',
              body: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  { type: 'text', text: '⏰ อีก 1 ชม. เข้างาน!', weight: 'bold', size: 'lg', color: '#ff9900' },
                  { type: 'text', text: `เตรียมตัวสำหรับ "${shift.name}"`, weight: 'bold', size: 'md', margin: 'md' },
                  { type: 'text', text: `เวลาเริ่มงาน: ${shift.start_time} น.`, size: 'sm', color: '#555555', margin: 'sm' }
                ]
              },
              footer: {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'button',
                    style: 'primary',
                    color: '#06c755',
                    action: {
                      type: 'uri',
                      label: '📍 กดลงเวลาที่นี่',
                      uri: liffUrl
                    }
                  }
                ]
              }
            }
          };
      
          await client.broadcast([message]);
          console.log(`Alert sent for ${shift.name}`);
    }

    return NextResponse.json({ success: true, alerted_shifts: shifts.map(s => s.name) });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}