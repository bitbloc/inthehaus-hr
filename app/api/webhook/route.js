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

    // We only handle the first event for simplicity in this hybrid mode, 
    // or we can loop. Let's loop but only reply to matches.
    for (const event of events) {
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
        } else if (text === 'hr_wrap' || text === 'summary') {
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
        }
      }
    }

    if (handledLocally) {
      return NextResponse.json({ success: true, handler: 'local' });
    }

    // 2. Forward to Supabase Function (if not handled)
    const response = await fetch('https://lxfavbzmebqqsffgyyph.supabase.co/functions/v1/line-webhook', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-line-signature': signature || '',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      console.error(`Supabase function error: ${response.status} ${response.statusText}`);
      // return success to LINE to avoid retries even if our backend failed
      return NextResponse.json({ success: true, forwarded: false });
    }

    const data = await response.json();
    return NextResponse.json(data);

  } catch (error) {
    console.error("Webhook Proxy Error:", error);
    // Always return 200 to LINE to prevent retries
    return NextResponse.json({ success: false }, { status: 200 });
  }
}