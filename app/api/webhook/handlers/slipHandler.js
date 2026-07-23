import { supabase } from '../../../../lib/supabaseClient';

export async function handleSlipImage(event, client, buffer, userId, groupId, result) {
  if (!result.isSlip) return false;

  let mappedDbUserId = userId;
  let senderName = "บุคคลภายนอก (ไม่มีในระบบ)";
  let isAuthorized = false;

  // Direct query to ensure fresh database check
  const { data: emp } = await supabase
     .from('employees')
     .select('line_user_id, line_bot_id, name, nickname, position')
     .eq('is_active', true)
     .or(`line_bot_id.eq.${userId},line_user_id.eq.${userId}`)
     .maybeSingle();

  if (emp) {
     if (emp.line_user_id) {
       mappedDbUserId = emp.line_user_id;
     }
     if (emp.nickname || emp.name) {
       senderName = emp.nickname || emp.name;
     }
     const position = emp.position ? emp.position.toLowerCase().replace(/\s/g, '') : '';
     if (position.includes('bar&floor') || position.includes('owner') || position.includes('ceo') || position.includes('manager')) {
        isAuthorized = true;
     }
  }

  if (!isAuthorized) {
     await client.replyMessage(event.replyToken, { type: 'text', text: `คุณ ${senderName} ไม่มีสิทธิ์ในการบันทึกสลิปเข้าระบบครับ (จำกัดสิทธิ์เฉพาะตำแหน่ง Bar&Floor และ Owner เท่านั้น)\n[UID: ${userId}]` });
     return true;
  }

  // Parse amount safely
  let parsedAmount = 0;
  if (typeof result.amount === 'number') {
    parsedAmount = result.amount;
  } else if (typeof result.amount === 'string') {
    parsedAmount = parseFloat(result.amount.replace(/,/g, ''));
  }

  // --- Duplicate Slip Detection (ระบบป้องกันสลิปซ้ำ) ---
  if (result.transactionRef) {
    const { data: existingSlip } = await supabase
      .from('slip_transactions')
      .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
      .eq('transaction_ref', result.transactionRef)
      .eq('is_deleted', false)
      .maybeSingle();

    if (existingSlip) {
      console.log(`[Slip Duplicate Prevention] Found existing slip ref: ${result.transactionRef}`);

      let originalOperator = existingSlip.sender_name || "พนักงานในระบบ";
      if (existingSlip.user_id) {
        const { data: origEmp } = await supabase
          .from('employees')
          .select('nickname, name')
          .eq('line_user_id', existingSlip.user_id)
          .maybeSingle();
        if (origEmp) {
          originalOperator = origEmp.nickname || origEmp.name;
        }
      }

      const origTime = existingSlip.timestamp 
        ? new Date(existingSlip.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
        : existingSlip.date;

      const duplicateFlexMsg = {
        type: 'flex',
        altText: `⚠️ แจ้งเตือนสลิปซ้ำ: ${result.transactionRef}`,
        contents: {
          type: 'bubble',
          size: 'mega',
          styles: {
            header: { backgroundColor: '#fee2e2' },
            body: { backgroundColor: '#ffffff' }
          },
          header: {
            type: 'box',
            layout: 'vertical',
            contents: [
              {
                type: 'text',
                text: '⚠️ DUPLICATE TRANSACTION DETECTED',
                color: '#dc2626',
                weight: 'bold',
                size: 'xs'
              },
              {
                type: 'text',
                text: 'ปฏิเสธการบันทึกสลิปซ้ำซ้อน',
                color: '#991b1b',
                weight: 'bold',
                size: 'md',
                margin: 'xs'
              }
            ]
          },
          body: {
            type: 'box',
            layout: 'vertical',
            spacing: 'sm',
            contents: [
              {
                type: 'text',
                text: `สลิปเลขอ้างอิง "${result.transactionRef}" เคยถูกบันทึกเข้าระบบไปแล้วครับ`,
                size: 'xs',
                color: '#374151',
                wrap: true
              },
              { type: 'separator', margin: 'md', color: '#f3f4f6' },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เลขอ้างอิง (REF):', size: 'xxs', color: '#6b7280', flex: 4 },
                  { type: 'text', text: result.transactionRef, size: 'xxs', color: '#111827', weight: 'bold', flex: 6, align: 'end' }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ยอดเงินเดิม:', size: 'xxs', color: '#6b7280', flex: 4 },
                  { type: 'text', text: `${Number(existingSlip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} THB`, size: 'xxs', color: '#dc2626', weight: 'bold', flex: 6, align: 'end' }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'บันทึกครั้งแรกเมื่อ:', size: 'xxs', color: '#6b7280', flex: 4 },
                  { type: 'text', text: origTime, size: 'xxs', color: '#111827', flex: 6, align: 'end' }
                ]
              },
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ผู้ลงบันทึกเดิม:', size: 'xxs', color: '#6b7280', flex: 4 },
                  { type: 'text', text: originalOperator, size: 'xxs', color: '#111827', weight: 'bold', flex: 6, align: 'end' }
                ]
              },
              { type: 'separator', margin: 'md', color: '#fee2e2' },
              {
                type: 'text',
                text: `🛑 พยายามบันทึกซ้ำโดย: พี่${senderName} | ยูซุไม่อนุญาตให้ใช้สลิปเดิมซ้ำเพื่อความถูกต้องทางการเงินของร้านครับ`,
                size: 'xxs',
                color: '#b91c1c',
                wrap: true,
                margin: 'sm'
              }
            ]
          }
        }
      };

      await client.replyMessage(event.replyToken, duplicateFlexMsg);
      return true;
    }
  }

  const fileName = `slip_${Date.now()}_${mappedDbUserId}.jpg`;
  const { error: uploadError } = await supabase.storage
    .from('yuzu-slips')
    .upload(fileName, buffer, { contentType: 'image/jpeg' });

  let slipUrl = null;
  if (!uploadError) {
    const { data: { publicUrl } } = supabase.storage.from('yuzu-slips').getPublicUrl(fileName);
    slipUrl = publicUrl;
  } else {
    console.error("Slip Upload Error:", uploadError);
  }

  const today = new Date();
  const dateStr = today.toISOString().split('T')[0];

  const { error: insertError } = await supabase.from('slip_transactions').insert({
    group_id: groupId,
    user_id: mappedDbUserId,
    amount: parsedAmount,
    slip_url: slipUrl,
    transaction_ref: result.transactionRef || null,
    sender_name: result.senderName || null,
    bank_name: result.bankName || null,
    date: dateStr
  });

  if (insertError) {
     console.error("Slip Insert Error:", insertError);
      if (insertError.code === '23505') {
           await client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ สลิปใบนี้ (อ้างอิง: ${result.transactionRef || 'ไม่ทราบ'}) ได้ถูกบันทึกเข้าระบบเรียบร้อยแล้วครับ ระบบปฏิเสธการบันทึกซ้ำซ้อน` });
      } else {
           await client.replyMessage(event.replyToken, { type: 'text', text: `เกิดข้อผิดพลาดในการบันทึกข้อมูลสลิปเข้าระบบครับ (Error: ${insertError.message || insertError.code || 'Unknown DB Error'})` });
      }
  } else {
     const slipFlexMsg = {
        type: 'flex',
        altText: `บันทึกยอดโอน ${parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท เรียบร้อยค่ะ`,
        contents: {
          type: 'bubble',
          size: 'kilo',
          styles: {
            body: {
              backgroundColor: '#D2FF00'
            }
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '16px',
            contents: [
              // Header Stack
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: 'ร้านในบ้าน - in the haus',
                    weight: 'bold',
                    size: 'xxs',
                    color: '#333333'
                  },
                  {
                    type: 'text',
                    text: 'DEPOSIT RECORDED',
                    weight: 'bold',
                    size: 'lg',
                    color: '#000000',
                    margin: 'xs'
                  }
                ]
              },
              // Spacer representing open graphic region
              {
                type: 'box',
                layout: 'vertical',
                margin: 'lg',
                height: '16px',
                contents: []
              },
              // Divider 1
              {
                type: 'separator',
                color: '#000000'
              },
              // Row 1
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'sm',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    contents: [
                      {
                        type: 'text',
                        text: result.bankName || 'ไม่ระบุ',
                        size: 'xs',
                        weight: 'bold',
                        color: '#000000',
                        wrap: true
                      },
                      {
                        type: 'text',
                        text: 'BANK',
                        size: 'xxs',
                        color: '#333333',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    contents: [
                      {
                        type: 'text',
                        text: result.senderName || 'ไม่ระบุ',
                        size: 'xs',
                        weight: 'bold',
                        color: '#000000',
                        wrap: true
                      },
                      {
                        type: 'text',
                        text: 'SENDER',
                        size: 'xxs',
                        color: '#333333',
                        margin: 'xs'
                      }
                    ]
                  }
                ]
              },
              // Divider 2
              {
                type: 'separator',
                color: '#000000',
                margin: 'sm'
              },
              // Row 2
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'sm',
                spacing: 'sm',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    contents: [
                      {
                        type: 'text',
                        text: result.transTime || 'ไม่ระบุ',
                        size: 'xs',
                        weight: 'bold',
                        color: '#000000',
                        wrap: true
                      },
                      {
                        type: 'text',
                        text: 'DATE TIME',
                        size: 'xxs',
                        color: '#333333',
                        margin: 'xs'
                      }
                    ]
                  },
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    contents: [
                      {
                        type: 'text',
                        text: senderName || 'ไม่ระบุ',
                        size: 'xs',
                        weight: 'bold',
                        color: '#000000',
                        wrap: true
                      },
                      {
                        type: 'text',
                        text: 'OPERATOR',
                        size: 'xxs',
                        color: '#333333',
                        margin: 'xs'
                      }
                    ]
                  }
                ]
              },
              // Divider 3
              {
                type: 'separator',
                color: '#000000',
                margin: 'sm'
              },
              // Row 3
              {
                type: 'box',
                layout: 'vertical',
                margin: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: result.transactionRef || 'ไม่ระบุ',
                    size: 'xs',
                    weight: 'bold',
                    color: '#000000',
                    wrap: true
                  },
                  {
                    type: 'text',
                    text: 'REFERENCE NO.',
                    size: 'xxs',
                    color: '#333333',
                    margin: 'xs'
                  }
                ]
              },
              // Divider 4
              {
                type: 'separator',
                color: '#000000',
                margin: 'sm'
              },
              // Big Amount
              {
                type: 'text',
                margin: 'md',
                contents: [
                  {
                    type: 'span',
                    text: parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2}),
                    size: '3xl',
                    weight: 'bold',
                    color: '#000000'
                  },
                  {
                    type: 'span',
                    text: ' THB',
                    size: 'xs',
                    weight: 'bold',
                    color: '#000000'
                  }
                ]
              }
            ]
          }
        }
      };
      await client.replyMessage(event.replyToken, slipFlexMsg);
  }
  return true;
}
