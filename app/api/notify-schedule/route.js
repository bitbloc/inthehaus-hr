import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';
import { format, startOfWeek, endOfWeek, addDays, parseISO } from 'date-fns';

// ✅ Group IDs (กลุ่มหลัก และ กลุ่มแผนกอื่น)
const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff',
  'C71db3c7339b11f43dc8f1ec34bf46f43'
];

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

function getShiftColorHex(shiftName) {
  const name = (shiftName || '').toLowerCase();
  
  if (name.includes('ควบ') || name.includes('double')) {
    return '#e11d48'; // Rose
  }
  if (name.includes('ค่ำ') || name.includes('ดึก') || name.includes('night') || name.includes('evening')) {
    return '#4f46e5'; // Indigo
  }
  if (name.includes('เช้า') || name.includes('morning')) {
    return '#d97706'; // Amber
  }
  return '#ca8a04'; // Yellow
}

export async function POST(request) {
  try {
    let startDateParam, endDateParam;
    try {
      const body = await request.json();
      startDateParam = body.startDate;
      endDateParam = body.endDate;
    } catch (e) {
      // Empty or invalid body, ignore
    }

    const today = new Date();
    // Monday of current week
    const weekStart = startDateParam ? parseISO(startDateParam) : startOfWeek(today, { weekStartsOn: 1 });
    const weekEnd = endDateParam ? parseISO(endDateParam) : addDays(weekStart, 6);

    const startStr = format(weekStart, 'yyyy-MM-dd');
    const endStr = format(weekEnd, 'yyyy-MM-dd');

    // 1. Fetch Roster Transactions for the selected week
    const { data: schedules, error: queryError } = await supabase
      .from('roster_transactions')
      .select(`
        date,
        employee_id,
        slot_type,
        is_off,
        status,
        shift_id,
        custom_start_time,
        custom_end_time,
        employees(name, nickname),
        shifts(name, start_time, end_time)
      `)
      .gte('date', startStr)
      .lte('date', endStr)
      .order('date', { ascending: true });

    if (queryError) {
      throw queryError;
    }

    // 2. Publish all drafts in this week
    const { error: updateError } = await supabase
      .from('roster_transactions')
      .update({ status: 'PUBLISHED' })
      .gte('date', startStr)
      .lte('date', endStr)
      .eq('status', 'DRAFT');

    if (updateError) {
      console.error("Failed to update Roster drafts status to PUBLISHED:", updateError);
    }

    if (!schedules || schedules.length === 0) {
      return NextResponse.json({ success: false, message: "ไม่พบตารางงานในระบบสำหรับช่วงเวลานี้" });
    }

    const daysTitle = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    const rosterByDateStr = {};
    const weekDates = [];

    // Initialize days of the week starting from Monday
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      const dateStr = format(d, 'yyyy-MM-dd');
      weekDates.push(d);
      rosterByDateStr[dateStr] = [];
    }

    schedules.forEach(item => {
      if (item.is_off) return;

      const shiftStart = item.custom_start_time?.slice(0, 5) || item.shifts?.start_time?.slice(0, 5) || '';
      const shiftEnd = item.custom_end_time?.slice(0, 5) || item.shifts?.end_time?.slice(0, 5) || '';
      const timeStr = shiftStart && shiftEnd ? `${shiftStart}-${shiftEnd}` : shiftStart;
      
      const empName = item.employees?.nickname || item.employees?.name || 'พนักงาน';
      const shiftName = item.shifts?.name || 'Custom';
      
      if (rosterByDateStr[item.date]) {
        rosterByDateStr[item.date].push({
          name: empName,
          shift: shiftName,
          time: timeStr
        });
      }
    });

    const contents = [];
    const startFmt = format(weekStart, 'dd/MM/yyyy');
    const endFmt = format(weekEnd, 'dd/MM/yyyy');
    contents.push({ type: 'text', text: '📅 ตารางงานประจำสัปดาห์', weight: 'bold', size: 'xl', color: '#1DB446', align: 'center' });
    contents.push({ type: 'text', text: `ระหว่างวันที่: ${startFmt} - ${endFmt}`, size: 'sm', color: '#666666', align: 'center', margin: 'xs' });
    contents.push({ type: 'separator', margin: 'md' });

    weekDates.forEach(date => {
      const dateStr = format(date, 'yyyy-MM-dd');
      const dayIndex = date.getDay();
      const dayName = daysTitle[dayIndex];
      const dateLabel = format(date, 'dd/MM');
      const staffList = rosterByDateStr[dateStr] || [];

      if (staffList.length > 0) {
        contents.push({
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [
            { type: 'text', text: `${dayName} ${dateLabel}`, weight: 'bold', size: 'sm', color: '#333333', flex: 2 },
            { type: 'text', text: `${staffList.length} คน`, size: 'xs', color: '#555555', align: 'end', flex: 1 }
          ]
        });
        staffList.forEach(staff => {
          const shiftColor = getShiftColorHex(staff.shift);
          contents.push({
            type: 'box', layout: 'horizontal', margin: 'xs',
            contents: [
              { type: 'text', text: `• ${staff.name}`, size: 'xs', color: '#333333', flex: 3 },
              { type: 'text', text: staff.time || '', size: 'xs', color: shiftColor, align: 'end', flex: 2, weight: 'bold' }
            ]
          });
        });
        contents.push({ type: 'separator', margin: 'sm' });
      } else {
        contents.push({
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [
            { type: 'text', text: `${dayName} ${dateLabel}`, weight: 'bold', size: 'sm', color: '#333333', flex: 2 },
            { type: 'text', text: `ไม่มีคนเข้ากะ`, size: 'xs', color: '#555555', align: 'end', flex: 1 }
          ]
        });
        contents.push({ type: 'separator', margin: 'sm' });
      }
    });

    const message = {
      type: 'flex',
      altText: `📅 ประกาศตารางงาน (${startFmt} - ${endFmt})`,
      contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: contents } }
    };

    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]).catch(e => console.error("LINE Push Error:", e)))
    );

    return NextResponse.json({ success: true, message: "ประกาศตารางงานและอัปเดตสถานะสำเร็จ" });

  } catch (error) {
    console.error("Schedule broadcast error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}