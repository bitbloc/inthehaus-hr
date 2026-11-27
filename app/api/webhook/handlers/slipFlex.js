/* LINE Flex cards for the slip check (Brand v2 · Thai Twist Modern).
 * Colours are the brand hex values (Flex takes hex only); see
 * inthehaus-booking/.agents/AGENTS.md §2. Red is used only for the
 * rejected cards (duplicate / suspicious). No icons or emoji in the card.
 * LINE Flex sizes: xs 13px · sm 14px · md 16px · lg 19px · xl 22px · 3xl 35px.
 * Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */

import { BRAND } from '@/utils/brand';

// Re-exported for the cards that already import it from here.
export { BRAND };

/** Strip emoji / pictographs so card text stays typographic. */
export const plain = (s) =>
  String(s ?? '')
    .replace(/[\p{Extended_Pictographic}️‍]/gu, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

export const baht = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const text = (t, opts = {}) => ({ type: 'text', text: String(t ?? '-') || '-', wrap: true, ...opts });
const rule = (margin = 'lg') => ({ type: 'separator', margin, color: BRAND.rule });

/** Label on the left, value on the right. */
const row = (label, value, { color = BRAND.charcoal, bold = false, size = 'md' } = {}) => ({
  type: 'box',
  layout: 'horizontal',
  margin: 'md',
  spacing: 'md',
  contents: [
    text(label, { size: 'sm', color: BRAND.neutral, flex: 4 }),
    text(value, { size, color, weight: bold ? 'bold' : 'regular', flex: 6, align: 'end' }),
  ],
});

/** Solid-colour header band: small Thai tag, then the title. */
const header = ({ bg, tag, title, sub }) => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: bg,
  paddingAll: '16px',
  contents: [
    text(tag, { size: 'xs', color: bg === BRAND.plum ? BRAND.onPlum2 : BRAND.cream }),
    text(title, { size: 'lg', weight: 'bold', color: BRAND.cream, margin: 'sm' }),
    ...(sub ? [text(sub, { size: 'sm', color: BRAND.cream, margin: 'sm' })] : []),
  ],
});

const note = (title, lines, { titleColor = BRAND.charcoal, bg = BRAND.paper2 } = {}) => ({
  type: 'box',
  layout: 'vertical',
  backgroundColor: bg,
  paddingAll: '12px',
  margin: 'lg',
  contents: [
    text(title, { size: 'sm', weight: 'bold', color: titleColor }),
    ...lines.map((l) => text(l, { size: 'sm', color: BRAND.muted, margin: 'sm' })),
  ],
});

const bubble = (head, bodyContents) => ({
  type: 'bubble',
  size: 'mega',
  styles: { header: { backgroundColor: head.backgroundColor }, body: { backgroundColor: BRAND.cream } },
  header: head,
  body: { type: 'box', layout: 'vertical', paddingAll: '16px', contents: bodyContents },
});

/** Slip accepted and saved. */
export function buildSlipSuccessFlex({
  amount, tierLabel, isBankVerified, isPastDateSlip, dateStr, todayStr,
  bank, sender, transferTime, receiver, operator, ref, checks,
}) {
  return {
    type: 'flex',
    altText: `บันทึกยอดโอน ${baht(amount)} บาทแล้ว`,
    contents: bubble(
      header({ bg: BRAND.plum, tag: 'ตรวจสลิป', title: 'บันทึกยอดโอนแล้ว' }),
      [
        text('ยอดเงิน', { size: 'sm', color: BRAND.neutral }),
        {
          type: 'text',
          margin: 'xs',
          contents: [
            { type: 'span', text: baht(amount), size: '3xl', weight: 'bold', color: BRAND.charcoal },
            { type: 'span', text: ' บาท', size: 'md', color: BRAND.muted },
          ],
        },
        text(plain(tierLabel), { size: 'sm', weight: 'bold', color: isBankVerified ? BRAND.plum : BRAND.muted, margin: 'sm' }),

        ...(isPastDateSlip ? [{
          type: 'box',
          layout: 'vertical',
          backgroundColor: BRAND.plum,
          paddingAll: '12px',
          margin: 'lg',
          contents: [
            text(`วันที่บนสลิปคือ ${dateStr} ไม่ใช่วันนี้ (${todayStr}) ตรวจเวลาโอนอีกครั้ง`, { size: 'sm', weight: 'bold', color: BRAND.cream }),
          ],
        }] : []),

        rule(),
        row('ธนาคาร', bank || 'ไม่ระบุ'),
        row('ผู้โอน', sender || 'ไม่ระบุ'),
        row('เวลาโอน', transferTime),
        ...(receiver ? [row('บัญชีผู้รับ', receiver)] : []),
        row('ผู้บันทึก', operator || 'ไม่ระบุ', { bold: true }),
        row('เลขอ้างอิง', ref, { size: 'sm', color: BRAND.muted }),

        note('ผลการตรวจ', checks.map(plain).filter(Boolean)),
      ]
    ),
  };
}

