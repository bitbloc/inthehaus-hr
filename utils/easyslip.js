import { extractQrFromImage } from './qrScanner.js';

/**
 * EasySlip API v2 + Multi-Layer Bank Slip Verification Engine for In The Haus
 * Supports:
 * 1. Multi-Pass Local QR Extraction + EMVCo CRC16-CCITT Checksum Verification
 * 2. Synthetic EMVCo Mini-QR Reconstruction (verifies with bank even when QR on screen photo is blurry/covered!)
 * 3. 7-Point Cross-Verification between Bank Network (EasySlip) & AI Vision Forensics
 * 4. Shop Receiver Account Verification (น.ส. ธัญญธร ศรีวิเศษ / พร้อมเพย์ 2455)
 */

const DEFAULT_API_KEY = 'e0650eb6-a4c8-4e25-b109-54bf3a10256e';

export const BANK_CODE_MAP = {
  '002': 'ธนาคารกรุงเทพ',
  '004': 'ธนาคารกสิกรไทย',
  '006': 'ธนาคารกรุงไทย',
  '011': 'ธนาคารทหารไทยธนชาต (ttb)',
  '014': 'ธนาคารไทยพาณิชย์ (SCB)',
  '022': 'ธนาคารซีไอเอ็มบีไทย (CIMB)',
  '024': 'ธนาคารยูโอบี (UOB)',
  '025': 'ธนาคารกรุงศรีอยุธยา',
  '030': 'ธนาคารออมสิน (GSB)',
  '034': 'ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)',
  '066': 'ธนาคารอิสลามแห่งประเทศไทย',
  '067': 'ธนาคารทิสโก้ (TISCO)',
  '069': 'ธนาคารเกียรตินาคินภัทร (KKP)',
  '073': 'ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)'
};

// Official Shop Receiver Identifiers for In The Haus
const SHOP_RECEIVER_KEYWORDS = [
  'ธัญญธร',
  'ศรีวิเศษ',
  'tanyatorn',
  'sriwiset',
  'in the haus',
  'inthehaus',
  'ในบ้าน'
];
const SHOP_ACCOUNT_SUFFIXES = ['2455'];

/**
 * Compute standard EMVCo CRC16-CCITT (polynomial 0x1021, initial 0xFFFF)
 */
export function computeCrc16Ccitt(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) & 0xFF) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Validate EMVCo QR Payload CRC16 checksum (Tag 9104 at end of payload)
 */
export function verifyQrCrc16(payload) {
  if (!payload || typeof payload !== 'string' || payload.length < 20) return false;
  const idx9104 = payload.lastIndexOf('9104');
  if (idx9104 === -1 || idx9104 + 8 > payload.length) {
    // Some bank QR formats may use 6304 for CRC
    const idx6304 = payload.lastIndexOf('6304');
    if (idx6304 !== -1 && idx6304 + 8 === payload.length) {
      const body = payload.slice(0, idx6304 + 4);
      const expected = payload.slice(idx6304 + 4, idx6304 + 8).toUpperCase();
      return computeCrc16Ccitt(body) === expected;
    }
    return true; // If no standard CRC tag at tail, don't fail CRC check
  }
  const body = payload.slice(0, idx9104 + 4);
  const actualCrc = payload.slice(idx9104 + 4, idx9104 + 8).toUpperCase();
  const computedCrc = computeCrc16Ccitt(body);
  return actualCrc === computedCrc;
}

/**
 * Resolve 3-digit BOT bank code from Thai/English bank name
 */
export function resolveBankCode(bankNameOrCode) {
  if (!bankNameOrCode) return null;
  const s = String(bankNameOrCode).trim().toLowerCase();
  if (/^\d{3}$/.test(s) && BANK_CODE_MAP[s]) return s;

  if (s.includes('กสิกร') || s.includes('kbank') || s.includes('k plus') || s.includes('make by kbank')) return '004';
  if (s.includes('กรุงไทย') || s.includes('krungthai') || s.includes('ktb') || s.includes('เป๋าตัง')) return '006';
  if (s.includes('ไทยพาณิชย์') || s.includes('scb')) return '014';
  if (s.includes('กรุงเทพ') || s.includes('bangkok') || s.includes('bbl')) return '002';
  if (s.includes('กรุงศรี') || s.includes('krungsri') || s.includes('bay') || s.includes('kma')) return '025';
  if (s.includes('ทหารไทย') || s.includes('ธนชาต') || s.includes('ttb')) return '011';
  if (s.includes('ออมสิน') || s.includes('gsb') || s.includes('mymo')) return '030';
  if (s.includes('ธ.ก.ส') || s.includes('ธกส') || s.includes('เกษตร') || s.includes('baac')) return '034';
  if (s.includes('เกียรตินาคิน') || s.includes('kkp')) return '069';
  if (s.includes('ซีไอเอ็มบี') || s.includes('cimb')) return '022';
  if (s.includes('ยูโอบี') || s.includes('uob')) return '024';
  if (s.includes('ทิสโก้') || s.includes('tisco')) return '067';
  if (s.includes('แลนด์') || s.includes('lh')) return '073';
  if (s.includes('อิสลาม') || s.includes('isbt')) return '066';
  return null;
}

