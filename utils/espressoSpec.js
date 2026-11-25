/* Shop espresso standard (medium roast) and the Thai words for each status.
 * One source for the LINE card (espressoFlex) and the back-office report.
 * The Gemini prompt in utils/gemini.js states the same numbers. */

export const ESPRESSO_SPEC = {
    dose: { label: 'ผงกาแฟ', unit: 'g', min: 18, max: 20 },
    yield: { label: 'น้ำกาแฟ', unit: 'ml', min: 35, max: 40 },
    firstDrop: { label: 'หยดแรก', unit: 'วิ', min: 3.5, max: 5.5 },
    totalTime: { label: 'เวลาสกัด', unit: 'วิ', min: 25, max: 30 },
};

export const STATUS_TH = {
    OK: 'ผ่าน',
    LOW: 'น้อยไป',
    HIGH: 'มากไป',
    FAST: 'เร็วไป',
    SLOW: 'ช้าไป',
    NOT_SPECIFIED: 'ไม่ได้แจ้ง',
};

export const isOff = (status) => ['LOW', 'HIGH', 'FAST', 'SLOW'].includes(status);

/** "18–20 g" */
export const specText = (key) => {
    const s = ESPRESSO_SPEC[key];
    return `${s.min}–${s.max} ${s.unit}`;
};

/** Number without trailing .0, e.g. 19 · 19.3 */
export const num = (v) => {
    const n = Number(v);
    if (v === null || v === undefined || v === '' || !Number.isFinite(n)) return null;
    return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '');
};

/**
 * One-line verdict for a shot. Total time decides first, because it is the
 * number the grind fixes; the other three only add "ดูจุดอื่นด้วย".
 * Missing numbers never count as a fault.
 */
export function shotVerdict({ dose, yieldStatus, firstDrop, totalTime }) {
    if (totalTime === 'FAST') return { key: 'FAST', text: 'ไหลเร็วเกินเกณฑ์', off: true };
    if (totalTime === 'SLOW') return { key: 'SLOW', text: 'ไหลช้าเกินเกณฑ์', off: true };
    if ([dose, yieldStatus, firstDrop].some(isOff)) return { key: 'CHECK', text: 'เวลาผ่าน มีจุดต้องดู', off: true };
    if (totalTime !== 'OK') return { key: 'PARTIAL', text: 'ข้อมูลไม่ครบ', off: false };
    return { key: 'OK', text: 'ผ่านเกณฑ์', off: false };
}

/** Start of today in Bangkok, as an ISO string (server runs in UTC). */
export function bangkokDayStartISO(now = new Date()) {
    const bkk = new Date(now.getTime() + 7 * 3600_000);
    const y = bkk.getUTCFullYear(), m = bkk.getUTCMonth(), d = bkk.getUTCDate();
    return new Date(Date.UTC(y, m, d) - 7 * 3600_000).toISOString();
}

/**
 * Status of a stored value against the current standard (for reports, so
 * older shots are judged by today's numbers). Falls back to the stored status
 * when there is no value.
 */
export function judge(key, value, stored) {
    const n = Number(value);
    if (!(n > 0)) return stored || 'NOT_SPECIFIED';
    const s = ESPRESSO_SPEC[key];
    const timed = key === 'firstDrop' || key === 'totalTime';
    if (n < s.min) return timed ? 'FAST' : 'LOW';
    if (n > s.max) return timed ? 'SLOW' : 'HIGH';
    return 'OK';
}
