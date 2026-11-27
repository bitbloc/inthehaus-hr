// Server-only helpers for the monthly team KPI survey (migrations/20261127_team_kpi.sql).
// Used by /api/kpi, /api/checkins/punch and the reminder cron.
//
// Rules
//   * Staff who are active and not owner/CEO answer once per Bangkok month.
//   * The first time they are asked in a month starts the window: they may skip
//     until midnight (Bangkok) `skip_days` days later (kpi_progress.deadline_at).
//   * After the deadline, check-in is refused until the survey is done.
//     Check-out is never refused.
//   * Every helper fails open: if the tables are missing or a query errors,
//     staff are not blocked.

import { createHmac, timingSafeEqual } from 'crypto';

const BKK_MS = 7 * 3600_000;

export const SCALE_LABELS = ['', 'ต้องปรับมาก', 'ควรปรับ', 'พอใช้', 'ดี', 'ดีมาก'];

/** Bangkok month "YYYY-MM" for a Date. */
export function bkkPeriod(date = new Date()) {
    return new Date(date.getTime() + BKK_MS).toISOString().slice(0, 7);
}

/** Midnight (Bangkok) `days` days after the Bangkok date of `from`, as a Date. */
export function deadlineFrom(from, days) {
    const local = new Date(from.getTime() + BKK_MS);
    const midnightLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + days);
    return new Date(midnightLocal - BKK_MS);
}

export function isOwnerPosition(position) {
    const p = String(position || '').toLowerCase();
    return p.includes('owner') || p.includes('ceo');
}

/** Whole Bangkok days left before the deadline, counting today (0 when overdue). */
export function daysLeft(deadline, now = new Date()) {
    const ms = new Date(deadline).getTime() - now.getTime();
    return ms <= 0 ? 0 : Math.ceil(ms / 86_400_000);
}

/**
 * The question set for this Bangkok month: an active set whose for_period is
 * this month, else the newest active default set (for_period NULL).
 */
export async function getActiveSurvey(db, now = new Date()) {
    const { data, error } = await db
        .from('kpi_surveys')
        .select('id, title, intro, questions, skip_days, for_period, updated_at')
        .eq('is_active', true)
        .order('updated_at', { ascending: false });
    if (error) throw error;
    const period = bkkPeriod(now);
    const list = data || [];
    return list.find((s) => s.for_period === period) || list.find((s) => !s.for_period) || null;
}

/**
 * KPI state for one employee this month.
 * touch=true creates the progress row the first time (this starts the skip window).
 * Returns { required:false } when the employee is exempt, already done, or on any error.
 */
export async function getKpiState(db, employee, { touch = false, now = new Date() } = {}) {
    try {
        if (!employee || employee.is_active === false || isOwnerPosition(employee.position)) return { required: false };
        const survey = await getActiveSurvey(db, now);
        if (!survey || !Array.isArray(survey.questions) || survey.questions.length === 0) return { required: false };

        const period = bkkPeriod(now);
        let { data: progress, error } = await db
            .from('kpi_progress')
            .select('*')
            .eq('survey_id', survey.id)
            .eq('employee_id', employee.id)
            .eq('period', period)
            .maybeSingle();
        if (error) throw error;

        if (progress?.completed_at) return { required: false, done: true, survey, period };

        if (!progress && touch) {
            const row = {
                survey_id: survey.id,
                employee_id: employee.id,
                period,
                first_seen_at: now.toISOString(),
                deadline_at: deadlineFrom(now, survey.skip_days ?? 3).toISOString(),
            };
            const ins = await db.from('kpi_progress').insert(row).select('*').maybeSingle();
            if (ins.error) {
                // Another request created it first: read it back.
                const again = await db.from('kpi_progress').select('*')
                    .eq('survey_id', survey.id).eq('employee_id', employee.id).eq('period', period).maybeSingle();
                if (again.error) throw again.error;
                progress = again.data;
            } else {
                progress = ins.data || row;
            }
            if (progress?.completed_at) return { required: false, done: true, survey, period };
        }

        const deadline = progress ? new Date(progress.deadline_at) : deadlineFrom(now, survey.skip_days ?? 3);
        return {
            required: true,
            survey,
            period,
            progress: progress || null,
            deadline: deadline.toISOString(),
            overdue: now >= deadline,
            daysLeft: daysLeft(deadline, now),
            skipCount: progress?.skip_count || 0,
        };
    } catch (e) {
        console.warn('[kpi] state check failed, not blocking:', e?.message || e);
        return { required: false, error: true };
    }
}

