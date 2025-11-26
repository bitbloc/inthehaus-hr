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
    const now = new Date();
    const dayOfWeek = now.getDay(); 
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

    const { data: schedules } = await supabase
      .from('employee_schedules')
      .select('employee_id, shifts(name, start_time), employees(name)')
      .eq('day_of_week', dayOfWeek)
      .eq('is_off', false);

    if (!schedules || schedules.length === 0) return NextResponse.json({ message: "ไม่มีตารางงาน" });

    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('employee_id')
      .gte('timestamp', todayStart.toISOString())
      .lt('timestamp', todayEnd.toISOString());
    
    const presentEmployeeIds = new Set(logs.map(l => l.employee_id));
    const absentList = schedules.filter(s => !presentEmployeeIds.has(s.employee_id));

    if (absentList.length === 0) return NextResponse.json({ message: "ครบแล้ว" });

    const namesText = absentList.map(a => `- ${a.employees?.name} (${a.shifts?.name})`).join('\n');
    
    const message = {
        type: 'flex',
        altText: 'แจ้งเตือนพนักงานยังไม่เข้างาน ⚠️',
        contents: {
          type: 'bubble',
          header: { type: 'box', layout: 'vertical', contents: [{ type: 'text', text: 'ขาดงาน / ยังไม่เช็คอิน ⚠️', color: '#ff0000', weight: 'bold', size: 'lg' }] },
          body: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: `รายการคนที่ยังไม่ลงเวลา (${absentList.length} คน):`, size: 'sm', margin: 'md' },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: namesText, wrap: true, margin: 'md', color: '#555555' }
          ]}
        }
    };

    // ✅ เปลี่ยนจาก broadcast เป็น pushMessage ระบุกลุ่ม
    await client.pushMessage(GROUP_ID, [message]);

    return NextResponse.json({ success: true, absent_count: absentList.length });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}