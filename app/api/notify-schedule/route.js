import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // 1. ดึงข้อมูลตารางงาน (เฉพาะคนที่มีกะ ไม่เอาวันหยุด)
    // Join 3 ตาราง: Schedule -> Employees -> Shifts
    const { data: schedules } = await supabase
      .from('employee_schedules')
      .select('day_of_week, employees(name), shifts(name, start_time, end_time)')
      .eq('is_off', false) // เอาเฉพาะวันที่มาทำงาน
      .order('day_of_week', { ascending: true }); // เรียง จันทร์-อาทิตย์

    if (!schedules || schedules.length === 0) {
        return NextResponse.json({ message: "ไม่พบตารางงาน" });
    }

    // 2. จัดกลุ่มตามวัน (0=อาทิตย์, 1=จันทร์ ...)
    const daysTitle = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
    const rosterByDay = {};
    
    // เตรียมกล่องใส่ข้อมูลแต่ละวัน
    daysTitle.forEach((_, index) => rosterByDay[index] = []);

    // เอาข้อมูลหยอดลงกล่อง
    schedules.forEach(item => {
        rosterByDay[item.day_of_week].push({
            name: item.employees?.name,
            shift: item.shifts?.name,
            time: `${item.shifts?.start_time}-${item.shifts?.end_time}`
        });
    });

    // 3. สร้างชิ้นส่วนข้อความ (Flex Message Components)
    const contents = [];
    
    // หัวข้อ
    contents.push({
        type: 'text', text: '📅 ตารางงานสัปดาห์นี้', weight: 'bold', size: 'xl', color: '#1DB446', align: 'center'
    });
    contents.push({ type: 'separator', margin: 'md' });

    // วนลูปสร้างตารางทีละวัน (เรียง จันทร์ -> อาทิตย์ ตามมาตรฐานทำงาน)
    const dayOrder = [1, 2, 3, 4, 5, 6, 0]; 

    dayOrder.forEach(dayIndex => {
        const dayName = daysTitle[dayIndex];
        const staffList = rosterByDay[dayIndex];

        if (staffList.length > 0) {
            // หัวข้อวัน (เช่น "จันทร์")
            contents.push({
                type: 'box',
                layout: 'horizontal',
                margin: 'lg',
                contents: [
                    { type: 'text', text: dayName, weight: 'bold', size: 'sm', color: '#333333', flex: 2 }, // ชื่อวันสีเข้ม
                    { type: 'text', text: `${staffList.length} คน`, size: 'xs', color: '#aaaaaa', align: 'end', flex: 1 }
                ]
            });

            // รายชื่อพนักงานในวันนั้น
            staffList.forEach(staff => {
                contents.push({
                    type: 'box',
                    layout: 'horizontal',
                    margin: 'xs',
                    contents: [
                        { type: 'text', text: `• ${staff.name}`, size: 'xs', color: '#555555', flex: 3 },
                        { type: 'text', text: `${staff.shift}`, size: 'xs', color: '#007bff', align: 'end', flex: 2 } // สีฟ้าคือกะ
                    ]
                });
            });
            
            // เส้นขีดคั่นวัน
            contents.push({ type: 'separator', margin: 'sm' });
        }
    });

    // 4. ประกอบร่างเป็น Message
    const message = {
      type: 'flex',
      altText: '📅 ตารางงานสัปดาห์นี้ออกแล้ว!',
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: contents
        }
      }
    };

    // 5. ส่งเข้ากลุ่ม
    await client.broadcast([message]);
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}