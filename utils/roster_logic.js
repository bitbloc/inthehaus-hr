import { parseISO, format } from 'date-fns';

/**
 * The Unified Roster Aggregator:
 * Resolves the "Effective Schedule" for a specific date or employee by prioritizing:
 * 1. Published `roster_transactions` (Single Source of Truth)
 * 2. Legacy `roster_overrides` (Backward compatibility)
 * 3. Weekly `employee_schedules` (Template default)
 *
 * @param {Array} employees - List of active employees
 * @param {Object} schedules - Weekly Map { empId: { 0: schedule, 1: schedule ... } }
 * @param {Array} overrides - List of roster_overrides OR roster_transactions records
 * @param {Array} shifts - List of shift definitions (Master Data)
 * @param {Date|String} targetDate - The target date
 * @param {Object} options - { includeDrafts: false }
 * 
 * @returns {Array} List of effective shifts: [{ employee, shift_id, shift_name, start_time, end_time, slot_type, is_off, source }]
 */
export const getEffectiveDailyRoster = (employees = [], schedules = {}, overrides = [], shifts = [], targetDate, options = { includeDrafts: false }) => {
    const dateObj = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
    const dayOfWeek = dateObj.getDay();
    const dateStr = format(dateObj, 'yyyy-MM-dd');

    // Create Map for fast lookup by employee ID
    // Support multiple slots per employee (e.g. MAIN and SPLIT)
    const empTransactionMap = new Map();
    (overrides || []).forEach(item => {
        if (item.date === dateStr) {
            const eid = String(item.employee_id);
            // If item has status, check if it's published or drafts are allowed
            if (item.status && item.status !== 'PUBLISHED' && !options.includeDrafts) {
                return;
            }
            if (!empTransactionMap.has(eid)) {
                empTransactionMap.set(eid, []);
            }
            empTransactionMap.get(eid).push(item);
        }
    });

    const effectiveRoster = [];

    (employees || []).forEach(emp => {
        const empId = String(emp.id);
        const txList = empTransactionMap.get(empId);

        // Priority 1: Check Published Roster Transactions / Overrides
        if (txList && txList.length > 0) {
            txList.forEach(tx => {
                if (tx.is_off) {
                    // Explicit OFF record
                    effectiveRoster.push({
                        employee: emp,
                        shift_id: null,
                        shift_name: 'OFF',
                        start_time: null,
                        end_time: null,
                        slot_type: tx.slot_type || 'MAIN',
                        is_off: true,
                        source: 'TRANSACTION',
                        original_record: tx
                    });
                    return;
                }

                const shiftDef = shifts.find(s => String(s.id) === String(tx.shift_id));
                const startTime = tx.custom_start_time || shiftDef?.start_time || '';
                const endTime = tx.custom_end_time || shiftDef?.end_time || '';

                let shiftName = shiftDef ? shiftDef.name : 'กะพิเศษ (Custom)';
                if (tx.slot_type === 'SPLIT' && !shiftName.includes('ควบ')) {
                    shiftName = `${shiftName} (ควบ)`;
                } else if (tx.slot_type === 'OVERTIME') {
                    shiftName = `${shiftName} (OT)`;
                }

                // Match known preset timings
                if ((!shiftDef || shiftName === 'กะพิเศษ (Custom)') && startTime && endTime) {
                    const startClean = startTime.slice(0, 5);
                    const endClean = endTime.slice(0, 5);
                    if (startClean === '12:30' && endClean === '23:30') {
                        shiftName = 'ผู้ช่วยครัว';
                    } else if (startClean === '18:00' && endClean === '22:30') {
                        shiftName = 'INTHEHAUS';
                    } else if (startClean === '10:00' && endClean === '20:30') {
                        shiftName = 'CHEF';
                    } else if (startClean === '12:00' && endClean === '20:00') {
                        shiftName = 'กลางกะ';
                    }
                }

                effectiveRoster.push({
                    employee: emp,
                    shift_id: tx.shift_id,
                    shift_name: shiftName,
                    start_time: startTime,
                    end_time: endTime,
                    slot_type: tx.slot_type || 'MAIN',
                    is_off: false,
                    source: 'TRANSACTION',
                    original_record: tx
                });
            });
            return;
        }

        // Priority 2: Optional Fallback to Weekly Template (only if explicitly enabled via options.fallbackToTemplate)
        if (options.fallbackToTemplate) {
            const weeklySchedule = schedules[empId]?.[dayOfWeek];
            if (weeklySchedule && !weeklySchedule.is_off && weeklySchedule.shift_id) {
                const shiftDef = shifts.find(s => String(s.id) === String(weeklySchedule.shift_id));
                if (shiftDef) {
                    effectiveRoster.push({
                        employee: emp,
                        shift_id: shiftDef.id,
                        shift_name: shiftDef.name,
                        start_time: shiftDef.start_time,
                        end_time: shiftDef.end_time,
                        slot_type: 'MAIN',
                        is_off: false,
                        source: 'TEMPLATE'
                    });
                    return;
                }
            }
        }

        // Default: If no transaction scheduled for today, employee is OFF (ไม่ได้ลงตารางไว้)
        effectiveRoster.push({
            employee: emp,
            shift_id: null,
            shift_name: 'OFF',
            start_time: null,
            end_time: null,
            slot_type: 'MAIN',
            is_off: true,
            source: 'NONE'
        });
    });

    return effectiveRoster;
};
