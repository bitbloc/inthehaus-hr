import { supabase } from '../lib/supabaseClient.js';
import { format, getDay, parseISO, startOfDay, endOfDay } from 'date-fns';

/**
 * Get the effective roster for a specific date by merging the base schedule with overrides.
 * @param {Date|string} dateObj - The target date.
 * @returns {Array} - List of employees scheduled to work, their shifts, and override notes.
 */
export async function getEffectiveRoster(dateObj) {
    const targetDate = typeof dateObj === 'string' ? parseISO(dateObj) : dateObj;
    const dateStr = format(targetDate, 'yyyy-MM-dd');
    const dayOfWeek = getDay(targetDate); // 0 = Sunday, 1 = Monday, etc.

    // 1. Fetch Base Schedule (where is_off is false)
    const { data: baseSchedules, error: baseErr } = await supabase
        .from('employee_schedules')
        .select(`
            employee_id,
            is_off,
            employees!inner(id, name, nickname, position),
            shifts!inner(id, name, start_time, end_time)
        `)
        .eq('day_of_week', dayOfWeek);

    if (baseErr) {
        console.error("Error fetching base schedule:", baseErr);
        return [];
    }

    // 2. Fetch Overrides for this specific date
    const { data: overrides, error: overErr } = await supabase
        .from('roster_overrides')
        .select(`
            employee_id,
            is_off,
            shift_id,
            custom_start_time,
            custom_end_time,
            employees!inner(id, name, nickname, position),
            shifts(id, name, start_time, end_time)
        `)
        .eq('date', dateStr);

    if (overErr) {
        console.error("Error fetching roster overrides:", overErr);
        // Continue but without overrides
    }

    // 3. Fetch Attendance Logs for this specific date
    const { data: logs, error: logErr } = await supabase
        .from('attendance_logs')
        .select('employee_id, action_type, timestamp')
        .gte('timestamp', startOfDay(targetDate).toISOString())
        .lte('timestamp', endOfDay(targetDate).toISOString());

    if (logErr) {
        console.error("Error fetching attendance logs:", logErr);
    }

    const rosterMap = new Map();

    // Populate base schedule
    if (baseSchedules) {
        baseSchedules.forEach(sched => {
            if (!sched.is_off) {
                rosterMap.set(sched.employee_id, {
                    ...sched.employees,
                    shift: { ...sched.shifts },
                    isOverride: false,
                    attendance: { check_in: null, check_out: null }
                });
            }
        });
    }

    // Apply Overrides
    if (overrides) {
        overrides.forEach(ov => {
            if (ov.is_off) {
                // Remove from roster if they took the day off
                rosterMap.delete(ov.employee_id);
            } else {
                // Upsert with custom shift or custom time
                const shiftData = ov.shifts ? { ...ov.shifts } : { name: "Custom Shift" };
                if (ov.custom_start_time) shiftData.start_time = ov.custom_start_time;
                if (ov.custom_end_time) shiftData.end_time = ov.custom_end_time;

                const existing = rosterMap.get(ov.employee_id);
                rosterMap.set(ov.employee_id, {
                    ...ov.employees,
                    shift: shiftData,
                    isOverride: true,
                    attendance: existing?.attendance || { check_in: null, check_out: null }
                });
            }
        });
    }

    // Apply Attendance Logs
    if (logs) {
        const { data: allEmps } = await supabase.from('employees').select('id, name, nickname, position');
        const empLookup = new Map(allEmps?.map(e => [e.id, e]));

        logs.forEach(log => {
            let emp = rosterMap.get(log.employee_id);
            if (!emp) {
                // Someone checked in but NOT in roster (Extra)
                const empInfo = empLookup.get(log.employee_id);
                if (empInfo) {
                    emp = {
                        ...empInfo,
                        shift: { name: "Extra" },
                        isOverride: true,
                        isExtra: true,
                        attendance: { check_in: null, check_out: null }
                    };
                    rosterMap.set(log.employee_id, emp);
                }
            }

            if (emp) {
                if (log.action_type === 'check_in') {
                    if (!emp.attendance.check_in || new Date(log.timestamp) < new Date(emp.attendance.check_in)) {
                        emp.attendance.check_in = log.timestamp;
                    }
                } else if (log.action_type === 'check_out') {
                    if (!emp.attendance.check_out || new Date(log.timestamp) > new Date(emp.attendance.check_out)) {
                        emp.attendance.check_out = log.timestamp;
                    }
                }
            }
        });
    }

    // Convert map to array and sort by start time (or position)
    const finalRoster = Array.from(rosterMap.values()).sort((a, b) => {
        const timeA = a.shift?.start_time || '23:59';
        const timeB = b.shift?.start_time || '23:59';
        return timeA.localeCompare(timeB);
    });

    return finalRoster;
}
