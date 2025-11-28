import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';

export async function POST(request) {
  try {
    // 1. กำหนดวัน (วันนี้)
    const now = new Date();
    // UTC+7 setup
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    
    const dayOfWeek = thaiTime.getDay();
    const todayStart = new Date(thaiTime); todayStart.setHours(0,0,0,0);
    const todayEnd = new Date(thaiTime); todayEnd.setHours(23,59,59,999);

    // 2. ดึงคนที่ "มีตารางงาน" วันนี้
    const { data: schedules } = await supabase
      .from('employee_schedules')
      .select('employee_id')
      .eq('day_of_week', dayOfWeek)
      .eq('is_off', false);

    if (!schedules || schedules.length === 0) return NextResponse.json({ message: "No schedule today" });

    // 3. ดึงคนที่ "มาทำงานแล้ว" วันนี้
    const { data: logs } = await supabase
      .from('attendance_logs')
      .select('employee_id')
      .gte('timestamp', todayStart.toISOString())
      .lt('timestamp', todayEnd.toISOString());

    const presentIds = new Set(logs.map(l => l.employee_id));

    // 4. หาคนหาย
    const absentIds = schedules
        .map(s => s.employee_id)
        .filter(id => !presentIds.has(id));

    if (absentIds.length === 0) return NextResponse.json({ message: "Attendance Complete (No absent)" });

    // 5. ยัด Log 'absent' ลง Database (ทำทีละคน)
    const insertData = absentIds.map(id => ({
        employee_id: id,
        action_type: 'absent', // 🔴 บันทึกสถานะใหม่
        timestamp: new Date().toISOString() // เวลาปัจจุบัน (หรือจะ Fix เป็นสิ้นวันก็ได้)
    }));

    const { error } = await supabase.from('attendance_logs').insert(insertData);

    if (error) throw error;

    return NextResponse.json({ success: true, marked_count: insertData.length });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}