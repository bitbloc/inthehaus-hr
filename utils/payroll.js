import { differenceInMinutes, parseISO, addDays, isAfter, isBefore } from "date-fns";

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

/**
 * Calculates payroll, OT, and attendance stats for all employees using roster_transactions.
 */
export const calculatePayroll = (employees, logs, transactions, shifts, payrollConfig, deductions, selectedMonth) => {
    // 1. Pre-process logs into Map { empId: { date: [logs] } }
    const logsMap = new Map();
    logs.forEach(log => {
        if (!logsMap.has(log.employee_id)) logsMap.set(log.employee_id, []);
        logsMap.get(log.employee_id).push(log);
    });

    // 2. Pre-process deductions
    const deductionsMap = new Map();
    deductions.forEach(d => {
        if (!deductionsMap.has(d.employee_id)) deductionsMap.set(d.employee_id, []);
        deductionsMap.get(d.employee_id).push(d);
    });

    // 3. Pre-process Transactions { empId: { date: [transactions] } }
    const txMap = new Map();
    transactions.forEach(tx => {
        const eid = String(tx.employee_id);
        if (!txMap.has(eid)) txMap.set(eid, {});
        if (!txMap.get(eid)[tx.date]) txMap.get(eid)[tx.date] = [];
        txMap.get(eid)[tx.date].push(tx);
    });

    const activeEmployees = employees.filter(e => e.is_active !== false);

    return activeEmployees.map(emp => {
        let totalSalary = 0;
        let totalOTHours = 0;
        let totalOTPay = 0;
        let workDays = 0;
        let lateCount = 0;
        let absentCount = 0;
        
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
            const dailyTxs = empTxs[dateStr] || [];

            // If scheduled to work
            if (dailyTxs.length > 0 && !dailyTxs.some(t => t.is_off)) {
                
                dailyTxs.forEach(tx => {
                    let checkIn = null;
                    let checkOut = null;
                    let isAbsent = true;

                    const shift = shifts?.find(s => s.id === tx.shift_id);
                    const startTimeStr = tx.custom_start_time || shift?.start_time;
                    const endTimeStr = tx.custom_end_time || shift?.end_time;
                    
                    if (!startTimeStr || !endTimeStr) return;

                    const { start: scheduledStart, end: scheduledEnd } = createTimeRange(dateStr, startTimeStr, endTimeStr);
                    const scheduledMins = differenceInMinutes(scheduledEnd, scheduledStart);

                    // Find matching logs (within 8 hour radius)
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
                        isAbsent = false;
                        if (isAfter(checkIn, scheduledStart)) {
                            lateMins = differenceInMinutes(checkIn, scheduledStart);
                            if (lateMins > 0) lateCount++;
                        }

                        actualMins = differenceInMinutes(checkOut, checkIn);
                        regularMins = Math.min(actualMins, scheduledMins);
                        
                        if (actualMins > scheduledMins) {
                            otMins = actualMins - scheduledMins;
                        }

                        // Calculate Pay
                        const rHours = regularMins / 60;
                        const oHours = otMins / 60;

                        // Check if they use flat shift rate or hourly
                        let rateKey = null;
                        const normName = (shift?.name || '').toLowerCase();
                        if (normName.includes('เช้า') || normName.includes('morning')) rateKey = 'morning';
                        else if (normName.includes('ค่ำ') || normName.includes('evening')) rateKey = 'evening';
                        else if (tx.slot_type === 'SPLIT' || tx.slot_type === 'DOUBLE') rateKey = 'double';

                        if (rateKey && rates[rateKey]) {
                            dailyWage = Number(rates[rateKey]); // Flat shift rate
                        } else {
                            dailyWage = rHours * hourlyRate; // Hourly rate
                        }

                        dailyOT = oHours * otRate;

                        totalRegularHours += rHours;
                        totalOTHours += oHours;
                        totalSalary += dailyWage;
                        totalOTPay += dailyOT;
                        workDays++;

                        dailyDetails.push({
                            date: dateStr,
                            slot_type: tx.slot_type,
                            shift: shift?.name || 'Custom',
                            scheduled_in: formatTime(scheduledStart),
                            scheduled_out: formatTime(scheduledEnd),
                            in: formatTime(checkIn),
                            out: formatTime(checkOut),
                            wage: dailyWage,
                            ot: dailyOT,
                            ot_hours: oHours,
                            regular_hours: rHours,
                            status: lateMins > 0 ? `Late (${lateMins}m)` : 'Normal'
                        });

                    } else {
                        // Incomplete or Absent
                        if (!checkIn && !checkOut) {
                            absentCount++;
                            dailyDetails.push({
                                date: dateStr,
                                shift: shift?.name || 'Custom',
                                in: '-', out: '-',
                                wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                                status: 'Absent (No Show)'
                            });
                        } else {
                            dailyDetails.push({
                                date: dateStr,
                                shift: shift?.name || 'Custom',
                                in: checkIn ? formatTime(checkIn) : '-', 
                                out: checkOut ? formatTime(checkOut) : '-',
                                wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                                status: 'Incomplete'
                            });
                        }
                    }
                });
            } else if (dailyTxs.some(t => t.is_off)) {
                dailyDetails.push({
                    date: dateStr,
                    shift: 'OFF',
                    in: '-', out: '-',
                    wage: 0, ot: 0, ot_hours: 0, regular_hours: 0,
                    status: 'Off Day'
                });
            }
        }

        // Deductions
        const empDeductions = deductionsMap.get(emp.id) || [];
        let totalDeduct = 0;
        empDeductions.forEach(d => {
            if (d.is_percentage) {
                totalDeduct += (totalSalary + totalOTPay) * (parseFloat(d.amount) / 100);
            } else {
                totalDeduct += parseFloat(d.amount);
            }
        });

        return {
            emp,
            workDays,
            totalRegularHours,
            totalOTHours,
            totalSalary,
            totalOTPay,
            totalDeduct,
            netSalary: (totalSalary + totalOTPay) - totalDeduct,
            lateCount,
            absentCount,
            dailyDetails: dailyDetails.sort((a, b) => a.date.localeCompare(b.date))
        };
    });
};

const formatTime = (date) => {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
