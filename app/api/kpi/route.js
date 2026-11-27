import { NextResponse } from 'next/server';
import { getServiceClient } from '../../../lib/supabaseServer';
import { getKpiState, validateAnswers, verifyKpiLink } from '../../../lib/kpi';

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

/** Personal link (/kpi?t=...) for staff without a phone. */
async function findEmployeeByLink(db, token) {
    const v = verifyKpiLink(token);
    if (!v) return { error: 'ลิงก์ไม่ถูกต้อง ขอลิงก์ใหม่จากเจ้าของร้าน' };
    if (v.expired) return { error: 'ลิงก์นี้หมดอายุแล้ว (ใช้ได้เฉพาะเดือนที่สร้าง) ขอลิงก์ใหม่จากเจ้าของร้าน' };
    const { data } = await db
        .from('employees')
        .select('id, name, nickname, position, is_active')
        .eq('id', v.employeeId)
        .maybeSingle();
    if (!data || data.is_active === false) return { error: 'ไม่พบข้อมูลพนักงาน' };
    return { employee: data };
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
 * GET /api/kpi?userId=<LINE userId>[&peek=1]   or   ?t=<personal link token>
 * Called when staff press the check-in / check-out button. The first call in a
 * month (without peek) starts that person's skip window.
 */
export async function GET(request) {
    const db = getServiceClient();
    const params = new URL(request.url).searchParams;
    let employee;
    if (params.get('t')) {
        const found = await findEmployeeByLink(db, params.get('t'));
        if (found.error) return NextResponse.json({ success: false, error: found.error }, { status: 403 });
        employee = found.employee;
    } else {
        employee = await findEmployee(db, (params.get('userId') || '').trim());
        if (!employee) return NextResponse.json({ success: true, required: false });
    }
    // ?peek=1: page load (shows the "ทำ KPI" button) — does not start the skip window.
    const state = await getKpiState(db, employee, { touch: params.get('peek') !== '1' });
    const name = params.get('t') ? employee.nickname || employee.name : undefined;
    return NextResponse.json({ success: true, name, ...publicState(state) });
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

    let employee;
    if (body?.token) {
        const found = await findEmployeeByLink(db, String(body.token));
        if (found.error) return NextResponse.json({ success: false, error: found.error }, { status: 403 });
        employee = found.employee;
    } else {
        employee = await findEmployee(db, String(body?.userId || '').trim());
    }
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
