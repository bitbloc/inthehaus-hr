"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { calculatePayroll } from "../../../../utils/payroll";
import { format, startOfMonth, endOfMonth, addDays } from "date-fns";
import { th } from "date-fns/locale";
import { Printer, FileText, User, ChevronLeft } from "lucide-react";

function PayrollPDFReportContent() {
    const searchParams = useSearchParams();
    const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM');
    const initialType = searchParams.get('type') || 'master'; // 'master' | 'individual'
    const empIdParam = searchParams.get('emp_id') || searchParams.get('employee_id') || 'ALL';
    
    const [reportType, setReportType] = useState(initialType);
    const [selectedEmpId, setSelectedEmpId] = useState(empIdParam);
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            setLoading(true);
            const [year, month] = monthParam.split('-');
            const startDate = startOfMonth(new Date(year, month - 1));
            const endDate = endOfMonth(startDate);
            const startStr = format(startDate, 'yyyy-MM-dd');
            const endStr = format(endDate, 'yyyy-MM-dd');

            const [empRes, shiftRes, transRes, logRes, schedRes, deductRes] = await Promise.all([
                supabase.from('employees').select('*').order('id'),
                supabase.from('shifts').select('*').order('start_time'),
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
                    monthParam,
                    schedRes.data || []
                );
                setPayrollData(data);
            }
            setLoading(false);
        };

        fetchData();
    }, [monthParam]);

    if (loading) {
        return (
            <div className="min-h-screen bg-rams-bg flex flex-col items-center justify-center p-8 font-mono">
                <div className="text-xs font-bold tracking-widest text-rams-ink uppercase animate-pulse">
                    GENERATING PAYROLL PDF REPORT...
                </div>
                <div className="text-[10px] text-rams-ink-muted mt-2 uppercase tracking-wider">
                    กำลังคำนวณข้อมูลเงินเดือนและสถิติการลงเวลา
                </div>
            </div>
        );
    }

    const workingEmployees = payrollData.filter(d => d.workDays > 0 || (d.dailyDetails && d.dailyDetails.some(day => day.in !== '-' || day.out !== '-')));
    const filteredIndividualData = selectedEmpId === 'ALL' 
        ? workingEmployees 
        : workingEmployees.filter(d => String(d.emp.id) === String(selectedEmpId));

    const totalSalary = workingEmployees.reduce((sum, item) => sum + item.totalSalary, 0);
    const totalOT = workingEmployees.reduce((sum, item) => sum + item.totalOTPay, 0);
    const totalDeduct = workingEmployees.reduce((sum, item) => sum + (item.totalDeduct || 0), 0);
    const totalNet = workingEmployees.reduce((sum, item) => sum + item.netSalary, 0);
    const totalMissedPunches = workingEmployees.reduce((sum, item) => sum + (item.incompleteCount || 0), 0);
    const totalOffDayWorks = workingEmployees.reduce((sum, item) => sum + (item.offDayWorkCount || 0), 0);
    const totalLate = workingEmployees.reduce((sum, item) => sum + (item.lateCount || 0), 0);
    const totalAbsent = workingEmployees.reduce((sum, item) => sum + (item.absentCount || 0), 0);

    const printDateStr = format(new Date(monthParam + '-01'), 'MMMM yyyy', { locale: th });

    const getStatusBadgeStyle = (status) => {
        const s = (status || '').toUpperCase();
        if (s.includes('OFF-DAY WORK')) {
            return 'bg-rams-ink text-rams-panel border-rams-ink font-bold';
        }
        if (s.includes('UNSCHEDULED WORK')) {
            return 'bg-rams-orange/15 text-rams-orange border-rams-orange/30 font-bold';
        }
        if (s.includes('MISSED') || s.includes('INCOMPLETE') || s.includes('ABSENT')) {
            return 'bg-rams-red/15 text-rams-red border-rams-red/30 font-bold';
        }
        if (s.includes('LATE')) {
            return 'bg-rams-amber/15 text-rams-amber border-rams-amber/30 font-bold';
        }
        if (s === 'OFF') {
            return 'text-neutral-400 border-neutral-200';
        }
        return 'bg-rams-green/10 text-rams-green border-rams-green/30 font-bold';
    };

    const MasterReport = () => (
        <div className="bg-[#fafaf9] text-neutral-900 p-8 md:p-14 font-mono selection:bg-neutral-900 selection:text-white max-w-6xl mx-auto">
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-neutral-900 pb-6 mb-8">
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <img src="/logo.png" className="h-9 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                        <h1 className="text-lg font-bold tracking-widest leading-none">IN THE HAUS</h1>
                    </div>
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-500">Master Payroll Summary Report / สรุปยอดจ่ายเงินเดือนประจำงวด</p>
                </div>
                <div className="text-right">
                    <div className="text-base font-bold tracking-tight text-neutral-900 uppercase">{printDateStr}</div>
                    <div className="text-[8px] font-bold tracking-widest uppercase text-neutral-400 mt-1">Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                </div>
            </div>

            {/* Metrics Overview Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <div className="border border-neutral-300 bg-white p-4 rounded-xl flex flex-col justify-between">
                    <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-1">Base Salary</p>
                    <p className="text-xl font-bold tracking-tight text-neutral-900">฿{totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border border-neutral-300 bg-white p-4 rounded-xl flex flex-col justify-between">
                    <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-1">Overtime Pay (OT)</p>
                    <p className="text-xl font-bold tracking-tight text-rams-orange">฿{totalOT.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border border-neutral-300 bg-white p-4 rounded-xl flex flex-col justify-between">
                    <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-1">Deductions</p>
                    <p className="text-xl font-bold tracking-tight text-rams-red">฿{totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border border-neutral-900 bg-neutral-900 text-white p-4 rounded-xl flex flex-col justify-between">
                    <p className="text-[8px] font-bold tracking-[0.2em] uppercase opacity-70 mb-1">Net Total Payout</p>
                    <p className="text-xl font-bold tracking-tight">฿{totalNet.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            {/* Audit Summary Bar */}
            <div className="border border-neutral-200 bg-white px-4 py-2.5 rounded-xl mb-6 flex flex-wrap justify-between items-center text-[9px] uppercase font-bold tracking-wider">
                <span className="text-neutral-400">AUDIT SUMMARY:</span>
                <div className="flex flex-wrap gap-3 text-neutral-700">
                    <span>STAFF COUNT: <strong className="text-neutral-900">{workingEmployees.length}</strong></span>
                    <span>MISSED PUNCHES: <strong className={totalMissedPunches > 0 ? "text-rams-red" : "text-neutral-900"}>{totalMissedPunches}</strong></span>
                    <span>OFF-DAY WORKS: <strong className={totalOffDayWorks > 0 ? "text-rams-orange" : "text-neutral-900"}>{totalOffDayWorks}</strong></span>
                    <span>LATE: <strong className={totalLate > 0 ? "text-rams-amber" : "text-neutral-900"}>{totalLate}</strong></span>
                    <span>ABSENT: <strong className={totalAbsent > 0 ? "text-rams-red" : "text-neutral-900"}>{totalAbsent}</strong></span>
                </div>
            </div>

            {/* Master Summary Table */}
            <div className="border border-neutral-200 bg-white rounded-2xl overflow-hidden mb-8">
                <table className="w-full text-xs text-left border-collapse">
                    <thead className="bg-[#fafaf9] border-b border-neutral-200 text-[9px] font-bold tracking-widest uppercase text-neutral-400">
                        <tr>
                            <th className="py-3 px-4">Employee</th>
                            <th className="py-3 px-3 text-center">Days</th>
                            <th className="py-3 px-3 text-center">Reg/OT Hrs</th>
                            <th className="py-3 px-3 text-right">Base Pay</th>
                            <th className="py-3 px-3 text-right">OT Pay</th>
                            <th className="py-3 px-3 text-right text-rams-red">Deduct</th>
                            <th className="py-3 px-4 text-right">Net Pay</th>
                            <th className="py-3 px-3 text-center">Audit Flags</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-neutral-100 font-mono">
                        {workingEmployees.map((item) => (
                            <tr key={item.emp.id} className="hover:bg-neutral-50/60 transition-colors">
                                <td className="py-3 px-4">
                                    <div className="font-bold text-neutral-800">{item.emp.nickname || item.emp.name}</div>
                                    <div className="text-[9px] font-semibold uppercase tracking-tight text-neutral-400">{item.emp.position}</div>
                                </td>
                                <td className="py-3 px-3 text-center font-bold text-neutral-800">
                                    {item.workDays}
                                </td>
                                <td className="py-3 px-3 text-center text-[10px] text-neutral-600">
                                    {item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)}
                                </td>
                                <td className="py-3 px-3 text-right font-medium text-neutral-800">
                                    {item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-3 text-right font-bold text-rams-orange">
                                    {item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-3 text-right font-medium text-rams-red">
                                    {item.totalDeduct > 0 ? `-${item.totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })}` : '-'}
                                </td>
                                <td className="py-3 px-4 text-right font-black text-neutral-900 text-sm">
                                    {item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                </td>
                                <td className="py-3 px-3 text-center">
                                    <div className="flex flex-wrap justify-center gap-1 text-[8px] font-bold uppercase tracking-wider">
                                        {item.incompleteCount > 0 && (
                                            <span className="px-1.5 py-0.5 rounded-sm bg-rams-red/10 border border-rams-red/30 text-rams-red">
                                                MISSED: {item.incompleteCount}
                                            </span>
                                        )}
                                        {item.offDayWorkCount > 0 && (
                                            <span className="px-1.5 py-0.5 rounded-sm bg-rams-orange/10 border border-rams-orange/30 text-rams-orange">
                                                OFF-DAY: {item.offDayWorkCount}
                                            </span>
                                        )}
                                        {!item.incompleteCount && !item.offDayWorkCount && (
                                            <span className="px-1.5 py-0.5 rounded-sm bg-rams-green/10 border border-rams-green/30 text-rams-green">
                                                OK
                                            </span>
                                        )}
                                    </div>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                    <tfoot className="bg-[#fafaf9] border-t-2 border-neutral-900 font-mono font-bold text-xs">
                        <tr>
                            <td className="py-3 px-4 uppercase tracking-wider">TOTAL / รวมทั้งสิ้น</td>
                            <td className="py-3 px-3 text-center">{workingEmployees.reduce((s, i) => s + i.workDays, 0)}</td>
                            <td className="py-3 px-3 text-center text-[10px]">
                                {workingEmployees.reduce((s, i) => s + i.totalRegularHours, 0).toFixed(1)} / {workingEmployees.reduce((s, i) => s + i.totalOTHours, 0).toFixed(1)}
                            </td>
                            <td className="py-3 px-3 text-right">฿{totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                            <td className="py-3 px-3 text-right text-rams-orange">฿{totalOT.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                            <td className="py-3 px-3 text-right text-rams-red">฿{totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                            <td className="py-3 px-4 text-right text-sm">฿{totalNet.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                            <td className="py-3 px-3"></td>
                        </tr>
                    </tfoot>
                </table>
            </div>

            {/* Signature & Verification Section */}
            <div className="avoid-break mt-12 pt-8 border-t border-neutral-200">
                <div className="grid grid-cols-2 gap-12 text-center text-xs mb-8">
                    <div className="space-y-12">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">ผู้จัดทำรายงาน (Prepared By)</p>
                        <div className="border-b border-neutral-300 w-48 mx-auto"></div>
                        <p className="text-[10px] text-neutral-500 font-bold">วันที่: ..... / ..... / ..........</p>
                    </div>
                    <div className="space-y-12">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">ผู้อนุมัติการจ่ายเงิน (Approved By)</p>
                        <div className="border-b border-neutral-300 w-48 mx-auto"></div>
                        <p className="text-[10px] text-neutral-500 font-bold">วันที่: ..... / ..... / ..........</p>
                    </div>
                </div>

                <div className="flex justify-between items-end flex-wrap gap-4 pt-4 border-t border-neutral-200 text-neutral-400">
                    <div>
                        <p className="text-[8px] font-bold tracking-[0.2em] uppercase mb-1">VERIFICATION & ARCHIVES</p>
                        <p className="text-[8px] leading-relaxed">
                            This document is generated by Yuzu AI for In The Haus based on Time Attendance Logs and Roster overrides.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[9px] font-bold tracking-widest uppercase text-neutral-700">IN THE HAUS x ONHAUS SYSTEM</p>
                        <p className="text-[8px] font-bold text-neutral-400 mt-0.5">© {new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </div>
        </div>
    );

    const IndividualReport = () => (
        <div className="bg-[#fafaf9] min-h-screen py-6 font-mono selection:bg-neutral-900 selection:text-white">
            {filteredIndividualData.length === 0 ? (
                <div className="max-w-4xl mx-auto p-12 text-center text-neutral-400 font-mono text-xs uppercase tracking-wider bg-white rounded-2xl border border-neutral-200">
                    ไม่พบข้อมูลเงินเดือนของพนักงานที่เลือกในงวดนี้
                </div>
            ) : (
                filteredIndividualData.map((item) => (
                    <div key={item.emp.id} className="print-page bg-white text-neutral-900 p-8 md:p-12 max-w-4xl mx-auto mb-10 rounded-2xl border border-neutral-200 shadow-none">
                        {/* Payslip Header */}
                        <div className="flex justify-between items-start border-b-2 border-neutral-900 pb-5 mb-6">
                            <div>
                                <div className="flex items-center gap-3 mb-1">
                                    <img src="/logo.png" className="h-8 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                                    <h1 className="text-base font-bold tracking-widest leading-none">IN THE HAUS</h1>
                                </div>
                                <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-500">PAYSLIP / ใบแจ้งยอดเงินเดือน</p>
                            </div>
                            <div className="text-right">
                                <div className="text-base font-bold tracking-tight text-neutral-900">{printDateStr}</div>
                                <div className="text-[9px] font-bold tracking-widest uppercase text-neutral-500 mt-0.5">
                                    ID: #{String(item.emp.id).padStart(4, '0')}
                                </div>
                            </div>
                        </div>

                        {/* Staff Info & Summary */}
                        <div className="grid grid-cols-2 gap-6 mb-6 border border-neutral-200 p-5 rounded-xl bg-[#fafaf9]">
                            <div>
                                <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-1">EMPLOYEE INFO</p>
                                <p className="font-bold text-sm text-neutral-900">{item.emp.name} {item.emp.nickname ? `(${item.emp.nickname})` : ''}</p>
                                <p className="text-[10px] text-neutral-600 uppercase font-semibold mt-0.5">{item.emp.position}</p>
                            </div>
                            <div className="text-right space-y-0.5 text-xs text-neutral-600">
                                <p className="text-[8px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-1">WORK STATS</p>
                                <p>Total Days: <span className="font-bold text-neutral-900">{item.workDays} Days</span></p>
                                <p>Hours (Reg / OT): <span className="font-bold text-neutral-900">{item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)} hrs</span></p>
                                {(item.incompleteCount > 0 || item.offDayWorkCount > 0) && (
                                    <div className="flex justify-end gap-1.5 pt-1 text-[8px] font-bold uppercase">
                                        {item.incompleteCount > 0 && <span className="text-rams-red">MISSED PUNCHES: {item.incompleteCount}</span>}
                                        {item.offDayWorkCount > 0 && <span className="text-rams-orange">OFF-DAY WORKS: {item.offDayWorkCount}</span>}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Daily Details Table */}
                        <div className="mb-6 overflow-hidden border border-neutral-200 rounded-xl">
                            <table className="w-full text-xs text-left border-collapse">
                                <thead className="bg-[#fafaf9] font-mono uppercase text-[8px] tracking-wider text-neutral-500 border-b border-neutral-200">
                                    <tr>
                                        <th className="py-2.5 px-3">Date</th>
                                        <th className="py-2.5 px-3">Shift</th>
                                        <th className="py-2.5 px-3">Sch. In-Out</th>
                                        <th className="py-2.5 px-3">Act. In-Out</th>
                                        <th className="py-2.5 px-3">Status</th>
                                        <th className="py-2.5 px-2 text-right">Reg</th>
                                        <th className="py-2.5 px-2 text-right">OT</th>
                                        <th className="py-2.5 px-3 text-right">Base Pay</th>
                                        <th className="py-2.5 px-3 text-right">OT Pay</th>
                                        <th className="py-2.5 px-3 text-right">Total (฿)</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-neutral-100 bg-white font-mono">
                                    {item.dailyDetails.map((d, i) => {
                                        const isOff = d.shift === 'OFF' && d.status === 'OFF';
                                        const isOffWorked = d.status?.includes('OFF-DAY');
                                        const isMissed = d.status?.includes('MISSED');
                                        const isAbsent = d.status?.includes('ABSENT');

                                        return (
                                            <tr key={i} className={`hover:bg-neutral-50/50 ${isOff ? 'text-neutral-400 bg-neutral-50/40' : 'text-neutral-800'}`}>
                                                <td className="py-1.5 px-3">{d.date.slice(5)}</td>
                                                <td className="py-1.5 px-3 font-medium">{d.shift}</td>
                                                <td className={`py-1.5 px-3 ${isOff ? 'text-neutral-400' : 'font-semibold'}`}>
                                                    {d.scheduled_in && d.scheduled_in !== '-' ? `${d.scheduled_in}-${d.scheduled_out}` : '-'}
                                                </td>
                                                <td className={`py-1.5 px-3 font-bold ${isOffWorked ? 'text-rams-ink' : isMissed ? 'text-rams-red' : ''}`}>
                                                    {d.in !== '-' || d.out !== '-' ? `${d.in}-${d.out}` : '-'}
                                                </td>
                                                <td className="py-1.5 px-3">
                                                    <span className={`px-1 py-0.5 rounded-xs text-[8px] uppercase border ${getStatusBadgeStyle(d.status)}`}>
                                                        {d.status}
                                                    </span>
                                                </td>
                                                <td className={`py-1.5 px-2 text-right ${isOff ? 'text-neutral-400' : 'text-neutral-700'}`}>
                                                    {d.regular_hours > 0 ? Number(d.regular_hours).toFixed(1) : '-'}
                                                </td>
                                                <td className={`py-1.5 px-2 text-right ${isOff ? 'text-neutral-400' : 'text-rams-orange font-medium'}`}>
                                                    {d.ot_hours > 0 ? Number(d.ot_hours).toFixed(1) : '-'}
                                                </td>
                                                <td className={`py-1.5 px-3 text-right ${isOff ? 'text-neutral-400' : 'text-neutral-700'}`}>
                                                    {d.wage > 0 ? d.wage.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}
                                                </td>
                                                <td className={`py-1.5 px-3 text-right ${isOff ? 'text-neutral-400' : 'text-rams-orange font-medium'}`}>
                                                    {d.ot > 0 ? d.ot.toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}
                                                </td>
                                                <td className={`py-1.5 px-3 text-right font-bold ${isOff ? 'text-neutral-400' : 'text-neutral-900'}`}>
                                                    {(d.wage + d.ot) > 0 ? (d.wage + d.ot).toLocaleString('th-TH', { minimumFractionDigits: 2 }) : '-'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Earnings & Deductions Box */}
                        <div className="avoid-break border-t border-neutral-200 pt-5">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="space-y-2 text-xs">
                                    <div className="flex justify-between">
                                        <span className="font-medium text-neutral-600">Base Salary / ค่าแรงปกติ</span>
                                        <span className="font-mono font-bold text-neutral-900">฿{item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between">
                                        <span className="font-medium text-neutral-600">Overtime Pay / ค่าล่วงเวลา (OT)</span>
                                        <span className="font-mono font-bold text-rams-orange">฿{item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                    <div className="flex justify-between border-b border-neutral-200 pb-2">
                                        <span className="font-medium text-neutral-600">Deductions / ยอดหัก</span>
                                        <span className="font-mono font-bold text-rams-red">-฿{item.totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                </div>
                                <div className="bg-neutral-900 text-white p-5 rounded-xl flex flex-col justify-center border border-neutral-900">
                                    <span className="text-[8px] font-bold tracking-[0.2em] uppercase opacity-70 mb-1">NET PAY / ยอดจ่ายสุทธิ</span>
                                    <span className="text-2xl font-bold tracking-tight">฿{item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>

                            {/* Signatures */}
                            <div className="grid grid-cols-2 gap-8 text-center text-xs mt-8 pt-6 border-t border-neutral-100">
                                <div className="space-y-8">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">ลงชื่อพนักงานผู้รับเงิน</p>
                                    <div className="border-b border-neutral-300 w-40 mx-auto"></div>
                                    <p className="text-[9px] text-neutral-500">({item.emp.name})</p>
                                </div>
                                <div className="space-y-8">
                                    <p className="text-[9px] font-bold uppercase tracking-wider text-neutral-400">ลงชื่อผู้อนุมัติ/ฝ่ายบุคคล</p>
                                    <div className="border-b border-neutral-300 w-40 mx-auto"></div>
                                    <p className="text-[9px] text-neutral-500">(In The Haus Management)</p>
                                </div>
                            </div>

                            <div className="mt-8 text-center border-t border-neutral-200 pt-4 flex flex-col items-center">
                                <p className="text-[8px] font-bold tracking-widest text-neutral-400 uppercase">YUZU PAYROLL ENGINE x IN THE HAUS</p>
                                <p className="text-[8px] font-bold text-neutral-400 mt-0.5">ONHAUS SYSTEM © {new Date().getFullYear()} All Rights Reserved</p>
                            </div>
                        </div>
                    </div>
                ))
            )}
        </div>
    );

    return (
        <div className="min-h-screen bg-[#fafaf9]">
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { 
                        padding: 0 !important; 
                        margin: 0 !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-page { 
                        page-break-after: always; 
                        break-after: page;
                        box-shadow: none !important; 
                        margin: 0 0 20px 0 !important; 
                        padding: 24px !important; 
                        border: none !important;
                        border-radius: 0 !important;
                    }
                    .avoid-break {
                        page-break-inside: avoid;
                        break-inside: avoid;
                    }
                    tr {
                        page-break-inside: avoid;
                        break-inside: avoid;
                    }
                }
            `}</style>
            
            {/* Top No-Print Control Bar */}
            <div className="no-print sticky top-0 z-50 bg-rams-panel/95 backdrop-blur-md border-b border-rams-rule p-4 shadow-sm">
                <div className="max-w-6xl mx-auto flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3">
                    <div className="flex items-center gap-3">
                        <a 
                            href={`/admin/payroll?month=${monthParam}`}
                            className="p-1.5 rounded-sm bg-rams-bg border border-rams-rule-light hover:border-rams-rule text-rams-ink text-xs transition-all flex items-center justify-center cursor-pointer"
                            title="กลับหน้า Payroll"
                        >
                            <ChevronLeft size={16} />
                        </a>
                        <div>
                            <h2 className="text-xs font-mono font-bold uppercase tracking-wider text-rams-ink">
                                PAYROLL PDF EXPORT — {printDateStr}
                            </h2>
                            <p className="text-[9px] font-mono text-rams-ink-muted uppercase tracking-wider">
                                {reportType === 'master' ? 'MASTER SUMMARY VIEW' : `INDIVIDUAL PAYSLIPS (${filteredIndividualData.length} PERSONS)`}
                            </p>
                        </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* View Switcher */}
                        <div className="flex bg-rams-bg border border-rams-rule-light rounded-sm p-0.5">
                            <button
                                type="button"
                                onClick={() => setReportType('master')}
                                className={`px-3 py-1 rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                    reportType === 'master' ? 'bg-rams-ink text-rams-panel' : 'text-rams-ink-muted hover:text-rams-ink'
                                }`}
                            >
                                <FileText size={12} className="inline mr-1 -mt-0.5" /> MASTER
                            </button>
                            <button
                                type="button"
                                onClick={() => setReportType('individual')}
                                className={`px-3 py-1 rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer ${
                                    reportType === 'individual' ? 'bg-rams-ink text-rams-panel' : 'text-rams-ink-muted hover:text-rams-ink'
                                }`}
                            >
                                <User size={12} className="inline mr-1 -mt-0.5" /> PAYSLIPS
                            </button>
                        </div>

                        {/* Individual Employee Filter */}
                        {reportType === 'individual' && (
                            <select
                                value={selectedEmpId}
                                onChange={(e) => setSelectedEmpId(e.target.value)}
                                className="px-2.5 py-1 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none"
                            >
                                <option value="ALL">พนักงานทุกคน ({workingEmployees.length})</option>
                                {workingEmployees.map(e => (
                                    <option key={e.emp.id} value={e.emp.id}>
                                        {e.emp.nickname || e.emp.name} ({e.emp.position})
                                    </option>
                                ))}
                            </select>
                        )}

                        {/* Print Button */}
                        <button 
                            type="button"
                            onClick={() => window.print()}
                            className="flex items-center gap-1.5 bg-rams-orange hover:bg-rams-orange-active text-rams-panel px-4 py-1.5 rounded-sm border border-rams-rule text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] active:shadow-none"
                        >
                            <Printer size={14} /> PRINT TO PDF
                        </button>
                    </div>
                </div>
            </div>

            {reportType === 'individual' ? <IndividualReport /> : <MasterReport />}
        </div>
    );
}

export default function PayrollPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-400 uppercase font-mono">Loading Report Engine...</div>}>
            <PayrollPDFReportContent />
        </Suspense>
    );
}


