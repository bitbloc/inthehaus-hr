import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@/utils/lineClient';
import { BRAND } from '@/utils/brand';
import { buildKpiReminderText } from '../../../../lib/kpi';

const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff'
];

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
});

export const dynamic = 'force-dynamic';

function buildFlexMessage(type = 'checklist') {
  // Brand v2: plum header, cream body, Thai-first type, no icons.
  let badgeText = 'รอบ 17:30';
  let titleText = 'เช็คลิสต์ร้านและส่งมอบกะ';
  let subtitleText = 'รอบตรวจสอบความเรียบร้อยช่วงบ่าย-เย็น ส่งมอบงานระหว่างกะ และเตรียมพร้อมรอบค่ำ';
  let altText = 'CHECKLIST PROTOCOL: บันทึกเช็คลิสต์และตรวจความเรียบร้อยร้าน';
  let taskItems = [
    'ตรวจเช็คความพร้อมสเตชั่น บาร์ และครัว',
    'ตรวจนับสต็อกวัตถุดิบและเบเกอรี่ช่วงบ่าย',
    'นับเงินสดในลิ้นชัก POS และส่งมอบกะ',
    'ปรับไฟ บรรยากาศร้าน และเตรียมรับรอบค่ำ'
  ];

  if (type === 'morning') {
    badgeText = 'เปิดร้าน 10:00';
    titleText = 'เตรียมเปิดร้านและตรวจสต็อก';
    subtitleText = 'บันทึกเวลาเข้างาน เช็คความพร้อมหน้าร้าน และตรวจสต็อกก่อนเปิดบริการ 11:00 น.';
    altText = 'OPENING PROTOCOL: ลงเวลาเข้างานและตรวจสต็อก';
    taskItems = [
      'ลงเวลาเข้างานและเตรียมพร้อมเปิดระบบ',
      'ตรวจเช็คสต็อกวัตถุดิบและเบเกอรี่หน้าร้าน',
      'ตรวจนับเงินทอนเปิดลิ้นชัก POS',
      'ทำความสะอาดและจัดเตรียมสเตชั่นพร้อมเปิด 11:00 น.'
    ];
  } else if (type === 'evening' || type === 'closing') {
    badgeText = 'ปิดร้าน 20:45';
    titleText = 'เตรียมปิดร้านและสรุปกะ';
    subtitleText = 'สิ้นสุดการรับออเดอร์ครัว 20:45 น. เคลียร์บิล สรุปยอดเงิน และตรวจปิดร้าน 21:30 น.';
    altText = 'CLOSING PROTOCOL: บันทึกเช็คลิสต์ปิดร้านและสรุปกะ';
    taskItems = [
      'เคลียร์บิลโต๊ะค้างและปิดกะ POS สิ้นวัน',
      'ตรวจนับสต็อกสินค้าและวัตถุดิบปิดร้าน',
      'ตรวจนับเงินสดและจัดเก็บส่งมอบกะ',
      'ทำความสะอาด ปิดไฟระบบ และตรวจตราความเรียบร้อย'
    ];
  }

  return {
    type: 'flex',
    altText: altText,
    contents: {
      type: 'bubble',
      size: 'mega',
      styles: {
        body: { backgroundColor: BRAND.cream },
        footer: { backgroundColor: BRAND.cream, separator: true, separatorColor: BRAND.rule }
      },
      header: {
        type: 'box',
        layout: 'vertical',
        backgroundColor: BRAND.plum,
        paddingAll: '20px',
        contents: [
          { type: 'text', text: titleText, size: 'xl', weight: 'bold', color: BRAND.cream, wrap: true },
          { type: 'text', text: `ภารกิจประจำวัน, ${badgeText}`, size: 'xs', color: BRAND.onPlum2, margin: 'sm', wrap: true }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          // Brief description
          {
            type: 'text',
            text: subtitleText,
            size: 'sm',
            color: BRAND.muted,
            wrap: true
          },
          // Store hours and cutoff (paper-2 panel)
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: BRAND.paper2,
            cornerRadius: 'sm',
            paddingAll: '12px',
            margin: 'lg',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เวลาเปิด-ปิดร้าน', size: 'xs', color: BRAND.neutral, flex: 5 },
                  { type: 'text', text: '11:00 - 21:30 น.', size: 'xs', weight: 'bold', color: BRAND.charcoal, align: 'end', flex: 5 }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'xs',
                contents: [
                  { type: 'text', text: 'ปิดรับออเดอร์ครัว', size: 'xs', color: BRAND.neutral, flex: 5 },
                  { type: 'text', text: '20:45 น. (Last order)', size: 'xs', weight: 'bold', color: BRAND.plum, align: 'end', flex: 5 }
                ]
              }
            ]
          },
          // Task list (typographic dash, no icons)
          {
            type: 'box',
            layout: 'vertical',
            margin: 'lg',
            spacing: 'xs',
            contents: taskItems.map((task) => ({
              type: 'box',
              layout: 'horizontal',
              spacing: 'sm',
              contents: [
                { type: 'text', text: '—', size: 'xs', color: BRAND.neutral, flex: 0 },
                { type: 'text', text: task, size: 'xs', color: BRAND.charcoal, flex: 1, wrap: true }
              ]
            }))
          }
        ]
      },
      footer: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'บันทึกเช็คลิสต์',
              uri: 'https://forms.gle/8agnXqC7ZSojmqra6'
            },
            style: 'primary',
            color: BRAND.charcoal,
            height: 'sm'
          },
          {
            type: 'box',
            layout: 'horizontal',
            spacing: 'sm',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: 'ตรวจสต็อก',
                  uri: 'https://haustable.vercel.app/staff/stock'
                },
                style: 'primary',
                color: BRAND.plum,
                height: 'sm',
                flex: 1
              },
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: 'ลงเวลาเข้า-ออก',
                  uri: 'https://inthehaus-hr.vercel.app/checkin'
                },
                style: 'primary',
                color: BRAND.plum,
                height: 'sm',
                flex: 1
              }
            ]
          }
        ]
      }
    }
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryType = searchParams.get('type');
    const isForce = searchParams.get('force') === 'true';

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    const currentTotalMinutes = thaiTime.getHours() * 60 + thaiTime.getMinutes();
    const hours = thaiTime.getHours();
    const minutes = thaiTime.getMinutes();
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;

    console.log(`🕒 Cron Check at: ${timeString} (${currentTotalMinutes}) | type: ${queryType}`);

    // If request specifies morning or evening without force, skip (consolidated to single round at 17:30)
    if ((queryType === 'morning' || queryType === 'evening' || queryType === 'closing') && !isForce) {
      console.log(`ℹ️ Push reminder '${queryType}' is disabled. System is consolidated to 1 round/day at 17:30.`);
      return NextResponse.json({
        success: true,
        message: `Push reminder '${queryType}' is disabled (consolidated to single daily round at 17:30).`,
        skipped: true
      });
    }

    // Determine targetType (Single daily round = 'checklist' at 17:30)
    let targetType = queryType || 'checklist';
    if (!queryType && !isForce) {
      // If called without type parameter, only proceed if within the 17:30 window (17:20 - 17:45)
      if (hours === 17 && minutes >= 20 && minutes <= 45) {
        targetType = 'checklist';
      } else {
        console.log(`ℹ️ No type specified and outside 17:30 window (${timeString}). Skipping.`);
        return NextResponse.json({
          success: true,
          message: `Outside 17:30 window (${timeString}), skipped.`,
          skipped: true
        });
      }
    }

    // A. Hostname filtering to prevent duplicate triggers from clone/staging Vercel projects
    const host = request.headers.get('host') || '';
    const isProductionHost = host === 'inthehaus-hr.vercel.app';
    const isLocalhost = host.includes('localhost') || host.includes('127.0.0.1');

    if (targetType && !isProductionHost && !isLocalhost && !isForce) {
      console.log(`⚠️ Blocked cron request for ${targetType} from non-production host: ${host}`);
      return NextResponse.json({ success: true, message: `Ignored request from host: ${host}` });
    }

    // B. Supabase lock to prevent duplicate sends on the same day (Strict single daily reminder)
    const todayStr = thaiTime.toISOString().split('T')[0]; // YYYY-MM-DD in Thai time
    const configKey = 'last_cron_daily_reminder';

    if (!isForce) {
      // Check both global lock and legacy checklist lock
      const { data: configRows } = await supabase
        .from('yuzu_config')
        .select('key, value')
        .in('key', [configKey, 'last_cron_checklist']);

      const alreadySent = configRows?.some((row) => row.value === todayStr);

      if (alreadySent) {
        console.log(`⚠️ Daily reminder already sent today (${todayStr}). Skipping.`);
        return NextResponse.json({ success: true, message: `Already sent today: ${todayStr}`, results: [] });
      }
    }

    const message = buildFlexMessage(targetType);
    // Monthly team survey: list who has not answered yet (none → nothing extra).
    const kpiText = await buildKpiReminderText(supabase);
    const messages = kpiText ? [message, { type: 'text', text: kpiText.slice(0, 4900) }] : [message];

    const results = await Promise.all(
      GROUP_IDS.map(async (groupId) => {
        try {
          await client.pushMessage(groupId, messages);
          return { groupId, success: true };
        } catch (e) {
          console.error(`Failed to push to group ${groupId}:`, e.message);
          return { groupId, success: false, error: e.message };
        }
      })
    );

    // Save last sent date to DB to prevent duplicate runs
    if (!isForce) {
      await supabase
        .from('yuzu_config')
        .upsert([
          { key: configKey, value: todayStr, updated_at: new Date().toISOString() },
          { key: 'last_cron_checklist', value: todayStr, updated_at: new Date().toISOString() }
        ], { onConflict: 'key' });
    }

    return NextResponse.json({ success: true, sent: targetType, time: timeString, results });
  } catch (error) {
    console.error('Auto Remind Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
