import { format, addDays, startOfWeek, parseISO, subWeeks, differenceInCalendarWeeks } from 'date-fns';
import { supabase } from '../lib/supabaseClient.js';

/**
 * ==============================================================================
 * ROSTER AUTO-LEARNING & SMART GENERATION ENGINE
 * ==============================================================================
 * Automatically learns recurring shift habits from historical published rosters,
 * factors in approved leaves & designated replacements, validates station coverage,
 * and generates clean weekly draft schedules so the manager only has to tweak
 * minor exceptions rather than manual keying.
 */

/**
 * 1. Learn regular shift patterns for each active employee
 * Analyzes historical roster_transactions with recency weighting.
 */
export async function learnEmployeePatterns(options = { weeksBack: 8, client: supabase }) {
    const db = options.client || supabase;
    const weeksBack = options.weeksBack || 8;

    // 1. Fetch active employees
    const { data: employees, error: empErr } = await db
        .from('employees')
        .select('id, name, nickname, position, employment_status')
        .eq('is_active', true)
        .order('id');

    if (empErr || !employees) {
        throw new Error('Failed to fetch active employees: ' + (empErr?.message || 'Empty'));
    }

    // 2. Fetch published transactions for the learning window
    const today = new Date();
    const windowStart = format(subWeeks(today, weeksBack), 'yyyy-MM-dd');

    const { data: txs, error: txErr } = await db
        .from('roster_transactions')
        .select('date, employee_id, slot_type, shift_id, custom_start_time, custom_end_time, is_off, status')
        .gte('date', windowStart)
        .order('date', { ascending: false });

    if (txErr) {
        throw new Error('Failed to fetch historical transactions: ' + txErr.message);
    }

    // 3. Fetch template schedules as secondary fallback baseline
    const { data: fallbackTemplates } = await db
        .from('employee_schedules')
        .select('*');

    const templateMap = {};
    (fallbackTemplates || []).forEach(t => {
        if (!templateMap[t.employee_id]) templateMap[t.employee_id] = {};
        templateMap[t.employee_id][t.day_of_week] = t;
    });

    // 4. Group by employee and day_of_week (0 = Sunday ... 6 = Saturday) with recency weighting
    const patterns = {};
    employees.forEach(emp => {
        patterns[emp.id] = {
            employee: emp,
            days: { 0: {}, 1: {}, 2: {}, 3: {}, 4: {}, 5: {}, 6: {} }
        };
    });

    // Inject master template baseline with strong weight so configured schedules are honored
    Object.keys(templateMap).forEach(empId => {
        if (!patterns[empId]) return;
        for (let dow = 0; dow < 7; dow++) {
            const tmpl = templateMap[empId]?.[dow];
            if (tmpl) {
                const key = tmpl.is_off
                    ? 'OFF'
                    : JSON.stringify({
                        shift_id: tmpl.shift_id || null,
                        custom_start_time: null,
                        custom_end_time: null,
                        slot_type: 'MAIN'
                    });
                patterns[empId].days[dow][key] = (patterns[empId].days[dow][key] || 0) + 15;
            }
        }
    });

    (txs || []).forEach(tx => {
        if (!patterns[tx.employee_id]) return;
        const txDate = parseISO(tx.date);
        const dow = txDate.getDay();

        // Recency weighting with calendar week awareness:
        // When operating hours or shift policies change (e.g. from 9 Nov 2026), the latest week holds highest authority
        const ageWeeks = differenceInCalendarWeeks(today, txDate, { weekStartsOn: 1 });
        let weight = 1;
        if (ageWeeks <= 0) weight = 25; // Current & newly published week
        else if (ageWeeks === 1) weight = 8;
        else if (ageWeeks === 2) weight = 4;
        else if (ageWeeks === 3) weight = 2;
        else weight = 1;

        const key = tx.is_off
            ? 'OFF'
            : JSON.stringify({
                shift_id: tx.shift_id || null,
                custom_start_time: tx.custom_start_time ? tx.custom_start_time.slice(0, 5) : null,
                custom_end_time: tx.custom_end_time ? tx.custom_end_time.slice(0, 5) : null,
                slot_type: tx.slot_type || 'MAIN'
            });

        patterns[tx.employee_id].days[dow][key] = (patterns[tx.employee_id].days[dow][key] || 0) + weight;
    });

    // 5. Resolve best learned schedule for each day of week (0 to 6)
    const learnedHabits = {};

    employees.forEach(emp => {
        learnedHabits[emp.id] = {
            employee_id: emp.id,
            name: emp.nickname || emp.name,
            position: emp.position,
            routine: {}
        };

        for (let d = 0; d < 7; d++) {
            const candidates = patterns[emp.id].days[d];
            let bestKey = null;
            let maxWeight = 0;
            let totalWeight = 0;

            Object.entries(candidates).forEach(([k, w]) => {
                totalWeight += w;
                if (w > maxWeight) {
                    maxWeight = w;
                    bestKey = k;
                }
            });

            // If no history found, check template fallback
            if (!bestKey) {
                const tmpl = templateMap[emp.id]?.[d];
                if (tmpl) {
                    learnedHabits[emp.id].routine[d] = {
                        is_off: !!tmpl.is_off,
                        shift_id: tmpl.is_off ? null : tmpl.shift_id,
                        custom_start_time: null,
                        custom_end_time: null,
                        slot_type: 'MAIN',
                        confidence: 50,
                        source: 'TEMPLATE'
                    };
                    continue;
                }
                // Default OFF if completely unknown
                learnedHabits[emp.id].routine[d] = {
                    is_off: true,
                    shift_id: null,
                    custom_start_time: null,
                    custom_end_time: null,
                    slot_type: 'MAIN',
                    confidence: 0,
                    source: 'DEFAULT'
                };
                continue;
            }

            const confidence = totalWeight > 0 ? Math.round((maxWeight / totalWeight) * 100) : 0;

            if (bestKey === 'OFF') {
                learnedHabits[emp.id].routine[d] = {
                    is_off: true,
                    shift_id: null,
                    custom_start_time: null,
                    custom_end_time: null,
                    slot_type: 'MAIN',
                    confidence,
                    source: 'HISTORY'
                };
            } else {
                const parsed = JSON.parse(bestKey);
                learnedHabits[emp.id].routine[d] = {
                    is_off: false,
                    shift_id: parsed.shift_id,
                    custom_start_time: parsed.custom_start_time,
                    custom_end_time: parsed.custom_end_time,
                    slot_type: parsed.slot_type || 'MAIN',
                    confidence,
                    source: 'HISTORY'
                };
            }
        }
    });

    return {
        employees,
        learnedHabits,
        weeksAnalyzed: weeksBack,
        totalHistoricalTxs: txs?.length || 0
    };
}

