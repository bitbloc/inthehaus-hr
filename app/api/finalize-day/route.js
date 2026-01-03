import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const GROUP_ID = process.env.LINE_GROUP_ID || 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // 1. Get date from Query Params or Default to Today
    const { searchParams } = new URL(request.url);
    const manualDate = searchParams.get('date'); // YYYY-MM-DD

    const now = manualDate ? new Date(manualDate) : new Date();
    const bangkokOffset = 7 * 60 * 60 * 1000;

    // Create Date Object for BKK time
    // If manualDate is 2024-01-02, new Date() gives 07:00 UTC if parsed as UTC, we need to be careful.
    // Simplest: Use the date string to construct the start of day.

    let startOfDayUTC, endOfDayUTC;

    if (manualDate) {
      // Manual Date (e.g., '2024-01-02') -> implies 00:00:00 BKK on that day
      // 00:00:00 BKK = Previous Day 17:00:00 UTC
      const targetDate = new Date(manualDate); // UTC 00:00
      // Adjust to BKK midnight relative to UTC
      const bkkMidnightInUtc = new Date(targetDate.getTime() - bangkokOffset);
      startOfDayUTC = bkkMidnightInUtc;
    } else {
      // Today
      const nowBkk = new Date(now.getTime() + bangkokOffset);
      nowBkk.setUTCHours(0, 0, 0, 0);
      startOfDayUTC = new Date(nowBkk.getTime() - bangkokOffset);
    }

    // End of day in BKK -> Start + 24h
    endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000);

    console.log(`Generating report for: ${startOfDayUTC.toISOString()} to ${endOfDayUTC.toISOString()}`);

    // 2. Fetch Weather (Bangkok)
    let weatherQuote = "วันนี้อากาศดี ขอให้พักผ่อนอย่างมีความสุขครับ 🌙";
    let weatherIcon = "🌙";
    try {
      const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=13.7563&longitude=100.5018&current_weather=true&timezone=Asia%2FBangkok');
      const weatherData = await weatherRes.json();
      const code = weatherData.current_weather?.weathercode;

      // Map WMO codes to Thai messages
      if (code === 0 || code === 1) {
        weatherQuote = "ฟ้าใสไร้ฝน กลับบ้านปลอดภัยนะครับ 🌌"; weatherIcon = "✨";
      } else if (code >= 2 && code <= 48) {
        weatherQuote = "วันนี้เมฆเยอะหน่อย พักผ่อนเติมพลังมนุษย์ทำงาน! ☁️"; weatherIcon = "☁️";
      } else if (code >= 51 && code <= 67) {
        weatherQuote = "ฝนตกปรอยๆ อย่าลืมกางร่มและดูแลสุขภาพด้วยนะครับ ☔"; weatherIcon = "🌧️";
      } else if (code >= 80) {
        weatherQuote = "ฝนตกหนัก! เดินทางกลับบ้านระมัดระวังด้วยนะครับ ⛈️"; weatherIcon = "⛈️";
      }
    } catch (e) { console.error("Weather fetch failed", e); }

    // 3. Fetch logs
    const { data: logs, error } = await supabase
      .from('attendance_logs')
      .select('*, employees(name, shifts(name, start_time, end_time))')
      .gte('timestamp', startOfDayUTC.toISOString())
      .lt('timestamp', endOfDayUTC.toISOString())
      .order('timestamp', { ascending: true });

    if (error) throw error;

    // 4. Process logs by employee
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
      const formatTime = (date) => {
        if (!date) return '-';
        const thDate = new Date(date.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        return `${String(thDate.getHours()).padStart(2, '0')}:${String(thDate.getMinutes()).padStart(2, '0')}`;
      };

      const inTime = formatTime(emp.checkIn);
      const outTime = emp.checkOut ? formatTime(emp.checkOut) : '--:--';

      // Calculate Duration
      let durationStr = "";
      if (emp.checkIn && emp.checkOut) {
        const diffMs = emp.checkOut - emp.checkIn;
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        durationStr = `${diffHrs}h ${diffMins}m`;
      }

      let status = 'ปกติ';
      let color = '#22c55e'; // Green (Normal)

      // Late Check
      if (emp.checkIn && emp.shiftStart) {
        const [sh, sm] = emp.shiftStart.split(':').map(Number);
        const checkInDate = new Date(emp.checkIn.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
        const checkInMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
        const shiftStartMinutes = sh * 60 + sm;

        if (checkInMinutes > shiftStartMinutes) {
          status = 'สาย';
          color = '#ef4444'; // Red (Late)
        }
      }

      // Check Incomplete
      if (!emp.checkOut) {
        status = 'ยังไม่ลงออก';
        color = '#f59e0b'; // Amber
      }

      reportLines.push({
        name: emp.name,
        time: `${inTime} - ${outTime}`,
        status: status,
        color: color,
        duration: durationStr
      });
    });

    // 5. Construct Beautiful Flex Message
    const message = {
      type: 'flex',
      altText: `สรุปยอดประจำวัน: ${new Date().toLocaleDateString('th-TH')}`,
      contents: {
        type: 'bubble',
        size: 'mega',
        header: {
          type: 'box', layout: 'vertical', paddingAll: 'lg', backgroundColor: '#F9FAFB',
          contents: [
            { type: 'text', text: 'Daily Summary', weight: 'bold', size: 'sm', color: '#6B7280', textTransform: 'uppercase', letterSpacing: '1px' },
            { type: 'text', text: 'Finalize Day 🏁', weight: 'bold', size: '3xl', color: '#111827', margin: 'sm' },
            { type: 'text', text: new Date(startOfDayUTC.getTime() + bangkokOffset).toLocaleDateString('th-TH', { timeZone: 'UTC', dateStyle: 'full' }), size: 'xs', color: '#9CA3AF', margin: 'xs' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', paddingAll: 'lg',
          contents: [
            // Weather Quote
            {
              type: 'box', layout: 'horizontal', backgroundColor: '#EFF6FF', cornerRadius: 'md', paddingAll: 'md', margin: 'md',
              contents: [
                { type: 'text', text: weatherIcon, size: 'xxl', flex: 1, align: 'center', gravity: 'center' },
                { type: 'text', text: weatherQuote, size: 'xs', color: '#1E40AF', flex: 5, wrap: true, gravity: 'center' }
              ]
            },
            // Stats
            {
              type: 'box', layout: 'horizontal', margin: 'lg',
              contents: [
                { type: 'text', text: 'พนักงานวันนี้', size: 'sm', color: '#6B7280', flex: 5 },
                { type: 'text', text: `${presentCount} คน`, size: 'sm', color: '#111827', weight: 'bold', align: 'end', flex: 3 }
              ]
            },
            { type: 'separator', margin: 'lg', color: '#E5E7EB' },
            // List
            {
              type: 'box', layout: 'vertical', margin: 'lg', spacing: 'md',
              contents: reportLines.map(line => ({
                type: 'box', layout: 'vertical',
                contents: [
                  {
                    type: 'box', layout: 'horizontal',
                    contents: [
                      { type: 'text', text: line.name, size: 'sm', weight: 'bold', color: '#374151', flex: 3 },
                      { type: 'text', text: line.time, size: 'sm', color: '#111827', align: 'end', flex: 3 },
                      { type: 'text', text: line.status, size: 'xs', color: '#FFFFFF', align: 'center', weight: 'bold', backgroundColor: line.color, paddingAll: '2px', cornerRadius: 'sm', offsetBottom: '1px', flex: 2 }
                    ]
                  },
                  // Duration Subline
                  line.duration ? {
                    type: 'text', text: `⏱️ Total: ${line.duration}`, size: 'xxs', color: '#9CA3AF', margin: 'xs', offsetStart: '2px'
                  } : { type: 'filler' } // Empty filler if no duration
                ]
              }))
            }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: 'In the haus HR System', size: 'xxs', color: '#D1D5DB', align: 'center' }
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