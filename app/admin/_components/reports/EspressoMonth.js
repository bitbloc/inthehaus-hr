"use client";
/* Monthly espresso summary from espresso_logs (written by the LINE webhook).
 * Used by the Yuzu "บันทึกเอสเปรสโซ" tab and the A4 print page
 * /admin/report/espresso. Values are re-judged against today's standard. */

import { useState, useEffect, useMemo } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { ESPRESSO_SPEC, STATUS_TH, isOff, specText, num, shotVerdict, judge } from "../../../../utils/espressoSpec";
import { bkk, monthBounds, avg, pct, DAYS_TH, Stat } from "./monthTools";

/** Load and summarise one month. */
export function useEspressoMonth(month) {
    const [state, setState] = useState({ loading: true, error: "", rows: [], photos: [] });

    useEffect(() => {
        let alive = true;
        (async () => {
            setState((s) => ({ ...s, loading: true, error: "" }));
            const { start, end } = monthBounds(month);
            const [logs, pics] = await Promise.all([
                supabase.from("espresso_logs").select("*").gte("created_at", start).lt("created_at", end).order("created_at", { ascending: true }),
                supabase.from("yuzu_chat_history").select("created_at, content").eq("message_type", "image_description").like("content", "%[ภาพประกอบช็อตกาแฟ]%").gte("created_at", start).lt("created_at", end),
            ]);
            if (!alive) return;
            setState({
                loading: false,
                error: logs.error ? "โหลดข้อมูลไม่สำเร็จ: " + logs.error.message : "",
                rows: logs.data || [],
                photos: (pics.data || [])
                    .map((p) => ({ at: new Date(p.created_at).getTime(), url: (p.content.match(/\[ภาพประกอบช็อตกาแฟ\]\s*(https?:\/\/\S+)/) || [])[1] }))
                    .filter((p) => p.url),
            });
        })();
        return () => { alive = false; };
    }, [month]);

    const shots = useMemo(
        () =>
            state.rows.map((r) => {
                const at = new Date(r.created_at).getTime();
                const j = {
                    dose_status: judge("dose", r.dose, r.dose_status),
                    yield_status: judge("yield", r.yield, r.yield_status),
                    first_drop_status: judge("firstDrop", r.first_drop, r.first_drop_status),
                    total_time_status: judge("totalTime", r.total_time, r.total_time_status),
                };
                return {
                    ...r,
                    ...j,
                    when: bkk(r.created_at),
                    verdict: shotVerdict({ dose: j.dose_status, yieldStatus: j.yield_status, firstDrop: j.first_drop_status, totalTime: j.total_time_status }),
                    photos: state.photos.filter((p) => Math.abs(p.at - at) <= 5 * 60_000).map((p) => p.url),
                };
            }),
        [state.rows, state.photos]
    );

    const summary = useMemo(() => {
        const timed = shots.filter((s) => s.total_time_status && s.total_time_status !== "NOT_SPECIFIED");
        const inTime = timed.filter((s) => s.total_time_status === "OK").length;
        const judged = shots.filter((s) => s.is_grind_correct !== null && s.is_grind_correct !== undefined);
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
            n: shots.length,
            days: new Set(shots.map((s) => s.when.key)).size,
            timed: timed.length,
            inTime,
            fast: timed.filter((s) => s.total_time_status === "FAST").length,
            slow: timed.filter((s) => s.total_time_status === "SLOW").length,
            judged: judged.length,
            right: judged.filter((s) => s.is_grind_correct === true).length,
            avgDose: avg(vals("dose")),
            avgYield: avg(vals("yield")),
            avgTime: avg(vals("total_time")),
            avgDrop: avg(vals("first_drop")),
            byBarista,
        };
    }, [shots]);

    return { loading: state.loading, error: state.error, shots, summary };
}

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

/** Summary, every shot, and (optionally) notes per shot. */
export function EspressoMonthBody({ data, showNotes = true }) {
    const { loading, error, shots, summary } = data;
    if (loading) return <p className="py-16 text-center text-base text-neutral">กำลังโหลดข้อมูล…</p>;
    if (error) return <p className="py-16 text-center text-base text-error">{error}</p>;
    if (summary.n === 0) return <p className="py-16 text-center text-base text-neutral">เดือนนี้ยังไม่มีช็อตทดสอบ</p>;

    return (
        <>
            <section className="avoid-break">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-rule border border-rule">
                    <Stat label="ช็อตทั้งหมด" value={summary.n} sub={`${summary.days} วัน`} />
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

            {showNotes && (
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
                                            <span className={s.is_grind_correct === false ? "text-plum" : "text-charcoal"}>{s.grind_adjustment}{s.is_grind_correct === true ? " · ตัดสินใจถูก" : s.is_grind_correct === false ? " · ควรปรับอีกทาง" : ""}</span>
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
            )}
        </>
    );
}
