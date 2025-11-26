import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

// ✅ ใส่ Group ID ของร้าน
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); 
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: logs, error } = await supabase
      .from('attendance_logs')
      .select('*, employees(name, shifts(name, start_time))')
      .gte('timestamp', today.toISOString())
      .lt('timestamp', tomorrow.toISOString());

    if (error) throw error;

    const total = logs.length;
    let lateCount = 0;
    let names = [];

    logs.forEach(log => {
      const logDate = new Date(log.timestamp);
      const shiftStart = log.employees?.shifts?.start_time || "08:00";
      const shiftName = log.employees?.shifts?.name || "";

      const [sHour, sMin] = shiftStart.split(':').map(Number);
      const shiftLimitMinutes = sHour * 60 + sMin;
      const actualMinutes = logDate.getHours() * 60 + logDate.getMinutes();
      const timeString = `${String(logDate.getHours()).padStart(2, '0')}:${String(logDate.getMinutes()).padStart(2, '0')}`;

      if (actualMinutes > shiftLimitMinutes) {
        lateCount++;
        names.push({ text: `🔴 ${log.employees?.name} (สาย ${timeString})`, sub: `กะ: ${shiftName}`, color: '#ff5555' });
      } else {
        names.push({ text: `🟢 ${log.employees?.name} (ปกติ ${timeString})`, sub: `กะ: ${shiftName}`, color: '#555555' });
      }
    });

    const message = {
      type: 'flex',
      altText: `สรุปการลงเวลาประจำวันที่ ${new Date().toLocaleDateString('th-TH')}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'text', text: 'Daily Report 📊', weight: 'bold', size: 'xl', color: '#1DB446' },
            { type: 'text', text: `วันที่ ${new Date().toLocaleDateString('th-TH')}`, size: 'xs', color: '#aaaaaa' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: 'มาทำงาน', size: 'sm', color: '#555555', flex: 1 }, { type: 'text', text: `${total} คน`, size: 'sm', weight: 'bold', align: 'end', flex: 1 }] },
            { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: 'มาสาย', size: 'sm', color: '#ff5555', flex: 1 }, { type: 'text', text: `${lateCount} คน`, size: 'sm', weight: 'bold', align: 'end', flex: 1 }], margin: 'md' },
            { type: 'separator', margin: 'lg' },
            { type: 'text', text: 'รายชื่อ:', margin: 'lg', weight: 'bold', size: 'sm' },
            ...names.map(item => ({
                type: 'box', layout: 'vertical', margin: 'sm',
                contents: [
                    { type: 'text', text: item.text, size: 'xs', color: item.color, weight: item.color === '#ff5555' ? 'bold' : 'regular' },
                    { type: 'text', text: item.sub, size: 'xxs', color: '#aaaaaa', margin: 'xs', offsetStart: '18px' }
                ]
            }))
          ]
        }
      }
    };

    if (total > 0) {
        // ✅ เปลี่ยนจาก broadcast เป็น pushMessage ระบุกลุ่ม
        await client.pushMessage(GROUP_ID, [message]);
        return NextResponse.json({ success: true, message: "Report sent" });
    } else {
        return NextResponse.json({ success: true, message: "No data" });
    }

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}