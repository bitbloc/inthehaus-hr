import { NextResponse } from 'next/server';
import crypto from 'crypto';

const SHOP_SECRET = process.env.CHANNEL_SECRET || 'inthehaus_secure_shop_token_2026';
const NFC_KEY_VERSION = process.env.NFC_KEY_VERSION || 'V1';

export const DEFAULT_NFC_STATIONS = [
  {
    stationId: 'BAR_PUNCH',
    name: 'เคาน์เตอร์บาร์ (จุดลงเวลาหลัก)',
    category: 'ATTENDANCE',
    zone: 'BAR',
    targetPath: '/checkin',
    description: 'แตะเพื่อลงเวลาเข้า-ออกงานทันที (ยืนยันพิกัดร้านผ่านแผ่น NFC โดยไม่ต้องรอสัญญาณ GPS)'
  },
  {
    stationId: 'KITCHEN_PUNCH',
    name: 'โซนห้องครัว (จุดลงเวลาหลังบ้าน)',
    category: 'ATTENDANCE',
    zone: 'KITCHEN',
    targetPath: '/checkin',
    description: 'แตะเพื่อลงเวลาเข้า-ออกงานสำหรับทีมครัว (แก้ปัญหาอับสัญญาณ GPS ในห้องครัว)'
  },
  {
    stationId: 'ESPRESSO_CAL',
    name: 'เครื่องชงกาแฟ Espresso (Calibration Log)',
    category: 'ESPRESSO',
    zone: 'ESPRESSO',
    targetPath: '/checklist',
    description: 'แตะที่เครื่องชงเพื่อเปิดฟอร์มบันทึกช็อตกาแฟตอนเช้า (Dose / Yield / Time / รสชาติ)'
  },
  {
    stationId: 'SOP_BAR',
    name: 'เช็กลิสต์โซนบาร์น้ำ (Bar SOP)',
    category: 'CHECKLIST',
    zone: 'BAR',
    targetPath: '/checklist',
    description: 'แตะยืนยันการเดินตรวจความสะอาดและอุปกรณ์โซนบาร์น้ำ (เปิด-ปิดร้าน)'
  },
  {
    stationId: 'SOP_KITCHEN',
    name: 'เช็กลิสต์โซนครัว & ถังดักไขมัน (Kitchen SOP)',
    category: 'CHECKLIST',
    zone: 'KITCHEN',
    targetPath: '/checklist',
    description: 'แตะยืนยันการตรวจเตาแก๊ส ตู้แช่ และความสะอาดห้องครัว'
  },
  {
    stationId: 'SOP_HALL',
    name: 'เช็กลิสต์โซนที่นั่งลูกค้า & ห้องน้ำ (Floor & Restroom)',
    category: 'CHECKLIST',
    zone: 'HALL',
    targetPath: '/checklist',
    description: 'แตะยืนยันการตรวจความเรียบร้อยโซนโต๊ะอาหาร แอร์ และห้องน้ำ'
  },
  {
    stationId: 'SOP_CLOSING',
    name: 'จุดสับคัตเอาต์ไฟ & ล็อกประตูหน้าร้าน (Final Lockup)',
    category: 'CHECKLIST',
    zone: 'CLOSING',
    targetPath: '/checklist',
    description: 'แตะจุดสุดท้ายก่อนออกจากร้านเพื่อยืนยันการปิดไฟ ปิดแอร์ และล็อกประตู'
  },
  {
    stationId: 'STOCK_BAR',
    name: 'ตู้แช่ & ชั้นสต็อกบาร์น้ำ (Bar Inventory)',
    category: 'STOCK',
    zone: 'BAR',
    targetPath: '/stock/audit',
    description: 'แตะหน้าตู้แช่บาร์เพื่อเปิดหน้านับสต็อกเฉพาะวัตถุดิบหมวดบาร์น้ำและกาแฟ'
  },
  {
    stationId: 'STOCK_KITCHEN',
    name: 'ตู้แช่แข็ง & สต็อกครัว (Kitchen Inventory)',
    category: 'STOCK',
    zone: 'KITCHEN',
    targetPath: '/stock/audit',
    description: 'แตะหน้าตู้แช่ครัวเพื่อเปิดหน้านับสต็อกเฉพาะวัตถุดิบอาหารสดและของแห้งครัว'
  }
];

/**
 * Generate a rotating time-based token for the Shop Tablet/POS screen (valid for 15-45s)
 */
