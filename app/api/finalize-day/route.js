import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient'; // ✅ เพิ่ม import supabase
import { Client } from '@line/bot-sdk';

const GROUP_ID = 'Cc2c65da5408563ef57ae61dee6ce3c1d';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const { name, position, action, time, locationStatus, statusDetail } = await request.json();

    // --- 1. ตรวจสอบสิทธิ์การแจ้งเตือน (Toggle Check) ---
    // เราจะเช็คว่า "ช่วงเวลานี้" ตรงกับกะไหน และกะนั้นเปิดแจ้งเตือนไว้ไหม
    
    // แปลงเวลาที่กด (HH:mm) เป็นนาที
    const [h, m] = time.split(':').map(Number);
    const actionMinutes = h * 60 + m;

    // ดึงข้อมูลกะงานทั้งหมด
    const { data: shifts } = await supabase.from('shifts').select('*');
    
    let shouldNotify = true; // ค่าเริ่มต้น: ส่งตลอด (ถ้าหากะไม่เจอ)

    if (shifts && shifts.length > 0) {
        // หากะที่เวลา "ใกล้เคียง" กับเวลากดที่สุด (± 2 ชม.)
        const matchedShift = shifts.find(s => {
            if (!s.start_time || !s.end_time) return false;
            
            const [sh, sm] = s.start_time.split(':').map(Number);
            const startMins = sh * 60 + sm;
            
            const [eh, em] = s.end_time.split(':').map(Number);
            const endMins = eh * 60 + em;

            // ถ้ากดเข้างาน: เช็คว่าใกล้เวลาเริ่มกะนี้ไหม
            if (action === 'check_in' && Math.abs(actionMinutes - startMins) <= 180) return true; // ±3 ชม.
            
            // ถ้ากดออกงาน: เช็คว่าใกล้เวลาเลิกกะนี้ไหม
            if (action === 'check_out' && Math.abs(actionMinutes - endMins) <= 180) return true;

            return false;
        });

        if (matchedShift) {
            // ถ้าเจอกะที่ตรงกัน -> เช็คสวิตช์เปิด-ปิดของกะนั้น
            if (action === 'check_in' && matchedShift.notify_in_enabled === false) shouldNotify = false;
            if (action === 'check_out' && matchedShift.notify_out_enabled === false) shouldNotify = false;
        }
    }

    if (!shouldNotify) {
        console.log(`🔕 Notification skipped (Disabled in settings)`);
        return NextResponse.json({ success: true, message: "Notification disabled" });
    }

    // --- 2. สร้างข้อความ (Classic Style - No Image) ---
    let title = "", color = "", labelTime = "เวลา:", labelStatus = "สถานะ:", labelLocation = "พิกัด:";

    if (action === 'check_in') {
        title = '🟢 ลงเวลาเข้างาน'; color = '#10b981';
    } else if (action === 'check_out') {
        title = '🔴 ลงเวลาออกงาน'; color = '#ef4444';
    } else if (action === 'leave_request') {
        title = '📝 แจ้งขอลาหยุด'; color = '#f59e0b';
        labelTime = "วันที่:"; labelStatus = "เหตุผล:"; labelLocation = "ประเภท:";
    }

    const isLateOrEarly = statusDetail?.includes('สาย') || statusDetail?.includes('ออกก่อน');
    const statusTextColor = isLateOrEarly ? '#f59e0b' : '#6b7280'; 
    const cleanLocation = locationStatus?.replace('✅ ', '').replace('❌ ', '') || '-';

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
            // หัวข้อ
            {
              type: 'box', layout: 'horizontal',
              contents: [
                { type: 'text', text: title, weight: 'bold', size: 'sm', color: color, flex: 0 },
                { type: 'text', text: position || 'Staff', size: 'xs', color: '#9ca3af', align: 'end', gravity: 'center' }
              ]
            },
            // ชื่อ
            { type: 'text', text: name, weight: 'bold', size: 'xl', margin: 'md', color: '#1f2937' },
            { type: 'separator', margin: 'md' },
            // รายละเอียด
            {
              type: 'box', layout: 'vertical', margin: 'md', spacing: 'sm',
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

    await client.pushMessage(GROUP_ID, [message]); 
    return NextResponse.json({ success: true });

  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}