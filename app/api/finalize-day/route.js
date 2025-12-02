import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // 1. Get today's date range (Local Time logic might be needed if server is UTC)
    // Assuming server time is close enough or we use UTC dates
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // 2. Fetch logs
    const { data: logs, error } = await supabase
      .from('attendance_logs')
      .select('*, employees(name, shifts(name, start_time, end_time))')
      .gte('timestamp', today.toISOString())
      .lt('timestamp', tomorrow.toISOString())
      .order('timestamp', { ascending: true });

    if (error) throw error;

    // 3. Process logs by employee
    const empMap = {};
    logs.forEach(log => {
      const empId = log.employee_id;
      if (!empMap[empId]) {
        empMap[empId] = {
          name: log.employees?.name || 'Unknown',
          checkIn: null,
          checkOut: null,
          shift: log.employees?.shifts?.name || '-',
          shiftStart: log.employees?.shifts?.start_time,
          shiftEnd: log.employees?.shifts?.end_time
        };
      }
      if (log.action_type === 'check_in') empMap[empId].checkIn = new Date(log.timestamp);
      if (log.action_type === 'check_out') empMap[empId].checkOut = new Date(log.timestamp);
    });

    const reportLines = [];
    let presentCount = 0;

    Object.values(empMap).forEach(emp => {
      presentCount++;
      // Format time to HH:mm
      const formatTime = (date) => {
        if (!date) return '-';
        // Adjust for timezone if necessary, but assuming Date object handles it or we just take HH:mm from ISO
        // Since we are in Node environment, new Date(iso) might be UTC. 
        // We should probably add 7 hours for Thailand if the server is UTC.
        // But let's try standard methods first. 
        // To be safe for Thailand time (UTC+7):
        const thDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        return `${String(thDate.getHours()).padStart(2, '0')}:${String(thDate.getMinutes()).padStart(2, '0')}`;
      };

      const inTime = formatTime(emp.checkIn);
      const outTime = emp.checkOut ? formatTime(emp.checkOut) : '?';

      let status = 'ปกติ';
      let color = '#111827'; // Default text color

      // Simple Late Check
      if (emp.checkIn && emp.shiftStart) {
        const [sh, sm] = emp.shiftStart.split(':').map(Number);
        // Create shift start time object for comparison
        // We need to be careful with timezones here. 
        // Let's compare minutes from midnight.

        // Get check-in minutes
        const checkInDate = new Date(emp.checkIn.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        const checkInMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
        const shiftStartMinutes = sh * 60 + sm;

        if (checkInMinutes > shiftStartMinutes) {
          status = 'สาย';
          color = '#ef4444'; // Red
        }
      }

      // Check Early Out or Forgot Out
      if (!emp.checkOut) {
        status = 'ยังไม่ออก?';
        color = '#f59e0b'; // Orange
      }

      reportLines.push({
        name: emp.name,
        time: `${inTime} - ${outTime}`,
        status: status,
        color: color
      });
    });

    // 4. Construct Message
    const message = {
      type: 'flex',
      altText: `สรุปยอดประจำวัน (Cut-off)`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'text', text: '🏁 Finalize Day', weight: 'bold', size: 'xl', color: '#1f2937' },
            { type: 'text', text: `สรุปยอดวันที่ ${new Date().toLocaleDateString('th-TH', { timeZone: 'Asia/Bangkok' })}`, size: 'xs', color: '#9ca3af' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'text', text: `พนักงานที่มาทำงาน: ${presentCount} คน`, weight: 'bold', size: 'sm', margin: 'md' },
            { type: 'separator', margin: 'md' },
            ...reportLines.map(line => ({
              type: 'box', layout: 'horizontal', margin: 'sm',
              contents: [
                { type: 'text', text: line.name, size: 'xs', flex: 3, color: '#1f2937' },
                { type: 'text', text: line.time, size: 'xxs', flex: 3, color: '#6b7280', align: 'center' },
                { type: 'text', text: line.status, size: 'xs', flex: 2, color: line.color, align: 'end', weight: 'bold' }
              ]
            }))
          ]
        }
      }
    };

    if (presentCount > 0) {
      await client.pushMessage(GROUP_ID, [message]);
      return NextResponse.json({ success: true, message: "Cut-off report sent" });
    } else {
      return NextResponse.json({ success: true, message: "No attendance data today" });
    }

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}