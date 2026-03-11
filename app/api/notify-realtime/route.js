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
    const statusTextColor = isLateOrEarly ? '#f59e0b' : '#6b7280';

    // Clean ข้อความพิกัด
    const cleanLocation = locationStatus?.replace('✅ ', '').replace('❌ ', '') || '-';

    // ✅ เตรียมส่วนแสดงรูปภาพ (Image Component)
    // ใช้รูป Placeholder พื้นหลังสีสว่าง ถ้าไม่มีรูปจริง เพื่อไม่ให้ Layout พัง
    const defaultPlaceholder = action === 'leave_request'
      ? 'https://placehold.co/150x150/f59e0b/ffffff.png?text=Leave'
      : 'https://placehold.co/150x150/f8f9fa/cccccc.png?text=No+Img';
    const imageUrl = photoUrl || defaultPlaceholder;

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
            // 1. หัวข้อ (Action Bar)
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: title, weight: 'bold', size: 'sm', color: color, flex: 0 },
                { type: 'text', text: position || 'Staff', size: 'xs', color: '#9ca3af', align: 'end', gravity: 'center' }
              ]
            },
            { type: 'separator', margin: 'md' },

            // 2. เนื้อหาหลัก (Layout แนวนอน: รูปซ้าย - ข้อความขวา)
            {
              type: 'box',
              layout: 'horizontal',
              margin: 'md',
              spacing: 'md',
              contents: [
                // 📸 2.1 รูปภาพ (Icon) - ซ่อนรูปภาพถ้าเป็นแจ้งขอลาหยุด
                ...(action === 'leave_request' ? [] : [{
                  type: 'image',
                  url: imageUrl,
                  size: 'lg', // ขนาดรูปประมาณ 100px
                  aspectRatio: '1:1', // จัตุรัส
                  aspectMode: 'cover',
                  borderRadius: 'md',
                  flex: 3,
                  // Action: กดรูปเพื่อดูภาพเต็ม (เฉพาะถ้ามีรูปจริง)
                  ...(photoUrl && { action: { type: 'uri', uri: photoUrl } })
                }]),

                // 📝 2.2 รายละเอียด (ขวามือ)
                {
                  type: 'box',
                  layout: 'vertical',
                  flex: 5,
                  contents: [
                    // ชื่อพนักงาน
                    { type: 'text', text: name, weight: 'bold', size: 'md', color: '#1f2937', wrap: true, margin: 'none' },

                    // รายละเอียดย่อย (เวลา, สถานะ, พิกัด)
                    {
                      type: 'box',
                      layout: 'vertical',
                      margin: 'sm',
                      spacing: 'xs',
                      contents: [
                        {
                          type: 'box', layout: 'baseline', spacing: 'sm',
                          contents: [
                            { type: 'text', text: labelTime, color: '#aaaaaa', size: 'xxs', flex: 2 },
                            { type: 'text', text: time, color: '#4b5563', size: 'xs', flex: 4, weight: 'bold' }
                          ]
                        },
                        {
                          type: 'box', layout: 'baseline', spacing: 'sm',
                          contents: [
                            { type: 'text', text: labelStatus, color: '#aaaaaa', size: 'xxs', flex: 2 },
                            { type: 'text', text: statusDetail || '-', color: statusTextColor, size: 'xs', flex: 4, wrap: true }
                          ]
                        },
                        {
                          type: 'box', layout: 'baseline', spacing: 'sm',
                          contents: [
                            { type: 'text', text: labelLocation, color: '#aaaaaa', size: 'xxs', flex: 2 },
                            { type: 'text', text: cleanLocation, color: '#9ca3af', size: 'xxs', flex: 4, wrap: true }
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

    // Push to all groups
    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Line Notify Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}