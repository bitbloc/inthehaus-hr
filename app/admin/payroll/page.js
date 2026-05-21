"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { calculatePayroll } from '../../../utils/payroll';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { th } from 'date-fns/locale';
import { FileText, Printer, ChevronLeft, ChevronRight } from 'lucide-react';

export default function PayrollDashboard() {
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [payrollData, setPayrollData] = useState([]);
    const [loading, setLoading] = useState(true);

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
            supabase.from('roster_transactions').select('*').gte('date', startStr).lte('date', endStr), // Query all draft & published overrides
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
                { hourly_rate: 50, ot_rate: 75 }, // Default config
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

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="mb-2">
                <a href="/admin" className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 w-fit transition-colors">
                    <ChevronLeft size={16} /> กลับสู่หน้าแดชบอร์ดหลัก
                </a>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">ระบบสรุปเงินเดือน (Payroll)</h1>
                    <p className="text-gray-500 text-sm">ประมวลผลจากตารางงาน (Roster) และเวลาเข้างานจริง</p>
                </div>
                
                <div className="flex gap-2">
                    <a 
                        href={`/admin/payroll/report?month=${selectedMonth}&type=master`} 
                        target="_blank"
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-black text-white rounded-lg text-sm font-medium transition-colors"
                    >
                        <FileText size={16} /> สรุปรวม (Master)
                    </a>
                    <a 
                        href={`/admin/payroll/report?month=${selectedMonth}&type=individual`} 
                        target="_blank"
                        className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                        <Printer size={16} /> พิมพ์สลิป (Payslips)
                    </a>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <p className="text-sm text-gray-500 mb-1">ยอดรวมที่ต้องจ่ายเดือนนี้</p>
                        <h3 className="text-3xl font-bold text-gray-800">฿{totalNetSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</h3>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center items-center">
                    <p className="text-sm text-gray-500 mb-2">เลือกเดือน</p>
                    <div className="flex items-center gap-4">
                        <button onClick={prevMonth} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full"><ChevronLeft size={20}/></button>
                        <span className="text-xl font-semibold w-32 text-center">
                            {format(new Date(selectedMonth + '-01'), 'MMMM yyyy', { locale: th })}
                        </span>
                        <button onClick={nextMonth} className="p-2 bg-gray-100 hover:bg-gray-200 rounded-full"><ChevronRight size={20}/></button>
                    </div>
                </div>
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
                    <p className="text-sm text-gray-500 mb-1">จำนวนพนักงานที่ทำงาน</p>
                    <h3 className="text-3xl font-bold text-gray-800">{payrollData.filter(d => d.workDays > 0).length} <span className="text-lg font-normal text-gray-500">คน</span></h3>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-12 text-center text-gray-500">กำลังประมวลผลข้อมูลเงินเดือน...</div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600 border-b border-gray-200">
                                <tr>
                                    <th className="px-6 py-4 font-semibold">พนักงาน</th>
                                    <th className="px-6 py-4 font-semibold text-center">วันทำงาน</th>
                                    <th className="px-6 py-4 font-semibold text-center">ชม.ปกติ</th>
                                    <th className="px-6 py-4 font-semibold text-center">OT (ชม.)</th>
                                    <th className="px-6 py-4 font-semibold text-center">สาย (ครั้ง)</th>
                                    <th className="px-6 py-4 font-semibold text-right">ค่าแรงปกติ</th>
                                    <th className="px-6 py-4 font-semibold text-right">ค่า OT</th>
                                    <th className="px-6 py-4 font-semibold text-right">ยอดสุทธิ (บาท)</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-100">
                                {payrollData.map(item => (
                                    <tr key={item.emp.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4">
                                            <div className="font-medium text-gray-800">{item.emp.nickname || item.emp.name}</div>
                                            <div className="text-xs text-gray-400">{item.emp.position}</div>
                                        </td>
                                        <td className="px-6 py-4 text-center">{item.workDays}</td>
                                        <td className="px-6 py-4 text-center text-blue-600 font-medium">{item.totalRegularHours.toFixed(1)}</td>
                                        <td className="px-6 py-4 text-center text-orange-600 font-medium">{item.totalOTHours.toFixed(1)}</td>
                                        <td className="px-6 py-4 text-center text-red-500">{item.lateCount > 0 ? item.lateCount : '-'}</td>
                                        <td className="px-6 py-4 text-right text-gray-600">{item.totalSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 text-right text-gray-600">{item.totalOTPay.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                        <td className="px-6 py-4 text-right font-bold text-green-600">{item.netSalary.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>
        </div>
    );
}
