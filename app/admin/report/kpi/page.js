"use client";
/* Brand v2 · monthly team survey report (A4 print / Save as PDF). */

import { Suspense, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReportShell from "../../_components/reports/ReportShell";
import { useKpiMonth, KpiMonthBody } from "../../_components/reports/KpiMonth";
import { thisMonth, monthLabel } from "../../_components/reports/monthTools";

function KpiReport() {
    const params = useSearchParams();
    const router = useRouter();
    const month = params.get("month") || thisMonth();
    const data = useKpiMonth(month);
    const [showNames, setShowNames] = useState(false);

    return (
        <ReportShell
            toolTitle="สรุปแบบวัดผลประจำเดือน"
            toolSub={`${monthLabel(month)} · ตอบแล้ว ${data.done ?? 0}/${data.staff?.length ?? 0} คน`}
            month={month}
            onMonth={(m) => router.replace(`/admin/report/kpi?month=${m}`)}
            docTitle={data.survey?.title || "แบบวัดผลประจำเดือน"}
            footNote="คำตอบจากแบบวัดผลในหน้าลงเวลา เพื่อนในทีมไม่เห็นคำตอบของกันและกัน"
            toolExtra={
                <label className="min-h-12 px-3 flex items-center gap-2 text-base text-cream cursor-pointer select-none">
                    <input type="checkbox" checked={showNames} onChange={(e) => setShowNames(e.target.checked)} className="w-4 h-4 accent-cream" />
                    แสดงชื่อผู้ตอบ
                </label>
            }
        >
            <KpiMonthBody data={data} showNames={showNames} />
        </ReportShell>
    );
}

export default function KpiReportPage() {
    return (
        <Suspense fallback={<div className="brand-v2 min-h-screen p-16 text-center text-base text-neutral">กำลังโหลด…</div>}>
            <KpiReport />
        </Suspense>
    );
}
