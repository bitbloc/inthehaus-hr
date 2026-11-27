"use client";
/* Monthly team survey (แบบวัดผลประจำเดือน) summary.
 * Data: kpi_surveys, kpi_responses, kpi_progress (migrations/20261127_team_kpi.sql).
 * Used by the admin tab "แบบวัดผล" and the A4 print page /admin/report/kpi. */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../../../lib/supabaseClient";
import { pct, Stat } from "./monthTools";

const SCALE_TH = ["", "ต้องปรับมาก", "ควรปรับ", "พอใช้", "ดี", "ดีมาก"];

export const isOwnerPos = (p) => /owner|ceo/i.test(String(p || ""));

export function prevMonth(month) {
    const [y, m] = month.split("-").map(Number);
    const d = new Date(Date.UTC(y, m - 2, 1));
    return d.toISOString().slice(0, 7);
}

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const fmt = (n) => (n === null || n === undefined ? "-" : n.toFixed(1));

export function useKpiMonth(month, reloadKey = 0) {
    const [state, setState] = useState({ loading: true, error: "", surveys: [], survey: null, responses: [], prev: [], progress: [], employees: [] });

    useEffect(() => {
        let alive = true;
        (async () => {
            setState((s) => ({ ...s, loading: true, error: "" }));
            const prev = prevMonth(month);
            const [surveys, resp, progress, emps] = await Promise.all([
                supabase.from("kpi_surveys").select("*").order("updated_at", { ascending: false }),
                supabase.from("kpi_responses").select("*").in("period", [month, prev]),
                supabase.from("kpi_progress").select("*").eq("period", month),
                supabase.from("employees").select("id, name, nickname, position, is_active"),
            ]);
            if (!alive) return;
            const err = surveys.error || resp.error || progress.error || emps.error;
            const all = resp.data || [];
            const list = surveys.data || [];
            // The survey used this month, else the active one.
            const usedId = all.find((r) => r.period === month)?.survey_id;
            const survey =
                list.find((s) => s.id === usedId) ||
                list.find((s) => s.is_active && s.for_period === month) ||
                list.find((s) => s.is_active && !s.for_period) ||
                list.find((s) => s.for_period === month) ||
                list[0] || null;
            setState({
                surveys: list,
                loading: false,
                error: err ? `โหลดข้อมูลไม่สำเร็จ: ${err.message} (รัน migration 20261127_team_kpi.sql แล้วหรือยัง?)` : "",
                survey,
                responses: all.filter((r) => r.period === month && (!survey || r.survey_id === survey.id)),
                prev: all.filter((r) => r.period === prev),
                progress: progress.data || [],
                employees: emps.data || [],
            });
        })();
        return () => { alive = false; };
    }, [month, reloadKey]);

    const derived = useMemo(() => {
        const { survey, responses, prev, progress, employees } = state;
        const questions = survey?.questions || [];
        const empById = new Map(employees.map((e) => [e.id, e]));
        const nameOf = (id) => {
            const e = empById.get(id);
            return e ? e.nickname || e.name : "ไม่ทราบชื่อ";
        };

        const answeredIds = new Set(responses.map((r) => r.employee_id));
        const staff = employees
            .filter((e) => (e.is_active !== false && !isOwnerPos(e.position)) || answeredIds.has(e.id))
            .map((e) => {
                const r = responses.find((x) => x.employee_id === e.id);
                const p = progress.find((x) => x.employee_id === e.id && (!survey || x.survey_id === survey.id));
                return { ...e, display: e.nickname || e.name, response: r || null, progress: p || null };
            })
            .sort((a, b) => Number(Boolean(b.response)) - Number(Boolean(a.response)) || a.display.localeCompare(b.display, "th"));

        const perQ = questions.map((q) => {
            const vals = responses.map((r) => r.answers?.[q.id]);
            if (q.type === "scale") {
                const nums = vals.map(Number).filter((n) => n >= 1 && n <= 5);
                const prevNums = prev.map((r) => Number(r.answers?.[q.id])).filter((n) => n >= 1 && n <= 5);
                const dist = [1, 2, 3, 4, 5].map((v) => nums.filter((n) => n === v).length);
                return { q, n: nums.length, avg: mean(nums), prevAvg: mean(prevNums), dist };
            }
            if (q.type === "multi") {
                const counts = (q.options || []).map((opt) => ({ opt, n: vals.filter((v) => Array.isArray(v) && v.includes(opt)).length }));
                const others = responses
                    .map((r) => ({ text: r.answers?.[`${q.id}_other`], who: nameOf(r.employee_id) }))
                    .filter((x) => x.text);
                return { q, counts: counts.sort((a, b) => b.n - a.n), others };
            }
            return { q, texts: responses.map((r) => ({ text: r.answers?.[q.id], who: nameOf(r.employee_id) })).filter((x) => x.text) };
        });

        const sections = [];
        for (const row of perQ) {
            if (row.q.type !== "scale") continue;
            const title = row.q.section || "ทั่วไป";
            let s = sections.find((x) => x.title === title);
            if (!s) sections.push((s = { title, avgs: [], prevs: [] }));
            if (row.avg !== null) s.avgs.push(row.avg);
            if (row.prevAvg !== null) s.prevs.push(row.prevAvg);
        }
        const sectionRows = sections.map((s) => ({ title: s.title, avg: mean(s.avgs), prevAvg: mean(s.prevs) }));
        const overall = mean(perQ.filter((r) => r.q.type === "scale" && r.avg !== null).map((r) => r.avg));
        const overallPrev = mean(perQ.filter((r) => r.q.type === "scale" && r.prevAvg !== null).map((r) => r.prevAvg));
        const scored = sectionRows.filter((s) => s.avg !== null);
        const lowest = scored.length ? scored.reduce((a, b) => (b.avg < a.avg ? b : a)) : null;

        return { questions, staff, perQ, sectionRows, overall, overallPrev, lowest, done: staff.filter((s) => s.response).length };
    }, [state]);

    return { ...state, ...derived };
}

