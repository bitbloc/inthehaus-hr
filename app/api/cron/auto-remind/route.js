import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { Client } from '@line/bot-sdk';

// ✅ Group IDs (กลุ่มหลัก และ กลุ่มแผนกอื่น)
const GROUP_IDS = [
  'C1210c7a0601b5a675060e312efe10bff',
  'C71db3c7339b11f43dc8f1ec34bf46f43'
];
const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET
});
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const queryType = searchParams.get('type');

    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const thaiTime = new Date(utc + (3600000 * 7));
    const currentTotalMinutes = thaiTime.getHours() * 60 + thaiTime.getMinutes();
    const hours = thaiTime.getHours();
    const minutes = thaiTime.getMinutes();
    const timeString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
    
    console.log(`🕒 Cron Check at: ${timeString} (${currentTotalMinutes}) | type: ${queryType}`);

    let targetType = queryType;
    if (!targetType) {
      // Auto-detect based on Thai timezone (ICT)
      // Check for morning reminder (10:00 AM)
      if (hours === 10 && minutes >= 0 && minutes <= 9) {
        targetType = 'morning';
      }
      // Check for evening reminder (23:00 PM / 11:00 PM)
      else if (hours === 23 && minutes >= 0 && minutes <= 9) {
        targetType = 'evening';
      }
    }

    // 1. Morning Reminder // Dieter Rams Design Aesthetic
    if (targetType === 'morning') {
      const message = {
        type: 'flex',
        altText: '☀️ DAILY MISSION: อย่าลืม CHECK-IN & STOCK',
        contents: {
          type: 'bubble',
          size: 'mega',
          styles: {
            body: { backgroundColor: '#F4F4F4' },
            footer: { backgroundColor: '#F4F4F4', separator: true, separatorColor: '#EAEAEA' }
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: 'xl',
            spacing: 'lg',
            contents: [
              {
                type: 'text',
                text: 'DAILY MISSION // PROTOCOL',
                size: 'xxs',
                color: '#8C8C8C',
                weight: 'bold'
              },
              {
                type: 'text',
                text: 'อรุณสวัสดิ์ทีมงาน! ☀️',
                size: 'xxl',
                weight: 'bold',
                color: '#1C1C1C'
              },
              {
                type: 'text',
                text: 'ได้เวลาเปิดร้านแล้ว โปรดบันทึกเวลาเข้างาน เช็คสต๊อกประจำวัน และทำเช็คลิสต์กะเปิดร้านให้เรียบร้อยครับ',
                size: 'sm',
                color: '#5A5A5A',
                wrap: true
              },
              {
                type: 'separator',
                color: '#E5E5E5'
              },
              {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'horizontal',
                    spacing: 'md',
                    contents: [
                      {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: '#D05D00', // Braun Amber Accent
                        width: '4px',
                        cornerRadius: 'xs'
                      },
                      {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'xxs',
                        contents: [
                          {
                            type: 'text',
                            text: 'กะเปิดร้าน // 10:00',
                            size: 'xxs',
                            color: '#8C8C8C',
                            weight: 'bold'
                          },
                          {
                            type: 'text',
                            text: 'Check-in เข้างาน และ เช็คสต๊อก',
                            size: 'sm',
                            weight: 'bold',
                            color: '#1C1C1C'
                          },
                          {
                            type: 'text',
                            text: 'เตรียมความเรียบร้อยหน้าร้าน, อุปกรณ์, และเปิดระบบ',
                            size: 'xs',
                            color: '#7A7A7A',
                            wrap: true
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: 'lg',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '🟢 บันทึกเวลาเข้างาน (CHECK IN)',
                  uri: 'https://inthehaus-hr.vercel.app/checkin'
                },
                style: 'primary',
                color: '#1C1C1C',
                height: 'sm'
              },
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '📦 เช็คสต๊อก (CHECK STOCK)',
                  uri: 'https://haustable.vercel.app/staff/stock'
                },
                style: 'primary',
                color: '#7C7C7C',
                height: 'sm'
              },
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '📋 เปิดฟอร์ม CHECKLIST',
                  uri: 'https://forms.gle/8agnXqC7ZSojmqra6'
                },
                style: 'primary',
                color: '#7C7C7C',
                height: 'sm'
              },
              {
                type: 'text',
                text: 'ITH-HR // MISSION CONTROL // AB1',
                size: 'xxs',
                color: '#A5A5A5',
                weight: 'bold',
                align: 'center',
                margin: 'md'
              }
            ]
          }
        }
      };

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
      return NextResponse.json({ success: true, sent: 'morning', time: timeString, results });
    }

    // 2. Evening Reminder // Dieter Rams Design Aesthetic
    if (targetType === 'evening') {
      const message = {
        type: 'flex',
        altText: '🌙 DAILY MISSION: อย่าลืม CHECK-OUT & STOCK',
        contents: {
          type: 'bubble',
          size: 'mega',
          styles: {
            body: { backgroundColor: '#F4F4F4' },
            footer: { backgroundColor: '#F4F4F4', separator: true, separatorColor: '#EAEAEA' }
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: 'xl',
            spacing: 'lg',
            contents: [
              {
                type: 'text',
                text: 'DAILY MISSION // PROTOCOL',
                size: 'xxs',
                color: '#8C8C8C',
                weight: 'bold'
              },
              {
                type: 'text',
                text: 'เตรียมปิดระบบร้าน! 🌙',
                size: 'xxl',
                weight: 'bold',
                color: '#1C1C1C'
              },
              {
                type: 'text',
                text: 'ได้เวลาปิดกะร้านแล้ว โปรดบันทึกเวลาออกงาน เช็คสต๊อก และทำเช็คลิสต์กะปิดร้านให้เรียบร้อยครับ',
                size: 'sm',
                color: '#5A5A5A',
                wrap: true
              },
              {
                type: 'separator',
                color: '#E5E5E5'
              },
              {
                type: 'box',
                layout: 'vertical',
                spacing: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'horizontal',
                    spacing: 'md',
                    contents: [
                      {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: '#1C1C1C', // Braun Charcoal
                        width: '4px',
                        cornerRadius: 'xs'
                      },
                      {
                        type: 'box',
                        layout: 'vertical',
                        spacing: 'xxs',
                        contents: [
                          {
                            type: 'text',
                            text: 'กะปิดร้าน // 23:00',
                            size: 'xxs',
                            color: '#8C8C8C',
                            weight: 'bold'
                          },
                          {
                            type: 'text',
                            text: 'Check-out ออกงาน และ เช็คสต๊อก',
                            size: 'sm',
                            weight: 'bold',
                            color: '#1C1C1C'
                          },
                          {
                            type: 'text',
                            text: 'สรุปยอดเงินและปิดระบบไฟ, ตรวจสอบความเรียบร้อยรอบร้าน',
                            size: 'xs',
                            color: '#7A7A7A',
                            wrap: true
                          }
                        ]
                      }
                    ]
                  }
                ]
              }
            ]
          },
          footer: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            paddingAll: 'lg',
            contents: [
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '🔴 บันทึกเวลาออกงาน (CHECK OUT)',
                  uri: 'https://inthehaus-hr.vercel.app/checkin'
                },
                style: 'primary',
                color: '#1C1C1C',
                height: 'sm'
              },
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '📦 เช็คสต๊อก (CHECK STOCK)',
                  uri: 'https://haustable.vercel.app/staff/stock'
                },
                style: 'primary',
                color: '#7C7C7C',
                height: 'sm'
              },
              {
                type: 'button',
                action: {
                  type: 'uri',
                  label: '📋 เปิดฟอร์ม CHECKLIST',
                  uri: 'https://forms.gle/8agnXqC7ZSojmqra6'
                },
                style: 'primary',
                color: '#7C7C7C',
                height: 'sm'
              },
              {
                type: 'text',
                text: 'ITH-HR // MISSION CONTROL // AB1',
                size: 'xxs',
                color: '#A5A5A5',
                weight: 'bold',
                align: 'center',
                margin: 'md'
              }
            ]
          }
        }
      };

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
      return NextResponse.json({ success: true, sent: 'evening', time: timeString, results });
    }

    // 3. Fallback to original shift database logic
    const { data: shifts } = await supabase.from('shifts').select('*');
    if (!shifts) return NextResponse.json({ message: "No shifts" });

    const liffUrl = "https://liff.line.me/2008567449-W868y8RY";
    let messages = [];
    let debugLog = [];

    for (const shift of shifts) {
      let diffIn = 9999, diffOut = 9999;

      if (shift.notify_in_enabled && shift.notify_time_in) {
        const [h, m] = shift.notify_time_in.split(':').map(Number);
        diffIn = Math.abs(currentTotalMinutes - (h * 60 + m));
      }

      if (shift.notify_out_enabled && shift.notify_time_out) {
        const [h, m] = shift.notify_time_out.split(':').map(Number);
        diffOut = Math.abs(currentTotalMinutes - (h * 60 + m));
      }

      debugLog.push(`${shift.name}: In-Diff=${diffIn}, Out-Diff=${diffOut}`);

      // Alert In (±5 mins)
      if (diffIn <= 5) {
        messages.push({
          type: 'flex',
          altText: `⏰ อย่าลืม check-in กะ ${shift.name}`,
          contents: {
            type: 'bubble',
            size: 'mega',
            styles: {
              body: { backgroundColor: '#F5F5F3' },
              footer: { backgroundColor: '#F5F5F3' }
            },
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '20px',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'ONHAUS SYSTEM', weight: 'bold', size: 'xxs', color: '#7C7C7C' },
                    { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: '#E05A36' }
                  ]
                },
                { type: 'separator', color: '#1A1A1A', margin: 'md' },
                {
                  type: 'text',
                  text: '⏰ อย่าลืม CHECK-IN',
                  weight: 'bold',
                  size: 'xl',
                  color: '#1A1A1A',
                  margin: 'lg'
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'lg',
                  spacing: 'xs',
                  contents: [
                    {
                      type: 'box',
                      layout: 'horizontal',
                      contents: [
                        { type: 'text', text: 'SHIFT', size: 'xs', color: '#7C7C7C', flex: 1 },
                        { type: 'text', text: (shift.name || '').toUpperCase(), size: 'xs', weight: 'bold', color: '#1A1A1A', flex: 2 }
                      ]
                    },
                    {
                      type: 'box',
                      layout: 'horizontal',
                      contents: [
                        { type: 'text', text: 'START TIME', size: 'xs', color: '#7C7C7C', flex: 1 },
                        { type: 'text', text: `${shift.start_time || '-'} น.`, size: 'xs', weight: 'bold', color: '#1A1A1A', flex: 2 }
                      ]
                    }
                  ]
                },
                { type: 'separator', color: '#CCCCCC', margin: 'md' }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              paddingStart: '20px',
              paddingEnd: '20px',
              paddingBottom: '15px',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#1A1A1A',
                  height: 'sm',
                  action: { type: 'uri', label: '🟢 กดเข้างาน (CHECK IN)', uri: liffUrl }
                },
                {
                  type: 'text',
                  text: 'ONHAUS SYSTEM ©',
                  size: 'xxs',
                  color: '#7C7C7C',
                  align: 'center',
                  weight: 'bold',
                  margin: 'md'
                }
              ]
            }
          }
        });
      }

      // Alert Out (±5 mins)
      if (diffOut <= 5) {
        messages.push({
          type: 'flex',
          altText: `🌙 อย่าลืม check-out & check stock กะ ${shift.name}`,
          contents: {
            type: 'bubble',
            size: 'mega',
            styles: {
              body: { backgroundColor: '#F5F5F3' },
              footer: { backgroundColor: '#F5F5F3' }
            },
            body: {
              type: 'box',
              layout: 'vertical',
              paddingAll: '20px',
              contents: [
                {
                  type: 'box',
                  layout: 'horizontal',
                  contents: [
                    { type: 'text', text: 'ONHAUS SYSTEM', weight: 'bold', size: 'xxs', color: '#7C7C7C' },
                    { type: 'box', layout: 'vertical', width: '8px', height: '8px', cornerRadius: '4px', backgroundColor: '#E05A36' }
                  ]
                },
                { type: 'separator', color: '#1A1A1A', margin: 'md' },
                {
                  type: 'text',
                  text: '🌙 อย่าลืม CHECK-OUT & STOCK',
                  weight: 'bold',
                  size: 'lg',
                  color: '#1A1A1A',
                  margin: 'lg'
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'lg',
                  spacing: 'xs',
                  contents: [
                    {
                      type: 'box',
                      layout: 'horizontal',
                      contents: [
                        { type: 'text', text: 'SHIFT', size: 'xs', color: '#7C7C7C', flex: 1 },
                        { type: 'text', text: (shift.name || '').toUpperCase(), size: 'xs', weight: 'bold', color: '#1A1A1A', flex: 2 }
                      ]
                    },
                    {
                      type: 'box',
                      layout: 'horizontal',
                      contents: [
                        { type: 'text', text: 'END TIME', size: 'xs', color: '#7C7C7C', flex: 1 },
                        { type: 'text', text: `${shift.end_time || '-'} น.`, size: 'xs', weight: 'bold', color: '#1A1A1A', flex: 2 }
                      ]
                    }
                  ]
                },
                { type: 'separator', color: '#CCCCCC', margin: 'md' }
              ]
            },
            footer: {
              type: 'box',
              layout: 'vertical',
              spacing: 'sm',
              paddingStart: '20px',
              paddingEnd: '20px',
              paddingBottom: '15px',
              contents: [
                {
                  type: 'button',
                  style: 'primary',
                  color: '#ff334b',
                  height: 'sm',
                  action: { type: 'uri', label: '🔴 กดออกงาน (CHECK OUT)', uri: liffUrl }
                },
                {
                  type: 'button',
                  style: 'primary',
                  color: '#7C7C7C',
                  height: 'sm',
                  action: { type: 'uri', label: '📦 เช็คสต๊อก (CHECK STOCK)', uri: 'https://haustable.vercel.app/staff/stock' }
                },
                {
                  type: 'text',
                  text: 'ONHAUS SYSTEM ©',
                  size: 'xxs',
                  color: '#7C7C7C',
                  align: 'center',
                  weight: 'bold',
                  margin: 'md'
                }
              ]
            }
          }
        });
      }
    }

    if (messages.length > 0) {
      try {
        await Promise.all(
          GROUP_IDS.map(groupId => client.pushMessage(groupId, messages.slice(0, 5)))
        );
        return NextResponse.json({ success: true, count: messages.length, debug: debugLog });
      } catch (e) {
        return NextResponse.json({ success: false, warning: "LINE Fail", details: e.message, debug: debugLog }, { status: 200 });
      }
    }
    return NextResponse.json({ success: true, message: "No match", debug: debugLog });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}