/**
 * 2. Save learned habits to employee_schedules table
 * Syncs the learned routine so the DB template is always accurate.
 */
export async function syncLearnedToTemplates(learnedHabits, client = supabase) {
    const db = client || supabase;
    const habitsMap = learnedHabits?.learnedHabits || learnedHabits || {};
    const upserts = [];

    Object.values(habitsMap).forEach(item => {
        if (!item || !item.routine) return;
        const empId = item.employee_id;
        for (let d = 0; d < 7; d++) {
            const shiftInfo = item.routine[d];
            if (!shiftInfo) continue;
            upserts.push({
                employee_id: empId,
                day_of_week: d,
                is_off: shiftInfo.is_off,
                shift_id: shiftInfo.is_off ? null : (shiftInfo.shift_id || null)
            });
        }
    });

    if (upserts.length > 0) {
        const { error } = await db
            .from('employee_schedules')
            .upsert(upserts, { onConflict: 'employee_id, day_of_week' });
        if (error) {
            console.error('Failed to sync templates to employee_schedules:', error);
            throw error;
        }
    }

    return upserts.length;
}

/**
 * 3. Smart Auto-Generate Weekly Schedule
 * Combines learned routine, approved leaves, replacement assignments, and coverage checks.
 */
export async function autoGenerateWeeklyRoster({
    startDate,
    endDate,
    overwrite = true,
    applyLeaves = true,
    syncTemplate = false,
    client = supabase
}) {
    const db = client || supabase;

    // 1. Determine target week (Monday to Sunday)
    const targetStart = typeof startDate === 'string'
        ? startOfWeek(parseISO(startDate), { weekStartsOn: 1 })
        : (startDate ? startOfWeek(startDate, { weekStartsOn: 1 }) : startOfWeek(addDays(new Date(), 7), { weekStartsOn: 1 }));

    const startStr = format(targetStart, 'yyyy-MM-dd');
    const endStr = endDate ? (typeof endDate === 'string' ? endDate : format(endDate, 'yyyy-MM-dd')) : format(addDays(targetStart, 6), 'yyyy-MM-dd');

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
        weekDates.push(addDays(targetStart, i));
    }

    // 2. Run Learning Engine to get employees and habits
    const { employees, learnedHabits } = await learnEmployeePatterns({ client: db, weeksBack: 8 });

    if (syncTemplate) {
        await syncLearnedToTemplates(learnedHabits, db);
    }

    // 3. Fetch approved leaves for the target week
    let approvedLeaves = [];
    if (applyLeaves) {
        const { data: leaves } = await db
            .from('leave_requests')
            .select('id, employee_id, leave_date, leave_type, reason, status, replacement_employee_id, employees!employee_id(name, nickname), replacement_employee:employees!replacement_employee_id(name, nickname)')
            .gte('leave_date', startStr)
            .lte('leave_date', endStr)
            .eq('status', 'approved');
        approvedLeaves = leaves || [];
    }

    // Map leaves by employee_id and date
    const leaveMap = new Map();
    const replacementMap = new Map(); // date -> replacement_employee_id -> original shift
    approvedLeaves.forEach(l => {
        const key = `${l.employee_id}_${l.leave_date}`;
        leaveMap.set(key, l);
    });

    // 4. Build draft transactions for all 7 days
    const generatedTransactions = [];
    const leavesApplied = [];
    const replacementsAssigned = [];

    weekDates.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dow = date.getDay(); // 0 = Sun, 1 = Mon ...

        // First pass: regular routine and direct leaves
        employees.forEach(emp => {
            const habit = learnedHabits[emp.id]?.routine[dow] || { is_off: true, slot_type: 'MAIN' };
            const leaveKey = `${emp.id}_${dateStr}`;
            const leave = leaveMap.get(leaveKey);

            if (leave) {
                // Employee is on approved leave
                generatedTransactions.push({
                    employee_id: emp.id,
                    date: dateStr,
                    slot_type: 'MAIN',
                    shift_id: null,
                    custom_start_time: null,
                    custom_end_time: null,
                    is_off: true,
                    status: 'DRAFT',
                    note: `LEAVE:${leave.leave_type.toUpperCase()}`
                });

                leavesApplied.push({
                    employee_name: emp.nickname || emp.name,
                    date: dateStr,
                    type: leave.leave_type,
                    reason: leave.reason
                });

                // Check if a replacement is designated
                if (leave.replacement_employee_id && !habit.is_off) {
                    replacementMap.set(`${leave.replacement_employee_id}_${dateStr}`, {
                        originalShift: habit,
                        replacedFor: emp.nickname || emp.name
                    });
                }
            } else {
                // Regular habit schedule
                generatedTransactions.push({
                    employee_id: emp.id,
                    date: dateStr,
                    slot_type: habit.slot_type || 'MAIN',
                    shift_id: habit.is_off ? null : (habit.shift_id || null),
                    custom_start_time: habit.is_off ? null : (habit.custom_start_time || null),
                    custom_end_time: habit.is_off ? null : (habit.custom_end_time || null),
                    is_off: !!habit.is_off,
                    status: 'DRAFT'
                });
            }
        });

        // Second pass: apply replacement shifts
        replacementMap.forEach((repInfo, repKey) => {
            const [repEmpIdStr, repDateStr] = repKey.split('_');
            if (repDateStr !== dateStr) return;
            const repEmpId = parseInt(repEmpIdStr, 10);

            // Find replacement employee's transaction for today and assign shift
            const repTx = generatedTransactions.find(t => t.employee_id === repEmpId && t.date === dateStr);
            if (repTx) {
                repTx.is_off = false;
                repTx.shift_id = repInfo.originalShift.shift_id || null;
                repTx.custom_start_time = repInfo.originalShift.custom_start_time || null;
                repTx.custom_end_time = repInfo.originalShift.custom_end_time || null;
                repTx.note = `SUB_FOR:${repInfo.replacedFor}`;

                replacementsAssigned.push({
                    replacement_id: repEmpId,
                    date: dateStr,
                    sub_for: repInfo.replacedFor
                });
            }
        });
    });

    // 5. Coverage Health Check (Stations check)
    const coverageHealth = [];
    const daysTitle = ['อาทิตย์', 'จันทร์', 'อังคาร', 'พุธ', 'พฤหัสบดี', 'ศุกร์', 'เสาร์'];

    weekDates.forEach(date => {
        const dateStr = format(date, 'yyyy-MM-dd');
        const dayTxs = generatedTransactions.filter(t => t.date === dateStr && !t.is_off);

        let kitchenCount = 0;
        let floorCount = 0;

        dayTxs.forEach(t => {
            const emp = employees.find(e => e.id === t.employee_id);
            const pos = (emp?.position || '').toLowerCase();
            if (pos.includes('cook') || pos.includes('kitchen') || pos.includes('chef')) kitchenCount++;
            if (pos.includes('bar') || pos.includes('floor') || pos.includes('owner') || pos.includes('part-time')) floorCount++;
        });

        const dayName = daysTitle[date.getDay()];
        const warnings = [];
        if (kitchenCount === 0) warnings.push('ไม่มีพนักงานครัว');
        if (floorCount === 0) warnings.push('ไม่มีพนักงานหน้าร้าน/บาร์');

        coverageHealth.push({
            date: dateStr,
            dayName,
            totalOnDuty: dayTxs.length,
            kitchenCount,
            floorCount,
            warnings
        });
    });

    // 6. Database Persistence (Insert as DRAFT)
    if (overwrite) {
        // Delete existing DRAFT transactions in this range
        await db
            .from('roster_transactions')
            .delete()
            .gte('date', startStr)
            .lte('date', endStr)
            .eq('status', 'DRAFT');
    }

    // Insert new generated draft transactions
    const cleanRows = generatedTransactions.map(t => ({
        employee_id: t.employee_id,
        date: t.date,
        slot_type: t.slot_type || 'MAIN',
        shift_id: t.shift_id,
        custom_start_time: t.custom_start_time,
        custom_end_time: t.custom_end_time,
        is_off: t.is_off,
        status: 'DRAFT',
        updated_at: new Date().toISOString()
    }));

    const { error: insErr } = await db
        .from('roster_transactions')
        .upsert(cleanRows, {
            onConflict: 'employee_id, date, slot_type',
            ignoreDuplicates: false
        });

    if (insErr) {
        console.error('Failed to insert auto-generated roster drafts:', insErr);
        throw new Error('Database error saving generated roster: ' + insErr.message);
    }

    return {
        success: true,
        startDate: startStr,
        endDate: endStr,
        totalSlots: cleanRows.length,
        workingSlots: cleanRows.filter(t => !t.is_off).length,
        offSlots: cleanRows.filter(t => t.is_off).length,
        leavesApplied,
        replacementsAssigned,
        coverageHealth,
        message: `จัดตารางอัตโนมัติสำเร็จ ${cleanRows.length} กะ (นำเข้าใบลาอนุมัติ ${leavesApplied.length} รายการ)`
    };
}

