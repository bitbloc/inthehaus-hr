// Brand v2 colours for Yuzu's LINE Flex cards.
// LINE Flex only takes hex, so these mirror the hex column of the shop's design system
// (the same values the Haustable bot and web apps use).
//
// Rules:
// - plum is the signature (headers, highlights); charcoal is ink and the one primary button
// - red only for errors and destructive states (late, rejected, cancelled, failed)
// - no green, orange or neon accents; no pure white or black
// - every text pair at contrast 4.5:1 or better
export const BRAND = {
  plum: '#41032A',
  plum2: '#571C3E',
  plum3: '#6E3855', // dividers on plum, never text
  onPlum2: '#D0B5C1', // secondary text on plum (8.70:1)
  charcoal: '#1A1A1A', // ink on light surfaces, primary button fill
  charcoal2: '#292527',
  cream: '#F6F2EA', // light surface, text on plum / charcoal
  paper2: '#ECE4E7', // raised light surface
  paper3: '#E3D9DE',
  rule: '#D4CBCF', // 1px dividers on light surfaces
  neutral: '#635B5F', // labels, helper text (5.89:1 on cream)
  muted: '#524A4E', // secondary text (7.68:1 on cream)
  errorRed: '#B42318', // errors and destructive only
};

// Shop logo, small in the top corner of every Flex header.
// Cream on plum / charcoal headers, plum on light headers (LINE needs an https PNG).
export const LOGO_BASE = 'https://lxfavbzmebqqsffgyyph.supabase.co/storage/v1/object/public/public-assets/brand';
export const LOGO_URL = { cream: `${LOGO_BASE}/line-logo-cream.png`, plum: `${LOGO_BASE}/line-logo-plum.png` };
const LOGO_RATIO = '360:82';

function isDarkHex(hex) {
  const m = /^#?([0-9a-f]{6})/i.exec(String(hex || ''));
  if (!m) return false; // no background = LINE's light default
  const n = parseInt(m[1], 16);
  const lum = (0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)) / 255;
  return lum < 0.5;
}

const GRAVITY_TYPES = new Set(['text', 'image', 'icon']);

function logoBubble(bubble) {
  const header = bubble?.header;
  if (!header || header.type !== 'box' || !Array.isArray(header.contents)) return bubble;
  if (JSON.stringify(header).includes(LOGO_BASE)) return bubble; // never twice
  const bg = header.backgroundColor || bubble.styles?.header?.backgroundColor;
  const url = isDarkHex(bg) ? LOGO_URL.cream : LOGO_URL.plum;
  const logo = { type: 'image', url, size: '56px', aspectRatio: LOGO_RATIO, aspectMode: 'fit', flex: 0, gravity: 'center' };

  if (header.layout === 'horizontal') {
    return { ...bubble, header: { ...header, contents: [...header.contents, logo] } };
  }
  if (header.layout !== 'vertical') {
    // baseline boxes cannot hold an image: keep the row as is, logo beside it
    return {
      ...bubble,
      header: { ...header, layout: 'horizontal', contents: [{ type: 'box', layout: header.layout, flex: 1, contents: header.contents }, logo] },
    };
  }
  // The logo sits on the title's row, right-aligned, so both share one line.
  const [first, ...rest] = header.contents;
  let titleRow;
  if (first?.type === 'box' && first.layout === 'horizontal') {
    titleRow = { ...first, contents: [...first.contents, logo] };
  } else if (first) {
    const { margin, ...firstNoMargin } = first;
    const item = { ...firstNoMargin, flex: 1 };
    if (GRAVITY_TYPES.has(item.type)) item.gravity = 'center';
    titleRow = {
      type: 'box', layout: 'horizontal', spacing: 'md', alignItems: 'center',
      ...(margin ? { margin } : {}),
      contents: [item, logo],
    };
  } else {
    titleRow = { type: 'box', layout: 'horizontal', contents: [{ type: 'filler' }, logo] };
  }
  return { ...bubble, header: { ...header, contents: [titleRow, ...rest] } };
}

function logoMessage(m) {
  if (m?.type !== 'flex' || !m.contents) return m;
  const c = m.contents;
  if (c.type === 'bubble') return { ...m, contents: logoBubble(c) };
  if (c.type === 'carousel' && Array.isArray(c.contents)) return { ...m, contents: { ...c, contents: c.contents.map(logoBubble) } };
  return m;
}

// Adds the shop logo to every Flex bubble (and carousel bubble) in one message or an array.
export function withShopLogo(messagesOrMessage) {
  if (Array.isArray(messagesOrMessage)) return messagesOrMessage.map(logoMessage);
  return logoMessage(messagesOrMessage);
}