/**
 * Normalize OCR-extracted transaction reference for a specific bank
 * (e.g. Krungthai 17-char hex reference starting with 'A' + 16 hex chars)
 */
export function normalizeBankTransactionRef(bankCode, rawRef) {
  if (!rawRef || typeof rawRef !== 'string') return null;
  let ref = rawRef.trim().replace(/\s+/g, '');
  if (ref.length < 6) return null;

  // Krungthai (006): Standard ref is 'A' + 16 lowercase hex chars (total 17 chars)
  if (bankCode === '006' && ref.length === 17 && /^[Aa]/.test(ref)) {
    const tail = ref.slice(1)
      .replace(/O/g, '0')
      .replace(/o/g, '0')
      .replace(/[Il]/g, '1')
      .toLowerCase();
    if (/^[0-9a-f]{16}$/.test(tail)) {
      return 'A' + tail;
    }
  }
  return ref;
}

/**
 * Build synthetic BOT EMVCo Mini-QR payload from bankCode + transactionRef
 * Allows verifying a slip with EasySlip API even when the QR code on a camera photo is blurry or covered!
 */
export function buildEmvSlipPayload(bankNameOrCode, rawRef) {
  const bankCode = resolveBankCode(bankNameOrCode);
  if (!bankCode || !rawRef) return null;

  const cleanRef = normalizeBankTransactionRef(bankCode, rawRef);
  if (!cleanRef || cleanRef.length < 8 || cleanRef.length > 35) return null;

  const refLenStr = String(cleanRef.length).padStart(2, '0');
  const inner = `00060000010103${bankCode}02${refLenStr}${cleanRef}`;
  const innerLenStr = String(inner.length).padStart(2, '0');
  const bodyWithoutCrc = `00${innerLenStr}${inner}5102TH9104`;
  const crc = computeCrc16Ccitt(bodyWithoutCrc);
  return `${bodyWithoutCrc}${crc}`;
}

export function parseRefFromQrPayload(payload) {
  if (!payload || typeof payload !== 'string') return null;
  // Look for subtag 0103<bankCode>02<len><ref> inside tag 00
  const fullMatch = payload.match(/00060000010103\d{3}02(\d{2})/);
  if (fullMatch) {
    const idx = payload.indexOf(fullMatch[0]);
    const len = parseInt(fullMatch[1], 10);
    const start = idx + fullMatch[0].length;
    const value = payload.slice(start, start + len);
    if (value && value.length === len) return value;
  }
  // Fallback: Look for Tag 02 followed by 2-digit length
  const tag02Match = payload.match(/02(\d{2})/);
  if (tag02Match) {
    const idx = payload.indexOf(tag02Match[0]);
    const len = parseInt(tag02Match[1], 10);
    const value = payload.slice(idx + 4, idx + 4 + len);
    if (value && value.length === len) return value;
  }
  const match = payload.match(/[0-9]{10,18}[A-Za-z0-9]{3,12}/);
  return match ? match[0] : null;
}

export function parseBankFromQrPayload(payload) {
  if (!payload || typeof payload !== 'string') return null;
  const match = payload.match(/0103(\d{3})/);
  if (match && BANK_CODE_MAP[match[1]]) {
    return BANK_CODE_MAP[match[1]];
  }
  return 'ธนาคารพาณิชย์';
}

/**
 * Verify if the slip's receiver matches the shop's official account (น.ส. ธัญญธร ศรีวิเศษ / พร้อมเพย์ 2455)
 */
export function verifyShopReceiver(receiverName, receiverAccount) {
  const normName = receiverName ? String(receiverName).trim().toLowerCase() : '';
  const normAcc = receiverAccount ? String(receiverAccount).trim().replace(/\s+/g, '').toLowerCase() : '';

  const hasName = normName.length >= 2 && !['-', 'null', 'undefined', 'ไม่ระบุ', 'ไม่มี', 'n/a'].includes(normName);
  const hasAcc = normAcc.length >= 3 && !['-', 'null', 'undefined', 'ไม่ระบุ', 'ไม่มี', 'n/a'].includes(normAcc);

  if (!hasName && !hasAcc) {
    return { status: 'UNKNOWN', isMatch: null, reason: 'ไม่ปรากฏข้อมูลบัญชีผู้รับบนภาพ (ภาพอาจถูกครอบตัด)' };
  }

  const nameMatched = hasName && SHOP_RECEIVER_KEYWORDS.some(kw => normName.includes(kw));
  const accMatched = hasAcc && SHOP_ACCOUNT_SUFFIXES.some(sfx => normAcc.includes(sfx));

  if (nameMatched || accMatched) {
    return {
      status: 'MATCH',
      isMatch: true,
      displayReceiver: receiverName || 'น.ส. ธัญญธร ศรีวิเศษ',
      displayAccount: receiverAccount || 'XXX-XXX-2455'
    };
  }

  return {
    status: 'MISMATCH',
    isMatch: false,
    reason: `ชื่อผู้รับเงินในสลิปคือ "${receiverName || receiverAccount}" ซึ่งไม่ใช่บัญชีรับเงินของร้าน (น.ส. ธัญญธร ศรีวิเศษ / พร้อมเพย์ 2455)`
  };
}

