"use client";
/* Monthly transfer-slip summary from slip_transactions (+ rejected-slip alerts).
 * Used by the Yuzu "สลิปโอน" tab and the A4 print page /admin/report/slips.
 * verify_tier is saved from 2026-11-26 (migrations/20261126_slip_verify_tier.sql);
 * older slips have none and show as "ไม่ทราบ". */

import { useState, useEffect, useMemo, useCallback } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { bkk, monthBounds, pct, baht, dayLabel, employeeNamer, Stat } from "./monthTools";

export const TIERS = [
    { key: "BANK_VERIFIED", label: "ผ่าน EasySlip", note: "ยืนยันกับระบบธนาคารแล้ว" },
    { key: "FORENSIC_VERIFIED_BANK_DELAY", label: "ตรวจละเอียดจากภาพ", note: "ธนาคารยังไม่ซิงก์ ตรวจภาพแทน" },
    { key: "VISION_VERIFIED", label: "อ่านจากภาพ", note: "ไม่ได้ผ่าน EasySlip" },
    { key: null, label: "ไม่ทราบ", note: "ก่อนเริ่มบันทึกวิธีตรวจ" },
];
export const tierOf = (s) => TIERS.find((t) => t.key === (s.verify_tier || null)) || TIERS[3];

/** Load one month of slips, employees and rejected-slip alerts. */
export function useSlipMonth(month) {
    const [state, setState] = useState({ loading: true, error: "", slips: [], alerts: [], employees: [] });
    const [tick, setTick] = useState(0);
    const reload = useCallback(() => setTick((t) => t + 1), []);

    useEffect(() => {
        let alive = true;
        (async () => {
            setState((s) => ({ ...s, loading: true, error: "" }));
            const { start, end, firstDate, lastDate } = monthBounds(month);
            const [slips, alerts, emps] = await Promise.all([
                supabase.from("slip_transactions").select("*").eq("is_deleted", false).gte("date", firstDate).lte("date", lastDate).order("timestamp", { ascending: true }),
                supabase.from("yuzu_chat_history").select("id, created_at, user_id, content").eq("message_type", "fake_slip_alert").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: true }),
                supabase.from("employees").select("id, name, nickname, line_bot_id, line_user_id"),
            ]);
            if (!alive) return;
            setState({
                loading: false,
                error: slips.error ? "โหลดข้อมูลไม่สำเร็จ: " + slips.error.message : "",
                slips: slips.data || [],
                alerts: alerts.data || [],
                employees: emps.data || [],
            });
        })();
        return () => { alive = false; };
    }, [month, tick]);

    const nameOf = useMemo(() => employeeNamer(state.employees), [state.employees]);

    const summary = useMemo(() => {
        const slips = state.slips;
        const total = slips.reduce((a, s) => a + Number(s.amount || 0), 0);
        const group = (keyFn) => {
            const m = new Map();
            for (const s of slips) {
                const k = keyFn(s);
                const g = m.get(k) || { key: k, n: 0, amount: 0, bank: 0 };
                g.n++;
                g.amount += Number(s.amount || 0);
                if (s.verify_tier === "BANK_VERIFIED") g.bank++;
                m.set(k, g);
            }
            return [...m.values()];
        };
        const tiers = TIERS.map((t) => {
            const list = slips.filter((s) => (s.verify_tier || null) === t.key);
            return { ...t, n: list.length, amount: list.reduce((a, s) => a + Number(s.amount || 0), 0) };
        });
        const known = tiers.filter((t) => t.key).reduce((a, t) => a + t.n, 0);
        return {
            n: slips.length,
            total,
            tiers,
            known,
            bankVerified: tiers[0].n,
            byStaff: group((s) => nameOf(s.user_id)).sort((a, b) => b.amount - a.amount),
            byBank: group((s) => s.bank_name || "ไม่ทราบธนาคาร").sort((a, b) => b.n - a.n),
            byDay: group((s) => s.date).sort((a, b) => (a.key < b.key ? -1 : 1)),
        };
    }, [state.slips, nameOf]);

    return { ...state, nameOf, summary, reload };
}

const th = "py-2 font-semibold";

