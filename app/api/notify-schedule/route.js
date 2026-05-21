import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

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
    const { data: schedules } = await supabase
      .from('employee_schedules')
      .select('day_of_week, employees(name, nickname), shifts(name, start_time, end_time)')
      .eq('is_off', false)
      .order('day_of_week', { ascending: true });

    if (!schedules || schedules.length === 0) return NextResponse.json({ message: "ไม่พบตาราง" });

    const daysTitle = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    const rosterByDay = {};
    daysTitle.forEach((_, index) => rosterByDay[index] = []);

    schedules.forEach(item => {
      const shiftStart = item.shifts?.start_time?.slice(0, 5) || '';
      const shiftEnd = item.shifts?.end_time?.slice(0, 5) || '';
      const timeStr = shiftStart && shiftEnd ? `${shiftStart}-${shiftEnd}` : shiftStart;
      
      rosterByDay[item.day_of_week].push({
        name: item.employees?.nickname || item.employees?.name || 'พนักงาน',
        shift: item.shifts?.name || 'Custom',
        time: timeStr
      });
    });

    const contents = [];
    contents.push({ type: 'text', text: '📅 ตารางงานสัปดาห์นี้', weight: 'bold', size: 'xl', color: '#1DB446', align: 'center' });
    contents.push({ type: 'separator', margin: 'md' });

    const dayOrder = [1, 2, 3, 4, 5, 6, 0];

    dayOrder.forEach(dayIndex => {
      const dayName = daysTitle[dayIndex];
      const staffList = rosterByDay[dayIndex];

      if (staffList.length > 0) {
        contents.push({
          type: 'box', layout: 'horizontal', margin: 'lg',
          contents: [
            { type: 'text', text: dayName, weight: 'bold', size: 'sm', color: '#333333', flex: 2 },
            { type: 'text', text: `${staffList.length} คน`, size: 'xs', color: '#aaaaaa', align: 'end', flex: 1 }
          ]
        });
        staffList.forEach(staff => {
          const shiftText = staff.time ? `${staff.shift} (${staff.time})` : staff.shift;
          const shiftColor = getShiftColorHex(staff.shift);
          contents.push({
            type: 'box', layout: 'horizontal', margin: 'xs',
            contents: [
              { type: 'text', text: `• ${staff.name}`, size: 'xs', color: '#333333', flex: 3 },
              { type: 'text', text: shiftText, size: 'xs', color: shiftColor, align: 'end', flex: 3 }
            ]
          });
        });
        contents.push({ type: 'separator', margin: 'sm' });
      }
    });

    const message = {
      type: 'flex',
      altText: '📅 ตารางงานสัปดาห์นี้ออกแล้ว!',
      contents: { type: 'bubble', body: { type: 'box', layout: 'vertical', contents: contents } }
    };
    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
    );
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Schedule broadcast error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}