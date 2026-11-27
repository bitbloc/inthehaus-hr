"use client";
/* Admin tab "แบบวัดผล": who has answered this month, extend a deadline,
 * open the PDF summary, and edit the questions. */

import React, { useState } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { useAdminAuth } from "../AdminAuthContext";
import { adminFetch } from "../../../lib/adminFetch";
import { useKpiMonth } from "./reports/KpiMonth";
import { thisMonth, monthLabel } from "./reports/monthTools";

const inputCls = "w-full min-h-11 px-3 bg-cream border border-rule text-base text-charcoal";
const labelCls = "block text-sm font-semibold text-neutral mb-1";
const TYPE_TH = { scale: "ให้คะแนน 1–5", multi: "เลือกได้หลายข้อ", text: "เขียนตอบ" };

function surveyLabel(s) {
    const when = s.for_period ? `ใช้เดือน ${monthLabel(s.for_period)}` : "ชุดหลัก (เดือนที่ไม่มีชุดเฉพาะ)";
    return `${s.title} · ${when}${s.is_active ? "" : " · ปิดอยู่"}`;
}

const fmtDate = (iso) =>
    iso ? new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" }) : "-";
const lastSkipDay = (iso) => (iso ? fmtDate(new Date(new Date(iso).getTime() - 1).toISOString()) : "-");

const newId = (qs) => {
    let n = qs.length + 1;
    while (qs.some((q) => q.id === `q${n}`)) n++;
    return `q${n}`;
};

function StatusCell({ s }) {
    if (s.response) return <span className="text-charcoal">ทำแล้ว <span className="text-sm text-neutral">{fmtDate(s.response.submitted_at)}</span></span>;
    if (!s.progress) return <span className="text-neutral">ยังไม่ได้ทำ · ยังไม่ได้ลงเวลาเดือนนี้</span>;
    const overdue = new Date(s.progress.deadline_at) <= new Date();
    return (
        <span className={overdue ? "text-error font-semibold" : "text-plum font-semibold"}>
            ยังไม่ได้ทำ
            <span className="block text-sm font-normal text-neutral">
                {overdue ? "เลยกำหนดแล้ว" : `ข้ามได้ถึง ${lastSkipDay(s.progress.deadline_at)}`} · ข้ามไป {s.progress.skip_count || 0} ครั้ง
            </span>
        </span>
    );
}

