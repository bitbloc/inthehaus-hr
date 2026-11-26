import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/supabaseServer';
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
  // Admin-only route: verify the Supabase Auth session sent by adminFetch().
  const auth = await requireAdmin(request);
  if (auth.response) return auth.response;
  try {
    // รับข้อมูลจากหน้า Admin
    // The leave reason is not read: this card goes to the staff groups, and the reason stays in the DB.
    const { name, date, type, status, replacementName } = await request.json();

    const isApproved = status === 'approved';
    // Approved: plum header. Rejected: error red header (a real rejection).
    const headerBg = isApproved ? BRAND.plum : BRAND.errorRed;
    const title = isApproved ? 'อนุมัติการลาแล้ว' : 'ไม่อนุมัติการลา';
    const typeText = type === 'sick' ? 'ลาป่วย' : type === 'business' ? 'ลากิจ' : 'พักร้อน';

    const message = {
      type: 'flex',
      altText: `ผลการขอลา: ${status === 'approved' ? 'อนุมัติ' : 'ไม่อนุมัติ'}`,
      contents: {
        type: 'bubble',
        size: 'kilo',
        header: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: headerBg,
          paddingAll: '16px',
          contents: [
            { type: 'text', text: title, weight: 'bold', size: 'md', color: BRAND.cream, wrap: true }
          ]
        },
        body: {
          type: 'box',
          layout: 'vertical',
          backgroundColor: BRAND.cream,
          spacing: 'sm',
          contents: [
                { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'ชื่อ', color: BRAND.neutral, size: 'sm', flex: 2 }, { type: 'text', text: name || '-', color: BRAND.charcoal, size: 'sm', flex: 4, wrap: true, weight: 'bold' } ] },
                { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'วันที่', color: BRAND.neutral, size: 'sm', flex: 2 }, { type: 'text', text: date || '-', color: BRAND.charcoal, size: 'sm', flex: 4, wrap: true } ] },
                { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'ประเภท', color: BRAND.neutral, size: 'sm', flex: 2 }, { type: 'text', text: typeText, color: BRAND.charcoal, size: 'sm', flex: 4, wrap: true } ] },
                { type: 'box', layout: 'horizontal', contents: [ { type: 'text', text: 'คนแทน', color: BRAND.neutral, size: 'sm', flex: 2 }, { type: 'text', text: replacementName || '-', color: BRAND.charcoal, size: 'sm', flex: 4, wrap: true } ] }
          ]
        }
      }
    };

    // ส่งเข้าทุกกลุ่ม
    await Promise.all(
      GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
    );

    return NextResponse.json({ success: true });

  } catch (error) {
    console.error("Notify Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}