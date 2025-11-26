import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const body = await request.json();
    const events = body.events;

    // วนลูปเช็คทุกข้อความที่ส่งมา
    for (const event of events) {
      // ถ้าเป็นข้อความตัวอักษร
      if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.toLowerCase().trim();

        // ถ้าพิมพ์คำว่า "id" หรือ "checkid"
        if (text === 'id' || text === 'checkid') {
          const userId = event.source.userId;
          
          // ตอบกลับ User ID
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `รหัสพนักงานของคุณคือ:\n\n${userId}\n\n(Copy รหัสนี้ส่งให้ Admin เพื่อลงทะเบียน)`
          });
        }
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
  }
}