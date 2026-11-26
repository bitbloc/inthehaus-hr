import { NextResponse } from 'next/server';
import { Client } from '@/utils/lineClient';
import { BRAND } from '@/utils/brand';

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

    // Brand v2: plum header, cream body, Thai-first type, no icons.
    const messageContents = {
      type: 'bubble',
      size: 'mega',
      styles: {
        body: { backgroundColor: BRAND.cream },
        footer: { backgroundColor: BRAND.cream, separator: true, separatorColor: BRAND.rule }
      },
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: BRAND.plum,
        paddingAll: '20px',
        contents: [
          { type: 'text', text: shiftName || 'ตรวจสอบร้าน', size: 'xl', weight: 'bold', color: BRAND.cream, wrap: true },
          { type: 'text', text: 'ได้รับเช็คลิสต์แล้ว', size: 'xs', color: BRAND.onPlum2, margin: 'sm' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'text',
            text: 'ระบบได้รับบันทึกข้อมูลการตรวจสอบร้านเรียบร้อยแล้ว',
            size: 'sm',
            color: BRAND.muted,
            wrap: true
          },
          // Details panel (paper-2)
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: BRAND.paper2,
            cornerRadius: 'sm',
            paddingAll: '12px',
            margin: 'lg',
            spacing: 'xs',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'พนักงานผู้ส่ง', size: 'xs', color: BRAND.neutral, flex: 4 },
                  { type: 'text', text: staffName || '-', size: 'xs', weight: 'bold', color: BRAND.charcoal, align: 'end', flex: 6, wrap: true }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'สถานะตรวจสอบ', size: 'xs', color: BRAND.neutral, flex: 4 },
                  { type: 'text', text: checklistStatus || '-', size: 'xs', weight: 'bold', color: BRAND.plum, align: 'end', flex: 6, wrap: true }
                ]
              },
              ...(cashAmount ? [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'เงินสดในลิ้นชัก', size: 'xs', color: BRAND.neutral, flex: 4 },
                    { type: 'text', text: `฿ ${Number(cashAmount).toLocaleString('th-TH')}`, size: 'xs', weight: 'bold', color: BRAND.charcoal, align: 'end', flex: 6 }
                  ]
                }
              ] : []),
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เวลาบันทึก', size: 'xs', color: BRAND.neutral, flex: 4 },
                  { type: 'text', text: formattedTime || '-', size: 'xs', color: BRAND.muted, align: 'end', flex: 6 }
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
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'เปิดหน้าเช็คลิสต์',
              uri: 'https://inthehaus-hr.vercel.app/checklist'
            },
            style: 'primary',
            color: BRAND.charcoal,
            height: 'sm'
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