/** Check answers against the survey. Returns { ok, answers, missing[] } with cleaned answers. */
export function validateAnswers(survey, raw) {
    const answers = {};
    const missing = [];
    for (const q of survey.questions || []) {
        const v = raw?.[q.id];
        if (q.type === 'scale') {
            const n = Number(v);
            if (Number.isInteger(n) && n >= 1 && n <= 5) answers[q.id] = n;
        } else if (q.type === 'multi') {
            const allowed = new Set(q.options || []);
            const picked = Array.isArray(v) ? v.map(String).filter((x) => allowed.has(x)) : [];
            const other = typeof raw?.[`${q.id}_other`] === 'string' ? raw[`${q.id}_other`].trim().slice(0, 300) : '';
            if (picked.length) answers[q.id] = picked;
            if (q.allowOther && other) answers[`${q.id}_other`] = other;
        } else {
            const t = typeof v === 'string' ? v.trim().slice(0, 1000) : '';
            if (t) answers[q.id] = t;
        }
        const answered = answers[q.id] !== undefined || answers[`${q.id}_other`] !== undefined;
        if (q.required && !answered) missing.push(q.id);
    }
    return { ok: missing.length === 0, answers, missing };
}

/**
 * Text for the daily LINE group reminder: who has not answered this month.
 * Returns null when there is no active survey, everyone is done, or on error.
 */
export async function buildKpiReminderText(db, now = new Date()) {
    try {
        const survey = await getActiveSurvey(db, now);
        if (!survey || !Array.isArray(survey.questions) || survey.questions.length === 0) return null;
        const period = bkkPeriod(now);
        const [{ data: emps, error: e1 }, { data: prog, error: e2 }] = await Promise.all([
            db.from('employees').select('id, name, nickname, position, is_active'),
            db.from('kpi_progress').select('employee_id, deadline_at, completed_at').eq('survey_id', survey.id).eq('period', period),
        ]);
        if (e1 || e2) throw e1 || e2;
        const finished = new Set((prog || []).filter((p) => p.completed_at).map((p) => p.employee_id));
        const deadlineOf = new Map((prog || []).filter((p) => !p.completed_at).map((p) => [p.employee_id, new Date(p.deadline_at)]));
        const pending = (emps || []).filter((e) => e.is_active !== false && !isOwnerPosition(e.position) && !finished.has(e.id));
        if (pending.length === 0) return null;

        const lines = pending.map((e) => {
            const name = e.nickname || e.name;
            const d = deadlineOf.get(e.id);
            if (!d) return `• ${name}`;
            return now >= d ? `• ${name} (เลยกำหนดแล้ว ต้องทำก่อนเข้างาน)` : `• ${name} (ข้ามได้อีก ${daysLeft(d, now)} วัน)`;
        });
        return [
            `${survey.title || 'แบบวัดผลประจำเดือน'}: ยังไม่ได้ทำ ${pending.length} คน`,
            ...lines,
            '',
            'ว่างเมื่อไหร่ กด "ทำเลย" ในหน้าลงเวลาได้เลย ใช้เวลาประมาณ 3 นาที',
        ].join('\n');
    } catch (e) {
        console.warn('[kpi] reminder skipped:', e?.message || e);
        return null;
    }
}

// --- Personal links for staff without a phone ------------------------------
// Token "<employeeId>.<YYYY-MM>.<sig>" — valid only in that Bangkok month.

function linkSecret() {
    return process.env.KPI_LINK_SECRET || process.env.CHANNEL_SECRET || '';
}

function linkSig(employeeId, period) {
    return createHmac('sha256', linkSecret()).update(`kpi-link:${employeeId}:${period}`).digest('base64url').slice(0, 22);
}

/** Returns the token, or null when no secret is configured. */
export function signKpiLink(employeeId, period = bkkPeriod()) {
    if (!linkSecret()) return null;
    return `${employeeId}.${period}.${linkSig(employeeId, period)}`;
}

/** { employeeId } when valid for this month, { expired: true } for an older month, else null. */
export function verifyKpiLink(token, now = new Date()) {
    if (!linkSecret() || typeof token !== 'string') return null;
    const m = token.match(/^(\d{1,12})\.(\d{4}-\d{2})\.([A-Za-z0-9_-]{22})$/);
    if (!m) return null;
    const [, id, period, sig] = m;
    const want = Buffer.from(linkSig(id, period));
    const got = Buffer.from(sig);
    if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
    if (period !== bkkPeriod(now)) return { expired: true };
    return { employeeId: Number(id) };
}
