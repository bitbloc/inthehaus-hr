"use client";
/* Monthly team KPI survey (Brand v2). Full-screen, like the camera sheet.
 *   mode "gate"      : shown before the check-in / check-out photo. First a short
 *                      prompt (do it now / skip), then the form.
 *   mode "voluntary" : opened from the "ทำ KPI" card when staff have a free moment.
 * Text only, no icons or emoji. */

import { useMemo, useState } from "react";
import { motion } from "framer-motion";

const SCALE = [
  { v: 1, label: "ต้องปรับมาก" },
  { v: 2, label: "ควรปรับ" },
  { v: 3, label: "พอใช้" },
  { v: 4, label: "ดี" },
  { v: 5, label: "ดีมาก" },
];

export function deadlineText(iso) {
  if (!iso) return "";
  // Deadline is midnight Bangkok; show the last day they can still skip.
  const last = new Date(new Date(iso).getTime() - 1);
  return last.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone: "Asia/Bangkok" });
}

function isAnswered(q, answers) {
  const v = answers[q.id];
  if (q.type === "multi") return (Array.isArray(v) && v.length > 0) || Boolean((answers[`${q.id}_other`] || "").trim());
  if (q.type === "text") return Boolean((v || "").trim());
  return Boolean(v);
}

export default function KpiGate({ kpi, userId, mode = "gate", intent = "check_in", onDone, onSkip, onClose }) {
  const [step, setStep] = useState(mode === "gate" ? "prompt" : "form");
  const [answers, setAnswers] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [showMissing, setShowMissing] = useState(false);

  const questions = useMemo(() => kpi?.survey?.questions || [], [kpi]);
  const sections = useMemo(() => {
    const out = [];
    for (const q of questions) {
      const last = out[out.length - 1];
      if (last && last.title === (q.section || "")) last.items.push(q);
      else out.push({ title: q.section || "", items: [q] });
    }
    return out;
  }, [questions]);

  const required = questions.filter((q) => q.required);
  const answeredRequired = required.filter((q) => isAnswered(q, answers)).length;
  const complete = answeredRequired === required.length;

  // After the deadline, check-in cannot be skipped. Check-out always can.
  const canSkip = mode === "gate" && (!kpi.overdue || intent === "check_out");
  const actionWord = intent === "check_out" ? "ออกงาน" : "เข้างาน";

  const set = (id, v) => setAnswers((a) => ({ ...a, [id]: v }));
  const toggle = (id, opt) =>
    setAnswers((a) => {
      const cur = Array.isArray(a[id]) ? a[id] : [];
      return { ...a, [id]: cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt] };
    });

  const skip = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/kpi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "skip", intent }),
      });
      const json = await res.json().catch(() => ({}));
      if (json.code === "KPI_REQUIRED") {
        setError(json.error);
        setStep("form");
        return;
      }
      onSkip?.();
    } catch {
      onSkip?.(); // network trouble must not stop the punch
    } finally {
      setBusy(false);
    }
  };

  const submit = async () => {
    if (!complete) {
      setShowMissing(true);
      setError(`ยังตอบไม่ครบ เหลืออีก ${required.length - answeredRequired} ข้อ`);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/kpi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, action: "submit", answers }),
      });
      const json = await res.json().catch(() => ({}));
      if (!json.success) {
        setShowMissing(true);
        setError(json.error || "บันทึกไม่สำเร็จ ลองอีกครั้ง");
        return;
      }
      onDone?.();
    } catch {
      setError("ส่งไม่สำเร็จ ตรวจสัญญาณเน็ตแล้วลองอีกครั้ง");
    } finally {
      setBusy(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      transition={{ duration: 0.16 }}
      className="brand-v2 fixed inset-0 z-50 flex flex-col"
      role="dialog" aria-modal="true" aria-labelledby="kpi-title"
    >
      <div className="bg-plum text-cream border-b border-plum-3 flex items-stretch shrink-0">
        <div className="flex-1 px-4 py-3 min-w-0">
          <h3 id="kpi-title" className="font-head text-2xl">{kpi?.survey?.title || "แบบวัดผลประจำเดือน"}</h3>
          {step === "form" && (
            <p className="text-sm text-on-plum-2">
              ตอบแล้ว <span className="font-num">{answeredRequired}/{required.length}</span> ข้อที่ต้องตอบ
            </p>
          )}
        </div>
        {(mode === "voluntary" || canSkip) && (
          <button
            type="button"
            onClick={mode === "voluntary" ? onClose : skip}
            disabled={busy}
            className="min-w-16 min-h-14 px-4 border-l border-plum-3 text-base font-semibold hover:bg-plum-2 transition-colors duration-150 disabled:opacity-50"
          >
            {mode === "voluntary" ? "ปิด" : "ข้าม"}
          </button>
        )}
      </div>

      {step === "prompt" ? (
        <div className="flex-1 overflow-y-auto p-4 flex flex-col justify-center">
          <div className="w-full max-w-sm mx-auto flex flex-col gap-4">
            <div className="bg-cream border border-rule px-4 py-4">
              <p className="text-sm font-semibold text-neutral">ก่อนลงเวลา{actionWord}</p>
              <p className="text-xl font-semibold text-charcoal mt-1">เดือนนี้ยังไม่ได้ทำแบบวัดผล</p>
              <p className="text-base text-subtle mt-2">{kpi?.survey?.intro || "ใช้เวลาประมาณ 3 นาที"}</p>
              {kpi.overdue ? (
                <p className="text-base font-semibold text-error mt-3">
                  {intent === "check_out"
                    ? "เลยกำหนดข้ามแล้ว ออกงานได้ แต่ต้องทำก่อนเข้างานครั้งถัดไป"
                    : "เลยกำหนดข้ามแล้ว ต้องทำก่อนจึงจะลงเวลาเข้างานได้"}
                </p>
              ) : (
                <p className="text-base text-charcoal mt-3">
                  ข้ามได้อีก <span className="font-num font-semibold">{kpi.daysLeft}</span> วัน (ถึง {deadlineText(kpi.deadline)})
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={() => setStep("form")}
              className="w-full min-h-14 bg-charcoal hover:bg-charcoal-2 text-cream text-lg font-semibold transition-colors duration-150"
            >
              ทำตอนนี้
            </button>
            {canSkip && (
              <button
                type="button"
                onClick={skip}
                disabled={busy}
                className="w-full min-h-12 bg-cream hover:bg-paper-2 border border-charcoal text-base font-semibold text-charcoal transition-colors duration-150 disabled:opacity-50"
              >
                {busy ? "กำลังข้าม…" : `ข้ามไปก่อน ถ่ายรูป${actionWord}เลย`}
              </button>
            )}
            {error && <p className="text-base text-error">{error}</p>}
          </div>
        </div>
      ) : (
        <>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-lg mx-auto p-4 flex flex-col gap-6 pb-8">
              {mode === "voluntary" && kpi?.survey?.intro && <p className="text-base text-subtle">{kpi.survey.intro}</p>}
              {sections.map((s, si) => (
                <section key={si} className="flex flex-col gap-3">
                  {s.title && <h4 className="text-sm font-semibold text-neutral border-b border-rule pb-1">{s.title}</h4>}
                  {s.items.map((q) => {
                    const missing = showMissing && q.required && !isAnswered(q, answers);
                    const n = questions.indexOf(q) + 1;
                    return (
                      <fieldset key={q.id} className={`bg-cream border px-4 py-3 ${missing ? "border-error" : "border-rule"}`}>
                        <legend className="sr-only">{q.text}</legend>
                        <p className="text-base text-charcoal">
                          <span className="font-num text-neutral mr-1">{n}.</span>
                          {q.text}
                          {!q.required && <span className="text-sm text-neutral"> (ไม่บังคับ)</span>}
                        </p>

                        {q.type === "scale" && (
                          <div className="grid grid-cols-5 gap-px bg-rule border border-rule mt-3">
                            {SCALE.map((o) => {
                              const on = answers[q.id] === o.v;
                              return (
                                <button
                                  key={o.v}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => set(q.id, o.v)}
                                  className={`min-h-16 px-1 py-2 flex flex-col items-center justify-center transition-colors duration-150 ${on ? "bg-charcoal text-cream" : "bg-cream hover:bg-paper-2 text-charcoal"}`}
                                >
                                  <span className="font-num text-lg">{o.v}</span>
                                  <span className={`text-xs leading-tight text-center ${on ? "text-cream" : "text-neutral"}`}>{o.label}</span>
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {q.type === "multi" && (
                          <div className="flex flex-col gap-px bg-rule border border-rule mt-3">
                            {(q.options || []).map((opt) => {
                              const on = Array.isArray(answers[q.id]) && answers[q.id].includes(opt);
                              return (
                                <button
                                  key={opt}
                                  type="button"
                                  aria-pressed={on}
                                  onClick={() => toggle(q.id, opt)}
                                  className={`min-h-12 px-3 py-2 flex items-center gap-3 text-left text-base transition-colors duration-150 ${on ? "bg-charcoal text-cream" : "bg-cream hover:bg-paper-2 text-charcoal"}`}
                                >
                                  <span className={`w-4 h-4 shrink-0 border ${on ? "bg-cream border-cream" : "border-charcoal"}`} aria-hidden="true" />
                                  {opt}
                                </button>
                              );
                            })}
                            {q.allowOther && (
                              <input
                                type="text"
                                value={answers[`${q.id}_other`] || ""}
                                onChange={(e) => set(`${q.id}_other`, e.target.value)}
                                placeholder="อื่นๆ (เขียนเอง)"
                                maxLength={300}
                                className="min-h-12 px-3 bg-cream text-base text-charcoal placeholder:text-neutral"
                              />
                            )}
                          </div>
                        )}

                        {q.type === "text" && (
                          <textarea
                            value={answers[q.id] || ""}
                            onChange={(e) => set(q.id, e.target.value)}
                            rows={3}
                            maxLength={1000}
                            className="w-full mt-3 px-3 py-2 bg-cream border border-rule text-base text-charcoal"
                          />
                        )}
                        {missing && <p className="text-sm text-error mt-2">ข้อนี้ต้องตอบ</p>}
                      </fieldset>
                    );
                  })}
                </section>
              ))}
            </div>
          </div>

          <div className="shrink-0 border-t border-rule bg-cream p-4">
            <div className="max-w-lg mx-auto flex flex-col gap-2">
              {error && <p className="text-base text-error">{error}</p>}
              <button
                type="button"
                onClick={submit}
                disabled={busy}
                className="w-full min-h-14 bg-charcoal hover:bg-charcoal-2 text-cream text-lg font-semibold transition-colors duration-150 disabled:opacity-50"
              >
                {busy ? "กำลังส่ง…" : mode === "gate" ? `ส่ง แล้วถ่ายรูป${actionWord}` : "ส่งคำตอบ"}
              </button>
            </div>
          </div>
        </>
      )}
    </motion.div>
  );
}
