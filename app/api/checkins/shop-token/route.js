import { NextResponse } from 'next/server';
import crypto from 'crypto';

const SHOP_SECRET = process.env.CHANNEL_SECRET || 'inthehaus_secure_shop_token_2026';

/**
 * Generate a rotating time-based token for the Shop Tablet/POS screen (valid for 30s)
 */
export function generateShopToken(timeWindow = null) {
  const currentWindow = timeWindow || Math.floor(Date.now() / (15 * 1000)); // 15-second window
  const hmac = crypto.createHmac('sha256', SHOP_SECRET);
  hmac.update(`ITH_SHOP_${currentWindow}`);
  return `ITH_${hmac.digest('hex').substring(0, 16).toUpperCase()}`;
}

/**
 * Verify a token (checks current window and previous window for latency tolerance)
 */
export function verifyShopToken(token) {
  if (!token || typeof token !== 'string') return false;
  const currentWindow = Math.floor(Date.now() / (15 * 1000));
  
  // Check current window and previous 2 windows (up to 45s tolerance)
  for (let offset = 0; offset <= 2; offset++) {
    const expected = generateShopToken(currentWindow - offset);
    if (token.trim().toUpperCase() === expected) {
      return true;
    }
  }
  return false;
}

export async function GET() {
  try {
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
