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
 * Verify a bank transfer slip using EasySlip
 * Accepts base64 image (with or without data URI prefix) or Buffer
 * Returns normalized slip object or error status
 */
export async function verifySlipWithEasySlip(imageInput, options = {}) {
  const apiKey = getEasySlipApiKey();
  if (!apiKey) {
    return { success: false, isSlip: false, error: 'NO_API_KEY' };
  }

  let base64Data = '';
  if (Buffer.isBuffer(imageInput)) {
    base64Data = imageInput.toString('base64');
  } else if (typeof imageInput === 'string') {
    // Strip data URI scheme if present: data:image/jpeg;base64, ...
    base64Data = imageInput.replace(/^data:image\/[a-zA-Z]+;base64,/, '').trim();
  } else {
    return { success: false, isSlip: false, error: 'INVALID_INPUT_TYPE' };
  }

  if (!base64Data || base64Data.length < 50) {
    return { success: false, isSlip: false, error: 'EMPTY_IMAGE_DATA' };
  }

  const checkDuplicate = options.checkDuplicate ?? true;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000); // 9-second timeout safeguard

    const response = await fetch('https://api.easyslip.com/v1/verify', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        image: base64Data,
        checkDuplicate
      }),
      signal: controller.signal
    });
    clearTimeout(timeout);

    const result = await response.json();

    // Check if EasySlip verified the bank slip
    if (result && result.status === 200 && result.data) {
      const data = result.data;
      const amountVal = data.amount?.amount ?? (typeof data.amount === 'number' ? data.amount : 0);
      const { transDate, transTime, isoDate } = formatBangkokDateTime(data.date);

      // Sender info
      const senderName = data.sender?.account?.name?.th || 
                         data.sender?.account?.name?.en || 
                         data.sender?.displayName || 
                         data.sender?.name || null;
      const senderBankName = data.sender?.bank?.name || data.sender?.bank?.short || null;

      // Receiver info
      const receiverName = data.receiver?.account?.name?.th || 
                           data.receiver?.account?.name?.en || 
                           data.receiver?.displayName || 
                           data.receiver?.name || null;
      const receiverBankName = data.receiver?.bank?.name || data.receiver?.bank?.short || null;

      // Primary bank name
      const primaryBank = senderBankName || receiverBankName || 'ธนาคารพาณิชย์';

      return {
        success: true,
        isSlip: true,
        amount: Number(amountVal),
        transactionRef: data.transRef || null,
        senderName: senderName ? String(senderName).trim() : null,
        receiverName: receiverName ? String(receiverName).trim() : null,
        bankName: primaryBank ? String(primaryBank).trim() : null,
        transTime: transTime,
        transDate: transDate,
        isoDate: isoDate,
        rawPayload: data.payload || null,
        isDuplicate: Boolean(data.isDuplicate),
        source: 'easyslip',
        shortDescription: `สลิปโอนเงิน (EasySlip Verified): ${Number(amountVal).toLocaleString('th-TH', { minimumFractionDigits: 2 })} บาท [${primaryBank}]`,
        shouldReply: true,
        rawResponse: data
      };
    }

    // EasySlip indicated no QR code found (e.g. food, espresso shot, cat, or non-QR slip)
    if (result && (result.status === 404 || result.message === 'qrcode_not_found')) {
      return {
        success: false,
        isSlip: false,
        code: 'QRCODE_NOT_FOUND',
        message: 'No bank QR code found in image'
      };
    }

    // Duplicate slip reported by EasySlip
    if (result && (result.status === 409 || result.message === 'duplicate_slip')) {
      return {
        success: false,
        isSlip: true,
        isDuplicate: true,
        code: 'DUPLICATE_SLIP',
        message: result.message || 'Duplicate slip detected by EasySlip network'
      };
    }

    // Other non-fatal response
    return {
      success: false,
      isSlip: false,
      code: result.status || 'VERIFICATION_FAILED',
      message: result.message || 'EasySlip verification returned non-200'
    };

  } catch (error) {
    console.warn('[EasySlip] API call failed, will fallback to Gemini Vision:', error.message);
    return {
      success: false,
      isSlip: false,
      code: 'NETWORK_OR_TIMEOUT',
      message: error.message
    };
  }
}
