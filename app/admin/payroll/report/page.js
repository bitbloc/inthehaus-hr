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

    if (loading) return <div className="p-20 text-center font-bold tracking-widest font-mono text-neutral-400">GENERATING PAYROLL REPORT...</div>;

    const totalSalary = payrollData.reduce((sum, item) => sum + item.totalSalary, 0);
    const totalOT = payrollData.reduce((sum, item) => sum + item.totalOTPay, 0);
    const totalNet = payrollData.reduce((sum, item) => sum + item.netSalary, 0);

    const printDateStr = format(new Date(monthParam + '-01'), 'MMMM yyyy', { locale: th });

    const MasterReport = () => (
        <div className="min-h-screen bg-[#fafaf9] text-neutral-900 p-8 md:p-16 font-mono selection:bg-neutral-900 selection:text-white">
            <div className="flex justify-between items-center border-b-2 border-neutral-900 pb-8 mb-12">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-12 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-xl font-bold tracking-widest leading-none mb-1">IN THE HAUS</h1>
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-500">Master Payroll Report</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xl font-bold tracking-tight text-neutral-800 uppercase">{printDateStr}</div>
                    <div className="text-[8px] font-bold tracking-widest uppercase text-neutral-400 mt-1">Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="border border-neutral-300 bg-white p-6 rounded-2xl flex flex-col justify-between">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Total Base Salary</p>
                    <p className="text-2xl font-bold tracking-tight text-neutral-900">฿{totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border border-neutral-300 bg-white p-6 rounded-2xl flex flex-col justify-between">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Total OT Pay</p>
                    <p className="text-2xl font-bold tracking-tight text-neutral-900">฿{totalOT.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border border-neutral-300 bg-white p-6 rounded-2xl flex flex-col justify-between">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Net Payout / ยอดจ่ายสุทธิ</p>
                    <p className="text-2xl font-bold tracking-tight text-neutral-900">฿{totalNet.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
            </div>

            <div className="border border-neutral-200 bg-white rounded-3xl p-6 md:p-8 space-y-4">
                <div className="grid grid-cols-12 gap-4 pb-3 border-b border-neutral-200 text-[9px] font-bold tracking-widest uppercase text-neutral-400">
                    <div className="col-span-3">Employee</div>
                    <div className="col-span-2 text-center">Days</div>
                    <div className="col-span-2 text-center">Reg/OT Hrs</div>
                    <div className="col-span-2 text-right">Base Pay</div>
                    <div className="col-span-1 text-right">OT Pay</div>
                    <div className="col-span-2 text-right">Net Pay</div>
                </div>

                <div className="divide-y divide-neutral-100">
                    {payrollData.filter(d => d.workDays > 0).map((item) => (
                        <div key={item.emp.id} className="grid grid-cols-12 gap-4 py-4 hover:bg-neutral-50 transition-colors items-center text-xs">
                            <div className="col-span-3">
                                <p className="font-bold text-neutral-800">{item.emp.nickname || item.emp.name}</p>
                                <p className="text-[9px] font-semibold uppercase tracking-tight text-neutral-400">{item.emp.position}</p>
                            </div>
                            <div className="col-span-2 text-center font-bold text-neutral-800">
                                {item.workDays}
                            </div>
                            <div className="col-span-2 text-center text-[11px] font-medium text-neutral-600">
                                {item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)}
                            </div>
                            <div className="col-span-2 text-right font-medium text-neutral-800">
                                {item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="col-span-1 text-right font-bold text-rams-orange">
                                {item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </div>
                            <div className="col-span-2 text-right font-bold text-neutral-900">
                                {item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
            
            <div className="mt-20 pt-8 border-t border-neutral-200">
                <div className="flex justify-between items-end flex-wrap gap-4">
                    <div className="max-w-sm">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-2 text-neutral-400">Verification & Archives</p>
                        <p className="text-[9px] leading-relaxed text-neutral-400">
                            This document is generated by Yuzu AI for In The Haus based on Roster and Time Attendance Logs.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold italic tracking-widest uppercase text-neutral-700">YUZU x IN THE HAUS</p>
                        <p className="text-[9px] font-bold text-neutral-400 mt-1">ONHAUS SYSTEM © {new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </div>
        </div>
    );

    const IndividualReport = () => (
        <div className="bg-[#fafaf9] min-h-screen py-8 font-mono selection:bg-neutral-900 selection:text-white">
            {payrollData.filter(d => d.workDays > 0).map((item, index) => (
                <div key={item.emp.id} className="print-page bg-white text-neutral-900 p-8 md:p-12 max-w-4xl mx-auto mb-12 rounded-3xl border border-neutral-200 shadow-none">
                    {/* Payslip Header */}
                    <div className="flex justify-between items-center border-b-2 border-neutral-900 pb-6 mb-8">
                        <div className="flex items-center gap-4">
                            <img src="/logo.png" className="h-12 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                            <div>
                                <h1 className="text-xl font-bold tracking-widest leading-none mb-1">IN THE HAUS</h1>
                                <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-500">Payslip / สลิปเงินเดือน</p>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-xl font-bold tracking-tight text-neutral-800">{printDateStr}</div>
                            <div className="text-[9px] font-bold tracking-widest uppercase text-neutral-400 mt-1">
                                {item.emp.name} ({item.emp.nickname})
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-8 mb-8 border border-neutral-200 p-6 rounded-2xl bg-[#fafaf9]">
                        <div>
                            <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-1">Employee Info</p>
                            <p className="font-bold text-base text-neutral-800">{item.emp.name}</p>
                            <p className="text-xs text-neutral-600">{item.emp.position}</p>
                        </div>
                        <div className="text-right">
                            <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-1">Summary</p>
                            <p className="text-xs text-neutral-600">Total Work Days: <span className="font-bold text-neutral-800">{item.workDays}</span></p>
                            <p className="text-xs text-neutral-600">Total Hours (Reg / OT): <span className="font-bold text-neutral-800">{item.totalRegularHours.toFixed(1)} / {item.totalOTHours.toFixed(1)}</span></p>
                        </div>
                    </div>

                    <div className="mb-10 overflow-hidden border border-neutral-200 rounded-2xl">
                        <table className="w-full text-xs text-left border-collapse">
                            <thead className="bg-[#fafaf9] font-mono uppercase text-[9px] tracking-wider text-neutral-500 border-b border-neutral-200">
                                <tr>
                                    <th className="py-2.5 px-3">Date</th>
                                    <th className="py-2.5 px-3">Shift</th>
                                    <th className="py-2.5 px-3">Sch. In-Out</th>
                                    <th className="py-2.5 px-3">Act. In-Out</th>
                                    <th className="py-2.5 px-3">Status</th>
                                    <th className="py-2.5 px-3 text-right">Reg</th>
                                    <th className="py-2.5 px-3 text-right">OT</th>
                                    <th className="py-2.5 px-3 text-right">Base Pay</th>
                                    <th className="py-2.5 px-3 text-right">OT Pay</th>
                                    <th className="py-2.5 px-3 text-right">Total (฿)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-neutral-100 bg-white">
                                {item.dailyDetails.map((d, i) => {
                                    const isOff = d.shift === 'OFF' || d.status === 'Off Day';
                                    const isAbsent = d.status?.includes('Absent');
                                    const isLate = d.status?.includes('Late');
                                    const isUnscheduled = d.status === 'Unscheduled Work';
                                    const isIncomplete = d.status?.includes('Incomplete');

                                    let statusColor = 'text-rams-green font-semibold';
                                    if (isOff) statusColor = 'text-neutral-400';
                                    else if (isAbsent || isLate) statusColor = 'text-rams-red font-bold';
                                    else if (isIncomplete) statusColor = 'text-rams-amber font-semibold';
                                    else if (isUnscheduled) statusColor = 'text-rams-orange font-semibold';

                                    return (
                                        <tr key={i} className={`hover:bg-neutral-50 ${isOff ? 'text-neutral-400 bg-neutral-50/50' : 'text-neutral-800'}`}>
                                            <td className="py-2 px-3 font-mono">{d.date.slice(5)}</td>
                                            <td className="py-2 px-3 font-medium">{d.shift}</td>
                                            <td className={`py-2 px-3 font-mono ${isOff ? 'text-neutral-400' : 'font-bold'}`}>{d.scheduled_in ? `${d.scheduled_in}-${d.scheduled_out}` : '-'}</td>
                                            <td className={`py-2 px-3 font-mono font-bold ${isOff ? 'text-neutral-400' : ''}`}>{d.in !== '-' || d.out !== '-' ? `${d.in}-${d.out}` : '-'}</td>
                                            <td className={`py-2 px-3 text-[10px] ${statusColor}`}>{d.status}</td>
                                            <td className={`py-2 px-3 text-right font-mono font-semibold ${isOff ? 'text-neutral-400' : 'text-neutral-700'}`}>{d.regular_hours > 0 ? Number(d.regular_hours).toFixed(1) : '-'}</td>
                                            <td className={`py-2 px-3 text-right font-mono ${isOff ? 'text-neutral-400' : 'text-rams-orange font-medium'}`}>{d.ot_hours > 0 ? Number(d.ot_hours).toFixed(1) : '-'}</td>
                                            <td className={`py-2 px-3 text-right font-mono font-semibold ${isOff ? 'text-neutral-400' : 'text-neutral-700'}`}>{d.wage > 0 ? d.wage.toLocaleString('th-TH', {minimumFractionDigits:2}) : '-'}</td>
                                            <td className={`py-2 px-3 text-right font-mono ${isOff ? 'text-neutral-400' : 'text-rams-orange font-medium'}`}>{d.ot > 0 ? d.ot.toLocaleString('th-TH', {minimumFractionDigits:2}) : '-'}</td>
                                            <td className={`py-2 px-3 text-right font-mono font-bold ${isOff ? 'text-neutral-400' : 'text-neutral-800'}`}>
                                                {(d.wage + d.ot) > 0 ? (d.wage + d.ot).toLocaleString('th-TH', {minimumFractionDigits:2}) : '-'}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    {/* Earnings & Deductions Box */}
                    <div className="mt-10 border-t border-neutral-200 pt-6">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="space-y-2">
                                <div className="flex justify-between">
                                    <span className="text-xs font-semibold text-neutral-600">Base Salary</span>
                                    <span className="text-xs font-mono font-bold text-neutral-800">฿{item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span className="text-xs font-semibold text-neutral-600">Overtime (OT) Pay</span>
                                    <span className="text-xs font-mono font-bold text-neutral-800">฿{item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                                <div className="flex justify-between border-b border-neutral-200 pb-2">
                                    <span className="text-xs font-semibold text-neutral-600">Deductions (Late/Absent)</span>
                                    <span className="text-xs font-mono font-bold text-rams-red">-฿{item.totalDeduct.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                                </div>
                            </div>
                            <div className="bg-neutral-900 text-white p-6 rounded-2xl flex flex-col justify-center border border-neutral-900">
                                <span className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-70 mb-1">Net Pay / รับสุทธิ</span>
                                <span className="text-2xl font-bold tracking-tight">฿{item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</span>
                            </div>
                        </div>
                        <div className="mt-12 text-center border-t border-neutral-200 pt-6 flex flex-col items-center">
                             <p className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase">YUZU PAYROLL ENGINE x IN THE HAUS</p>
                             <p className="text-[9px] font-bold text-neutral-400 mt-1">ONHAUS SYSTEM © {new Date().getFullYear()} All Rights Reserved</p>
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
                        padding: 0 !important; 
                        margin: 0 !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                    .print-page { 
                        page-break-after: always; 
                        box-shadow: none !important; 
                        margin: 0 !important; 
                        padding: 20px !important; 
                        min-height: auto !important;
                        border: none !important;
                        border-radius: 0 !important;
                    }
                }
            `}</style>
            
            <button 
                onClick={() => window.print()}
                className="fixed bottom-8 right-8 no-print bg-neutral-900 border border-neutral-900 text-white px-8 py-4 rounded-xl font-bold text-xs tracking-widest uppercase hover:bg-white hover:text-neutral-900 transition-all cursor-pointer shadow-md z-50"
            >
                Print to PDF
            </button>

            {typeParam === 'individual' ? <IndividualReport /> : <MasterReport />}
        </>
    );
}

export default function PayrollPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-400 uppercase font-mono">Loading Report Engine...</div>}>
            <PayrollPDFReportContent />
        </Suspense>
    );
}