export default function KpiManager() {
    const { user } = useAdminAuth();
    const [month, setMonth] = useState(thisMonth());
    const [reload, setReload] = useState(0);
    const data = useKpiMonth(month, reload);
    const [message, setMessage] = useState(null);
    const [editId, setEditId] = useState(null);
    const editing = (data.surveys || []).find((s) => s.id === editId) || data.survey;

    const addSurvey = async () => {
        const [y, m] = thisMonth().split("-").map(Number);
        const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
        const taken = (data.surveys || []).some((s) => s.for_period === next);
        const { data: row, error } = await supabase
            .from("kpi_surveys")
            .insert({ title: "ชุดคำถามใหม่", intro: "", questions: [], skip_days: 3, is_active: false, for_period: taken ? null : next })
            .select("id")
            .single();
        if (error) {
            setMessage({ type: "error", text: `สร้างชุดใหม่ไม่สำเร็จ: ${error.message}` });
            return;
        }
        setEditId(row.id);
        setReload((n) => n + 1);
        setMessage({ type: "success", text: "สร้างชุดใหม่แล้ว (ยังปิดอยู่) ใส่คำถาม เลือกเดือน แล้วติ๊ก เปิดใช้" });
    };

    // Personal link for staff without a phone (valid this month only).
    const makeLink = async (s) => {
        try {
            const res = await adminFetch("/api/kpi/link", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ employeeId: s.id }),
            });
            const json = await res.json();
            if (!json.success) throw new Error(json.error || "สร้างลิงก์ไม่สำเร็จ");
            let copied = false;
            try { await navigator.clipboard.writeText(json.url); copied = true; } catch {}
            setMessage({ type: "success", text: `${copied ? "คัดลอกลิงก์ของ" : "ลิงก์ของ"} ${s.display} แล้ว ส่งให้เขาเปิดในเครื่องไหนก็ได้ (ใช้ได้ถึงสิ้นเดือนนี้)`, url: json.url });
        } catch (e) {
            setMessage({ type: "error", text: e.message });
        }
    };

    const extend = async (p) => {
        const base = Math.max(new Date(p.deadline_at).getTime(), Date.now());
        const { error } = await supabase
            .from("kpi_progress")
            .update({ deadline_at: new Date(base + 86_400_000).toISOString(), extended_by: user?.email || "admin" })
            .eq("id", p.id);
        setMessage(error ? { type: "error", text: `ขยายเวลาไม่สำเร็จ: ${error.message}` } : { type: "success", text: "ขยายเวลาให้อีก 1 วันแล้ว" });
        setReload((n) => n + 1);
    };

    return (
        <div className="space-y-6">
            <div className="bg-cream border-2 border-charcoal p-5">
                <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 bg-plum" />
                    <span className="text-xs font-semibold text-neutral">ทีม · แบบวัดผลประจำเดือน</span>
                </div>
                <h2 className="text-lg font-semibold text-charcoal mt-1">แบบวัดผลประจำเดือน</h2>
                <p className="text-sm text-neutral mt-1 leading-relaxed">
                    พนักงานทุกคน (ไม่รวมเจ้าของ) ตอบเดือนละครั้ง ระบบถามก่อนถ่ายรูปเข้างานและออกงาน กดข้ามได้ {data.survey?.skip_days ?? 3} วัน
                    นับจากวันแรกที่ถูกถาม เลยกำหนดแล้วต้องทำก่อนจึงจะลงเวลาเข้างานได้ ออกงานได้เสมอ พนักงานกดทำเองได้ตลอดจากหน้าลงเวลา
                </p>
            </div>

            {message && (
                <div className={`p-3 border text-sm font-semibold flex items-center justify-between ${message.type === "success" ? "bg-charcoal/10 border-charcoal text-charcoal" : "bg-error/10 border-error text-error"}`}>
                    <span className="min-w-0">
                        {message.text}
                        {message.url && <input readOnly value={message.url} onFocus={(e) => e.target.select()} className="block w-full mt-2 min-h-10 px-2 bg-cream border border-rule font-num text-xs font-normal" />}
                    </span>
                    <button onClick={() => setMessage(null)} className="ml-4 cursor-pointer">ปิด</button>
                </div>
            )}

            {data.error && <p className="p-3 border border-error text-error text-sm">{data.error}</p>}

            {/* Who has answered */}
            <section className="bg-cream border border-rule">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 border-b border-rule">
                    <div>
                        <h3 className="text-base font-semibold text-charcoal">ใครทำแล้ว · {monthLabel(month)}</h3>
                        <p className="text-sm text-neutral">ทำแล้ว <span className="font-num">{data.done ?? 0}/{data.staff?.length ?? 0}</span> คน</p>
                    </div>
                    <div className="flex items-center gap-2">
                        <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className="min-h-11 px-3 bg-cream border border-rule font-num text-base" />
                        <a href={`/admin/report/kpi?month=${month}`} target="_blank" rel="noreferrer" className="min-h-11 px-4 flex items-center bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold">
                            สรุปผล / PDF
                        </a>
                    </div>
                </div>
                {data.loading ? (
                    <p className="p-6 text-center text-neutral">กำลังโหลด…</p>
                ) : (
                    <table className="w-full text-base border-collapse">
                        <tbody>
                            {(data.staff || []).map((s) => (
                                <tr key={s.id} className="border-b border-rule last:border-0 align-top">
                                    <td className="px-5 py-3 text-charcoal">{s.display}</td>
                                    <td className="px-3 py-3"><StatusCell s={s} /></td>
                                    <td className="px-5 py-3 text-right whitespace-nowrap space-x-2">
                                        {!s.response && month === thisMonth() && (
                                            <button onClick={() => makeLink(s)} title="สำหรับคนที่ไม่มีโทรศัพท์ เปิดได้ทุกเครื่อง" className="min-h-10 px-3 border border-charcoal text-sm font-semibold text-charcoal hover:bg-paper-2">
                                                คัดลอกลิงก์
                                            </button>
                                        )}
                                        {!s.response && s.progress && month === thisMonth() && (
                                            <button onClick={() => extend(s.progress)} className="min-h-10 px-3 border border-charcoal text-sm font-semibold text-charcoal hover:bg-paper-2">
                                                ขยายเวลา +1 วัน
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </section>

            {/* Question sets: pick one to edit, or add a set for a coming month */}
            {(data.surveys || []).length > 0 && (
                <section className="bg-cream border border-rule p-5 flex flex-wrap items-end gap-3">
                    <div className="flex-1 min-w-[240px]">
                        <label className={labelCls}>ชุดคำถามที่จะแก้</label>
                        <select className={inputCls} value={editing?.id || ""} onChange={(e) => setEditId(e.target.value)}>
                            {data.surveys.map((s) => (
                                <option key={s.id} value={s.id}>{surveyLabel(s)}</option>
                            ))}
                        </select>
                    </div>
                    <button type="button" onClick={addSurvey} className="min-h-11 px-4 border border-charcoal text-base font-semibold text-charcoal hover:bg-paper-2">
                        สร้างชุดใหม่
                    </button>
                </section>
            )}

            {/* Question editor (remounts when the saved survey changes) */}
            {editing && (
                <SurveyEditor
                    key={`${editing.id}-${editing.updated_at}`}
                    survey={editing}
                    onMessage={setMessage}
                    onSaved={() => setReload((n) => n + 1)}
                />
            )}
        </div>
    );
}

function SurveyEditor({ survey, onMessage, onSaved }) {
    const [draft, setDraft] = useState(() => JSON.parse(JSON.stringify(survey)));
    const [saving, setSaving] = useState(false);

    const setQ = (i, patch) => setDraft((d) => ({ ...d, questions: d.questions.map((q, j) => (j === i ? { ...q, ...patch } : q)) }));
    const moveQ = (i, dir) =>
        setDraft((d) => {
            const qs = [...d.questions];
            const j = i + dir;
            if (j < 0 || j >= qs.length) return d;
            [qs[i], qs[j]] = [qs[j], qs[i]];
            return { ...d, questions: qs };
        });
    const removeQ = (i) => {
        if (!window.confirm("ลบคำถามนี้? คำตอบเก่าของข้อนี้จะไม่แสดงในสรุป")) return;
        setDraft((d) => ({ ...d, questions: d.questions.filter((_, j) => j !== i) }));
    };
    const addQ = () =>
        setDraft((d) => {
            const last = d.questions[d.questions.length - 1];
            return { ...d, questions: [...d.questions, { id: newId(d.questions), section: last?.section || "", type: "scale", required: true, text: "" }] };
        });

    const save = async () => {
        if (!draft) return;
        const questions = draft.questions
            .map((q) => ({
                ...q,
                text: (q.text || "").trim(),
                section: (q.section || "").trim(),
                options: q.type === "multi" ? (q.options || []).map((o) => o.trim()).filter(Boolean) : undefined,
                allowOther: q.type === "multi" ? Boolean(q.allowOther) : undefined,
            }))
            .filter((q) => q.text);
        if (questions.some((q) => q.type === "multi" && q.options.length === 0)) {
            onMessage({ type: "error", text: "ข้อแบบเลือกได้หลายข้อ ต้องมีตัวเลือกอย่างน้อย 1 ตัว" });
            return;
        }
        setSaving(true);
        const { error } = await supabase
            .from("kpi_surveys")
            .update({
                title: (draft.title || "").trim() || "แบบวัดผลประจำเดือน",
                intro: (draft.intro || "").trim(),
                skip_days: Math.max(0, Math.min(31, Number(draft.skip_days) || 0)),
                is_active: Boolean(draft.is_active),
                for_period: draft.for_period || null,
                questions,
                updated_at: new Date().toISOString(),
            })
            .eq("id", draft.id);
        setSaving(false);
        const clash = error && /uq_kpi_surveys_active_period|duplicate key/i.test(error.message);
        onMessage(
            error
                ? { type: "error", text: clash ? "เดือนนี้มีชุดคำถามที่เปิดใช้อยู่แล้ว ปิดชุดเดิมก่อน หรือเลือกเดือนอื่น" : `บันทึกไม่สำเร็จ: ${error.message}` }
                : { type: "success", text: draft.for_period ? `บันทึกแล้ว ชุดนี้ใช้ในเดือน ${monthLabel(draft.for_period)}` : "บันทึกแล้ว ใช้ในเดือนที่ไม่มีชุดเฉพาะ" }
        );
        if (!error) onSaved();
    };

    return (
                <section className="bg-cream border border-rule p-5 space-y-4">
                    <h3 className="text-base font-semibold text-charcoal">แก้คำถาม · {draft.title}</h3>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                            <label className={labelCls}>ชื่อแบบวัดผล</label>
                            <input className={inputCls} value={draft.title || ""} onChange={(e) => setDraft({ ...draft, title: e.target.value })} maxLength={100} />
                        </div>
                        <div>
                            <label className={labelCls}>ข้ามได้กี่วัน</label>
                            <input type="number" min={0} max={31} className={inputCls} value={draft.skip_days ?? 3} onChange={(e) => setDraft({ ...draft, skip_days: e.target.value })} />
                        </div>
                        <div>
                            <label className={labelCls}>สถานะ</label>
                            <label className="min-h-11 flex items-center gap-2 text-base text-charcoal">
                                <input type="checkbox" checked={Boolean(draft.is_active)} onChange={(e) => setDraft({ ...draft, is_active: e.target.checked })} className="w-4 h-4" />
                                เปิดใช้ (ถามพนักงาน)
                            </label>
                        </div>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="md:col-span-2">
                            <label className={labelCls}>ใช้กับเดือน</label>
                            <div className="flex gap-2">
                                <input type="month" className={`${inputCls} font-num`} value={draft.for_period || ""} onChange={(e) => setDraft({ ...draft, for_period: e.target.value || null })} />
                                {draft.for_period && (
                                    <button type="button" onClick={() => setDraft({ ...draft, for_period: null })} className="min-h-11 px-3 border border-rule text-sm whitespace-nowrap">ทุกเดือน</button>
                                )}
                            </div>
                            <p className="text-sm text-neutral mt-1">
                                {draft.for_period ? `ถามเฉพาะเดือน ${monthLabel(draft.for_period)} เปลี่ยนให้อัตโนมัติเมื่อถึงเดือน` : "ชุดหลัก ใช้ในเดือนที่ไม่มีชุดเฉพาะ"}
                            </p>
                        </div>
                    </div>
                    <div>
                        <label className={labelCls}>ข้อความต้อนรับ</label>
                        <textarea className={`${inputCls} py-2 min-h-[64px]`} value={draft.intro || ""} onChange={(e) => setDraft({ ...draft, intro: e.target.value })} maxLength={500} />
                    </div>

                    <ol className="space-y-3">
                        {draft.questions.map((q, i) => (
                            <li key={q.id} className="border border-rule p-4 space-y-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                    <span className="font-num text-sm text-neutral">ข้อ {i + 1}</span>
                                    <div className="flex gap-1">
                                        <button type="button" onClick={() => moveQ(i, -1)} className="min-h-9 px-3 border border-rule text-sm">ขึ้น</button>
                                        <button type="button" onClick={() => moveQ(i, 1)} className="min-h-9 px-3 border border-rule text-sm">ลง</button>
                                        <button type="button" onClick={() => removeQ(i)} className="min-h-9 px-3 border border-error text-error text-sm">ลบ</button>
                                    </div>
                                </div>
                                <textarea className={`${inputCls} py-2`} rows={2} value={q.text} onChange={(e) => setQ(i, { text: e.target.value })} placeholder="คำถาม" maxLength={300} />
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                    <div>
                                        <label className={labelCls}>หมวด</label>
                                        <input className={inputCls} value={q.section || ""} onChange={(e) => setQ(i, { section: e.target.value })} placeholder="เช่น การสื่อสาร" maxLength={60} />
                                    </div>
                                    <div>
                                        <label className={labelCls}>แบบคำตอบ</label>
                                        <select className={inputCls} value={q.type} onChange={(e) => setQ(i, { type: e.target.value, options: e.target.value === "multi" ? q.options || [] : undefined })}>
                                            {Object.entries(TYPE_TH).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                                        </select>
                                    </div>
                                    <label className="min-h-11 md:mt-6 flex items-center gap-2 text-base text-charcoal">
                                        <input type="checkbox" checked={Boolean(q.required)} onChange={(e) => setQ(i, { required: e.target.checked })} className="w-4 h-4" />
                                        บังคับตอบ
                                    </label>
                                </div>
                                {q.type === "multi" && (
                                    <div className="space-y-2">
                                        <label className={labelCls}>ตัวเลือก (บรรทัดละ 1 ตัว)</label>
                                        <textarea
                                            className={`${inputCls} py-2`}
                                            rows={Math.max(3, (q.options || []).length + 1)}
                                            value={(q.options || []).join("\n")}
                                            onChange={(e) => setQ(i, { options: e.target.value.split("\n") })}
                                        />
                                        <label className="flex items-center gap-2 text-base text-charcoal">
                                            <input type="checkbox" checked={Boolean(q.allowOther)} onChange={(e) => setQ(i, { allowOther: e.target.checked })} className="w-4 h-4" />
                                            มีช่อง &quot;อื่นๆ (เขียนเอง)&quot;
                                        </label>
                                    </div>
                                )}
                            </li>
                        ))}
                    </ol>

                    <div className="flex flex-wrap gap-2 justify-between">
                        <button type="button" onClick={addQ} className="min-h-11 px-4 border border-charcoal text-base font-semibold text-charcoal hover:bg-paper-2">เพิ่มคำถาม</button>
                        <button type="button" onClick={save} disabled={saving} className="min-h-11 px-6 bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold disabled:opacity-50">
                            {saving ? "กำลังบันทึก…" : "บันทึกคำถาม"}
                        </button>
                    </div>
                    <p className="text-sm text-neutral">แก้คำถามกลางเดือนได้ คนที่ตอบไปแล้วไม่ต้องตอบใหม่ ข้อที่เพิ่มใหม่จะมีคำตอบเฉพาะคนที่ตอบหลังจากนี้</p>
                </section>
    );
}
