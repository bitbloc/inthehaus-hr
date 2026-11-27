import { NextResponse } from 'next/server';
import { requireAdmin } from '../../../../lib/supabaseServer';
import { signKpiLink, bkkPeriod } from '../../../../lib/kpi';

export const dynamic = 'force-dynamic';

/**
 * POST /api/kpi/link { employeeId }  (admin only)
 * A personal link for staff without a phone; valid for the current Bangkok month.
 */
export async function POST(request) {
    const auth = await requireAdmin(request);
    if (auth.response) return auth.response;

    const body = await request.json().catch(() => ({}));
    const employeeId = Number(body?.employeeId);
    if (!Number.isInteger(employeeId) || employeeId <= 0) {
        return NextResponse.json({ success: false, error: 'ไม่ระบุพนักงาน' }, { status: 400 });
    }

    const period = bkkPeriod();
    const token = signKpiLink(employeeId, period);
    if (!token) {
        return NextResponse.json({ success: false, error: 'ยังไม่ได้ตั้งค่า KPI_LINK_SECRET หรือ CHANNEL_SECRET บนเซิร์ฟเวอร์' }, { status: 500 });
    }
    const origin = new URL(request.url).origin;
    return NextResponse.json({ success: true, url: `${origin}/kpi?t=${encodeURIComponent(token)}`, period });
}
