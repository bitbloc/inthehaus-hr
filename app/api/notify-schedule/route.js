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
    const { data: schedules } = await supabase
      .from('employee_schedules')
      .select('day_of_week, employees(name), shifts(name, start_time, end_time)')
      .eq('is_off', false)
      .order('day_of_week', { ascending: true });

    if (!schedules || schedules.length === 0) return NextResponse.json({ message: "ไม่พบตาราง" });

    const daysTitle = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    const rosterByDay = {};
    daysTitle.forEach((_, index) => rosterByDay[index] = []);

    schedules.forEach(item => {
        rosterByDay[item.day_of_week].push({
            name: item.employees?.name,
            shift: item.shifts?.name,
            time: `${item.shifts?.start_time}-${item.shifts?.end_time}`
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
                contents.push({
                    type: 'box', layout: 'horizontal', margin: 'xs',
                    contents: [
                        { type: 'text', text: `• ${staff.name}`, size: 'xs', color: '#555555', flex: 3 },
                        { type: 'text', text: `${staff.shift}`, size: 'xs', color: '#007bff', align: 'end', flex: 2 }
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

    // ✅ เปลี่ยนจาก broadcast เป็น pushMessage ระบุกลุ่ม
    await client.pushMessage(GROUP_ID, [message]);
    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}