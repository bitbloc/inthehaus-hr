const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qmdhbnjjwogtnntjgrle.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseKey);

const fs = require('fs');
const path = require('path');

async function run() {
    try {
        const [empRes, shiftRes, transRes, logRes, schedRes] = await Promise.all([
            supabase.from('employees').select('*'),
            supabase.from('shifts').select('*'),
            supabase.from('roster_transactions').select('*').gte('date', '2026-05-01').lte('date', '2026-05-31'),
            supabase.from('attendance_logs').select('*').gte('timestamp', '2026-05-01T00:00:00').lte('timestamp', '2026-05-31T23:59:59'),
            supabase.from('employee_schedules').select('*')
        ]);

        let out = "";
        const log = (msg) => {
            out += msg + "\n";
        };

        log("Employees listed:");
        empRes.data.forEach(e => log(`ID: ${e.id}, Name: ${e.name}, Nickname: ${e.nickname}`));

        log("\nShifts listed:");
        shiftRes.data.forEach(s => log(`ID: ${s.id}, Name: ${s.name}, Time: ${s.start_time} - ${s.end_time}`));

        log("\nWeekly Schedules (Templates):");
        schedRes.data.forEach(s => {
            const emp = empRes.data.find(e => e.id === s.employee_id);
            const shift = shiftRes.data.find(sh => sh.id === s.shift_id);
            log(`  Emp: ${emp ? (emp.nickname || emp.name) : s.employee_id} | Day: ${s.day_of_week} (0=Mon...6=Sun) | Shift: ${shift ? shift.name : 'OFF'} | Off: ${s.is_off}`);
        });

        // Group logs by employee
        const logsByEmp = {};
        logRes.data.forEach(l => {
            if (!logsByEmp[l.employee_id]) logsByEmp[l.employee_id] = [];
            logsByEmp[l.employee_id].push(l);
        });

        // Group transactions by employee
        const txsByEmp = {};
        transRes.data.forEach(t => {
            if (!txsByEmp[t.employee_id]) txsByEmp[t.employee_id] = [];
            txsByEmp[t.employee_id].push(t);
        });

        // Sort both
        empRes.data.forEach(emp => {
            const myLogs = logsByEmp[emp.id] || [];
            myLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            const myTxs = txsByEmp[emp.id] || [];
            myTxs.sort((a, b) => a.date.localeCompare(b.date));

            log(`\n========================================`);
            log(`Employee: ${emp.nickname || emp.name} (ID: ${emp.id})`);
            log(`========================================`);

            log("Transactions (Roster Schedule):");
            myTxs.forEach(t => {
                const shift = shiftRes.data.find(s => s.id === t.shift_id);
                log(`  Date: ${t.date} | Shift: ${shift ? shift.name : 'Unknown'} (${t.custom_start_time || shift?.start_time} - ${t.custom_end_time || shift?.end_time}) | Status: ${t.status} | Off: ${t.is_off}`);
            });

            log("Attendance Logs (Clock in/out):");
            myLogs.forEach(l => {
                log(`  Time: ${l.timestamp} | Action: ${l.action_type}`);
            });
        });

        fs.writeFileSync(path.join(__dirname, 'inspect_attendance_output.txt'), out, 'utf8');
        console.log("Output written to scratch/inspect_attendance_output.txt");

    } catch (e) {
        console.error(e);
    }
}

run();
