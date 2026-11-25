/* Small helpers shared by the monthly reports (espresso, slips).
 * All dates are Bangkok wall-clock; the server and DB store UTC. */

export const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
export const DAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** Bangkok wall-clock parts of an ISO timestamp. */
export function bkk(iso) {
    const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
    return {
        key: d.toISOString().slice(0, 10),
        day: d.getUTCDate(),
        dow: d.getUTCDay(),
        time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    };
}

/** UTC bounds of a Bangkok calendar month "yyyy-MM", plus its first/last date strings. */
export function monthBounds(month) {
    const [y, m] = month.split("-").map(Number);
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return {
        start: new Date(Date.UTC(y, m - 1, 1) - 7 * 3600_000).toISOString(),
        end: new Date(Date.UTC(y, m, 1) - 7 * 3600_000).toISOString(),
        firstDate: `${month}-01`,
        lastDate: `${month}-${String(last).padStart(2, "0")}`,
    };
}

export const thisMonth = () => bkk(new Date().toISOString()).key.slice(0, 7);

export function monthLabel(month) {
    const [y, m] = month.split("-").map(Number);
    return `${MONTHS_TH[m - 1]} ${y + 543}`;
}

/** Day label for a "yyyy-MM-dd" date string: "จ. 3" */
export function dayLabel(dateStr) {
    const d = new Date(`${dateStr}T00:00:00Z`);
    return `${DAYS_TH[d.getUTCDay()]} ${d.getUTCDate()}`;
}

export const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
export const baht = (n) => Number(n || 0).toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Map LINE ids / employee ids to an employee name. */
export function employeeNamer(employees) {
    const map = new Map();
    for (const e of employees || []) {
        for (const k of [e.id, e.line_bot_id, e.line_user_id]) if (k) map.set(String(k).toLowerCase(), e);
    }
    return (uid, fallback = "ไม่ทราบชื่อ") => {
        const e = uid ? map.get(String(uid).toLowerCase()) : null;
        return e ? e.nickname || e.name : fallback;
    };
}

export function Stat({ label, value, sub }) {
    return (
        <div className="bg-cream p-4">
            <p className="text-sm text-neutral">{label}</p>
            <p className="font-num text-2xl text-charcoal mt-1">{value}</p>
            {sub && <p className="text-sm text-neutral mt-0.5">{sub}</p>}
        </div>
    );
}

/** Shared A4 print rules for report documents. */
export const PRINT_CSS = `
    @page { size: A4 portrait; margin: 12mm; }
    .doc { max-width: 210mm; }
    @media print {
        .no-print { display: none !important; }
        html, body, .print-root { background: #fff !important; }
        .doc { max-width: none; border: none !important; padding: 0 !important; margin: 0 !important; background: #fff !important; }
        .doc .bg-cream { background: #fff !important; }
        .overflow-x-auto { overflow: visible !important; }
        table { min-width: 0 !important; }
        .avoid-break, tr { break-inside: avoid; page-break-inside: avoid; }
        .print-break-before { break-before: page; page-break-before: always; }
        thead { display: table-header-group; }
        body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    }
`;
