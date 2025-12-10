
import { differenceInMinutes, parseISO } from "date-fns";

/**
 * Calculates payroll, OT, and attendance stats for all employees.
 * Optimized for performance by reducing array iterations.
 * 
 * @param {Array} employees 
 * @param {Array} logs 
 * @param {Object} schedules - Map of empId -> { dayOfWeek -> schedule }
 * @param {Array} shifts 
 * @param {Object} payrollConfig 
 * @param {Array} deductions 
 * @param {String} selectedMonth - Format "YYYY-MM"
 * @returns {Array} Processed payroll data
 */
export const calculatePayroll = (employees, logs, schedules, shifts, payrollConfig, deductions, selectedMonth) => {
    // optimize: Pre-process logs into a Map { empId: { date: [logs] } }
    const logsMap = new Map();

    logs.forEach(log => {
        if (!logsMap.has(log.employee_id)) {
            logsMap.set(log.employee_id, {});
        }
        const empLogs = logsMap.get(log.employee_id);
        const dateStr = log.timestamp.split('T')[0];

        if (!empLogs[dateStr]) empLogs[dateStr] = [];
        empLogs[dateStr].push(log);
    });

    // optimize: Pre-process deductions into a Map { empId: [deductions] }
    const deductionsMap = new Map();
    deductions.forEach(d => {
        if (!deductionsMap.has(d.employee_id)) deductionsMap.set(d.employee_id, []);
        deductionsMap.get(d.employee_id).push(d);
    });

    return employees.map(emp => {
        let totalSalary = 0;
        let totalOTHours = 0;
        let totalOTPay = 0;
        let workDays = 0;

        // Stats Counters
        let lateCount = 0;
        let absentCount = 0;
        let duplicateCount = 0;

        const empLogsByDate = logsMap.get(emp.id) || {};

        Object.keys(empLogsByDate).forEach(dateStr => {
            const dailyLogs = empLogsByDate[dateStr];

            // 1. Check Absent
            if (dailyLogs.some(l => l.action_type === 'absent')) {
                absentCount++;
                return;
            }

            // 2. Separate & Sort Logs
            // Optimization: sort once
            // ✅ Fix: Use parseISO for Safari compatibility
            dailyLogs.sort((a, b) => parseISO(a.timestamp) - parseISO(b.timestamp));

            const checkIns = [];
            const checkOuts = [];

            dailyLogs.forEach(l => {
                if (l.action_type === 'check_in') checkIns.push(l);
                else if (l.action_type === 'check_out') checkOuts.push(l);
            });

            // 3. Count Duplicates
            if (checkIns.length > 1 || checkOuts.length > 1) {
                duplicateCount += (Math.max(checkIns.length, checkOuts.length) - 1);
            }

            // 4. Process Work Day (Must have In + Out)
            if (checkIns.length > 0 && checkOuts.length > 0) {
                const firstIn = checkIns[0];
                const lastOut = checkOuts[checkOuts.length - 1];

                const logDate = parseISO(firstIn.timestamp);
                const dayOfWeek = logDate.getDay();

                const schedule = schedules[emp.id]?.[dayOfWeek];
                const currentShift = shifts.find(s => s.id === schedule?.shift_id);

                if (currentShift) {
                    // --- Wage Calculation ---
                    let dailyWage = 0;
                    if (currentShift.name.includes("ควบ") || currentShift.name.includes("Double")) {
                        dailyWage = parseFloat(payrollConfig.double_shift_rate) || 1000;
                    } else {
                        dailyWage = parseFloat(currentShift.salary) || 0;
                    }
                    totalSalary += dailyWage;
                    workDays++;

                    // --- Late Calculation ---
                    const [sh, sm] = currentShift.start_time.split(':');
                    const shiftStart = new Date(logDate);
                    shiftStart.setHours(sh, sm, 0);

                    if (differenceInMinutes(parseISO(firstIn.timestamp), shiftStart) > 0) {
                        lateCount++;
                    }

                    // --- OT Calculation ---
                    const outTime = parseISO(lastOut.timestamp);
                    const [eh, em] = currentShift.end_time.split(':').map(Number);

                    const shiftEnd = new Date(logDate);
                    shiftEnd.setHours(eh, em, 0);

                    const [sh_check, sm_check] = currentShift.start_time.split(':').map(Number);
                    // Ensure eh_check etc are defined if used, but they were used deep in old code logic
                    // Actually, we can just use the previous logic
                    if (eh < sh_check) {
                        shiftEnd.setDate(shiftEnd.getDate() + 1);
                    }

                    const diffMinutes = differenceInMinutes(outTime, shiftEnd);
                    if (diffMinutes > 0) {
                        const otHours = Math.ceil(diffMinutes / 60);
                        totalOTHours += otHours;
                        totalOTPay += otHours * (parseFloat(payrollConfig.ot_rate) || 60);
                    }
                }
            }
        });

        // 5. Deductions
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
            totalSalary,
            totalOTHours,
            totalOTPay,
            totalDeduct,
            netSalary: (totalSalary + totalOTPay) - totalDeduct,
            lateCount,
            absentCount,
            duplicateCount
        };
    });
};
