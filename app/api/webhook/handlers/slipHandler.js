import { supabase } from '../../../../lib/supabaseClient.js';
import { format, addHours } from 'date-fns';
import { sanitizeTransactionRef, sanitizeAmount } from '../../../../utils/gemini.js';
import sharp from 'sharp';
import { buildSlipSuccessFlex, buildDuplicateFlex, buildFakeSlipFlex } from './slipFlex.js';

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
  // Layer 0 / 1: By Clean Ref (case-insensitive match) or EasySlip Network Duplicate
  if (cleanRef) {
    const { data: existingSlips } = await supabase
      .from('slip_transactions')
      .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
      .ilike('transaction_ref', cleanRef)
      .eq('is_deleted', false)
      .limit(1);

    if (existingSlips && existingSlips.length > 0) {
      console.log(`[Slip Duplicate Prevention] Match by Ref: ${cleanRef}`);
      return existingSlips[0];
    }

    // Also check if an unreferenced capture of the exact same transfer (same amount + same sender within 10 mins) was already uploaded
    if (parsedAmount > 0 && cleanSender) {
      const { data: recentUnrefSlips } = await supabase
        .from('slip_transactions')
        .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
        .eq('amount', parsedAmount)
        .eq('date', dateStr)
        .is('transaction_ref', null)
        .eq('is_deleted', false);

      if (recentUnrefSlips && recentUnrefSlips.length > 0) {
        const normA = cleanSender.toLowerCase().replace(/[\s.*_]/g, '');
        for (const slip of recentUnrefSlips) {
          if (slip.sender_name && slip.timestamp) {
            const normB = slip.sender_name.toLowerCase().replace(/[\s.*_]/g, '');
            if (normA.length >= 3 && normB.length >= 3 && (normA.includes(normB) || normB.includes(normA))) {
              const diffMinutes = Math.abs(Date.now() - new Date(slip.timestamp).getTime()) / (1000 * 60);
              if (diffMinutes <= 10) {
                console.log(`[Slip Duplicate Prevention] Match against recent unreferenced slip of same sender & amount: ${cleanSender}`);
                return slip;
              }
            }
          }
        }
      }
    }

    return null;
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

  // Layer 2: ONLY for unreferenced screen captures (!cleanRef)
  if (!cleanRef && parsedAmount > 0) {
    const { data: sameDaySlips } = await supabase
      .from('slip_transactions')
      .select('id, amount, date, timestamp, sender_name, bank_name, transaction_ref, user_id')
      .eq('amount', parsedAmount)
      .eq('date', dateStr)
      .eq('is_deleted', false);

    if (sameDaySlips && sameDaySlips.length > 0) {
      for (const slip of sameDaySlips) {
        if (cleanSender && slip.sender_name && slip.timestamp) {
          const normA = cleanSender.toLowerCase().replace(/[\s.*_]/g, '');
          const normB = slip.sender_name.toLowerCase().replace(/[\s.*_]/g, '');
          if (normA.length >= 3 && normB.length >= 3 && (normA.includes(normB) || normB.includes(normA))) {
            const slipTime = new Date(slip.timestamp).getTime();
            const diffMinutes = Math.abs(Date.now() - slipTime) / (1000 * 60);
            if (diffMinutes <= 15) {
              console.log(`[Slip Duplicate Prevention] Match by composite (No Ref + Same Amount + Same Sender within 15 mins: ${cleanSender})`);
              return slip;
            }
          }
        }

        if (!slip.transaction_ref && slip.timestamp) {
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

  const parsedAmount = sanitizeAmount(result.amount);
  const cleanRef = sanitizeTransactionRef(result.transactionRef);
  const cleanText = (v) =>
    v && !['-', 'null', 'undefined', 'ไม่ระบุ', 'ไม่มี', 'n/a'].includes(String(v).trim().toLowerCase())
      ? String(v).trim()
      : null;

  const cleanSender = cleanText(result.senderName);
  const cleanSenderAcc = cleanText(result.senderAccount);
  const cleanReceiver = cleanText(result.receiverName);
  const cleanReceiverAcc = cleanText(result.receiverAccount);
  const cleanBank = cleanText(result.bankName);

  // Determine Thailand date string (YYYY-MM-DD) bulletproof
  const todayStr = new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
  let dateStr = todayStr;
  if (result.transDate && /^\d{4}-\d{2}-\d{2}$/.test(result.transDate)) {
    dateStr = result.transDate;
  }

  const isPastDateSlip = dateStr !== todayStr;

  // Run Employee Resolution & Duplicate Check in PARALLEL
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

    const displayRef = duplicateSlip.transaction_ref || cleanRef || "สลิปหน้าจอ (ไม่มี Ref Code)";

    const duplicateFlexMsg = buildDuplicateFlex({
      amount: duplicateSlip.amount,
      isNetworkDuplicate: Boolean(duplicateSlip.isNetworkDuplicate),
      ref: displayRef,
      originalSender: duplicateSlip.sender_name,
      firstSavedAt: origTime,
      originalOperator,
      resender: senderName,
    });

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

  // Deterministic Public URL generation + Instant DB Insert
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
      await client.replyMessage(event.replyToken, { type: 'text', text: `สลิปใบนี้ (อ้างอิง: ${cleanRef || 'ไม่ทราบ'}) ได้ถูกบันทึกเข้าระบบเรียบร้อยแล้วครับ ระบบปฏิเสธการบันทึกซ้ำซ้อน` });
    } else {
      await client.replyMessage(event.replyToken, { type: 'text', text: `เกิดข้อผิดพลาดในการบันทึกข้อมูลสลิปเข้าระบบครับ (Error: ${insertError.message || insertError.code || 'Unknown DB Error'})` });
    }
    return true;
  }

  // Background Image Compression (sharp) & Upload
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

  // Server runs in UTC; shift to Bangkok before formatting the fallback time
  const bkkNow = addHours(new Date(), 7);
  const formattedTime = result.transTime || format(bkkNow, 'dd/MM/yyyy HH:mm น.');
  const displayRef = cleanRef || 'สลิปหน้าจอแอป (ยืนยันด้วยยอดและเวลา)';

  const isBankVerified = result.source === 'easyslip' || result.verificationTier === 'BANK_VERIFIED';
  const tierLabel = result.verificationBadge || (isBankVerified ? 'ตรวจกับธนาคารแล้ว' : 'อ่านจากภาพ');

  const senderDisplay = cleanSender
    ? (cleanSenderAcc ? `${cleanSender} (${cleanSenderAcc})` : cleanSender)
    : null;
  const receiverDisplay = cleanReceiver
    ? (cleanReceiverAcc ? `${cleanReceiver} (${cleanReceiverAcc})` : cleanReceiver)
    : null;

  const checkItems = Array.isArray(result.checks) && result.checks.length > 0
    ? result.checks
    : [
        isBankVerified ? '✓ ยืนยันรหัสธุรกรรมกับระบบธนาคาร (EasySlip)' : '✓ ตรวจข้อมูลจากภาพสลิปแล้ว',
        '✓ ไม่พบประวัติสลิปซ้ำในระบบ'
      ];

  const slipFlexMsg = buildSlipSuccessFlex({
    amount: parsedAmount,
    tierLabel,
    isBankVerified,
    isPastDateSlip,
    dateStr,
    todayStr,
    bank: cleanBank,
    sender: senderDisplay,
    transferTime: formattedTime,
    receiver: receiverDisplay,
    operator: senderName,
    ref: displayRef,
    checks: checkItems,
  });

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
 * Handle Fake, Doctored, Wrong-Receiver, or Unverified Slip Detection Alert
 * Rejects slip insertion and alerts staff with detailed forensic findings.
 */
export async function handleFakeSlipAlert(event, client, buffer, userId, groupId, result) {
  const empInfo = await resolveEmployee(userId, groupId, client);
  const senderName = empInfo.senderName || 'ทีมงาน';

  const cleanText = (v) =>
    v && !['-', 'null', 'undefined', 'ไม่ระบุ', 'ไม่มี', 'n/a'].includes(String(v).trim().toLowerCase())
      ? String(v).trim()
      : null;

  const cleanRef = sanitizeTransactionRef(result.transactionRef);
  const parsedAmount = result.amount ? sanitizeAmount(result.amount) : null;
  const cleanBank = cleanText(result.bankName);
  const cleanCustomerSender = cleanText(result.senderName);
  const cleanReceiver = cleanText(result.receiverName);
  const alertTitle = result.alertTitle || 'ตรวจไม่พบข้อมูลธุรกรรมในระบบธนาคาร';
  const fakeReason = result.fakeReason || 'ไม่พบข้อมูลธุรกรรมในระบบธนาคาร หรือตรวจพบความผิดปกติของสลิป';
  const checkLines = Array.isArray(result.checks) ? result.checks : [];

  const fakeFlexMsg = buildFakeSlipFlex({
    alertTitle,
    isWrongReceiver: Boolean(result.isWrongReceiver),
    fakeReason,
    checks: checkLines,
    ref: cleanRef,
    amount: parsedAmount,
    bankVerifiedAmount: result.bankVerifiedAmount,
    bank: cleanBank,
    customerSender: cleanCustomerSender,
    receiver: cleanReceiver,
    submitter: senderName,
    shopAccountLabel: 'น.ส. ธัญญธร ศรีวิเศษ (2455)',
  });

  // Log suspicious transaction in chat history
  try {
    await supabase.from('yuzu_chat_history').insert({
      group_id: groupId,
      user_id: empInfo.mappedDbUserId || userId,
      role: 'system',
      content: `[ALERT] ${alertTitle}: ${cleanRef || 'No Ref'} ยอด ${parsedAmount || 0} บาท (${fakeReason})`,
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
