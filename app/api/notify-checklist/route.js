import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

// ✅ Group IDs (กลุ่มหลัก และ กลุ่มแผนกอื่น)
const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff',
  'C71db3c7339b11f43dc8f1ec34bf46f43'
];

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const { shiftName, statusDetail, staffName, cashAmount, timestamp } = await request.json();

    // Determine shift emoji/styling
    let shiftEmoji = "☀️";
    if (shiftName && (shiftName.includes("ปิด") || shiftName.includes("เย็น") || shiftName.includes("night") || shiftName.includes("evening"))) {
      shiftEmoji = "🌙";
    }

    const messageContents = {
      type: 'bubble',
      size: 'mega',
      styles: {
        body: { backgroundColor: '#F5F5F3' },
        footer: { backgroundColor: '#F5F5F3' }
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          // Header (ONHAUS SYSTEM & Accent dot)
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'ONHAUS SYSTEM', weight: 'bold', size: 'xxs', color: '#7C7C7C' },
              { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: '#E05A36' }
            ]
          },
          { type: 'separator', color: '#1A1A1A', margin: 'md' },
          
          // Checklist Title & Status
          {
            type: 'text',
            text: 'CHECKLIST REPORT',
            weight: 'bold',
            size: 'xxs',
            color: '#7C7C7C',
            margin: 'md'
          },
          {
            type: 'text',
            text: `${shiftEmoji} ${shiftName || 'ไม่ระบุชื่อกะ'}`,
            weight: 'bold',
            size: 'xl',
            color: '#1A1A1A',
            margin: 'sm',
            wrap: true
          },
          {
            type: 'text',
            text: `✅ ${statusDetail || 'ตรวจสอบครบถ้วน'}`,
            weight: 'bold',
            size: 'sm',
            color: '#1DB446',
            margin: 'xs'
          },
          { type: 'separator', color: '#CCCCCC', margin: 'md' },

          // Details grid
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'xs',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'พนักงาน', size: 'xs', color: '#7C7C7C', flex: 1 },
                  { type: 'text', text: staffName || '-', size: 'xs', weight: 'bold', color: '#1A1A1A', flex: 2, wrap: true }
                ]
              },
              ...(cashAmount ? [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'ยอดเงิน', size: 'xs', color: '#7C7C7C', flex: 1 },
                    { type: 'text', text: `฿ ${cashAmount}`, size: 'xs', weight: 'bold', color: '#1A1A1A', flex: 2 }
                  ]
                }
              ] : [])
            ]
          },
          { type: 'separator', color: '#CCCCCC', margin: 'md' },

          // Timestamp
          {
            type: 'text',
            text: `บันทึก: ${timestamp || new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}`,
            size: 'xxs',
            color: '#7C7C7C',
            align: 'end',
            margin: 'sm'
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingStart: '20px',
        paddingEnd: '20px',
        paddingBottom: '15px',
        contents: [
          {
            type: 'text',
            text: 'ONHAUS SYSTEM ©',
            size: 'xxs',
            color: '#7C7C7C',
            align: 'center',
            weight: 'bold'
          }
        ]
      }
    };

    const message = {
      type: 'flex',
      altText: `📋 Checklist Report: ${shiftName || 'ตรวจสอบกะ'} โดย ${staffName || 'พนักงาน'}`,
      contents: messageContents
    };

    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
    );

    return NextResponse.json({ success: true, message: 'Checklist report sent' });
  } catch (error) {
    console.error("Notify Checklist Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
