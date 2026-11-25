"use client";
/* Brand v2 · payroll. Cream surface, plum header, one charcoal primary (พิมพ์สลิปทั้งหมด).
 * Thai labels, money in DM Mono with 2 decimals, no icons. Works as a list on phone and desktop.
 * Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { calculatePayroll } from '../../../utils/payroll';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import * as XLSX from 'xlsx';

const baht = (n) => `฿${Number(n || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hrs = (n) => (n > 0 ? Number(n).toFixed(1) : '-');
const awayFmt = (m) => `${Math.floor(m / 60) > 0 ? `${Math.floor(m / 60)} ชม. ` : ''}${m % 60} น.`;
const WAGE_TH = { monthly: 'รายเดือน', daily: 'รายกะ', hourly: 'รายชั่วโมง' };
const ADJ_TH = { deduction: 'หักเงิน', advance: 'เบิกล่วงหน้า', bonus: 'โบนัส' };

// Day status code from utils/payroll.js → Thai label + tone
const statusInfo = (status) => {
    const s = String(status || '');
    const late = s.match(/^LATE \(\+(\d+)M\)/);
    if (late) return { label: `สาย ${late[1]} น.`, tone: 'warn' };
    const map = {
        'NORMAL': ['ปกติ', 'ok'],
        'IN PROGRESS': ['กำลังทำงาน', 'mute'],
        'MISSED CHECK-OUT': ['ลืมลงเวลาออก · จ่ายถึงเลิกกะ', 'warn'],
        'MISSED CHECK-IN': ['ลืมลงเวลาเข้า · ไม่จ่าย', 'warn'],
        'ABSENT': ['ขาดงาน', 'warn'],
        'SCHEDULED': ['ยังไม่ถึงวัน', 'mute'],
        'PENDING': ['วันนี้', 'mute'],
        'EXEMPT': ['ยกเว้น', 'mute'],
        'OFF': ['หยุด', 'mute'],
        'OFF-DAY WORK': ['มาทำวันหยุด', 'info'],
        'MISSED CHECK-OUT (OFF-DAY)': ['วันหยุด · ลืมลงเวลาออก', 'warn'],
        'MISSED CHECK-IN (OFF-DAY)': ['วันหยุด · ลืมลงเวลาเข้า', 'warn'],
        'UNSCHEDULED WORK': ['มาโดยไม่มีกะ', 'info'],
        'MISSED CHECK-OUT (UNSCHEDULED)': ['ไม่มีกะ · ลืมลงเวลาออก', 'warn'],
        'MISSED CHECK-IN (UNSCHEDULED)': ['ไม่มีกะ · ลืมลงเวลาเข้า', 'warn'],
    };
    const [label, tone] = map[s] || [s, 'mute'];
    return { label, tone };
};
const toneCls = {
    ok: 'border-rule text-subtle',
    warn: 'bg-plum text-cream border-plum',
    info: 'border-plum text-plum',
    mute: 'border-rule text-neutral',
};
const isException = (d) => ['warn', 'info'].includes(statusInfo(d.status).tone);

export default function PayrollDashboard() {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedEmpId, setExpandedEmpId] = useState(null);
    const [dailyFilter, setDailyFilter] = useState('ALL'); // 'ALL' | 'EXCEPTIONS' | 'WORK' | 'OFF'
    const [searchQuery, setSearchQuery] = useState('');
    const [wageFilter, setWageFilter] = useState('ALL'); // 'ALL' | 'monthly' | 'daily' | 'hourly'
    const [copiedBankId, setCopiedBankId] = useState(null);
    const [toast, setToast] = useState(null);

    const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
    const [adjustmentForm, setAdjustmentForm] = useState({ empId: '', amount: '', isPercent: false, reason: '', type: 'deduction' });
    const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const toggleExpand = (empId) => {
        setExpandedEmpId(expandedEmpId === empId ? null : empId);
        setDailyFilter('ALL');
    };

    useEffect(() => {
        fetchData();
    }, [selectedMonth]);

    async function fetchData() {
        setLoading(true);
        const [year, month] = selectedMonth.split('-');
        const startDate = startOfMonth(new Date(year, month - 1));
        const endDate = endOfMonth(startDate);
        const startStr = format(startDate, 'yyyy-MM-dd');
        const endStr = format(endDate, 'yyyy-MM-dd');

        const [empRes, shiftRes, transRes, logRes, schedRes, deductRes, configRes] = await Promise.all([
            supabase.from('employees').select('*').order('id'),
            supabase.from('shifts').select('*').order('start_time'),
            supabase.from('roster_transactions').select('*').gte('date', startStr).lte('date', endStr),
            // From the day before: a night shift on the last day of the previous month ends after midnight
            supabase.from('attendance_logs').select('*').gte('timestamp', addDays(startDate, -1).toISOString()).lte('timestamp', addDays(endDate, 2).toISOString()).order('timestamp'),
            supabase.from('employee_schedules').select('*'),
            supabase.from('payroll_deductions').select('*').eq('month', selectedMonth),
            supabase.from('payroll_config').select('*')
        ]);

        const payrollConfig = { hourly_rate: 50, ot_rate: 50 };
        configRes.data?.forEach(c => { payrollConfig[c.key] = Number(c.value); });

        if (empRes.data && transRes.data && logRes.data) {
            setPayrollData(calculatePayroll(empRes.data, logRes.data, transRes.data, shiftRes.data || [], payrollConfig, deductRes.data || [], selectedMonth, schedRes.data || []));
        }
        setLoading(false);
    }

    const shiftMonth = (delta) => {
        const [year, month] = selectedMonth.split('-').map(Number);
        setSelectedMonth(format(new Date(year, month - 1 + delta), 'yyyy-MM'));
    };

    const summary = useMemo(() => {
        const sum = (f) => payrollData.reduce((s, item) => s + (f(item) || 0), 0);
        return {
            totalNetSalary: sum(i => i.netSalary),
            totalBaseSalary: sum(i => i.totalSalary),
            totalOTPay: sum(i => i.totalOTPay),
            totalAllowances: sum(i => i.totalAllowances),
            totalDeductions: sum(i => i.totalDeduct),
            totalMissedPunches: sum(i => i.incompleteCount),
            totalOffDayWorks: sum(i => i.offDayWorkCount),
            totalLate: sum(i => i.lateCount),
            totalAbsent: sum(i => i.absentCount),
        };
    }, [payrollData]);

    const filteredPayrollData = useMemo(() => payrollData.filter(item => {
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            const hay = [item.emp.name, item.emp.nickname, item.emp.position, item.emp.bank_account].map(v => (v || '').toLowerCase());
            if (!hay.some(v => v.includes(q))) return false;
        }
        return wageFilter === 'ALL' || item.wageType === wageFilter;
    }), [payrollData, searchQuery, wageFilter]);

    const handleSaveAdjustment = async (e) => {
        e.preventDefault();
        if (!adjustmentForm.empId || !adjustmentForm.amount) {
            showToast('เลือกพนักงานและใส่จำนวนเงินก่อน', 'error');
            return;
        }
        setIsSavingAdjustment(true);
        const type = adjustmentForm.type || 'deduction';
        const reason = adjustmentForm.reason.trim() || ADJ_TH[type];
        const row = {
            employee_id: adjustmentForm.empId,
            month: selectedMonth,
            amount: Number(adjustmentForm.amount),
            is_percentage: type === 'deduction' && !!adjustmentForm.isPercent,
            reason,
        };
        try {
            let { error } = await supabase.from('payroll_deductions').insert({ ...row, type });
            // Column `type` not added yet (migration 20261125_payroll_deductions_type.sql): keep the type in the reason
            if (error && (error.code === '42703' || error.code === 'PGRST204' || /type/.test(error.message || ''))) {
                const prefix = type === 'bonus' ? '[โบนัส] ' : type === 'advance' ? '[เบิกล่วงหน้า] ' : '';
                ({ error } = await supabase.from('payroll_deductions').insert({ ...row, reason: prefix + reason }));
            }
            if (error) throw error;
            showToast(`บันทึก${ADJ_TH[type]}แล้ว`);
            setShowAdjustmentModal(false);
            setAdjustmentForm({ empId: '', amount: '', isPercent: false, reason: '', type: 'deduction' });
            fetchData();
        } catch (err) {
            showToast('บันทึกไม่สำเร็จ: ' + (err.message || err), 'error');
        } finally {
            setIsSavingAdjustment(false);
        }
    };

    const handleDeleteDeduction = async (adj) => {
        if (!confirm(`ลบรายการ "${adj.reason || ADJ_TH[adj.type]}" ${baht(adj.amount)} ?`)) return;
        const { error } = await supabase.from('payroll_deductions').delete().eq('id', adj.id);
        if (error) showToast('ลบไม่สำเร็จ: ' + error.message, 'error');
        else { showToast('ลบรายการแล้ว'); fetchData(); }
    };

    const handleExportExcel = () => {
        if (!filteredPayrollData.length) { showToast('ไม่มีข้อมูลให้ส่งออก', 'error'); return; }
        const masterSummaryRows = filteredPayrollData.map(item => ({
            "รหัสพนักงาน": item.emp.id,
            "ชื่อ - นามสกุล": item.emp.name,
            "ชื่อเล่น": item.emp.nickname || "-",
            "ตำแหน่ง": item.emp.position || "-",
            "ประเภทค่าจ้าง": WAGE_TH[item.wageType] || item.wageType,
            "วันทำงาน (วัน)": item.workDays,
            "ชม. ปกติ": Number(item.totalRegularHours.toFixed(1)),
            "ชม. OT": Number(item.totalOTHours.toFixed(1)),
            "ค่าแรงฐาน (บาท)": item.totalSalary,
            "ค่าล่วงเวลา OT (บาท)": item.totalOTPay,
            "ค่าตำแหน่ง/เบี้ยเลี้ยง (บาท)": item.monthlyAllowance || 0,
            "เบี้ยขยัน (บาท)": item.isDiligenceEarned ? item.diligenceAllowance : 0,
            "โบนัส (บาท)": item.bonusTotal || 0,
            "สวัสดิการรวม (บาท)": item.totalAllowances || 0,
            "หักประกันสังคม (บาท)": item.ssoDeduct || 0,
            "หักภาษี ณ ที่จ่าย (บาท)": item.taxDeduct || 0,
            "หัก/เบิกล่วงหน้า (บาท)": item.customDeduct || 0,
            "ออกระหว่างวันที่หัก (นาที)": item.totalAwayMins || 0,
            "หักเวลาออกระหว่างวัน (บาท)": item.awayDeduct || 0,
            "ยอดหักรวม (บาท)": item.totalDeduct,
            "ยอดจ่ายสุทธิ (บาท)": item.netSalary,
            "ธนาคาร": item.emp.bank_name || "-",
            "เลขบัญชี": item.emp.bank_account || "-",
            "มาสาย (ครั้ง)": item.lateCount || 0,
            "ขาดงาน (ครั้ง)": item.absentCount || 0,
            "ลืมลงเวลา (ครั้ง)": item.incompleteCount || 0,
            "ทำวันหยุด (วัน)": item.offDayWorkCount || 0
        }));
        const detailedDailyRows = [];
        filteredPayrollData.forEach(item => item.dailyDetails.forEach(day => detailedDailyRows.push({
            "วันที่": day.date,
            "พนักงาน": item.emp.name,
            "ชื่อเล่น": item.emp.nickname || "-",
            "กะงาน": day.shift,
            "เวลาตามตาราง": day.scheduled_in !== '-' ? `${day.scheduled_in} - ${day.scheduled_out}` : '-',
            "เวลาเข้าจริง": day.in,
            "เวลาออกจริง": day.out,
            "ออกระหว่างวันที่หัก (นาที)": day.away_mins || 0,
            "ชม. ปกติ": day.regular_hours > 0 ? Number(day.regular_hours.toFixed(1)) : 0,
            "ชม. OT": day.ot_hours > 0 ? Number(day.ot_hours.toFixed(1)) : 0,
            "ค่าแรงประจำวัน (บาท)": day.wage || 0,
            "ค่า OT (บาท)": day.ot || 0,
            "รวมค่าจ้างวันนั้น (บาท)": (day.wage || 0) + (day.ot || 0),
            "สถานะ": statusInfo(day.status).label
        })));
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(masterSummaryRows), "สรุปเงินเดือน");
        XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(detailedDailyRows), "รายวัน");
        XLSX.writeFile(wb, `InTheHaus_Payroll_${selectedMonth}.xlsx`);
    };

    const handleCopyBankInfo = (emp, netSalary) => {
        navigator.clipboard.writeText(`${emp.bank_name || 'BANK'} ${emp.bank_account || ''} | ${emp.nickname || emp.name} | ${baht(netSalary)}`);
        setCopiedBankId(emp.id);
        setTimeout(() => setCopiedBankId(null), 2000);
    };

    const filterDailyList = (list) => {
        if (dailyFilter === 'EXCEPTIONS') return list.filter(isException);
        if (dailyFilter === 'WORK') return list.filter(d => (d.wage + d.ot) > 0 || d.in !== '-');
        if (dailyFilter === 'OFF') return list.filter(d => d.shift === 'OFF');
        return list;
    };

    const [y, m] = selectedMonth.split('-').map(Number);
    const monthLabel = `${format(new Date(y, m - 1), 'LLLL', { locale: th })} ${y + 543}`;
    const flagsOf = (item) => [
        item.incompleteCount > 0 && `ลืมลงเวลา ${item.incompleteCount}`,
        item.absentCount > 0 && `ขาด ${item.absentCount}`,
        item.lateCount > 0 && `สาย ${item.lateCount}`,
        item.offDayWorkCount > 0 && `ทำวันหยุด ${item.offDayWorkCount}`,
    ].filter(Boolean);

    const input = 'w-full min-h-12 px-4 bg-cream border border-charcoal text-base text-charcoal placeholder:text-neutral outline-none focus-visible:border-plum';

    return (
        <div className="brand-v2 min-h-screen">
            {toast && (
                <div role="status" className={`fixed top-4 right-4 z-[60] max-w-sm flex items-start gap-3 px-4 py-3 border text-base ${toast.type === 'error' ? 'bg-error text-cream border-error' : 'bg-charcoal text-cream border-charcoal'}`}>
                    <span className="flex-1">{toast.message}</span>
                    <button type="button" onClick={() => setToast(null)} className="text-sm font-semibold underline underline-offset-4 shrink-0">ปิด</button>
                </div>
            )}

            <header className="w-full bg-plum text-cream border-b border-plum-3">
                <div className="max-w-6xl mx-auto px-4 sm:px-6 flex items-stretch">
                    <a href="/admin" className="min-h-14 pr-4 flex items-center text-base text-on-plum-2 hover:text-cream transition-colors duration-150 border-r border-plum-3">← แดชบอร์ด</a>
                    <div className="flex-1 px-4 py-3 min-w-0">
                        <h1 className="font-head text-2xl">เงินเดือน</h1>
                        <p className="text-sm text-on-plum-2">คิดจากตารางงานและเวลาเข้า-ออกจริง</p>
                    </div>
                    <div className="hidden sm:flex items-center pl-4 border-l border-plum-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-inbaan-wordmark-cream-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto" />
                    </div>
                </div>
            </header>

            <main className="max-w-6xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">
                {/* Month */}
                <section className="border border-charcoal bg-cream grid grid-cols-[auto_1fr_auto] items-stretch">
                    <button type="button" onClick={() => shiftMonth(-1)} className="min-h-14 px-4 text-base font-semibold text-charcoal hover:bg-paper-2 border-r border-rule transition-colors duration-150">← <span className="hidden sm:inline">เดือนก่อน</span></button>
                    <h2 className="self-center text-center text-xl font-semibold text-charcoal px-2">{monthLabel}</h2>
                    <button type="button" onClick={() => shiftMonth(1)} className="min-h-14 px-4 text-base font-semibold text-charcoal hover:bg-paper-2 border-l border-rule transition-colors duration-150"><span className="hidden sm:inline">เดือนถัดไป</span> →</button>
                </section>

                {/* Summary */}
                <section className="grid grid-cols-2 md:grid-cols-4 gap-px bg-rule border border-rule [&>div]:bg-cream">
                    <div className="px-4 py-3 col-span-2 md:col-span-1">
                        <p className="text-sm text-neutral">ยอดโอนรวม</p>
                        <p className="font-num text-3xl text-charcoal">{loading ? '…' : baht(summary.totalNetSalary)}</p>
                    </div>
                    <div className="px-4 py-3">
                        <p className="text-sm text-neutral">ค่าแรง + OT</p>
                        <p className="font-num text-xl text-charcoal">{baht(summary.totalBaseSalary + summary.totalOTPay)}</p>
                    </div>
                    <div className="px-4 py-3">
                        <p className="text-sm text-neutral">หักรวม</p>
                        <p className="font-num text-xl text-charcoal">{summary.totalDeductions > 0 ? `−${baht(summary.totalDeductions)}` : baht(0)}</p>
                    </div>
                    <div className="px-4 py-3 col-span-2 md:col-span-1">
                        <p className="text-sm text-neutral">ต้องตรวจ</p>
                        <p className="text-base text-charcoal">
                            ลืมลงเวลา <span className={`font-num ${summary.totalMissedPunches ? 'text-plum font-semibold' : ''}`}>{summary.totalMissedPunches}</span>
                            {' · '}ขาด <span className={`font-num ${summary.totalAbsent ? 'text-plum font-semibold' : ''}`}>{summary.totalAbsent}</span>
                            {' · '}สาย <span className="font-num">{summary.totalLate}</span>
                        </p>
                    </div>
                </section>

                {/* Actions */}
                <section className="flex flex-col lg:flex-row gap-2">
                    <div className="flex-1 grid grid-cols-3 gap-px bg-rule border border-rule">
                        <button type="button" onClick={() => setShowAdjustmentModal(true)} className="min-h-12 px-3 bg-cream hover:bg-paper-2 text-base font-semibold text-charcoal transition-colors duration-150">เพิ่ม/หักเงิน</button>
                        <button type="button" onClick={handleExportExcel} className="min-h-12 px-3 bg-cream hover:bg-paper-2 text-base font-semibold text-charcoal transition-colors duration-150">Excel</button>
                        <a href={`/admin/payroll/report?month=${selectedMonth}&type=master`} target="_blank" className="min-h-12 px-3 bg-cream hover:bg-paper-2 text-base font-semibold text-charcoal flex items-center justify-center transition-colors duration-150">สรุปทั้งร้าน</a>
                    </div>
                    <a href={`/admin/payroll/report?month=${selectedMonth}&type=individual`} target="_blank" className="min-h-12 px-6 bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold flex items-center justify-center transition-colors duration-150 lg:min-w-[200px]">
                        พิมพ์สลิปทั้งหมด
                    </a>
                </section>

                {/* Filters */}
                <section className="flex flex-col md:flex-row md:items-end justify-between gap-3">
                    <div>
                        <p className="text-sm font-semibold text-neutral mb-1">ประเภทค่าจ้าง</p>
                        <div className="grid grid-cols-4 gap-px bg-rule border border-rule">
                            {[['ALL', 'ทั้งหมด'], ['monthly', 'รายเดือน'], ['daily', 'รายกะ'], ['hourly', 'รายชม.']].map(([id, label]) => (
                                <button key={id} type="button" onClick={() => setWageFilter(id)} aria-pressed={wageFilter === id}
                                    className={`min-h-12 px-3 text-base transition-colors duration-150 ${wageFilter === id ? 'bg-charcoal text-cream font-semibold' : 'bg-cream text-charcoal hover:bg-paper-2'}`}>
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className="md:w-72">
                        <label htmlFor="payroll-search" className="block text-sm font-semibold text-neutral mb-1">ค้นหา</label>
                        <input id="payroll-search" type="search" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="ชื่อ ตำแหน่ง หรือเลขบัญชี" className={input} />
                    </div>
                </section>

                {/* Staff list */}
                <section className="border border-charcoal bg-cream">
                    {loading ? (
                        <p className="p-12 text-center text-base text-neutral">กำลังคำนวณเงินเดือน…</p>
                    ) : filteredPayrollData.length === 0 ? (
                        <p className="p-12 text-center text-base text-neutral">ไม่พบพนักงานตามที่กรอง</p>
                    ) : (
                        <ul className="divide-y divide-rule">
                            {filteredPayrollData.map(item => {
                                const open = expandedEmpId === item.emp.id;
                                const flags = flagsOf(item);
                                return (
                                    <li key={item.emp.id}>
                                        <button type="button" onClick={() => toggleExpand(item.emp.id)} aria-expanded={open}
                                            className={`w-full text-left px-4 py-3 grid grid-cols-[1fr_auto] md:grid-cols-[minmax(0,2fr)_minmax(0,1.4fr)_auto] gap-x-4 gap-y-1 items-center transition-colors duration-150 ${open ? 'bg-paper-2' : 'hover:bg-paper-2'}`}>
                                            <span className="min-w-0">
                                                <span className="block text-base font-semibold text-charcoal truncate">{item.emp.nickname || item.emp.name}</span>
                                                <span className="block text-sm text-neutral truncate">{item.emp.position || '-'} · {WAGE_TH[item.wageType] || item.wageType}</span>
                                            </span>
                                            <span className="row-start-2 col-span-2 md:row-start-auto md:col-span-1 text-sm text-subtle">
                                                <span className="font-num">{item.workDays}</span> วัน · <span className="font-num">{item.totalRegularHours.toFixed(1)}</span> ชม.
                                                {item.totalOTHours > 0 && <> · OT <span className="font-num">{item.totalOTHours.toFixed(1)}</span> ชม.</>}
                                                {flags.length > 0 && <span className="block text-plum font-semibold">{flags.join(' · ')}</span>}
                                            </span>
                                            <span className="text-right">
                                                <span className="block font-num text-xl text-charcoal">{baht(item.netSalary)}</span>
                                                <span className="block text-sm text-plum">{open ? 'ซ่อน' : 'ดูรายละเอียด'}</span>
                                            </span>
                                        </button>

                                        {open && (
                                            <div className="px-4 pb-4 bg-paper-2 flex flex-col gap-4">
                                                {/* Breakdown */}
                                                <div className="grid md:grid-cols-2 gap-4">
                                                    <dl className="border border-rule bg-cream text-base">
                                                        {[
                                                            ['ค่าแรง', baht(item.totalSalary)],
                                                            [`OT (${item.totalOTHours.toFixed(1)} ชม.)`, baht(item.totalOTPay)],
                                                            item.monthlyAllowance > 0 && ['ค่าตำแหน่ง / เบี้ยเลี้ยง', `+${baht(item.monthlyAllowance)}`],
                                                            item.diligenceAllowance > 0 && ['เบี้ยขยัน', item.isDiligenceEarned ? `+${baht(item.diligenceAllowance)}` : 'ไม่ได้ (มีสาย/ขาด/ลืมลงเวลา)'],
                                                            item.bonusTotal > 0 && ['โบนัส', `+${baht(item.bonusTotal)}`],
                                                            item.ssoDeduct > 0 && ['ประกันสังคม', `−${baht(item.ssoDeduct)}`],
                                                            item.taxDeduct > 0 && ['ภาษี ณ ที่จ่าย', `−${baht(item.taxDeduct)}`],
                                                            item.totalAwayMins > 0 && [`ออกระหว่างวัน ${awayFmt(item.totalAwayMins)}`, item.awayDeduct > 0 ? `−${baht(item.awayDeduct)}` : 'หักจากชั่วโมงแล้ว'],
                                                        ].filter(Boolean).map(([k, v]) => (
                                                            <div key={k} className="px-4 py-2 border-b border-rule flex justify-between gap-3">
                                                                <dt className="text-subtle">{k}</dt><dd className="font-num text-charcoal text-right">{v}</dd>
                                                            </div>
                                                        ))}
                                                        {item.adjustments?.filter(a => a.type !== 'bonus').map(a => (
                                                            <div key={a.id} className="px-4 py-2 border-b border-rule flex justify-between items-center gap-3">
                                                                <dt className="text-subtle min-w-0 truncate">{ADJ_TH[a.type]} · {(a.reason || '').replace(/^\[(โบนัส|เบิกล่วงหน้า)\]\s*/, '')}</dt>
                                                                <dd className="flex items-center gap-2 shrink-0"><span className="font-num text-charcoal">−{baht(a.amount)}</span>
                                                                    <button type="button" onClick={() => handleDeleteDeduction(a)} className="min-h-10 px-2 text-sm text-error underline underline-offset-4">ลบ</button></dd>
                                                            </div>
                                                        ))}
                                                        {item.adjustments?.filter(a => a.type === 'bonus').map(a => (
                                                            <div key={a.id} className="px-4 py-2 border-b border-rule flex justify-between items-center gap-3">
                                                                <dt className="text-subtle min-w-0 truncate">โบนัส · {(a.reason || '').replace(/^\[โบนัส\]\s*/, '')}</dt>
                                                                <dd className="flex items-center gap-2 shrink-0"><span className="font-num text-charcoal">+{baht(a.amount)}</span>
                                                                    <button type="button" onClick={() => handleDeleteDeduction(a)} className="min-h-10 px-2 text-sm text-error underline underline-offset-4">ลบ</button></dd>
                                                            </div>
                                                        ))}
                                                        <div className="px-4 py-3 bg-charcoal text-cream flex justify-between gap-3">
                                                            <dt className="font-semibold">ยอดโอนสุทธิ</dt><dd className="font-num text-2xl">{baht(item.netSalary)}</dd>
                                                        </div>
                                                    </dl>
                                                    <div className="flex flex-col gap-2">
                                                        {item.emp.bank_account ? (
                                                            <button type="button" onClick={() => handleCopyBankInfo(item.emp, item.netSalary)} className="min-h-12 px-4 border border-charcoal bg-cream hover:bg-paper-2 text-left text-base text-charcoal transition-colors duration-150">
                                                                {copiedBankId === item.emp.id ? 'คัดลอกข้อมูลโอนแล้ว' : <>คัดลอกข้อมูลโอน · {item.emp.bank_name || ''} <span className="font-num">{item.emp.bank_account}</span></>}
                                                            </button>
                                                        ) : <p className="border border-rule bg-cream px-4 py-3 text-base text-neutral">ยังไม่มีเลขบัญชี (เพิ่มได้ในรายชื่อพนักงาน)</p>}
                                                        <a href={`/admin/payroll/report?month=${selectedMonth}&type=individual&emp_id=${item.emp.id}`} target="_blank" className="min-h-12 px-4 border border-charcoal bg-cream hover:bg-paper-2 text-base text-charcoal flex items-center transition-colors duration-150">พิมพ์สลิปคนนี้</a>
                                                        <button type="button" onClick={() => { setAdjustmentForm(f => ({ ...f, empId: String(item.emp.id) })); setShowAdjustmentModal(true); }} className="min-h-12 px-4 border border-charcoal bg-cream hover:bg-paper-2 text-left text-base text-charcoal transition-colors duration-150">เพิ่ม/หักเงินคนนี้</button>
                                                    </div>
                                                </div>

                                                {/* Daily */}
                                                <div className="border border-rule bg-cream">
                                                    <div className="px-4 py-3 border-b border-rule flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                        <h3 className="text-base font-semibold text-charcoal">รายวัน</h3>
                                                        <div className="grid grid-cols-4 gap-px bg-rule border border-rule">
                                                            {[['ALL', 'ทั้งหมด'], ['EXCEPTIONS', 'ต้องตรวจ'], ['WORK', 'วันทำงาน'], ['OFF', 'วันหยุด']].map(([id, label]) => (
                                                                <button key={id} type="button" onClick={() => setDailyFilter(id)} aria-pressed={dailyFilter === id}
                                                                    className={`min-h-10 px-3 text-sm transition-colors duration-150 ${dailyFilter === id ? 'bg-charcoal text-cream font-semibold' : 'bg-cream text-charcoal hover:bg-paper-2'}`}>{label}</button>
                                                            ))}
                                                        </div>
                                                    </div>
                                                    <div className="overflow-x-auto">
                                                        <table className="w-full text-left min-w-[720px]">
                                                            <thead className="border-b border-rule text-sm text-neutral">
                                                                <tr>
                                                                    <th className="px-4 py-2 font-semibold">วันที่</th>
                                                                    <th className="px-3 py-2 font-semibold">กะ</th>
                                                                    <th className="px-3 py-2 font-semibold">เข้า–ออกจริง</th>
                                                                    <th className="px-3 py-2 font-semibold">สถานะ</th>
                                                                    <th className="px-3 py-2 font-semibold text-right">ชม.</th>
                                                                    <th className="px-3 py-2 font-semibold text-right">OT</th>
                                                                    <th className="px-4 py-2 font-semibold text-right">รวม</th>
                                                                </tr>
                                                            </thead>
                                                            <tbody className="divide-y divide-rule text-sm">
                                                                {filterDailyList(item.dailyDetails).map((day, idx) => {
                                                                    const st = statusInfo(day.status);
                                                                    const total = (day.wage || 0) + (day.ot || 0);
                                                                    return (
                                                                        <tr key={idx}>
                                                                            <td className="px-4 py-2 whitespace-nowrap">{format(new Date(`${day.date}T12:00:00`), 'EEE d MMM', { locale: th })}</td>
                                                                            <td className="px-3 py-2 text-subtle">{day.shift === 'OFF' ? 'หยุด' : day.shift === 'UNSCHEDULED' ? 'ไม่มีกะ' : (day.shift || '').replace(/\s+\)/g, ')').replace(/(\d{2}:\d{2})-(\d{2}:\d{2})/g, '$1–$2').replace(/[\p{Extended_Pictographic}️]/gu, '').replace(/\s+\)/g, ')').trim()}</td>
                                                                            <td className="px-3 py-2 font-num whitespace-nowrap">{day.in === '-' && day.out === '-' ? '-' : `${day.in === '-' ? '?' : day.in}–${day.out === '-' ? '?' : day.out}`}
                                                                                {day.away_mins > 0 && <span className="block font-thai text-plum">ออก {awayFmt(day.away_mins)}</span>}
                                                                            </td>
                                                                            <td className="px-3 py-2"><span className={`inline-block px-1.5 py-0.5 border text-xs ${toneCls[st.tone]}`}>{st.label}</span></td>
                                                                            <td className="px-3 py-2 font-num text-right">{hrs(day.regular_hours)}</td>
                                                                            <td className="px-3 py-2 font-num text-right">{hrs(day.ot_hours)}</td>
                                                                            <td className="px-4 py-2 font-num text-right">{total > 0 ? baht(total) : '-'}</td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </main>

            {/* Add adjustment */}
            {showAdjustmentModal && (
                <div className="brand-v2 !bg-charcoal/50 fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="adj-title">
                    <form onSubmit={handleSaveAdjustment} className="bg-cream border border-charcoal w-full max-w-md">
                        <div className="bg-plum text-cream flex items-stretch">
                            <div className="flex-1 px-4 py-3">
                                <h3 id="adj-title" className="font-head text-2xl">เพิ่ม/หักเงิน</h3>
                                <p className="text-sm text-on-plum-2">{monthLabel}</p>
                            </div>
                            <button type="button" onClick={() => setShowAdjustmentModal(false)} className="min-w-16 px-4 border-l border-plum-3 text-base font-semibold hover:bg-plum-2 transition-colors duration-150">ปิด</button>
                        </div>
                        <div className="p-4 flex flex-col gap-3">
                            <div className="grid grid-cols-3 gap-px bg-rule border border-charcoal" role="radiogroup" aria-label="ประเภท">
                                {Object.entries(ADJ_TH).map(([id, label]) => (
                                    <button key={id} type="button" role="radio" aria-checked={adjustmentForm.type === id} onClick={() => setAdjustmentForm(f => ({ ...f, type: id, isPercent: id === 'deduction' ? f.isPercent : false }))}
                                        className={`min-h-12 text-base transition-colors duration-150 ${adjustmentForm.type === id ? 'bg-charcoal text-cream font-semibold' : 'bg-cream text-charcoal hover:bg-paper-2'}`}>{label}</button>
                                ))}
                            </div>
                            <label className="text-sm font-semibold text-neutral">พนักงาน
                                <select required value={adjustmentForm.empId} onChange={e => setAdjustmentForm(f => ({ ...f, empId: e.target.value }))} className={`${input} mt-1`}>
                                    <option value="">เลือกพนักงาน</option>
                                    {payrollData.map(d => <option key={d.emp.id} value={d.emp.id}>{d.emp.nickname || d.emp.name} · {d.emp.position || '-'}</option>)}
                                </select>
                            </label>
                            <label className="text-sm font-semibold text-neutral">จำนวน{adjustmentForm.isPercent ? ' (%)' : ' (บาท)'}
                                <input required type="number" min="0" step="0.01" inputMode="decimal" value={adjustmentForm.amount} onChange={e => setAdjustmentForm(f => ({ ...f, amount: e.target.value }))} placeholder="เช่น 500" className={`${input} mt-1 font-num`} />
                            </label>
                            {adjustmentForm.type === 'deduction' && (
                                <label className="flex items-center gap-3 min-h-12 text-base text-charcoal cursor-pointer">
                                    <input type="checkbox" checked={adjustmentForm.isPercent} onChange={e => setAdjustmentForm(f => ({ ...f, isPercent: e.target.checked }))} className="w-5 h-5 accent-charcoal" />
                                    คิดเป็น % ของรายได้รวม
                                </label>
                            )}
                            <label className="text-sm font-semibold text-neutral">เหตุผล
                                <input type="text" value={adjustmentForm.reason} onChange={e => setAdjustmentForm(f => ({ ...f, reason: e.target.value }))} placeholder="เช่น ของเสียหาย, เบิกกลางเดือน, โบนัสยอดขาย" className={`${input} mt-1`} />
                            </label>
                        </div>
                        <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                            <button type="button" onClick={() => setShowAdjustmentModal(false)} className="min-h-12 border border-charcoal text-base text-charcoal hover:bg-paper-2 transition-colors duration-150">ยกเลิก</button>
                            <button type="submit" disabled={isSavingAdjustment} className="min-h-12 bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold transition-colors duration-150 disabled:opacity-50">{isSavingAdjustment ? 'กำลังบันทึก…' : 'บันทึก'}</button>
                        </div>
                    </form>
                </div>
            )}
        </div>
    );
}
