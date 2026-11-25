"use client";
/* Brand v2 · monthly espresso test-shot report (A4 print / Save as PDF).
 * Reads the structured rows in espresso_logs (written by the LINE webhook),
 * not the chat text, so every number and status matches the LINE card.
 * Photos still come from yuzu_chat_history (image notes within 5 minutes). */

import { useState, useEffect, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { ESPRESSO_SPEC, STATUS_TH, isOff, specText, num, shotVerdict } from "../../../../utils/espressoSpec";

const MONTHS_TH = ["มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"];
const DAYS_TH = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** Bangkok wall-clock parts of an ISO timestamp. */
function bkk(iso) {
    const d = new Date(new Date(iso).getTime() + 7 * 3600_000);
    return {
        key: d.toISOString().slice(0, 10),
        day: d.getUTCDate(),
        dow: d.getUTCDay(),
        time: `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`,
    };
}
/** UTC bounds of a Bangkok calendar month "yyyy-MM". */
function monthBounds(month) {
    const [y, m] = month.split("-").map(Number);
    return {
        start: new Date(Date.UTC(y, m - 1, 1) - 7 * 3600_000).toISOString(),
        end: new Date(Date.UTC(y, m, 1) - 7 * 3600_000).toISOString(),
    };
}
const thisMonth = () => bkk(new Date().toISOString()).key.slice(0, 7);
const monthLabel = (month) => {
    const [y, m] = month.split("-").map(Number);
    return `${MONTHS_TH[m - 1]} ${y + 543}`;
};
const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

/** A measured value cell: plum bold when outside the standard. */
function Val({ value, status, unit }) {
    const v = status === "NOT_SPECIFIED" || !(Number(value) > 0) ? null : num(value);
    if (!v) return <span className="text-neutral">-</span>;
    const off = isOff(status);
    return (
        <span className={off ? "text-plum font-semibold" : "text-charcoal"}>
            <span className="font-num">{v}</span>
            {unit && <span className="text-neutral"> {unit}</span>}
            {off && <span className="block text-sm">{STATUS_TH[status]}</span>}
        </span>
    );
}

function Stat({ label, value, sub }) {
    return (
        <div className="bg-cream p-4">
            <p className="text-sm text-neutral">{label}</p>
            <p className="font-num text-2xl text-charcoal mt-1">{value}</p>
            {sub && <p className="text-sm text-neutral mt-0.5">{sub}</p>}
        </div>
    );
}

function EspressoReport() {
    const params = useSearchParams();
    const router = useRouter();
    // ?month=yyyy-MM, or the older ?date=yyyy-MM-dd links from the Yuzu page
    const month = params.get("month") || (params.get("date") || "").slice(0, 7) || thisMonth();

    const [rows, setRows] = useState([]);
    const [photos, setPhotos] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true);
            setError("");
            const { start, end } = monthBounds(month);
            const [logs, pics] = await Promise.all([
                supabase.from("espresso_logs").select("*").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: true }),
                supabase.from("yuzu_chat_history").select("created_at, user_id, content").eq("message_type", "image_description").like("content", "%[ภาพประกอบช็อตกาแฟ]%").gte("created_at", start).lt("created_at", end),
            ]);
            if (!alive) return;
            if (logs.error) setError("โหลดข้อมูลไม่สำเร็จ: " + logs.error.message);
            setRows(logs.data || []);
            setPhotos(
                (pics.data || [])
                    .map((p) => ({ at: new Date(p.created_at).getTime(), url: (p.content.match(/\[ภาพประกอบช็อตกาแฟ\]\s*(https?:\/\/\S+)/) || [])[1] }))
                    .filter((p) => p.url)
            );
            setLoading(false);
        })();
        return () => { alive = false; };
    }, [month]);

    const shots = useMemo(
        () =>
            rows.map((r) => {
                const at = new Date(r.created_at).getTime();
                return {
                    ...r,
                    when: bkk(r.created_at),
                    verdict: shotVerdict({ dose: r.dose_status, yieldStatus: r.yield_status, firstDrop: r.first_drop_status, totalTime: r.total_time_status }),
                    photos: photos.filter((p) => Math.abs(p.at - at) <= 5 * 60_000).map((p) => p.url),
                };
            }),
        [rows, photos]
    );

    const summary = useMemo(() => {
        const timed = shots.filter((s) => s.total_time_status && s.total_time_status !== "NOT_SPECIFIED");
        const inTime = timed.filter((s) => s.total_time_status === "OK").length;
        const fast = timed.filter((s) => s.total_time_status === "FAST").length;
        const slow = timed.filter((s) => s.total_time_status === "SLOW").length;
        const judged = shots.filter((s) => s.is_grind_correct !== null && s.is_grind_correct !== undefined);
        const right = judged.filter((s) => s.is_grind_correct === true).length;
        const vals = (k) => shots.map((s) => Number(s[k])).filter((n) => n > 0);
        const byBarista = Object.entries(
            shots.reduce((m, s) => {
                const k = s.operator_name || "ไม่ทราบชื่อ";
                m[k] = m[k] || { n: 0, ok: 0 };
                m[k].n++;
                if (s.total_time_status === "OK") m[k].ok++;
                return m;
            }, {})
        ).sort((a, b) => b[1].n - a[1].n);
        return {
            n: shots.length, timed: timed.length, inTime, fast, slow, judged: judged.length, right,
            avgDose: avg(vals("dose")), avgYield: avg(vals("yield")), avgTime: avg(vals("total_time")), avgDrop: avg(vals("first_drop")),
            byBarista,
        };
    }, [shots]);

    const setMonth = (m) => m && router.replace(`/admin/report/espresso?month=${m}`);

    return (
        <div className="brand-v2 min-h-screen print-root">
            <style jsx global>{`
                @page { size: A4 portrait; margin: 12mm; }
                .doc { max-width: 210mm; }
                @media print {
                    .no-print { display: none !important; }
                    html, body, .print-root { background: #fff !important; }
                    .doc { max-width: none; border: none !important; padding: 0 !important; margin: 0 !important; background: #fff !important; }
                    .doc .bg-cream { background: #fff !important; }
                    .avoid-break, tr { break-inside: avoid; page-break-inside: avoid; }
                    .print-break-before { break-before: page; page-break-before: always; }
                    thead { display: table-header-group; }
                    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
                }
            `}</style>

            <header className="no-print sticky top-0 z-40 bg-plum text-cream border-b border-plum-3">
                <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row sm:items-stretch">
                    <div className="flex items-stretch flex-1 min-w-0">
                        <a href="/admin" className="min-h-14 pr-4 flex items-center text-base text-on-plum-2 hover:text-cream transition-colors duration-150 border-r border-plum-3">← หลังบ้าน</a>
                        <div className="flex-1 px-4 py-3 min-w-0">
                            <h2 className="font-head text-2xl">รายงานเอสเปรสโซ</h2>
                            <p className="text-sm text-on-plum-2">{monthLabel(month)} · {summary.n} ช็อต</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 pb-3 sm:pb-0 sm:pl-4 sm:border-l border-plum-3">
                        <label className="flex items-center">
                            <span className="sr-only">เดือน</span>
                            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} className="min-h-12 px-3 bg-plum-2 border border-plum-3 font-num text-base text-cream [color-scheme:dark]" />
                        </label>
                        <button type="button" onClick={() => window.print()} className="min-h-12 px-5 bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold whitespace-nowrap transition-colors duration-150">
                            พิมพ์ / บันทึก PDF
                        </button>
                    </div>
                </div>
            </header>

            <main className="px-4 sm:px-6 py-8">
                <article className="doc bg-cream border border-rule mx-auto p-6 sm:p-10">
                    {/* Document head */}
                    <div className="flex items-start justify-between gap-6 border-b-2 border-charcoal pb-5">
                        <div>
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src="/logo-inbaan-wordmark-charcoal-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto" />
                            <h1 className="font-head text-3xl leading-normal text-charcoal mt-3">รายงานช็อตทดสอบเอสเปรสโซ</h1>
                            <p className="text-base text-neutral">ประจำเดือน {monthLabel(month)}</p>
                        </div>
                        <div className="text-right text-sm text-neutral shrink-0">
                            <p>พิมพ์เมื่อ</p>
                            <p className="font-num text-charcoal">{new Date().toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok" })}</p>
                        </div>
                    </div>

                    {loading ? (
                        <p className="py-16 text-center text-base text-neutral">กำลังโหลดข้อมูล…</p>
                    ) : error ? (
                        <p className="py-16 text-center text-base text-error">{error}</p>
                    ) : summary.n === 0 ? (
                        <p className="py-16 text-center text-base text-neutral">เดือนนี้ยังไม่มีช็อตทดสอบ</p>
                    ) : (
                        <>
                            {/* Summary */}
                            <section className="avoid-break mt-6">
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-rule border border-rule">
                                    <Stat label="ช็อตทั้งหมด" value={summary.n} sub={`${new Set(shots.map((s) => s.when.key)).size} วัน`} />
                                    <Stat label="ผ่านเกณฑ์เวลา" value={`${pct(summary.inTime, summary.timed)}%`} sub={`${summary.inTime} จาก ${summary.timed} ช็อต`} />
                                    <Stat label="เร็วไป · ช้าไป" value={`${summary.fast} · ${summary.slow}`} sub="ช็อต" />
                                    <Stat label="ตัดสินใจเรื่องบดถูก" value={summary.judged ? `${pct(summary.right, summary.judged)}%` : "-"} sub={summary.judged ? `${summary.right} จาก ${summary.judged} ครั้ง` : "ยังไม่มีข้อมูล"} />
                                </div>

                                <table className="w-full mt-5 text-base border-collapse">
                                    <thead>
                                        <tr className="border-b border-charcoal text-sm text-neutral text-left">
                                            <th className="py-2 pr-3 font-semibold">ค่าเฉลี่ยเดือนนี้</th>
                                            <th className="py-2 px-3 font-semibold text-right">เฉลี่ย</th>
                                            <th className="py-2 pl-3 font-semibold text-right">เกณฑ์ร้าน</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[["dose", summary.avgDose], ["yield", summary.avgYield], ["firstDrop", summary.avgDrop], ["totalTime", summary.avgTime]].map(([k, v]) => {
                                            const s = ESPRESSO_SPEC[k];
                                            const off = v !== null && (v < s.min || v > s.max);
                                            return (
                                                <tr key={k} className="border-b border-rule">
                                                    <td className="py-2 pr-3 text-charcoal">{s.label}</td>
                                                    <td className={`py-2 px-3 text-right font-num ${off ? "text-plum font-semibold" : "text-charcoal"}`}>{v === null ? "-" : `${num(v)} ${s.unit}`}</td>
                                                    <td className="py-2 pl-3 text-right font-num text-neutral">{specText(k)}</td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>

                                <div className="mt-5">
                                    <p className="text-sm text-neutral">รายคน (ช็อตที่ผ่านเกณฑ์เวลา / ทั้งหมด)</p>
                                    <div className="mt-1 flex flex-wrap gap-x-6 gap-y-1 text-base text-charcoal">
                                        {summary.byBarista.map(([name, v]) => (
                                            <span key={name}>{name} <span className="font-num">{v.ok}/{v.n}</span></span>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            {/* Shot table */}
                            <section className="mt-8">
                                <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">ทุกช็อตในเดือน</h2>
                                <div className="overflow-x-auto">
                                    <table className="w-full min-w-[640px] text-base border-collapse">
                                        <thead>
                                            <tr className="border-b border-charcoal text-sm text-neutral text-left">
                                                <th className="py-2 pr-2 font-semibold">วันที่</th>
                                                <th className="py-2 px-2 font-semibold">บาริสต้า</th>
                                                <th className="py-2 px-2 font-semibold text-right">ผงกาแฟ</th>
                                                <th className="py-2 px-2 font-semibold text-right">น้ำกาแฟ</th>
                                                <th className="py-2 px-2 font-semibold text-right">หยดแรก</th>
                                                <th className="py-2 px-2 font-semibold text-right">เวลาสกัด</th>
                                                <th className="py-2 pl-2 font-semibold">ผล</th>
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {shots.map((s) => (
                                                <tr key={s.id} className="border-b border-rule align-top">
                                                    <td className="py-2 pr-2 whitespace-nowrap">
                                                        <span className="text-charcoal">{DAYS_TH[s.when.dow]} <span className="font-num">{s.when.day}</span></span>
                                                        <span className="block text-sm text-neutral font-num">{s.when.time}</span>
                                                    </td>
                                                    <td className="py-2 px-2 text-charcoal">{s.operator_name || "-"}</td>
                                                    <td className="py-2 px-2 text-right"><Val value={s.dose} status={s.dose_status} unit="g" /></td>
                                                    <td className="py-2 px-2 text-right"><Val value={s.yield} status={s.yield_status} unit="ml" /></td>
                                                    <td className="py-2 px-2 text-right"><Val value={s.first_drop} status={s.first_drop_status} unit="วิ" /></td>
                                                    <td className="py-2 px-2 text-right"><Val value={s.total_time} status={s.total_time_status} unit="วิ" /></td>
                                                    <td className={`py-2 pl-2 ${s.verdict.off ? "text-plum font-semibold" : "text-charcoal"}`}>{s.verdict.text}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </section>

                            {/* Notes per shot */}
                            <section className="print-break-before mt-10">
                                <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">บันทึกและคำแนะนำรายช็อต</h2>
                                <div className="divide-y divide-rule">
                                    {shots.map((s) => (
                                        <div key={s.id} className="avoid-break py-4">
                                            <div className="flex items-baseline justify-between gap-3">
                                                <p className="text-base font-semibold text-charcoal">
                                                    {DAYS_TH[s.when.dow]} <span className="font-num">{s.when.day}</span> · <span className="font-num">{s.when.time}</span> · {s.operator_name || "-"}
                                                </p>
                                                <p className={`text-sm shrink-0 ${s.verdict.off ? "text-plum font-semibold" : "text-neutral"}`}>{s.verdict.text}</p>
                                            </div>
                                            <div className="mt-2 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-base">
                                                {s.grind_adjustment && (
                                                    <p><span className="text-sm text-neutral block">การปรับบด</span>
                                                        <span className={s.is_grind_correct === false ? "text-plum" : "text-charcoal"}>{s.grind_adjustment}{s.is_grind_correct === true ? " · ปรับถูกทาง" : s.is_grind_correct === false ? " · ควรปรับอีกทาง" : ""}</span>
                                                    </p>
                                                )}
                                                {s.taste_profile && (
                                                    <p><span className="text-sm text-neutral block">รสชาติที่น่าจะได้</span><span className="text-charcoal">{s.taste_profile}</span></p>
                                                )}
                                            </div>
                                            {s.recommendation && (
                                                <p className="mt-2 bg-paper-2 px-3 py-2 text-base text-charcoal"><span className="text-sm text-neutral block">ยูซุแนะนำ</span>{s.recommendation}</p>
                                            )}
                                            {s.photos.length > 0 && (
                                                <div className="mt-2 flex gap-2">
                                                    {s.photos.slice(0, 4).map((url) => (
                                                        <a key={url} href={url} target="_blank" rel="noopener noreferrer" className="block w-20 h-20 border border-rule overflow-hidden">
                                                            {/* eslint-disable-next-line @next/next/no-img-element */}
                                                            <img src={url} alt={`รูปช็อตของ${s.operator_name || "บาริสต้า"}`} className="w-full h-full object-cover" />
                                                        </a>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    ))}
                                </div>
                            </section>
                        </>
                    )}

                    <footer className="mt-10 pt-4 border-t border-rule flex justify-between gap-4 text-sm text-neutral">
                        <span>ข้อมูลจากรายงานช็อตในกลุ่ม LINE อ่านค่าโดยยูซุ</span>
                        <span className="shrink-0">ในบ้าน นครพนม</span>
                    </footer>
                </article>
            </main>
        </div>
    );
}

export default function EspressoReportPage() {
    return (
        <Suspense fallback={<div className="brand-v2 min-h-screen p-16 text-center text-base text-neutral">กำลังโหลด…</div>}>
            <EspressoReport />
        </Suspense>
    );
}
