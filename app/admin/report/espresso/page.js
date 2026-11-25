"use client";
/* Brand v2 · monthly espresso test-shot report (A4 print / Save as PDF). */

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReportShell from "../../_components/reports/ReportShell";
import { useEspressoMonth, EspressoMonthBody } from "../../_components/reports/EspressoMonth";
import { thisMonth, monthLabel } from "../../_components/reports/monthTools";

function EspressoReport() {
    const params = useSearchParams();
    const router = useRouter();
    // ?month=yyyy-MM, or older ?date=yyyy-MM-dd links
    const month = params.get("month") || (params.get("date") || "").slice(0, 7) || thisMonth();
    const data = useEspressoMonth(month);

    return (
        <ReportShell
            toolTitle="รายงานเอสเปรสโซ"
            toolSub={`${monthLabel(month)} · ${data.summary.n} ช็อต`}
            month={month}
            onMonth={(m) => router.replace(`/admin/report/espresso?month=${m}`)}
            docTitle="รายงานช็อตทดสอบเอสเปรสโซ"
        >
            <EspressoMonthBody data={data} />
        </ReportShell>
    );
}

export default function EspressoReportPage() {
    return (
        <Suspense fallback={<div className="brand-v2 min-h-screen p-16 text-center text-base text-neutral">กำลังโหลด…</div>}>
            <EspressoReport />
        </Suspense>
    );
}
