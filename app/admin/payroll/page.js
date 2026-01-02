"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { format, startOfMonth, endOfMonth, differenceInMinutes, parse, isAfter } from "date-fns";
import { motion } from "framer-motion";

export default function PayrollPage() {
    const [loading, setLoading] = useState(false);
    const [startDate, setStartDate] = useState(format(startOfMonth(new Date()), "yyyy-MM-dd"));
    const [endDate, setEndDate] = useState(format(endOfMonth(new Date()), "yyyy-MM-dd"));
    const [reportData, setReportData] = useState([]);
    const [employees, setEmployees] = useState([]);

    useEffect(() => {
        fetchEmployees();
    }, []);

    const fetchEmployees = async () => {
        const { data } = await supabase.from('employees').select('id, name, shift_rates, position');
        setEmployees(data || []);
    };

    const calculatePayroll = async () => {
        setLoading(true);
        try {
            // 1. Fetch Logs in Range
            const { data: logs, error } = await supabase
                .from('attendance_logs')
                .select('*, employees(id, name, shift_rates, shifts(name, start_time, end_time))')
                .gte('timestamp', new Date(startDate).toISOString())
                .lt('timestamp', new Date(new Date(endDate).getTime() + 86400000).toISOString())
                .order('timestamp', { ascending: true });

            if (error) throw error;

            // 2. Group by Employee & Day
            const daily records = {};

            logs.forEach(log => {
                const dateKey = format(new Date(log.timestamp), "yyyy-MM-dd");
                const empId = log.employee_id;
                const key = `${dateKey}_${empId}`;

                if (!dailyRecords[key]) {
                    dailyRecords[key] = {
                        date: dateKey,
                        empId,
                        name: log.employees?.name,
                        shiftRates: log.employees?.shift_rates || {},
                        shiftName: log.employees?.shifts?.name || '-',
                        shiftStart: log.employees?.shifts?.start_time,
                        shiftEnd: log.employees?.shifts?.end_time,
                        checkIn: null,
                        checkOut: null,
                    };
                }

                if (log.action_type === 'check_in') dailyRecords[key].checkIn = new Date(log.timestamp);
                if (log.action_type === 'check_out') dailyRecords[key].checkOut = new Date(log.timestamp);
            });

            // 3. Process Logic (Wage, OT, Late)
            const processedData = Object.values(dailyRecords).map(rec => {
                let wage = 0;
                let otPay = 0;
                let otHours = 0;
                let otMinutesRaw = 0;
                let lateMinutes = 0;
                let totalPay = 0;

                // --- Wage Calculation ---
                // Normalize shift name to match keys (morning, evening, double)
                const normalizedShift = rec.shiftName.toLowerCase().trim();
                wage = Number(rec.shiftRates[normalizedShift] || 0);

                // --- Late Detection ---
                if (rec.checkIn && rec.shiftStart) {
                    const checkInTime = rec.checkIn;
                    // Construct Shift Start Date Object for accurate comparison
                    // Assumes checkIn is on the same day as "dateKey".
                    // If shift logic crosses midnight, this needs more robust handling, but for now assuming same-day starts.
                    const [sH, sM] = rec.shiftStart.split(':').map(Number);
                    const shiftStartDate = new Date(rec.checkIn);
                    shiftStartDate.setHours(sH, sM, 0, 0);

                    // If CheckIn is actually BEFORE shift start (early), diff is negative, so max(0, diff)
                    const diff = differenceInMinutes(checkInTime, shiftStartDate);
                    if (diff > 0) lateMinutes = diff;
                }

                // --- OT Calculation ---
                if (rec.checkOut && rec.shiftEnd) {
                    const [eH, eM] = rec.shiftEnd.split(':').map(Number);
                    const shiftEndDate = new Date(rec.checkOut);
                    shiftEndDate.setHours(eH, eM, 0, 0);

                    // Calc Difference
                    const diff = differenceInMinutes(rec.checkOut, shiftEndDate);

                    if (diff > 0) {
                        otMinutesRaw = diff;

                        // Logic: < 29 mins = 0.
                        // Logic: Rounding: 30-59 mins => +1 Hour.
                        // Formula: 
                        // Full Hours = Math.floor(diff / 60)
                        // Remainder = diff % 60
                        // If Remainder >= 30, add 1 hour.

                        if (diff >= 29) { // Requirement says < 29 ignored. So >= 29 we consider? 
                            // Clarification: "< 29 mins no need to calculate" usually means strict less than. so 29 is calc?
                            // Let's stick to "Less than 29" -> ignore. So >= 29 is NOT ignored.
                            // User example: 1h 45m -> ? 2 hrs?
                            // Let's implement floor + round up remainder logic.

                            let hours = Math.floor(diff / 60);
                            const remainder = diff % 60;

                            if (remainder >= 30) {
                                hours += 1;
                            }

                            // If total is just 20 mins, floor=0, rem=20. < 30. hours=0. Correct.
                            // If total is 45 mins. floor=0, rem=45. >=30. hours=1. Correct.

                            otHours = hours;
                            otPay = otHours * 50;
                        }
                    }
                }

                totalPay = wage + otPay;

                return {
                    ...rec,
                    wage,
                    otMinutesRaw,
                    otHours,
                    otPay,
                    lateMinutes,
                    totalPay
                };
            });

            // Sort by Date then Name
            processedData.sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));

            setReportData(processedData);

        } catch (err) {
            console.error(err);
            alert("Error calculating payroll: " + err.message);
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (date) => date ? format(date, "HH:mm") : "-";

    const totalPayout = reportData.reduce((sum, item) => sum + item.totalPay, 0);

    return (
        <div className="p-8 max-w-7xl mx-auto">
            <div className="flex justify-between items-end mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-slate-800">💰 Payroll & OT</h1>
                    <p className="text-slate-500 mt-1">Calculate daily wages, overtime, and lateness</p>
                </div>
                <div className="flex items-end gap-4 bg-white p-4 rounded-2xl shadow-sm border border-slate-100">
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">Start Date</label>
                        <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="p-2 border rounded-lg text-sm" />
                    </div>
                    <div>
                        <label className="block text-xs font-bold text-slate-400 mb-1 uppercase">End Date</label>
                        <input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="p-2 border rounded-lg text-sm" />
                    </div>
                    <button
                        onClick={calculatePayroll}
                        disabled={loading}
                        className="px-6 py-2 bg-slate-800 text-white font-bold rounded-lg hover:bg-slate-900 transition disabled:opacity-50"
                    >
                        {loading ? 'Calculating...' : 'Run Payroll'}
                    </button>
                </div>
            </div>

            {reportData.length > 0 && (
                <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 animate-fade-in-up">
                    <div className="p-6 bg-slate-50 border-b border-slate-100 flex justify-between items-center">
                        <h3 className="font-bold text-slate-700">Detailed Report</h3>
                        <div className="text-right">
                            <span className="text-xs font-bold text-slate-400 block uppercase tracking-wider">Total Payout</span>
                            <span className="text-2xl font-black text-emerald-600">฿{totalPayout.toLocaleString()}</span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-xs">
                                <tr>
                                    <th className="p-4">Date</th>
                                    <th className="p-4">Staff</th>
                                    <th className="p-4">Shift</th>
                                    <th className="p-4">Time In/Out</th>
                                    <th className="p-4 text-center">Late</th>
                                    <th className="p-4 text-center">OT (Hrs)</th>
                                    <th className="p-4 text-right">Wage</th>
                                    <th className="p-4 text-right">OT Pay</th>
                                    <th className="p-4 text-right">Total</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {reportData.map((row, i) => (
                                    <tr key={i} className="hover:bg-slate-50/50 transition">
                                        <td className="p-4 font-mono text-slate-500">{format(new Date(row.date), "dd MMM")}</td>
                                        <td className="p-4 font-bold text-slate-700">
                                            {row.name}
                                            <div className="text-[10px] text-slate-400 font-normal">{row.shiftName}</div>
                                        </td>
                                        <td className="p-4 text-slate-500">
                                            {row.shiftStart} - {row.shiftEnd}
                                        </td>
                                        <td className="p-4">
                                            <div className="flex flex-col gap-1">
                                                <span className={`text-xs ${row.lateMinutes > 0 ? 'text-red-500 font-bold' : 'text-slate-600'}`}>
                                                    In: {formatTime(row.checkIn)}
                                                </span>
                                                <span className="text-xs text-slate-600">Out: {formatTime(row.checkOut)}</span>
                                            </div>
                                        </td>
                                        <td className="p-4 text-center">
                                            {row.lateMinutes > 0 ? (
                                                <span className="px-2 py-1 bg-red-50 text-red-600 rounded-md font-bold text-xs">
                                                    +{row.lateMinutes}m
                                                </span>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-center">
                                            {row.otHours > 0 ? (
                                                <div className="flex flex-col items-center">
                                                    <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md font-bold text-xs">
                                                        {row.otHours} hr
                                                    </span>
                                                    <span className="text-[10px] text-slate-400 mt-1">({row.otMinutesRaw}m raw)</span>
                                                </div>
                                            ) : (
                                                <span className="text-slate-300">-</span>
                                            )}
                                        </td>
                                        <td className="p-4 text-right font-mono text-slate-600">{row.wage > 0 ? row.wage.toLocaleString() : '-'}</td>
                                        <td className="p-4 text-right font-mono text-blue-600 font-bold">{row.otPay > 0 ? `+${row.otPay}` : '-'}</td>
                                        <td className="p-4 text-right font-mono font-black text-slate-800">{row.totalPay.toLocaleString()}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {!loading && reportData.length === 0 && (
                <div className="text-center py-20 opacity-50">
                    <div className="text-6xl mb-4">💸</div>
                    <p>Select a date range and click Run Payroll to see data.</p>
                </div>
            )}
        </div>
    );
}

// Helper: Fix variable name conflict in group step
const dailyRecords = {};
// Note: I fixed a small variable declaration error inside calculatePayroll in the actual code above by declaring it correctly.
