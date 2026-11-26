// Totals of one month's payroll (no names, no per-person pay), from the same
// calculatePayroll the payroll page uses. Served to Haustable by
// app/api/payroll/summary/route.js.

import { startOfMonth, endOfMonth, addDays, format } from 'date-fns';
import { calculatePayroll } from './payroll.js';

const r2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export async function summarizeMonthlyPayroll(supabase, month) {
    const [year, mon] = month.split('-').map(Number);
    const startDate = startOfMonth(new Date(year, mon - 1));
    const endDate = endOfMonth(startDate);
    const startStr = format(startDate, 'yyyy-MM-dd');
    const endStr = format(endDate, 'yyyy-MM-dd');

    // Same queries as app/admin/payroll/page.js
    const [empRes, shiftRes, transRes, logRes, schedRes, deductRes, configRes] = await Promise.all([
        supabase.from('employees').select('*').order('id'),
        supabase.from('shifts').select('*').order('start_time'),
        supabase.from('roster_transactions').select('*').gte('date', startStr).lte('date', endStr),
        supabase.from('attendance_logs').select('*').gte('timestamp', addDays(startDate, -1).toISOString()).lte('timestamp', addDays(endDate, 2).toISOString()).order('timestamp'),
        supabase.from('employee_schedules').select('*'),
        supabase.from('payroll_deductions').select('*').eq('month', month),
        supabase.from('payroll_config').select('*'),
    ]);
    const failed = [empRes, transRes, logRes].find((r) => r.error);
    if (failed) throw new Error(failed.error.message);

    const payrollConfig = { hourly_rate: 50, ot_rate: 50 };
    configRes.data?.forEach((c) => { payrollConfig[c.key] = Number(c.value); });

    const rows = calculatePayroll(empRes.data, logRes.data, transRes.data, shiftRes.data || [], payrollConfig, deductRes.data || [], month, schedRes.data || []);
    const paid = rows.filter((r) => r.grossEarnings > 0);
    const sum = (k) => r2(paid.reduce((s, r) => s + (Number(r[k]) || 0), 0));

    const byPosition = new Map();
    for (const r of paid) {
        const key = r.emp?.position || 'ไม่ระบุตำแหน่ง';
        const e = byPosition.get(key) || { position: key, headcount: 0, gross: 0 };
        e.headcount += 1;
        e.gross = r2(e.gross + r.grossEarnings);
        byPosition.set(key, e);
    }

    // Labour per day: shift wages and OT on the day they were worked, plus the fixed part
    // (monthly base salary, allowances, bonuses) spread evenly over the month. An estimate
    // for comparing with daily sales; the month total stays exact.
    const daysInMonth = new Date(year, mon, 0).getDate();
    const variable = new Map();
    let variableTotal = 0;
    for (const r of paid) {
        for (const d of r.dailyDetails || []) {
            const v = (Number(d.wage) || 0) + (Number(d.ot) || 0);
            if (!v || !d.date) continue;
            variable.set(d.date, (variable.get(d.date) || 0) + v);
            variableTotal += v;
        }
    }
    const fixedPerDay = Math.max(0, (sum('grossEarnings') - variableTotal) / daysInMonth);
    const byDay = Array.from({ length: daysInMonth }, (_, i) => {
        const date = `${month}-${String(i + 1).padStart(2, '0')}`;
        return { date, labor: r2((variable.get(date) || 0) + fixedPerDay) };
    });

    return {
        month,
        headcount: paid.length,
        byDay,
        gross: sum('grossEarnings'), // labour cost to the shop
        wages: sum('totalSalary'),
        overtime: sum('totalOTPay'),
        allowances: sum('totalAllowances'),
        deductions: sum('totalDeduct'),
        net: sum('netSalary'), // paid out to staff
        regularHours: sum('totalRegularHours'),
        otHours: sum('totalOTHours'),
        byPosition: [...byPosition.values()].sort((a, b) => b.gross - a.gross),
        computedAt: new Date().toISOString(),
    };
}
