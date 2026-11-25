"use client";
/* Brand v2 · monthly transfer-slip report (A4 print / Save as PDF). */

import { Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ReportShell from "../../_components/reports/ReportShell";
import { useSlipMonth, SlipMonthBody } from "../../_components/reports/SlipMonth";
import { thisMonth, monthLabel, baht } from "../../_components/reports/monthTools";

function SlipReport() {
    const params = useSearchParams();
    const router = useRouter();
    // ?month=yyyy-MM, or older ?date=yyyy-MM-dd links
    const month = params.get("month") || (params.get("date") || "").slice(0, 7) || thisMonth();
    const data = useSlipMonth(month);

    return (
        <ReportShell
            toolTitle="รายงานสลิปโอน"
            toolSub={`${monthLabel(month)} · ${data.summary.n} ใบ · ฿${baht(data.summary.total)}`}
            month={month}
            onMonth={(m) => router.replace(`/admin/report/slips?month=${m}`)}
            docTitle="รายงานสลิปโอนเงิน"
        >
            <SlipMonthBody data={data} />
        </ReportShell>
    );
}

export default function SlipReportPage() {
    return (
        <Suspense fallback={<div className="brand-v2 min-h-screen p-16 text-center text-base text-neutral">กำลังโหลด…</div>}>
            <SlipReport />
        </Suspense>
    );
}
