// Monthly labour cost for Haustable's monthly owner report (owner request 2026-11-26).
//
// GET /api/payroll/summary?month=YYYY-MM with header x-payroll-key: <PAYROLL_SUMMARY_KEY>
// Returns totals only (no names, no per-person pay). Called server-to-server by
// Haustable's `hr-labor-cost` edge function; the key never reaches a browser.

import { NextResponse } from 'next/server';
import { getServiceClient } from '../../../../lib/supabaseServer';
import { summarizeMonthlyPayroll } from '../../../../utils/payrollSummary';

export const dynamic = 'force-dynamic';

export async function GET(request) {
    const expected = process.env.PAYROLL_SUMMARY_KEY || '';
    const given = request.headers.get('x-payroll-key') || '';
    if (!expected || given !== expected) {
        return NextResponse.json({ error: 'UNAUTHORIZED' }, { status: 401 });
    }

    const month = new URL(request.url).searchParams.get('month') || '';
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) {
        return NextResponse.json({ error: 'BAD_MONTH' }, { status: 400 });
    }

    try {
        return NextResponse.json(await summarizeMonthlyPayroll(getServiceClient(), month));
    } catch (err) {
        console.error('[payroll summary]', err);
        return NextResponse.json({ error: err.message || 'FAILED' }, { status: 500 });
    }
}
