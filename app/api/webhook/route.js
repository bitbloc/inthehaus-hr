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