import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff'
];

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export const dynamic = 'force-dynamic';

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      shiftName = 'ตรวจสอบร้าน',
      statusDetail = 'บันทึกข้อมูลเรียบร้อย',
      staffName = 'พนักงาน',
      cashAmount,
      timestamp,
      itemsCount
    } = body;

    const formattedTime = timestamp || new Date().toLocaleString('th-TH', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    const checklistStatus = itemsCount
      ? `เช็คครบถ้วน (${itemsCount} รายการ)`
      : statusDetail;

    // Dieter Rams + Thai Modern Clean Aesthetic (No Image / Zero-Icon)
    const messageContents = {
      type: 'bubble',
      size: 'mega',
      styles: {
        body: { backgroundColor: '#FBF9F5' },
        footer: { backgroundColor: '#FBF9F5', separator: true, separatorColor: '#E6E1D6' }
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          // Header / Eyebrow
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'center',
            contents: [
              {
                type: 'text',
                text: 'SYSTEM // REPORT',
                size: 'xxs',
                color: '#78736A',
                weight: 'bold',
                flex: 1
              },
              {
                type: 'box',
                layout: 'horizontal',
                backgroundColor: '#F4F1EA',
                cornerRadius: 'xs',
                paddingStart: 'sm',
                paddingEnd: 'sm',
                paddingTop: 'xs',
                paddingBottom: 'xs',
                contents: [
                  {
                    type: 'text',
                    text: 'CHECKLIST RECEIVED',
                    size: 'xxs',
                    weight: 'bold',
                    color: '#4A6B3D'
                  }
                ]
              }
            ]
          },
          // Main Title (Shift Name)
          {
            type: 'text',
            text: shiftName,
            size: 'xl',
            weight: 'bold',
            color: '#1E1B18',
            margin: 'md',
            wrap: true
          },
          // Subtitle Confirmation
          {
            type: 'text',
            text: 'ระบบได้รับบันทึกข้อมูลการตรวจสอบร้านเรียบร้อยแล้ว',
            size: 'xs',
            color: '#78736A',
            wrap: true,
            margin: 'xs'
          },
          // Divider
          {
            type: 'separator',
            color: '#E6E1D6',
            margin: 'md'
          },
          // Details Grid (Elevated Card)
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F4F1EA',
            cornerRadius: 'sm',
            paddingAll: '12px',
            margin: 'md',
            spacing: 'xs',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'พนักงานผู้ส่ง', size: 'xs', color: '#78736A', flex: 4 },
                  { type: 'text', text: staffName, size: 'xs', weight: 'bold', color: '#1E1B18', align: 'end', flex: 6, wrap: true }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'สถานะตรวจสอบ', size: 'xs', color: '#78736A', flex: 4 },
                  { type: 'text', text: checklistStatus, size: 'xs', weight: 'bold', color: '#1E1B18', align: 'end', flex: 6, wrap: true }
                ]
              },
              ...(cashAmount ? [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'เงินสดในลิ้นชัก', size: 'xs', color: '#78736A', flex: 4 },
                    { type: 'text', text: `฿ ${Number(cashAmount).toLocaleString('th-TH')}`, size: 'xs', weight: 'bold', color: '#C85A32', align: 'end', flex: 6 }
                  ]
                }
              ] : []),
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เวลาบันทึก', size: 'xs', color: '#78736A', flex: 4 },
                  { type: 'text', text: formattedTime, size: 'xs', color: '#78736A', align: 'end', flex: 6 }
                ]
              }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          // Primary Action Link to Operations Portal
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'IN THE HAUS · Operations Portal',
              uri: 'https://inthehaus-hr.vercel.app/checklist'
            },
            style: 'primary',
            color: '#1E1B18',
            height: 'sm'
          },
          // Footnote
          {
            type: 'text',
            text: 'ONHAUS SYSTEM // DIETER RAMS PROTOCOL',
            size: 'xxs',
            color: '#A09B90',
            weight: 'bold',
            align: 'center',
            margin: 'sm'
          }
        ]
      }
    };

    const message = {
      type: 'flex',
      altText: `CHECKLIST RECEIVED: ${shiftName} โดย ${staffName}`,
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
