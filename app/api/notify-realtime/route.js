import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const { name, action, time, locationStatus } = await request.json();

    // เลือกสีและคำพูดตามการกระทำ
    const isCheckIn = action === 'check_in';
    const color = isCheckIn ? '#06c755' : '#ff334b'; // เขียว / แดง
    const title = isCheckIn ? '🟢 ลงเวลาเข้างาน' : '🔴 ลงเวลาออกงาน';

    const message = {
      type: 'flex',
      altText: `${name} ${title}`,
      contents: {
        type: 'bubble',
        size: 'micro',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: color,
          contents: [
            { type: 'text', text: title, color: '#ffffff', weight: 'bold', size: 'sm' }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: name, weight: 'bold', size: 'md', margin: 'sm' },
            { type: 'text', text: `เวลา: ${time}`, size: 'xs', color: '#aaaaaa' },
            { type: 'text', text: `พิกัด: ${locationStatus}`, size: 'xxs', color: '#cccccc', margin: 'xs' }
          ]
        }
      }
    };

    await client.broadcast([message]); 
    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}