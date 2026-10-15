import { extractQrFromImage } from './qrScanner.js';

/**
 * EasySlip API Integration for In The Haus
 * Provides bank slip verification via EasySlip API (18+ Thai banks supported)
 * Docs: https://document.easyslip.com/th/guide/getting-started
 */

const DEFAULT_API_KEY = 'e0650eb6-a4c8-4e25-b109-54bf3a10256e';

export function getEasySlipApiKey() {
  return process.env.EASYSLIP_API_KEY || DEFAULT_API_KEY;
}

/**
 * Format ISO date string to Bangkok date (YYYY-MM-DD) and time (dd/MM/yyyy HH:mm น.)
 */
export function formatBangkokDateTime(isoDateString) {
  try {
    const d = isoDateString ? new Date(isoDateString) : new Date();
    // Use Intl for Asia/Bangkok
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
 * Verify a bank transfer slip using EasySlip API v2
 * Provides bank slip verification via EasySlip API (18+ Thai banks supported)
 * Docs: https://document.easyslip.com/th/
 * Accepts Buffer, base64 image, or QR payload string
 * Returns normalized slip object or error status
 */
export async function verifySlipWithEasySlip(imageInput, options = {}) {
  const apiKey = getEasySlipApiKey();
  if (!apiKey) {
    return { success: false, isSlip: false, error: 'NO_API_KEY' };
  }

  // EasySlip API v2: checkDuplicate boolean (default false to ensure full verification data)
  const checkDuplicate = options.checkDuplicate ?? false;

  let requestBody = null;
  let fallbackBase64 = null;

  // Case 1: Explicit payload passed
  if (typeof imageInput === 'object' && imageInput?.payload) {
    requestBody = { payload: imageInput.payload, checkDuplicate };
  } else if (typeof imageInput === 'string' && (imageInput.startsWith('000201') || imageInput.startsWith('004100') || (imageInput.startsWith('00') && imageInput.length >= 20 && imageInput.length <= 300))) {
    // Direct PromptPay / Bank Slip QR string
    requestBody = { payload: imageInput, checkDuplicate };
  }

  // Case 2: Buffer passed -> Fast-Path with local QR extraction
  if (!requestBody && Buffer.isBuffer(imageInput)) {
    try {
      const qrPayload = await extractQrFromImage(imageInput);
      if (qrPayload && qrPayload.length >= 20) {
        console.log('[EasySlip v2] ⚡ Fast QR Payload Mode triggered! Sending 150-byte payload instead of 3MB image.');
        requestBody = { payload: qrPayload, checkDuplicate };
      }
    } catch (qrErr) {
      console.warn('[EasySlip v2] Local QR extraction failed, fallback to base64:', qrErr?.message || qrErr);
    }
  }

  // Case 3: Fallback or raw base64 string
  if (!requestBody) {
    let base64Data = '';
    if (Buffer.isBuffer(imageInput)) {
      base64Data = imageInput.toString('base64');
    } else if (typeof imageInput === 'string') {
      base64Data = imageInput.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
    } else {
      return { success: false, isSlip: false, error: 'INVALID_INPUT_TYPE' };
    }

    if (!base64Data || base64Data.length < 50) {
      return { success: false, isSlip: false, error: 'EMPTY_IMAGE_DATA' };
    }

    requestBody = { base64: base64Data, checkDuplicate };
  }

  // Save base64 for fallback in case payload mode errors
  if (requestBody.payload && Buffer.isBuffer(imageInput)) {
    fallbackBase64 = () => imageInput.toString('base64');
  }

  try {
    const makeApiCall = async (body) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 9000);
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

    // If payload mode failed and we have fallback base64, try fallback once
    if (requestBody.payload && fallbackBase64 && (!result || result.success === false)) {
      console.log('[EasySlip v2] Payload mode unsuccessful, retrying with base64 image fallback...');
      try {
        result = await makeApiCall({ base64: fallbackBase64(), checkDuplicate });
      } catch (fbErr) {
        console.warn('[EasySlip v2] Base64 fallback error:', fbErr?.message || fbErr);
      }
    }

    // Check if EasySlip API v2 verified the bank slip
    if (result && (result.success === true || result.status === 200) && result.data) {
      const data = result.data;
      const rawSlip = data.rawSlip || data;

      const amountVal = data.amountInSlip ?? rawSlip.amount?.amount ?? (typeof rawSlip.amount === 'number' ? rawSlip.amount : 0);
      const { transDate, transTime, isoDate } = formatBangkokDateTime(rawSlip.date || data.date);

      // Sender info: EasySlip API v2 returns rawSlip.sender.account.name { th, en }
      const senderName = rawSlip.sender?.account?.name?.th || 
                         rawSlip.sender?.account?.name?.en || 
                         rawSlip.sender?.displayName || 
                         rawSlip.sender?.name || 
                         data.sender?.name || null;
      const senderBankName = rawSlip.sender?.bank?.name || rawSlip.sender?.bank?.short || data.sender?.bank?.name || null;

      // Receiver info
      const receiverName = rawSlip.receiver?.account?.name?.th || 
                           rawSlip.receiver?.account?.name?.en || 
                           rawSlip.receiver?.displayName || 
                           rawSlip.receiver?.name || 
                           data.receiver?.name || null;
      const receiverBankName = rawSlip.receiver?.bank?.name || rawSlip.receiver?.bank?.short || data.receiver?.bank?.name || null;

      // Primary bank name
      const primaryBank = senderBankName || receiverBankName || 'ธนาคารพาณิชย์';

      return {
        success: true,
        isSlip: true,
        amount: Number(amountVal),
        transactionRef: rawSlip.transRef || data.transRef || null,
        senderName: senderName ? String(senderName).trim() : null,
        receiverName: receiverName ? String(receiverName).trim() : null,
        bankName: primaryBank ? String(primaryBank).trim() : null,
        transTime: transTime,
        transDate: transDate,
        isoDate: isoDate,
        rawPayload: rawSlip.payload || data.payload || null,
        isDuplicate: Boolean(data.isDuplicate),
        source: 'easyslip',
        shortDescription: `สลิปโอนเงิน (EasySlip Verified v2): ${Number(amountVal).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท [${primaryBank}]`,
        shouldReply: true,
        rawResponse: data
      };
    }

    // In API v2, non-slip or invalid returns { success: false, error: { code, message } }
    return {
      success: false,
      isSlip: false,
      code: result?.error?.code || result?.status || 'VERIFICATION_FAILED',
      message: result?.error?.message || result?.message || 'EasySlip verification returned unsuccessful'
    };

  } catch (error) {
    console.warn('[EasySlip v2] API call failed, will fallback to Gemini Vision:', error.message);
    return {
      success: false,
      isSlip: false,
      code: 'NETWORK_OR_TIMEOUT',
      message: error.message
    };
  }
}
