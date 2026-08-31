"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { calculatePayroll } from '../../../utils/payroll';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { 
    FileText, Printer, ChevronLeft, ChevronRight, ChevronDown, ChevronUp, 
    Search, Filter, Plus, Download, Copy, Check, AlertTriangle, Sparkles, 
    Shield, DollarSign, Users, CreditCard, Building2, Trash2, X, Calculator, HelpCircle
} from 'lucide-react';
import * as XLSX from 'xlsx';

export default function PayrollDashboard() {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedEmpId, setExpandedEmpId] = useState(null);
    const [dailyFilter, setDailyFilter] = useState('ALL'); // 'ALL' | 'EXCEPTIONS' | 'WORK' | 'OFF'
    const [searchQuery, setSearchQuery] = useState('');
    const [wageFilter, setWageFilter] = useState('ALL'); // 'ALL' | 'monthly' | 'daily' | 'hourly'
    const [copiedBankId, setCopiedBankId] = useState(null);

    // Modal state for adding custom deduction/adjustment
    const [showAdjustmentModal, setShowAdjustmentModal] = useState(false);
    const [adjustmentForm, setAdjustmentForm] = useState({
        empId: '',
        amount: '',
        isPercent: false,
        reason: '',
        type: 'deduction' // 'deduction' | 'bonus' | 'advance'
    });
    const [isSavingAdjustment, setIsSavingAdjustment] = useState(false);

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
            supabase.from('attendance_logs').select('*').gte('timestamp', startDate.toISOString()).lte('timestamp', addDays(endDate, 2).toISOString()),
            supabase.from('employee_schedules').select('*'),
            supabase.from('payroll_deductions').select('*').eq('month', selectedMonth),
            supabase.from('payroll_config').select('*')
        ]);

        const payrollConfig = { hourly_rate: 50, ot_rate: 75 };
        configRes.data?.forEach(c => {
            payrollConfig[c.key] = Number(c.value);
        });

        if (empRes.data && transRes.data && logRes.data) {
            const data = calculatePayroll(
                empRes.data, 
                logRes.data, 
                transRes.data, 
                shiftRes.data || [], 
                payrollConfig,
                deductRes.data || [], 
                selectedMonth,
                schedRes.data || []
            );
            setPayrollData(data);
        }
        setLoading(false);
    }

    const prevMonth = () => {
        const [year, month] = selectedMonth.split('-');
        const date = new Date(year, month - 2);
        setSelectedMonth(format(date, 'yyyy-MM'));
    };

    const nextMonth = () => {
        const [year, month] = selectedMonth.split('-');
        const date = new Date(year, month);
        setSelectedMonth(format(date, 'yyyy-MM'));
    };

    // Summary calculations
    const summary = useMemo(() => {
        const activeWorking = payrollData.filter(d => d.workDays > 0 || d.totalSalary > 0);
        const totalNetSalary = payrollData.reduce((sum, item) => sum + item.netSalary, 0);
        const totalBaseSalary = payrollData.reduce((sum, item) => sum + item.totalSalary, 0);
        const totalOTPay = payrollData.reduce((sum, item) => sum + item.totalOTPay, 0);
        const totalAllowances = payrollData.reduce((sum, item) => sum + (item.totalAllowances || 0), 0);
        const totalDeductions = payrollData.reduce((sum, item) => sum + (item.totalDeduct || 0), 0);
        const totalSsoDeduct = payrollData.reduce((sum, item) => sum + (item.ssoDeduct || 0), 0);
        const totalTaxDeduct = payrollData.reduce((sum, item) => sum + (item.taxDeduct || 0), 0);

        const totalMissedPunches = payrollData.reduce((sum, item) => sum + (item.incompleteCount || 0), 0);
        const totalOffDayWorks = payrollData.reduce((sum, item) => sum + (item.offDayWorkCount || 0), 0);
        const totalLate = payrollData.reduce((sum, item) => sum + (item.lateCount || 0), 0);
        const totalAbsent = payrollData.reduce((sum, item) => sum + (item.absentCount || 0), 0);

        return {
            workingStaffCount: activeWorking.length,
            totalNetSalary,
            totalBaseSalary,
            totalOTPay,
            totalAllowances,
            totalDeductions,
            totalSsoDeduct,
            totalTaxDeduct,
            totalMissedPunches,
            totalOffDayWorks,
            totalLate,
            totalAbsent
        };
    }, [payrollData]);

    // Filtered payroll data for display
    const filteredPayrollData = useMemo(() => {
        return payrollData.filter(item => {
            // Search query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const name = (item.emp.name || '').toLowerCase();
                const nickname = (item.emp.nickname || '').toLowerCase();
                const position = (item.emp.position || '').toLowerCase();
                const bank = (item.emp.bank_account || '').toLowerCase();
                if (!name.includes(q) && !nickname.includes(q) && !position.includes(q) && !bank.includes(q)) {
                    return false;
                }
            }

            // Wage type filter
            if (wageFilter !== 'ALL') {
                if (item.wageType !== wageFilter) return false;
            }

            return true;
        });
    }, [payrollData, searchQuery, wageFilter]);

    // Handle adding custom adjustment/deduction
    const handleSaveAdjustment = async (e) => {
        e.preventDefault();
        if (!adjustmentForm.empId || !adjustmentForm.amount) {
            return alert("กรุณาเลือกพนักงานและระบุจำนวนเงิน");
        }

        setIsSavingAdjustment(true);
        try {
            const { error } = await supabase.from('payroll_deductions').insert({
                employee_id: adjustmentForm.empId,
                month: selectedMonth,
                amount: Number(adjustmentForm.amount),
                is_percentage: !!adjustmentForm.isPercent,
                reason: adjustmentForm.reason || 'รายการปรับยอดเงินเดือน',
                type: adjustmentForm.type || 'deduction'
            });

            if (error) throw error;

            alert("บันทึกรายการปรับยอดสำเร็จ!");
            setShowAdjustmentModal(false);
            setAdjustmentForm({ empId: '', amount: '', isPercent: false, reason: '', type: 'deduction' });
            fetchData();
        } catch (err) {
            alert("Error: " + err.message);
        } finally {
            setIsSavingAdjustment(false);
        }
    };

    // Handle deleting a deduction
    const handleDeleteDeduction = async (deductId) => {
        if (!confirm("คุณต้องการลบรายการปรับยอดนี้หรือไม่?")) return;
        try {
            const { error } = await supabase.from('payroll_deductions').delete().eq('id', deductId);
            if (error) throw error;
            fetchData();
        } catch (err) {
            alert("Error: " + err.message);
        }
    };

    // Handle Export detailed excel
    const handleExportExcel = () => {
        if (!filteredPayrollData.length) return alert("ไม่มีข้อมูลสำหรับการ Export");

        const masterSummaryRows = filteredPayrollData.map(item => ({
            "รหัสพนักงาน": item.emp.id,
            "ชื่อ - นามสกุล": item.emp.name,
            "ชื่อเล่น": item.emp.nickname || "-",
            "ตำแหน่ง": item.emp.position || "-",
            "ประเภทค่าจ้าง": item.wageType === 'monthly' ? 'รายเดือน' : (item.wageType === 'daily' ? 'รายกะ' : 'รายชั่วโมง'),
            "วันทำงาน (วัน)": item.workDays,
            "ชม. ปกติ": Number(item.totalRegularHours.toFixed(1)),
            "ชม. OT": Number(item.totalOTHours.toFixed(1)),
            "ค่าแรงฐาน (บาท)": item.totalSalary,
            "ค่าล่วงเวลา OT (บาท)": item.totalOTPay,
            "ค่าตำแหน่ง/เบี้ยเลี้ยง (บาท)": item.monthlyAllowance || 0,
            "เบี้ยขยัน (บาท)": item.isDiligenceEarned ? item.diligenceAllowance : 0,
            "สวัสดิการรวม (บาท)": item.totalAllowances || 0,
            "หักประกันสังคม (บาท)": item.ssoDeduct || 0,
            "หักภาษี ณ ที่จ่าย (บาท)": item.taxDeduct || 0,
            "รายการหักอื่นๆ (บาท)": item.customDeduct || 0,
            "ยอดหักรวม (บาท)": item.totalDeduct,
            "ยอดจ่ายสุทธิ (Net THB)": item.netSalary,
            "ธนาคาร": item.emp.bank_name || "-",
            "เลขบัญชี": item.emp.bank_account || "-",
            "มาสาย (ครั้ง)": item.lateCount || 0,
            "ขาดงาน (ครั้ง)": item.absentCount || 0,
            "ไม่ลงเวลาออก (ครั้ง)": item.incompleteCount || 0,
            "ทำงานวันหยุด (วัน)": item.offDayWorkCount || 0
        }));

        const detailedDailyRows = [];
        filteredPayrollData.forEach(item => {
            item.dailyDetails.forEach(day => {
                detailedDailyRows.push({
                    "วันที่": day.date,
                    "พนักงาน": item.emp.name,
                    "ชื่อเล่น": item.emp.nickname || "-",
                    "กะงาน": day.shift,
                    "เวลาตามตาราง": day.scheduled_in !== '-' ? `${day.scheduled_in} - ${day.scheduled_out}` : '-',
                    "เวลาเข้าจริง": day.in,
                    "เวลาออกจริง": day.out,
                    "ชม. ปกติ": day.regular_hours > 0 ? Number(day.regular_hours.toFixed(1)) : 0,
                    "ชม. OT": day.ot_hours > 0 ? Number(day.ot_hours.toFixed(1)) : 0,
                    "ค่าแรงประจำวัน (บาท)": day.wage || 0,
                    "ค่า OT (บาท)": day.ot || 0,
                    "รวมค่าจ้างวันนั้น (บาท)": (day.wage || 0) + (day.ot || 0),
                    "สถานะการลงเวลา": day.status
                });
            });
        });

        const wb = XLSX.utils.book_new();
        const wsMaster = XLSX.utils.json_to_sheet(masterSummaryRows);
        const wsDaily = XLSX.utils.json_to_sheet(detailedDailyRows);

        XLSX.utils.book_append_sheet(wb, wsMaster, "Payroll_Master_Summary");
        XLSX.utils.book_append_sheet(wb, wsDaily, "Attendance_Daily_Breakdown");
        XLSX.writeFile(wb, `InTheHaus_Payroll_${selectedMonth}.xlsx`);
    };

    // Copy bank transfer info to clipboard
    const handleCopyBankInfo = (emp, netSalary) => {
        const text = `${emp.bank_name || 'BANK'} ${emp.bank_account || ''} | ${emp.nickname || emp.name} | ฿${netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}`;
        navigator.clipboard.writeText(text);
        setCopiedBankId(emp.id);
        setTimeout(() => setCopiedBankId(null), 2000);
    };

    const getStatusBadgeStyle = (status) => {
        const s = (status || '').toUpperCase();
        if (s.includes('OFF-DAY WORK')) return 'bg-rams-ink text-rams-panel border-rams-ink font-bold';
        if (s.includes('UNSCHEDULED WORK')) return 'bg-rams-orange/15 text-rams-orange border-rams-orange/30 font-bold';
        if (s.includes('MISSED') || s.includes('INCOMPLETE') || s.includes('ABSENT')) return 'bg-rams-red/15 text-rams-red border-rams-red/30 font-bold';
        if (s.includes('LATE')) return 'bg-rams-amber/15 text-rams-amber border-rams-amber/30 font-bold';
        if (s === 'OFF') return 'bg-rams-bg text-rams-ink-muted border-rams-rule-light';
        return 'bg-rams-green/10 text-rams-green border-rams-green/30 font-bold';
    };

    const filterDailyList = (list) => {
        if (dailyFilter === 'EXCEPTIONS') {
            return list.filter(d => {
                const s = (d.status || '').toUpperCase();
                return s.includes('MISSED') || s.includes('OFF-DAY') || s.includes('UNSCHEDULED') || s.includes('LATE') || s.includes('ABSENT') || s.includes('INCOMPLETE');
            });
        }
        if (dailyFilter === 'WORK') {
            return list.filter(d => d.shift !== 'OFF' || d.status.includes('WORK'));
        }
        if (dailyFilter === 'OFF') {
            return list.filter(d => d.shift === 'OFF' || d.status === 'OFF');
        }
        return list;
    };

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 text-rams-ink font-sans min-h-screen bg-rams-bg selection:bg-rams-ink/10">
            
            {/* Top Navigation Breadcrumb */}
            <div className="flex justify-between items-center">
                <a href="/admin" className="text-xs font-mono font-bold text-rams-ink-muted hover:text-rams-ink flex items-center gap-1.5 w-fit transition-colors uppercase tracking-wider">
                    <ChevronLeft size={14} /> กลับสู่หน้าแดชบอร์ดหลัก (Admin Portal)
                </a>
                <div className="flex items-center gap-2">
                    <a 
                        href="/admin" 
                        onClick={(e) => { e.preventDefault(); window.location.href = '/admin'; }}
                        className="text-[10px] font-mono font-bold text-rams-orange uppercase tracking-wider hover:underline"
                    >
                        ⚙️ จัดการเรทใน Staff Directory
                    </a>
                </div>
            </div>

            {/* Header Title & Report Buttons */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-rams-panel p-5 rounded-sm border border-rams-rule shadow-none">
                <div>
                    <div className="flex items-center gap-2.5">
                        <DollarSign size={20} className="text-rams-orange" />
                        <h1 className="text-lg font-mono font-bold tracking-wider text-rams-ink uppercase">
                            ระบบประมวลผลเงินเดือน (Payroll & Attendance Engine)
                        </h1>
                    </div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-rams-ink-muted mt-1.5">
                        คำนวณอัตโนมัติตามโมเดลค่าจ้าง (รายเดือน / รายกะ / ราย ชม.), บันทึกเวลาเข้า-ออกจริง, OT, เบี้ยขยัน, และประกันสังคม
                    </p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    <button
                        onClick={() => setShowAdjustmentModal(true)}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink rounded-sm border border-rams-rule-light text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                    >
                        <Plus size={13} className="text-rams-orange" />
                        <span>ปรับยอด/หักเงิน</span>
                    </button>
                    <button
                        onClick={handleExportExcel}
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink rounded-sm border border-rams-rule-light text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                    >
                        <Download size={13} />
                        <span>Excel</span>
                    </button>
                    <a 
                        href={`/admin/payroll/report?month=${selectedMonth}&type=master`} 
                        target="_blank"
                        className="flex items-center gap-1.5 px-3.5 py-2 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink rounded-sm border border-rams-rule-light text-xs font-mono font-bold uppercase tracking-wider transition-all"
                    >
                        <FileText size={13} className="text-rams-ink-muted" /> 
                        <span>Master Report</span>
                    </a>
                    <a 
                        href={`/admin/payroll/report?month=${selectedMonth}&type=individual`} 
                        target="_blank"
                        className="flex items-center gap-1.5 px-4 py-2 bg-rams-orange hover:bg-rams-orange-active text-rams-panel rounded-sm border border-rams-rule text-xs font-mono font-bold uppercase tracking-wider shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] active:shadow-none transition-all"
                    >
                        <Printer size={13} /> 
                        <span>พิมพ์สลิป (Payslips)</span>
                    </a>
                </div>
            </div>

            {/* Metrics Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3.5">
                {/* Metric 1: Net Payout */}
                <div className="bg-rams-panel p-5 rounded-sm border border-rams-rule shadow-none flex flex-col justify-between">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">
                        ยอดจ่ายเงินเดือนสุทธิรวม (Net Payout)
                    </p>
                    <h3 className="text-2xl font-mono font-black text-rams-green tracking-tight">
                        ฿{summary.totalNetSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </h3>
                    <div className="mt-2 pt-2 border-t border-rams-rule-light flex justify-between text-[10px] font-mono text-rams-ink-muted">
                        <span>ฐาน + OT: ฿{(summary.totalBaseSalary + summary.totalOTPay).toLocaleString()}</span>
                        <span>สวัสดิการ: +฿{summary.totalAllowances.toLocaleString()}</span>
                    </div>
                </div>

                {/* Metric 2: Month Selector */}
                <div className="bg-rams-panel p-4 rounded-sm border border-rams-rule-light flex flex-col justify-center items-center shadow-none">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-2">
                        รอบประจำเดือน (Payroll Period)
                    </p>
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={prevMonth} 
                            className="w-8 h-8 bg-rams-bg border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center rounded-sm transition-all cursor-pointer"
                        >
                            <ChevronLeft size={16}/>
                        </button>
                        <span className="text-sm font-mono font-bold w-32 text-center uppercase tracking-wider text-rams-ink">
                            {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: th })}
                        </span>
                        <button 
                            onClick={nextMonth} 
                            className="w-8 h-8 bg-rams-bg border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center rounded-sm transition-all cursor-pointer"
                        >
                            <ChevronRight size={16}/>
                        </button>
                    </div>
                </div>

                {/* Metric 3: Deductions Breakdown */}
                <div className="bg-rams-panel p-5 rounded-sm border border-rams-rule-light shadow-none flex flex-col justify-between">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">
                        ยอดหักรวม (Statutory & Adjustments)
                    </p>
                    <h3 className="text-2xl font-mono font-black text-rams-red tracking-tight">
                        -฿{summary.totalDeductions.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                    </h3>
                    <div className="mt-2 pt-2 border-t border-rams-rule-light flex justify-between text-[10px] font-mono text-rams-ink-muted">
                        <span>ประกันสังคม: ฿{summary.totalSsoDeduct.toLocaleString()}</span>
                        <span>ภาษี/อื่นๆ: ฿{(summary.totalTaxDeduct + (summary.totalDeductions - summary.totalSsoDeduct - summary.totalTaxDeduct)).toLocaleString()}</span>
                    </div>
                </div>

                {/* Metric 4: Audit & Exceptions */}
                <div className="bg-rams-panel p-5 rounded-sm border border-rams-rule-light shadow-none flex flex-col justify-between">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">
                        พนักงานปฏิบัติงาน & ความผิดปกติ
                    </p>
                    <div className="flex items-baseline gap-2">
                        <h3 className="text-2xl font-mono font-black text-rams-ink tracking-tight">
                            {summary.workingStaffCount} <span className="text-xs font-normal text-rams-ink-muted font-mono">คน</span>
                        </h3>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rams-rule-light flex items-center gap-1.5 flex-wrap">
                        {summary.totalMissedPunches > 0 && (
                            <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-mono font-bold bg-rams-red/10 text-rams-red border border-rams-red/30">
                                MISSED:{summary.totalMissedPunches}
                            </span>
                        )}
                        {summary.totalOffDayWorks > 0 && (
                            <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-mono font-bold bg-rams-orange/10 text-rams-orange border border-rams-orange/30">
                                OFF-DAY:{summary.totalOffDayWorks}
                            </span>
                        )}
                        {summary.totalLate > 0 && (
                            <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-mono font-bold bg-rams-amber/10 text-rams-amber border border-rams-amber/30">
                                LATE:{summary.totalLate}
                            </span>
                        )}
                        {!summary.totalMissedPunches && !summary.totalOffDayWorks && !summary.totalLate && (
                            <span className="text-[10px] font-mono text-rams-green font-bold">✓ การลงเวลาปกติ</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Filter & Search Bar */}
            <div className="bg-rams-panel p-3.5 rounded-sm border border-rams-rule-light flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-rams-ink-muted" />
                    <input 
                        type="text"
                        placeholder="ค้นหาชื่อพนักงาน, ตำแหน่ง, บัญชีธนาคาร..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-9 pr-3 py-1.5 rounded-sm border border-rams-rule-light focus:border-rams-rule outline-none bg-rams-bg text-rams-ink font-sans text-xs transition-all"
                    />
                </div>

                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase text-rams-ink-muted font-bold">โมเดลค่าจ้าง:</span>
                    <div className="flex bg-rams-bg border border-rams-rule-light rounded-sm p-0.5 text-[10px] font-mono font-bold uppercase tracking-wider">
                        {[
                            { id: 'ALL', label: 'ทั้งหมด' },
                            { id: 'monthly', label: 'รายเดือน' },
                            { id: 'daily', label: 'รายกะ' },
                            { id: 'hourly', label: 'ราย ชม.' }
                        ].map(type => (
                            <button
                                key={type.id}
                                onClick={() => setWageFilter(type.id)}
                                className={`px-2.5 py-1 rounded-xs transition-all cursor-pointer ${wageFilter === type.id ? 'bg-rams-ink text-rams-panel font-bold' : 'text-rams-ink-muted hover:text-rams-ink'}`}
                            >
                                {type.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Payroll Table */}
            <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-12 text-center font-mono text-xs text-rams-ink-muted uppercase tracking-wider animate-pulse">
                            กำลังคำนวณและประมวลผลข้อมูลเงินเดือน...
                        </div>
                    ) : filteredPayrollData.length === 0 ? (
                        <div className="p-12 text-center font-mono text-xs text-rams-ink-muted uppercase tracking-wider">
                            ไม่พบข้อมูลเงินเดือนที่ตรงกับเงื่อนไขการค้นหา
                        </div>
                    ) : (
                        <table className="w-full text-xs text-left">
                            <thead className="bg-rams-bg/60 text-rams-ink-muted border-b border-rams-rule-light font-mono text-[9px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-5 py-3.5">พนักงาน / โมเดลค่าจ้าง</th>
                                    <th className="px-4 py-3.5 text-center">วัน / ชม.</th>
                                    <th className="px-4 py-3.5 text-right">ค่าแรงฐาน</th>
                                    <th className="px-4 py-3.5 text-right">ค่า OT</th>
                                    <th className="px-4 py-3.5 text-right text-rams-green">สวัสดิการ</th>
                                    <th className="px-4 py-3.5 text-right text-rams-red">ยอดหัก</th>
                                    <th className="px-5 py-3.5 text-right">ยอดจ่ายสุทธิ</th>
                                    <th className="px-4 py-3.5 text-center">Audit Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rams-rule-light font-mono">
                                {filteredPayrollData.map(item => {
                                    const isExpanded = expandedEmpId === item.emp.id;
                                    const wageType = item.wageType;

                                    return (
                                        <React.Fragment key={item.emp.id}>
                                            <tr 
                                                className={`hover:bg-rams-bg/40 cursor-pointer transition-colors text-rams-ink ${isExpanded ? 'bg-rams-bg/30 font-semibold' : ''}`}
                                                onClick={() => toggleExpand(item.emp.id)}
                                            >
                                                {/* Employee Info */}
                                                <td className="px-5 py-3.5 font-sans">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-rams-ink-muted">
                                                            {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                        </span>
                                                        <div className="w-8 h-8 rounded-sm bg-rams-ink text-rams-panel flex items-center justify-center font-mono font-bold text-xs shrink-0">
                                                            {item.emp.nickname ? item.emp.nickname.charAt(0).toUpperCase() : item.emp.name.charAt(0).toUpperCase()}
                                                        </div>
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-rams-ink">{item.emp.name}</span>
                                                                {item.emp.nickname && (
                                                                    <span className="px-1.5 py-0.2 rounded-xs bg-rams-bg border border-rams-rule-light text-rams-ink font-mono text-[9px] font-bold">
                                                                        {item.emp.nickname}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="flex items-center gap-1.5 text-[10px] font-mono text-rams-ink-muted mt-0.5">
                                                                <span>{item.emp.position || "Staff"}</span>
                                                                <span>·</span>
                                                                <span className="text-rams-orange font-bold uppercase text-[9px]">
                                                                    {wageType === 'monthly' ? 'รายเดือน' : (wageType === 'daily' ? 'รายกะ' : 'ราย ชม.')}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </div>
                                                </td>

                                                {/* Days & Hours */}
                                                <td className="px-4 py-3.5 text-center">
                                                    <div className="font-bold text-rams-ink">{item.workDays} วัน</div>
                                                    <div className="text-[10px] text-rams-ink-muted">
                                                        {item.totalRegularHours.toFixed(1)}h / <span className="text-rams-orange font-bold">{item.totalOTHours.toFixed(1)}h OT</span>
                                                    </div>
                                                </td>

                                                {/* Base Wage */}
                                                <td className="px-4 py-3.5 text-right font-bold text-rams-ink">
                                                    ฿{item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                </td>

                                                {/* OT Pay */}
                                                <td className="px-4 py-3.5 text-right font-bold text-rams-orange">
                                                    {item.totalOTPay > 0 ? `฿${item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-'}
                                                </td>

                                                {/* Allowances (+Diligence) */}
                                                <td className="px-4 py-3.5 text-right font-bold text-rams-green">
                                                    {item.totalAllowances > 0 ? `+฿${item.totalAllowances.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-'}
                                                </td>

                                                {/* Deductions */}
                                                <td className="px-4 py-3.5 text-right font-bold text-rams-red">
                                                    {item.totalDeduct > 0 ? `-฿${item.totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-'}
                                                </td>

                                                {/* Net Salary */}
                                                <td className="px-5 py-3.5 text-right font-black text-rams-green text-sm">
                                                    ฿{item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                                </td>

                                                {/* Audit Badges */}
                                                <td className="px-4 py-3.5 text-center">
                                                    <div className="flex flex-wrap items-center justify-center gap-1">
                                                        {item.incompleteCount > 0 && (
                                                            <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-bold border uppercase bg-rams-red/10 text-rams-red border-rams-red/30">
                                                                MISSED:{item.incompleteCount}
                                                            </span>
                                                        )}
                                                        {item.offDayWorkCount > 0 && (
                                                            <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-bold border uppercase bg-rams-orange/10 text-rams-orange border-rams-orange/30">
                                                                OFF-DAY:{item.offDayWorkCount}
                                                            </span>
                                                        )}
                                                        {item.lateCount > 0 && (
                                                            <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-bold border uppercase bg-rams-amber/10 text-rams-amber border-rams-amber/30">
                                                                LATE:{item.lateCount}
                                                            </span>
                                                        )}
                                                        {item.absentCount > 0 && (
                                                            <span className="px-1.5 py-0.2 rounded-xs text-[9px] font-bold border uppercase bg-rams-red/10 text-rams-red border-rams-red/30">
                                                                ABSENT:{item.absentCount}
                                                            </span>
                                                        )}
                                                        {!item.incompleteCount && !item.offDayWorkCount && !item.lateCount && !item.absentCount && (
                                                            <span className="text-rams-green text-[10px] font-bold">OK</span>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>

                                            {/* Expanded Detailed Breakdown */}
                                            {isExpanded && (
                                                <tr>
                                                    <td colSpan={8} className="p-4 sm:p-5 bg-rams-bg/30 border-t border-b border-rams-rule-light font-sans">
                                                        <div className="bg-rams-panel border border-rams-rule-light rounded-sm p-4.5 space-y-4 shadow-none">
                                                            
                                                            {/* Detailed Calculation Formula Box */}
                                                            <div className="bg-rams-bg p-4 rounded-sm border border-rams-rule-light space-y-2">
                                                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                                                                    <div className="flex items-center gap-2 font-mono text-xs font-bold text-rams-ink uppercase tracking-wider">
                                                                        <Calculator size={14} className="text-rams-orange" />
                                                                        <span>โครงสร้างการคำนวณค่าตอบแทน: {item.emp.name} ({wageType.toUpperCase()})</span>
                                                                    </div>
                                                                    
                                                                    {/* Bank Copy Button */}
                                                                    {item.emp.bank_account && (
                                                                        <button
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                handleCopyBankInfo(item.emp, item.netSalary);
                                                                            }}
                                                                            className="flex items-center gap-1.5 px-3 py-1 bg-rams-panel border border-rams-rule-light hover:border-rams-rule rounded-sm font-mono text-[10px] font-bold text-rams-ink uppercase transition-all cursor-pointer"
                                                                        >
                                                                            {copiedBankId === item.emp.id ? <Check size={12} className="text-rams-green" /> : <Copy size={12} />}
                                                                            <span>{copiedBankId === item.emp.id ? 'คัดลอกข้อมูลโอนเงินแล้ว!' : `คัดลอกบัญชี ${item.emp.bank_name || ''} ${item.emp.bank_account}`}</span>
                                                                        </button>
                                                                    )}
                                                                </div>

                                                                {/* Transparent Calculation Breakdown */}
                                                                <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2 pt-2 border-t border-rams-rule-light font-mono text-[11px]">
                                                                    <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                                                        <span className="text-[9px] text-rams-ink-muted uppercase block">1. ค่าแรงฐาน:</span>
                                                                        <span className="font-bold text-rams-ink">฿{item.totalSalary.toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                                                        <span className="text-[9px] text-rams-ink-muted uppercase block">2. ค่า OT ({item.totalOTHours.toFixed(1)}h):</span>
                                                                        <span className="font-bold text-rams-orange">฿{item.totalOTPay.toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                                                        <span className="text-[9px] text-rams-ink-muted uppercase block">3. ค่าตำแหน่ง:</span>
                                                                        <span className="font-bold text-rams-green">฿{(item.monthlyAllowance || 0).toLocaleString()}</span>
                                                                    </div>
                                                                    <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                                                        <span className="text-[9px] text-rams-ink-muted uppercase block">4. เบี้ยขยัน:</span>
                                                                        <span className="font-bold text-rams-green">{item.isDiligenceEarned ? `฿${item.diligenceAllowance.toLocaleString()}` : '฿0 (ไม่ผ่าน)'}</span>
                                                                    </div>
                                                                    <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                                                        <span className="text-[9px] text-rams-ink-muted uppercase block">5. ประกันสังคม:</span>
                                                                        <span className="font-bold text-rams-red">{item.ssoDeduct > 0 ? `-฿${item.ssoDeduct.toLocaleString()}` : '฿0'}</span>
                                                                    </div>
                                                                    <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                                                        <span className="text-[9px] text-rams-ink-muted uppercase block">6. ภาษี/หักอื่นๆ:</span>
                                                                        <span className="font-bold text-rams-red">{(item.taxDeduct + item.customDeduct) > 0 ? `-฿${(item.taxDeduct + item.customDeduct).toLocaleString()}` : '฿0'}</span>
                                                                    </div>
                                                                    <div className="bg-rams-ink text-rams-panel p-2 rounded-xs border border-rams-ink">
                                                                        <span className="text-[9px] text-rams-panel/70 uppercase block">= ยอดสุทธิ:</span>
                                                                        <span className="font-black text-xs text-rams-green">฿{item.netSalary.toLocaleString()}</span>
                                                                    </div>
                                                                </div>
                                                            </div>

                                                            {/* Daily Log Header & Filters */}
                                                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pt-2">
                                                                <h4 className="font-mono font-bold text-rams-ink text-xs uppercase tracking-wider">
                                                                    สถิติการเข้างานและค่าจ้างรายวัน (Daily Logs Breakdown)
                                                                </h4>
                                                                
                                                                <div className="flex flex-wrap items-center gap-2">
                                                                    <div className="flex items-center gap-1 font-mono text-[9px] uppercase tracking-wider bg-rams-bg p-0.5 border border-rams-rule-light rounded-sm">
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setDailyFilter('ALL'); }}
                                                                            className={`px-2.5 py-1 rounded-xs transition-all cursor-pointer ${dailyFilter === 'ALL' ? 'bg-rams-ink text-rams-panel font-bold' : 'text-rams-ink-muted hover:text-rams-ink'}`}
                                                                        >
                                                                            ALL ({item.dailyDetails.length})
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setDailyFilter('EXCEPTIONS'); }}
                                                                            className={`px-2.5 py-1 rounded-xs transition-all cursor-pointer ${dailyFilter === 'EXCEPTIONS' ? 'bg-rams-red text-rams-panel font-bold' : 'text-rams-red hover:bg-rams-red/10'}`}
                                                                        >
                                                                            EXCEPTIONS
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setDailyFilter('WORK'); }}
                                                                            className={`px-2.5 py-1 rounded-xs transition-all cursor-pointer ${dailyFilter === 'WORK' ? 'bg-rams-ink text-rams-panel font-bold' : 'text-rams-ink-muted hover:text-rams-ink'}`}
                                                                        >
                                                                            WORK DAYS
                                                                        </button>
                                                                        <button 
                                                                            onClick={(e) => { e.stopPropagation(); setDailyFilter('OFF'); }}
                                                                            className={`px-2.5 py-1 rounded-xs transition-all cursor-pointer ${dailyFilter === 'OFF' ? 'bg-rams-ink text-rams-panel font-bold' : 'text-rams-ink-muted hover:text-rams-ink'}`}
                                                                        >
                                                                            OFF DAYS
                                                                        </button>
                                                                    </div>

                                                                    <a
                                                                        href={`/admin/payroll/report?month=${selectedMonth}&type=individual&emp_id=${item.emp.id}`}
                                                                        target="_blank"
                                                                        onClick={(e) => e.stopPropagation()}
                                                                        className="flex items-center gap-1.5 px-3 py-1 bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule-light hover:border-rams-rule rounded-sm font-mono text-[9px] font-bold uppercase tracking-wider transition-all"
                                                                    >
                                                                        <Printer size={11} /> 
                                                                        <span>พิมพ์สลิปคนนี้</span>
                                                                    </a>
                                                                </div>
                                                            </div>

                                                            {/* Daily Log Table */}
                                                            <div className="max-h-72 overflow-y-auto border border-rams-rule-light rounded-sm custom-scrollbar">
                                                                <table className="w-full text-[11px] text-left">
                                                                    <thead className="bg-rams-bg/80 text-rams-ink-muted border-b border-rams-rule-light uppercase text-[9px] font-mono font-bold tracking-widest sticky top-0">
                                                                        <tr>
                                                                            <th className="px-3 py-2">วันที่</th>
                                                                            <th className="px-3 py-2">กะงาน</th>
                                                                            <th className="px-3 py-2">เวลาตามตาราง</th>
                                                                            <th className="px-3 py-2">เวลาเข้า-ออกจริง</th>
                                                                            <th className="px-3 py-2">สถานะ</th>
                                                                            <th className="px-3 py-2 text-center">ชม.ปกติ</th>
                                                                            <th className="px-3 py-2 text-center">OT (ชม.)</th>
                                                                            <th className="px-3 py-2 text-right">ค่าแรง</th>
                                                                            <th className="px-3 py-2 text-right">ค่า OT</th>
                                                                            <th className="px-3 py-2 text-right">รวม</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-rams-rule-light font-mono">
                                                                        {filterDailyList(item.dailyDetails).map((day, idx) => {
                                                                            const isOffNormal = day.shift === 'OFF' && day.status === 'OFF';
                                                                            const isOffWorked = day.status.includes('OFF-DAY');
                                                                            const isMissed = day.status.includes('MISSED');

                                                                            return (
                                                                                <tr key={idx} className={`${isOffNormal ? 'text-rams-ink-muted bg-rams-bg/10' : 'text-rams-ink hover:bg-rams-bg/40'} ${isOffWorked ? 'bg-rams-ink/5' : ''}`}>
                                                                                    <td className="px-3 py-2 font-bold">{format(new Date(day.date), 'dd MMM yyyy', { locale: th })}</td>
                                                                                    <td className="px-3 py-2 font-bold">{day.shift}</td>
                                                                                    <td className={`px-3 py-2 ${isOffNormal ? 'text-rams-ink-muted' : 'text-rams-ink font-bold'}`}>
                                                                                        {day.scheduled_in !== '-' ? `${day.scheduled_in} - ${day.scheduled_out}` : '-'}
                                                                                    </td>
                                                                                    <td className={`px-3 py-2 font-bold ${isOffNormal ? 'text-rams-ink-muted' : isMissed ? 'text-rams-red' : 'text-rams-ink'}`}>
                                                                                        {day.in !== '-' || day.out !== '-' ? `${day.in} - ${day.out}` : '-'}
                                                                                    </td>
                                                                                    <td className="px-3 py-2">
                                                                                        <span className={`px-1.5 py-0.2 rounded-xs text-[9px] font-mono border uppercase tracking-wider ${getStatusBadgeStyle(day.status)}`}>
                                                                                            {day.status}
                                                                                        </span>
                                                                                    </td>
                                                                                    <td className="px-3 py-2 text-center">{day.regular_hours > 0 ? day.regular_hours.toFixed(1) : '-'}</td>
                                                                                    <td className="px-3 py-2 text-center text-rams-orange font-bold">{day.ot_hours > 0 ? day.ot_hours.toFixed(1) : '-'}</td>
                                                                                    <td className="px-3 py-2 text-right">{day.wage > 0 ? day.wage.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}</td>
                                                                                    <td className="px-3 py-2 text-right text-rams-orange">{day.ot > 0 ? day.ot.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}</td>
                                                                                    <td className="px-3 py-2 text-right font-bold">
                                                                                        {(day.wage + day.ot) > 0 ? (day.wage + day.ot).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}
                                                                                    </td>
                                                                                </tr>
                                                                            );
                                                                        })}
                                                                    </tbody>
                                                                </table>
                                                            </div>

                                                        </div>
                                                    </td>
                                                </tr>
                                            )}
                                        </React.Fragment>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Modal: Add Deduction / Bonus Adjustment */}
            {showAdjustmentModal && (
                <div className="fixed inset-0 bg-rams-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-4">
                    <div className="bg-rams-panel border border-rams-rule rounded-sm w-full max-w-md p-6 shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
                        <div className="flex justify-between items-center border-b border-rams-rule-light pb-3">
                            <h3 className="font-mono font-bold text-sm text-rams-ink uppercase tracking-wider flex items-center gap-2">
                                <Plus size={16} className="text-rams-orange" />
                                เพิ่มรายการปรับยอด / หักเงินเดือน
                            </h3>
                            <button onClick={() => setShowAdjustmentModal(false)} className="text-rams-ink-muted hover:text-rams-ink cursor-pointer">
                                <X size={16} />
                            </button>
                        </div>

                        <form onSubmit={handleSaveAdjustment} className="space-y-4 text-xs">
                            <div>
                                <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1 uppercase">พนักงาน *</label>
                                <select 
                                    value={adjustmentForm.empId} 
                                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, empId: e.target.value })}
                                    required
                                    className="w-full p-2 bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink font-sans text-xs outline-none cursor-pointer"
                                >
                                    <option value="">-- เลือกพนักงาน --</option>
                                    {payrollData.map(d => (
                                        <option key={d.emp.id} value={d.emp.id}>
                                            {d.emp.name} {d.emp.nickname ? `(${d.emp.nickname})` : ''} - {d.emp.position}
                                        </option>
                                    ))}
                                </select>
                            </div>

                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1 uppercase">ประเภทรายการ</label>
                                    <select 
                                        value={adjustmentForm.type} 
                                        onChange={(e) => setAdjustmentForm({ ...adjustmentForm, type: e.target.value })}
                                        className="w-full p-2 bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink font-sans text-xs outline-none cursor-pointer"
                                    >
                                        <option value="deduction">หักเงิน (Deduction)</option>
                                        <option value="advance">เบิกล่วงหน้า (Advance)</option>
                                        <option value="bonus">เงินเพิ่มพิเศษ (Bonus)</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1 uppercase">จำนวนเงิน (บาท) *</label>
                                    <input 
                                        type="number"
                                        placeholder="เช่น 500"
                                        required
                                        value={adjustmentForm.amount}
                                        onChange={(e) => setAdjustmentForm({ ...adjustmentForm, amount: e.target.value })}
                                        className="w-full p-2 bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink font-mono text-xs outline-none"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1 uppercase">เหตุผล / รายละเอียดบันทึก</label>
                                <input 
                                    type="text"
                                    placeholder="เช่น หักค่าของเสียหาย, เบิกล่วงหน้า, โบนัสผลงาน"
                                    value={adjustmentForm.reason}
                                    onChange={(e) => setAdjustmentForm({ ...adjustmentForm, reason: e.target.value })}
                                    className="w-full p-2 bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink font-sans text-xs outline-none"
                                />
                            </div>

                            <div className="pt-2 border-t border-rams-rule-light flex justify-end gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAdjustmentModal(false)}
                                    className="px-4 py-2 bg-rams-bg text-rams-ink rounded-sm font-mono text-xs uppercase cursor-pointer"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSavingAdjustment}
                                    className="px-5 py-2 bg-rams-orange hover:bg-rams-orange-active text-rams-panel font-mono text-xs font-bold uppercase rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] transition-all cursor-pointer"
                                >
                                    {isSavingAdjustment ? 'กำลังบันทึก...' : 'บันทึกรายการ'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

        </div>
    );
}
