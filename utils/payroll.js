import { differenceInMinutes, addDays, isAfter, format } from "date-fns";

/**
 * Combine a date and a time string into a full Date object.
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

const formatTime = (date) => {
    if (!date) return '-';
    return format(date, 'HH:mm');
};

/**
 * Helper to extract local date string (YYYY-MM-DD) from a log timestamp
 */
const getLogLocalDateStr = (timestamp) => {
    if (!timestamp) return '';
    try {
        return format(new Date(timestamp), 'yyyy-MM-dd');
    } catch {
        return '';
    }
};

/**
 * Helper to find check-in and check-out on a given date for an employee with overnight pairing support.
 */
function findDayPunches(empLogs, targetDateStr) {
    const sortedLogs = [...(empLogs || [])].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const checkInLogs = sortedLogs.filter(l => l.action_type === 'check_in');
    const checkOutLogs = sortedLogs.filter(l => l.action_type === 'check_out');

    const sessions = {};
    const claimedOutIds = new Set();

    checkInLogs.forEach(inLog => {
        const inTime = new Date(inLog.timestamp);
        const inDateStr = getLogLocalDateStr(inLog.timestamp);
        const maxOutWindow = new Date(inTime.getTime() + 20 * 60 * 60 * 1000);

        const matchingOut = checkOutLogs.find(outLog => {
            const outKey = outLog.id ? String(outLog.id) : `${outLog.timestamp}_${outLog.action_type}`;
            if (claimedOutIds.has(outKey)) return false;
            const outTime = new Date(outLog.timestamp);
            return outTime > inTime && outTime <= maxOutWindow;
        });

        if (matchingOut) {
            const outKey = matchingOut.id ? String(matchingOut.id) : `${matchingOut.timestamp}_${matchingOut.action_type}`;
            claimedOutIds.add(outKey);
        }

        if (!sessions[inDateStr]) {
            sessions[inDateStr] = {
                checkIn: inTime,
                checkOut: matchingOut ? new Date(matchingOut.timestamp) : null
            };
        } else {
            if (inTime < sessions[inDateStr].checkIn) sessions[inDateStr].checkIn = inTime;
            if (matchingOut) {
                const outTime = new Date(matchingOut.timestamp);
                if (!sessions[inDateStr].checkOut || outTime > sessions[inDateStr].checkOut) {
                    sessions[inDateStr].checkOut = outTime;
                }
            }
        }
    });

    checkOutLogs.forEach(outLog => {
        const outKey = outLog.id ? String(outLog.id) : `${outLog.timestamp}_${outLog.action_type}`;
        if (claimedOutIds.has(outKey)) return;
        const outTime = new Date(outLog.timestamp);
        const outDateStr = getLogLocalDateStr(outLog.timestamp);

        if (!sessions[outDateStr]) {
            sessions[outDateStr] = {
                checkIn: null,
                checkOut: outTime
            };
        }
    });

    return sessions[targetDateStr] || { checkIn: null, checkOut: null };
}

/**
 * Calculates payroll, OT, and attendance stats for all employees using roster_transactions.
 */
