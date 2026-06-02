const { createClient } = require('@supabase/supabase-js');
const { differenceInMinutes, parseISO, addDays, isAfter, isBefore } = require("date-fns");
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qmdhbnjjwogtnntjgrle.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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

const formatLocalTime = (date) => {
    if (!date) return '-';
    // Format to HH:mm in local time (UTC+7)
    return date.toLocaleTimeString('en-GB', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });
};

const formatLocalDateStr = (date) => {
    if (!date) return '-';
    return date.toLocaleDateString('en-GB', { timeZone: 'Asia/Bangkok' });
};

async function run() {
    try {
        const [empRes, shiftRes, transRes, logRes, schedRes] = await Promise.all([
            supabase.from('employees').select('*'),
            supabase.from('shifts').select('*'),
            supabase.from('roster_transactions').select('*').gte('date', '2026-05-01').lte('date', '2026-05-31'),
            supabase.from('attendance_logs').select('*').gte('timestamp', '2026-05-01T00:00:00').lte('timestamp', '2026-05-31T23:59:59'),
            supabase.from('employee_schedules').select('*')
        ]);

        const employees = empRes.data;
        const shifts = shiftRes.data;
        const transactions = transRes.data;
        const logs = logRes.data;
        const weeklySchedules = schedRes.data;

        // Group logs by employee
        const logsMap = new Map();
        logs.forEach(log => {
            if (!logsMap.has(log.employee_id)) logsMap.set(log.employee_id, []);
            logsMap.get(log.employee_id).push(log);
        });

        // Group transactions by employee date
        const txMap = new Map();
        transactions.forEach(tx => {
            const eid = String(tx.employee_id);
            if (!txMap.has(eid)) txMap.set(eid, {});
            if (!txMap.get(eid)[tx.date]) txMap.get(eid)[tx.date] = [];
            txMap.get(eid)[tx.date].push(tx);
        });

        let report = "# Detailed Payroll and Roster Sync Report for May 2026\n\n";

        employees.filter(e => e.is_active !== false).forEach(emp => {
            report += `## Employee: ${emp.name} (${emp.nickname || 'No Nickname'}) - Position: ${emp.position}\n\n`;
            report += `| Date | Scheduled Shift | Scheduled Time | Real Check In | Real Check Out | Payroll In | Payroll Out | Status | Mismatch / Issue |\n`;
            report += `| --- | --- | --- | --- | --- | --- | --- | --- | --- |\n`;

            const empLogs = logsMap.get(emp.id) || [];
            const empTxs = txMap.get(String(emp.id)) || {};

            const [year, month] = ['2026', '05'].map(Number);
            const daysInMonth = new Date(year, month, 0).getDate();

            for (let d = 1; d <= daysInMonth; d++) {
                const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
                let dailyTxs = empTxs[dateStr] || [];

                // FALLBACK: weekly template schedule
                let isFallbackUsed = false;
                if (dailyTxs.length === 0 && weeklySchedules.length > 0) {
                    const dateObj = new Date(year, month - 1, d);
                    const dayOfWeekJS = dateObj.getDay(); // 0=Sun, 1=Mon...
                    const dbDayOfWeek = (dayOfWeekJS + 6) % 7; // Mon=0, ..., Sun=6

                    const weeklySched = weeklySchedules.find(s => s.employee_id === emp.id && s.day_of_week === dbDayOfWeek);
                    if (weeklySched) {
                        isFallbackUsed = true;
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

                // Get raw logs for this date (in Bangkok time zone)
                // Since logs are in UTC, we filter logs that fall in the local day dateStr
                // A local day in UTC is from dateStrT00:00:00+07:00 to dateStrT23:59:59+07:00
                const localDayStart = new Date(`${dateStr}T00:00:00+07:00`);
                const localDayEnd = new Date(`${dateStr}T23:59:59+07:00`);

                const rawLogsOnDate = empLogs.filter(log => {
                    const t = new Date(log.timestamp);
                    return t >= localDayStart && t <= localDayEnd;
                });

                const rawCheckIns = rawLogsOnDate.filter(l => l.action_type === 'check_in').sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));
                const rawCheckOuts = rawLogsOnDate.filter(l => l.action_type === 'check_out').sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp));

                const firstRawCheckIn = rawCheckIns.length > 0 ? new Date(rawCheckIns[0].timestamp) : null;
                const lastRawCheckOut = rawCheckOuts.length > 0 ? new Date(rawCheckOuts[rawCheckOuts.length - 1].timestamp) : null;

                if (dailyTxs.length > 0) {
                    dailyTxs.forEach(tx => {
                        let checkIn = null;
                        let checkOut = null;
                        let statusStr = "";
                        let issueStr = "";

                        if (tx.is_off) {
                            statusStr = "Off Day";
                            if (firstRawCheckIn || lastRawCheckOut) {
                                issueStr = `Worked on Off Day: Clocks [${formatLocalTime(firstRawCheckIn)} - ${formatLocalTime(lastRawCheckOut)}] but scheduled OFF`;
                            }
                            report += `| ${dateStr} | OFF | - | ${formatLocalTime(firstRawCheckIn)} | ${formatLocalTime(lastRawCheckOut)} | - | - | ${statusStr} | ${issueStr} |\n`;
                            return;
                        }

                        const shift = shifts.find(s => s.id === tx.shift_id);
                        const startTimeStr = tx.custom_start_time || shift?.start_time;
                        const endTimeStr = tx.custom_end_time || shift?.end_time;

                        if (!startTimeStr || !endTimeStr) {
                            report += `| ${dateStr} | ${shift?.name || 'Custom'} | Error | ${formatLocalTime(firstRawCheckIn)} | ${formatLocalTime(lastRawCheckOut)} | - | - | Schedule Error | Missing shift times |\n`;
                            return;
                        }

                        const { start: scheduledStart, end: scheduledEnd } = createTimeRange(dateStr, startTimeStr, endTimeStr);

                        // Run the exact 8-hour matching logic
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

                        if (checkIn && checkOut) {
                            const lateMins = isAfter(checkIn, scheduledStart) ? differenceInMinutes(checkIn, scheduledStart) : 0;
                            statusStr = lateMins > 0 ? `Late (${lateMins}m)` : "Normal";
                        } else if (!checkIn && !checkOut) {
                            statusStr = tx.status === 'PUBLISHED' ? "Absent" : "Draft (Unscheduled)";
                            if (firstRawCheckIn || lastRawCheckOut) {
                                issueStr = `Real logs exist [In: ${formatLocalTime(firstRawCheckIn)}, Out: ${formatLocalTime(lastRawCheckOut)}] but NOT matched by payroll logic (outside 8h shift window)`;
                            }
                        } else {
                            statusStr = "Incomplete";
                            if (checkIn && !checkOut) {
                                issueStr = `Missing check-out. Real check-out was [${formatLocalTime(lastRawCheckOut)}] but excluded (outside 8h window?)`;
                            } else if (!checkIn && checkOut) {
                                issueStr = `Missing check-in. Real check-in was [${formatLocalTime(firstRawCheckIn)}] but excluded (outside 8h window?)`;
                            }
                        }

                        // Add note if fallback is used
                        const schedSource = isFallbackUsed ? `Weekly:${shift?.name || 'Custom'}` : (shift?.name || 'Custom');

                        report += `| ${dateStr} | ${schedSource} | ${startTimeStr.slice(0,5)}-${endTimeStr.slice(0,5)} | ${formatLocalTime(firstRawCheckIn)} | ${formatLocalTime(lastRawCheckOut)} | ${formatLocalTime(checkIn)} | ${formatLocalTime(checkOut)} | ${statusStr} | ${issueStr} |\n`;
                    });
                } else {
                    // No schedule at all (unscheduled day)
                    let statusStr = "Unscheduled";
                    let issueStr = "";
                    let payrollIn = null;
                    let payrollOut = null;

                    // Check if payroll would match them as unscheduled work
                    const checkInLog = rawCheckIns.length > 0 ? rawCheckIns[0] : null;
                    const checkOutLog = rawCheckOuts.length > 0 ? rawCheckOuts[rawCheckOuts.length - 1] : null;

                    if (checkInLog && checkOutLog) {
                        const checkInTime = new Date(checkInLog.timestamp);
                        const checkOutTime = new Date(checkOutLog.timestamp);
                        if (differenceInMinutes(checkOutTime, checkInTime) > 0) {
                            statusStr = "Unscheduled Work";
                            payrollIn = checkInTime;
                            payrollOut = checkOutTime;
                        }
                    } else if (firstRawCheckIn || lastRawCheckOut) {
                        statusStr = "Unscheduled Incomplete";
                        issueStr = "Checked in or out but no matching pair on unscheduled day";
                    }

                    report += `| ${dateStr} | None | - | ${formatLocalTime(firstRawCheckIn)} | ${formatLocalTime(lastRawCheckOut)} | ${formatLocalTime(payrollIn)} | ${formatLocalTime(payrollOut)} | ${statusStr} | ${issueStr} |\n`;
                }
            }
            report += `\n`;
        });

        fs.writeFileSync(path.join(__dirname, 'payroll_sync_report.md'), report, 'utf8');
        console.log("Report generated successfully as scratch/payroll_sync_report.md");

    } catch (e) {
        console.error(e);
    }
}

run();
