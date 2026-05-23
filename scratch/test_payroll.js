const { createClient } = require('@supabase/supabase-js');
const { differenceInMinutes, parseISO, addDays, isAfter, isBefore } = require("date-fns");

const supabaseUrl = 'https://qmdhbnjjwogtnntjgrle.supabase.co';
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFtZGhibmpqd29ndG5udGpncmxlIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQwNTQ4MzgsImV4cCI6MjA3OTYzMDgzOH0.BoXp_cwLU4k8KY_KaZi4oyAsebWJjD7A7sAe1nLlJBg';

const supabase = createClient(supabaseUrl, supabaseKey);

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
    return date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
};

function testCalculatePayroll(employees, logs, transactions, shifts, payrollConfig, deductions, selectedMonth, weeklySchedules = []) {
    // 1. Pre-process logs into Map { empId: [logs] }
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
        
        const rates = emp.shift_rates || {};
        const hourlyRate = rates.hourly_rate || defaultHourlyRate;
        const otRate = rates.ot_rate || defaultOtRate;

        for (let d = 1; d <= daysInMonth; d++) {
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
            let dailyTxs = empTxs[dateStr] || [];

            // FALLBACK 1: If no daily transactions, check weekly template
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

            // Process daily transactions if they exist (either overrides or weekly template fallback)
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

                    // Find matching logs (within 8 hour radius of shift midpoint)
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
                            if (lateMins > 15) lateCount++; // Only count late if > 15 mins like in old system? Or > 0? Let's stick to original lateCount++ if lateMins > 0
                        }

                        actualMins = differenceInMinutes(checkOut, checkIn);
                        regularMins = Math.min(actualMins, scheduledMins);
                        
                        if (actualMins > scheduledMins) {
                            otMins = actualMins - scheduledMins;
                        }

                        const rHours = regularMins / 60;
                        const oHours = otMins / 60;

                        let rateKey = null;
                        const normName = (shift?.name || '').toLowerCase();
                        if (normName.includes('เช้า') || normName.includes('morning')) rateKey = 'morning';
                        else if (normName.includes('ค่ำ') || normName.includes('evening')) rateKey = 'evening';
                        else if (tx.slot_type === 'SPLIT' || tx.slot_type === 'DOUBLE') rateKey = 'double';

                        if (rateKey && rates[rateKey]) {
                            dailyWage = Number(rates[rateKey]);
                        } else {
                            dailyWage = rHours * hourlyRate;
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
            } else {
                // FALLBACK 2: No schedule at all (unscheduled day), but let's check if they checked in & out
                // Find any logs for this dateStr
                const logsOnDate = empLogs.filter(log => log.timestamp.startsWith(dateStr));
                const checkInLog = logsOnDate.find(l => l.action_type === 'check_in');
                const checkOutLog = logsOnDate.find(l => l.action_type === 'check_out');

                if (checkInLog && checkOutLog) {
                    const checkInTime = new Date(checkInLog.timestamp);
                    const checkOutTime = new Date(checkOutLog.timestamp);
                    const actualMins = differenceInMinutes(checkOutTime, checkInTime);

                    if (actualMins > 0) {
                        // 8-hour rule for unscheduled work
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

                        dailyDetails.push({
                            date: dateStr,
                            slot_type: 'MAIN',
                            shift: 'Unscheduled',
                            scheduled_in: '-',
                            scheduled_out: '-',
                            in: formatTime(checkInTime),
                            out: formatTime(checkOutTime),
                            wage: dailyWage,
                            ot: dailyOT,
                            ot_hours: oHours,
                            regular_hours: rHours,
                            status: 'Unscheduled Work'
                        });
                    }
                }
            }
        }

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
}

async function run() {
    try {
        const [empRes, shiftRes, transRes, logRes, schedRes] = await Promise.all([
            supabase.from('employees').select('*'),
            supabase.from('shifts').select('*'),
            supabase.from('roster_transactions').select('*').gte('date', '2026-05-01').lte('date', '2026-05-31'), // All transactions, including DRAFT
            supabase.from('attendance_logs').select('*').gte('timestamp', '2026-05-01T00:00:00').lte('timestamp', '2026-05-31T23:59:59'),
            supabase.from('employee_schedules').select('*')
        ]);

        console.log("Input counts:");
        console.log(`Employees: ${empRes.data.length}`);
        console.log(`Shifts: ${shiftRes.data.length}`);
        console.log(`Transactions: ${transRes.data.length}`);
        console.log(`Logs: ${logRes.data.length}`);
        console.log(`Weekly Schedules: ${schedRes.data.length}`);

        const results = testCalculatePayroll(
            empRes.data,
            logRes.data,
            transRes.data,
            shiftRes.data,
            { hourly_rate: 50, ot_rate: 75 },
            [],
            '2026-05',
            schedRes.data
        );

        console.log("\n=== PAYROLL CALCULATION RESULTS FOR MAY 2026 ===");
        results.forEach(res => {
            console.log(`\nEmployee: ${res.emp.nickname || res.emp.name} (Role: ${res.emp.position})`);
            console.log(`  Work Days: ${res.workDays}`);
            console.log(`  Reg Hours: ${res.totalRegularHours.toFixed(2)} hrs`);
            console.log(`  OT Hours: ${res.totalOTHours.toFixed(2)} hrs`);
            console.log(`  Reg Salary: ฿${res.totalSalary.toFixed(2)}`);
            console.log(`  OT Salary: ฿${res.totalOTPay.toFixed(2)}`);
            console.log(`  Net Salary: ฿${res.netSalary.toFixed(2)}`);
            console.log(`  Late Count: ${res.lateCount}`);
            console.log(`  Absent Count: ${res.absentCount}`);
            if (res.dailyDetails.length > 0) {
                console.log(`  Sample details (first 3):`, res.dailyDetails.filter(d => d.status !== 'Absent (No Show)').slice(0, 3));
            }
        });

    } catch (e) {
        console.error(e);
    }
}

run();
