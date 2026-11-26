import { NextResponse } from 'next/server';
import { Client } from '@/utils/lineClient';
import { BRAND } from '@/utils/brand';

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
    // รับค่า type เพิ่มมาด้วย (check_in หรือ check_out)
    const { shiftName, type } = await request.json();
    const liffUrl = "https://liff.line.me/2008567449-W868y8RY";

    let messageContents;

    // Brand v2 reminder card: plum header, cream body, one charcoal primary.
    const buildReminder = ({ title, buttons }) => ({
      type: 'bubble',
      size: 'mega',
      styles: {
        body: { backgroundColor: BRAND.cream },
        footer: { backgroundColor: BRAND.cream }
      },
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: BRAND.plum,
        paddingAll: '20px',
        contents: [
          { type: 'text', text: title, weight: 'bold', size: 'xl', color: BRAND.cream, wrap: true },
          { type: 'text', text: 'แจ้งเตือนกะงาน', size: 'xs', color: BRAND.onPlum2, margin: 'sm' }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          {
            type: 'box',
            layout: 'horizontal',
            contents: [
              { type: 'text', text: 'กะ', size: 'sm', color: BRAND.neutral, flex: 1 },
              { type: 'text', text: shiftName || '-', size: 'sm', weight: 'bold', color: BRAND.charcoal, flex: 3, wrap: true }
            ]
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        spacing: 'sm',
        paddingStart: '20px',
        paddingEnd: '20px',
        paddingBottom: '16px',
        contents: buttons
      }
    });

    if (type === 'check_out') {
      messageContents = buildReminder({
        title: 'อย่าลืมลงเวลาออกและเช็คสต็อก',
        buttons: [
          {
            type: 'button',
            style: 'primary',
            color: BRAND.charcoal,
            height: 'sm',
            action: { type: 'uri', label: 'กดออกงาน', uri: liffUrl }
          },
          {
            type: 'button',
            style: 'primary',
            color: BRAND.plum,
            height: 'sm',
            action: { type: 'uri', label: 'เช็คสต็อก', uri: 'https://haustable.vercel.app/staff/stock' }
          }
        ]
      });
    } else {
      // check_in
      messageContents = buildReminder({
        title: 'อย่าลืมลงเวลาเข้างาน',
        buttons: [
          {
            type: 'button',
            style: 'primary',
            color: BRAND.charcoal,
            height: 'sm',
            action: { type: 'uri', label: 'กดเข้างาน', uri: liffUrl }
          }
        ]
      });
    }

    const message = {
      type: 'flex',
      altText: type === 'check_out' ? `🌙 อย่าลืม check-out & check stock กะ ${shiftName}` : `⏰ อย่าลืม check-in กะ ${shiftName}`,
      contents: messageContents
    };

    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
    );
    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}