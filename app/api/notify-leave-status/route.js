import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

// ✅ Group ID เดิมของร้าน
const GROUP_ID = 'C1210c7a0601b5a675060e312efe10bff';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    // รับข้อมูลจากหน้า Admin
    const { name, date, type, reason, status } = await request.json();

    const isApproved = status === 'approved';
    const color = isApproved ? '#06c755' : '#ff334b'; // เขียว หรือ แดง
    const title = isApproved ? '✅ อนุมัติการลา' : '❌ ไม่อนุมัติการลา';
    const typeText = type === 'sick' ? 'ลาป่วย 😷' : type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️';

    const message = {
      type: 'flex',
      altText: `ผลการขอลา: ${status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            // Header สีตามสถานะ
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: title, weight: 'bold', size: 'md', color: color }
              ]
            },
            { type: 'separator', margin: 'md' },
            // รายละเอียด
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'ชื่อ:', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: name, weight: 'bold', color: '#666666', size: 'sm', flex: 4 }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'วันที่:', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: date, color: '#666666', size: 'sm', flex: 4 }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'ประเภท:', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: typeText, color: '#666666', size: 'sm', flex: 4 }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'เหตุผล:', color: '#aaaaaa', size: 'sm', flex: 2 },
                    { type: 'text', text: reason || '-', color: '#666666', size: 'sm', flex: 4, wrap: true }
                  ]
                }
              ]
            }
          ]
        },
        // Footer (ถ้าอนุมัติ ให้ดูดีหน่อย)
        styles: {
          footer: { separator: true }
        }
      }
    };

    // ส่งเข้ากลุ่ม
    await client.pushMessage(GROUP_ID, [message]);

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Notify Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}