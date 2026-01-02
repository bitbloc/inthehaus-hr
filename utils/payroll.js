
import { differenceInMinutes, parseISO } from "date-fns";

/**
 * Calculates payroll, OT, and attendance stats for all employees.
 * @param {Array} employees 
 * @param {Array} logs 
 * @param {Object} schedules 
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

    const activeEmployees = employees.filter(e => e.is_active !== false);

    return activeEmployees.map(emp => {
        let totalSalary = 0;
        let totalOTHours = 0;
        let totalOTPay = 0;
        let workDays = 0;

        let lateCount = 0;
        let absentCount = 0;
        let duplicateCount = 0;

        const dailyDetails = []; // To store per-day breakdown

        const empLogsByDate = logsMap.get(emp.id) || {};

        Object.keys(empLogsByDate).forEach(dateStr => {
            const dailyLogs = empLogsByDate[dateStr];

            // 1. Check Absent
            if (dailyLogs.some(l => l.action_type === 'absent')) {
                absentCount++;
                dailyDetails.push({ date: dateStr, status: 'Absent', wage: 0, ot: 0, note: '-' });
                return;
            }

            // 2. Separate & Sort
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

            // 4. Process Work Day
            if (checkIns.length > 0 && checkOuts.length > 0) {
                const firstIn = checkIns[0];
                const lastOut = checkOuts[checkOuts.length - 1];
                const logDate = parseISO(firstIn.timestamp);
                const dayOfWeek = logDate.getDay();

                const schedule = schedules[emp.id]?.[dayOfWeek];
                const currentShift = shifts.find(s => s.id === schedule?.shift_id);

                let dailyWage = 0;
                let dailyOT = 0;
                let dailyOTHours = 0;
                let status = 'Normal';
                let lateMins = 0;

                if (currentShift) {
                    // --- Wage Calculation (Priority: Employee Shift Rate > Shift General Salary) ---
                    const shiftKey = currentShift.name.toLowerCase().trim().split(' ')[0]; // dumb match for 'morning', 'evening'
                    // Robust matching:
                    const normName = currentShift.name.toLowerCase();
                    let rateKey = null;
                    if (normName.includes('เช้า') || normName.includes('morning')) rateKey = 'morning';
                    else if (normName.includes('ค่ำ') || normName.includes('evening')) rateKey = 'evening';
                    else if (normName.includes('ควบ') || normName.includes('double')) rateKey = 'double';

                    if (rateKey && emp.shift_rates && emp.shift_rates[rateKey]) {
                        dailyWage = Number(emp.shift_rates[rateKey]);
                    } else {
                        // Fallback to shift Salary or config
                        if (rateKey === 'double') dailyWage = parseFloat(payrollConfig.double_shift_rate) || 1000;
                        else dailyWage = parseFloat(currentShift.salary) || 500;
                    }

                    totalSalary += dailyWage;
                    workDays++;

                    // --- Late Calculation ---
                    const [sh, sm] = currentShift.start_time.split(':');
                    const shiftStart = new Date(logDate);
                    shiftStart.setHours(sh, sm, 0);

                    const inTimeDiff = differenceInMinutes(parseISO(firstIn.timestamp), shiftStart);
                    if (inTimeDiff > 0) {
                        lateCount++;
                        lateMins = inTimeDiff;
                        status = `Late (${lateMins}m)`;
                    }

                    // --- OT Calculation (Strict Rounding Logic) ---
                    const outTime = parseISO(lastOut.timestamp);
                    const [eh, em] = currentShift.end_time.split(':').map(Number);
                    const shiftEnd = new Date(logDate);
                    shiftEnd.setHours(eh, em, 0);

                    const [sh_check] = currentShift.start_time.split(':');
                    // Handle overnight shift end
                    if (eh < Number(sh_check)) {
                        shiftEnd.setDate(shiftEnd.getDate() + 1);
                    }

                    const diffMinutes = differenceInMinutes(outTime, shiftEnd);

                    if (diffMinutes >= 29) { // Rule: < 29 ignored
                        let hours = Math.floor(diffMinutes / 60);
                        const remainder = diffMinutes % 60;

                        if (remainder >= 30) {
                            hours += 1;
                        }

                        if (hours > 0) {
                            dailyOTHours = hours;
                            dailyOT = hours * (parseFloat(payrollConfig.ot_rate) || 50); // Default 50 if config missing
                            totalOTHours += dailyOTHours;
                            totalOTPay += dailyOT;
                        }
                    }
                }

                dailyDetails.push({
                    date: dateStr,
                    shift: currentShift?.name || 'Unknown',
                    in: formatTime(parseISO(firstIn.timestamp)),
                    out: formatTime(parseISO(lastOut.timestamp)),
                    wage: dailyWage,
                    ot: dailyOT,
                    ot_hours: dailyOTHours,
                    status: status
                });
            } else {
                dailyDetails.push({ date: dateStr, status: 'Incomplete', wage: 0, ot: 0 });
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
            duplicateCount,
            dailyDetails: dailyDetails.sort((a, b) => a.date.localeCompare(b.date))
        };
    });
};

const formatTime = (date) => {
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};
