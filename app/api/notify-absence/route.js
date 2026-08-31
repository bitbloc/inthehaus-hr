import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';
import { format } from 'date-fns';

// ✅ Group IDs (กลุ่มหลัก และ กลุ่มแผนกอื่น)
const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff',
  'C71db3c7339b11f43dc8f1ec34bf46f43'
];

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // 1. คำนวณวันและเวลาปัจจุบัน (UTC+7 Thailand)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    const todayStr = format(thaiTime, 'yyyy-MM-dd');
    const dayOfWeek = thaiTime.getDay(); // 0=อาทิตย์, 1=จันทร์ ...

    // ขอบเขตเวลาของวันนี้ตาม UTC สำหรับดึง attendance_logs
    const todayStart = new Date(thaiTime); todayStart.setHours(0, 0, 0, 0);
    const todayEnd = new Date(thaiTime); todayEnd.setHours(23, 59, 59, 999);
    // แปลงกลับเป็น ISO UTC
    const todayStartUTC = new Date(todayStart.getTime() - (3600000 * 7));
    const todayEndUTC = new Date(todayEnd.getTime() - (3600000 * 7));

    // 2. ดึง Approved Leaves ของวันนี้ (คนลาที่อนุมัติแล้ว จะไม่ถูกนับว่าขาดงาน)
    const { data: approvedLeaves } = await supabase
      .from('leave_requests')
      .select('employee_id, leave_type')
      .eq('leave_date', todayStr)
      .eq('status', 'approved');

    const approvedLeaveEmpIds = new Set((approvedLeaves || []).map(l => Number(l.employee_id)));

    // 3. ดึง "ตารางงาน (Roster Transactions)" ของวันนี้ (Single Source of Truth)
    let { data: transactions } = await supabase
      .from('roster_transactions')
      .select('employee_id, custom_start_time, custom_end_time, is_off, employees!inner(id, name, nickname, position), shifts(id, name, start_time, end_time)')
      .eq('date', todayStr)
      .eq('status', 'PUBLISHED')
      .eq('is_off', false);

    let scheduledList = [];

    if (transactions && transactions.length > 0) {
      scheduledList = transactions.map(t => ({
        employee_id: t.employee_id,
        name: t.employees?.name || 'พนักงาน',
        nickname: t.employees?.nickname || '',
        shift_name: t.shifts?.name || 'กะงาน',
        start_time: t.custom_start_time || t.shifts?.start_time || ''
      }));
    } else {
      // Fallback: หากยังไม่มี Published Transaction ให้ดึงจาก Template
      const { data: schedules } = await supabase
        .from('employee_schedules')
        .select('employee_id, shifts(name, start_time), employees!inner(id, name, nickname, position)')
        .eq('day_of_week', dayOfWeek)
        .eq('is_off', false);

      if (schedules) {
        scheduledList = schedules.map(s => ({
          employee_id: s.employee_id,
          name: s.employees?.name || 'พนักงาน',
          nickname: s.employees?.nickname || '',
          shift_name: s.shifts?.name || 'กะงาน',
          start_time: s.shifts?.start_time || ''
        }));
      }
    }

    // กรองคนที่มีเวร แต่ต้องไม่รวมคนที่ได้รับอนุมัติลาหยุด
    const activeScheduled = scheduledList.filter(s => !approvedLeaveEmpIds.has(Number(s.employee_id)));

    if (activeScheduled.length === 0) {
      return NextResponse.json({ message: "วันนี้ไม่มีใครมีตารางงาน หรือทุกคนลาหยุดถูกต้องตามระบบ" });
    }

    // 4. ดึง "Log การเข้างาน (Attendance Logs)" ของวันนี้
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('employee_id')
      .gte('timestamp', todayStartUTC.toISOString())
      .lt('timestamp', todayEndUTC.toISOString());

    // สร้าง Set ของ ID คนที่ลงเวลาเข้างานแล้ว
    const presentEmployeeIds = new Set((logs || []).map(l => Number(l.employee_id)));

    // 5. หาคนหาย (คนมีเวรที่ไม่ได้ลา และยังไม่ได้ลงเวลา)
    const absentList = activeScheduled.filter(s => !presentEmployeeIds.has(Number(s.employee_id)));

    if (absentList.length === 0) {
      return NextResponse.json({ message: "ทุกคนเข้างานครบตามตารางแล้ว" });
    }

    // 6. จัดรูปแบบ Flex Message แจ้งเตือน
    const dateString = thaiTime.toLocaleDateString('th-TH', { weekday: 'long', day: 'numeric', month: 'short' });

    const namesText = absentList.map(a =>
      `• ${a.name} ${a.nickname ? `(${a.nickname})` : ''} \n  (รอเข้า: ${a.shift_name} ${a.start_time ? a.start_time.slice(0, 5) : ''})`
    ).join('\n');

    const message = {
      type: 'flex',
      altText: `⚠️ แจ้งเตือนยังไม่ลงเวลาเข้างาน (${absentList.length} คน)`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: '#ef4444',
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
              lineSpacing: '4px'
            }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: 'In The Haus HR System (Realtime Auto)', size: 'xxs', color: '#aaaaaa', align: 'center' }
          ]
        }
      }
    };

    // 7. ส่งเข้ากลุ่ม LINE
    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
    );

    return NextResponse.json({ success: true, absent_count: absentList.length, absent_list: absentList });

  } catch (error) {
    console.error("Absence Check Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}