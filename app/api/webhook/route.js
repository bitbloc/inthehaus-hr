import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

// รองรับ GET: เอาไว้เปิดใน Browser เพื่อเช็คว่า Link ไม่เสีย
export async function GET(request) {
  return NextResponse.json({ status: "Webhook is active!" });
}

// รองรับ POST: อันนี้ที่ LINE ใช้ยิงเข้ามา
export async function POST(request) {
  try {
    const body = await request.json();
    
    // ✅ ดักจับกรณี LINE กดปุ่ม Verify (มันจะไม่มี events ส่งมา)
    if (!body.events || body.events.length === 0) {
      console.log("LINE Webhook verified!");
      return NextResponse.json({ success: true, message: "Webhook verified" });
    }

    const events = body.events;

    // วนลูปเช็คทุกข้อความ
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.toLowerCase().trim();

        // เช็คคำสั่ง "id"
        if (text === 'id' || text === 'checkid') {
          const userId = event.source.userId;
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `รหัสพนักงานของคุณคือ:\n${userId}`
          });
        }
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Webhook Error:", error);
    // ส่ง 200 OK กลับไปหลอก LINE เสมอ เพื่อไม่ให้มันฟ้อง Error (แม้หลังบ้านจะพัง)
    return NextResponse.json({ success: false }, { status: 200 }); 
  }
}