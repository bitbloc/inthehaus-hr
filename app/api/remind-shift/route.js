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
    // รับค่า type เพิ่มมาด้วย (check_in หรือ check_out)
    const { shiftName, type } = await request.json(); 
    const liffUrl = "https://liff.line.me/2008567449-W868y8RY";

    let title = "";
    let subTitle = "";
    let buttonText = "";
    let colorHeader = "";
    let colorButton = "";

    // กำหนดสีและข้อความ ตามประเภทการเรียก
    if (type === 'check_out') {
        title = "🌙 เลิกงานแล้ว!";
        subTitle = `จบกะการทำงาน "${shiftName}"`;
        buttonText = "🔴 กดออกงาน (Check Out)";
        colorHeader = "#333333"; // สีเทาเข้ม
        colorButton = "#ff334b"; // สีแดง
    } else {
        // Default เป็น check_in
        title = "⏰ ได้เวลาเข้างาน!";
        subTitle = `สำหรับพนักงาน "${shiftName}"`;
        buttonText = "🟢 กดเข้างาน (Check In)";
        colorHeader = "#1DB446"; // สีเขียว LINE
        colorButton = "#06c755"; // สีเขียว
    }

    const message = {
      type: 'flex',
      altText: `แจ้งเตือน ${type === 'check_out' ? 'ออกงาน' : 'เข้างาน'} ${shiftName}`,
      contents: {
        type: 'bubble',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            { type: 'text', text: title, weight: 'bold', size: 'lg', color: colorHeader },
            { type: 'text', text: subTitle, weight: 'bold', size: 'md', margin: 'md' },
            { type: 'text', text: 'กรุณากดปุ่มด้านล่างเพื่อบันทึกเวลา', size: 'sm', color: '#aaaaaa', margin: 'sm' }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: colorButton,
              action: {
                type: 'uri',
                label: buttonText,
                uri: liffUrl
              }
            }
          ]
        }
      }
    };

    await client.pushMessage(GROUP_ID, [message]);
    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}