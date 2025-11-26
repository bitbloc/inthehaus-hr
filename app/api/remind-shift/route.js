import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

// ✅ ใส่ Group ID ของร้าน
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const { shiftName } = await request.json(); 
    const liffUrl = "https://liff.line.me/2008567449-W868y8RY"; // ลิงก์ LIFF เดิมของคุณ

    const message = {
      type: 'flex',
      altText: `แจ้งเตือนเข้างาน ${shiftName}`,
      contents: {
        type: 'bubble',
        body: {
          type: 'box', layout: 'vertical',
          contents: [
            { type: 'text', text: '⏰ ได้เวลาลงเวลาเข้างาน!', weight: 'bold', size: 'lg', color: '#1DB446' },
            { type: 'text', text: `สำหรับพนักงาน "${shiftName}"`, weight: 'bold', size: 'md', margin: 'md' },
            { type: 'text', text: 'กรุณากดปุ่มด้านล่างเพื่อ Check-in', size: 'sm', color: '#aaaaaa', margin: 'sm' }
          ]
        },
        footer: {
          type: 'box', layout: 'vertical',
          contents: [{ type: 'button', style: 'primary', color: '#06c755', action: { type: 'uri', label: '📍 กดลงเวลาที่นี่', uri: liffUrl } }]
        }
      }
    };

    // ✅ เปลี่ยนจาก broadcast เป็น pushMessage ระบุกลุ่ม
    await client.pushMessage(GROUP_ID, [message]);
    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}