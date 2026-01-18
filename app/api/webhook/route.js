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
          // --- HR WRAP LOGIC ---
          const { supabase } = await import('../../../lib/supabaseClient');
          const { format, startOfDay, endOfDay, differenceInMinutes, addHours } = await import('date-fns');

          // Get today's date range (Local Time handling is tricky on server, but let's assume UTC+7 or standard)
          // Since server might be UTC, we want "Today in Thailand". 
          // 1. Get current UTC time
          const now = new Date();
          // 2. Adjust to Thai time for "Day" determination? 
          // Actually, let's just use server time broadly or check 'timestamp' range.
          // Better: Get logs from last 24 hours or just "Today" based on +7 offset.
          // Let's use simple UTC start/end for simplicity as Supabase stores in UTC.
          // But we want "Today's shift".

          const START_OF_DAY_UTC = new Date();
          START_OF_DAY_UTC.setHours(0, 0, 0, 0); // Server local time (usually UTC in Vercel)

          // Query Attendance
          const { data: logs, error } = await supabase
            .from('attendance_logs')
            .select('*, employees(name, position)')
            .gte('timestamp', START_OF_DAY_UTC.toISOString())
            .order('timestamp', { ascending: true });

          if (error) {
            console.error("HR Wrap Data Error:", error);
            await client.replyMessage(event.replyToken, { type: 'text', text: 'Error fetching data.' });
            handledLocally = true;
            continue;
          }

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

          // Build Message
          let msg = `สรุปการเข้างาน ${format(new Date(), 'dd/MM/yyyy')}\n`;
          let count = 0;

          for (const name in summary) {
            count++;
            const s = summary[name];
            const inTime = s.in ? format(addHours(s.in, 7), 'HH:mm') : '-'; // Adjust UTC to Thai (+7) for display? 
            // Note: date-fns 'format' uses local system time. If server is UTC, we add 7h manually for display or use timeZone.
            // Let's assume input needs +7 adjustment if server is UTC.
            // Safe bet: Display raw time + 7 hours if server is UTC. 
            // Better: use `new Date(s.in).toLocaleTimeString('th-TH', { timeZone: 'Asia/Bangkok' })` but node might not have locale.
            // Let's hardcode +7h for display safety since we know it's Thailand.

            const outTime = s.out ? format(addHours(s.out, 7), 'HH:mm') : '-';

            let duration = '';
            if (s.in) {
              const endT = s.out || new Date(); // If not out, calc valid duration so far? Or just show "Working"
              const diff = differenceInMinutes(endT, s.in);
              const hrs = Math.floor(diff / 60);
              const mins = diff % 60;
              duration = `(${hrs}ชม. ${mins}น.)`;
              if (!s.out) duration += ' [Working]';
            }

            msg += `\n👤 ${s.name} (${s.position})`;
            msg += `\n   เข้า: ${inTime} | ออก: ${outTime}`;
            msg += `\n   รวม: ${duration}\n`;
          }

          if (count === 0) msg += "\nยังไม่มีการลงเวลาวันนี้";

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