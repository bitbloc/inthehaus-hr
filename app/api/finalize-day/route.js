import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export const dynamic = 'force-dynamic'; // ห้าม Cache

export async function POST(request) {
  try {
    console.log("🏁 Starting Finalize Day Process...");

    // 1. เวลาปัจจุบัน (UTC+7)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    
    const dayOfWeek = thaiTime.getDay();
    const todayStart = new Date(thaiTime); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(thaiTime); todayEnd.setHours(23,59,59,999);
    const dateString = thaiTime.toLocaleDateString('th-TH', { day: 'numeric', month: 'short', year: '2-digit' });

    // 2. ดึงตารางงาน (ป้องกันค่า null)
    const { data: schedules, error: schedError } = await supabase
      .from('employee_schedules')
      .select('employee_id, employees(name)')
      .eq('day_of_week', dayOfWeek)
      .eq('is_off', false);

    if (schedError) throw new Error("Schedule DB Error: " + schedError.message);
    if (!schedules || schedules.length === 0) {
        return NextResponse.json({ message: "No schedule today" });
    }

    // 3. ดึง Log วันนี้ (ป้องกันค่า null)
    const { data: logs, error: logError } = await supabase
      .from('attendance_logs')
      .select('employee_id')
      .gte('timestamp', todayStart.toISOString())
      .lt('timestamp', todayEnd.toISOString());

    if (logError) throw new Error("Log DB Error: " + logError.message);

    // ✅ ใส่ || [] กันพังถ้า logs เป็น null
    const presentIds = new Set((logs || []).map(l => l.employee_id));

    // 4. หาคนขาด
    const absentList = schedules.filter(s => !presentIds.has(s.employee_id));
    const absentCountShow = absentList.length; 

    // 5. บันทึก (ถ้ามีคนขาด)
    if (absentList.length > 0) {
        const insertData = absentList.map(s => ({
            employee_id: s.employee_id,
            action_type: 'absent',
            timestamp: new Date().toISOString()
        }));
        // ใช้ upsert แทน insert เพื่อไม่ให้ Error ถ้ารันซ้ำ
        await supabase.from('attendance_logs').upsert(insertData, { onConflict: 'id' }); 
    }

    // 6. ส่งไลน์ (ใส่ Try-Catch แยก เพื่อไม่ให้พังทั้งระบบถ้าส่งไม่ได้)
    let lineStatus = "Sent";
    try {
        const absentNames = absentList.map(a => `• ${a.employees?.name}`).join('\n') || "- ครบถ้วน -";
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

    } catch (lineError) {
        console.error("LINE Send Failed:", lineError);
        lineStatus = "Failed (Quota?): " + lineError.message;
        // ไม่ throw error ต่อ เพื่อให้ API จบการทำงานแบบ 200 OK
    }

    return NextResponse.json({ success: true, marked_count: absentCountShow, line_status: lineStatus });

  } catch (error) {
    console.error("Critical Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}