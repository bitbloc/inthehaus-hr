import { supabase } from '../../../../lib/supabaseClient.js';
import { format, addHours } from 'date-fns';
import { sanitizeTransactionRef, sanitizeAmount } from '../../../../utils/gemini.js';
import sharp from 'sharp';

// In-memory cache for employee resolution: line_user_id / line_bot_id -> { mappedDbUserId, senderName, cachedAt }
const employeeCache = new Map();
const EMPLOYEE_CACHE_TTL = 1000 * 60 * 60; // 1 hour

async function resolveEmployee(userId, groupId, client) {
  const cached = employeeCache.get(userId);
  if (cached && (Date.now() - cached.cachedAt < EMPLOYEE_CACHE_TTL)) {
    return cached;
  }

  let mappedDbUserId = userId;
  let senderName = "ทีมงาน";

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
    } else if (client) {
      try {
        if (groupId && groupId.startsWith('C')) {
          const profile = await client.getGroupMemberProfile(groupId, userId);
          if (profile && profile.displayName) senderName = profile.displayName;
        } else {
          const profile = await client.getProfile(userId);
          if (profile && profile.displayName) senderName = profile.displayName;
        }
      } catch {
        senderName = "ทีมงาน";
      }
    }
  } catch (err) {
    console.warn("[Slip Handler] Could not resolve employee nickname:", err?.message);
  }

  const result = { mappedDbUserId, senderName, cachedAt: Date.now() };
  employeeCache.set(userId, result);
  if (mappedDbUserId !== userId) {
    employeeCache.set(mappedDbUserId, result);
  }
  return result;
}

async function checkDuplicateSlip({ result, cleanRef, parsedAmount, dateStr, cleanSender, userId }) {
  // Layer 0 / 1: By Clean Ref or EasySlip Network Duplicate
  if (cleanRef) {
    const { data: existingSlip } = await supabase
      .from('slip_transactions')
      .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
      .eq('transaction_ref', cleanRef)
      .eq('is_deleted', false)
      .maybeSingle();

    if (existingSlip) {
      console.log(`[Slip Duplicate Prevention] Match by Ref: ${cleanRef}`);
      return existingSlip;
    }
  }

  if (result.source === 'easyslip' && result.isDuplicate) {
    console.log(`[Slip Duplicate Prevention] EasySlip flagged duplicate in bank network: ${cleanRef}`);
    return {
      amount: parsedAmount,
      date: dateStr,
      transaction_ref: cleanRef || 'EasySlip Network Detected',
      sender_name: cleanSender || 'ระบบธนาคารตรวจพบสลิปซ้ำ',
      timestamp: new Date().toISOString(),
      user_id: userId,
      isNetworkDuplicate: true
    };
  }

  // Layer 2: Check screen capture slip without ref (Composite Matching)
  if (parsedAmount > 0) {
    const { data: sameDaySlips } = await supabase
      .from('slip_transactions')
      .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
      .eq('amount', parsedAmount)
      .eq('date', dateStr)
      .eq('is_deleted', false);

    if (sameDaySlips && sameDaySlips.length > 0) {
      for (const slip of sameDaySlips) {
        if (cleanSender && slip.sender_name) {
          const normA = cleanSender.toLowerCase().replace(/[\s.*_]/g, '');
          const normB = slip.sender_name.toLowerCase().replace(/[\s.*_]/g, '');
          if (normA.length >= 3 && normB.length >= 3 && (normA.includes(normB) || normB.includes(normA))) {
            console.log(`[Slip Duplicate Prevention] Match by composite (Same Amount + Date + Sender: ${cleanSender})`);
            return slip;
          }
        }

        if (!cleanRef && !slip.transaction_ref && slip.timestamp) {
          const slipTime = new Date(slip.timestamp).getTime();
          const diffMinutes = Math.abs(Date.now() - slipTime) / (1000 * 60);
          if (diffMinutes <= 10) {
            console.log(`[Slip Duplicate Prevention] Match by composite (Same Amount + uploaded within 10 mins)`);
            return slip;
          }
        }
      }
    }
  }

  return null;
}

