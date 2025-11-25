import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // 1. หาวันปัจจุบัน (0=อาทิตย์, 1=จันทร์...)
    const now = new Date();
    const dayOfWeek = now.getDay(); 
    
    // ตั้งเวลาค้นหา Log ของวันนี้
    const todayStart = new Date(); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(todayStart); todayEnd.setDate(todayEnd.getDate() + 1);

    // 2. ดึงตารางงานของ "วันนี้" ว่าใครต้องมาบ้าง (และไม่ใช่ยามหยุด)
    const { data: schedules } = await supabase
      .from('employee_schedules')
      .select('employee_id, shifts(name, start_time), employees(name)')
      .eq('day_of_week', dayOfWeek)
      .eq('is_off', false); // เอาคนที่ไม่ได้หยุด

    if (!schedules || schedules.length === 0) {
        return NextResponse.json({ message: "วันนี้ไม่มีใครมีตารางงาน" });
    }

    // 3. ดึง Log การลงเวลาของวันนี้
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('employee_id')
      .gte('timestamp', todayStart.toISOString())
      .lt('timestamp', todayEnd.toISOString());
    
    // สร้าง Set ของ ID คนที่มาแล้ว เพื่อเทียบง่ายๆ
    const presentEmployeeIds = new Set(logs.map(l => l.employee_id));

    // 4. หาคนหาย (คนที่ต้องมา - คนที่มาแล้ว)
    const absentList = schedules.filter(s => !presentEmployeeIds.has(s.employee_id));

    if (absentList.length === 0) {
       // ถ้ามาครบทุกคน ไม่ต้องแจ้งเตือน หรือแจ้งว่าครบก็ได้
       return NextResponse.json({ message: "ทุกคนเข้างานครบแล้ว" });
    }

    // 5. ส่ง LINE แจ้งเตือนผู้บริหาร
    const namesText = absentList.map(a => `- ${a.employees?.name} (${a.shifts?.name})`).join('\n');
    
    const message = {
        type: 'flex',
        altText: 'แจ้งเตือนพนักงานยังไม่เข้างาน ⚠️',
        contents: {
          type: 'bubble',
          header: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: 'ขาดงาน / ยังไม่เช็คอิน ⚠️', color: '#ff0000', weight: 'bold', size: 'lg' }
          ]},
          body: { type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: `รายการคนที่ยังไม่ลงเวลา (${absentList.length} คน):`, size: 'sm', margin: 'md' },
            { type: 'separator', margin: 'md' },
            { type: 'text', text: namesText, wrap: true, margin: 'md', color: '#555555' }
          ]}
        }
    };

    await client.broadcast([message]);

    return NextResponse.json({ success: true, absent_count: absentList.length });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}