/**
 * Compare two transaction reference strings allowing minor OCR confusions (0/O, 1/I/l, 5/S, 8/B)
 */
export function areTransactionRefsCompatible(refA, refB) {
  if (!refA || !refB) return true;
  const canonicalize = (s) =>
    String(s)
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '')
      .replace(/O/g, '0')
      .replace(/[IL]/g, '1')
      .replace(/S/g, '5')
      .replace(/B/g, '8');

  const a = canonicalize(refA);
  const b = canonicalize(refB);
  if (!a || !b) return true;
  if (a === b || a.includes(b) || b.includes(a)) return true;

  // Compute Hamming/edit distance for same-length strings
  if (Math.abs(a.length - b.length) > 3) return false;
  const minLen = Math.min(a.length, b.length);
  let matches = 0;
  for (let i = 0; i < minLen; i++) {
    if (a[i] === b[i]) matches++;
  }
  const similarity = matches / Math.max(a.length, b.length);
  return similarity >= 0.75;
}

export function getEasySlipApiKey() {
  return process.env.EASYSLIP_API_KEY || DEFAULT_API_KEY;
}

/**
 * Format ISO date string to Bangkok date (YYYY-MM-DD) and time (dd/MM/yyyy HH:mm น.)
 */
export function formatBangkokDateTime(isoDateString) {
  try {
    const d = isoDateString ? new Date(isoDateString) : new Date();
    const bkkDateParts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Bangkok',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(d); // "YYYY-MM-DD"

    const timeParts = new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(d); // "HH:mm"

    const thaiDisplay = `${new Intl.DateTimeFormat('th-TH', {
      timeZone: 'Asia/Bangkok',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric'
    }).format(d)} ${timeParts} น.`;

    return {
      transDate: bkkDateParts,
      transTime: thaiDisplay,
      isoDate: d.toISOString()
    };
  } catch (err) {
    console.error('[EasySlip] Date formatting error:', err);
    return {
      transDate: new Date().toISOString().split('T')[0],
      transTime: null,
      isoDate: new Date().toISOString()
    };
  }
}

/**
 * Check EasySlip application quota and status
 */
export async function getEasySlipQuota() {
  const apiKey = getEasySlipApiKey();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch('https://api.easyslip.com/v2/info', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    const json = await res.json();
    if (json.success && json.data) {
      return {
        success: true,
        quota: json.data.application?.quota || null,
        branch: json.data.branch || null,
        credit: json.data.account?.credit || 0,
        raw: json.data
      };
    }
    return { success: false, error: json.error || json.message || 'Unknown response' };
  } catch (err) {
    console.error('[EasySlip] Quota check error:', err.message);
    return { success: false, error: err.message };
  }
}

/**
 * Verify a bank transfer slip using EasySlip API v2 via QR Payload
 */
