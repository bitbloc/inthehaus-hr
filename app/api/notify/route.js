import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

// ตั้งค่า LINE Client
const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // 1. กำหนดช่วงเวลา "วันนี้" (00:00 - 23:59)
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 2. ดึงข้อมูล Log + ชื่อพนักงาน + เวลาเข้างานของกะ (shifts)
    const { data: logs, error } = await supabase
      .from('attendance_logs')
      .select('*, employees(name, shifts(name, start_time))')
      .gte('timestamp', today.toISOString())
      .lt('timestamp', tomorrow.toISOString());

    if (error) {
      console.error("Supabase Error:", error);
      throw error;
    }

    // 3. ประมวลผลข้อมูล (นับจำนวน / เช็คสายตามกะ)
    const total = logs.length;
    let lateCount = 0;
    let names = [];

    logs.forEach(log => {
      const logDate = new Date(log.timestamp);
      
      // ดึงเวลาเริ่มงานจากกะ (ถ้าไม่มีกะ ให้ Default เป็น 08:00)
      const shiftStart = log.employees?.shifts?.start_time || "08:00";
      const shiftName = log.employees?.shifts?.name || "";

      // แปลงเวลาเข้างานของกะ เป็นนาที (เช่น 10:30 -> 630 นาที)
      const [sHour, sMin] = shiftStart.split(':').map(Number);
      const shiftLimitMinutes = sHour * 60 + sMin;

      // แปลงเวลาที่พนักงานมาจริง เป็นนาที
      const actualMinutes = logDate.getHours() * 60 + logDate.getMinutes();

      // จัดรูปแบบเวลาให้สวยงาม (เช่น 9:5 -> 09:05)
      const timeString = `${String(logDate.getHours()).padStart(2, '0')}:${String(logDate.getMinutes()).padStart(2, '0')}`;

      // เปรียบเทียบเวลา
      if (actualMinutes > shiftLimitMinutes) {
        lateCount++;
        names.push({
            text: `🔴 ${log.employees?.name} (สาย ${timeString})`,
            sub: `กะ: ${shiftName} (${shiftStart})`,
            color: '#ff5555'
        });
      } else {
        names.push({
            text: `🟢 ${log.employees?.name} (ปกติ ${timeString})`,
            sub: `กะ: ${shiftName}`,
            color: '#555555'
        });
      }
    });

    // 4. สร้างข้อความ Flex Message สวยๆ
    const message = {
      type: 'flex',
      altText: `สรุปการลงเวลาประจำวันที่ ${new Date().toLocaleDateString('th-TH')}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: 'Daily Report 📊', weight: 'bold', size: 'xl', color: '#1DB446' },
            { type: 'text', text: `วันที่ ${new Date().toLocaleDateString('th-TH')}`, size: 'xs', color: '#aaaaaa' }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            // ส่วนสรุปยอดรวม
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'มาทำงาน', size: 'sm', color: '#555555', flex: 1 },
                { type: 'text', text: `${total} คน`, size: 'sm', weight: 'bold', align: 'end', flex: 1 }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'มาสาย', size: 'sm', color: '#ff5555', flex: 1 },
                { type: 'text', text: `${lateCount} คน`, size: 'sm', weight: 'bold', align: 'end', flex: 1 }
              ],
              margin: 'md'
            },
            { type: 'separator', margin: 'lg' },
            { type: 'text', text: 'รายชื่อ:', margin: 'lg', weight: 'bold', size: 'sm' },
            
            // Loop รายชื่อใส่เข้าไป
            ...names.map(item => ({
                type: 'box',
                layout: 'vertical',
                margin: 'sm',
                contents: [
                    { type: 'text', text: item.text, size: 'xs', color: item.color, weight: item.color === '#ff5555' ? 'bold' : 'regular' },
                    { type: 'text', text: item.sub, size: 'xxs', color: '#aaaaaa', margin: 'xs', offsetStart: '18px' }
                ]
            }))
          ]
        }
      }
    };

    // 5. ส่งข้อความ (Broadcast)
    if (total > 0) {
        await client.broadcast([message]);
        return NextResponse.json({ success: true, message: "Report sent" });
    } else {
        return NextResponse.json({ success: true, message: "No attendance data today" });
    }

  } catch (error) {
    console.error("API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}