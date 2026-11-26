import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../lib/supabaseServer';
import { supabase } from '../../../lib/supabaseClient';
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
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const { data: logs, error } = await supabase
      .from('attendance_logs')
      .select('*, employees(name, shifts(name, start_time))')
      .gte('timestamp', today.toISOString())
      .lt('timestamp', tomorrow.toISOString());

    if (error) throw error;

    const total = logs.length;
    let lateCount = 0;
    let names = [];

    logs.forEach(log => {
      const logDate = new Date(log.timestamp);
      const shiftStart = log.employees?.shifts?.start_time || "08:00";
      const shiftName = log.employees?.shifts?.name || "";

      const [sHour, sMin] = shiftStart.split(':').map(Number);
      const shiftLimitMinutes = sHour * 60 + sMin;
      const actualMinutes = logDate.getHours() * 60 + logDate.getMinutes();
      const timeString = `${String(logDate.getHours()).padStart(2, '0')}:${String(logDate.getMinutes()).padStart(2, '0')}`;

      if (actualMinutes > shiftLimitMinutes) {
        lateCount++;
        names.push({ text: `${log.employees?.name || '-'} (สาย ${timeString})`, sub: `กะ ${shiftName || '-'}`, late: true });
      } else {
        names.push({ text: `${log.employees?.name || '-'} (ตรงเวลา ${timeString})`, sub: `กะ ${shiftName || '-'}`, late: false });
      }
    });

    const message = {
      type: 'flex',
      altText: `สรุปการลงเวลาประจำวันที่ ${new Date().toLocaleDateString('th-TH')}`,
      contents: {
        type: 'bubble',
        header: {
          type: 'box', layout: 'vertical', backgroundColor: BRAND.plum, paddingAll: '20px',
          contents: [
            { type: 'text', text: 'สรุปการลงเวลาประจำวัน', weight: 'bold', size: 'lg', color: BRAND.cream, wrap: true },
            { type: 'text', text: `วันที่ ${new Date().toLocaleDateString('th-TH')}`, size: 'xs', color: BRAND.onPlum2, margin: 'xs' }
          ]
        },
        body: {
          type: 'box', layout: 'vertical', backgroundColor: BRAND.cream, paddingAll: '20px',
          contents: [
            { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: 'มาทำงาน', size: 'sm', color: BRAND.neutral, flex: 1 }, { type: 'text', text: `${total} คน`, size: 'sm', weight: 'bold', color: BRAND.charcoal, align: 'end', flex: 1 }] },
            { type: 'box', layout: 'horizontal', contents: [{ type: 'text', text: 'มาสาย', size: 'sm', color: lateCount > 0 ? BRAND.errorRed : BRAND.neutral, flex: 1 }, { type: 'text', text: `${lateCount} คน`, size: 'sm', weight: 'bold', color: lateCount > 0 ? BRAND.errorRed : BRAND.charcoal, align: 'end', flex: 1 }], margin: 'md' },
            { type: 'separator', margin: 'lg', color: BRAND.rule },
            { type: 'text', text: 'รายชื่อ', margin: 'lg', weight: 'bold', size: 'sm', color: BRAND.charcoal },
            ...names.map(item => ({
              type: 'box', layout: 'vertical', margin: 'sm',
              contents: [
                { type: 'text', text: item.text, size: 'xs', color: item.late ? BRAND.errorRed : BRAND.charcoal, weight: item.late ? 'bold' : 'regular', wrap: true },
                { type: 'text', text: item.sub, size: 'xxs', color: BRAND.neutral, margin: 'xs' }
              ]
            }))
          ]
        }
      }
    };

    if (total > 0) {
      // ✅ เปลี่ยนจาก broadcast เป็น pushMessage ระบุกลุ่ม
      await Promise.all(
        GROUP_IDS.map(groupId => client.pushMessage(groupId, [message]))
      );
      return NextResponse.json({ success: true, message: "Report sent" });
    } else {
      return NextResponse.json({ success: true, message: "No data" });
    }

  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}