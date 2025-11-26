import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const body = await request.json();

    // 1. ดักจับกรณี LINE กดปุ่ม Verify (ส่งค่าว่างมาเทส)
    if (!body.events || body.events.length === 0) {
      return NextResponse.json({ success: true, message: "Webhook verified" });
    }

    const events = body.events;

    // 2. วนลูปเช็คข้อความ
    for (const event of events) {
      if (event.type === 'message' && event.message.type === 'text') {
        const text = event.message.text.toLowerCase().trim();

        // --- CASE A: เช็ค ID พนักงาน (พิมพ์ "id") ---
        if (text === 'id' || text === 'checkid') {
          const userId = event.source.userId;
          await client.replyMessage(event.replyToken, {
            type: 'text',
            text: `👤 User ID ของคุณคือ:\n${userId}`
          });
        }

        // --- CASE B: เช็ค ID กลุ่ม (พิมพ์ "gid") ---
        if (text === 'gid' || text === 'groupid') {
           const source = event.source;
           let replyText = "";

           if (source.type === 'group') {
             replyText = `🏠 Group ID ของห้องนี้คือ:\n\n${source.groupId}\n\n(Copy รหัสนี้ไปใส่ใน Code แจ้งเตือนครับ)`;
           } else if (source.type === 'room') {
             replyText = `Room ID ของห้องนี้คือ:\n\n${source.roomId}`;
           } else {
             replyText = "⚠️ นี่คือแชทส่วนตัวครับ ไม่มี Group ID\n(ต้องพิมพ์คำนี้ในกลุ่มไลน์เท่านั้น)";
           }

           await client.replyMessage(event.replyToken, {
             type: 'text',
             text: replyText
           });
        }
      }
      
      // 3. ทักทายตอนโดนเชิญเข้ากลุ่ม
      if (event.type === 'join') {
        await client.replyMessage(event.replyToken, {
            type: 'text',
            text: 'สวัสดีครับ! บอท HR มารายงานตัว 🫡\n\n- พิมพ์ "gid" เพื่อดูรหัสกลุ่มสำหรับตั้งค่าแจ้งเตือน\n- พิมพ์ "id" เพื่อดูรหัสพนักงาน'
        });
      }
    }

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Webhook Error:", error);
    return NextResponse.json({ success: false }, { status: 200 }); 
  }
}