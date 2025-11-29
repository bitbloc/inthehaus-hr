import { NextResponse } from 'next/server';
import { Client } from '@line/bot-sdk';

// ✅ Group ID ของร้าน
const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const { name, position, action, time, locationStatus, statusDetail } = await request.json();

    // --- กำหนดค่าตามประเภท Action ---
    let title = "";
    let color = "";
    let labelTime = "เวลา:";
    let labelStatus = "สถานะ:";
    let labelLocation = "พิกัด:";

    if (action === 'check_in') {
        title = '🟢 ลงเวลาเข้างาน';
        color = '#10b981'; // เขียว
    } else if (action === 'check_out') {
        title = '🔴 ลงเวลาออกงาน';
        color = '#ef4444'; // แดง
    } else if (action === 'leave_request') {
        title = '📝 แจ้งขอลาหยุด';
        color = '#f59e0b'; // ส้ม
        labelTime = "วันที่:";
        labelStatus = "เหตุผล:";
        labelLocation = "ประเภท:";
    }

    // กำหนดสีของข้อความสถานะ
    const isLateOrEarly = statusDetail?.includes('สาย') || statusDetail?.includes('ออกก่อน');
    const statusTextColor = isLateOrEarly ? '#f59e0b' : '#6b7280'; // ส้ม หรือ เทา

    // Clean ข้อความพิกัด
    const cleanLocation = locationStatus?.replace('✅ ', '').replace('❌ ', '') || '-';

    const message = {
      type: 'flex',
      altText: `${name} ${title}`,
      contents: {
        type: 'bubble',
        // ❌ เอาส่วน hero (รูปภาพ) ออกไปแล้วครับ
        body: {
          type: 'box',
          layout: 'vertical',
          contents: [
            // 1. หัวข้อ (Action & Position)
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: title, weight: 'bold', size: 'md', color: color, flex: 0 },
                { type: 'text', text: position || 'Staff', size: 'xs', color: '#9ca3af', align: 'end', gravity: 'center' }
              ]
            },
            // 2. ชื่อพนักงาน (ตัวใหญ่)
            { type: 'text', text: name, weight: 'bold', size: 'xl', margin: 'md', color: '#1f2937' },
            { type: 'separator', margin: 'md' },
            // 3. รายละเอียด (เวลา, สถานะ, พิกัด)
            {
              type: 'box',
              layout: 'vertical',
              margin: 'md',
              spacing: 'sm',
              contents: [
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: labelTime, size: 'sm', color: '#aaaaaa', flex: 2 },
                    { type: 'text', text: time, size: 'sm', color: '#1f2937', flex: 4, weight: 'bold' }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: labelStatus, size: 'sm', color: '#aaaaaa', flex: 2 },
                    { type: 'text', text: statusDetail || '-', size: 'sm', color: statusTextColor, flex: 4, weight: isLateOrEarly ? 'bold' : 'regular', wrap: true }
                  ]
                },
                {
                  type: 'box', layout: 'baseline',
                  contents: [
                    { type: 'text', text: labelLocation, size: 'sm', color: '#aaaaaa', flex: 2 },
                    { type: 'text', text: cleanLocation, size: 'xs', color: '#9ca3af', flex: 4, wrap: true }
                  ]
                }
              ]
            }
          ]
        },
        styles: { footer: { separator: true } }
      }
    };

    // ส่งเข้ากลุ่มโดยตรง
    await client.pushMessage(GROUP_ID, [message]); 
    
    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}