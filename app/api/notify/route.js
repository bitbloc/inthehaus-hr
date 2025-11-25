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
    // 1. ดึงข้อมูลการลงเวลาของ "วันนี้"
    const today = new Date();
    today.setHours(0, 0, 0, 0); // เริ่มต้นวัน 00:00
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1); // วันพรุ่งนี้

    const { data: logs, error } = await supabase
      .from('attendance_logs')
      .select('*, employees(name)')
      .gte('timestamp', today.toISOString())
      .lt('timestamp', tomorrow.toISOString());

    if (error) throw error;

    // 2. สรุปข้อมูล
    const total = logs.length;
    let lateCount = 0;
    let onTimeCount = 0;
    let names = [];

    logs.forEach(log => {
      const logDate = new Date(log.timestamp);
      // เช็คสาย (08:00)
      if (logDate.getHours() * 60 + logDate.getMinutes() > 8 * 60) {
        lateCount++;
        names.push(`🔴 ${log.employees?.name} (สาย ${logDate.getHours()}:${logDate.getMinutes()})`);
      } else {
        onTimeCount++;
        names.push(`🟢 ${log.employees?.name} (ปกติ)`);
      }
    });

    // 3. เตรียมข้อความที่จะส่ง
    const message = {
      type: 'flex',
      altText: 'สรุปการลงเวลาวันนี้',
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
            // เอา list รายชื่อมาใส่ตรงนี้
            ...names.map(n => ({ type: 'text', text: n, size: 'xs', margin: 'sm', color: '#555555' }))
          ]
        }
      }
    };

    // 4. ส่งข้อความ (Broadcast หาทุกคนที่เป็นเพื่อนกับบอท)
    // *หมายเหตุ: ถ้าอยากส่งหาแค่ผู้บริหาร ต้องเปลี่ยน method เป็น pushMessage แล้วใส่ UserID ผู้บริหาร
    await client.broadcast([message]);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}