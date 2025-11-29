import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';
const client = new Client({ channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN, channelSecret: process.env.CHANNEL_SECRET });

export async function POST(request) {
  try {
    // ✅ รับ photoUrl เพิ่ม
    const { name, position, action, time, locationStatus, statusDetail, photoUrl } = await request.json();

    let title = "", color = "";
    if (action === 'check_in') { title = '🟢 เข้างาน'; color = '#10b981'; }
    else if (action === 'check_out') { title = '🔴 ออกงาน'; color = '#ef4444'; }
    else { title = '📝 ขอลาหยุด'; color = '#f59e0b'; }

    const message = {
      type: 'flex',
      altText: `${name} ${title}`,
      contents: {
        type: 'bubble',
        // ✅ ส่วนแสดงรูป (Hero)
        hero: photoUrl ? {
            type: "image",
            url: photoUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
            action: { type: "uri", uri: photoUrl } // กดรูปเพื่อดูภาพใหญ่
        } : undefined,
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            {
              type: 'box', layout: 'horizontal',
              contents: [
                { type: 'text', text: title, weight: 'bold', size: 'md', color: color },
                { type: 'text', text: position || '', size: 'xs', color: '#aaaaaa', align: 'end', gravity: 'center' }
              ]
            },
            { type: 'text', text: name, weight: 'bold', size: 'xl', margin: 'md', color: '#1f2937' },
            { type: 'separator', margin: 'md' },
            {
              type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
              contents: [
                { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'เวลา:', size: 'sm', color: '#aaaaaa', flex: 2 }, { type: 'text', text: time, size: 'sm', color: '#1f2937', flex: 4, weight: 'bold' }] },
                { type: 'box', layout: 'baseline', contents: [{ type: 'text', text: 'สถานะ:', size: 'sm', color: '#aaaaaa', flex: 2 }, { type: 'text', text: statusDetail || '-', size: 'sm', color: '#f59e0b', flex: 4, wrap: true }] }
              ]
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