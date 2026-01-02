import { startOfDay, parseISO, isSameDay } from 'date-fns';

/**
 * The Aggregator: Merges Weekly Template with Daily Overrides
 * Returns the "Effective Schedule" for a specific date or range.
 * 
 * @param {Array} employees - List of all active employees
 * @param {Object} schedules - Weekly Map { empId: { 0: schedule, 1: schedule ... } }
 * @param {Array} overrides - List of roster_overrides records for the target date(s)
 * @param {Array} shifts - List of shift definitions (Master Data)
 * @param {Date|String} targetDate - The specific date to check
 * 
 * @returns {Array} List of effective shifts for that day
 * [{ employee_id, shift_id, shift_name, start_time, end_time, source: 'TEMPLATE'|'OVERRIDE' }]
 */
export const getEffectiveDailyRoster = (employees, schedules, overrides, shifts, targetDate) => {
    const dateObj = typeof targetDate === 'string' ? parseISO(targetDate) : targetDate;
    const dayOfWeek = dateObj.getDay();
    const dateStr = dateObj.toISOString().split('T')[0];

    // precision: Create Map for Overrides for faster lookup { empId: override }
    const overrideMap = new Map();
    overrides.forEach(ov => {
        if (ov.date === dateStr) {
            overrideMap.set(String(ov.employee_id), ov);
        }
    });

    const effectiveRoster = [];

    employees.forEach(emp => {
        const empId = String(emp.id);
        const override = overrideMap.get(empId);

        // Priority 1: Check Override
        if (override) {
            if (override.is_off) {
                // Explicitly OFF
                return;
            }

            // Working via Override
            // Note: We use custom_start_time from override (Data Freezing Principle)
            // But we might fetch shift Name for UI display
            const shiftDef = shifts.find(s => String(s.id) === String(override.shift_id));

            effectiveRoster.push({
                employee: emp,
                shift_id: override.shift_id,
                shift_name: shiftDef ? shiftDef.name + ' (Sub)' : 'Extra Shift',
                start_time: override.custom_start_time,
                end_time: override.custom_end_time,
                source: 'OVERRIDE',
                original_override: override
            });
            return;
        }

        // Priority 2: Check Weekly Template
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
                    source: 'TEMPLATE'
                });
            }
        }
    });

    return effectiveRoster;
};
