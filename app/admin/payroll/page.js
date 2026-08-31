"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { calculatePayroll } from '../../../utils/payroll';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { FileText, Printer, ChevronLeft, ChevronRight, ChevronDown, ChevronUp } from 'lucide-react';

export default function PayrollDashboard() {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);
    const [expandedEmpId, setExpandedEmpId] = useState(null);
    const [dailyFilter, setDailyFilter] = useState('ALL'); // 'ALL' | 'EXCEPTIONS' | 'WORK' | 'OFF'

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

        const [empRes, shiftRes, transRes, logRes, schedRes, deductRes] = await Promise.all([
            supabase.from('employees').select('*'),
            supabase.from('shifts').select('*'),
            supabase.from('roster_transactions').select('*').gte('date', startStr).lte('date', endStr),
            supabase.from('attendance_logs').select('*').gte('timestamp', startDate.toISOString()).lte('timestamp', addDays(endDate, 2).toISOString()),
            supabase.from('employee_schedules').select('*'),
            supabase.from('payroll_deductions').select('*')
        ]);

        if (empRes.data && transRes.data && logRes.data) {
            const data = calculatePayroll(
                empRes.data, 
                logRes.data, 
                transRes.data, 
                shiftRes.data || [], 
                { hourly_rate: 50, ot_rate: 75 },
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

    const totalNetSalary = payrollData.reduce((sum, item) => sum + item.netSalary, 0);
    const totalMissedPunches = payrollData.reduce((sum, item) => sum + (item.incompleteCount || 0), 0);
    const totalOffDayWorks = payrollData.reduce((sum, item) => sum + (item.offDayWorkCount || 0), 0);

    const getStatusBadgeStyle = (status) => {
        const s = (status || '').toUpperCase();
        if (s.includes('OFF-DAY WORK')) {
            return 'bg-rams-ink text-rams-panel border-rams-ink font-bold';
        }
        if (s.includes('UNSCHEDULED WORK')) {
            return 'bg-rams-orange/10 text-rams-orange border-rams-orange/30 font-bold';
        }
        if (s.includes('MISSED') || s.includes('INCOMPLETE') || s.includes('ABSENT')) {
            return 'bg-rams-red/10 text-rams-red border-rams-red/30 font-bold';
        }
        if (s.includes('LATE')) {
            return 'bg-rams-amber/10 text-rams-amber border-rams-amber/30 font-bold';
        }
        if (s === 'OFF') {
            return 'bg-rams-bg text-rams-ink-muted border-rams-rule-light';
        }
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
        <div className="p-6 max-w-7xl mx-auto space-y-6 text-rams-ink font-sans min-h-screen bg-rams-bg selection:bg-rams-ink/10">
            <div className="mb-2">
                <a href="/admin" className="text-xs font-mono font-bold text-rams-ink-muted hover:text-rams-ink flex items-center gap-1.5 w-fit transition-colors uppercase tracking-wider">
                    <ChevronLeft size={14} /> กลับสู่หน้าแดชบอร์ดหลัก
                </a>
            </div>

            {/* Header */}
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-rams-panel p-5 rounded-sm border border-rams-rule shadow-none">
                <div>
                    <h1 className="text-lg font-mono font-bold tracking-wider text-rams-ink uppercase">ระบบสรุปเงินเดือน (Payroll)</h1>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-rams-ink-muted mt-1.5">ประมวลผลจากตารางงาน (Roster) และเวลาเข้างานจริง (Attendance Logs)</p>
                </div>
                
                <div className="flex gap-2">
                    <a 
                        href={`/admin/payroll/report?month=${selectedMonth}&type=master`} 
                        target="_blank"
                        className="flex items-center gap-2 px-4 py-2 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink rounded-sm border border-rams-rule-light text-xs font-mono font-bold uppercase tracking-wider transition-all"
                    >
                        <FileText size={14} className="text-rams-ink-muted" /> สรุปรวม (Master)
                    </a>
                    <a 
                        href={`/admin/payroll/report?month=${selectedMonth}&type=individual`} 
                        target="_blank"
                        className="flex items-center gap-2 px-4 py-2 bg-rams-orange hover:bg-rams-orange-active text-rams-panel rounded-sm border border-rams-rule text-xs font-mono font-bold uppercase tracking-wider shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] active:shadow-none transition-all"
                    >
                        <Printer size={14} /> พิมพ์สลิป (Payslips)
                    </a>
                </div>
            </div>

            {/* Metrics Overview Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-rams-panel p-5 rounded-sm border border-rams-rule-light shadow-none flex flex-col justify-between">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">ยอดรวมที่ต้องจ่ายเดือนนี้</p>
                    <h3 className="text-2xl font-mono font-black text-rams-ink tracking-tight">฿{totalNetSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</h3>
                </div>

                <div className="bg-rams-panel p-4 rounded-sm border border-rams-rule-light flex flex-col justify-center items-center shadow-none">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-2.5">รอบเดือน</p>
                    <div className="flex items-center gap-4">
                        <button onClick={prevMonth} className="w-8 h-8 bg-rams-bg border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center rounded-sm transition-all cursor-pointer"><ChevronLeft size={16}/></button>
                        <span className="text-sm font-mono font-bold w-32 text-center uppercase tracking-wider text-rams-ink">
                            {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: th })}
                        </span>
                        <button onClick={nextMonth} className="w-8 h-8 bg-rams-bg border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center rounded-sm transition-all cursor-pointer"><ChevronRight size={16}/></button>
                    </div>
                </div>

                <div className="bg-rams-panel p-5 rounded-sm border border-rams-rule-light shadow-none flex flex-col justify-center">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">จำนวนพนักงานที่ทำงาน</p>
                    <h3 className="text-2xl font-mono font-black text-rams-ink tracking-tight">{payrollData.filter(d => d.workDays > 0).length} <span className="text-sm font-normal text-rams-ink-muted font-mono">คน</span></h3>
                </div>

                <div className="bg-rams-panel p-5 rounded-sm border border-rams-rule-light shadow-none flex flex-col justify-center">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">รายการตรวจสอบความผิดปกติ</p>
                    <div className="flex items-center gap-2 mt-1">
                        <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold border ${totalMissedPunches > 0 ? 'bg-rams-red/10 text-rams-red border-rams-red/30' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light'}`}>
                            MISSED: {totalMissedPunches}
                        </span>
                        <span className={`px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold border ${totalOffDayWorks > 0 ? 'bg-rams-orange/10 text-rams-orange border-rams-orange/30' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light'}`}>
                            OFF-DAY WORK: {totalOffDayWorks}
                        </span>
                    </div>
                </div>
            </div>

            {/* Payroll Table */}
            <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-12 text-center font-mono text-xs text-rams-ink-muted uppercase tracking-wider">กำลังประมวลผลข้อมูลเงินเดือน...</div>
                    ) : (
                        <table className="w-full text-xs text-left">
                            <thead className="bg-rams-bg/50 text-rams-ink-muted border-b border-rams-rule-light font-mono text-[9px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-6 py-4">พนักงาน</th>
                                    <th className="px-6 py-4 text-center">วันทำงาน</th>
                                    <th className="px-6 py-4 text-center">ชม.ปกติ</th>
                                    <th className="px-6 py-4 text-center">OT (ชม.)</th>
                                    <th className="px-6 py-4 text-center">สถิติความผิดปกติ</th>
                                    <th className="px-6 py-4 text-right">ค่าแรงปกติ</th>
                                    <th className="px-6 py-4 text-right">ค่า OT</th>
                                    <th className="px-6 py-4 text-right">ยอดสุทธิ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rams-rule-light font-mono">
                                {payrollData.map(item => (
                                    <React.Fragment key={item.emp.id}>
                                        <tr 
                                             className="hover:bg-rams-bg/30 cursor-pointer transition-colors text-rams-ink border-b border-rams-rule-light"
                                             onClick={() => toggleExpand(item.emp.id)}
                                         >
                                            <td className="px-6 py-4 font-sans">
                                                <div className="flex items-center gap-3">
                                                    <span className="text-rams-ink-muted">
                                                        {expandedEmpId === item.emp.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                                    </span>
                                                    <div>
                                                        <div className="font-bold text-rams-ink">{item.emp.nickname || item.emp.name}</div>
                                                        <div className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-wider mt-0.5">{item.emp.position}</div>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-center font-bold">{item.workDays}</td>
                                            <td className="px-6 py-4 text-center text-rams-orange font-bold">{item.totalRegularHours.toFixed(1)}</td>
                                            <td className="px-6 py-4 text-center text-rams-orange font-bold">{item.totalOTHours.toFixed(1)}</td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-wrap items-center justify-center gap-1.5">
                                                    {item.incompleteCount > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold border uppercase tracking-wider bg-rams-red/10 text-rams-red border-rams-red/30">
                                                            MISSED: {item.incompleteCount}
                                                        </span>
                                                    )}
                                                    {item.offDayWorkCount > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold border uppercase tracking-wider bg-rams-orange/10 text-rams-orange border-rams-orange/30">
                                                            OFF-DAY: {item.offDayWorkCount}
                                                        </span>
                                                    )}
                                                    {item.lateCount > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold border uppercase tracking-wider bg-rams-amber/10 text-rams-amber border-rams-amber/30">
                                                            LATE: {item.lateCount}
                                                        </span>
                                                    )}
                                                    {item.absentCount > 0 && (
                                                        <span className="px-1.5 py-0.5 rounded-sm text-[9px] font-bold border uppercase tracking-wider bg-rams-red/10 text-rams-red border-rams-red/30">
                                                            ABSENT: {item.absentCount}
                                                        </span>
                                                    )}
                                                    {!item.incompleteCount && !item.offDayWorkCount && !item.lateCount && !item.absentCount && (
                                                        <span className="text-rams-ink-muted text-[10px]">-</span>
                                                    )}
                                                </div>
                                            </td>
                                            <td className="px-6 py-4 text-right font-bold">฿{item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-6 py-4 text-right font-bold">฿{item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                            <td className="px-6 py-4 text-right font-black text-rams-green text-sm">฿{item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                        </tr>
                                        {expandedEmpId === item.emp.id && (
                                            <tr>
                                                <td colSpan={8} className="p-4 bg-rams-bg/20 border-t border-b border-rams-rule-light font-sans">
                                                    <div className="p-4 bg-rams-panel border border-rams-rule-light rounded-sm shadow-none max-h-96 overflow-y-auto">
                                                        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
                                                            <h4 className="font-mono font-bold text-rams-ink text-xs uppercase tracking-wider">
                                                                DAILY ATTENDANCE & PAYROLL BREAKDOWN — {item.emp.nickname || item.emp.name}
                                                            </h4>
                                                            
                                                            {/* Filter Tabs */}
                                                            <div className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-wider">
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setDailyFilter('ALL'); }}
                                                                    className={`px-2.5 py-1 rounded-sm border transition-all cursor-pointer ${dailyFilter === 'ALL' ? 'bg-rams-ink text-rams-panel border-rams-ink font-bold' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light hover:text-rams-ink'}`}
                                                                >
                                                                    ALL ({item.dailyDetails.length})
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setDailyFilter('EXCEPTIONS'); }}
                                                                    className={`px-2.5 py-1 rounded-sm border transition-all cursor-pointer ${dailyFilter === 'EXCEPTIONS' ? 'bg-rams-red text-rams-panel border-rams-red font-bold' : 'bg-rams-bg text-rams-red border-rams-rule-light hover:border-rams-red'}`}
                                                                >
                                                                    EXCEPTIONS ONLY
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setDailyFilter('WORK'); }}
                                                                    className={`px-2.5 py-1 rounded-sm border transition-all cursor-pointer ${dailyFilter === 'WORK' ? 'bg-rams-ink text-rams-panel border-rams-ink font-bold' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light hover:text-rams-ink'}`}
                                                                >
                                                                    WORK DAYS
                                                                </button>
                                                                <button 
                                                                    onClick={(e) => { e.stopPropagation(); setDailyFilter('OFF'); }}
                                                                    className={`px-2.5 py-1 rounded-sm border transition-all cursor-pointer ${dailyFilter === 'OFF' ? 'bg-rams-ink text-rams-panel border-rams-ink font-bold' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light hover:text-rams-ink'}`}
                                                                >
                                                                    OFF DAYS
                                                                </button>
                                                            </div>
                                                        </div>

                                                        <table className="w-full text-[11px] text-left">
                                                            <thead className="bg-rams-bg/75 text-rams-ink-muted border-b border-rams-rule-light uppercase text-[9px] font-mono font-bold tracking-widest">
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
                                                                    const isUnscheduled = day.status.includes('UNSCHEDULED');
                                                                    const isLate = day.status.includes('LATE');

                                                                    return (
                                                                        <tr key={idx} className={`${isOffNormal ? 'text-rams-ink-muted bg-rams-bg/10' : 'text-rams-ink hover:bg-rams-bg/40'} ${isOffWorked ? 'bg-rams-ink/5' : ''}`}>
                                                                            <td className="px-3 py-2 font-bold">{format(new Date(day.date), 'dd MMM yyyy', { locale: th })}</td>
                                                                            <td className="px-3 py-2 font-bold">{day.shift}</td>
                                                                            <td className={`px-3 py-2 ${isOffNormal ? 'text-rams-ink-muted' : 'text-rams-ink font-bold'}`}>
                                                                                {day.scheduled_in !== '-' ? `${day.scheduled_in} - ${day.scheduled_out}` : '-'}
                                                                            </td>
                                                                            <td className={`px-3 py-2 font-bold ${isOffNormal ? 'text-rams-ink-muted' : isMissed ? 'text-rams-red' : isOffWorked ? 'text-rams-ink font-black' : 'text-rams-ink'}`}>
                                                                                {day.in !== '-' || day.out !== '-' ? `${day.in} - ${day.out}` : '-'}
                                                                            </td>
                                                                            <td className="px-3 py-2">
                                                                                <span className={`px-2 py-0.5 rounded-sm text-[9px] font-mono border uppercase tracking-wider ${getStatusBadgeStyle(day.status)}`}>
                                                                                    {day.status}
                                                                                </span>
                                                                            </td>
                                                                            <td className={`px-3 py-2 text-center font-bold ${isOffNormal ? 'text-rams-ink-muted' : 'text-rams-ink'}`}>{day.regular_hours > 0 ? day.regular_hours.toFixed(1) : '-'}</td>
                                                                            <td className={`px-3 py-2 text-center ${isOffNormal ? 'text-rams-ink-muted' : 'text-rams-orange font-bold'}`}>{day.ot_hours > 0 ? day.ot_hours.toFixed(1) : '-'}</td>
                                                                            <td className={`px-3 py-2 text-right font-bold ${isOffNormal ? 'text-rams-ink-muted' : 'text-rams-ink'}`}>{day.wage > 0 ? day.wage.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}</td>
                                                                            <td className={`px-3 py-2 text-right ${isOffNormal ? 'text-rams-ink-muted' : 'text-rams-orange font-bold'}`}>{day.ot > 0 ? day.ot.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}</td>
                                                                            <td className={`px-3 py-2 text-right font-bold ${isOffNormal ? 'text-rams-ink-muted' : 'text-rams-ink'}`}>
                                                                                {(day.wage + day.ot) > 0 ? (day.wage + day.ot).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}
                                                                            </td>
                                                                        </tr>
                                                                    );
                                                                })}
                                                                {filterDailyList(item.dailyDetails).length === 0 && (
                                                                    <tr>
                                                                        <td colSpan={10} className="py-6 text-center text-rams-ink-muted font-mono text-[10px] uppercase tracking-wider">
                                                                            ไม่มีรายการตรงตามเงื่อนไขตัวกรอง
                                                                        </td>
                                                                    </tr>
                                                                )}
                                                            </tbody>
                                                        </table>
                                                    </div>
                                                </td>
                                            </tr>
                                        )}
                                    </React.Fragment>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
