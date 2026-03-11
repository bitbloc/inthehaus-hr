import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';
import { getSchemaWeather, formatWeatherMessage } from '../../../utils/weather';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const signature = request.headers.get('x-line-signature');

    // 1. Check for specific commands (Weather) to handle locally
    // LINE Webhook can contain multiple events
    const events = body.events || [];
    let handledLocally = false;

    // Check if it's a test webhook from LINE developers console
    if (events.length === 0 || (events.length > 0 && events[0].replyToken === '00000000000000000000000000000000')) {
      return NextResponse.json({ success: true, message: 'Webhook verified' }, { status: 200 });
    }

    // We only handle the first event for simplicity in this hybrid mode, 
    // or we can loop. Let's loop but only reply to matches.
    for (const event of events) {
      if (event.source && event.source.type === 'group') {
        console.log("====================================");
        console.log("GROUP ID DETECTED:", event.source.groupId);
        console.log("====================================");
      }

      if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.trim().toLowerCase();
        if (text === 'อากาศ' || text === 'weather') {
          // Fetch Weather
          const weatherData = await getSchemaWeather();
          const replyText = formatWeatherMessage(weatherData);

          // Reply
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: replyText
          });
          handledLocally = true;
        } else if (text === 'hr_wrap' || text === 'hrwrap' || text === 'summary') {
          console.log("HR WRAP Command Triggered");
          // --- HR WRAP LOGIC ---
          const { supabase } = await import('../../../lib/supabaseClient');
          const { format, differenceInMinutes, addHours } = await import('date-fns');

          // Get today's range based on server time (UTC)
          // We'll trust Supabase 'gte' with a simple UTC midnight calculation.
          const START_OF_DAY_UTC = new Date();
          START_OF_DAY_UTC.setHours(0, 0, 0, 0);
          console.log("Querying logs since:", START_OF_DAY_UTC.toISOString());

          // Query Attendance
          const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('*, employees(name, position)')
            .gte('timestamp', START_OF_DAY_UTC.toISOString())
            .order('timestamp', { ascending: true });

          if (error) {
            console.error("HR Wrap Data Error:", error);
            await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
            handledLocally = true;
            continue;
          }

          console.log(`Found ${logs.length} logs.`);

          // Process Data
          const summary = {};
          logs.forEach(log => {
            const name = log.employees?.name || 'Unknown';
            const position = log.employees?.position || '-';
            if (!summary[name]) {
              summary[name] = { name, position, in: null, out: null };
            }
            if (log.action_type === 'check_in') summary[name].in = new Date(log.timestamp);
            if (log.action_type === 'check_out') summary[name].out = new Date(log.timestamp);
          });

          // Sort by Check-in time
          const summaryList = Object.values(summary).sort((a, b) => {
            const tA = a.in ? a.in.getTime() : 0;
            const tB = b.in ? b.in.getTime() : 0;
            return tA - tB;
          });

          // Build Message
          // Fallback if locale fails (e.g. node env issue): add 7 hours manually
          const safeThaiTime = (date) => format(addHours(date, 7), 'HH:mm');

          const todayStr = format(addHours(new Date(), 7), 'dd/MM/yyyy');

          let msg = `สรุปการเข้างาน ${todayStr}\n`;
          let count = 0;

          for (const s of summaryList) {
            count++;
            const inTime = s.in ? safeThaiTime(s.in) : '-';
            const outTime = s.out ? safeThaiTime(s.out) : '-';

            let durationStr = '';
            if (s.in) {
              const endT = s.out || new Date();
              const diff = differenceInMinutes(endT, s.in);
              const hrs = Math.floor(diff / 60);
              const mins = diff % 60;
              durationStr = `(${hrs}ชม. ${mins}น.)`;
              if (!s.out) durationStr += ' [Working]';
            }

            msg += `\n👤 ${s.name} (${s.position})`;
            msg += `\n   เข้า: ${inTime} | ออก: ${outTime}`;
            msg += `\n   รวม: ${durationStr}\n`;
          }

          if (count === 0) msg += "\nยังไม่มีการลงเวลาวันนี้";

          console.log("Replying with:", msg);

          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: msg
          });
          handledLocally = true;
        } else if (text === 'ลางาน') {
          console.log("Leave Request Command Triggered");
          const { supabase } = await import('../../../lib/supabaseClient');
          const { format, parseISO } = await import('date-fns');

          const { data: leaves, error } = await supabase
            .from('leave_requests')
            .select('*, employees(name, position)')
            .eq('status', 'pending')
            .order('leave_date', { ascending: true });

          if (error) {
            await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
            handledLocally = true;
            continue;
          }

          let count = 0;
          let msg = `📋 รายการรออนุมัติลางาน\n`;

          if (leaves && leaves.length > 0) {
            leaves.forEach(l => {
              count++;
              const typeText = l.leave_type === 'sick' ? 'ลาป่วย 😷' : l.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️';
              // Format date DD/MM/YYYY
              const dateStr = l.leave_date ? format(parseISO(l.leave_date), 'dd/MM/yyyy') : '-';

              msg += `\n👤 ${l.employees?.name || 'Unknown'} (${l.employees?.position || '-'})`;
              msg += `\n   วันที่: ${dateStr}`;
              msg += `\n   ประเภท: ${typeText}`;
              msg += `\n   เหตุผล: ${l.reason || '-'}\n`;
            });
            msg += `\n📌 รวมรออนุมัติ: ${count} รายการ`;
          } else {
            msg += "\n✅ ไม่มีรายการขอลาหยุดที่รออนุมัติ";
          }

          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: msg
          });
          handledLocally = true;
        } else if (text.startsWith('ขอลา')) {
          console.log("Recent Approved Leaves Command Triggered");
          const { supabase } = await import('../../../lib/supabaseClient');
          const { format, parseISO, addHours } = await import('date-fns');

          // หาจำนวนในข้อความ เช่น 'ขอลา 2'
          let limit = 2; // ค่าเริ่มต้น
          const match = text.match(/\d+/);
          if (match) {
            const parsed = parseInt(match[0], 10);
            if (!isNaN(parsed) && parsed > 0 && parsed <= 20) limit = parsed;
          }

          const { data: leaves, error } = await supabase
            .from('leave_requests')
            .select('*, employees(name, position)')
            .eq('status', 'approved')
            .order('created_at', { ascending: false }) // ล่าสุดขึ้นก่อน
            .limit(limit);

          if (error) {
            await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data: ' + error.message });
            handledLocally = true;
            continue;
          }

          let msg = `✅ ประวัติอนุมัติลาล่าสุด (${leaves ? leaves.length : 0} รายการ)\n`;

          if (leaves && leaves.length > 0) {
            leaves.forEach(l => {
              const typeText = l.leave_type === 'sick' ? 'ลาป่วย 😷' : l.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️';
              const dateStr = l.leave_date ? format(parseISO(l.leave_date), 'dd/MM/yyyy') : '-';

              // วันที่ถูกอนุมัติ (ประมาณการจาก created_at หรือถ้ามี approved_at) เอาแค่วันที่ขอลาพอ
              msg += `\n👤 ${l.employees?.name || 'Unknown'}`;
              msg += `\n   วันที่ลา: ${dateStr}`;
              msg += `\n   ประเภท: ${typeText}`;
              msg += `\n   เหตุผล: ${l.reason || '-'}\n`;
            });
          } else {
            msg += "\nยังไม่มีประวัติการอนุมัติการลา";
          }

          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: msg
          });
          handledLocally = true;
        }
      }
    }

    // Always attempt to forward to Google Apps Script
    // Forward to Google Apps Script ONLY IF it comes from the original group
    const isFromOriginalGroup = events.some(e => e.source?.groupId === 'C1210c7a0601b5a675060e312efe10bff');

    if (isFromOriginalGroup) {
      try {
        const gasResponse = await fetch('https://script.google.com/macros/s/AKfycbyJ5WFOFmjwVJWoIUer6dwxHdeSShDvUfSWU0NNfsIH8Ek9WguCAzJG9QSbK5g77MH6/exec', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(body),
        });
        console.log(`Forwarded to GAS, status: ${gasResponse.status}`);
      } catch (gasError) {
        console.error("Error forwarding to Google Apps Script:", gasError);
      }
    } else {
      console.log("Skipped GAS forwarding for non-primary group");
    }

    if (handledLocally) {
      return NextResponse.json({ success: true, handler: 'local' });
    }

    // Return success to avoid LINE retries
    return NextResponse.json({ success: true, forwardedToGas: true });

  } catch (error) {
    console.error("Webhook Proxy Error:", error);
    // Always return 200 to LINE to prevent retries
    return NextResponse.json({ success: false }, { status: 200 });
  }
}