export const calculatePayroll = (employees, logs, transactions, shifts, payrollConfig, deductions, selectedMonth, weeklySchedules = []) => {
    // 1. Pre-process logs into Map { empId: [logs] }
    const logsMap = new Map();
    (logs || []).forEach(log => {
        if (!logsMap.has(log.employee_id)) logsMap.set(log.employee_id, []);
        logsMap.get(log.employee_id).push(log);
    });

    // 2. Pre-process deductions
    const deductionsMap = new Map();
    (deductions || []).forEach(d => {
        if (!deductionsMap.has(d.employee_id)) deductionsMap.set(d.employee_id, []);
        deductionsMap.get(d.employee_id).push(d);
    });

    // 3. Pre-process Transactions { empId: { date: [transactions] } }
    const txMap = new Map();
    (transactions || []).forEach(tx => {
        const eid = String(tx.employee_id);
        if (!txMap.has(eid)) txMap.set(eid, {});
        if (!txMap.get(eid)[tx.date]) txMap.get(eid)[tx.date] = [];
        txMap.get(eid)[tx.date].push(tx);
    });

    const activeEmployees = (employees || []).filter(e => e.is_active !== false);

    return activeEmployees.map(emp => {
        let totalSalary = 0;
        let totalOTHours = 0;
        let totalOTPay = 0;
        let workDays = 0;
        let lateCount = 0;
        let absentCount = 0;
        let incompleteCount = 0;
        let offDayWorkCount = 0;
        
        let totalRegularHours = 0;

        const dailyDetails = [];
        const empLogs = logsMap.get(emp.id) || [];
        const empTxs = txMap.get(String(emp.id)) || {};

        const [year, month] = selectedMonth.split('-').map(Number);
        const daysInMonth = new Date(year, month, 0).getDate();

        const defaultHourlyRate = payrollConfig?.hourly_rate || 50;
        const defaultOtRate = payrollConfig?.ot_rate || (defaultHourlyRate * 1.5);
        
        // Parse rates from JSON or use defaults
        const rates = emp.shift_rates || {};
        const hourlyRate = rates.hourly_rate || defaultHourlyRate;
        const otRate = rates.ot_rate || defaultOtRate;

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let dailyTxs = empTxs[dateStr] || [];

            // FALLBACK 1: If no daily transactions, check weekly template schedule
            if (dailyTxs.length === 0 && weeklySchedules.length > 0) {
                const dateObj = new Date(year, month - 1, d);
                const dayOfWeekJS = dateObj.getDay(); // 0=Sun, 1=Mon...
                const dbDayOfWeek = (dayOfWeekJS + 6) % 7; // Mon=0, ..., Sun=6

                const weeklySched = weeklySchedules.find(s => s.employee_id === emp.id && s.day_of_week === dbDayOfWeek);
                if (weeklySched) {
                    if (weeklySched.is_off) {
                        dailyTxs = [{
                            is_off: true,
                            slot_type: 'MAIN',
                            status: 'PUBLISHED'
                        }];
                    } else if (weeklySched.shift_id) {
                        dailyTxs = [{
                            employee_id: emp.id,
                            date: dateStr,
                            slot_type: 'MAIN',
                            shift_id: weeklySched.shift_id,
                            custom_start_time: null,
                            custom_end_time: null,
                            is_off: false,
                            status: 'PUBLISHED'
                        }];
                    }
                }
            }

            // Case A: Scheduled Shift(s) that are NOT OFF
            if (dailyTxs.length > 0 && !dailyTxs.some(t => t.is_off)) {
                dailyTxs.forEach(tx => {
                    let checkIn = null;
                    let checkOut = null;

                    const shift = shifts?.find(s => s.id === tx.shift_id);
                    const startTimeStr = tx.custom_start_time || shift?.start_time;
                    const endTimeStr = tx.custom_end_time || shift?.end_time;
                    
                    if (!startTimeStr || !endTimeStr) return;

                    const { start: scheduledStart, end: scheduledEnd } = createTimeRange(dateStr, startTimeStr, endTimeStr);
                    const scheduledMins = differenceInMinutes(scheduledEnd, scheduledStart);

                    // Find matching logs within 8 hour radius from shift midpoint
                    empLogs.forEach(log => {
                        const logTime = new Date(log.timestamp);
                        const centerTime = new Date((scheduledStart.getTime() + scheduledEnd.getTime()) / 2);
                        const distance = Math.abs(logTime.getTime() - centerTime.getTime());
                        
                        if (distance < 8 * 60 * 60 * 1000) {
                            if (log.action_type === 'check_in') {
                                if (!checkIn || logTime < checkIn) checkIn = logTime;
                            } else if (log.action_type === 'check_out') {
                                if (!checkOut || logTime > checkOut) checkOut = logTime;
                            }
                        }
                    });

                    let actualMins = 0;
                    let lateMins = 0;
                    let regularMins = 0;
                    let otMins = 0;
                    let dailyWage = 0;
                    let dailyOT = 0;

                    if (checkIn && checkOut) {
                        if (isAfter(checkIn, scheduledStart)) {
                            lateMins = differenceInMinutes(checkIn, scheduledStart);
                            if (lateMins > 15) lateCount++; // Grace period of 15 minutes
                        }

                        actualMins = differenceInMinutes(checkOut, checkIn);
                        
                        // Strict Roster-bound calculation: Regular time capped at scheduled end time
                        // Overtime (OT) = any time worked past the scheduled Roster end time
                        if (isAfter(checkOut, scheduledEnd)) {
                            otMins = differenceInMinutes(checkOut, scheduledEnd);
                        } else if (actualMins > scheduledMins) {
                            otMins = actualMins - scheduledMins;
                        } else {
                            otMins = 0;
                        }

                        regularMins = Math.max(0, actualMins - otMins);
                        const rHours = regularMins / 60;
                        const oHours = otMins / 60;
                        const scheduledHours = scheduledMins / 60;

                        // Roster-Coupled Shift Wage Calculation
                        if (wageType === 'monthly') {
                            dailyWage = 0; // Base salary is fixed monthly
                        } else if (wageType === 'hourly') {
                            dailyWage = rHours * hourlyRate;
                        } else {
                            // Daily Shift (รายกะ): Resolved dynamically by Roster scheduled duration
                            if (shift?.rate && Number(shift.rate) > 0) {
                                dailyWage = Number(shift.rate);
                            } else if (scheduledHours >= 11 || tx.slot_type === 'DOUBLE' || tx.slot_type === 'SPLIT') {
                                // Double Shift in Roster (>=11h e.g. 10:00-00:30)
                                dailyWage = Number(rates.double || rates.double_shift_rate || 800);
                            } else if (scheduledHours <= 5.5) {
                                // Short / Part-time Shift in Roster (<=5.5h e.g. 18:00-22:30)
                                dailyWage = rates.rush_4h ? Number(rates.rush_4h) : (rHours * hourlyRate);
                            } else {
                                // Standard Full Shift in Roster (6h to 10.5h e.g. 10:00-18:00, 16:30-00:30, 10:00-20:30)
                                // Uses single unified daily shift rate
                                dailyWage = Number(rates.daily_rate || rates.morning || rates.evening || 350);
                            }
                        }

                        dailyOT = oHours * otRate;

                        totalRegularHours += rHours;
                        totalOTHours += oHours;
                        totalSalary += dailyWage;
                        totalOTPay += dailyOT;
                        workDays++;

                        const shiftLabel = `${startTimeStr}-${endTimeStr}${shift?.name ? ` (${shift.name})` : ''}`;

                        dailyDetails.push({
                            date: dateStr,
                            slot_type: tx.slot_type,
                            shift: shiftLabel,
                            scheduled_in: formatTime(scheduledStart),
                            scheduled_out: formatTime(scheduledEnd),
                            in: formatTime(checkIn),
                            out: formatTime(checkOut),
                            wage: dailyWage,
                            ot: dailyOT,
                            ot_hours: oHours,
                            regular_hours: rHours,
                            status: lateMins > 0 ? `LATE (+${lateMins}M)` : 'NORMAL'
                        });

                    } else if (checkIn && !checkOut) {
                        // Missed check-out
                        incompleteCount++;
                        const shiftLabel = `${startTimeStr}-${endTimeStr}${shift?.name ? ` (${shift.name})` : ''}`;
                        dailyDetails.push({
                            date: dateStr,
                            slot_type: tx.slot_type,
                            shift: shiftLabel,
                            scheduled_in: formatTime(scheduledStart),
                            scheduled_out: formatTime(scheduledEnd),
                            in: formatTime(checkIn),
                            out: '-',
                            wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                            status: 'MISSED CHECK-OUT'
                        });
                    } else if (!checkIn && checkOut) {
                        // Missed check-in
                        incompleteCount++;
                        const shiftLabel = `${startTimeStr}-${endTimeStr}${shift?.name ? ` (${shift.name})` : ''}`;
                        dailyDetails.push({
                            date: dateStr,
                            slot_type: tx.slot_type,
                            shift: shiftLabel,
                            scheduled_in: formatTime(scheduledStart),
                            scheduled_out: formatTime(scheduledEnd),
                            in: '-',
                            out: formatTime(checkOut),
                            wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                            status: 'MISSED CHECK-IN'
                        });
                    } else {
                        // Absent or Draft
                        if (tx.status === 'PUBLISHED') {
                            absentCount++;
                        }
                        dailyDetails.push({
                            date: dateStr,
                            slot_type: tx.slot_type,
                            shift: shift?.name || 'Custom',
                            scheduled_in: formatTime(scheduledStart),
                            scheduled_out: formatTime(scheduledEnd),
                            in: '-',
                            out: '-',
                            wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                            status: tx.status === 'PUBLISHED' ? 'ABSENT' : 'DRAFT'
                        });
                    }
                });

            } else if (dailyTxs.some(t => t.is_off)) {
                // Case B: Scheduled OFF day
                const { checkIn, checkOut } = findDayPunches(empLogs, dateStr);

                if (checkIn && checkOut) {
                    const actualMins = differenceInMinutes(checkOut, checkIn);
                    if (actualMins > 0) {
                        const maxRegularMins = 8 * 60;
                        const regularMins = Math.min(actualMins, maxRegularMins);
                        const otMins = actualMins > maxRegularMins ? actualMins - maxRegularMins : 0;

                        const rHours = regularMins / 60;
                        const oHours = otMins / 60;

                        const dailyWage = rHours * hourlyRate;
                        const dailyOT = oHours * otRate;

                        totalRegularHours += rHours;
                        totalOTHours += oHours;
                        totalSalary += dailyWage;
                        totalOTPay += dailyOT;
                        workDays++;
                        offDayWorkCount++;

                        dailyDetails.push({
                            date: dateStr,
                            slot_type: 'MAIN',
                            shift: 'OFF (WORK)',
                            scheduled_in: '-',
                            scheduled_out: '-',
                            in: formatTime(checkIn),
                            out: formatTime(checkOut),
                            wage: dailyWage,
                            ot: dailyOT,
                            ot_hours: oHours,
                            regular_hours: rHours,
                            status: 'OFF-DAY WORK'
                        });
                    } else {
                        dailyDetails.push({
                            date: dateStr,
                            slot_type: 'MAIN',
                            shift: 'OFF',
                            scheduled_in: '-',
                            scheduled_out: '-',
                            in: formatTime(checkIn),
                            out: formatTime(checkOut),
                            wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                            status: 'OFF'
                        });
                    }
                } else if (checkIn && !checkOut) {
                    incompleteCount++;
                    offDayWorkCount++;
                    dailyDetails.push({
                        date: dateStr,
                        slot_type: 'MAIN',
                        shift: 'OFF',
                        scheduled_in: '-',
                        scheduled_out: '-',
                        in: formatTime(checkIn),
                        out: '-',
                        wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                        status: 'MISSED CHECK-OUT (OFF-DAY)'
                    });
                } else if (!checkIn && checkOut) {
                    incompleteCount++;
                    offDayWorkCount++;
                    dailyDetails.push({
                        date: dateStr,
                        slot_type: 'MAIN',
                        shift: 'OFF',
                        scheduled_in: '-',
                        scheduled_out: '-',
                        in: '-',
                        out: formatTime(checkOut),
                        wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                        status: 'MISSED CHECK-IN (OFF-DAY)'
                    });
                } else {
                    dailyDetails.push({
                        date: dateStr,
                        slot_type: 'MAIN',
                        shift: 'OFF',
                        scheduled_in: '-',
                        scheduled_out: '-',
                        in: '-',
                        out: '-',
                        wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                        status: 'OFF'
                    });
                }

            } else {
                // Case C: Unscheduled day (no roster transaction & no weekly template)
                const { checkIn, checkOut } = findDayPunches(empLogs, dateStr);

                if (checkIn && checkOut) {
                    const actualMins = differenceInMinutes(checkOut, checkIn);
                    if (actualMins > 0) {
                        const maxRegularMins = 8 * 60;
                        const regularMins = Math.min(actualMins, maxRegularMins);
                        const otMins = actualMins > maxRegularMins ? actualMins - maxRegularMins : 0;

                        const rHours = regularMins / 60;
                        const oHours = otMins / 60;

                        const dailyWage = rHours * hourlyRate;
                        const dailyOT = oHours * otRate;

                        totalRegularHours += rHours;
                        totalOTHours += oHours;
                        totalSalary += dailyWage;
                        totalOTPay += dailyOT;
                        workDays++;
                        offDayWorkCount++;

                        dailyDetails.push({
                            date: dateStr,
                            slot_type: 'MAIN',
                            shift: 'UNSCHEDULED',
                            scheduled_in: '-',
                            scheduled_out: '-',
                            in: formatTime(checkIn),
                            out: formatTime(checkOut),
                            wage: dailyWage,
                            ot: dailyOT,
                            ot_hours: oHours,
                            regular_hours: rHours,
                            status: 'UNSCHEDULED WORK'
                        });
                    }
                } else if (checkIn && !checkOut) {
                    incompleteCount++;
                    offDayWorkCount++;
                    dailyDetails.push({
                        date: dateStr,
                        slot_type: 'MAIN',
                        shift: 'UNSCHEDULED',
                        scheduled_in: '-',
                        scheduled_out: '-',
                        in: formatTime(checkIn),
                        out: '-',
                        wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                        status: 'MISSED CHECK-OUT (UNSCHEDULED)'
                    });
                } else if (!checkIn && checkOut) {
                    incompleteCount++;
                    offDayWorkCount++;
                    dailyDetails.push({
                        date: dateStr,
                        slot_type: 'MAIN',
                        shift: 'UNSCHEDULED',
                        scheduled_in: '-',
                        scheduled_out: '-',
                        in: '-',
                        out: formatTime(checkOut),
                        wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                        status: 'MISSED CHECK-IN (UNSCHEDULED)'
                    });
                }
            }
        }

        // Deductions & Allowances Calculation
        const wageType = rates.wage_type || (emp.employment_status === 'Fulltime' && emp.base_salary > 0 ? 'monthly' : (rates.morning || rates.evening ? 'daily' : 'hourly'));
        const baseSalary = Number(emp.base_salary || rates.base_salary || 0);

        // If Monthly staff and worked during month, set totalSalary to baseSalary
        if (wageType === 'monthly' && baseSalary > 0) {
            // If they worked at least 1 day, grant full base salary (standard monthly salary)
            totalSalary = workDays > 0 ? baseSalary : 0;
        }

        // Allowances
        const monthlyAllowance = Number(rates.monthly_allowance || 0);
        const diligenceAllowance = Number(rates.diligence_allowance || 0);
        const isDiligenceEarned = diligenceAllowance > 0 && workDays > 0 && absentCount === 0 && lateCount === 0 && incompleteCount === 0;
        const totalAllowances = monthlyAllowance + (isDiligenceEarned ? diligenceAllowance : 0);

        // Gross before statutory deductions
        const grossEarnings = totalSalary + totalOTPay + totalAllowances;

        // Statutory Deductions
        let ssoDeduct = 0;
        if (rates.social_security_enrolled) {
            // Social security: 5% of base earnings capped at 15,000 THB (max 750 THB)
            const ssoBase = Math.min(Math.max(grossEarnings, 0), 15000);
            ssoDeduct = Math.round(ssoBase * 0.05);
        }

        const taxPct = Number(rates.withholding_tax_pct || 0);
        const taxDeduct = taxPct > 0 ? (grossEarnings * (taxPct / 100)) : 0;

        // Custom Deductions from table
        const empDeductions = deductionsMap.get(emp.id) || [];
        let customDeduct = 0;
        empDeductions.forEach(d => {
            if (d.is_percentage) {
                customDeduct += (grossEarnings) * (parseFloat(d.amount) / 100);
            } else {
                customDeduct += parseFloat(d.amount);
            }
        });

        const totalDeduct = ssoDeduct + taxDeduct + customDeduct;
        const netSalary = Math.max(0, grossEarnings - totalDeduct);

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
            totalAllowances,
            ssoDeduct,
            taxDeduct,
            customDeduct,
            totalDeduct,
            grossEarnings,
            netSalary,
            lateCount,
            absentCount,
            incompleteCount,
            offDayWorkCount,
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
    const doubleRate = Number(rates.double || rates.double_shift_rate || 800);
    const hourlyRate = Number(rates.hourly_rate || 50);
    const otRate = Number(rates.ot_rate || (hourlyRate * 1.5));
    
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
    if (rates.social_security_enrolled) {
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

