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
    const { name, position, action, time, locationStatus, statusDetail, photoUrl, leaveId } = await request.json();

    // --- กำหนดค่าตามประเภท Action ---
    let title = "";
    let labelTime = "เวลา:";
    let labelStatus = "สถานะ:";
    let labelLocation = "พิกัด:";

    if (action === 'check_in') {
      title = 'ลงเวลาเข้างาน';
    } else if (action === 'check_out') {
      title = 'ลงเวลาออกงาน';
    } else if (action === 'leave_request') {
      title = 'แจ้งขอลาหยุด';
      labelTime = "วันที่:";
      labelStatus = "คนแทน:";
      labelLocation = "ประเภท:";
    }

    const isLateOrEarly = statusDetail?.includes('สาย') || statusDetail?.includes('ออกก่อน');
    const statusTextColor = isLateOrEarly ? BRAND.errorRed : BRAND.charcoal; // late / left early is a real problem

    // Clean ข้อความพิกัด
    const cleanLocation = locationStatus?.replace('✅ ', '').replace('❌ ', '') || '-';

    // ✅ เตรียมส่วนแสดงรูปภาพ (Image Component)
    // ใช้รูป Placeholder พื้นหลังสีสว่าง ถ้าไม่มีรูปจริง เพื่อไม่ให้ Layout พัง
    const defaultPlaceholder = action === 'leave_request'
      ? 'https://placehold.co/150x150/E3D9DE/635B5F.png?text=Leave'
      : 'https://placehold.co/150x150/E3D9DE/635B5F.png?text=No+Img';
    const imageUrl = photoUrl || defaultPlaceholder;

    const message = {
      type: 'flex',
      altText: `${name} ${title}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: BRAND.plum,
          paddingAll: '16px',
          contents: [
            { type: 'text', text: title || 'แจ้งเตือน', weight: 'bold', size: 'md', color: BRAND.cream, wrap: true },
            { type: 'text', text: position || 'พนักงาน', size: 'xs', color: BRAND.onPlum2, margin: 'xs', wrap: true }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: BRAND.cream,
          contents: [

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
                    { type: 'text', text: name || '-', weight: 'bold', size: 'md', color: BRAND.charcoal, wrap: true, margin: 'none' },

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
                            { type: 'text', text: labelTime, color: BRAND.neutral, size: 'xs', flex: 2 },
                            { type: 'text', text: time || '-', color: BRAND.charcoal, size: 'xs', flex: 4, weight: 'bold' }
                          ]
                        },
                        {
                          type: 'box', layout: 'baseline', spacing: 'sm',
                          contents: [
                            { type: 'text', text: labelStatus, color: BRAND.neutral, size: 'xs', flex: 2 },
                            { type: 'text', text: statusDetail || '-', color: statusTextColor, size: 'xs', flex: 4, wrap: true }
                          ]
                        },
                        {
                          type: 'box', layout: 'baseline', spacing: 'sm',
                          contents: [
                            { type: 'text', text: labelLocation, color: BRAND.neutral, size: 'xs', flex: 2 },
                            { type: 'text', text: cleanLocation, color: BRAND.muted, size: 'xs', flex: 4, wrap: true }
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
        styles: { footer: { separator: true, separatorColor: BRAND.rule } }
      }
    };

    if (action === 'leave_request' && leaveId) {
      message.contents.footer = {
        type: 'box',
        layout: 'horizontal',
        spacing: 'sm',
        backgroundColor: BRAND.cream,
        contents: [
          {
            type: 'button',
            style: 'primary',
            color: BRAND.charcoal,
            action: {
              type: 'postback',
              label: 'อนุมัติ',
              data: `action=approve_leave&id=${leaveId}`
            }
          },
          {
            type: 'button',
            style: 'secondary',
            color: BRAND.paper2,
            action: {
              type: 'postback',
              label: 'ไม่อนุมัติ',
              data: `action=reject_leave&id=${leaveId}`
            }
          }
        ]
      };
    }

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