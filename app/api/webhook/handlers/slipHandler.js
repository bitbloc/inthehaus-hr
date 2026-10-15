import { supabase } from '../../../../lib/supabaseClient';
import { format, addHours } from 'date-fns';
import { sanitizeTransactionRef, sanitizeAmount } from '../../../../utils/gemini';

export async function handleSlipImage(event, client, buffer, userId, groupId, result) {
  if (!result.isSlip) return false;

  let mappedDbUserId = userId;
  let senderName = "ทีมงาน";

  // 1. ตรวจสอบชื่อพนักงานจากฐานข้อมูล employees เพื่อดึงชื่อเล่น
  try {
    const { data: emp } = await supabase
       .from('employees')
       .select('line_user_id, line_bot_id, name, nickname, position')
       .eq('is_active', true)
       .or(`line_bot_id.eq.${userId},line_user_id.eq.${userId}`)
       .maybeSingle();

    if (emp) {
      if (emp.line_user_id) mappedDbUserId = emp.line_user_id;
      if (emp.nickname || emp.name) senderName = emp.nickname || emp.name;
    } else {
      // 2. หากยังไม่มีในฐานข้อมูล ให้ดึงชื่อ Display Name จาก LINE Profile
      try {
        if (groupId && groupId.startsWith('C')) {
          const profile = await client.getGroupMemberProfile(groupId, userId);
          if (profile && profile.displayName) senderName = profile.displayName;
        } else {
          const profile = await client.getProfile(userId);
          if (profile && profile.displayName) senderName = profile.displayName;
        }
      } catch (profileErr) {
        senderName = "ทีมงาน";
      }
    }
  } catch (err) {
    console.warn("Could not resolve employee nickname:", err?.message);
  }

  // ปรับให้ทุกคนสามารถส่งสลิปได้ตามคำสั่งผู้ใช้ (เปิดอิสระ ไม่บล็อกสิทธิ์)

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

  // Layer 0: ตรวจสอบจาก EasySlip Bank Network Duplicate Detection (ถ้าตรวจพบการตรวจซ้ำในเครือข่ายธนาคาร)
  if (result.source === 'easyslip' && result.isDuplicate) {
    console.log(`[Slip Duplicate Prevention] EasySlip flagged duplicate in bank network: ${cleanRef}`);
    if (cleanRef) {
      const { data: existingSlip } = await supabase
        .from('slip_transactions')
        .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
        .eq('transaction_ref', cleanRef)
        .eq('is_deleted', false)
        .maybeSingle();
      if (existingSlip) {
        duplicateSlip = existingSlip;
      }
    }
    if (!duplicateSlip) {
      duplicateSlip = {
        amount: parsedAmount,
        date: dateStr,
        transaction_ref: cleanRef || 'EasySlip Network Detected',
        sender_name: cleanSender || 'ระบบธนาคารตรวจพบสลิปซ้ำ',
        timestamp: new Date().toISOString(),
        user_id: mappedDbUserId,
        isNetworkDuplicate: true
      };
    }
  }

  // Layer 1: ตรวจสอบด้วย Transaction Ref Code (ถ้ามี Ref Code ที่ถูกต้อง)
  if (!duplicateSlip && cleanRef) {
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
              text: duplicateSlip.isNetworkDuplicate 
                ? `สลิปยอด ${Number(duplicateSlip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท นี้ถูกตรวจพบว่าเคยถูกนำไปใช้งาน/ตรวจซ้ำในระบบเครือข่ายธนาคารแล้วครับ`
                : `สลิปยอด ${Number(duplicateSlip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท เคยถูกบันทึกเข้าระบบไปแล้วครับ`,
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

    try {
      await client.replyMessage(event.replyToken, duplicateFlexMsg);
    } catch (replyErr) {
      console.warn("Duplicate replyMessage failed, attempting pushMessage fallback:", replyErr.message);
      const target = groupId || userId;
      if (target) {
        await client.pushMessage(target, duplicateFlexMsg);
      }
    }
    return true;
  }

  // อัปโหลดรูปสลิปและบันทึกลง Database พร้อมกันด้วย Promise.all (ลด Latency ลง ~500ms)
  const fileName = `slip_${Date.now()}_${mappedDbUserId}.jpg`;
  const { data: { publicUrl: slipUrl } } = supabase.storage.from('yuzu-slips').getPublicUrl(fileName);

  const [uploadRes, insertRes] = await Promise.all([
    supabase.storage.from('yuzu-slips').upload(fileName, buffer, { contentType: 'image/jpeg' }),
    supabase.from('slip_transactions').insert({
      group_id: groupId,
      user_id: mappedDbUserId,
      amount: parsedAmount,
      slip_url: slipUrl,
      transaction_ref: cleanRef || null,
      sender_name: cleanSender || null,
      bank_name: cleanBank || null,
      date: dateStr
    })
  ]);

  if (uploadRes.error) {
    console.error("Slip Storage Upload Error:", uploadRes.error);
  }

  const insertError = insertRes.error;
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

     const isEasySlip = result.source === 'easyslip';

     /* Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
     // Hallmark Redesign: Tactile warm linen paper, clean typography hierarchy, restrained dividers
     const slipFlexMsg = {
        type: 'flex',
        altText: `บันทึกยอดโอน ${parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} บาท เรียบร้อยค่ะ`,
        contents: {
          type: 'bubble',
          size: 'mega',
          styles: {
            body: { backgroundColor: '#FAF9F6' },
            footer: { backgroundColor: '#FAF9F6' }
          },
          body: {
            type: 'box',
            layout: 'vertical',
            paddingAll: '18px',
            contents: [
              // Top Bar: Brand & Title (Full width, no truncation)
              {
                type: 'box',
                layout: 'vertical',
                contents: [
                  {
                    type: 'text',
                    text: 'ร้านในบ้าน · IN THE HAUS',
                    size: 'xxs',
                    weight: 'bold',
                    color: '#78716C'
                  },
                  {
                    type: 'text',
                    text: 'บันทึกการโอนเงินสำเร็จ',
                    size: 'sm',
                    weight: 'bold',
                    color: '#1C1917',
                    margin: 'xs'
                  }
                ]
              },

              // Hero Amount Display Well with Verification Pill inside
              {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#F2F0E8',
                cornerRadius: '8px',
                paddingAll: '14px',
                margin: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'horizontal',
                    alignItems: 'center',
                    contents: [
                      {
                        type: 'text',
                        text: 'ยอดเงินที่บันทึก',
                        size: 'xxs',
                        color: '#78716C',
                        weight: 'bold',
                        flex: 1
                      },
                      {
                        type: 'box',
                        layout: 'vertical',
                        backgroundColor: isEasySlip ? '#ECFDF5' : '#F4F4F5',
                        cornerRadius: '6px',
                        paddingStart: '8px',
                        paddingEnd: '8px',
                        paddingTop: '3px',
                        paddingBottom: '3px',
                        contents: [
                          {
                            type: 'text',
                            text: isEasySlip ? '✓ ตรวจสอบกับธนาคารแล้ว' : '📸 อ่านจากภาพ',
                            size: 'xxs',
                            color: isEasySlip ? '#047857' : '#52525B',
                            weight: 'bold'
                          }
                        ]
                      }
                    ]
                  },
                  {
                    type: 'text',
                    margin: 'sm',
                    contents: [
                      {
                        type: 'span',
                        text: parsedAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 }),
                        size: '3xl',
                        weight: 'bold',
                        color: '#0F172A'
                      },
                      {
                        type: 'span',
                        text: ' THB',
                        size: 'xs',
                        weight: 'bold',
                        color: '#64748B'
                      }
                    ]
                  }
                ]
              },

              // Hairline Divider
              {
                type: 'separator',
                color: '#E7E5E0',
                margin: 'md'
              },

              // Data Grid: Row 1 (Bank & Sender)
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'md',
                spacing: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    contents: [
                      {
                        type: 'text',
                        text: 'ธนาคาร (BANK)',
                        size: 'xxs',
                        color: '#78716C',
                        weight: 'bold'
                      },
                      {
                        type: 'text',
                        text: cleanBank || 'ไม่ระบุ',
                        size: 'xs',
                        weight: 'bold',
                        color: '#1E293B',
                        margin: 'xs',
                        wrap: true
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
                        text: 'ผู้โอน (SENDER)',
                        size: 'xxs',
                        color: '#78716C',
                        weight: 'bold'
                      },
                      {
                        type: 'text',
                        text: cleanSender || 'ไม่ระบุ',
                        size: 'xs',
                        weight: 'bold',
                        color: '#1E293B',
                        margin: 'xs',
                        wrap: true
                      }
                    ]
                  }
                ]
              },

              // Data Grid: Row 2 (Time & Operator)
              {
                type: 'box',
                layout: 'horizontal',
                margin: 'md',
                spacing: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'vertical',
                    flex: 1,
                    contents: [
                      {
                        type: 'text',
                        text: 'วัน-เวลาโอน (TRANSFER TIME)',
                        size: 'xxs',
                        color: '#78716C',
                        weight: 'bold'
                      },
                      {
                        type: 'text',
                        text: formattedTime,
                        size: 'xs',
                        color: '#1E293B',
                        margin: 'xs',
                        wrap: true
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
                        text: 'ผู้ลงบันทึก (OPERATOR)',
                        size: 'xxs',
                        color: '#78716C',
                        weight: 'bold'
                      },
                      {
                        type: 'text',
                        text: senderName || 'ไม่ระบุ',
                        size: 'xs',
                        weight: 'bold',
                        color: '#1E293B',
                        margin: 'xs',
                        wrap: true
                      }
                    ]
                  }
                ]
              },

              // Optional Row 3: Receiver
              ...(cleanReceiver ? [
                {
                  type: 'box',
                  layout: 'vertical',
                  margin: 'md',
                  contents: [
                    {
                      type: 'text',
                      text: 'บัญชีปลายทาง (RECEIVER)',
                      size: 'xxs',
                      color: '#78716C',
                      weight: 'bold'
                    },
                    {
                      type: 'text',
                      text: cleanReceiver,
                      size: 'xs',
                      color: '#334155',
                      margin: 'xs',
                      wrap: true
                    }
                  ]
                }
              ] : []),

              // Hairline Divider
              {
                type: 'separator',
                color: '#E7E5E0',
                margin: 'md'
              },

              // Row 4: Transaction Reference
              {
                type: 'box',
                layout: 'vertical',
                margin: 'md',
                contents: [
                  {
                    type: 'box',
                    layout: 'horizontal',
                    contents: [
                      {
                        type: 'text',
                        text: 'รหัสอ้างอิง (REF NO.)',
                        size: 'xxs',
                        color: '#78716C',
                        weight: 'bold',
                        flex: 1
                      },
                      ...(isEasySlip ? [
                        {
                          type: 'text',
                          text: 'EasySlip Verified',
                          size: 'xxs',
                          color: '#059669',
                          weight: 'bold',
                          align: 'end'
                        }
                      ] : [])
                    ]
                  },
                  {
                    type: 'text',
                    text: displayRef,
                    size: 'xxs',
                    color: '#475569',
                    weight: 'bold',
                    margin: 'xs',
                    wrap: true
                  }
                ]
              }
            ]
          }
        }
      };

      try {
        await client.replyMessage(event.replyToken, slipFlexMsg);
      } catch (replyErr) {
        console.warn("Slip replyMessage failed, attempting pushMessage fallback:", replyErr.message);
        const target = groupId || userId;
        if (target) {
          await client.pushMessage(target, slipFlexMsg);
        }
      }
  }
  return true;
}

