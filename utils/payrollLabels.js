// Thai labels and formatting shared by the payroll page and the payroll PDF/payslips.

export const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const money = (n) => Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const hrs = (n) => (n > 0 ? Number(n).toFixed(1) : '-');
export const awayFmt = (m) => `${Math.floor(m / 60) > 0 ? `${Math.floor(m / 60)} ชม. ` : ''}${m % 60} น.`;

export const WAGE_TH = { monthly: 'รายเดือน', daily: 'รายกะ', hourly: 'รายชั่วโมง' };
export const ADJ_TH = { deduction: 'หักเงิน', advance: 'เบิกล่วงหน้า', bonus: 'โบนัส' };

/** Reason text without the legacy "[โบนัส] / [เบิกล่วงหน้า]" type prefix. */
export const adjReason = (a) => (a?.reason || '').replace(/^\[(โบนัส|เบิกล่วงหน้า)\]\s*/, '');

/** Shift label from the engine ("10:00-18:00 (กะเช้า ☀️)") → "10:00–18:00 (กะเช้า)". */
export const shiftText = (shift) => {
    if (shift === 'OFF') return 'หยุด';
    if (shift === 'UNSCHEDULED') return 'ไม่มีกะ';
    return String(shift || '')
        .replace(/[\p{Extended_Pictographic}️]/gu, '')
        .replace(/(\d{2}:\d{2})-(\d{2}:\d{2})/g, '$1–$2')
        .replace(/\s+\)/g, ')')
        .replace(/\s{2,}/g, ' ')
        .trim();
};

/** Day status code from utils/payroll.js → Thai label + tone (ok | warn | info | mute). */
export const statusInfo = (status) => {
    const s = String(status || '');
    const late = s.match(/^LATE \(\+(\d+)M\)/);
    if (late) return { label: `สาย ${late[1]} น.`, tone: 'warn' };
    const map = {
        'NORMAL': ['ปกติ', 'ok'],
        'IN PROGRESS': ['กำลังทำงาน', 'mute'],
        'MISSED CHECK-OUT': ['ลืมลงเวลาออก · จ่ายถึงเลิกกะ', 'warn'],
        'MISSED CHECK-IN': ['ลืมลงเวลาเข้า · ไม่จ่าย', 'warn'],
        'ABSENT': ['ขาดงาน', 'warn'],
        'SCHEDULED': ['ยังไม่ถึงวัน', 'mute'],
        'PENDING': ['วันนี้', 'mute'],
        'EXEMPT': ['ยกเว้น', 'mute'],
        'OFF': ['หยุด', 'mute'],
        'OFF-DAY WORK': ['มาทำวันหยุด', 'info'],
        'MISSED CHECK-OUT (OFF-DAY)': ['วันหยุด · ลืมลงเวลาออก', 'warn'],
        'MISSED CHECK-IN (OFF-DAY)': ['วันหยุด · ลืมลงเวลาเข้า', 'warn'],
        'UNSCHEDULED WORK': ['มาโดยไม่มีกะ', 'info'],
        'MISSED CHECK-OUT (UNSCHEDULED)': ['ไม่มีกะ · ลืมลงเวลาออก', 'warn'],
        'MISSED CHECK-IN (UNSCHEDULED)': ['ไม่มีกะ · ลืมลงเวลาเข้า', 'warn'],
    };
    const [label, tone] = map[s] || [s, 'mute'];
    return { label, tone };
};

export const isException = (d) => ['warn', 'info'].includes(statusInfo(d.status).tone);

/** Short Thai flags for a person's month ("ลืมลงเวลา 1 · ขาด 3 · …"). */
export const flagsOf = (item) => [
    item.incompleteCount > 0 && `ลืมลงเวลา ${item.incompleteCount}`,
    item.absentCount > 0 && `ขาด ${item.absentCount}`,
    item.lateCount > 0 && `สาย ${item.lateCount}`,
    item.offDayWorkCount > 0 && `ทำวันหยุด ${item.offDayWorkCount}`,
].filter(Boolean);

/** "พฤศจิกายน 2569" from "2026-11". */
export const thaiMonth = (yyyyMm) => {
    const [y, m] = String(yyyyMm).split('-').map(Number);
    const name = new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('th-TH', { month: 'long', timeZone: 'Asia/Bangkok' });
    return `${name} ${y + 543}`;
};
