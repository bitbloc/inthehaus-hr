import { supabase } from '../lib/supabaseClient.js';
import { format, parseISO, startOfDay, addDays } from 'date-fns';

/**
 * ==============================================================================
 * 1. MASTER SHIFT PRESETS & COLOR DEFINITIONS (Single Source of Truth)
 * ==============================================================================
 */
export const SYSTEM_STANDARD_PRESETS = [
    { start: '18:00', end: '22:30', name: 'INTHEHAUS', color: 'indigo', hex: '#4f46e5', label: 'เย็น/ค่ำ' },
    { start: '10:00', end: '00:30', name: 'ควบกะ 🔥', color: 'rose', hex: '#e11d48', label: 'ควบกะ' },
    { start: '16:30', end: '00:30', name: 'กะค่ำ 🌙', color: 'sky', hex: '#4f46e5', label: 'กะค่ำ' },
    { start: '10:00', end: '18:00', name: 'กะเช้า ☀️', color: 'amber', hex: '#d97706', label: 'กะเช้า' },
    { start: '10:00', end: '20:30', name: 'CHEF', color: 'emerald', hex: '#15803d', label: 'CHEF' },
    { start: '12:30', end: '23:30', name: 'ผู้ช่วยครัว', color: 'violet', hex: '#9c4221', label: 'ผู้ช่วยครัว' },
    { start: '12:00', end: '20:00', name: 'กลางกะ', color: 'sky', hex: '#0284c7', label: 'กลางกะ' },
    { start: '12:30', end: '21:30', name: 'PART-TIME', color: 'rose', hex: '#ca8a04', label: 'Part-Time' }
];

