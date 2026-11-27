"use client";
/* Personal survey link for staff without a phone: /kpi?t=<token>.
 * Opens on any device (shop tablet, computer). No LINE login. */

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import KpiGate from "../checkin/components/KpiGate";

function Shell({ children }) {
  return (
    <div className="brand-v2 min-h-screen flex flex-col">
      <header className="bg-plum text-cream border-b border-plum-3 px-4 py-3">
        <h1 className="font-head text-2xl">แบบวัดผลประจำเดือน</h1>
      </header>
      <main className="flex-1 p-4 flex flex-col justify-center">
        <div className="w-full max-w-sm mx-auto bg-cream border border-rule px-4 py-5">{children}</div>
      </main>
    </div>
  );
}

function KpiLink() {
  const token = useSearchParams().get("t") || "";
  const [state, setState] = useState({ loading: true });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    fetch(`/api/kpi?t=${encodeURIComponent(token)}&peek=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((j) => alive && setState({ loading: false, ...j }))
      .catch(() => alive && setState({ loading: false, success: false, error: "เชื่อมต่อไม่ได้ ตรวจสัญญาณเน็ตแล้วลองใหม่" }));
    return () => { alive = false; };
  }, [token]);

  if (!token) return <Shell><p className="text-base text-error">ลิงก์ไม่ครบ ขอลิงก์ใหม่จากเจ้าของร้าน</p></Shell>;
  if (state.loading) return <Shell><p className="text-base text-neutral">กำลังโหลด…</p></Shell>;
  if (!state.success) return <Shell><p className="text-base text-error">{state.error || "เปิดลิงก์ไม่สำเร็จ"}</p></Shell>;

  if (state.done || !state.required) {
    return (
      <Shell>
        <p className="text-sm font-semibold text-neutral">{state.name}</p>
        <p className="text-xl font-semibold text-charcoal mt-1">{state.done ? "เดือนนี้ทำแล้ว" : "ตอนนี้ยังไม่มีแบบวัดผลให้ทำ"}</p>
        {state.done && <p className="text-base text-subtle mt-2">ขอบคุณที่ช่วยตอบ ปิดหน้านี้ได้เลย</p>}
      </Shell>
    );
  }

  return (
    <>
      <Shell>
        <p className="text-sm font-semibold text-neutral">แบบวัดผลของ</p>
        <p className="text-2xl font-semibold text-charcoal">{state.name}</p>
        <p className="text-base text-subtle mt-2">{state.survey?.intro || "ใช้เวลาประมาณ 3 นาที"}</p>
        <p className="text-sm text-neutral mt-2">ถ้าไม่ใช่ชื่อคุณ อย่ากดทำ แจ้งเจ้าของร้าน</p>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full min-h-14 mt-5 bg-charcoal hover:bg-charcoal-2 text-cream text-lg font-semibold transition-colors duration-150"
        >
          เริ่มทำ
        </button>
      </Shell>
      {open && (
        <KpiGate
          kpi={state}
          token={token}
          mode="voluntary"
          onDone={() => { setOpen(false); setState((s) => ({ ...s, done: true, required: false })); }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

export default function KpiLinkPage() {
  return (
    <Suspense fallback={<div className="brand-v2 min-h-screen p-16 text-center text-base text-neutral">กำลังโหลด…</div>}>
      <KpiLink />
    </Suspense>
  );
}
