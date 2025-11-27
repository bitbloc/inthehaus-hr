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
    // รับค่าเพิ่ม: position (ตำแหน่ง), statusDetail (รายละเอียดเวลา เช่น สาย 5 นาที)
    const { name, position, action, time, locationStatus, statusDetail } = await request.json();

    const isCheckIn = action === 'check_in';
    // สี: เข้า=เขียว, ออก=แดง
    const color = isCheckIn ? '#10b981' : '#ef4444'; 
    const title = isCheckIn ? '🟢 ลงเวลาเข้างาน' : '🔴 ลงเวลาออกงาน';
    
    // กำหนดสีของสถานะเวลา (ถ้าสาย หรือ ออกก่อน ให้เป็นสีส้มเด่นๆ)
    const isLateOrEarly = statusDetail.includes('สาย') || statusDetail.includes('ออกก่อน');
    const statusColor = isLateOrEarly ? '#f59e0b' : '#6b7280';

    const message = {
      type: 'flex',
      altText: `${name} ${title}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            // Header: ชื่อและตำแหน่ง
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: title, weight: 'bold', size: 'sm', color: color, flex: 0 },
                { type: 'text', text: position || 'Staff', size: 'xs', color: '#9ca3af', align: 'end', gravity: 'center' }
              ]
            },
            // ชื่อพนักงานตัวใหญ่
            { type: 'text', text: name, weight: 'bold', size: 'xl', margin: 'md', color: '#1f2937' },
            { type: 'separator', margin: 'md' },
            // รายละเอียดเวลา
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'เวลา:', size: 'sm', color: '#aaaaaa', flex: 2 },
                    { type: 'text', text: time, size: 'sm', color: '#1f2937', flex: 4, weight: 'bold' }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'สถานะ:', size: 'sm', color: '#aaaaaa', flex: 2 },
                    { type: 'text', text: statusDetail, size: 'sm', color: statusColor, flex: 4, weight: isLateOrEarly ? 'bold' : 'regular' }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: 'พิกัด:', size: 'sm', color: '#aaaaaa', flex: 2 },
                    { type: 'text', text: locationStatus.replace('✅ ', '').replace('❌ ', ''), size: 'xs', color: '#9ca3af', flex: 4, wrap: true }
                  ]
                }
              ]
            }
          ]
        },
        styles: { footer: { separator: true } }
      }
    };

    await client.pushMessage(GROUP_ID, [message]); 
    
    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}