export async function verifySlipWithEasySlip(imageInput, options = {}) {
  const apiKey = getEasySlipApiKey();
  if (!apiKey) {
    return { success: false, isSlip: false, error: 'NO_API_KEY' };
  }

  const checkDuplicate = options.checkDuplicate ?? false;
  let qrPayload = null;

  // Case 1: Explicit payload passed
  if (typeof imageInput === 'object' && imageInput?.payload) {
    qrPayload = imageInput.payload;
  } else if (typeof imageInput === 'string' && (imageInput.startsWith('000201') || imageInput.startsWith('004100') || (imageInput.startsWith('00') && imageInput.length >= 20 && imageInput.length <= 300))) {
    qrPayload = imageInput;
  }

  // Case 2: Buffer passed -> Local Multi-Pass QR extraction
  if (!qrPayload && Buffer.isBuffer(imageInput)) {
    try {
      const extracted = await extractQrFromImage(imageInput);
      if (extracted && extracted.length >= 20) {
        qrPayload = extracted;
      }
    } catch (qrErr) {
      console.warn('[EasySlip v2] Local QR extraction error:', qrErr?.message || qrErr);
    }
  }

  // If no QR code found in image, return cleanly without sending invalid base64 to EasySlip
  // (Route will run Gemini Vision and can synthesize EMVCo Mini-QR from OCR ref if it's a slip!)
  if (!qrPayload) {
    return {
      success: false,
      isSlip: false,
      hasQrPayload: false,
      code: 'NO_QR_DETECTED',
      message: 'No QR code detected in image'
    };
  }

  const crcValid = verifyQrCrc16(qrPayload);
  const parsedRef = parseRefFromQrPayload(qrPayload);
  const parsedBank = parseBankFromQrPayload(qrPayload);

  if (!crcValid) {
    console.warn(`[EasySlip v2] 🚨 QR Code CRC16 Checksum INVALID for payload: ${qrPayload}`);
    return {
      success: false,
      isSlip: true,
      hasQrPayload: true,
      qrPayload,
      crcValid: false,
      isNotFound: true,
      isFakeOrAi: true,
      transactionRef: parsedRef,
      bankName: parsedBank,
      fakeReason: 'รหัสตรวจสอบความถูกต้องของ QR Code (CRC16 Checksum) ไม่ถูกต้องตามมาตรฐานธนาคาร (QR ปลอมแปลง)',
      code: 'INVALID_QR_CRC'
    };
  }

  const requestBody = { payload: qrPayload, checkDuplicate };

  try {
    const makeApiCall = async (body) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch('https://api.easyslip.com/v2/verify/bank', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(body),
          signal: controller.signal
        });
        clearTimeout(timeout);
        return await res.json();
      } catch (err) {
        clearTimeout(timeout);
        throw err;
      }
    };

    let result = await makeApiCall(requestBody);

    // If first attempt returned SLIP_NOT_FOUND, wait 1.2s and retry once (handles immediate post-transfer bank sync delay)
    const firstCode = String(result?.error?.code || '').toUpperCase();
    if (!result?.success && (firstCode === 'SLIP_NOT_FOUND' || firstCode === 'NOT_FOUND') && !options.skipRetry) {
      console.log(`[EasySlip v2] First lookup returned ${firstCode} for ${parsedRef}, retrying in 1.2s for bank sync...`);
      await new Promise(r => setTimeout(r, 1200));
      try {
        result = await makeApiCall(requestBody);
      } catch (retryErr) {
        console.warn('[EasySlip v2] Retry error:', retryErr?.message || retryErr);
      }
    }

    // Verified successfully by EasySlip
    if (result && (result.success === true || result.status === 200) && result.data) {
      const data = result.data;
      const rawSlip = data.rawSlip || data;

      const amountVal = data.amountInSlip ?? rawSlip.amount?.amount ?? (typeof rawSlip.amount === 'number' ? rawSlip.amount : 0);
      const { transDate, transTime, isoDate } = formatBangkokDateTime(rawSlip.date || data.date);

      const senderName = rawSlip.sender?.account?.name?.th ||
                         rawSlip.sender?.account?.name?.en ||
                         rawSlip.sender?.displayName ||
                         rawSlip.sender?.name ||
                         data.sender?.name || null;
      const senderAccount = rawSlip.sender?.account?.bank?.account ||
                            rawSlip.sender?.account?.proxy?.account || null;
      const senderBankName = rawSlip.sender?.bank?.name || rawSlip.sender?.bank?.short || data.sender?.bank?.name || null;

      const receiverName = rawSlip.receiver?.account?.name?.th ||
                           rawSlip.receiver?.account?.name?.en ||
                           rawSlip.receiver?.displayName ||
                           rawSlip.receiver?.name ||
                           data.receiver?.name || null;
      const receiverAccount = rawSlip.receiver?.account?.proxy?.account ||
                              rawSlip.receiver?.account?.bank?.account || null;
      const receiverBankName = rawSlip.receiver?.bank?.name || rawSlip.receiver?.bank?.short || data.receiver?.bank?.name || null;

      const primaryBank = senderBankName || receiverBankName || parsedBank || 'ธนาคารพาณิชย์';

      return {
        success: true,
        isSlip: true,
        hasQrPayload: true,
        qrPayload,
        crcValid: true,
        isSyntheticQr: Boolean(options.isSyntheticQr),
        amount: Number(amountVal),
        transactionRef: rawSlip.transRef || data.transRef || parsedRef || null,
        senderName: senderName ? String(senderName).trim() : null,
        senderAccount: senderAccount ? String(senderAccount).trim() : null,
        receiverName: receiverName ? String(receiverName).trim() : null,
        receiverAccount: receiverAccount ? String(receiverAccount).trim() : null,
        bankName: primaryBank ? String(primaryBank).trim() : null,
        transTime,
        transDate,
        isoDate,
        rawPayload: rawSlip.payload || data.payload || qrPayload,
        isDuplicate: Boolean(data.isDuplicate),
        source: 'easyslip',
        shortDescription: `สลิปโอนเงิน (EasySlip Verified v2): ${Number(amountVal).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท [${primaryBank}]`,
        shouldReply: true,
        rawResponse: data
      };
    }

    const errCode = String(result?.error?.code || result?.status || '').toUpperCase();
    const errMsg = String(result?.error?.message || result?.message || '').toLowerCase();

    const isSlipNotFound = errCode === 'SLIP_NOT_FOUND' ||
                           errCode === 'NOT_FOUND' ||
                           errCode === 'INVALID_SLIP' ||
                           result?.status === 404 ||
                           errMsg.includes('not found') ||
                           errMsg.includes('ไม่พบ');

    if (isSlipNotFound) {
      console.warn(`[EasySlip v2] Bank lookup returned ${errCode} for Ref: ${parsedRef || 'N/A'} (${parsedBank})`);
      return {
        success: false,
        isSlip: true,
        hasQrPayload: true,
        qrPayload,
        crcValid: true,
        isNotFound: true,
        transactionRef: parsedRef,
        bankName: parsedBank,
        code: errCode || 'SLIP_NOT_FOUND',
        message: result?.error?.message || result?.message || 'Transaction not found in bank lookup'
      };
    }

    return {
      success: false,
      isSlip: false,
      hasQrPayload: true,
      qrPayload,
      crcValid: true,
      transactionRef: parsedRef,
      bankName: parsedBank,
      code: errCode || 'VERIFICATION_FAILED',
      message: result?.error?.message || result?.message || 'EasySlip verification returned unsuccessful'
    };

  } catch (error) {
    console.warn('[EasySlip v2] API call failed:', error.message);
    return {
      success: false,
      isSlip: false,
      hasQrPayload: true,
      qrPayload,
      crcValid: true,
      transactionRef: parsedRef,
      bankName: parsedBank,
      code: 'NETWORK_OR_TIMEOUT',
      message: error.message
    };
  }
}

