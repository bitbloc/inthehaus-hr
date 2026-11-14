import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff'
];

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
});

export const dynamic = 'force-dynamic';

function buildFlexMessage(type = 'checklist') {
  // Dieter Rams + Thai Modern Clean Aesthetic (Zero-Icon / Pure Typography)
  let badgeText = '17:30 ROUND';
  let badgeColor = '#C85A32';
  let titleText = 'เช็คลิสต์ร้าน & ส่งมอบกะ';
  let subtitleText = 'รอบตรวจสอบความเรียบร้อยช่วงบ่าย-เย็น ส่งมอบงานระหว่างกะ และเตรียมพร้อมรอบค่ำ';
  let altText = 'CHECKLIST PROTOCOL: บันทึกเช็คลิสต์และตรวจความเรียบร้อยร้าน';
  let taskItems = [
    'ตรวจเช็คความพร้อมสเตชั่น บาร์ และครัว',
    'ตรวจนับสต็อกวัตถุดิบ & เบเกอรี่ช่วงบ่าย',
    'นับเงินสดในลิ้นชัก POS & ส่งมอบกะ',
    'ปรับไฟ บรรยากาศร้าน และเตรียมรับรอบค่ำ'
  ];

  if (type === 'morning') {
    badgeText = '10:00 OPENING';
    badgeColor = '#C85A32';
    titleText = 'เตรียมเปิดร้าน & ตรวจสต็อก';
    subtitleText = 'บันทึกเวลาเข้างาน เช็คความพร้อมหน้าร้าน และตรวจสต็อกก่อนเปิดบริการ 11:00 น.';
    altText = 'OPENING PROTOCOL: ลงเวลาเข้างานและตรวจสต็อก';
    taskItems = [
      'ลงเวลาเข้างานและเตรียมพร้อมเปิดระบบ',
      'ตรวจเช็คสต็อกวัตถุดิบและเบเกอรี่หน้าร้าน',
      'ตรวจนับเงินทอนเปิดลิ้นชัก POS',
      'ทำความสะอาดและจัดเตรียมสเตชั่นพร้อมเปิด 11:00 น.'
    ];
  } else if (type === 'evening' || type === 'closing') {
    badgeText = '20:45 CLOSING';
    badgeColor = '#C85A32';
    titleText = 'เตรียมปิดร้าน & สรุปกะ';
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
        body: { backgroundColor: '#FBF9F5' },
        footer: { backgroundColor: '#FBF9F5', separator: true, separatorColor: '#E6E1D6' }
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '20px',
        contents: [
          // Header / Eyebrow (Dieter Rams functional grotesque)
          {
            type: 'box',
            layout: 'horizontal',
            alignItems: 'center',
            contents: [
              {
                type: 'text',
                text: 'DAILY MISSION // PROTOCOL',
                size: 'xxs',
                color: '#78736A',
                weight: 'bold',
                flex: 1
              },
              {
                type: 'box',
                layout: 'horizontal',
                backgroundColor: '#F4F1EA',
                cornerRadius: 'xs',
                paddingStart: 'sm',
                paddingEnd: 'sm',
                paddingTop: 'xs',
                paddingBottom: 'xs',
                contents: [
                  {
                    type: 'text',
                    text: badgeText,
                    size: 'xxs',
                    weight: 'bold',
                    color: badgeColor
                  }
                ]
              }
            ]
          },
          // Main Title
          {
            type: 'text',
            text: titleText,
            size: 'xl',
            weight: 'bold',
            color: '#1E1B18',
            margin: 'md'
          },
          // Brief Description
          {
            type: 'text',
            text: subtitleText,
            size: 'xs',
            color: '#78736A',
            wrap: true,
            margin: 'xs'
          },
          // Divider
          {
            type: 'separator',
            color: '#E6E1D6',
            margin: 'md'
          },
          // Store Hours & Cutoff (Thai Modern Paper-2 Container)
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F4F1EA',
            cornerRadius: 'sm',
            paddingAll: '12px',
            margin: 'md',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เวลาเปิด-ปิดร้าน', size: 'xs', color: '#78736A', flex: 5 },
                  { type: 'text', text: '11:00 - 21:30 น.', size: 'xs', weight: 'bold', color: '#1E1B18', align: 'end', flex: 5 }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'xs',
                contents: [
                  { type: 'text', text: 'ปิดรับออเดอร์ครัว', size: 'xs', color: '#78736A', flex: 5 },
                  { type: 'text', text: '20:45 น. (Last Order)', size: 'xs', weight: 'bold', color: '#C85A32', align: 'end', flex: 5 }
                ]
              }
            ]
          },
          // Protocol Task List (Clean typographic dash - Zero-Icon)
          {
            type: 'box',
            layout: 'vertical',
            margin: 'md',
            spacing: 'xs',
            contents: taskItems.map((task) => ({
              type: 'box',
              layout: 'horizontal',
              spacing: 'sm',
              contents: [
                { type: 'text', text: '—', size: 'xs', color: '#78736A', flex: 0 },
                { type: 'text', text: task, size: 'xs', color: '#1E1B18', flex: 1, wrap: true }
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
          // Primary Action Button (Pure Typography - No Icon)
          {
            type: 'button',
            action: {
              type: 'uri',
              label: 'บันทึกแบบฟอร์ม CHECKLIST',
              uri: 'https://forms.gle/8agnXqC7ZSojmqra6'
            },
            style: 'primary',
            color: '#1E1B18',
            height: 'sm'
          },
          // Secondary Action Pair (Pure Typography - No Icon)
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
                style: 'secondary',
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
                style: 'secondary',
                height: 'sm',
                flex: 1
              }
            ]
          },
          // Micro Brand Attribution
          {
            type: 'text',
            text: 'ONHAUS SYSTEM // DIETER RAMS PROTOCOL',
            size: 'xxs',
            color: '#A09B90',
            weight: 'bold',
            align: 'center',
            margin: 'sm'
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

    const results = await Promise.all(
      GROUP_IDS.map(async (groupId) => {
        try {
          await client.pushMessage(groupId, [message]);
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