/** Summary blocks. `showList` adds every slip and the rejected list (for the PDF). */
export function SlipMonthBody({ data, showList = true }) {
    const { loading, error, slips, alerts, summary, nameOf } = data;
    if (loading) return <p className="py-16 text-center text-base text-neutral">กำลังโหลดข้อมูล…</p>;
    if (error) return <p className="py-16 text-center text-base text-error">{error}</p>;
    if (summary.n === 0 && alerts.length === 0) return <p className="py-16 text-center text-base text-neutral">เดือนนี้ยังไม่มีสลิป</p>;

    return (
        <>
            <section className="avoid-break">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-rule border border-rule">
                    <Stat label="สลิปที่บันทึก" value={summary.n} sub={`${summary.byDay.length} วัน`} />
                    <Stat label="ยอดรวม" value={`฿${Math.round(summary.total).toLocaleString("th-TH")}`} sub={`เฉลี่ย ฿${baht(summary.n ? summary.total / summary.n : 0)}`} />
                    <Stat label="ผ่าน EasySlip" value={summary.known ? `${pct(summary.bankVerified, summary.known)}%` : "-"} sub={summary.known ? `${summary.bankVerified} จาก ${summary.known} ใบที่รู้วิธีตรวจ` : "ยังไม่มีข้อมูลวิธีตรวจ"} />
                    <Stat label="ถูกปฏิเสธ" value={alerts.length} sub="สลิปปลอมหรือผิดบัญชี" />
                </div>

                <table className="w-full mt-5 text-base border-collapse">
                    <thead>
                        <tr className="border-b border-charcoal text-sm text-neutral text-left">
                            <th className={`${th} pr-3`}>วิธีตรวจ</th>
                            <th className={`${th} px-3 text-right`}>ใบ</th>
                            <th className={`${th} pl-3 text-right`}>ยอด (บาท)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {summary.tiers.map((t) => (
                            <tr key={t.label} className="border-b border-rule">
                                <td className="py-2 pr-3">
                                    <span className={t.key === "BANK_VERIFIED" ? "text-charcoal font-semibold" : "text-charcoal"}>{t.label}</span>
                                    <span className="block text-sm text-neutral">{t.note}</span>
                                </td>
                                <td className="py-2 px-3 text-right font-num text-charcoal">{t.n}</td>
                                <td className="py-2 pl-3 text-right font-num text-charcoal">{baht(t.amount)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                {summary.tiers[3].n > 0 && (
                    <p className="mt-2 text-sm text-neutral">สลิปที่บันทึกก่อนเริ่มเก็บวิธีตรวจจะขึ้นว่า &quot;ไม่ทราบ&quot;</p>
                )}
            </section>

            <section className="avoid-break mt-8 grid sm:grid-cols-2 gap-8">
                {[["รายพนักงานที่ส่งสลิป", summary.byStaff], ["รายธนาคารผู้โอน", summary.byBank]].map(([title, rows]) => (
                    <div key={title}>
                        <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">{title}</h2>
                        <table className="w-full text-base border-collapse">
                            <tbody>
                                {rows.map((r) => (
                                    <tr key={r.key} className="border-b border-rule">
                                        <td className="py-2 pr-2 text-charcoal">{r.key}</td>
                                        <td className="py-2 px-2 text-right font-num text-neutral whitespace-nowrap">{r.n} ใบ</td>
                                        <td className="py-2 pl-2 text-right font-num text-charcoal whitespace-nowrap">{baht(r.amount)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}
            </section>

            <section className="mt-8">
                <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">รายวัน</h2>
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[420px] text-base border-collapse">
                        <thead>
                            <tr className="border-b border-charcoal text-sm text-neutral text-left">
                                <th className={`${th} pr-2`}>วันที่</th>
                                <th className={`${th} px-2 text-right`}>ใบ</th>
                                <th className={`${th} px-2 text-right`}>ผ่าน EasySlip</th>
                                <th className={`${th} pl-2 text-right`}>ยอด (บาท)</th>
                            </tr>
                        </thead>
                        <tbody>
                            {summary.byDay.map((d) => (
                                <tr key={d.key} className="border-b border-rule">
                                    <td className="py-2 pr-2 text-charcoal">{dayLabel(d.key)}</td>
                                    <td className="py-2 px-2 text-right font-num text-charcoal">{d.n}</td>
                                    <td className="py-2 px-2 text-right font-num text-neutral">{d.bank || "-"}</td>
                                    <td className="py-2 pl-2 text-right font-num text-charcoal">{baht(d.amount)}</td>
                                </tr>
                            ))}
                            <tr className="border-t-2 border-charcoal">
                                <td className="py-2 pr-2 font-semibold text-charcoal">รวม</td>
                                <td className="py-2 px-2 text-right font-num font-semibold text-charcoal">{summary.n}</td>
                                <td className="py-2 px-2 text-right font-num text-neutral">{summary.bankVerified || "-"}</td>
                                <td className="py-2 pl-2 text-right font-num font-semibold text-charcoal">{baht(summary.total)}</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
            </section>

            {alerts.length > 0 && (
                <section className="avoid-break mt-8">
                    <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">สลิปที่ถูกปฏิเสธ</h2>
                    <ul className="divide-y divide-rule">
                        {alerts.map((a) => {
                            const w = bkk(a.created_at);
                            return (
                                <li key={a.id} className="py-2 text-base">
                                    <span className="text-sm text-neutral"><span className="font-num">{dayLabel(w.key)} · {w.time}</span> · ส่งโดย {nameOf(a.user_id)}</span>
                                    <span className="block text-charcoal">{String(a.content || "").replace(/^\[ALERT\]\s*/, "")}</span>
                                </li>
                            );
                        })}
                    </ul>
                </section>
            )}

            {showList && summary.n > 0 && (
                <section className="print-break-before mt-10">
                    <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">ทุกสลิปในเดือน</h2>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px] text-base border-collapse">
                            <thead>
                                <tr className="border-b border-charcoal text-sm text-neutral text-left">
                                    <th className={`${th} pr-2`}>วันที่</th>
                                    <th className={`${th} px-2`}>ผู้โอน</th>
                                    <th className={`${th} px-2`}>ธนาคาร</th>
                                    <th className={`${th} px-2`}>พนักงาน</th>
                                    <th className={`${th} px-2`}>วิธีตรวจ</th>
                                    <th className={`${th} pl-2 text-right`}>ยอด (บาท)</th>
                                </tr>
                            </thead>
                            <tbody>
                                {slips.map((s) => {
                                    const w = bkk(s.timestamp);
                                    return (
                                        <tr key={s.id} className="border-b border-rule align-top">
                                            <td className="py-2 pr-2 whitespace-nowrap text-charcoal">{dayLabel(s.date)}<span className="block text-sm text-neutral font-num">{w.time}</span></td>
                                            <td className="py-2 px-2 text-charcoal">{s.sender_name || "-"}</td>
                                            <td className="py-2 px-2 text-neutral">{s.bank_name || "-"}</td>
                                            <td className="py-2 px-2 text-charcoal">{nameOf(s.user_id)}</td>
                                            <td className="py-2 px-2 text-neutral">{tierOf(s).label}</td>
                                            <td className="py-2 pl-2 text-right font-num text-charcoal">{baht(s.amount)}</td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </>
    );
}
