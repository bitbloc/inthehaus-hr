import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';
import { format } from 'date-fns';

// ✅ Group IDs (กลุ่มหลัก และ กลุ่มแผนกอื่น)
const GROUP_IDS = [
  process.env.LINE_GROUP_ID || 'C1210c7a0601b5a675060e312efe10bff',
  'C71db3c7339b11f43dc8f1ec34bf46f43'
];

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // 1. รับวันที่ (Query Params หรือ วันนี้)
    const { searchParams } = new URL(request.url);
    const manualDate = searchParams.get('date'); // YYYY-MM-DD

    const now = manualDate ? new Date(manualDate) : new Date();
    const bangkokOffset = 7 * 60 * 60 * 1000;

    let startOfDayUTC, endOfDayUTC, dateStr;

    if (manualDate) {
      dateStr = manualDate;
      const targetDate = new Date(manualDate);
      startOfDayUTC = new Date(targetDate.getTime() - bangkokOffset);
    } else {
      const nowBkk = new Date(now.getTime() + bangkokOffset);
      dateStr = format(nowBkk, 'yyyy-MM-dd');
      nowBkk.setUTCHours(0, 0, 0, 0);
      startOfDayUTC = new Date(nowBkk.getTime() - bangkokOffset);
    }

    endOfDayUTC = new Date(startOfDayUTC.getTime() + 24 * 60 * 60 * 1000);

    // 2. Fetch Weather (Bangkok)
    let weatherQuote = "วันนี้อากาศดี ขอให้พักผ่อนอย่างมีความสุขครับ 🌙";
    let weatherIcon = "🌙";
    try {
      const weatherRes = await fetch('https://api.open-meteo.com/v1/forecast?latitude=13.7563&longitude=100.5018&current_weather=true&timezone=Asia%2FBangkok');
      const weatherData = await weatherRes.json();
      const code = weatherData.current_weather?.weathercode;

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

    // 3. ดึง Roster Transactions ของวันนี้ (Single Source of Truth)
    const { data: rosterTxs } = await supabase
      .from('roster_transactions')
      .select('employee_id, shift_id, custom_start_time, custom_end_time, is_off, status, shifts(name, start_time, end_time)')
      .eq('date', dateStr)
      .eq('status', 'PUBLISHED');

    const scheduledShiftMap = new Map();
    (rosterTxs || []).forEach(tx => {
      scheduledShiftMap.set(tx.employee_id, {
        shiftName: tx.shifts?.name || (tx.is_off ? 'OFF' : 'กะงาน'),
        startTime: tx.custom_start_time || tx.shifts?.start_time,
        endTime: tx.custom_end_time || tx.shifts?.end_time,
        isOff: tx.is_off
      });
    });

    // 4. Fetch logs ของวันเป้าหมาย
    const { data: logs, error } = await supabase
      .from('attendance_logs')
      .select('*, employees(id, name, nickname, position, photo_url)')
      .gte('timestamp', startOfDayUTC.toISOString())
      .lt('timestamp', endOfDayUTC.toISOString())
      .order('timestamp', { ascending: true });

    if (error) throw error;

    // 5. Process logs by employee
    const empMap = {};
    (logs || []).forEach(log => {
      const empId = log.employee_id;
      const empPos = (log.employees?.position || '').toLowerCase();
      const isOwner = empPos.includes('owner') || empPos.includes('ceo');

      if (!empMap[empId]) {
        const scheduled = scheduledShiftMap.get(empId);
        empMap[empId] = {
          name: log.employees?.name || 'Unknown',
          nickname: log.employees?.nickname ? `(${log.employees.nickname})` : '',
          position: log.employees?.position || '',
          isOwner,
          checkIn: null,
          checkOut: null,
          shift: scheduled?.shiftName || (isOwner ? '👑 Owner' : 'กะพิเศษ'),
          shiftStart: scheduled?.startTime,
          shiftEnd: scheduled?.endTime,
          isOff: scheduled?.isOff || false
        };
      }
      if (log.action_type === 'check_in') {
        if (!empMap[empId].checkIn || new Date(log.timestamp) < empMap[empId].checkIn) {
          empMap[empId].checkIn = new Date(log.timestamp);
        }
      }
      if (log.action_type === 'check_out') {
        if (!empMap[empId].checkOut || new Date(log.timestamp) > empMap[empId].checkOut) {
          empMap[empId].checkOut = new Date(log.timestamp);
        }
      }
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

      // Duration
      let durationStr = "";
      if (emp.checkIn && emp.checkOut) {
        const diffMs = emp.checkOut - emp.checkIn;
        const diffHrs = Math.floor(diffMs / 3600000);
        const diffMins = Math.floor((diffMs % 3600000) / 60000);
        durationStr = `${diffHrs}h ${diffMins}m`;
      }

      let status = 'ปกติ';
      let color = '#22c55e'; // Green

      if (emp.isOwner) {
        status = '👑 Owner';
        color = '#d97706'; // Amber / Gold
      } else {
        // Late Check: เทียบกับเวลาเริ่มของกะจริงในวันนั้น
        if (emp.checkIn && emp.shiftStart) {
          const [sh, sm] = emp.shiftStart.split(':').map(Number);
          const checkInDate = new Date(emp.checkIn.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
          const checkInMinutes = checkInDate.getHours() * 60 + checkInDate.getMinutes();
          const shiftStartMinutes = sh * 60 + sm;

          // อลุ้มอล่วย 5 นาที
          if (checkInMinutes > shiftStartMinutes + 5) {
            const lateMins = checkInMinutes - shiftStartMinutes;
            status = `สาย ${lateMins}น.`;
            color = '#ef4444'; // Red
          }
        }

        // Check Incomplete
        if (!emp.checkOut) {
          status = 'ยังไม่ลงออก';
          color = '#f59e0b'; // Amber
        }
      }

      reportLines.push({
        name: `${emp.name} ${emp.nickname}`.trim(),
        time: `${inTime} - ${outTime}`,
        status: status,
        color: color,
        duration: durationStr,
        shiftName: emp.shift
      });
    });

    // 6. Construct Beautiful Flex Message
    const message = {
      type: 'flex',
      altText: `🏁 สรุปยอดลงเวลาประจำวัน: ${new Date(startOfDayUTC.getTime() + bangkokOffset).toLocaleDateString('th-TH')}`,
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
                      { type: 'text', text: line.name, size: 'sm', weight: 'bold', color: '#374151', flex: 4 },
                      { type: 'text', text: line.time, size: 'sm', color: '#111827', align: 'end', flex: 3 },
                      { type: 'text', text: line.status, size: 'xs', color: '#FFFFFF', align: 'center', weight: 'bold', backgroundColor: line.color, paddingAll: '2px', cornerRadius: 'sm', offsetBottom: '1px', flex: 2 }
                    ]
                  },
                  line.duration ? {
                    type: 'text', text: `⏱️ ${line.shiftName} | รวม: ${line.duration}`, size: 'xxs', color: '#9CA3AF', margin: 'xs', offsetStart: '2px'
                  } : {
                    type: 'text', text: `⏱️ ${line.shiftName}`, size: 'xxs', color: '#9CA3AF', margin: 'xs', offsetStart: '2px'
                  }
                ]
              }))
            }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical', contents: [
            { type: 'text', text: 'In The Haus HR & Realtime System', size: 'xxs', color: '#D1D5DB', align: 'center' }
          ]
        }
      }
    };

    if (presentCount > 0) {
      await Promise.all(
        GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
      );
      return NextResponse.json({ success: true, message: "Cut-off report sent", count: presentCount });
    } else {
      return NextResponse.json({ success: true, message: "No attendance data today" });
    }

  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}