export function generateShopToken(timeWindow = null) {
  const currentWindow = timeWindow || Math.floor(Date.now() / (15 * 1000)); // 15-second window
  const hmac = crypto.createHmac('sha256', SHOP_SECRET);
  hmac.update(`ITH_SHOP_${currentWindow}`);
  return `ITH_${hmac.digest('hex').substring(0, 16).toUpperCase()}`;
}

/**
 * Verify a rotating QR token (checks current window and previous 2 windows for latency tolerance)
 */
export function verifyShopToken(token) {
  if (!token || typeof token !== 'string') return false;
  const currentWindow = Math.floor(Date.now() / (15 * 1000));
  
  for (let offset = 0; offset <= 2; offset++) {
    const expected = generateShopToken(currentWindow - offset);
    if (token.trim().toUpperCase() === expected) {
      return true;
    }
  }
  return false;
}

/**
 * Generate a permanent HMAC-signed token for a physical NFC Tag Station
 */
export function generateNfcStationToken(stationId = 'BAR_PUNCH') {
  const cleanId = String(stationId).trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
  const hmac = crypto.createHmac('sha256', SHOP_SECRET);
  hmac.update(`ITH_NFC_${NFC_KEY_VERSION}_${cleanId}`);
  const sig = hmac.digest('hex').substring(0, 16).toUpperCase();
  return `NFC_${cleanId}_${sig}`;
}

/**
 * Verify a physical NFC Tag Station token
 * Returns { valid: boolean, stationId: string | null }
 */
export function verifyNfcStationToken(token, explicitStationId = null) {
  if (!token || typeof token !== 'string') {
    return { valid: false, stationId: null };
  }
  const normalized = token.trim().toUpperCase();

  // Format: NFC_<STATION_ID>_<16_CHAR_HEX_SIG>
  if (normalized.startsWith('NFC_')) {
    const lastUnderscore = normalized.lastIndexOf('_');
    if (lastUnderscore > 4) {
      const extractedStation = normalized.substring(4, lastUnderscore);
      const expectedToken = generateNfcStationToken(extractedStation);
      if (normalized === expectedToken) {
        return { valid: true, stationId: extractedStation };
      }
    }
  }

  if (explicitStationId) {
    const cleanStation = String(explicitStationId).trim().toUpperCase();
    const expectedToken = generateNfcStationToken(cleanStation);
    if (normalized === expectedToken) {
      return { valid: true, stationId: cleanStation };
    }
  }

  return { valid: false, stationId: null };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode = searchParams.get('mode');
    const customStation = searchParams.get('station');

    if (mode === 'nfc') {
      const liffId = process.env.NEXT_PUBLIC_LIFF_ID || '2008567449-W868y8RY';
      const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'https://inthehaus-hr.vercel.app';

      let stationsList = [...DEFAULT_NFC_STATIONS];
      if (customStation) {
        const cleanCustom = customStation.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, '');
        if (cleanCustom && !stationsList.some(s => s.stationId === cleanCustom)) {
          stationsList.unshift({
            stationId: cleanCustom,
            name: `จุดแตะ NFC กำหนดเอง (${cleanCustom})`,
            category: 'ATTENDANCE',
            zone: cleanCustom,
            targetPath: '/checkin',
            description: 'จุดแตะบัตร NFC ที่สร้างขึ้นเพิ่มเติม'
          });
        }
      }

      const enrichedStations = stationsList.map((st) => {
        const nfcToken = generateNfcStationToken(st.stationId);
        const query = `nfc_station=${encodeURIComponent(st.stationId)}&nfc_token=${encodeURIComponent(nfcToken)}&zone=${encodeURIComponent(st.zone)}`;
        const directUrl = `${baseUrl}${st.targetPath}?${query}`;
        // For attendance (/checkin), LIFF root URL works directly with query params
        const liffUrl = st.targetPath === '/checkin'
          ? `https://liff.line.me/${liffId}?${query}`
          : directUrl;

        return {
          ...st,
          nfcToken,
          directUrl,
          liffUrl
        };
      });

      return NextResponse.json({
        success: true,
        keyVersion: NFC_KEY_VERSION,
        stations: enrichedStations
      });
    }

    const token = generateShopToken();
    const expiresIn = 15 - Math.floor((Date.now() / 1000) % 15);

    return NextResponse.json({
      success: true,
      token,
      expiresInSeconds: expiresIn,
      shopName: "In The Haus (Nakhon Phanom)",
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
