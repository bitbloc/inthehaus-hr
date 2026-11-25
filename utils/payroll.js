import { differenceInMinutes } from "date-fns";

/*
 * Payroll engine (rules confirmed by the owner, 2026-11-25):
 * - Every roster row counts (no draft stage): worked = paid, no punches = absent.
 * - One day = one unit. All slots of a day share one set of punches (no double counting).
 * - Punches are looked for from 4 h before the first slot to 6 h after the last one
 *   (days with no schedule: 05:00 to 05:00 next day), and a punch is used by one day only.
 * - Time away mid-day (check out, then back in) is not paid; the first 60 min per day
 *   are exempt (meal break). Scheduled breaks between split slots are never paid.
 * - Forgot to check out: paid up to the scheduled end, no OT, flagged, counts as incomplete.
 * - OT = minutes worked beyond the scheduled minutes, counted in blocks of 60+ min,
 *   at one shop-wide rate (payroll_config.ot_rate).
 * - Off-day / unscheduled work: hourly, OT after 8 h.
 * - Per-shift pay: shift.rate, else double (>= 11 h, payroll_config.double_shift_rate),
 *   short (<= 5.5 h, rush_4h or hourly), else daily_rate.
 * - Monthly: base salary + off-day/unscheduled pay + OT − time-away deduction.
 * - Social security only when payroll_config.sso_enabled = 1 (off for now).
 * - Adjustments: bonus adds, deduction / advance subtract.
 * All times are Bangkok (UTC+7) regardless of the browser's time zone.
 */

const TZ = '+07:00';
const DAY_MS = 24 * 60 * 60 * 1000;
const MEAL_EXEMPT_MINS = 60;