/** Same slip already saved (or flagged by the bank network). */
export function buildDuplicateFlex({ amount, isNetworkDuplicate, ref, originalSender, firstSavedAt, originalOperator, resender }) {
  return {
    type: 'flex',
    altText: `สลิปซ้ำ ไม่บันทึก: ยอด ${baht(amount)} บาท`,
    contents: bubble(
      header({ bg: BRAND.errorRed, tag: 'ตรวจสลิป', title: 'สลิปซ้ำ ไม่บันทึก' }),
      [
        text(
          isNetworkDuplicate
            ? `สลิปยอด ${baht(amount)} บาท นี้เคยถูกใช้หรือตรวจไปแล้วในระบบธนาคาร`
            : `สลิปยอด ${baht(amount)} บาท นี้บันทึกเข้าระบบไปแล้ว`,
          { size: 'md', color: BRAND.charcoal }
        ),
        rule(),
        row('เลขอ้างอิง', ref, { size: 'sm' }),
        row('ยอดเดิม', `${baht(amount)} บาท`, { bold: true }),
        ...(originalSender ? [row('ผู้โอนเดิม', originalSender)] : []),
        row('บันทึกครั้งแรก', firstSavedAt, { size: 'sm' }),
        row('ผู้บันทึกเดิม', originalOperator, { bold: true }),
        note(`ส่งซ้ำโดย พี่${resender}`, ['ยูซุไม่ให้ใช้สลิปเดิมซ้ำ เพื่อให้ยอดเงินของร้านถูกต้องครับ'], { titleColor: BRAND.errorRed }),
      ]
    ),
  };
}

/** Fake, edited, wrong-receiver or unverifiable slip. */
export function buildFakeSlipFlex({
  alertTitle, isWrongReceiver, fakeReason, checks, ref, amount, bankVerifiedAmount,
  bank, customerSender, receiver, submitter, shopAccountLabel,
}) {
  return {
    type: 'flex',
    altText: `สลิปต้องสงสัย: ${plain(alertTitle)}`,
    contents: bubble(
      header({
        bg: BRAND.errorRed,
        tag: 'แจ้งเตือนความปลอดภัย',
        title: plain(alertTitle),
        sub: isWrongReceiver ? 'ไม่บันทึก: บัญชีผู้รับไม่ใช่บัญชีร้าน' : 'ไม่บันทึก: ข้อมูลไม่ผ่านการตรวจความปลอดภัย',
      }),
      [
        text('สาเหตุ', { size: 'sm', weight: 'bold', color: BRAND.errorRed }),
        text(plain(fakeReason), { size: 'md', color: BRAND.charcoal, margin: 'xs' }),
        ...checks.map(plain).filter(Boolean).map((l) => text(l, { size: 'sm', color: BRAND.muted, margin: 'sm' })),

        rule(),
        row('เลขอ้างอิง', ref || 'ไม่พบในระบบธนาคาร', { size: 'sm' }),
        ...(amount ? [row('ยอดบนสลิป', `${baht(amount)} บาท`, { bold: true })] : []),
        ...(bankVerifiedAmount ? [row('ยอดจริงใน QR', `${baht(bankVerifiedAmount)} บาท`, { bold: true })] : []),
        ...(bank ? [row('ธนาคารที่อ้าง', bank)] : []),
        ...(customerSender ? [row('ผู้โอนในสลิป', customerSender)] : []),
        ...(receiver ? [row('ผู้รับในสลิป', receiver, { bold: true, color: isWrongReceiver ? BRAND.errorRed : BRAND.charcoal })] : []),
        row('ผู้ส่งภาพ', `พี่${submitter}`, { bold: true }),

        note('ทีมหน้าร้านทำอย่างไร', [
          `1. ให้ลูกค้าเปิดประวัติการโอนในแอปธนาคาร แล้วดูว่าโอนเข้า "${shopAccountLabel}" จริง`,
          '2. หรือให้ลูกค้าสแกน QR รับเงินของร้านแล้วโอนใหม่',
        ], { titleColor: BRAND.plum }),
      ]
    ),
  };
}
