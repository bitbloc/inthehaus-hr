import { NextResponse } from 'next/server';
import { addStockTransaction } from '../../../../utils/stock_api';
import { Client } from '@line/bot-sdk';

const client = new Client({
  channelAccessToken: process.env.CHANNEL_ACCESS_TOKEN,
  channelSecret: process.env.CHANNEL_SECRET,
});

export async function POST(request) {
  try {
    const { counts, employeeName } = await request.json();
    
    let reportMsg = `📋 [ระบบอัตโนมัติ] สรุปผลการตรวจนับสต็อก\n🙋 ผู้ตรวจ: ${employeeName || 'ไม่ระบุ'}\n⏰ เวลา: ${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}\n\n`;
    
    let changesFound = false;

    // We can run these sequentially to avoid hammering Supabase or DB locks.
    for (const item of counts) {
      if (item.actual === undefined || item.actual === null || item.actual === '') continue;
      
      const expected = parseFloat(item.expected) || 0;
      const actual = parseFloat(item.actual);
      const diff = actual - expected;
      
      if (Math.abs(diff) > 0.001) {
        changesFound = true;
        const type = diff > 0 ? 'in' : 'out';
        const absDiff = Math.abs(diff);
        const signStr = diff > 0 ? '🔺 ได้เพิ่มมา' : '🔻 ขาดหายไป';
        
        await addStockTransaction(item.id, type, absDiff, employeeName, `อัปเดตจากการประเมิน Stock Audit ผ่าน LIFF`);
        reportMsg += `${signStr} ${item.name}: ${absDiff} (ยอดแก้ให้เหลือ ${actual})\n`;
      }
    }

    if (!changesFound) {
      reportMsg += `✅ ตรวจสอบแล้วยอดสต็อกเป๊ะ 100% ไม่มีส่วนต่างเลย เก่งมาก เมี๊ยว~\n`;
    } else {
      reportMsg += `\n"จัดการอัปเดตลงระบบเรียบร้อยค่ะ! บอสดูยอดใหม่ได้เลย เมี๊ยว~" - Yuzu`;
    }

    // Push message to the original group (can be parameterized later if multiple groups but for now this is standard)
    const groupId = 'C1210c7a0601b5a675060e312efe10bff'; 
    await client.pushMessage(groupId, { type: 'text', text: reportMsg });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    console.error("Audit Submission Error:", err);
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
