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
    const { name, position, action, time, locationStatus, statusDetail, photoUrl } = await request.json();

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

    const isLateOrEarly = statusDetail?.includes('สาย') || statusDetail?.includes('ออกก่อน');
    const statusTextColor = isLateOrEarly ? '#f59e0b' : '#6b7280'; // ส้ม หรือ เทา

    // Clean ข้อความพิกัด
    const cleanLocation = locationStatus?.replace('✅ ', '').replace('❌ ', '') || '-';

    // ✅ แก้ไข URL ให้ถูกต้อง (เอา Markdown link ออก)
    const validPhotoUrl = photoUrl && photoUrl.startsWith('http') 
        ? photoUrl 
        : 'https://via.placeholder.com/150?text=No+Img';

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
            // 1. หัวข้อ (Title Bar)
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: title, weight: 'bold', size: 'sm', color: color, flex: 0 },
                { type: 'text', text: position || 'Staff', size: 'xs', color: '#9ca3af', align: 'end', gravity: 'center' }
              ]
            },
            { type: 'separator', margin: 'md' },
            
            // 2. เนื้อหาหลัก
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              spacing: 'md',
              contents: [
                // 📸 2.1 รูปภาพ (Icon)
                {
                  type: 'image',
                  url: validPhotoUrl, // ✅ ใช้ตัวแปรที่แก้แล้ว
                  size: 'lg',
                  aspectRatio: '1:1',
                  aspectMode: 'cover',
                  borderRadius: 'md',
                  action: { type: 'uri', uri: validPhotoUrl },
                  flex: 3
                },
                // 📝 2.2 รายละเอียด (ขวามือ)
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 5,
                  contents: [
                    { type: 'text', text: name, weight: 'bold', size: 'md', color: '#1f2937', wrap: true, margin: 'none' },
                    {
                        type: 'box', layout: 'vertical', margin: 'sm', spacing: 'xs',
                        contents: [
                            // เวลา
                            {
                                type: 'box', layout: 'baseline', spacing: 'sm',
                                contents: [
                                    { type: 'text', text: labelTime, color: '#aaaaaa', size: 'xxs', flex: 1 },
                                    { type: 'text', text: time, color: '#4b5563', size: 'xs', flex: 2, weight: 'bold' }
                                ]
                            },
                            // สถานะ
                            {
                                type: 'box', layout: 'baseline', spacing: 'sm',
                                contents: [
                                    { type: 'text', text: labelStatus, color: '#aaaaaa', size: 'xxs', flex: 1 },
                                    { type: 'text', text: statusDetail || '-', color: statusTextColor, size: 'xs', flex: 2, wrap: true }
                                ]
                            },
                            // พิกัด
                            {
                                type: 'box', layout: 'baseline', spacing: 'sm',
                                contents: [
                                    { type: 'text', text: labelLocation, color: '#aaaaaa', size: 'xxs', flex: 1 },
                                    { type: 'text', text: cleanLocation, color: '#9ca3af', size: 'xxs', flex: 2, wrap: true }
                                ]
                            }
                        ]
                    }
                  ]
                }
              ]
            }
          ]
        },
        styles: { footer: { separator: true } }
      }
    };

    // ส่งข้อความ
    await client.pushMessage(GROUP_ID, [message]); 
    
    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Notify Error:", error); // ✅ เพิ่ม Log เพื่อดู Error ใน Vercel
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}