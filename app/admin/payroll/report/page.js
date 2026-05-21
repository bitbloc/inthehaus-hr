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
        <div className="min-h-screen bg-white text-black p-8 md:p-16 font-sans">
            <div className="flex justify-between items-start border-b-4 border-black pb-8 mb-12">
                <div>
                    <h1 className="text-6xl font-black tracking-tighter leading-none mb-2">IN THE HAUS</h1>
                    <p className="text-xs font-bold tracking-[0.3em] uppercase opacity-50">Master Payroll Report</p>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-black tracking-tighter">{printDateStr}</div>
                    <div className="text-[10px] font-bold tracking-widest uppercase opacity-40">Report Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-16">
                <div className="border-l-8 border-black pl-6 py-2">
                    <p className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 mb-2">Total Salary</p>
                    <p className="text-4xl font-black tracking-tighter">฿{totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border-l-8 border-black pl-6 py-2">
                    <p className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 mb-2">Total OT</p>
                    <p className="text-4xl font-black tracking-tighter">฿{totalOT.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border-l-8 border-black pl-6 py-2 bg-gray-50">
                    <p className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 mb-2">Net Payout</p>
                    <p className="text-4xl font-black text-green-600 tracking-tighter">฿{totalNet.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            <div className="space-y-1">
                <div className="grid grid-cols-12 gap-4 pb-4 border-b-2 border-black text-[10px] font-black tracking-widest uppercase opacity-40">
                    <div className="col-span-3">Employee</div>
                    <div className="col-span-2 text-center">Days</div>
                    <div className="col-span-2 text-center">Reg/OT Hrs</div>
                    <div className="col-span-2 text-right">Base Pay</div>
                    <div className="col-span-1 text-right">OT Pay</div>
                    <div className="col-span-2 text-right text-black">Net Pay</div>
                </div>

                {payrollData.filter(d => d.workDays > 0).map((item) => (
                    <div key={item.emp.id} className="grid grid-cols-12 gap-4 py-4 border-b border-slate-100 hover:bg-slate-50 items-center">
                        <div className="col-span-3">
                            <p className="text-sm font-black tracking-tight">{item.emp.nickname || item.emp.name}</p>
                            <p className="text-[9px] font-bold uppercase tracking-tight text-slate-500">{item.emp.position}</p>
                        </div>
                        <div className="col-span-2 text-center font-mono text-xs font-bold text-slate-600">
                            {item.workDays}
                        </div>
                        <div className="col-span-2 text-center font-mono text-[10px] text-slate-500">
                            {item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)}
                        </div>
                        <div className="col-span-2 text-right font-mono text-xs text-slate-600">
                            {item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-1 text-right font-mono text-xs text-orange-600">
                            {item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </div>
                        <div className="col-span-2 text-right text-base font-black tracking-tight text-green-600">
                            {item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                        </div>
                    </div>
                ))}
            </div>
            
            <div className="mt-20 pt-8 border-t border-slate-200">
                <div className="flex justify-between items-end">
                    <div className="max-w-sm">
                        <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-4 opacity-40">Verification</p>
                        <p className="text-[10px] leading-relaxed text-slate-400">
                            This document is generated by Yuzu AI for In The Haus based on Roster and Time Attendance Logs.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-black italic tracking-widest">YUZU x IN THE HAUS</p>
                        <p className="text-[10px] font-bold text-slate-300">© {new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </div>
        </div>
    );

    const IndividualReport = () => (
        <div className="bg-gray-100 min-h-screen py-8">
            {payrollData.filter(d => d.workDays > 0).map((item, index) => (
                <div key={item.emp.id} className="print-page bg-white text-gray-800 p-12 max-w-4xl mx-auto shadow-xl mb-8 rounded-xl border border-gray-200">
                    {/* Payslip Header */}
                    <div className="flex justify-between items-start border-b-4 border-black pb-6 mb-8">
                        <div>
                            <h1 className="text-5xl font-black tracking-tighter leading-none mb-1">IN THE HAUS</h1>
                            <p className="text-xs font-bold tracking-[0.3em] uppercase opacity-50">Payslip / สลิปเงินเดือน</p>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-black tracking-tighter">{printDateStr}</div>
                            <div className="text-xs font-bold tracking-widest uppercase opacity-40 mt-1">
                                {item.emp.name} ({item.emp.nickname})
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8 border border-gray-200 p-6 rounded-lg bg-gray-50">
                        <div>
                            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500 mb-1">Employee Info</p>
                            <p className="font-bold text-lg">{item.emp.name}</p>
                            <p className="text-sm text-gray-600">{item.emp.position}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[10px] font-bold tracking-[0.2em] uppercase text-gray-500 mb-1">Summary</p>
                            <p className="text-sm text-gray-600">Total Work Days: <span className="font-bold text-black">{item.workDays}</span></p>
                            <p className="text-sm text-gray-600">Total Hours (Reg / OT): <span className="font-bold text-black">{item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)}</span></p>
                        </div>
                    </div>

                    <div className="mb-10">
                        <h3 className="text-xs font-bold tracking-[0.2em] uppercase text-gray-500 mb-4 border-b border-gray-200 pb-2">Daily Attendance Breakdown</h3>
                        <table className="w-full text-xs text-left">
                            <thead className="text-gray-600 bg-gray-50 font-mono uppercase text-[9px] tracking-wider border-b border-gray-200">
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
                            <tbody className="divide-y divide-gray-100">
                                {item.dailyDetails.map((d, i) => {
                                    const isOff = d.shift === 'OFF' || d.status === 'Off Day';
                                    const isAbsent = d.status?.includes('Absent');
                                    const isLate = d.status?.includes('Late');
                                    const isUnscheduled = d.status === 'Unscheduled Work';
                                    const isIncomplete = d.status?.includes('Incomplete');

                                    let statusColor = 'text-green-600';
                                    if (isOff) statusColor = 'text-gray-400';
                                    else if (isAbsent || isLate) statusColor = 'text-red-500';
                                    else if (isIncomplete) statusColor = 'text-amber-600';
                                    else if (isUnscheduled) statusColor = 'text-blue-600';

                                    return (
                                        <tr key={i} className={`hover:bg-gray-50 ${isOff ? 'text-gray-400 bg-gray-50/20' : 'text-gray-800'}`}>
                                            <td className="py-1.5 px-2 font-mono">{d.date.slice(5)}</td>
                                            <td className="py-1.5 px-2">{d.shift}</td>
                                            <td className={`py-1.5 px-2 font-mono ${isOff ? 'text-gray-400' : 'text-gray-500'}`}>{d.scheduled_in ? `${d.scheduled_in}-${d.scheduled_out}` : '-'}</td>
                                            <td className="py-1.5 px-2 font-mono font-medium">{d.in !== '-' || d.out !== '-' ? `${d.in}-${d.out}` : '-'}</td>
                                            <td className={`py-1.5 px-2 font-bold ${statusColor}`}>{d.status}</td>
                                            <td className="py-1.5 px-2 text-right font-mono">{d.regular_hours > 0 ? Number(d.regular_hours).toFixed(1) : '-'}</td>
                                            <td className={`py-1.5 px-2 text-right font-mono ${isOff ? 'text-gray-400' : 'text-orange-600 font-medium'}`}>{d.ot_hours > 0 ? Number(d.ot_hours).toFixed(1) : '-'}</td>
                                            <td className="py-1.5 px-2 text-right font-mono">{d.wage > 0 ? d.wage.toLocaleString('th-TH', {minimumFractionDigits:2}) : '-'}</td>
                                            <td className={`py-1.5 px-2 text-right font-mono ${isOff ? 'text-gray-400' : 'text-orange-600 font-medium'}`}>{d.ot > 0 ? d.ot.toLocaleString('th-TH', {minimumFractionDigits:2}) : '-'}</td>
                                            <td className={`py-1.5 px-2 text-right font-mono font-bold ${isOff ? 'text-gray-400' : 'text-gray-800'}`}>
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
                                    <span className="text-sm font-bold text-gray-600">Base Salary</span>
                                    <span className="text-sm font-mono font-medium">฿{item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between mb-2">
                                    <span className="text-sm font-bold text-gray-600">Overtime (OT) Pay</span>
                                    <span className="text-sm font-mono font-medium">฿{item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between border-b border-gray-200 pb-2 mb-2">
                                    <span className="text-sm font-bold text-gray-600">Deductions (Late/Absent)</span>
                                    <span className="text-sm font-mono font-medium text-red-500">-฿{item.totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div className="bg-black text-white p-6 rounded-lg flex flex-col justify-center">
                                <span className="text-[10px] font-bold tracking-[0.2em] uppercase opacity-70 mb-1">Net Pay / รับสุทธิ</span>
                                <span className="text-4xl font-black tracking-tighter">฿{item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        <div className="mt-8 text-center border-t border-gray-200 pt-4">
                             <p className="text-[9px] font-bold tracking-widest text-gray-300 uppercase">YUZU PAYROLL ENGINE x IN THE HAUS</p>
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
                    body { padding: 0; background: white; }
                    .print-page { 
                        page-break-after: always; 
                        box-shadow: none !important; 
                        margin: 0 !important; 
                        padding: 20px !important; 
                        min-height: auto !important;
                    }
                    /* Remove background colors and make it printer friendly */
                    .bg-gray-100 { background: white !important; }
                }
            `}</style>
            
            <button 
                onClick={() => window.print()}
                className="fixed bottom-8 right-8 no-print bg-black text-white px-8 py-4 rounded-full font-bold text-xs tracking-widest uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all z-50"
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