export async function handleSlipImage(event, client, buffer, userId, groupId, result) {
  if (!result.isSlip) return false;

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

  // ⚡ Phase 1 Optimization: Run Employee Resolution & Duplicate Check in PARALLEL
  const [empInfo, duplicateSlip] = await Promise.all([
    resolveEmployee(userId, groupId, client),
    checkDuplicateSlip({ result, cleanRef, parsedAmount, dateStr, cleanSender, userId })
  ]);

  const mappedDbUserId = empInfo.mappedDbUserId;
  const senderName = empInfo.senderName;

  // หากตรวจพบสลิปซ้ำ แสดง Alert และปฏิเสธการบันทึก
  if (duplicateSlip) {
    let originalOperator = duplicateSlip.sender_name || "พนักงานในระบบ";
    if (duplicateSlip.user_id) {
      const origCached = employeeCache.get(duplicateSlip.user_id);
      if (origCached) {
        originalOperator = origCached.senderName;
      } else {
        const { data: origEmp } = await supabase
          .from('employees')
          .select('nickname, name')
          .eq('line_user_id', duplicateSlip.user_id)
          .maybeSingle();
        if (origEmp) {
          originalOperator = origEmp.nickname || origEmp.name;
        }
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

  // ⚡ Phase 1 Optimization: Deterministic Public URL generation + Instant DB Insert
  // Do NOT block LINE reply waiting for multi-megabyte image storage upload!
  const fileName = `slip_${Date.now()}_${mappedDbUserId}.jpg`;
  const { data: { publicUrl: slipUrl } } = supabase.storage.from('yuzu-slips').getPublicUrl(fileName);

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
    return true;
  }

  // ⚡ Phase 1 & 4 Optimization: Background Image Compression (sharp) & Upload
  // Runs in the background (fire-and-forget) so the LINE user receives the reply immediately!
  if (buffer && Buffer.isBuffer(buffer)) {
    (async () => {
      try {
        const compressedBuffer = await sharp(buffer)
          .resize({ width: 1280, height: 1280, fit: 'inside', withoutEnlargement: true })
          .jpeg({ quality: 80, progressive: true })
          .toBuffer();

        const { error: uploadError } = await supabase.storage
          .from('yuzu-slips')
          .upload(fileName, compressedBuffer, { contentType: 'image/jpeg' });

        if (uploadError) {
          console.error("[Slip Storage Upload Error]:", uploadError);
        } else {
          console.log(`[Slip Storage] Successfully uploaded compressed slip (${Math.round(compressedBuffer.length / 1024)} KB): ${fileName}`);
        }
      } catch (bgUploadErr) {
        console.error("[Slip Background Upload Error]:", bgUploadErr?.message || bgUploadErr);
      }
    })();
  }

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
                        flex: 0
                      },
                      {
                        type: 'box',
                        layout: 'horizontal',
                        justifyContent: 'flex-end',
                        flex: 1,
                        contents: [
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
                                weight: 'bold',
                                wrap: true
                              }
                            ]
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
      return true;
}

/**
 * Handle Fake or AI-Generated Slip Detection Alert
 * Rejects slip insertion and alerts staff with urgent security guidance.
 */
export async function handleFakeSlipAlert(event, client, buffer, userId, groupId, result) {
  const empInfo = await resolveEmployee(userId, groupId, client);
  const senderName = empInfo.senderName || 'ทีมงาน';

  const cleanRef = sanitizeTransactionRef(result.transactionRef);
  const parsedAmount = result.amount ? sanitizeAmount(result.amount) : null;
  const cleanBank = result.bankName && !['-', 'null', 'undefined', 'ไม่ระบุ', 'ไม่มี', 'n/a'].includes(String(result.bankName).trim().toLowerCase()) 
    ? String(result.bankName).trim() 
    : null;
  const fakeReason = result.fakeReason || 'ไม่พบข้อมูลธุรกรรมในระบบธนาคาร (สลิปปลอมหรือใช้ AI สร้าง)';

  const fakeFlexMsg = {
    type: 'flex',
    altText: `🚨 แจ้งเตือนสลิปต้องสงสัย: ตรวจไม่พบข้อมูลธุรกรรมในระบบธนาคาร (สลิปปลอม/AI)`,
    contents: {
      type: 'bubble',
      size: 'mega',
      styles: {
        header: { backgroundColor: '#FEE2E2' },
        body: { backgroundColor: '#FAF9F6' },
        footer: { backgroundColor: '#FAF9F6' }
      },
      header: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        contents: [
          {
            type: 'text',
            text: '🚨 SECURITY ALERT // ONHAUS SYSTEM',
            color: '#DC2626',
            weight: 'bold',
            size: 'xxs'
          },
          {
            type: 'text',
            text: 'ตรวจไม่พบข้อมูลธุรกรรมในระบบธนาคาร',
            color: '#991B1B',
            weight: 'bold',
            size: 'sm',
            margin: 'xs',
            wrap: true
          },
          {
            type: 'text',
            text: 'ปฏิเสธการบันทึก: สลิปปลอมหรือใช้ AI สร้าง',
            color: '#B91C1C',
            size: 'xxs',
            weight: 'bold',
            margin: 'xs',
            wrap: true
          }
        ]
      },
      body: {
        type: 'box',
        layout: 'vertical',
        paddingAll: '16px',
        spacing: 'sm',
        contents: [
          // Alert Explanation Box
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FEF2F2',
            cornerRadius: '8px',
            paddingAll: '12px',
            contents: [
              {
                type: 'text',
                text: '⚠️ ปฏิเสธการบันทึกยอดเงินเข้าสู่ระบบ',
                color: '#991B1B',
                weight: 'bold',
                size: 'xs',
                wrap: true
              },
              {
                type: 'text',
                text: 'ระบบตรวจสอบรหัสสลิปกับเครือข่ายธนาคารแล้ว ไม่พบประวัติการทำรายการนี้จริงครับ สลิปนี้อาจเป็นสลิปปลอม ตัดต่อแก้ไขภาพ หรือถูกสร้างขึ้นด้วย AI เพื่อความปลอดภัยทางการเงินของร้าน ระบบไม่อนุญาตให้บันทึกรายการนี้ครับ',
                color: '#4B5563',
                size: 'xxs',
                margin: 'xs',
                wrap: true
              },
              {
                type: 'text',
                text: `สาเหตุ: ${fakeReason}`,
                color: '#DC2626',
                weight: 'bold',
                size: 'xxs',
                margin: 'sm',
                wrap: true
              }
            ]
          },

          // Details
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#F2F0E8',
            cornerRadius: '8px',
            paddingAll: '12px',
            spacing: 'xs',
            margin: 'sm',
            contents: [
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'เลขอ้างอิง (REF):', size: 'xxs', color: '#78716C', flex: 4 },
                  { type: 'text', text: cleanRef || 'ไม่พบในระบบธนาคาร', size: 'xxs', color: '#1C1917', weight: 'bold', flex: 6, align: 'end', wrap: true }
                ]
              },
              ...(parsedAmount ? [{
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ยอดเงินที่ระบุ:', size: 'xxs', color: '#78716C', flex: 4 },
                  { type: 'text', text: `${parsedAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} THB`, size: 'xxs', color: '#DC2626', weight: 'bold', flex: 6, align: 'end' }
                ]
              }] : []),
              ...(cleanBank ? [{
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ธนาคารที่อ้าง:', size: 'xxs', color: '#78716C', flex: 4 },
                  { type: 'text', text: cleanBank, size: 'xxs', color: '#1C1917', flex: 6, align: 'end', wrap: true }
                ]
              }] : []),
              {
                type: 'box',
                layout: 'horizontal',
                contents: [
                  { type: 'text', text: 'ผู้ส่งภาพเข้าระบบ:', size: 'xxs', color: '#78716C', flex: 4 },
                  { type: 'text', text: `พี่${senderName}`, size: 'xxs', color: '#1C1917', weight: 'bold', flex: 6, align: 'end' }
                ]
              }
            ]
          },

          // Actionable guidance for staff
          {
            type: 'box',
            layout: 'vertical',
            backgroundColor: '#FFFBEB',
            cornerRadius: '8px',
            paddingAll: '12px',
            margin: 'sm',
            contents: [
              {
                type: 'text',
                text: '📌 ข้อปฏิบัติสำหรับทีมงานหน้าร้าน:',
                size: 'xxs',
                weight: 'bold',
                color: '#92400E'
              },
              {
                type: 'text',
                text: '1. ขอให้ลูกค้าเปิดประวัติการโอนเงินจริงในแอปธนาคาร (Statement / รายการย้อนหลัง) ให้ตรวจสอบ\n2. หรือให้ลูกค้าสแกนชำระผ่าน QR Code รับเงินของทางร้านใหม่อีกครั้งครับ',
                size: 'xxs',
                color: '#78350F',
                margin: 'xs',
                wrap: true
              }
            ]
          }
        ]
      }
    }
  };

  // Log suspicious transaction in chat history
  try {
    await supabase.from('yuzu_chat_history').insert({
      group_id: groupId,
      user_id: empInfo.mappedDbUserId || userId,
      role: 'system',
      content: `[ALERT] ไม่พบข้อมูลธุรกรรม (สลิปปลอม/AI): ${cleanRef || 'No Ref'} ยอด ${parsedAmount || 0} บาท (${fakeReason})`,
      message_type: 'fake_slip_alert'
    });
  } catch (logErr) {
    console.error("Failed to log fake slip alert:", logErr);
  }

  // Reply message
  try {
    await client.replyMessage(event.replyToken, fakeFlexMsg);
  } catch (replyErr) {
    console.warn("Fake slip replyMessage failed, attempting pushMessage fallback:", replyErr.message);
    const target = groupId || userId;
    if (target) {
      await client.pushMessage(target, fakeFlexMsg);
    }
  }
  return true;
}

