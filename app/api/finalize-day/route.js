import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

// ✅ Group ID ของร้าน
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    console.log("🏁 Starting Finalize Day Process...");

    // 1. กำหนดเวลาปัจจุบัน (UTC+7)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    
    const dayOfWeek = thaiTime.getDay();
    const todayStart = new Date(thaiTime); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(thaiTime); todayEnd.setHours(23,59,59,999);
    const dateString = thaiTime.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

    console.log(`📅 Date: ${dateString}, DayOfWeek: ${dayOfWeek}`);

    // 2. ดึงตารางงานวันนี้ (เอาคนที่มีเวร)
    const { data: schedules, error: scheduleError } = await supabase
      .from('employee_schedules')
      .select('employee_id, employees(name)')
      .eq('day_of_week', dayOfWeek)
      .eq('is_off', false);

    if (scheduleError) throw new Error("Schedule DB Error: " + scheduleError.message);

    if (!schedules || schedules.length === 0) {
        console.log("✅ No schedule today. Exiting.");
        return NextResponse.json({ message: "No schedule today (Shop Closed?)" });
    }

    // 3. ดึงคนที่มาแล้ว (Check-in, Leave, หรือ Absent ที่ลงไปแล้ว)
    const { data: logs, error: logError } = await supabase
      .from('attendance_logs')
      .select('employee_id')
      .gte('timestamp', todayStart.toISOString())
      .lt('timestamp', todayEnd.toISOString());

    if (logError) throw new Error("Log DB Error: " + logError.message);

    const presentIds = new Set(logs.map(l => l.employee_id));

    // 4. หาคนขาด (มีเวร - มาแล้ว)
    // กรองเอาเฉพาะคนที่ "ไม่อยู่ใน presentIds"
    const absentList = schedules.filter(s => !presentIds.has(s.employee_id));

    console.log(`📊 Total Schedule: ${schedules.length}, Present: ${presentIds.size}, Absent: ${absentList.length}`);

    // 5. บันทึก 'absent' ลง Database (ถ้ามีคนขาด)
    if (absentList.length > 0) {
        const insertData = absentList.map(s => ({
            employee_id: s.employee_id,
            action_type: 'absent',
            timestamp: new Date().toISOString() // ใช้เวลาปัจจุบันบันทึก
        }));

        const { error: insertError } = await supabase.from('attendance_logs').insert(insertData);
        if (insertError) throw new Error("Insert Absent Error: " + insertError.message);
    }

    // 6. ✅ ส่งรายงานเข้ากลุ่ม LINE
    const absentNames = absentList.map(a => `• ${a.employees?.name}`).join('\n') || "- ครบถ้วน -";
    const absentCountShow = absentList.length; 

    const message = {
        type: 'flex',
        altText: `🏁 สรุปยอดประจำวัน ${dateString}`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box', layout: 'vertical', backgroundColor: '#1e293b',
            contents: [
              { type: 'text', text: '🏁 สรุปยอดสิ้นวัน (Auto)', color: '#ffffff', weight: 'bold', size: 'lg' },
              { type: 'text', text: `ประจำวันที่ ${dateString}`, color: '#94a3b8', size: 'xs' }
            ]
          },
          body: {
            type: 'box', layout: 'vertical',
            contents: [
              {
                type: 'box', layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'มาทำงาน:', size: 'sm', color: '#555555', flex: 1 },
                  { type: 'text', text: `${presentIds.size} คน`, size: 'sm', weight: 'bold', color: '#10b981', align: 'end', flex: 1 }
                ]
              },
              {
                type: 'box', layout: 'horizontal', margin: 'md',
                contents: [
                  { type: 'text', text: 'ขาดงาน:', size: 'sm', color: '#555555', flex: 1 },
                  { type: 'text', text: `${absentCountShow} คน`, size: 'sm', weight: 'bold', color: absentCountShow > 0 ? '#ef4444' : '#10b981', align: 'end', flex: 1 }
                ]
              },
              { type: 'separator', margin: 'lg' },
              { type: 'text', text: 'รายชื่อคนขาด:', margin: 'md', size: 'xs', color: '#9ca3af' },
              { type: 'text', text: absentNames, margin: 'sm', size: 'xs', color: absentCountShow > 0 ? '#ef4444' : '#10b981', wrap: true }
            ]
          }
        }
    };

    await client.pushMessage(GROUP_ID, [message]);

    return NextResponse.json({ success: true, marked_count: absentCountShow });

  } catch (error) {
    console.error("❌ Finalize Day Error:", error);
    // ส่ง Error กลับไปดูใน Cron Job
    return NextResponse.json({ 
        error: "CRASH", 
        message: error.message, 
        stack: error.stack 
    }, { status: 500 });
  }
}