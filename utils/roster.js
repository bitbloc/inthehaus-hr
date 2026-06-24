import { supabase } from '../lib/supabaseClient.js';
import { format, parseISO, startOfDay, addDays, isAfter, isBefore } from 'date-fns';

/**
 * Combine a date and a time string into a full Date object.
 * If endTime is less than startTime, it implies an overnight shift, so add 1 day to endTime.
 */
function createTimeRange(dateStr, startTimeStr, endTimeStr) {
    if (!startTimeStr) startTimeStr = '00:00:00';
    if (!endTimeStr) endTimeStr = '23:59:59';

    const start = new Date(`${dateStr}T${startTimeStr}`);
    let end = new Date(`${dateStr}T${endTimeStr}`);

    if (endTimeStr < startTimeStr) {
        end = addDays(end, 1);
    }
    return { start, end };
}

/**
 * Get the effective roster for a specific date using the transactional model.
 * @param {Date|string} dateObj - The target date.
 * @param {Object} options - Options (e.g. { includeDrafts: false })
 * @returns {Array} - List of employees scheduled to work, their shifts, and log data.
 */
export async function getEffectiveRoster(dateObj, options = { includeDrafts: false }) {
    const targetDate = typeof dateObj === 'string' ? parseISO(dateObj) : dateObj;
    const dateStr = format(targetDate, 'yyyy-MM-dd');

    // 1. Fetch Roster Transactions for this date
    let query = supabase
        .from('roster_transactions')
        .select(`
            employee_id,
            slot_type,
            is_off,
            status,
            shift_id,
            custom_start_time,
            custom_end_time,
            employees!inner(id, name, nickname, position),
            shifts(id, name, start_time, end_time)
        `)
        .eq('date', dateStr);

    if (!options.includeDrafts) {
        query = query.eq('status', 'PUBLISHED');
    }

    const { data: transactions, error: transErr } = await query;

    if (transErr) {
        console.error("Error fetching roster transactions:", transErr);
        return [];
    }

    // 2. Fetch Attendance Logs for this specific date and the NEXT day (to catch overnight checkouts)
    const { data: logs, error: logErr } = await supabase
        .from('attendance_logs')
        .select('employee_id, action_type, timestamp')
        .gte('timestamp', startOfDay(targetDate).toISOString())
        // Fetch up to end of next day to cover overnight shifts safely
        .lte('timestamp', addDays(startOfDay(targetDate), 2).toISOString());

    if (logErr) {
        console.error("Error fetching attendance logs:", logErr);
    }

    const rosterList = [];

    // 3. Process Transactions
    if (transactions) {
        transactions.forEach(tx => {
            if (tx.is_off) {
                // If the shift is explicitly marked as OFF, we skip or mark them as OFF
                // For getEffectiveRoster, usually we just return working employees. 
                // But admin UI might need it. We'll include it with a special flag.
                rosterList.push({
                    ...tx.employees,
                    slot_type: tx.slot_type,
                    is_off: true,
                    shift: { name: "OFF" },
                    status: tx.status,
                    attendance: { check_in: null, check_out: null }
                });
                return;
            }

            const shiftData = tx.shifts ? { ...tx.shifts } : { name: "Custom Shift" };
            if (tx.custom_start_time) shiftData.start_time = tx.custom_start_time;
            if (tx.custom_end_time) shiftData.end_time = tx.custom_end_time;

            // Match against known presets for custom slots
            if (shiftData.name === "Custom Shift" && shiftData.start_time && shiftData.end_time) {
                const startClean = shiftData.start_time.slice(0, 5);
                const endClean = shiftData.end_time.slice(0, 5);
                if (startClean === '12:30' && endClean === '23:30') {
                    shiftData.name = 'ผู้ช่วยครัว';
                } else if (startClean === '18:00' && endClean === '22:30') {
                    shiftData.name = 'INTHEHAUS';
                } else if (startClean === '10:00' && endClean === '20:30') {
                    shiftData.name = 'CHEF';
                } else if (startClean === '12:00' && endClean === '20:00') {
                    shiftData.name = 'กลางกะ';
                }
            }

            // Generate precise timestamps for overnight handling
            const { start, end } = createTimeRange(dateStr, shiftData.start_time, shiftData.end_time);

            rosterList.push({
                ...tx.employees,
                slot_type: tx.slot_type,
                is_off: false,
                status: tx.status,
                shift: shiftData,
                timeRange: { start, end },
                attendance: { check_in: null, check_out: null }
            });
        });
    }

    // 4. Apply Attendance Logs by checking Time Range overlap
    if (logs && rosterList.length > 0) {
        logs.forEach(log => {
            const logTime = new Date(log.timestamp);
            
            // Find all slots for this employee
            const empSlots = rosterList.filter(r => r.id === log.employee_id && !r.is_off);
            
            if (empSlots.length > 0) {
                // To support SPLIT shifts, we find the closest matching slot for this log time
                // For simplicity, we just look for a slot where the log time is somewhat near the shift time
                // E.g., within -4 hours to +4 hours of the shift block.
                let bestSlot = empSlots[0];
                let minDistance = Infinity;

                empSlots.forEach(slot => {
                    // distance from shift center
                    const shiftCenterTime = (slot.timeRange.start.getTime() + slot.timeRange.end.getTime()) / 2;
                    const distance = Math.abs(logTime.getTime() - shiftCenterTime);
                    if (distance < minDistance) {
                        minDistance = distance;
                        bestSlot = slot;
                    }
                });

                if (bestSlot) {
                    if (log.action_type === 'check_in') {
                        if (!bestSlot.attendance.check_in || logTime < new Date(bestSlot.attendance.check_in)) {
                            bestSlot.attendance.check_in = log.timestamp;
                        }
                    } else if (log.action_type === 'check_out') {
                        if (!bestSlot.attendance.check_out || logTime > new Date(bestSlot.attendance.check_out)) {
                            bestSlot.attendance.check_out = log.timestamp;
                        }
                    }
                }
            } else {
                // Employee clocked in but not in roster (Extra)
                // We'll skip for now, or you can add logic to append them like before.
                // It's safer to only append them if includeDrafts is false (meaning actual operations).
            }
        });
    }

    // 5. Append Extra logs (employees who checked in but have NO transaction)
    if (logs) {
        const { data: allEmps } = await supabase.from('employees').select('id, name, nickname, position');
        const empLookup = new Map(allEmps?.map(e => [e.id, e]));

        logs.forEach(log => {
            const logTime = new Date(log.timestamp);
            // Ignore logs that belong to the next day unless it's overnight
            // A simple heuristic: if it's check_in on the next day, it belongs to next day's roster
            if (log.action_type === 'check_in' && logTime > addDays(startOfDay(targetDate), 1)) {
                return;
            }

            const hasSlot = rosterList.some(r => r.id === log.employee_id && !r.is_off);
            if (!hasSlot) {
                let extraSlot = rosterList.find(r => r.id === log.employee_id && r.isExtra);
                if (!extraSlot) {
                    const empInfo = empLookup.get(log.employee_id);
                    if (empInfo) {
                        extraSlot = {
                            ...empInfo,
                            slot_type: 'MAIN',
                            is_off: false,
                            status: 'PUBLISHED',
                            shift: { name: "Extra (No Schedule)" },
                            isExtra: true,
                            attendance: { check_in: null, check_out: null }
                        };
                        rosterList.push(extraSlot);
                    }
                }
                
                if (extraSlot) {
                    if (log.action_type === 'check_in') {
                        if (!extraSlot.attendance.check_in || logTime < new Date(extraSlot.attendance.check_in)) {
                            extraSlot.attendance.check_in = log.timestamp;
                        }
                    } else if (log.action_type === 'check_out') {
                        if (!extraSlot.attendance.check_out || logTime > new Date(extraSlot.attendance.check_out)) {
                            extraSlot.attendance.check_out = log.timestamp;
                        }
                    }
                }
            }
        });
    }

    // Sort by start time
    const finalRoster = rosterList.sort((a, b) => {
        const timeA = a.shift?.start_time || '23:59';
        const timeB = b.shift?.start_time || '23:59';
        return timeA.localeCompare(timeB);
    });

    return finalRoster;
}