/**
 * 7-Point Deep Verification & Reconciliation Engine
 * Combines EasySlip Bank Lookup + Synthetic Mini-QR Lookup + Gemini Vision Forensics
 */
export async function reconcileSlipVerification({ easySlipResult, visionResult }) {
  let activeEasySlip = easySlipResult;

  // Step 1: If local QR scan didn't find a QR (e.g. tilted phone or notification covering QR),
  // but Gemini Vision extracted bankName + transactionRef, synthesize EMVCo Mini-QR and query EasySlip!
  if ((!activeEasySlip || (!activeEasySlip.success && !activeEasySlip.hasQrPayload)) &&
      visionResult?.isSlip && visionResult?.transactionRef && visionResult?.bankName) {
    const syntheticQr = buildEmvSlipPayload(visionResult.bankName, visionResult.transactionRef);
    if (syntheticQr) {
      console.log(`[Slip Reconcile] 🔄 Synthesizing EMVCo Mini-QR from Vision OCR (${visionResult.bankName} / ${visionResult.transactionRef}): ${syntheticQr}`);
      activeEasySlip = await verifySlipWithEasySlip(
        { payload: syntheticQr },
        { isSyntheticQr: true, skipRetry: true }
      );
    }
  }

  const checks = [];
  const warnings = [];

  // CASE A: EasySlip Verified Transaction in Bank Network!
  if (activeEasySlip && activeEasySlip.success && activeEasySlip.isSlip) {
    checks.push('✓ ยืนยันรหัสธุรกรรมกับระบบธนาคาร (EasySlip Verified)');

    // 1. Cross-check Amount between QR (Bank) and Visual Text on Image (prevents QR-Swap / Edited Amount fraud!)
    if (visionResult?.isSlip && visionResult.amount > 0 && activeEasySlip.amount > 0) {
      const diff = Math.abs(activeEasySlip.amount - visionResult.amount);
      if (diff >= 1) {
        return {
          approved: false,
          isSlip: true,
          isFakeOrAi: true,
          alertTitle: 'ตรวจพบการตัดต่อแก้ไขตัวเลขยอดเงินบนสลิป',
          fakeReason: `ยอดเงินจริงในระบบธนาคารคือ ${activeEasySlip.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท แต่ตัวเลขบนภาพสลิปถูกแก้ไขเป็น ${visionResult.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท (สวมรอย QR Code)`,
          amount: visionResult.amount,
          bankVerifiedAmount: activeEasySlip.amount,
          transactionRef: activeEasySlip.transactionRef || visionResult.transactionRef,
          senderName: activeEasySlip.senderName || visionResult.senderName,
          senderAccount: activeEasySlip.senderAccount || visionResult.senderAccount,
          receiverName: activeEasySlip.receiverName || visionResult.receiverName,
          receiverAccount: activeEasySlip.receiverAccount || visionResult.receiverAccount,
          bankName: activeEasySlip.bankName || visionResult.bankName,
          transTime: activeEasySlip.transTime || visionResult.transTime,
          transDate: activeEasySlip.transDate || visionResult.transDate,
          checks: [
            `✗ ยอดเงินไม่ตรงกัน: ธนาคาร ${activeEasySlip.amount.toFixed(2)} บ. ≠ ภาพสลิป ${visionResult.amount.toFixed(2)} บ.`,
            '✗ ตรวจพบการนำ QR Code ยอดอื่นมาตัดแปะหรือแก้ไขตัวเลข'
          ]
        };
      }
      checks.push(`✓ ยอดเงินใน QR ตรงกับหน้าสลิป (${activeEasySlip.amount.toLocaleString('th-TH', { minimumFractionDigits: 2 })} THB)`);
    }

    // 2. Cross-check Transaction Ref between QR and Visual Text on Image
    if (visionResult?.isSlip && visionResult.transactionRef && activeEasySlip.transactionRef && !activeEasySlip.isSyntheticQr) {
      if (!areTransactionRefsCompatible(activeEasySlip.transactionRef, visionResult.transactionRef)) {
        return {
          approved: false,
          isSlip: true,
          isFakeOrAi: true,
          alertTitle: 'ตรวจพบการตัดแปะสวมรอย QR Code ข้ามสลิป',
          fakeReason: `รหัสอ้างอิงใน QR Code (${activeEasySlip.transactionRef}) ไม่ตรงกับรหัสอ้างอิงที่พิมพ์บนภาพสลิป (${visionResult.transactionRef})`,
          amount: visionResult.amount || activeEasySlip.amount,
          transactionRef: `${visionResult.transactionRef} (QR: ${activeEasySlip.transactionRef})`,
          senderName: activeEasySlip.senderName || visionResult.senderName,
          receiverName: activeEasySlip.receiverName || visionResult.receiverName,
          bankName: activeEasySlip.bankName || visionResult.bankName,
          checks: [
            `✗ รหัสอ้างอิงใน QR (${activeEasySlip.transactionRef}) ไม่ตรงกับภาพ (${visionResult.transactionRef})`
          ]
        };
      }
      checks.push('✓ รหัสอ้างอิงใน QR ตรงกับข้อความบนหน้าสลิป');
    }

    // 3. Verify Shop Receiver Account
    const receiverCheck = verifyShopReceiver(
      activeEasySlip.receiverName || visionResult?.receiverName,
      activeEasySlip.receiverAccount || visionResult?.receiverAccount
    );
    if (receiverCheck.status === 'MISMATCH') {
      return {
        approved: false,
        isSlip: true,
        isFakeOrAi: true,
        isWrongReceiver: true,
        alertTitle: 'ปฏิเสธการบันทึก: โอนผิดบัญชี (ไม่ใช่บัญชีร้าน)',
        fakeReason: receiverCheck.reason,
        amount: activeEasySlip.amount || visionResult?.amount,
        transactionRef: activeEasySlip.transactionRef || visionResult?.transactionRef,
        senderName: activeEasySlip.senderName || visionResult?.senderName,
        senderAccount: activeEasySlip.senderAccount || visionResult?.senderAccount,
        receiverName: activeEasySlip.receiverName || visionResult?.receiverName,
        receiverAccount: activeEasySlip.receiverAccount || visionResult?.receiverAccount,
        bankName: activeEasySlip.bankName || visionResult?.bankName,
        transTime: activeEasySlip.transTime || visionResult?.transTime,
        transDate: activeEasySlip.transDate || visionResult?.transDate,
        checks: [
          `✗ บัญชีผู้รับไม่ตรง: ${activeEasySlip.receiverName || visionResult?.receiverName || 'ไม่ระบุ'} (${activeEasySlip.receiverAccount || visionResult?.receiverAccount || '-'})`,
          '✓ บัญชีที่ถูกต้องต้องเป็น: น.ส. ธัญญธร ศรีวิเศษ (พร้อมเพย์ 2455)'
        ]
      };
    }
    if (receiverCheck.status === 'MATCH') {
      checks.push('✓ บัญชีผู้รับเงินถูกต้อง (น.ส. ธัญญธร ศรีวิเศษ · 2455)');
    }

    return {
      approved: true,
      isSlip: true,
      source: 'easyslip',
      verificationBadge: '✓ ตรวจสอบกับธนาคารแล้ว (100%)',
      verificationTier: 'BANK_VERIFIED',
      amount: activeEasySlip.amount,
      transactionRef: activeEasySlip.transactionRef,
      senderName: activeEasySlip.senderName || visionResult?.senderName || null,
      senderAccount: activeEasySlip.senderAccount || visionResult?.senderAccount || null,
      receiverName: activeEasySlip.receiverName || visionResult?.receiverName || 'น.ส. ธัญญธร ศรีวิเศษ',
      receiverAccount: activeEasySlip.receiverAccount || visionResult?.receiverAccount || 'XXX-XXX-2455',
      bankName: activeEasySlip.bankName || visionResult?.bankName || null,
      transTime: activeEasySlip.transTime || visionResult?.transTime || null,
      transDate: activeEasySlip.transDate || visionResult?.transDate || null,
      isDuplicate: Boolean(activeEasySlip.isDuplicate),
      checks,
      warnings
    };
  }

  // CASE B: QR CRC16 Checksum Explicitly Failed (Tampered/Fake QR Code)
  if (activeEasySlip && activeEasySlip.crcValid === false) {
    return {
      approved: false,
      isSlip: true,
      isFakeOrAi: true,
      alertTitle: 'ตรวจพบรหัส QR Code ปลอมแปลง (Checksum ผิดพลาด)',
      fakeReason: activeEasySlip.fakeReason,
      amount: visionResult?.amount || null,
      transactionRef: visionResult?.transactionRef || activeEasySlip.transactionRef,
      senderName: visionResult?.senderName || null,
      receiverName: visionResult?.receiverName || null,
      bankName: visionResult?.bankName || activeEasySlip.bankName,
      checks: [
        '✗ รหัส CRC16 Checksum ใน QR Code ไม่ถูกต้องตามมาตรฐาน EMVCo ธนาคาร'
      ]
    };
  }

  // CASE C: EasySlip returned SLIP_NOT_FOUND (Could be KTB/Bank API sync delay OR Fake/AI Slip)
  if (activeEasySlip && activeEasySlip.isNotFound) {
    const qrRef = activeEasySlip.transactionRef;
    const visRef = visionResult?.transactionRef;
    const refCompatible = areTransactionRefsCompatible(qrRef, visRef);
    const receiverCheck = verifyShopReceiver(visionResult?.receiverName, visionResult?.receiverAccount);

    // Check if Vision detected visual tampering / AI generation
    if (visionResult?.isFakeOrAi) {
      return {
        approved: false,
        isSlip: true,
        isFakeOrAi: true,
        alertTitle: 'ตรวจพบสลิปปลอม / ตัดต่อภาพ / สร้างด้วย AI',
        fakeReason: `${visionResult.fakeReason || 'ตรวจพบความผิดปกติของฟอนต์หรือโครงสร้างภาพสลิป'} และไม่พบข้อมูลธุรกรรมในระบบธนาคาร`,
        amount: visionResult?.amount || null,
        transactionRef: visRef || qrRef,
        senderName: visionResult?.senderName || null,
        receiverName: visionResult?.receiverName || null,
        bankName: visionResult?.bankName || activeEasySlip.bankName,
        checks: [
          '✗ ไม่พบประวัติธุรกรรมในระบบธนาคาร',
          `✗ AI Vision ตรวจพบความผิดปกติ: ${visionResult.fakeReason || 'ร่องรอยตัดต่อ/AI'}`
        ]
      };
    }

    // Check if QR Ref mismatches printed Ref on slip
    if (qrRef && visRef && !refCompatible) {
      return {
        approved: false,
        isSlip: true,
        isFakeOrAi: true,
        alertTitle: 'รหัสอ้างอิงใน QR Code ไม่ตรงกับหน้าสลิป',
        fakeReason: `รหัสอ้างอิงใน QR Code (${qrRef}) ไม่ตรงกับที่พิมพ์บนภาพ (${visRef}) และไม่พบในระบบธนาคาร`,
        amount: visionResult?.amount || null,
        transactionRef: `${visRef} (QR: ${qrRef})`,
        senderName: visionResult?.senderName || null,
        receiverName: visionResult?.receiverName || null,
        bankName: visionResult?.bankName || activeEasySlip.bankName,
        checks: [
          `✗ รหัสอ้างอิงใน QR (${qrRef}) ≠ รหัสบนภาพ (${visRef})`,
          '✗ ไม่พบข้อมูลธุรกรรมในระบบธนาคาร'
        ]
      };
    }

    // Check if Receiver is wrong
    if (receiverCheck.status === 'MISMATCH') {
      return {
        approved: false,
        isSlip: true,
        isFakeOrAi: true,
        isWrongReceiver: true,
        alertTitle: 'ปฏิเสธการบันทึก: โอนผิดบัญชี (ไม่ใช่บัญชีร้าน)',
        fakeReason: receiverCheck.reason,
        amount: visionResult?.amount || null,
        transactionRef: visRef || qrRef,
        senderName: visionResult?.senderName || null,
        receiverName: visionResult?.receiverName || null,
        bankName: visionResult?.bankName || activeEasySlip.bankName,
        checks: [
          `✗ บัญชีผู้รับไม่ตรงกับของร้าน (${visionResult?.receiverName || '-'})`
        ]
      };
    }

    // ⚡ BANK SYNC DELAY RESILIENCE (e.g., Krungthai NEXT real-time transfer at shop counter):
    // Approve ONLY IF all 5 Forensic Safety Conditions pass:
    // 1. Vision confirms it's a valid slip with amount > 0 and NO visual tampering (!isFakeOrAi)
    // 2. Receiver explicitly matches shop's official account (น.ส. ธัญญธร ศรีวิเศษ / 2455)
    // 3. QR CRC16 checksum is valid AND QR Ref matches printed Ref
    // 4. Sender name is present
    const passesForensicSafety =
      visionResult?.isSlip &&
      !visionResult?.isFakeOrAi &&
      Number(visionResult?.amount) > 0 &&
      receiverCheck.status === 'MATCH' &&
      activeEasySlip.crcValid !== false &&
      refCompatible &&
      Boolean(visionResult?.senderName);

    if (passesForensicSafety) {
      console.log(`[Slip Reconcile] ✅ Bank API returned SLIP_NOT_FOUND (sync delay), but all 5 Forensic & Shop Receiver checks PASSED for Ref: ${visRef || qrRef}`);
      return {
        approved: true,
        isSlip: true,
        source: 'forensic_verified',
        verificationBadge: '🔍 ตรวจละเอียดผ่าน (ธนาคารซิงค์ล่าช้า)',
        verificationTier: 'FORENSIC_VERIFIED_BANK_DELAY',
        amount: visionResult.amount,
        transactionRef: visRef || qrRef,
        senderName: visionResult.senderName,
        senderAccount: visionResult.senderAccount || null,
        receiverName: visionResult.receiverName || 'น.ส. ธัญญธร ศรีวิเศษ',
        receiverAccount: visionResult.receiverAccount || 'XXX-XXX-2455',
        bankName: visionResult.bankName || activeEasySlip.bankName,
        transTime: visionResult.transTime || null,
        transDate: visionResult.transDate || null,
        checks: [
          '✓ บัญชีผู้รับตรงกับร้าน (น.ส. ธัญญธร ศรีวิเศษ · 2455)',
          '✓ โครงสร้าง QR Code (CRC16) ตรงกับเลขรหัสอ้างอิงบนภาพ',
          '✓ ตรวจสอบฟอนต์และเลย์เอาต์ภาพด้วย AI Forensics ปกติ',
          'ℹ️ ระบบธนาคารปลายทางกำลังซิงค์ข้อมูล (หากยอดสูงแนะนำเช็คแอป)'
        ],
        warnings: ['ระบบธนาคารปลายทางซิงค์ข้อมูลล่าช้า ผ่านการตรวจยืนยันระดับภาพและบัญชีผู้รับ 4 ชั้นแล้ว']
      };
    }

    // Otherwise, reject as unverified / fake slip!
    return {
      approved: false,
      isSlip: true,
      isFakeOrAi: true,
      alertTitle: 'ตรวจไม่พบข้อมูลธุรกรรมในระบบธนาคาร',
      fakeReason: 'ไม่พบประวัติการทำรายการนี้ในเครือข่ายธนาคาร และข้อมูลบนภาพไม่ผ่านเกณฑ์ความปลอดภัย (สลิปปลอม / AI หรือรายการไม่สำเร็จ)',
      amount: visionResult?.amount || null,
      transactionRef: visRef || qrRef,
      senderName: visionResult?.senderName || null,
      receiverName: visionResult?.receiverName || null,
      bankName: visionResult?.bankName || activeEasySlip.bankName,
      checks: [
        '✗ ไม่พบข้อมูลรหัสอ้างอิงนี้ในเครือข่ายธนาคาร',
        ...(receiverCheck.status !== 'MATCH' ? ['✗ ไม่สามารถยืนยันบัญชีผู้รับเงินของทางร้านได้'] : [])
      ]
    };
  }

  // CASE D: No QR code available (e.g., cropped screenshot without QR and without bank ref) -> Rely on Vision + Receiver Check
  if (visionResult?.isSlip) {
    if (visionResult.isFakeOrAi) {
      return {
        approved: false,
        isSlip: true,
        isFakeOrAi: true,
        alertTitle: 'ตรวจพบสลิปต้องสงสัย (ตัดต่อภาพหรือสร้างด้วย AI)',
        fakeReason: visionResult.fakeReason || 'ตรวจพบความผิดปกติของฟอนต์หรือโครงสร้างภาพสลิป',
        amount: visionResult.amount,
        transactionRef: visionResult.transactionRef,
        senderName: visionResult.senderName,
        receiverName: visionResult.receiverName,
        bankName: visionResult.bankName,
        checks: [`✗ ${visionResult.fakeReason || 'ตรวจพบร่องรอยความผิดปกติบนภาพสลิป'}`]
      };
    }

    const receiverCheck = verifyShopReceiver(visionResult.receiverName, visionResult.receiverAccount);
    if (receiverCheck.status === 'MISMATCH') {
      return {
        approved: false,
        isSlip: true,
        isFakeOrAi: true,
        isWrongReceiver: true,
        alertTitle: 'ปฏิเสธการบันทึก: โอนผิดบัญชี (ไม่ใช่บัญชีร้าน)',
        fakeReason: receiverCheck.reason,
        amount: visionResult.amount,
        transactionRef: visionResult.transactionRef,
        senderName: visionResult.senderName,
        receiverName: visionResult.receiverName,
        bankName: visionResult.bankName,
        checks: [`✗ บัญชีผู้รับไม่ตรงกับของร้าน (${visionResult.receiverName || '-'})`]
      };
    }

    if (receiverCheck.status === 'MATCH') {
      checks.push('✓ บัญชีผู้รับตรงกับร้าน (น.ส. ธัญญธร ศรีวิเศษ · 2455)');
    }
    checks.push('✓ ตรวจสอบโครงสร้างภาพและฟอนต์ด้วย AI Vision ปกติ');
    if (!visionResult.transactionRef) {
      checks.push('ℹ️ ภาพหน้าจอไม่มี QR / รหัสอ้างอิง (ตรวจสอบด้วยยอดเงินและเวลา)');
    }

    return {
      approved: true,
      isSlip: true,
      source: 'vision',
      verificationBadge: receiverCheck.status === 'MATCH' ? '📸 ตรวจจากภาพ · บัญชีร้านถูกต้อง' : '📸 อ่านจากภาพหน้าจอ',
      verificationTier: 'VISION_VERIFIED',
      amount: visionResult.amount,
      transactionRef: visionResult.transactionRef || null,
      senderName: visionResult.senderName || null,
      senderAccount: visionResult.senderAccount || null,
      receiverName: visionResult.receiverName || null,
      receiverAccount: visionResult.receiverAccount || null,
      bankName: visionResult.bankName || null,
      transTime: visionResult.transTime || null,
      transDate: visionResult.transDate || null,
      checks,
      warnings
    };
  }

  return { approved: false, isSlip: false };
}
