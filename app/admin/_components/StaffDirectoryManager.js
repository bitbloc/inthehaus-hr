"use client";
import { initialOf } from "../../../utils/initial";

import React, { useState, useMemo } from "react";
import { Search, Filter, AlertTriangle } from 'lucide-react';
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { LongPressButton } from "./ui/LongPressButton";
import { simulateStaffPayroll } from "../../../utils/payroll";
import * as XLSX from "xlsx";

const STATUS_TH = { Fulltime: 'ประจำ', Probation: 'ทดลองงาน', Contract: 'สัญญาจ้าง', 'Part-time': 'พาร์ทไทม์' };

export default function StaffDirectoryManager({
    employees = [],
    pendingEmployees = [],
    onAddStaff,
    onEditStaff,
    onDeleteStaff,
    onApproveStaff,
    onRefresh
}) {
    // Search & Filter State
    const [searchQuery, setSearchQuery] = useState("");
    const [statusFilter, setStatusFilter] = useState("ALL"); // ALL | Fulltime | Probation | Contract | INACTIVE
    const [deptFilter, setDeptFilter] = useState("ALL");
    const [wageTypeFilter, setWageTypeFilter] = useState("ALL"); // ALL | monthly | daily | hourly
    const [viewMode, setViewMode] = useState("table"); // 'table' | 'grid'
    const [sortBy, setSortBy] = useState("name"); // 'name' | 'position' | 'salary' | 'status'
    const [sortOrder, setSortOrder] = useState("asc");

    // Simulator / Inspector Drawer State
    const [inspectingStaff, setInspectingStaff] = useState(null);
    const [simAssumptions, setSimAssumptions] = useState({
        morningShifts: 8,
        midShifts: 4,
        eveningShifts: 8,
        nightShifts: 0,
        doubleShifts: 2,
        otHours: 6,
        hasDiligence: true
    });

    // Helper: Determine effective wage type of an employee
    const getEmployeeWageType = (emp) => {
        const rates = emp?.shift_rates || {};
        if (rates.wage_type) return rates.wage_type;
        if (emp?.employment_status === 'Fulltime' && emp?.base_salary > 0) return 'monthly';
        if (rates.morning || rates.evening) return 'daily';
        return 'hourly';
    };

    // Calculate Summary Metrics
    const metrics = useMemo(() => {
        const active = employees.filter(e => e.is_active !== false);
        const fulltime = active.filter(e => e.employment_status === 'Fulltime');
        const probation = active.filter(e => e.employment_status === 'Probation');
        const contract = active.filter(e => e.employment_status === 'Contract' || e.employment_status === 'Part-time');
        const inactive = employees.filter(e => e.is_active === false);

        // Calculate approximate monthly base payroll baseline
        const monthlyBaseTotal = active.reduce((sum, emp) => {
            const wageType = getEmployeeWageType(emp);
            const rates = emp.shift_rates || {};
            if (wageType === 'monthly') {
                return sum + Number(emp.base_salary || rates.base_salary || 0);
            }
            if (wageType === 'daily') {
                // Approximate 24 shifts per month average
                const avgDailyRate = ((Number(rates.morning || 350) + Number(rates.evening || 400)) / 2);
                return sum + (avgDailyRate * 24);
            }
            // Hourly approx 192 hrs / month
            return sum + (Number(rates.hourly_rate || 50) * 192);
        }, 0);

        return {
            totalActive: active.length,
            fulltimeCount: fulltime.length,
            probationCount: probation.length,
            contractCount: contract.length,
            inactiveCount: inactive.length,
            pendingCount: pendingEmployees?.length || 0,
            monthlyBaseTotal
        };
    }, [employees, pendingEmployees]);

    // Unique Departments / Roles from existing staff
    const departmentList = useMemo(() => {
        const set = new Set();
        employees.forEach(e => {
            if (e.position) set.add(e.position.trim());
        });
        return Array.from(set);
    }, [employees]);

    // Filtered & Sorted Employees
    const filteredEmployees = useMemo(() => {
        return employees.filter(emp => {
            // Search Query
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const name = (emp.name || "").toLowerCase();
                const nameEn = (emp.name_en || "").toLowerCase();
                const nickname = (emp.nickname || "").toLowerCase();
                const pos = (emp.position || "").toLowerCase();
                const phone = (emp.phone || "").toLowerCase();
                const lineId = (emp.line_user_id || "").toLowerCase();
                if (!name.includes(q) && !nameEn.includes(q) && !nickname.includes(q) && 
                    !pos.includes(q) && !phone.includes(q) && !lineId.includes(q)) {
                    return false;
                }
            }

            // Status Filter
            if (statusFilter === "INACTIVE") {
                if (emp.is_active !== false) return false;
            } else if (statusFilter !== "ALL") {
                if (emp.is_active === false) return false;
                if (emp.employment_status !== statusFilter) return false;
            } else {
                // Default ALL: show active employees
                if (emp.is_active === false) return false;
            }

            // Department Filter
            if (deptFilter !== "ALL" && emp.position !== deptFilter) {
                return false;
            }

            // Wage Type Filter
            if (wageTypeFilter !== "ALL") {
                const wt = getEmployeeWageType(emp);
                if (wt !== wageTypeFilter) return false;
            }

            return true;
        }).sort((a, b) => {
            let valA = a[sortBy] || '';
            let valB = b[sortBy] || '';
            if (sortBy === 'salary') {
                valA = Number(a.base_salary || a.shift_rates?.morning || 0);
                valB = Number(b.base_salary || b.shift_rates?.morning || 0);
                return sortOrder === 'asc' ? valA - valB : valB - valA;
            }
            if (typeof valA === 'string') {
                return sortOrder === 'asc' 
                    ? valA.localeCompare(valB, 'th') 
                    : valB.localeCompare(valA, 'th');
            }
            return sortOrder === 'asc' ? valA - valB : valB - valA;
        });
    }, [employees, searchQuery, statusFilter, deptFilter, wageTypeFilter, sortBy, sortOrder]);

    // Handle Export to Excel
    const handleExportExcel = () => {
        if (!filteredEmployees.length) return alert("ไม่มีข้อมูลให้ส่งออก");
        const exportData = filteredEmployees.map(emp => {
            const rates = emp.shift_rates || {};
            const wageType = getEmployeeWageType(emp);
            return {
                "รหัสพนักงาน": emp.id,
                "ชื่อ - นามสกุล": emp.name,
                "ชื่ออังกฤษ": emp.name_en || "-",
                "ชื่อเล่น": emp.nickname || "-",
                "ตำแหน่ง": emp.position || "-",
                "ระดับงาน": emp.job_level || "-",
                "สถานะการจ้างงาน": emp.employment_status || "-",
                "ประเภทค่าจ้าง": wageType === 'monthly' ? 'รายเดือน' : (wageType === 'daily' ? 'รายกะ' : 'รายชั่วโมง'),
                "ฐานเงินเดือน (บาท)": emp.base_salary || rates.base_salary || 0,
                "ค่าแรงกะเช้า (บาท)": rates.morning || 0,
                "ค่าแรงกะค่ำ (บาท)": rates.evening || 0,
                "ค่าแรงกะควบ (บาท)": rates.double || 0,
                "ค่าจ้างราย ชม. (บาท)": rates.hourly_rate || 50,
                "อัตรา OT ต่อ ชม.": rates.ot_rate || 75,
                "ค่าตำแหน่ง/เบี้ยเลี้ยง": rates.monthly_allowance || 0,
                "เบี้ยขยัน": rates.diligence_allowance || 0,
                "หักประกันสังคม (5%)": rates.social_security_enrolled ? 'ใช่' : 'ไม่',
                "หักภาษี ณ ที่จ่าย %": rates.withholding_tax_pct || 0,
                "เบอร์โทรศัพท์": emp.phone || "-",
                "ธนาคาร": emp.bank_name || "-",
                "เลขบัญชี": emp.bank_account || "-",
                "LINE User ID": emp.line_user_id || "-",
                "วันที่เริ่มงาน": emp.start_date || "-",
                "สถานะ": emp.is_active !== false ? 'Active' : 'Inactive'
            };
        });

        const worksheet = XLSX.utils.json_to_sheet(exportData);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Staff_Directory");
        XLSX.writeFile(workbook, `InTheHaus_StaffDirectory_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    // Calculate simulation result for current inspecting staff
    const simulatedPayout = useMemo(() => {
        if (!inspectingStaff) return null;
        return simulateStaffPayroll(inspectingStaff, simAssumptions);
    }, [inspectingStaff, simAssumptions]);

    return (
        <div className="space-y-6 text-charcoal">
            
            {/* --- TOP METRICS CARDS --- */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {/* Metric 1: Total Active */}
                <div className="bg-cream p-4.5 border border-charcoal flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-neutral">พนักงานที่ทำงานอยู่</span>
                                            </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <h3 className="text-2xl font-num font-semibold text-charcoal">
                            {metrics.totalActive}
                        </h3>
                        <span className="text-xs text-neutral">คน</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rule flex items-center justify-between text-xs font-num text-neutral">
                        <span>ประจำ <strong className="text-charcoal">{metrics.fulltimeCount}</strong></span>
                        <span>สัญญาจ้าง <strong className="text-charcoal">{metrics.contractCount}</strong></span>
                    </div>
                </div>

                {/* Metric 2: Probation & Contract */}
                <div className="bg-cream p-4.5 border border-rule flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-neutral">ทดลองงาน</span>
                                            </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <h3 className="text-2xl font-num font-semibold text-charcoal">
                            {metrics.probationCount}
                        </h3>
                        <span className="text-xs text-neutral">คน</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rule flex items-center justify-between text-xs font-num text-neutral">
                        <span>พ้นสภาพ</span>
                        <span className="font-semibold text-charcoal">{metrics.inactiveCount} คน</span>
                    </div>
                </div>

                {/* Metric 3: Base Payroll Projection */}
                <div className="bg-cream p-4.5 border border-rule flex flex-col justify-between">
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-neutral">ค่าจ้างฐานโดยประมาณ</span>
                                            </div>
                    <div className="mt-2 flex items-baseline gap-1">
                        <h3 className="text-2xl font-semibold text-charcoal">
                            ฿{(metrics.monthlyBaseTotal / 1000).toFixed(1)}k
                        </h3>
                        <span className="text-xs text-neutral">/เดือน</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rule text-xs text-neutral truncate">
                        ประมาณการงบค่าจ้างฐาน
                    </div>
                </div>

                {/* Metric 4: Pending Approvals */}
                <div className={`p-4.5 border flex flex-col justify-between transition-colors duration-150 ${
 metrics.pendingCount > 0 
 ? 'bg-plum/10 border-plum text-charcoal ' 
 : 'bg-cream border-rule text-charcoal'
 }`}>
                    <div className="flex items-center justify-between">
                        <span className="text-xs font-semibold text-neutral">รออนุมัติจาก LINE</span>
                        <AlertTriangle size={16} className={metrics.pendingCount > 0 ? 'text-plum' : 'text-neutral'} />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <h3 className={`text-2xl font-num font-semibold  ${metrics.pendingCount > 0 ? 'text-plum' : 'text-charcoal'}`}>
                            {metrics.pendingCount}
                        </h3>
                        <span className="text-xs text-neutral">รายการ</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rule text-xs text-neutral">
                        {metrics.pendingCount > 0 ? 'มีพนักงานใหม่รออนุมัติ' : 'ไม่มีรายการค้างตรวจสอบ'}
                    </div>
                </div>
            </div>

            {/* --- PENDING APPROVALS BANNER (IF ANY) --- */}
            {pendingEmployees && pendingEmployees.length > 0 && (
                <div className="bg-plum/10 border border-plum p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                                                        <h3 className="font-semibold text-xs text-charcoal">
                                รายชื่อพนักงานใหม่ที่ลงทะเบียนผ่าน LINE (รอตรวจสอบและกำหนดอัตราค่าแรง)
                            </h3>
                            <span className="px-2 py-0.5 bg-plum text-cream text-xs font-semibold">
                                {pendingEmployees.length} คน
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left bg-cream border border-rule">
                            <thead className="bg-paper-2 text-neutral font-num text-xs border-b border-rule">
                                <tr>
                                    <th className="p-3">ชื่อพนักงาน</th>
                                    <th className="p-3">LINE User ID</th>
                                    <th className="p-3">วันที่ลงทะเบียน</th>
                                    <th className="p-3 text-right">การจัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rule font-num">
                                {pendingEmployees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-paper-2">
                                        <td className="p-3 font-semibold text-charcoal">
                                            {emp.name || "พนักงานใหม่"}
                                        </td>
                                        <td className="p-3 text-xs text-neutral font-num">
                                            {emp.line_user_id}
                                        </td>
                                        <td className="p-3 text-neutral text-xs">
                                            {emp.created_at ? new Date(emp.created_at).toLocaleDateString('th-TH') : '-'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                onClick={() => onApproveStaff ? onApproveStaff(emp) : onEditStaff(emp)}
                                                className="px-3 py-1.5 bg-plum hover:bg-plum-2 text-cream font-num text-xs font-semibold transition-colors duration-150 cursor-pointer inline-flex items-center gap-1.5"
                                            >
                                                <span>ตรวจสอบ & อนุมัติ</span>
                                                                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- SEARCH, FILTER & ACTION BAR --- */}
            <div className="bg-cream p-4 border border-charcoal space-y-3">
                <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                    
                    {/* Search Bar */}
                    <div className="relative flex-1 min-w-[240px]">
                                                <input
                            type="text"
                            placeholder="ค้นหาชื่อ, ชื่อเล่น, ตำแหน่ง, เบอร์โทร, LINE ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 border border-rule focus:border-charcoal outline-none bg-cream text-charcoal text-xs transition-colors duration-150 placeholder:text-neutral/70"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral hover:text-charcoal cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                            >ล้าง</button>
                        )}
                    </div>

                    {/* Filter Pills & Dropdowns */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Status Filter */}
                        <div className="flex items-center bg-cream border border-rule p-0.5 text-xs font-num font-semibold">
                            {['ALL', 'Fulltime', 'Probation', 'Contract', 'INACTIVE'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-2.5 py-1 transition-colors duration-150 cursor-pointer ${
 statusFilter === status 
 ? 'bg-charcoal text-cream font-semibold ' 
 : 'text-neutral hover:text-charcoal'
 }`}
                                >
                                    {status === 'ALL' ? 'ทั้งหมด' : (status === 'INACTIVE' ? 'พ้นสภาพ' : STATUS_TH[status] || status)}
                                </button>
                            ))}
                        </div>

                        {/* Department / Role Filter */}
                        <select
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                            className="px-3 py-1.5 bg-cream border border-rule text-xs font-num font-semibold text-charcoal outline-none cursor-pointer"
                        >
                            <option value="ALL">ทุกแผนก / ตำแหน่ง</option>
                            {departmentList.map(dept => (
                                <option key={dept} value={dept}>{dept}</option>
                            ))}
                        </select>

                        {/* Wage Type Filter */}
                        <select
                            value={wageTypeFilter}
                            onChange={(e) => setWageTypeFilter(e.target.value)}
                            className="px-3 py-1.5 bg-cream border border-rule text-xs font-num font-semibold text-charcoal outline-none cursor-pointer"
                        >
                            <option value="ALL">ทุกรูปแบบค่าจ้าง</option>
                            <option value="monthly">รายเดือน</option>
                            <option value="daily">รายกะ</option>
                            <option value="hourly">รายชั่วโมง</option>
                        </select>

                        {/* View Switcher & Action Buttons */}
                        <div className="flex items-center gap-1.5 ml-auto">
                            <div className="flex items-center bg-cream border border-rule p-0.5">
                                <button
                                    onClick={() => setViewMode('table')}
                                    title="Table View"
                                    className={`p-1.5 transition-colors duration-150 cursor-pointer ${viewMode === 'table' ? 'bg-charcoal text-cream' : 'text-neutral hover:text-charcoal'}`}
                                >ตาราง</button>
                                <button
                                    onClick={() => setViewMode('grid')}
                                    title="Grid Cards View"
                                    className={`p-1.5 transition-colors duration-150 cursor-pointer ${viewMode === 'grid' ? 'bg-charcoal text-cream' : 'text-neutral hover:text-charcoal'}`}
                                >การ์ด</button>
                            </div>

                            <button
                                onClick={handleExportExcel}
                                title="ส่งออกเป็น Excel"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-cream hover:bg-neutral/10 text-charcoal border border-rule text-xs font-num font-semibold transition-colors duration-150 cursor-pointer"
                            >
                                                                <span className="hidden sm:inline">ส่งออก Excel</span>
                            </button>

                            <button
                                onClick={onAddStaff}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-plum hover:bg-plum-2 text-cream border border-charcoal text-xs font-num font-semibold transition-colors duration-150 cursor-pointer"
                            >
                                                                <span>+ เพิ่มพนักงาน</span>
                            </button>
                        </div>

                    </div>
                </div>
            </div>

            {/* --- EMPLOYEES LIST / TABLE --- */}
            {filteredEmployees.length === 0 ? (
                <div className="bg-cream border border-rule p-12 text-center space-y-3">
                                        <p className="text-xs text-neutral">
                        ไม่พบข้อมูลพนักงานที่ตรงกับเงื่อนไขการค้นหา
                    </p>
                    <button
                        onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); setDeptFilter("ALL"); setWageTypeFilter("ALL"); }}
                        className="text-xs font-semibold text-plum hover:underline"
                    >
                        ล้างตัวกรองทั้งหมด
                    </button>
                </div>
            ) : viewMode === 'table' ? (
                /* --- TABLE VIEW --- */
                <div className="bg-cream border border-charcoal overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-paper-2 text-neutral border-b border-rule font-num text-xs">
                                <tr>
                                    <th className="px-4 py-3.5">พนักงาน</th>
                                    <th className="px-4 py-3.5">ตำแหน่ง & ระดับ</th>
                                    <th className="px-4 py-3.5 text-center">สถานะการจ้าง</th>
                                    <th className="px-4 py-3.5">รูปแบบค่าจ้าง</th>
                                    <th className="px-4 py-3.5">การเชื่อมต่อ & บัญชี</th>
                                    <th className="px-4 py-3.5 text-right">การจัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rule font-num">
                                {filteredEmployees.map(emp => {
                                    const wageType = getEmployeeWageType(emp);
                                    const rates = emp.shift_rates || {};
                                    const isFulltime = emp.employment_status === 'Fulltime';

                                    return (
                                        <tr key={emp.id} className="hover:bg-paper-2 transition-colors">
                                            {/* Name & Avatar */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 bg-charcoal text-cream flex items-center justify-center font-num font-semibold text-xs shrink-0">
                                                        {initialOf(emp.nickname, emp.name)}
                                                    </div>
                                                    <div>
                                                        <div className="font-semibold text-charcoal whitespace-nowrap">{emp.name}{emp.nickname && emp.nickname !== emp.name && <span className="ml-1.5 text-neutral font-normal">({emp.nickname})</span>}</div>
                                                        <div className="text-xs text-neutral mt-0.5">
                                                            {emp.phone || emp.email || "ไม่มีข้อมูลติดต่อ"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Position & Job Level */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex items-center gap-1.5 flex-wrap">
                                                    <span className="font-semibold text-charcoal">{emp.position || "-"}</span>
                                                    {((emp.position || '').toLowerCase().includes('owner') || (emp.position || '').toLowerCase().includes('ceo')) && (
                                                        <span className="px-1.5 py-0.2 text-xs font-semibold bg-paper-2 text-plum border border-plum" title="ยกเว้นการลงเวลาเข้า-ออกงาน">ไม่ต้องลงเวลา</span>
                                                    )}
                                                </div>
                                                <div className="text-xs text-neutral font-num">
                                                    {emp.job_level || "พนักงาน"}
                                                </div>
                                            </td>

                                            {/* Employment Status Badge */}
                                            <td className="px-4 py-3.5 text-center">
                                                <span className={`px-2 py-0.5 text-xs font-semibold border whitespace-nowrap ${
 isFulltime 
 ? 'bg-charcoal/15 text-charcoal border-charcoal/30' 
 : (emp.employment_status === 'Probation' 
 ? 'bg-plum/15 text-plum border-plum/30' 
 : 'bg-cream text-neutral border-rule')
 }`}>
                                                    {STATUS_TH[emp.employment_status] || emp.employment_status || '-'}
                                                </span>
                                            </td>

                                            {/* Compensation Details */}
                                            <td className="px-4 py-3.5">
                                                {wageType === 'monthly' && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-semibold text-charcoal">
                                                            ฿{Number(emp.base_salary || rates.base_salary || 0).toLocaleString()} <span className="text-xs font-normal text-neutral">/เดือน</span>
                                                        </span>
                                                        <span className="text-xs text-plum">
                                                            OT: ฿{rates.ot_rate || 75}/ชม.
                                                        </span>
                                                    </div>
                                                )}
                                                {wageType === 'daily' && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5 text-xs font-semibold text-charcoal">
                                                            <span>กะปกติ ฿{rates.morning || rates.daily_rate || 350}</span>
                                                            {rates.evening && rates.evening !== rates.morning && (
                                                                <span className="text-xs text-neutral font-normal">(ค่ำ ฿{rates.evening})</span>
                                                            )}
                                                        </div>
                                                        <span className="text-xs text-neutral">
                                                            กะควบ: ฿{rates.double || 800} · OT: ฿{rates.ot_rate || 75}/ชม.
                                                        </span>
                                                    </div>
                                                )}
                                                {wageType === 'hourly' && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-semibold text-charcoal">
                                                            ฿{rates.hourly_rate || 50} <span className="text-xs font-normal text-neutral">/ชั่วโมง</span>
                                                        </span>
                                                        <span className="text-xs text-plum">
                                                            OT: ฿{rates.ot_rate || 75}/ชม.
                                                        </span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Bank & LINE Identity */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex flex-col gap-1">
                                                    {/* LINE Badge */}
                                                    <div className="flex items-center gap-1 text-xs">
                                                                                                                <span className="truncate max-w-[120px] font-num text-xs text-neutral" title={emp.line_user_id || 'Not linked'}>
                                                            {emp.line_user_id ? `${emp.line_user_id.substring(0, 8)}...` : 'No LINE ID'}
                                                        </span>
                                                    </div>
                                                    {/* Bank Chip */}
                                                    {emp.bank_account ? (
                                                        <div className="flex items-center gap-1 text-xs text-charcoal font-semibold">
                                                                                                                        <span>{emp.bank_name || 'Bank'}: {emp.bank_account}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-xs text-neutral">- ไม่มีข้อมูลธนาคาร -</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Action Buttons */}
                                            <td className="px-4 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => setInspectingStaff(emp)}
                                                        title="จำลองเงินเดือน & ตรวจสอบเรท"
                                                        className="p-1.5 bg-cream hover:bg-cream text-charcoal border border-rule hover:border-charcoal font-num text-xs font-semibold transition-colors duration-150 cursor-pointer flex items-center gap-1"
                                                    >
                                                                                                                <span className="hidden sm:inline">จำลอง</span>
                                                    </button>
                                                    <button
                                                        onClick={() => onEditStaff(emp)}
                                                        title="แก้ไขโปรไฟล์พนักงาน"
                                                        className="bg-cream hover:bg-paper-2 text-charcoal border border-charcoal min-h-11 px-3 text-sm font-semibold whitespace-nowrap transition-colors duration-150 cursor-pointer"
                                                    >แก้ไข</button>
                                                    <LongPressButton
                                                        onLongPress={() => onDeleteStaff(emp.id)}
                                                    />
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* --- GRID CARDS VIEW --- */
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filteredEmployees.map(emp => {
                        const wageType = getEmployeeWageType(emp);
                        const rates = emp.shift_rates || {};
                        const isFulltime = emp.employment_status === 'Fulltime';

                        return (
                            <div 
                                key={emp.id} 
                                className="bg-cream border border-charcoal p-4.5 flex flex-col justify-between space-y-4 hover:border-charcoal transition-colors duration-150"
                            >
                                {/* Card Header */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 bg-charcoal text-cream flex items-center justify-center font-num font-semibold text-sm shrink-0">
                                            {initialOf(emp.nickname, emp.name)}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-semibold text-charcoal text-sm">{emp.name}</h4>
                                                {emp.nickname && (
                                                    <span className="px-1.5 py-0.2 bg-cream border border-rule text-charcoal font-num text-xs font-semibold">
                                                        {emp.nickname}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-xs text-neutral font-num mt-0.5">
                                                {emp.position || "พนักงาน"} · <span className="">{emp.job_level || "Junior"}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 text-xs font-semibold border whitespace-nowrap ${
 isFulltime 
 ? 'bg-charcoal/15 text-charcoal border-charcoal/30' 
 : 'bg-cream text-neutral border-rule'
 }`}>
                                        {STATUS_TH[emp.employment_status] || emp.employment_status || '-'}
                                    </span>
                                </div>

                                {/* Compensation Box */}
                                <div className="bg-paper-2 p-3 border border-rule space-y-1.5 text-xs font-num">
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs text-neutral">Wage Model:</span>
                                        <span className="font-semibold text-plum text-xs">
                                            {wageType}
                                        </span>
                                    </div>
                                    {wageType === 'monthly' && (
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="text-xs text-neutral">Base Salary</span>
                                            <span className="font-semibold text-sm text-charcoal">฿{Number(emp.base_salary || rates.base_salary || 0).toLocaleString()}</span>
                                        </div>
                                    )}
                                    {wageType === 'daily' && (
                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <div>
                                                <span className="text-xs text-neutral block">กะปกติ</span>
                                                <span className="font-semibold text-charcoal">฿{rates.morning || rates.daily_rate || 350}</span>
                                            </div>
                                            <div>
                                                <span className="text-xs text-neutral block">กะควบ</span>
                                                <span className="font-semibold text-charcoal">฿{rates.double || 800}</span>
                                            </div>
                                        </div>
                                    )}
                                    {wageType === 'hourly' && (
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="text-xs text-neutral">ค่าจ้างต่อชั่วโมง</span>
                                            <span className="font-semibold text-sm text-charcoal">฿{rates.hourly_rate || 50}/ชม.</span>
                                        </div>
                                    )}
                                </div>

                                {/* LINE & Bank Info */}
                                <div className="space-y-1 text-xs font-num text-neutral border-t border-rule pt-2">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            LINE:
                                        </span>
                                        <span className="truncate max-w-[140px]" title={emp.line_user_id}>
                                            {emp.line_user_id || 'Not linked'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            Bank:
                                        </span>
                                        <span className="font-semibold text-charcoal">
                                            {emp.bank_account ? `${emp.bank_name || 'Bank'}: ${emp.bank_account}` : '-'}
                                        </span>
                                    </div>
                                </div>

                                {/* Card Footer Actions */}
                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-rule">
                                    <button
                                        onClick={() => setInspectingStaff(emp)}
                                        className="flex-1 py-1.5 px-2.5 bg-cream hover:bg-cream text-charcoal border border-rule hover:border-charcoal font-num text-xs font-semibold transition-colors duration-150 flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                                                                <span>จำลองคำนวณเงินเดือน</span>
                                    </button>
                                    <button
                                        onClick={() => onEditStaff(emp)}
                                        className=".5 bg-cream hover:bg-cream text-charcoal border border-rule hover:border-charcoal text-xs transition-colors duration-150 cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                    >แก้ไข</button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* --- QUICK RATE INSPECTOR & PAYROLL SIMULATOR DRAWER --- */}
            {inspectingStaff && (
                <div className="fixed inset-0 bg-charcoal/50 flex items-center justify-center sm:justify-end z-50 p-3 sm:p-0">
                    <div className="bg-cream border-l border-charcoal w-full max-w-lg h-full max-h-screen overflow-y-auto p-6 space-y-6 flex flex-col justify-between">
                        
                        {/* Drawer Header */}
                        <div>
                            <div className="flex items-center justify-between border-b border-rule pb-4">
                                <div>
                                    <span className="text-xs font-num font-semibold text-plum">
                                        PAYROLL SIMULATOR & RATE INSPECTOR
                                    </span>
                                    <h3 className="text-lg font-semibold text-charcoal mt-0.5">
                                        {inspectingStaff.name} {inspectingStaff.nickname && `(${inspectingStaff.nickname})`}
                                    </h3>
                                    <p className="text-xs font-num text-neutral">
                                        {inspectingStaff.position} · {inspectingStaff.employment_status}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setInspectingStaff(null)}
                                    className="flex items-center justify-center border border-rule hover:border-charcoal text-charcoal transition-colors duration-150 cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                >ปิด</button>
                            </div>

                            {/* Current Configuration Summary */}
                            <div className="mt-4 bg-cream p-4 border border-rule space-y-2.5 font-num text-xs">
                                <h4 className="font-semibold text-charcoal text-xs flex items-center justify-between">
                                    <span>โครงสร้างค่าตอบแทนปัจจุบัน</span>
                                    <span className="text-plum font-semibold">
                                        {getEmployeeWageType(inspectingStaff).toUpperCase()}
                                    </span>
                                </h4>
                                
                                <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                                    {getEmployeeWageType(inspectingStaff) === 'monthly' ? (
                                        <div className="col-span-2 flex justify-between bg-cream p-2 border border-rule">
                                            <span className="text-neutral">ฐานเงินเดือน:</span>
                                            <span className="font-semibold text-charcoal">฿{Number(inspectingStaff.base_salary || inspectingStaff.shift_rates?.base_salary || 0).toLocaleString()}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="bg-cream p-2 border border-rule">
                                                <span className="text-xs text-neutral block">กะปกติในตาราง (6-10h):</span>
                                                <span className="font-semibold text-charcoal">฿{inspectingStaff.shift_rates?.morning || inspectingStaff.shift_rates?.daily_rate || 350}</span>
                                            </div>
                                            <div className="bg-cream p-2 border border-rule">
                                                <span className="text-xs text-neutral block">กะควบในตาราง (11h+):</span>
                                                <span className="font-semibold text-charcoal">฿{inspectingStaff.shift_rates?.double || 800}</span>
                                            </div>
                                        </>
                                    )}
                                    <div className="bg-cream p-2 border border-rule">
                                        <span className="text-xs text-neutral block">อัตรา OT ต่อ ชม.:</span>
                                        <span className="font-semibold text-charcoal">฿{inspectingStaff.shift_rates?.ot_rate || 75}</span>
                                    </div>
                                    <div className="bg-cream p-2 border border-rule">
                                        <span className="text-xs text-neutral block">เบี้ยขยัน:</span>
                                        <span className="font-semibold text-charcoal">฿{inspectingStaff.shift_rates?.diligence_allowance || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Interactive Assumptions Simulator */}
                            <div className="mt-5 space-y-4">
                                <h4 className="font-semibold text-xs text-charcoal flex items-center gap-1.5">
                                                                        จำลองสมมติฐานตารางงาน ใน 1 เดือน
                                </h4>

                                <div className="space-y-3 font-num text-xs">
                                    {getEmployeeWageType(inspectingStaff) === 'daily' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs text-neutral mb-1">กะปกติในตาราง (วัน)</label>
                                                <input
                                                    type="number"
                                                    value={simAssumptions.morningShifts}
                                                    onChange={(e) => setSimAssumptions({ ...simAssumptions, morningShifts: Number(e.target.value) })}
                                                    className="w-full p-2 bg-cream border border-rule text-charcoal font-num text-xs outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs text-neutral mb-1">กะควบในตาราง (วัน)</label>
                                                <input
                                                    type="number"
                                                    value={simAssumptions.doubleShifts || 0}
                                                    onChange={(e) => setSimAssumptions({ ...simAssumptions, doubleShifts: Number(e.target.value) })}
                                                    className="w-full p-2 bg-cream border border-rule text-charcoal font-num text-xs outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-xs text-neutral mb-1">ชั่วโมงล่วงเวลา OT (ชม.)</label>
                                        <input
                                            type="number"
                                            value={simAssumptions.otHours}
                                            onChange={(e) => setSimAssumptions({ ...simAssumptions, otHours: Number(e.target.value) })}
                                            className="w-full p-2 bg-cream border border-rule text-charcoal font-num text-xs outline-none"
                                        />
                                    </div>

                                    <label className="flex items-center justify-between p-2 bg-cream border border-rule cursor-pointer">
                                        <span className="text-xs text-charcoal font-semibold">ได้รับเบี้ยขยัน (ไม่ขาด/ลา/มาสาย)</span>
                                        <input
                                            type="checkbox"
                                            checked={simAssumptions.hasDiligence}
                                            onChange={(e) => setSimAssumptions({ ...simAssumptions, hasDiligence: e.target.checked })}
                                            className="w-4 h-4 accent-charcoal cursor-pointer"
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Simulation Breakdown Result */}
                            {simulatedPayout && (
                                <div className="mt-5 p-4 bg-cream border border-charcoal space-y-2.5 font-num text-xs">
                                    <div className="flex justify-between text-neutral text-xs">
                                        <span>ค่าแรงฐาน:</span>
                                        <span className="font-semibold text-charcoal">฿{simulatedPayout.basePay.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-neutral text-xs">
                                        <span>ค่าล่วงเวลา OT ({simAssumptions.otHours} ชม.):</span>
                                        <span className="font-semibold text-plum">฿{simulatedPayout.otPay.toLocaleString()}</span>
                                    </div>
                                    {simulatedPayout.totalAllowances > 0 && (
                                        <div className="flex justify-between text-neutral text-xs">
                                            <span>สวัสดิการ & เบี้ยขยัน:</span>
                                            <span className="font-semibold text-charcoal">฿{simulatedPayout.totalAllowances.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {simulatedPayout.totalDeductions > 0 && (
                                        <div className="flex justify-between text-neutral text-xs">
                                            <span>รายการหัก (ปกส. / ภาษี):</span>
                                            <span className="font-semibold text-error">-฿{simulatedPayout.totalDeductions.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-charcoal flex justify-between items-baseline">
                                        <span className="font-semibold text-charcoal text-xs">ยอดสุทธิประมาณการ:</span>
                                        <span className="font-semibold text-charcoal text-lg">
                                            ฿{simulatedPayout.net.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Drawer Actions */}
                        <div className="pt-4 border-t border-rule flex gap-2">
                            <button
                                onClick={() => {
                                    const staffToEdit = inspectingStaff;
                                    setInspectingStaff(null);
                                    onEditStaff(staffToEdit);
                                }}
                                className="flex-1 py-2.5 px-4 bg-plum hover:bg-plum-2 text-cream text-xs font-semibold transition-colors duration-150 cursor-pointer text-center"
                            >
                                แก้ไขเรทในโปรไฟล์
                            </button>
                            <button
                                onClick={() => setInspectingStaff(null)}
                                className="py-2.5 px-4 bg-cream hover:bg-cream text-charcoal border border-rule text-xs font-semibold transition-colors duration-150 cursor-pointer"
                            >
                                ปิด
                            </button>
                        </div>

                    </div>
                </div>
            )}

        </div>
    );
}