const at = (dateStr, hhmm) => new Date(`${dateStr}T${String(hhmm || '00:00').slice(0, 5)}:00${TZ}`);
const bkkDateStr = (d) => new Date(d).toLocaleDateString('sv-SE', { timeZone: 'Asia/Bangkok' });
const nextDateStr = (dateStr) => bkkDateStr(new Date(at(dateStr, '12:00').getTime() + DAY_MS));
const fmtTime = (d) => (d ? new Date(d).toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' }) : '-');
const minsBetween = (a, b) => Math.max(0, Math.floor((b - a) / 60000)); // whole minutes, seconds dropped (as before)
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const overlapMins = (a, b) => minsBetween(new Date(Math.max(a.start, b.start)), new Date(Math.min(a.end, b.end)));

/**
 * Helper to extract local date string (YYYY-MM-DD) from a log timestamp with Bangkok Timezone Guard (UTC+7)
 */
export const getLogLocalDateStr = (timestamp) => {
    if (!timestamp) return '';
    try {
        return bkkDateStr(timestamp);
    } catch {
        return '';
    }
};

const slotRange = (dateStr, startHHMM, endHHMM) => {
    const start = at(dateStr, startHHMM);
    let end = at(dateStr, endHHMM);
    if (end <= start) end = new Date(end.getTime() + DAY_MS); // overnight
    return { start, end };
};

/**
 * Take one day's punches from a window. Punches already used by an earlier day are skipped,
 * and the ones taken here are marked used.
 * Returns first check-in, final check-out (null when the day ends checked in),
 * and the away intervals (check-out → next check-in).
 */
function takeDayPunches(punches, used, winStart, winEnd) {
    const inWin = punches.filter(p => !used.has(p.key) && p.t >= winStart && p.t <= winEnd);
    const firstIn = inWin.findIndex(p => p.type === 'check_in');
    if (firstIn === -1) {
        const outs = inWin.filter(p => p.type === 'check_out');
        const lastOut = outs[outs.length - 1];
        outs.forEach(p => used.add(p.key));
        return { checkIn: null, checkOut: lastOut ? lastOut.t : null, away: [], endedIn: false };
    }
    const seq = inWin.slice(firstIn);
    seq.forEach(p => used.add(p.key));
    let state = 'in';
    let lastOut = null;
    const away = [];
    for (const p of seq.slice(1)) {
        if (p.type === 'check_out') {
            lastOut = p.t;
            state = 'out';
        } else if (p.type === 'check_in' && state === 'out') {
            away.push({ start: lastOut, end: p.t });
            state = 'in';
        }
    }
    return { checkIn: seq[0].t, checkOut: state === 'out' ? lastOut : null, away, endedIn: state === 'in' };
}

/**
 * Minutes an employee was checked out in the middle of a work day (kept for callers;
 * the engine itself uses takeDayPunches).
 */
export function awayMinutesBetween(empLogs, checkIn, checkOut) {
    if (!checkIn || !checkOut) return 0;
    const inner = [...(empLogs || [])]
        .map(l => ({ type: l.action_type, t: new Date(l.timestamp) }))
        .filter(l => l.t > checkIn && l.t < checkOut)
        .sort((a, b) => a.t - b.t);
    let away = 0;
    let outAt = null;
    inner.forEach(l => {
        if (l.type === 'check_out') {
            if (!outAt) outAt = l.t;
        } else if (l.type === 'check_in' && outAt) {
            away += Math.max(0, differenceInMinutes(l.t, outAt));
            outAt = null;
        }
    });
    return away;
}

/**
 * Calculates payroll, OT, and attendance stats for all employees using roster_transactions.
 */
export const calculatePayroll = (employees, logs, transactions, shifts, payrollConfig, deductions, selectedMonth, weeklySchedules = []) => {
    const cfg = payrollConfig || {};
    const shopOtRate = Number(cfg.ot_rate ?? 50);
    const shopDoubleRate = Number(cfg.double_shift_rate ?? 700);
    const ssoEnabled = Number(cfg.sso_enabled || 0) === 1;
    const ssoPct = Number(cfg.sso_rate_pct ?? 5);
    const ssoCap = Number(cfg.sso_cap_thb ?? 750);

    const [year, month] = selectedMonth.split('-').map(Number);
    const daysInMonth = new Date(year, month, 0).getDate();
    const monthDates = Array.from({ length: daysInMonth }, (_, i) => `${year}-${String(month).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`);
    const todayStr = bkkDateStr(new Date());
    const now = new Date();

    const logsMap = new Map();
    (logs || []).forEach(log => {
        if (!logsMap.has(log.employee_id)) logsMap.set(log.employee_id, []);
        logsMap.get(log.employee_id).push(log);
    });

    const deductionsMap = new Map();
    (deductions || []).forEach(d => {
        if (d.month && d.month !== selectedMonth) return; // only this month's adjustments
        if (!deductionsMap.has(d.employee_id)) deductionsMap.set(d.employee_id, []);
        deductionsMap.get(d.employee_id).push(d);
    });

    const txMap = new Map();
    (transactions || []).forEach(tx => {
        const eid = String(tx.employee_id);
        if (!txMap.has(eid)) txMap.set(eid, {});
        if (!txMap.get(eid)[tx.date]) txMap.get(eid)[tx.date] = [];
        txMap.get(eid)[tx.date].push(tx);
    });

    // Active staff, plus anyone deactivated who still has punches or shifts this month
    const included = (employees || []).filter(e =>
        e.is_active !== false ||
        (logsMap.get(e.id) || []).some(l => monthDates.includes(bkkDateStr(l.timestamp))) ||
        txMap.has(String(e.id))
    );

    return included.map(emp => {
        let totalSalary = 0;      // shift / hourly wages (monthly: added on top of base below)
        let extraDayPay = 0;      // off-day + unscheduled pay (kept separately for monthly staff)
        let totalOTHours = 0;
        let totalOTPay = 0;
        let totalRegularHours = 0;
        let workDays = 0;
        let lateCount = 0;
        let absentCount = 0;
        let incompleteCount = 0;
        let offDayWorkCount = 0;
        let totalAwayMins = 0;    // deducted minutes (after meal exemption)
        let awayDeduct = 0;
        const dailyDetails = [];

        const isOwner = Boolean((emp.position || '').toLowerCase().includes('owner') || (emp.position || '').toLowerCase().includes('ceo'));
        const rates = emp.shift_rates || {};
        const wageType = rates.wage_type || (emp.employment_status === 'Fulltime' && emp.base_salary > 0 ? 'monthly' : (rates.morning || rates.evening ? 'daily' : 'hourly'));
        const baseSalary = Number(emp.base_salary || rates.base_salary || 0);
        const hourlyRate = Number(rates.hourly_rate || cfg.hourly_rate || 50);
        const otRate = shopOtRate;
        const doubleRate = Number(rates.double || rates.double_shift_rate || shopDoubleRate);

        const punches = (logsMap.get(emp.id) || [])
            .map((l, i) => ({ key: l.id ?? `${l.timestamp}_${i}`, type: l.action_type, t: new Date(l.timestamp) }))
            .filter(p => p.type === 'check_in' || p.type === 'check_out')
            .sort((a, b) => a.t - b.t);
        const used = new Set();
        const empTxs = txMap.get(String(emp.id)) || {};

        const pushDay = (row) => dailyDetails.push({ slot_type: 'MAIN', scheduled_in: '-', scheduled_out: '-', in: '-', out: '-', wage: 0, ot: 0, ot_hours: 0, regular_hours: 0, away_mins: 0, ...row });

        // Away minutes after the daily meal exemption, and the part of it inside scheduled slots
        // Time away outside scheduled breaks, minus the daily meal exemption.
        // Scheduled breaks (gaps between split slots) are handled separately and never paid.
        const awayAfterExemption = (away, slotRanges, gaps = []) => {
            const raw = away.reduce((s, a) => s + minsBetween(a.start, a.end), 0);
            const inGaps = away.reduce((s, a) => s + gaps.reduce((x, g) => x + overlapMins(a, g), 0), 0);
            const outside = Math.max(0, raw - inGaps);
            const exempt = Math.min(outside, MEAL_EXEMPT_MINS);
            const inSlots = away.reduce((s, a) => s + slotRanges.reduce((x, r) => x + overlapMins(a, r), 0), 0);
            return { raw, counted: outside - exempt, countedInSlots: Math.max(0, inSlots - exempt) };
        };

        // Hourly-paid day with no schedule (off day / unscheduled)
        const payFreeDay = (dateStr, label, statusWork, statusMissedOut, statusMissedIn) => {
            const p = takeDayPunches(punches, used, at(dateStr, '05:00'), at(nextDateStr(dateStr), '05:00'));
            if (p.checkIn && p.checkOut) {
                const aw = awayAfterExemption(p.away, []);
                const worked = Math.max(0, minsBetween(p.checkIn, p.checkOut) - aw.counted);
                if (worked <= 0) {
                    pushDay({ date: dateStr, shift: label, in: fmtTime(p.checkIn), out: fmtTime(p.checkOut), status: 'OFF' });
                    return;
                }
                const regularMins = Math.min(worked, 8 * 60);
                let otMins = Math.max(0, worked - 8 * 60);
                if (otMins < 60) otMins = 0;
                const wage = r2(regularMins / 60 * hourlyRate);
                const ot = r2(otMins / 60 * otRate);
                totalRegularHours += regularMins / 60;
                totalOTHours += otMins / 60;
                extraDayPay += wage;
                totalOTPay += ot;
                totalAwayMins += aw.counted;
                workDays++;
                offDayWorkCount++;
                pushDay({ date: dateStr, shift: label, in: fmtTime(p.checkIn), out: fmtTime(p.checkOut), wage, ot, ot_hours: otMins / 60, regular_hours: regularMins / 60, away_mins: aw.counted, status: statusWork });
            } else if (p.checkIn && now < at(nextDateStr(dateStr), '05:00')) {
                pushDay({ date: dateStr, shift: label, in: fmtTime(p.checkIn), status: 'IN PROGRESS' });
            } else if (p.checkIn) {
                if (!isOwner) incompleteCount++;
                offDayWorkCount++;
                pushDay({ date: dateStr, shift: label, in: fmtTime(p.checkIn), status: statusMissedOut });
            } else if (p.checkOut) {
                if (!isOwner) incompleteCount++;
                offDayWorkCount++;
                pushDay({ date: dateStr, shift: label, out: fmtTime(p.checkOut), status: statusMissedIn });
            } else if (label === 'OFF') {
                pushDay({ date: dateStr, shift: 'OFF', status: 'OFF' });
            }
        };

        monthDates.forEach(dateStr => {
            let dailyTxs = empTxs[dateStr] || [];

            // Fallback: weekly template (DB day_of_week: Mon = 0 … Sun = 6)
            if (dailyTxs.length === 0 && weeklySchedules.length > 0) {
                const dbDow = (at(dateStr, '12:00').getUTCDay() + 6) % 7;
                const ws = weeklySchedules.find(s => s.employee_id === emp.id && s.day_of_week === dbDow);
                if (ws?.is_off) dailyTxs = [{ is_off: true, slot_type: 'MAIN' }];
                else if (ws?.shift_id) dailyTxs = [{ slot_type: 'MAIN', shift_id: ws.shift_id, custom_start_time: ws.custom_start_time || null, custom_end_time: ws.custom_end_time || null, is_off: false }];
            }

            const workSlots = dailyTxs
                .filter(t => !t.is_off)
                .map(t => {
                    const shift = (shifts || []).find(s => s.id === t.shift_id);
                    const st = (t.custom_start_time || shift?.start_time || '').slice(0, 5);
                    const en = (t.custom_end_time || shift?.end_time || '').slice(0, 5);
                    if (!st || !en) return null;
                    return { tx: t, shift, st, en, ...slotRange(dateStr, st, en) };
                })
                .filter(Boolean)
                .sort((a, b) => a.start - b.start);

            // ── Case A: scheduled work ──────────────────────────────────────
            if (workSlots.length > 0) {
                const regular = workSlots.filter(s => s.tx.slot_type !== 'OVERTIME');
                const base = regular.length ? regular : workSlots;
                const schedStart = base[0].start;
                const schedEnd = new Date(Math.max(...base.map(s => s.end.getTime())));
                const schedMins = base.reduce((sum, s) => sum + minsBetween(s.start, s.end), 0);
                const winStart = new Date(workSlots[0].start.getTime() - 4 * 3600000);
                const winEnd = new Date(Math.max(...workSlots.map(s => s.end.getTime())) + 6 * 3600000);
                const label = workSlots.map(s => `${s.st}-${s.en}${s.shift?.name ? ` (${s.shift.name})` : ''}`).join(' + ');
                const slotType = workSlots.length > 1 ? workSlots.map(s => s.tx.slot_type || 'MAIN').join('+') : (workSlots[0].tx.slot_type || 'MAIN');
                const dayBase = { date: dateStr, slot_type: slotType, shift: label, scheduled_in: fmtTime(schedStart), scheduled_out: fmtTime(schedEnd) };

                const p = takeDayPunches(punches, used, winStart, winEnd);

                // Per-shift wage for the scheduled slots; which part is fixed (not hour-based)
                const slotWage = (s) => {
                    const hrs = minsBetween(s.start, s.end) / 60;
                    if (s.shift?.rate && Number(s.shift.rate) > 0) return { pay: Number(s.shift.rate), fixed: true };
                    if (hrs >= 11 || s.tx.slot_type === 'DOUBLE') return { pay: doubleRate, fixed: true };
                    if (hrs <= 5.5) return rates.rush_4h ? { pay: Number(rates.rush_4h), fixed: true } : { pay: hrs * hourlyRate, fixed: false };
                    return { pay: Number(rates.daily_rate || rates.morning || rates.evening || 350), fixed: true };
                };

                if (p.checkIn && !p.checkOut && now < winEnd) {
                    pushDay({ ...dayBase, in: fmtTime(p.checkIn), status: 'IN PROGRESS' });
                    return;
                }

                if (p.checkIn) {
                    const missedOut = !p.checkOut;
                    const effectiveOut = missedOut ? schedEnd : p.checkOut;  // forgot to check out: pay to scheduled end
                    if (missedOut && !isOwner) incompleteCount++;
                    if (missedOut && effectiveOut <= p.checkIn) {
                        pushDay({ ...dayBase, in: fmtTime(p.checkIn), status: 'MISSED CHECK-OUT' });
                        return;
                    }

                    // Scheduled breaks between split slots are never paid, checked out or not
                    const gaps = [];
                    for (let k = 1; k < base.length; k++) if (base[k].start > base[k - 1].end) gaps.push({ start: base[k - 1].end, end: base[k].start });
                    const aw = awayAfterExemption(p.away, base, gaps);
                    const present = { start: p.checkIn, end: effectiveOut };
                    const breakMins = gaps.reduce((s, g) => s + overlapMins(g, present), 0);

                    const actualMins = Math.max(0, minsBetween(p.checkIn, effectiveOut) - breakMins - aw.counted);

                    let lateMins = 0;
                    if (p.checkIn > schedStart) {
                        lateMins = minsBetween(schedStart, p.checkIn);
                        if (lateMins > 15 && !isOwner) lateCount++;
                    }

                    let otMins = missedOut ? 0 : Math.max(0, actualMins - schedMins);
                    if (otMins < 60) otMins = 0;
                    const regularMins = Math.min(actualMins, schedMins);

                    let wage = 0;
                    if (wageType === 'hourly') {
                        wage = regularMins / 60 * hourlyRate;
                    } else if (wageType === 'daily') {
                        let fixedPay = 0, scaledPay = 0, fixedSched = 0;
                        base.forEach(s => {
                            const w = slotWage(s);
                            if (w.fixed) { fixedPay += w.pay; fixedSched += minsBetween(s.start, s.end); } else scaledPay += w.pay;
                        });
                        const workedShare = schedMins > 0 ? regularMins / schedMins : 0;
                        wage = fixedPay + scaledPay * workedShare;
                        // Fixed pay doesn't shrink with hours: deduct counted time away inside the fixed slots
                        const fixedShare = schedMins > 0 ? fixedSched / schedMins : 0;
                        if (aw.countedInSlots > 0 && fixedShare > 0) awayDeduct += (aw.countedInSlots * fixedShare) / 60 * hourlyRate;
                    } else if (wageType === 'monthly' && aw.countedInSlots > 0) {
                        awayDeduct += aw.countedInSlots / 60 * hourlyRate;
                    }
                    wage = r2(wage);
                    const ot = r2(otMins / 60 * otRate);

                    totalRegularHours += regularMins / 60;
                    totalOTHours += otMins / 60;
                    totalSalary += wage;
                    totalOTPay += ot;
                    totalAwayMins += aw.counted;
                    workDays++;

                    pushDay({
                        ...dayBase,
                        in: fmtTime(p.checkIn),
                        out: missedOut ? '-' : fmtTime(p.checkOut),
                        wage, ot, ot_hours: otMins / 60, regular_hours: regularMins / 60, away_mins: aw.counted,
                        status: missedOut ? (isOwner ? 'EXEMPT' : 'MISSED CHECK-OUT') : (lateMins > 0 ? `LATE (+${lateMins}M)` : 'NORMAL'),
                        paid_to_schedule_end: missedOut || undefined,
                    });
                } else if (p.checkOut) {
                    if (!isOwner) incompleteCount++;
                    pushDay({ ...dayBase, out: fmtTime(p.checkOut), status: isOwner ? 'EXEMPT' : 'MISSED CHECK-IN' });
                } else if (dateStr > todayStr) {
                    pushDay({ ...dayBase, status: 'SCHEDULED' });
                } else if (now < schedEnd) {
                    pushDay({ ...dayBase, status: 'PENDING' });
                } else {
                    if (!isOwner) absentCount++;
                    pushDay({ ...dayBase, status: isOwner ? 'EXEMPT' : 'ABSENT' });
                }
                return;
            }

            // ── Case B: scheduled OFF ────────────────────────────────────────
            if (dailyTxs.some(t => t.is_off)) {
                payFreeDay(dateStr, 'OFF', 'OFF-DAY WORK', 'MISSED CHECK-OUT (OFF-DAY)', 'MISSED CHECK-IN (OFF-DAY)');
                return;
            }

            // ── Case C: nothing scheduled ────────────────────────────────────
            payFreeDay(dateStr, 'UNSCHEDULED', 'UNSCHEDULED WORK', 'MISSED CHECK-OUT (UNSCHEDULED)', 'MISSED CHECK-IN (UNSCHEDULED)');
        });

        // Monthly staff: base salary, plus off-day / unscheduled pay on top
        if (wageType === 'monthly' && baseSalary > 0) totalSalary = baseSalary + extraDayPay;
        else totalSalary += extraDayPay;
        totalSalary = r2(totalSalary);
        totalOTPay = r2(totalOTPay);

        // Allowances
        const monthlyAllowance = Number(rates.monthly_allowance || 0);
        const diligenceAllowance = Number(rates.diligence_allowance || 0);
        const isDiligenceEarned = diligenceAllowance > 0 && workDays > 0 && absentCount === 0 && lateCount === 0 && incompleteCount === 0;

        // Adjustments for this month. Type comes from the `type` column, or from a reason prefix
        // ("[โบนัส] …", "[เบิกล่วงหน้า] …") saved before that column existed.
        const adjType = (d) => d.type || ((d.reason || "").startsWith("[โบนัส]") ? "bonus" : (d.reason || "").startsWith("[เบิกล่วงหน้า]") ? "advance" : "deduction");
        const empAdjustments = (deductionsMap.get(emp.id) || []).map(d => ({ ...d, type: adjType(d) }));
        const bonusTotal = r2(empAdjustments.filter(d => d.type === 'bonus').reduce((s, d) => s + (d.is_percentage ? 0 : parseFloat(d.amount || 0)), 0));
        const totalAllowances = r2(monthlyAllowance + (isDiligenceEarned ? diligenceAllowance : 0) + bonusTotal);

        const grossEarnings = r2(totalSalary + totalOTPay + totalAllowances);

        let ssoDeduct = 0;
        if (ssoEnabled && rates.social_security_enrolled) {
            ssoDeduct = Math.min(Math.round(Math.max(grossEarnings, 0) * ssoPct / 100), ssoCap);
        }
        const taxPct = Number(rates.withholding_tax_pct || 0);
        const taxDeduct = r2(taxPct > 0 ? grossEarnings * (taxPct / 100) : 0);

        const adjustments = empAdjustments.map(d => {
            const amount = d.is_percentage ? grossEarnings * (parseFloat(d.amount || 0) / 100) : parseFloat(d.amount || 0);
            return { id: d.id, type: d.type || 'deduction', reason: d.reason || '', is_percentage: !!d.is_percentage, raw: Number(d.amount), amount: r2(amount) };
        });
        const customDeduct = r2(adjustments.filter(a => a.type !== 'bonus').reduce((s, a) => s + a.amount, 0));

        awayDeduct = r2(awayDeduct);
        const totalDeduct = r2(ssoDeduct + taxDeduct + customDeduct + awayDeduct);
        const netSalary = r2(Math.max(0, grossEarnings - totalDeduct));

        return {
            emp,
            wageType,
            workDays,
            totalRegularHours,
            totalOTHours,
            totalSalary,
            totalOTPay,
            monthlyAllowance,
            diligenceAllowance,
            isDiligenceEarned,
            bonusTotal,
            totalAllowances,
            ssoDeduct,
            taxDeduct,
            customDeduct,
            awayDeduct,
            totalAwayMins,
            totalDeduct,
            grossEarnings,
            netSalary,
            lateCount,
            absentCount,
            incompleteCount,
            offDayWorkCount,
            adjustments,
            dailyDetails: dailyDetails.sort((a, b) => a.date.localeCompare(b.date))
        };
    });
};

/**
 * Resolves the wage for a specific shift and work hours based on:
 * 1. Employee custom shift override (rates.custom_shifts?.[shiftId] or rates.custom_shifts?.[shiftCode])
 * 2. Employee direct rates (rates.morning, rates.mid, rates.evening, rates.night, rates.double, rates.rush_4h)
 * 3. Shift preset default rate from database (shift.rate)
 * 4. Duration hours * hourlyRate
 */
export const resolveShiftWage = (shift, empRates, slotType, regularHours = 8, hourlyRate = 50) => {
    const rates = empRates || {};
    const normName = (shift?.name || '').toLowerCase();
    const shiftCode = (shift?.code || '').toLowerCase();
    const shiftId = shift?.id;

    // 1. Employee-specific custom shift rates (by ID or code)
    if (rates.custom_shifts && shiftId && rates.custom_shifts[shiftId] !== undefined && rates.custom_shifts[shiftId] > 0) {
        return Number(rates.custom_shifts[shiftId]);
    }
    if (rates.custom_shifts && shiftCode && rates.custom_shifts[shiftCode] !== undefined && rates.custom_shifts[shiftCode] > 0) {
        return Number(rates.custom_shifts[shiftCode]);
    }

    // 2. Direct keys in rates
    if (shiftCode && rates[shiftCode] !== undefined && rates[shiftCode] > 0) {
        return Number(rates[shiftCode]);
    }

    // 3. Name keyword matching against employee's rates
    if ((normName.includes('เช้า') || normName.includes('morning')) && rates.morning > 0) {
        return Number(rates.morning);
    }
    if ((normName.includes('กลางวัน') || normName.includes('บ่าย') || normName.includes('mid') || normName.includes('afternoon')) && rates.mid > 0) {
        return Number(rates.mid);
    }
    if ((normName.includes('ค่ำ') || normName.includes('เย็น') || normName.includes('evening') || normName.includes('closing')) && rates.evening > 0) {
        return Number(rates.evening);
    }
    if ((normName.includes('ดึก') || normName.includes('ข้ามคืน') || normName.includes('night') || normName.includes('late')) && rates.night > 0) {
        return Number(rates.night);
    }
    if ((slotType === 'SPLIT' || slotType === 'DOUBLE' || normName.includes('ควบ') || normName.includes('double')) && rates.double > 0) {
        return Number(rates.double);
    }
    if ((normName.includes('4h') || normName.includes('4 ชม') || normName.includes('rush')) && rates.rush_4h > 0) {
        return Number(rates.rush_4h);
    }

    // 4. Shift's preset rate from shifts table
    if (shift?.rate && Number(shift.rate) > 0) {
        return Number(shift.rate);
    }

    // 5. Fallback calculation by duration * hourly rate
    return Number(regularHours) * (hourlyRate || 50);
};

/**
 * Helper to simulate an employee's estimated monthly take-home salary based on custom assumptions.
 */
export const simulateStaffPayroll = (emp, assumptions = {}) => {
    const rates = emp?.shift_rates || {};
    const wageType = rates.wage_type || (emp?.employment_status === 'Fulltime' && emp?.base_salary > 0 ? 'monthly' : (rates.morning || rates.evening || rates.mid ? 'daily' : 'hourly'));
    const baseSalary = Number(emp?.base_salary || rates.base_salary || 0);
    const standardShiftRate = Number(rates.morning || rates.daily_rate || 350);
    const doubleRate = Number(rates.double || rates.double_shift_rate || assumptions.doubleShiftRate || 700);
    const hourlyRate = Number(rates.hourly_rate || 50);
    const otRate = Number(assumptions.otRate ?? 50); // one shop-wide OT rate
    
    const regularShifts = Number(assumptions.regularShifts ?? assumptions.morningShifts ?? 20);
    const doubleShifts = Number(assumptions.doubleShifts ?? 2);
    const customHours = Number(assumptions.customHours ?? 0);
    const otHours = Number(assumptions.otHours ?? 6);
    const hasDiligence = assumptions.hasDiligence ?? true;

    let basePay = 0;
    if (wageType === 'monthly') {
        basePay = baseSalary;
    } else if (wageType === 'daily') {
        basePay = (regularShifts * standardShiftRate) + 
                  (doubleShifts * doubleRate) + 
                  (customHours * hourlyRate);
    } else {
        // Hourly (8 hours per regular shift + 14 hours per double shift)
        const totalHours = (regularShifts * 8) + (doubleShifts * 14) + customHours;
        basePay = totalHours * hourlyRate;
    }

    const otPay = otHours * otRate;
    const monthlyAllowance = Number(rates.monthly_allowance || 0);
    const diligenceAllowance = Number(rates.diligence_allowance || 0);
    const earnedDiligence = hasDiligence ? diligenceAllowance : 0;
    const totalAllowances = monthlyAllowance + earnedDiligence;

    const gross = basePay + otPay + totalAllowances;
    
    let sso = 0;
    if (assumptions.ssoEnabled && rates.social_security_enrolled) {
        const ssoBase = Math.min(Math.max(gross, 0), 15000);
        sso = Math.round(ssoBase * 0.05);
    }

    const taxPct = Number(rates.withholding_tax_pct || 0);
    const tax = taxPct > 0 ? (gross * (taxPct / 100)) : 0;

    const totalDeductions = sso + tax;
    const net = Math.max(0, gross - totalDeductions);

    return {
        wageType,
        basePay,
        otPay,
        monthlyAllowance,
        earnedDiligence,
        totalAllowances,
        gross,
        sso,
        tax,
        totalDeductions,
        net
    };
};

