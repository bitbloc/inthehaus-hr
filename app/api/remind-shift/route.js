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
    // รับค่า type เพิ่มมาด้วย (check_in หรือ check_out)
    const { shiftName, type } = await request.json();
    const liffUrl = "https://liff.line.me/2008567449-W868y8RY";

    let messageContents;

    if (type === 'check_out') {
      messageContents = {
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
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'ONHAUS SYSTEM', weight: 'bold', size: 'xxs', color: '#7C7C7C' },
                { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: '#E05A36' }
              ]
            },
            { type: 'separator', color: '#1A1A1A', margin: 'md' },
            {
              type: 'text',
              text: '🌙 อย่าลืม CHECK-OUT & STOCK',
              weight: 'bold',
              size: 'lg',
              color: '#1A1A1A',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'xs',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'SHIFT', size: 'xs', color: '#7C7C7C', flex: 1 },
                    { type: 'text', text: (shiftName || '').toUpperCase(), size: 'xs', weight: 'bold', color: '#1A1A1A', flex: 2 }
                  ]
                }
              ]
            },
            { type: 'separator', color: '#CCCCCC', margin: 'md' }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingStart: '20px',
          paddingEnd: '20px',
          paddingBottom: '15px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#ff334b',
              height: 'sm',
              action: { type: 'uri', label: '🔴 กดออกงาน (CHECK OUT)', uri: liffUrl }
            },
            {
              type: 'button',
              style: 'primary',
              color: '#7C7C7C',
              height: 'sm',
              action: { type: 'uri', label: '📦 เช็คสต๊อก (CHECK STOCK)', uri: 'https://haustable.vercel.app/staff/stock' }
            },
            {
              type: 'text',
              text: 'ONHAUS SYSTEM ©',
              size: 'xxs',
              color: '#7C7C7C',
              align: 'center',
              weight: 'bold',
              margin: 'md'
            }
          ]
        }
      };
    } else {
      // check_in
      messageContents = {
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
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'ONHAUS SYSTEM', weight: 'bold', size: 'xxs', color: '#7C7C7C' },
                { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: '#E05A36' }
              ]
            },
            { type: 'separator', color: '#1A1A1A', margin: 'md' },
            {
              type: 'text',
              text: '⏰ อย่าลืม CHECK-IN',
              weight: 'bold',
              size: 'xl',
              color: '#1A1A1A',
              margin: 'lg'
            },
            {
              type: 'box',
              layout: 'vertical',
              margin: 'lg',
              spacing: 'xs',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'SHIFT', size: 'xs', color: '#7C7C7C', flex: 1 },
                    { type: 'text', text: (shiftName || '').toUpperCase(), size: 'xs', weight: 'bold', color: '#1A1A1A', flex: 2 }
                  ]
                }
              ]
            },
            { type: 'separator', color: '#CCCCCC', margin: 'md' }
          ]
        },
        footer: {
          type: 'box',
          layout: 'vertical',
          spacing: 'sm',
          paddingStart: '20px',
          paddingEnd: '20px',
          paddingBottom: '15px',
          contents: [
            {
              type: 'button',
              style: 'primary',
              color: '#1A1A1A',
              height: 'sm',
              action: { type: 'uri', label: '🟢 กดเข้างาน (CHECK IN)', uri: liffUrl }
            },
            {
              type: 'text',
              text: 'ONHAUS SYSTEM ©',
              size: 'xxs',
              color: '#7C7C7C',
              align: 'center',
              weight: 'bold',
              margin: 'md'
            }
          ]
        }
      };
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