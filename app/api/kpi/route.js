import { NextResponse } from 'next/server';
import { getServiceClient } from '../../../lib/supabaseServer';
import { getKpiState, validateAnswers } from '../../../lib/kpi';

export const dynamic = 'force-dynamic';

/** Same identity check as /api/checkins/punch and /api/meetings (LINE userId). */
async function findEmployee(db, userId) {
    if (!userId || !/^[A-Za-z0-9_-]+$/.test(userId)) return null;
    const { data } = await db
        .from('employees')
        .select('id, name, nickname, position, is_active')
        .or(`line_user_id.eq.${userId},line_bot_id.eq.${userId}`)
        .maybeSingle();
    return data || null;
}

function publicState(state) {
    if (!state.required) return { required: false, done: Boolean(state.done) };
    return {
        required: true,
        period: state.period,
        deadline: state.deadline,
        overdue: state.overdue,
        daysLeft: state.daysLeft,
        skipCount: state.skipCount,
        survey: {
            id: state.survey.id,
            title: state.survey.title,
            intro: state.survey.intro,
            questions: state.survey.questions,
        },
    };
}

/**
 * GET /api/kpi?userId=<LINE userId>[&peek=1]
 * Called when staff press the check-in / check-out button. The first call in a
 * month (without peek) starts that person's skip window.
 */
export async function GET(request) {
    const db = getServiceClient();
    const params = new URL(request.url).searchParams;
    const userId = (params.get('userId') || '').trim();
    const employee = await findEmployee(db, userId);
    if (!employee) return NextResponse.json({ success: true, required: false });
    // ?peek=1: page load (shows the "ทำ KPI" button) — does not start the skip window.
    const state = await getKpiState(db, employee, { touch: params.get('peek') !== '1' });
    return NextResponse.json({ success: true, ...publicState(state) });
}

/**
 * POST /api/kpi
 *   { userId, action: 'skip', intent: 'check_in' | 'check_out' }
 *   { userId, action: 'submit', answers: { [questionId]: value } }
 */
export async function POST(request) {
    const db = getServiceClient();
    let body;
    try {
        body = await request.json();
    } catch {
        return NextResponse.json({ success: false, error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    }

    const employee = await findEmployee(db, String(body?.userId || '').trim());
    if (!employee) {
        return NextResponse.json({ success: false, error: 'ไม่พบข้อมูลพนักงาน' }, { status: 403 });
    }

    const state = await getKpiState(db, employee, { touch: true });
    if (!state.required) return NextResponse.json({ success: true, required: false, done: Boolean(state.done) });
    const { survey, progress, period } = state;

    if (body.action === 'skip') {
        // After the deadline only check-out may still be skipped.
        if (state.overdue && body.intent !== 'check_out') {
            return NextResponse.json({
                success: false,
                code: 'KPI_REQUIRED',
                error: 'เลยกำหนดข้ามแล้ว ต้องทำแบบวัดผลประจำเดือนก่อนลงเวลาเข้างาน',
            }, { status: 409 });
        }
        if (progress?.id) {
            await db.from('kpi_progress')
                .update({ skip_count: (progress.skip_count || 0) + 1, last_skipped_at: new Date().toISOString() })
                .eq('id', progress.id);
        }
        return NextResponse.json({ success: true, skipped: true, daysLeft: state.daysLeft, overdue: state.overdue });
    }

    if (body.action === 'submit') {
        const check = validateAnswers(survey, body.answers || {});
        if (!check.ok) {
            return NextResponse.json({
                success: false,
                error: 'ยังตอบไม่ครบ',
                missing: check.missing,
            }, { status: 400 });
        }

        const { error: insErr } = await db.from('kpi_responses').insert({
            survey_id: survey.id,
            employee_id: employee.id,
            period,
            answers: check.answers,
        });
        // 23505 = already answered this month (double tap); treat as done.
        if (insErr && insErr.code !== '23505') {
            console.error('[kpi] insert response failed:', insErr);
            return NextResponse.json({ success: false, error: 'บันทึกไม่สำเร็จ ลองอีกครั้ง' }, { status: 500 });
        }

        if (progress?.id) {
            await db.from('kpi_progress').update({ completed_at: new Date().toISOString() }).eq('id', progress.id);
        }
        return NextResponse.json({ success: true, done: true });
    }

    return NextResponse.json({ success: false, error: 'ไม่รู้จักคำสั่ง' }, { status: 400 });
}
