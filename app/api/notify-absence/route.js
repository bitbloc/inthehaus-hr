import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

// ✅ Group ID เดิมของคุณ
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // 1. คำนวณวันและเวลาปัจจุบัน (UTC+7 Thailand)
    // เพื่อให้แน่ใจว่า "วันนี้" คือวันเดียวกับที่ร้านเปิดจริงๆ
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    
    const dayOfWeek = thaiTime.getDay(); // 0=อาทิตย์, 1=จันทร์ ...
    
    // กำหนดขอบเขตเวลา "วันนี้" (00:00 - 23:59 ตามเวลาไทย)
    const todayStart = new Date(thaiTime); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(thaiTime); todayEnd.setHours(23,59,59,999);

    // 2. ดึง "ตารางงาน (Roster)" ของวันนี้
    // เอาเฉพาะคนที่มีเวร (is_off = false)
    const { data: schedules, error: scheduleError } = await supabase
      .from('employee_schedules')
      .select('employee_id, shifts(name, start_time), employees(name, position)')
      .eq('day_of_week', dayOfWeek)
      .eq('is_off', false);

    if (scheduleError || !schedules || schedules.length === 0) {
        return NextResponse.json({ message: "วันนี้ไม่มีใครมีตารางงาน (หรือเป็นวันหยุดร้าน)" });
    }

    // 3. ดึง "Log การเข้างาน" ของวันนี้
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('employee_id')
      .gte('timestamp', todayStart.toISOString()) // ต้องแปลงกลับเป็น UTC เพื่อ query database
      .lt('timestamp', todayEnd.toISOString());
    
    // สร้าง Set ของ ID คนที่มาแล้ว (Check-in แล้ว)
    const presentEmployeeIds = new Set(logs.map(l => l.employee_id));

    // 4. หาคนหาย (List คนที่มีตาราง - List คนที่มาแล้ว)
    const absentList = schedules.filter(s => !presentEmployeeIds.has(s.employee_id));

    if (absentList.length === 0) {
        return NextResponse.json({ message: "ทุกคนเข้างานครบตามตารางแล้ว" });
    }

    // 5. เตรียมข้อความแจ้งเตือน
    const dateString = thaiTime.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });
    
    // จัดรูปแบบรายชื่อ: "ชื่อ (กะงาน)"
    const namesText = absentList.map(a => 
        `• ${a.employees?.name} \n  (รอเข้า: ${a.shifts?.name} ${a.shifts?.start_time})`
    ).join('\n');
    
    const message = {
        type: 'flex',
        altText: `⚠️ ตามคนขาดงาน (${absentList.length} คน)`,
        contents: {
          type: 'bubble',
          header: {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#ef4444', // สีแดง
            contents: [
              { type: 'text', text: '⚠️ ยังไม่ลงเวลาเข้างาน', color: '#ffffff', weight: 'bold', size: 'lg' },
              { type: 'text', text: `ประจำวัน${dateString}`, color: '#ffffff', size: 'xs', margin: 'sm' }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: `ขาดจำนวน: ${absentList.length} คน`,
                weight: 'bold',
                size: 'md',
                color: '#333333'
              },
              { type: 'separator', margin: 'md' },
              {
                type: 'text',
                text: namesText,
                wrap: true,
                margin: 'md',
                size: 'sm',
                color: '#555555',
                lineSpacing: '4px' // เว้นบรรทัดให้อ่านง่าย
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            contents: [
                { type: 'text', text: 'กรุณาตรวจสอบ หรือกดเรียกเข้างาน', size: 'xxs', color: '#aaaaaa', align: 'center' }
            ]
          }
        }
    };

    // 6. ส่งเข้ากลุ่ม LINE
    await client.pushMessage(GROUP_ID, [message]);

    return NextResponse.json({ success: true, absent_count: absentList.length, absent_list: absentList });

  } catch (error) {
    console.error("Absence Check Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}