function Delta({ now, prev }) {
    if (now === null || prev === null) return <span className="text-neutral">-</span>;
    const d = now - prev;
    if (Math.abs(d) < 0.05) return <span className="text-neutral font-num">เท่าเดิม</span>;
    return <span className={`font-num ${d < 0 ? "text-plum font-semibold" : "text-charcoal"}`}>{d > 0 ? "+" : ""}{d.toFixed(1)}</span>;
}

/** Score bar out of 5: charcoal fill, plum when under 3. */
function ScoreBar({ value }) {
    if (value === null) return null;
    return (
        <div className="h-2 bg-paper-2 w-full" aria-hidden="true">
            <div className={`h-2 ${value < 3 ? "bg-plum" : "bg-charcoal"}`} style={{ width: `${(value / 5) * 100}%` }} />
        </div>
    );
}

export function KpiMonthBody({ data, showNames = false }) {
    const { loading, error, survey, staff, perQ, sectionRows, overall, overallPrev, lowest, done } = data;
    if (loading) return <p className="py-16 text-center text-base text-neutral">กำลังโหลดข้อมูล…</p>;
    if (error) return <p className="py-16 text-center text-base text-error">{error}</p>;
    if (!survey) return <p className="py-16 text-center text-base text-neutral">ยังไม่มีแบบวัดผล</p>;

    const notDone = staff.filter((s) => !s.response);

    return (
        <>
            <section className="avoid-break">
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-rule border border-rule">
                    <Stat label="ตอบแล้ว" value={`${done}/${staff.length}`} sub={`${pct(done, staff.length)}% ของทีม`} />
                    <Stat label="คะแนนเฉลี่ยรวม" value={fmt(overall)} sub="เต็ม 5" />
                    <Stat label="เทียบเดือนก่อน" value={overall !== null && overallPrev !== null ? `${overall - overallPrev >= 0 ? "+" : ""}${(overall - overallPrev).toFixed(1)}` : "-"} sub={overallPrev !== null ? `เดือนก่อน ${fmt(overallPrev)}` : "ไม่มีข้อมูลเดือนก่อน"} />
                    <Stat label="เรื่องที่ควรปรับที่สุด" value={lowest ? fmt(lowest.avg) : "-"} sub={lowest ? lowest.title : ""} />
                </div>

                {done === 0 ? (
                    <p className="py-10 text-center text-base text-neutral">เดือนนี้ยังไม่มีใครตอบ</p>
                ) : (
                    <table className="w-full mt-5 text-base border-collapse">
                        <thead>
                            <tr className="border-b border-charcoal text-sm text-neutral text-left">
                                <th className="py-2 pr-3 font-semibold">หมวด</th>
                                <th className="py-2 px-3 font-semibold w-1/3">คะแนน</th>
                                <th className="py-2 px-3 font-semibold text-right">เฉลี่ย</th>
                                <th className="py-2 pl-3 font-semibold text-right">เทียบเดือนก่อน</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sectionRows.map((s) => (
                                <tr key={s.title} className="border-b border-rule">
                                    <td className="py-2 pr-3 text-charcoal">{s.title}</td>
                                    <td className="py-2 px-3"><ScoreBar value={s.avg} /></td>
                                    <td className={`py-2 px-3 text-right font-num ${s.avg !== null && s.avg < 3 ? "text-plum font-semibold" : "text-charcoal"}`}>{fmt(s.avg)}</td>
                                    <td className="py-2 pl-3 text-right"><Delta now={s.avg} prev={s.prevAvg} /></td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {done > 0 && (
                <section className="mt-8">
                    <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">รายข้อ</h2>
                    <div className="divide-y divide-rule">
                        {perQ.map((row, qi) => {
                            const qNo = qi + 1;
                            const head = (
                                <p className="text-base text-charcoal">
                                    <span className="font-num text-neutral mr-1">{qNo}.</span>{row.q.text}
                                    {row.q.section && <span className="text-sm text-neutral"> · {row.q.section}</span>}
                                </p>
                            );
                            if (row.q.type === "scale") {
                                return (
                                    <div key={row.q.id} className="avoid-break py-3">
                                        <div className="flex items-baseline justify-between gap-4">
                                            {head}
                                            <span className="shrink-0 text-right">
                                                <span className={`font-num text-lg ${row.avg !== null && row.avg < 3 ? "text-plum font-semibold" : "text-charcoal"}`}>{fmt(row.avg)}</span>
                                                <span className="block text-sm"><Delta now={row.avg} prev={row.prevAvg} /></span>
                                            </span>
                                        </div>
                                        <div className="mt-2 grid grid-cols-5 gap-px bg-rule border border-rule text-center">
                                            {row.dist.map((n, i) => (
                                                <div key={i} className="bg-cream py-1">
                                                    <p className="text-xs text-neutral">{i + 1} {SCALE_TH[i + 1]}</p>
                                                    <p className={`font-num text-base ${n ? "text-charcoal" : "text-neutral"}`}>{n}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                );
                            }
                            if (row.q.type === "multi") {
                                const max = Math.max(1, ...row.counts.map((c) => c.n));
                                return (
                                    <div key={row.q.id} className="avoid-break py-3">
                                        {head}
                                        <table className="w-full mt-2 text-base border-collapse">
                                            <tbody>
                                                {row.counts.map((c) => (
                                                    <tr key={c.opt} className="border-b border-rule">
                                                        <td className="py-1.5 pr-3 text-charcoal">{c.opt}</td>
                                                        <td className="py-1.5 px-3 w-1/3">
                                                            <div className="h-2 bg-paper-2" aria-hidden="true"><div className="h-2 bg-charcoal" style={{ width: `${(c.n / max) * 100}%` }} /></div>
                                                        </td>
                                                        <td className="py-1.5 pl-3 text-right font-num text-charcoal whitespace-nowrap">{c.n} คน</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                        {row.others.length > 0 && (
                                            <ul className="mt-2 text-base text-charcoal list-disc pl-5">
                                                {row.others.map((o, i) => <li key={i}>อื่นๆ: {o.text}{showNames && <span className="text-sm text-neutral"> · {o.who}</span>}</li>)}
                                            </ul>
                                        )}
                                    </div>
                                );
                            }
                            return (
                                <div key={row.q.id} className="py-3">
                                    {head}
                                    {row.texts.length === 0 ? (
                                        <p className="text-base text-neutral mt-1">ไม่มีคำตอบ</p>
                                    ) : (
                                        <ul className="mt-2 flex flex-col gap-2">
                                            {row.texts.map((t, i) => (
                                                <li key={i} className="avoid-break border-l-2 border-rule pl-3 text-base text-charcoal whitespace-pre-wrap">
                                                    {t.text}
                                                    {showNames && <span className="block text-sm text-neutral">{t.who}</span>}
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            )}

            <section className="mt-8 avoid-break">
                <h2 className="text-lg font-semibold text-charcoal border-b border-charcoal pb-2">ใครทำแล้ว</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 mt-3">
                    <div>
                        <p className="text-sm text-neutral">ทำแล้ว ({done})</p>
                        <p className="text-base text-charcoal mt-1">{staff.filter((s) => s.response).map((s) => s.display).join(", ") || "-"}</p>
                    </div>
                    <div>
                        <p className="text-sm text-neutral">ยังไม่ได้ทำ ({notDone.length})</p>
                        <p className="text-base text-plum font-semibold mt-1">{notDone.map((s) => s.display).join(", ") || "-"}</p>
                    </div>
                </div>
            </section>
        </>
    );
}