export const PRESET_COLORS = [
    { id: 'sky', label: 'SKY', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', dot: 'bg-sky-500' },
    { id: 'amber', label: 'AMBER', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
    { id: 'indigo', label: 'INDIGO', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', dot: 'bg-indigo-500' },
    { id: 'rose', label: 'ROSE', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', dot: 'bg-rose-500' },
    { id: 'emerald', label: 'EMERALD', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
    { id: 'violet', label: 'VIOLET', bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200', dot: 'bg-violet-500' },
    { id: 'slate', label: 'SLATE', bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', dot: 'bg-slate-500' },
    { id: 'teal', label: 'TEAL', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200', dot: 'bg-teal-500' }
];

/**
 * Match custom timing against known standard presets
 */
export function resolveShiftPresetName(startTime, endTime, fallbackName = 'กะพิเศษ (Custom)') {
    // 1. If Roster already specifies an explicit shift name, always preserve it directly
    if (fallbackName && fallbackName !== 'Custom Shift' && fallbackName !== 'กะพิเศษ (Custom)') {
        return fallbackName;
    }
    
    // 2. If no valid start/end, return default fallback
    if (!startTime || !endTime) return fallbackName || 'กะพิเศษ (Custom)';
    
    // 3. Match against standard presets only when the name is unset/custom
    const startClean = startTime.slice(0, 5);
    const endClean = endTime.slice(0, 5);
    const match = SYSTEM_STANDARD_PRESETS.find(p => p.start === startClean && p.end === endClean);
    if (match) return match.name;

    return fallbackName || 'กะพิเศษ (Custom)';
}


/**
 * Color Resolver for Shift Badges & Calendar Cells
 */
export function getShiftColorHex(shiftName, isOff = false, isCustomOrExtra = false) {
    if (isOff) return '#dc2626'; // Red
    const name = (shiftName || '').toLowerCase();

    // Check matched preset
    const preset = SYSTEM_STANDARD_PRESETS.find(p => name.includes(p.name.toLowerCase()) || name.includes(p.label.toLowerCase()));
    if (preset) return preset.hex;

    if (isCustomOrExtra) return '#0284c7';
    if (name.includes('ควบ') || name.includes('double')) return '#e11d48';
    if (name.includes('ค่ำ') || name.includes('ดึก') || name.includes('night') || name.includes('evening') || name.includes('กลาง')) return '#4f46e5';
    if (name.includes('เช้า') || name.includes('morning')) return '#d97706';
    if (name.includes('chef')) return '#15803d';
    if (name.includes('inthehaus')) return '#ea580c';
    if (name.includes('ผู้ช่วยครัว')) return '#9c4221';
    return '#ca8a04';
}

/**
 * Combine a date and a time string into a full Date object.
 * If endTime is less than startTime, it implies an overnight shift, so add 1 day to endTime.
 */
export function createTimeRange(dateStr, startTimeStr, endTimeStr) {
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
 * ==============================================================================
 * 2. PURE ROSTER AGGREGATOR (For Frontend State / Components)
 * ==============================================================================
 */
export const getEffectiveDailyRoster = (employees = [], schedules = {}, overrides = [], shifts = [], targetDate, options = { includeDrafts: false }) => {
    const dateObj = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
    const dayOfWeek = dateObj.getDay();
    const dateStr = format(dateObj, 'yyyy-MM-dd');

    const empTransactionMap = new Map();
    (overrides || []).forEach(item => {
        if (item.date === dateStr) {
            const eid = String(item.employee_id);
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

        // Priority 1: Check Published Roster Transactions
        if (txList && txList.length > 0) {
            txList.forEach(tx => {
                if (tx.is_off) {
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

                let shiftName = shiftDef ? shiftDef.name : resolveShiftPresetName(startTime, endTime, 'กะพิเศษ (Custom)');
                if (tx.slot_type === 'SPLIT' && !shiftName.includes('ควบ')) {
                    shiftName = `${shiftName} (ควบ)`;
                } else if (tx.slot_type === 'OVERTIME') {
                    shiftName = `${shiftName} (OT)`;
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

        // Priority 2: Optional Fallback to Weekly Template
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

        // Default: If no transaction scheduled for today, employee is OFF
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

/**
 * ==============================================================================
 * 3. ASYNC ROSTER AGGREGATOR (With Live Database Queries & Punch Pairing)
 * ==============================================================================
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
        .lte('timestamp', addDays(startOfDay(targetDate), 2).toISOString());

    if (logErr) {
        console.error("Error fetching attendance logs:", logErr);
    }

    const rosterList = [];

    // 3. Process Transactions
    if (transactions) {
        transactions.forEach(tx => {
            if (tx.is_off) {
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

            shiftData.name = resolveShiftPresetName(shiftData.start_time, shiftData.end_time, shiftData.name);

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

    // 4. Apply Attendance Logs to working slots and OFF slots
    if (logs && rosterList.length > 0) {
        logs.forEach(log => {
            const logTime = new Date(log.timestamp);
            const empSlots = rosterList.filter(r => r.id === log.employee_id && !r.is_off);
            
            if (empSlots.length > 0) {
                let bestSlot = empSlots[0];
                let minDistance = Infinity;

                empSlots.forEach(slot => {
                    if (slot.timeRange) {
                        const shiftCenterTime = (slot.timeRange.start.getTime() + slot.timeRange.end.getTime()) / 2;
                        const distance = Math.abs(logTime.getTime() - shiftCenterTime);
                        if (distance < minDistance) {
                            minDistance = distance;
                            bestSlot = slot;
                        }
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
                const offSlot = rosterList.find(r => r.id === log.employee_id && r.is_off);
                if (offSlot) {
                    offSlot.hasWorkedOnDayOff = true;
                    if (log.action_type === 'check_in') {
                        if (!offSlot.attendance.check_in || logTime < new Date(offSlot.attendance.check_in)) {
                            offSlot.attendance.check_in = log.timestamp;
                        }
                    } else if (log.action_type === 'check_out') {
                        if (!offSlot.attendance.check_out || logTime > new Date(offSlot.attendance.check_out)) {
                            offSlot.attendance.check_out = log.timestamp;
                        }
                    }
                }
            }
        });
    }

    // 5. Append Extra logs (employees who checked in but have NO transaction at all)
    if (logs) {
        const { data: allEmps } = await supabase.from('employees').select('id, name, nickname, position');
        const empLookup = new Map(allEmps?.map(e => [e.id, e]));

        logs.forEach(log => {
            const logTime = new Date(log.timestamp);
            if (log.action_type === 'check_in' && logTime > addDays(startOfDay(targetDate), 1)) {
                return;
            }

            const hasAnySlot = rosterList.some(r => r.id === log.employee_id);
            if (!hasAnySlot) {
                let extraSlot = rosterList.find(r => r.id === log.employee_id && r.isExtra);
                if (!extraSlot) {
                    const empInfo = empLookup.get(log.employee_id);
                    if (empInfo) {
                        extraSlot = {
                            ...empInfo,
                            slot_type: 'MAIN',
                            is_off: false,
                            status: 'PUBLISHED',
                            shift: { name: "Extra (Unscheduled)" },
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

