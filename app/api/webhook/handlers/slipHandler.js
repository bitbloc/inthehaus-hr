import { supabase } from '../../../../lib/supabaseClient';
import { format, addHours } from 'date-fns';
import { sanitizeTransactionRef, sanitizeAmount } from '../../../../utils/gemini';

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

  // Fetch allowed slip positions from yuzu_config
  let allowedPositions = ['Bar & Floor', 'Owner', 'CEO', 'Manager', 'Part-time'];
  const { data: configData } = await supabase
     .from('yuzu_config')
     .select('value')
     .eq('key', 'allowed_slip_positions')
     .maybeSingle();

  if (configData && configData.value) {
     try {
        if (configData.value.trim().startsWith('[')) {
           allowedPositions = JSON.parse(configData.value);
        } else {
           allowedPositions = configData.value.split(',').map(s => s.trim()).filter(Boolean);
        }
     } catch (e) {
        allowedPositions = configData.value.split(',').map(s => s.trim()).filter(Boolean);
     }
  }

  if (emp) {
     if (emp.line_user_id) {
       mappedDbUserId = emp.line_user_id;
     }
     if (emp.nickname || emp.name) {
       senderName = emp.nickname || emp.name;
     }
     const empPosClean = emp.position ? emp.position.toLowerCase().replace(/\s/g, '') : '';
     isAuthorized = allowedPositions.some(p => {
        const pClean = p.toLowerCase().replace(/\s/g, '');
        return empPosClean.includes(pClean) || pClean.includes(empPosClean);
     });
  }

  if (!isAuthorized) {
     let formattedAllowed = 'Bar & Floor และ Owner';
     if (allowedPositions.length === 1) {
        formattedAllowed = allowedPositions[0];
     } else if (allowedPositions.length > 1) {
        formattedAllowed = `${allowedPositions.slice(0, -1).join(', ')} และ ${allowedPositions[allowedPositions.length - 1]}`;
     }
     await client.replyMessage(event.replyToken, { type: 'text', text: `คุณ ${senderName} ไม่มีสิทธิ์ในการบันทึกสลิปเข้าระบบครับ (จำกัดสิทธิ์เฉพาะตำแหน่ง ${formattedAllowed} เท่านั้น)\n[UID: ${userId}]` });
     return true;
  }

  // Parse amount safely
  const parsedAmount = sanitizeAmount(result.amount);
  const cleanRef = sanitizeTransactionRef(result.transactionRef);
  const cleanSender = result.senderName && !['-', 'null', 'undefined', 'ไม่ระบุ', 'ไม่มี', 'n/a'].includes(String(result.senderName).trim().toLowerCase()) 
    ? String(result.senderName).trim() 
    : null;
  const cleanReceiver = result.receiverName && !['-', 'null', 'undefined', 'ไม่ระบุ', 'ไม่มี', 'n/a'].includes(String(result.receiverName).trim().toLowerCase()) 
    ? String(result.receiverName).trim() 
    : null;
  const cleanBank = result.bankName && !['-', 'null', 'undefined', 'ไม่ระบุ', 'ไม่มี', 'n/a'].includes(String(result.bankName).trim().toLowerCase()) 
    ? String(result.bankName).trim() 
    : null;

  // Determine Thailand date string (YYYY-MM-DD)
  const bkkNow = addHours(new Date(), 7);
  let dateStr = format(bkkNow, 'yyyy-MM-dd');
  if (result.transDate && /^\d{4}-\d{2}-\d{2}$/.test(result.transDate)) {
    dateStr = result.transDate;
  }

  // --- Duplicate Slip Detection (ระบบป้องกันสลิปซ้ำแบบอัจฉริยะ) ---
  let duplicateSlip = null;

  // Layer 1: ตรวจสอบด้วย Transaction Ref Code (ถ้ามี Ref Code ที่ถูกต้อง)
  if (cleanRef) {
    const { data: existingSlip } = await supabase
      .from('slip_transactions')
      .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
      .eq('transaction_ref', cleanRef)
      .eq('is_deleted', false)
      .maybeSingle();

    if (existingSlip) {
      console.log(`[Slip Duplicate Prevention] Match by Ref: ${cleanRef}`);
      duplicateSlip = existingSlip;
    }
  }

  // Layer 2: ตรวจสอบสลิปหน้าจอแอปที่ไม่มี Ref Code (Composite Matching)
  // เพื่อกันกดส่งซ้ำ หรือพนักงาน 2 คนส่งรูปหน้าจอเดียวกัน โดยไม่บล็อกสลิปยอดเดียวกันที่คนละคนโอน
  if (!duplicateSlip && parsedAmount > 0) {
    const { data: sameDaySlips } = await supabase
      .from('slip_transactions')
      .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
      .eq('amount', parsedAmount)
      .eq('date', dateStr)
      .eq('is_deleted', false);

    if (sameDaySlips && sameDaySlips.length > 0) {
      for (const slip of sameDaySlips) {
        // 2.1 หากมีชื่อผู้โอนตรงกัน (หรือคล้ายกันมาก) ในวันเดียวกัน
        if (cleanSender && slip.sender_name) {
          const normA = cleanSender.toLowerCase().replace(/[\s.*_]/g, '');
          const normB = slip.sender_name.toLowerCase().replace(/[\s.*_]/g, '');
          if (normA.length >= 3 && normB.length >= 3 && (normA.includes(normB) || normB.includes(normA))) {
            console.log(`[Slip Duplicate Prevention] Match by composite (Same Amount + Date + Sender: ${cleanSender})`);
            duplicateSlip = slip;
            break;
          }
        }

        // 2.2 หากบันทึกไปในเวลาใกล้เคียงกันมาก (ภายใน 10 นาที) และไม่มี ref ทั้งคู่
        if (!cleanRef && !slip.transaction_ref && slip.timestamp) {
          const slipTime = new Date(slip.timestamp).getTime();
          const nowMs = Date.now();
          const diffMinutes = Math.abs(nowMs - slipTime) / (1000 * 60);
          if (diffMinutes <= 10) {
            console.log(`[Slip Duplicate Prevention] Match by composite (Same Amount + uploaded within 10 mins)`);
            duplicateSlip = slip;
            break;
          }
        }
      }
    }
  }

  // หากตรวจพบสลิปซ้ำ แสดง Alert และปฏิเสธการบันทึก
  if (duplicateSlip) {
    let originalOperator = duplicateSlip.sender_name || "พนักงานในระบบ";
    if (duplicateSlip.user_id) {
      const { data: origEmp } = await supabase
        .from('employees')
        .select('nickname, name')
        .eq('line_user_id', duplicateSlip.user_id)
        .maybeSingle();
      if (origEmp) {
        originalOperator = origEmp.nickname || origEmp.name;
      }
    }

    const origTime = duplicateSlip.timestamp 
      ? new Date(duplicateSlip.timestamp).toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })
      : duplicateSlip.date;

    const displayRef = cleanRef || duplicateSlip.transaction_ref || "สลิปหน้าจอ (ไม่มี Ref Code)";

    const duplicateFlexMsg = {
      type: 'flex',
      altText: `⚠️ แจ้งเตือนสลิปซ้ำ: ยอด ${Number(duplicateSlip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท`,
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
              text: `สลิปยอด ${Number(duplicateSlip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท เคยถูกบันทึกเข้าระบบไปแล้วครับ`,
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
                { type: 'text', text: displayRef, size: 'xxs', color: '#111827', weight: 'bold', flex: 6, align: 'end', wrap: true }
              ]
            },
            {
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'ยอดเงินเดิม:', size: 'xxs', color: '#6b7280', flex: 4 },
                { type: 'text', text: `${Number(duplicateSlip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} THB`, size: 'xxs', color: '#dc2626', weight: 'bold', flex: 6, align: 'end' }
              ]
            },
            ...(duplicateSlip.sender_name ? [{
              type: 'box',
              layout: 'horizontal',
              contents: [
                { type: 'text', text: 'ผู้โอนเดิม:', size: 'xxs', color: '#6b7280', flex: 4 },
                { type: 'text', text: duplicateSlip.sender_name, size: 'xxs', color: '#111827', flex: 6, align: 'end' }
              ]
            }] : []),
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

  // อัปโหลดรูปสลิปลง Storage
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

  // บันทึกลงตาราง slip_transactions
  const { error: insertError } = await supabase.from('slip_transactions').insert({
    group_id: groupId,
    user_id: mappedDbUserId,
    amount: parsedAmount,
    slip_url: slipUrl,
    transaction_ref: cleanRef || null,
    sender_name: cleanSender || null,
    bank_name: cleanBank || null,
    date: dateStr
  });

  if (insertError) {
     console.error("Slip Insert Error:", insertError);
      if (insertError.code === '23505') {
           await client.replyMessage(event.replyToken, { type: 'text', text: `⚠️ สลิปใบนี้ (อ้างอิง: ${cleanRef || 'ไม่ทราบ'}) ได้ถูกบันทึกเข้าระบบเรียบร้อยแล้วครับ ระบบปฏิเสธการบันทึกซ้ำซ้อน` });
      } else {
           await client.replyMessage(event.replyToken, { type: 'text', text: `เกิดข้อผิดพลาดในการบันทึกข้อมูลสลิปเข้าระบบครับ (Error: ${insertError.message || insertError.code || 'Unknown DB Error'})` });
      }
  } else {
     const formattedTime = result.transTime || format(bkkNow, 'dd/MM/yyyy HH:mm น.');
     const displayRef = cleanRef || 'สลิปหน้าจอแอป (ยืนยันด้วยยอดและเวลา)';

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
                margin: 'md',
                height: '10px',
                contents: []
              },
              // Divider 1
              {
                type: 'separator',
                color: '#000000'
              },
              // Row 1: Bank & Sender
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
                        text: cleanBank || 'ไม่ระบุ',
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
                        text: cleanSender || 'ไม่ระบุ',
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
              // Row 2: Date Time & Operator
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
                        text: formattedTime,
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
              ...(cleanReceiver ? [
                {
                  type: 'separator',
                  color: '#000000',
                  margin: 'sm'
                },
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'sm',
                  contents: [
                    {
                      type: 'text',
                      text: cleanReceiver,
                      size: 'xs',
                      weight: 'bold',
                      color: '#000000',
                      wrap: true
                    },
                    {
                      type: 'text',
                      text: 'RECEIVER / ปลายทาง',
                      size: 'xxs',
                      color: '#333333',
                      margin: 'xs'
                    }
                  ]
                }
              ] : []),
              // Divider 3
              {
                type: 'separator',
                color: '#000000',
                margin: 'sm'
              },
              // Row 3: Reference No.
              {
                type: 'box',
                layout: 'vertical',
                margin: 'sm',
                contents: [
                  {
                    type: 'text',
                    text: displayRef,
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

