"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { calculatePayroll } from "../../../../utils/payroll";
import { format, startOfMonth, endOfMonth, addDays } from "date-fns";
import { th } from "date-fns/locale";

function PayrollPDFReportContent() {
    const searchParams = useSearchParams();
    const monthParam = searchParams.get('month') || format(new Date(), 'yyyy-MM');
    const typeParam = searchParams.get('type') || 'master'; // 'master' | 'individual'
    
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchData = async () => {
            const [year, month] = monthParam.split('-');
            const startDate = startOfMonth(new Date(year, month - 1));
            const endDate = endOfMonth(startDate);
            const startStr = format(startDate, 'yyyy-MM-dd');
            const endStr = format(endDate, 'yyyy-MM-dd');

            const [empRes, shiftRes, transRes, logRes, schedRes, deductRes] = await Promise.all([
                supabase.from('employees').select('*'),
                supabase.from('shifts').select('*'),
                supabase.from('roster_transactions').select('*').gte('date', startStr).lte('date', endStr), // Query all override transactions
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

    if (loading) return <div className="p-20 text-center font-bold tracking-widest text-slate-300">GENERATING PAYROLL REPORT...</div>;

    const totalSalary = payrollData.reduce((sum, item) => sum + item.totalSalary, 0);
    const totalOT = payrollData.reduce((sum, item) => sum + item.totalOTPay, 0);
    const totalNet = payrollData.reduce((sum, item) => sum + item.netSalary, 0);

    const printDateStr = format(new Date(monthParam + '-01'), 'MMMM yyyy', { locale: th });

    const MasterReport = () => (
        <div className="min-h-screen bg-white text-black p-8 md:p-16 font-mono">
            <div className="flex justify-between items-center border-b-2 border-black pb-8 mb-12">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-12 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-2xl font-bold tracking-widest leading-none mb-1">IN THE HAUS</h1>
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-60">Master Payroll Report</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold tracking-tight">{printDateStr}</div>
                    <div className="text-[9px] font-bold tracking-widest uppercase opacity-50">Report Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                <div className="border-2 border-black p-6 bg-white rounded-none">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-50 mb-2">Total Salary</p>
                    <p className="text-3xl font-bold tracking-tight">฿{totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border-2 border-black p-6 bg-white rounded-none">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-50 mb-2">Total OT</p>
                    <p className="text-3xl font-bold tracking-tight">฿{totalOT.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border-2 border-black p-6 bg-white rounded-none">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-50 mb-2">Net Payout</p>
                    <p className="text-3xl font-bold tracking-tight">฿{totalNet.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            <div className="space-y-1">
                <div className="grid grid-cols-12 gap-4 pb-3 border-b border-black text-[9px] font-bold tracking-widest uppercase opacity-60">
                    <div className="col-span-3">Employee</div>
                    <div className="col-span-2 text-center">Days</div>
                    <div className="col-span-2 text-center">Reg/OT Hrs</div>
                    <div className="col-span-2 text-right">Base Pay</div>
                    <div className="col-span-1 text-right">OT Pay</div>
                    <div className="col-span-2 text-right">Net Pay</div>
                </div>

                {payrollData.filter(d => d.workDays > 0).map((item) => (
                    <div key={item.emp.id} className="grid grid-cols-12 gap-4 py-4 border-b border-black/10 hover:bg-slate-50 transition-colors items-center text-xs">
                        <div className="col-span-3">
                            <p className="font-bold">{item.emp.nickname || item.emp.name}</p>
                            <p className="text-[9px] font-semibold uppercase tracking-tight text-black/60">{item.emp.position}</p>
                        </div>
                        <div className="col-span-2 text-center font-bold">
                            {item.workDays}
                        </div>
                        <div className="col-span-2 text-center text-[11px] font-medium">
                            {item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)}
                        </div>
                        <div className="col-span-2 text-right font-medium">
                            {item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-1 text-right font-bold text-rams-orange">
                            {item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-2 text-right font-bold">
                            {item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-20 pt-8 border-t border-black/20">
                <div className="flex justify-between items-end">
                    <div className="max-w-sm">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-3 opacity-50">Verification</p>
                        <p className="text-[9px] leading-relaxed opacity-50">
                            This document is generated by Yuzu AI for In The Haus based on Roster and Time Attendance Logs.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold italic tracking-widest uppercase">YUZU x IN THE HAUS</p>
                        <p className="text-[9px] font-bold opacity-30">© {new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </div>
        </div>
    );

    const IndividualReport = () => (
        <div className="bg-white min-h-screen py-8 font-mono">
            {payrollData.filter(d => d.workDays > 0).map((item, index) => (
                <div key={item.emp.id} className="print-page bg-white text-black p-12 max-w-4xl mx-auto mb-8 rounded-none border-2 border-black shadow-none">
                    {/* Payslip Header */}
                    <div className="flex justify-between items-center border-b-2 border-black pb-6 mb-8">
                        <div className="flex items-center gap-4">
                            <img src="/logo.png" className="h-12 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                            <div>
                                <h1 className="text-2xl font-bold tracking-widest leading-none mb-1">IN THE HAUS</h1>
                                <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-60">Payslip / สลิปเงินเดือน</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-2xl font-bold tracking-tight">{printDateStr}</div>
                            <div className="text-xs font-bold tracking-widest uppercase opacity-50 mt-1">
                                {item.emp.name} ({item.emp.nickname})
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8 border border-black p-6 rounded-none bg-rams-panel">
                        <div>
                            <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-60 mb-1">Employee Info</p>
                            <p className="font-bold text-base">{item.emp.name}</p>
                            <p className="text-xs text-black/80">{item.emp.position}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-60 mb-1">Summary</p>
                            <p className="text-xs text-black/80">Total Work Days: <span className="font-bold text-black">{item.workDays}</span></p>
                            <p className="text-xs text-black/80">Total Hours (Reg / OT): <span className="font-bold text-black">{item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)}</span></p>
                        </div>
                    </div>

                    <div className="mb-10">
                        <h3 className="text-xs font-bold tracking-[0.2em] uppercase opacity-60 mb-4 border-b border-black pb-2">Daily Attendance Breakdown</h3>
                        <table className="w-full text-xs text-left border-collapse">
                            <thead className="text-black bg-rams-bg font-mono uppercase text-[9px] tracking-wider border-b border-black">
                                <tr>
                                    <th className="py-2 px-2">Date</th>
                                    <th className="py-2 px-2">Shift</th>
                                    <th className="py-2 px-2">Sch. In-Out</th>
                                    <th className="py-2 px-2">Act. In-Out</th>
                                    <th className="py-2 px-2">Status</th>
                                    <th className="py-2 px-2 text-right">Reg Hrs</th>
                                    <th className="py-2 px-2 text-right">OT Hrs</th>
                                    <th className="py-2 px-2 text-right">Base Pay</th>
                                    <th className="py-2 px-2 text-right">OT Pay</th>
                                    <th className="py-2 px-2 text-right">Total (฿)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-black/10">
                                {item.dailyDetails.map((d, i) => {
                                    const isOff = d.shift === 'OFF' || d.status === 'Off Day';
                                    const isAbsent = d.status?.includes('Absent');
                                    const isLate = d.status?.includes('Late');
                                    const isUnscheduled = d.status === 'Unscheduled Work';
                                    const isIncomplete = d.status?.includes('Incomplete');

                                    let statusColor = 'text-rams-green';
                                    if (isOff) statusColor = 'text-rams-ink-muted';
                                    else if (isAbsent || isLate) statusColor = 'text-rams-red';
                                    else if (isIncomplete) statusColor = 'text-rams-amber';
                                    else if (isUnscheduled) statusColor = 'text-rams-orange';

                                    return (
                                        <tr key={i} className={`hover:bg-rams-bg/50 ${isOff ? 'text-rams-ink-muted bg-rams-bg/10' : 'text-black'}`}>
                                            <td className="py-1.5 px-2 font-mono">{d.date.slice(5)}</td>
                                            <td className="py-1.5 px-2">{d.shift}</td>
                                            <td className={`py-1.5 px-2 font-mono ${isOff ? 'text-rams-ink-muted' : 'font-bold'}`}>{d.scheduled_in ? `${d.scheduled_in}-${d.scheduled_out}` : '-'}</td>
                                            <td className={`py-1.5 px-2 font-mono font-bold ${isOff ? 'text-rams-ink-muted' : ''}`}>{d.in !== '-' || d.out !== '-' ? `${d.in}-${d.out}` : '-'}</td>
                                            <td className={`py-1.5 px-2 font-bold ${statusColor}`}>{d.status}</td>
                                            <td className={`py-1.5 px-2 text-right font-mono font-semibold ${isOff ? 'text-rams-ink-muted' : ''}`}>{d.regular_hours > 0 ? Number(d.regular_hours).toFixed(1) : '-'}</td>
                                            <td className={`py-1.5 px-2 text-right font-mono ${isOff ? 'text-rams-ink-muted' : 'text-rams-orange font-medium'}`}>{d.ot_hours > 0 ? Number(d.ot_hours).toFixed(1) : '-'}</td>
                                            <td className={`py-1.5 px-2 text-right font-mono font-semibold ${isOff ? 'text-rams-ink-muted' : ''}`}>{d.wage > 0 ? d.wage.toLocaleString('th-TH', {minimumFractionDigits:2}) : '-'}</td>
                                            <td className={`py-1.5 px-2 text-right font-mono ${isOff ? 'text-rams-ink-muted' : 'text-rams-orange font-medium'}`}>{d.ot > 0 ? d.ot.toLocaleString('th-TH', {minimumFractionDigits:2}) : '-'}</td>
                                            <td className={`py-1.5 px-2 text-right font-mono font-bold ${isOff ? 'text-rams-ink-muted' : ''}`}>
                                                {(d.wage + d.ot) > 0 ? (d.wage + d.ot).toLocaleString('th-TH', {minimumFractionDigits:2}) : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Earnings & Deductions Box */}
                    <div className="mt-10 border-t-2 border-black pt-6">
                        <div className="grid grid-cols-2 gap-8">
                            <div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm font-bold text-black/80">Base Salary</span>
                                    <span className="text-sm font-mono font-bold">฿{item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm font-bold text-black/80">Overtime (OT) Pay</span>
                                    <span className="text-sm font-mono font-bold">฿{item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between border-b border-black pb-2 mb-2">
                                    <span className="text-sm font-bold text-black/80">Deductions (Late/Absent)</span>
                                    <span className="text-sm font-mono font-bold text-rams-red">-฿{item.totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div className="bg-rams-ink text-rams-panel p-6 rounded-none flex flex-col justify-center border-2 border-rams-ink">
                                <span className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-70 mb-1">Net Pay / รับสุทธิ</span>
                                <span className="text-3xl font-bold tracking-tight">฿{item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        <div className="mt-8 text-center border-t border-black/10 pt-4">
                             <p className="text-[9px] font-bold tracking-widest text-rams-ink-muted uppercase">YUZU PAYROLL ENGINE x IN THE HAUS</p>
                        </div>
                    </div>
                </div>
            ))}
        </div>
    );

    return (
        <>
            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { 
                        padding: 0; 
                        background: white;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-page { 
                        page-break-after: always; 
                        box-shadow: none !important; 
                        margin: 0 !important; 
                        padding: 20px !important; 
                        min-height: auto !important;
                    }
                    /* Remove background colors and make it printer friendly */
                    .bg-white { background: white !important; }
                }
            `}</style>
            
            <button 
                onClick={() => window.print()}
                className="fixed bottom-8 right-8 no-print bg-black border border-black text-white px-8 py-4 rounded-none font-bold text-xs tracking-widest uppercase hover:bg-white hover:text-black transition-all cursor-pointer shadow-none z-50"
            >
                Print to PDF
            </button>

            {typeParam === 'individual' ? <IndividualReport /> : <MasterReport />}
        </>
    );
}

export default function PayrollPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-300 uppercase">Loading Report Engine...</div>}>
            <PayrollPDFReportContent />
        </Suspense>
    );
}
