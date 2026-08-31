"use client";

import React, { useState, useMemo } from "react";
import { 
    Users, UserCheck, UserPlus, Search, Filter, LayoutGrid, List, 
    DollarSign, Smartphone, CreditCard, Shield, ChevronRight, Calculator,
    Edit3, Trash2, CheckCircle2, AlertTriangle, ArrowUpDown, Sparkles,
    Download, ExternalLink, RefreshCw, X, HelpCircle, Briefcase
} from "lucide-react";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { LongPressButton } from "./ui/LongPressButton";
import { simulateStaffPayroll } from "../../../utils/payroll";
import * as XLSX from "xlsx";

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
        morningShifts: 12,
        eveningShifts: 10,
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
        if (!filteredEmployees.length) return alert("ไม่มีข้อมูลสำหรับการ Export");
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
        <div className="space-y-6 text-rams-ink font-sans">
            
            {/* --- TOP METRICS CARDS --- */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
                {/* Metric 1: Total Active */}
                <div className="bg-rams-panel p-4.5 rounded-sm border border-rams-rule flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                            Active Staff
                        </span>
                        <Users size={16} className="text-rams-orange" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <h3 className="text-2xl font-mono font-black text-rams-ink tracking-tight">
                            {metrics.totalActive}
                        </h3>
                        <span className="text-[11px] font-mono text-rams-ink-muted">คน</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rams-rule-light flex items-center justify-between text-[10px] font-mono text-rams-ink-muted">
                        <span>Fulltime: <strong className="text-rams-ink">{metrics.fulltimeCount}</strong></span>
                        <span>Contract: <strong className="text-rams-ink">{metrics.contractCount}</strong></span>
                    </div>
                </div>

                {/* Metric 2: Probation & Contract */}
                <div className="bg-rams-panel p-4.5 rounded-sm border border-rams-rule-light flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                            Probation / Trial
                        </span>
                        <UserCheck size={16} className="text-rams-ink" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <h3 className="text-2xl font-mono font-black text-rams-ink tracking-tight">
                            {metrics.probationCount}
                        </h3>
                        <span className="text-[11px] font-mono text-rams-ink-muted">คน</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rams-rule-light flex items-center justify-between text-[10px] font-mono text-rams-ink-muted">
                        <span>Inactive / Archive:</span>
                        <span className="font-bold text-rams-ink">{metrics.inactiveCount} คน</span>
                    </div>
                </div>

                {/* Metric 3: Base Payroll Projection */}
                <div className="bg-rams-panel p-4.5 rounded-sm border border-rams-rule-light flex flex-col justify-between shadow-none">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                            Payroll Base Est.
                        </span>
                        <DollarSign size={16} className="text-rams-green" />
                    </div>
                    <div className="mt-2 flex items-baseline gap-1">
                        <h3 className="text-2xl font-mono font-black text-rams-ink tracking-tight">
                            ฿{(metrics.monthlyBaseTotal / 1000).toFixed(1)}k
                        </h3>
                        <span className="text-[10px] font-mono text-rams-ink-muted">/เดือน</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rams-rule-light text-[10px] font-mono text-rams-ink-muted truncate">
                        ประมาณการงบค่าจ้างฐาน
                    </div>
                </div>

                {/* Metric 4: Pending Approvals */}
                <div className={`p-4.5 rounded-sm border flex flex-col justify-between transition-all ${
                    metrics.pendingCount > 0 
                        ? 'bg-rams-amber/10 border-rams-amber text-rams-ink shadow-sm' 
                        : 'bg-rams-panel border-rams-rule-light text-rams-ink'
                }`}>
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                            Pending LINE Staff
                        </span>
                        <AlertTriangle size={16} className={metrics.pendingCount > 0 ? 'text-rams-amber' : 'text-rams-ink-muted'} />
                    </div>
                    <div className="mt-2 flex items-baseline gap-2">
                        <h3 className={`text-2xl font-mono font-black tracking-tight ${metrics.pendingCount > 0 ? 'text-rams-amber' : 'text-rams-ink'}`}>
                            {metrics.pendingCount}
                        </h3>
                        <span className="text-[11px] font-mono text-rams-ink-muted">รายการ</span>
                    </div>
                    <div className="mt-2 pt-2 border-t border-rams-rule-light text-[10px] font-mono text-rams-ink-muted">
                        {metrics.pendingCount > 0 ? '⚠️ มีพนักงานใหม่รออนุมัติ' : '✓ ไม่มีรายการค้างตรวจสอบ'}
                    </div>
                </div>
            </div>

            {/* --- PENDING APPROVALS BANNER (IF ANY) --- */}
            {pendingEmployees && pendingEmployees.length > 0 && (
                <div className="bg-rams-amber/10 border border-rams-amber rounded-sm p-4 space-y-3 animate-in fade-in slide-in-from-top-2">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <AlertTriangle size={16} className="text-rams-amber" />
                            <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink">
                                รายชื่อพนักงานใหม่ที่ลงทะเบียนผ่าน LINE (รอตรวจสอบและกำหนดอัตราค่าแรง)
                            </h3>
                            <span className="px-2 py-0.5 rounded-sm bg-rams-amber text-rams-panel text-[10px] font-mono font-bold">
                                {pendingEmployees.length} คน
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left bg-rams-panel rounded-sm border border-rams-rule-light">
                            <thead className="bg-rams-bg/75 text-rams-ink-muted font-mono text-[9px] uppercase tracking-wider border-b border-rams-rule-light">
                                <tr>
                                    <th className="p-3">ชื่อพนักงาน</th>
                                    <th className="p-3">LINE User ID</th>
                                    <th className="p-3">วันที่ลงทะเบียน</th>
                                    <th className="p-3 text-right">การจัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rams-rule-light font-mono">
                                {pendingEmployees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-rams-bg/30">
                                        <td className="p-3 font-sans font-bold text-rams-ink">
                                            {emp.name || "พนักงานใหม่"}
                                        </td>
                                        <td className="p-3 text-[11px] text-rams-ink-muted font-mono">
                                            {emp.line_user_id}
                                        </td>
                                        <td className="p-3 text-rams-ink-muted text-[11px]">
                                            {emp.created_at ? new Date(emp.created_at).toLocaleDateString('th-TH') : '-'}
                                        </td>
                                        <td className="p-3 text-right">
                                            <button
                                                onClick={() => onApproveStaff ? onApproveStaff(emp) : onEditStaff(emp)}
                                                className="px-3 py-1.5 bg-rams-orange hover:bg-rams-orange-active text-rams-panel rounded-sm font-mono text-[10px] font-bold uppercase tracking-wider shadow-[0_1.5px_0_0_var(--color-rams-rule)] active:translate-y-[1px] transition-all cursor-pointer inline-flex items-center gap-1.5"
                                            >
                                                <span>ตรวจสอบ & อนุมัติ</span>
                                                <ChevronRight size={12} />
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
            <div className="bg-rams-panel p-4 rounded-sm border border-rams-rule space-y-3 shadow-none">
                <div className="flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
                    
                    {/* Search Bar */}
                    <div className="relative flex-1 min-w-[240px]">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-rams-ink-muted" />
                        <input
                            type="text"
                            placeholder="ค้นหาชื่อ, ชื่อเล่น, ตำแหน่ง, เบอร์โทร, LINE ID..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full pl-9 pr-8 py-2 rounded-sm border border-rams-rule-light focus:border-rams-rule outline-none bg-rams-bg text-rams-ink font-sans text-xs transition-all placeholder:text-rams-ink-muted/70"
                        />
                        {searchQuery && (
                            <button
                                onClick={() => setSearchQuery("")}
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-rams-ink-muted hover:text-rams-ink cursor-pointer"
                            >
                                <X size={14} />
                            </button>
                        )}
                    </div>

                    {/* Filter Pills & Dropdowns */}
                    <div className="flex flex-wrap items-center gap-2">
                        {/* Status Filter */}
                        <div className="flex items-center bg-rams-bg border border-rams-rule-light rounded-sm p-0.5 text-[10px] font-mono font-bold uppercase tracking-wider">
                            {['ALL', 'Fulltime', 'Probation', 'Contract', 'INACTIVE'].map(status => (
                                <button
                                    key={status}
                                    onClick={() => setStatusFilter(status)}
                                    className={`px-2.5 py-1 rounded-xs transition-all cursor-pointer ${
                                        statusFilter === status 
                                            ? 'bg-rams-ink text-rams-panel font-bold shadow-xs' 
                                            : 'text-rams-ink-muted hover:text-rams-ink'
                                    }`}
                                >
                                    {status === 'ALL' ? 'ทั้งหมด' : (status === 'INACTIVE' ? 'ปิดการใช้งาน' : status)}
                                </button>
                            ))}
                        </div>

                        {/* Department / Role Filter */}
                        <select
                            value={deptFilter}
                            onChange={(e) => setDeptFilter(e.target.value)}
                            className="px-3 py-1.5 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none cursor-pointer"
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
                            className="px-3 py-1.5 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none cursor-pointer"
                        >
                            <option value="ALL">ทุกรูปแบบค่าจ้าง</option>
                            <option value="monthly">รายเดือน (Monthly)</option>
                            <option value="daily">รายกะ (Daily Shift)</option>
                            <option value="hourly">รายชั่วโมง (Hourly)</option>
                        </select>

                        {/* View Switcher & Action Buttons */}
                        <div className="flex items-center gap-1.5 ml-auto">
                            <div className="flex items-center bg-rams-bg border border-rams-rule-light rounded-sm p-0.5">
                                <button
                                    onClick={() => setViewMode('table')}
                                    title="Table View"
                                    className={`p-1.5 rounded-xs transition-all cursor-pointer ${viewMode === 'table' ? 'bg-rams-ink text-rams-panel' : 'text-rams-ink-muted hover:text-rams-ink'}`}
                                >
                                    <List size={14} />
                                </button>
                                <button
                                    onClick={() => setViewMode('grid')}
                                    title="Grid Cards View"
                                    className={`p-1.5 rounded-xs transition-all cursor-pointer ${viewMode === 'grid' ? 'bg-rams-ink text-rams-panel' : 'text-rams-ink-muted hover:text-rams-ink'}`}
                                >
                                    <LayoutGrid size={14} />
                                </button>
                            </div>

                            <button
                                onClick={handleExportExcel}
                                title="Export to Excel"
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink border border-rams-rule-light rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                            >
                                <Download size={13} />
                                <span className="hidden sm:inline">Export</span>
                            </button>

                            <button
                                onClick={onAddStaff}
                                className="flex items-center gap-1.5 px-4 py-1.5 bg-rams-orange hover:bg-rams-orange-active text-rams-panel border border-rams-rule rounded-sm text-xs font-mono font-bold uppercase tracking-wider shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1.5px] active:shadow-none transition-all cursor-pointer"
                            >
                                <UserPlus size={14} />
                                <span>+ เพิ่มพนักงาน</span>
                            </button>
                        </div>

                    </div>
                </div>
            </div>

            {/* --- EMPLOYEES LIST / TABLE --- */}
            {filteredEmployees.length === 0 ? (
                <div className="bg-rams-panel border border-rams-rule-light rounded-sm p-12 text-center space-y-3">
                    <Users size={32} className="mx-auto text-rams-ink-muted/50" />
                    <p className="font-mono text-xs text-rams-ink-muted uppercase tracking-wider">
                        ไม่พบข้อมูลพนักงานที่ตรงกับเงื่อนไขการค้นหา
                    </p>
                    <button
                        onClick={() => { setSearchQuery(""); setStatusFilter("ALL"); setDeptFilter("ALL"); setWageTypeFilter("ALL"); }}
                        className="text-xs font-mono font-bold text-rams-orange hover:underline uppercase"
                    >
                        ล้างตัวกรองทั้งหมด (Reset Filters)
                    </button>
                </div>
            ) : viewMode === 'table' ? (
                /* --- TABLE VIEW --- */
                <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left">
                            <thead className="bg-rams-bg/60 text-rams-ink-muted border-b border-rams-rule-light font-mono text-[9px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-4 py-3.5">พนักงาน / Nickname</th>
                                    <th className="px-4 py-3.5">ตำแหน่ง & ระดับ</th>
                                    <th className="px-4 py-3.5 text-center">สถานะการจ้าง</th>
                                    <th className="px-4 py-3.5">โครงสร้างค่าจ้าง (Payroll Model)</th>
                                    <th className="px-4 py-3.5">การเชื่อมต่อ & บัญชี</th>
                                    <th className="px-4 py-3.5 text-right">การจัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rams-rule-light font-mono">
                                {filteredEmployees.map(emp => {
                                    const wageType = getEmployeeWageType(emp);
                                    const rates = emp.shift_rates || {};
                                    const isFulltime = emp.employment_status === 'Fulltime';

                                    return (
                                        <tr key={emp.id} className="hover:bg-rams-bg/40 transition-colors">
                                            {/* Name & Avatar */}
                                            <td className="px-4 py-3.5 font-sans">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-sm bg-rams-ink text-rams-panel flex items-center justify-center font-mono font-bold text-xs shrink-0">
                                                        {emp.nickname ? emp.nickname.charAt(0).toUpperCase() : emp.name.charAt(0).toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-bold text-rams-ink">{emp.name}</span>
                                                            {emp.nickname && (
                                                                <span className="px-1.5 py-0.2 rounded-xs bg-rams-bg border border-rams-rule-light text-rams-ink font-mono text-[9px] font-bold">
                                                                    {emp.nickname}
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] text-rams-ink-muted font-mono mt-0.5">
                                                            {emp.phone || emp.email || "No contact info"}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Position & Job Level */}
                                            <td className="px-4 py-3.5 font-sans">
                                                <div className="font-bold text-rams-ink">{emp.position || "-"}</div>
                                                <div className="text-[10px] text-rams-ink-muted font-mono uppercase tracking-wider">
                                                    {emp.job_level || "Staff"}
                                                </div>
                                            </td>

                                            {/* Employment Status Badge */}
                                            <td className="px-4 py-3.5 text-center">
                                                <span className={`px-2 py-0.5 rounded-sm text-[9px] font-mono font-bold border uppercase tracking-wider ${
                                                    isFulltime 
                                                        ? 'bg-rams-green/15 text-rams-green border-rams-green/30' 
                                                        : (emp.employment_status === 'Probation' 
                                                            ? 'bg-rams-amber/15 text-rams-amber border-rams-amber/30' 
                                                            : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light')
                                                }`}>
                                                    {emp.employment_status || '-'}
                                                </span>
                                            </td>

                                            {/* Compensation Details */}
                                            <td className="px-4 py-3.5">
                                                {wageType === 'monthly' && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-bold text-rams-ink">
                                                            ฿{Number(emp.base_salary || rates.base_salary || 0).toLocaleString()} <span className="text-[9px] font-normal text-rams-ink-muted">/เดือน</span>
                                                        </span>
                                                        <span className="text-[9px] text-rams-orange font-mono">
                                                            OT: ฿{rates.ot_rate || 75}/ชม.
                                                        </span>
                                                    </div>
                                                )}
                                                {wageType === 'daily' && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <div className="flex items-center gap-1.5 text-[11px] font-bold text-rams-ink">
                                                            <span>เช้า ฿{rates.morning || 0}</span>
                                                            <span className="text-rams-ink-muted">/</span>
                                                            <span>ค่ำ ฿{rates.evening || 0}</span>
                                                        </div>
                                                        <span className="text-[9px] text-rams-ink-muted">
                                                            กะควบ: ฿{rates.double || 800} · OT: ฿{rates.ot_rate || 75}/ชม.
                                                        </span>
                                                    </div>
                                                )}
                                                {wageType === 'hourly' && (
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="font-bold text-rams-ink">
                                                            ฿{rates.hourly_rate || 50} <span className="text-[9px] font-normal text-rams-ink-muted">/ชั่วโมง</span>
                                                        </span>
                                                        <span className="text-[9px] text-rams-orange font-mono">
                                                            OT: ฿{rates.ot_rate || 75}/ชม.
                                                        </span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Bank & LINE Identity */}
                                            <td className="px-4 py-3.5">
                                                <div className="flex flex-col gap-1">
                                                    {/* LINE Badge */}
                                                    <div className="flex items-center gap-1 text-[10px]">
                                                        <Smartphone size={12} className={emp.line_user_id ? 'text-rams-green' : 'text-rams-ink-muted'} />
                                                        <span className="truncate max-w-[120px] font-mono text-[9px] text-rams-ink-muted" title={emp.line_user_id || 'Not linked'}>
                                                            {emp.line_user_id ? `${emp.line_user_id.substring(0, 8)}...` : 'No LINE ID'}
                                                        </span>
                                                    </div>
                                                    {/* Bank Chip */}
                                                    {emp.bank_account ? (
                                                        <div className="flex items-center gap-1 text-[10px] text-rams-ink font-bold">
                                                            <CreditCard size={12} className="text-rams-ink-muted" />
                                                            <span>{emp.bank_name || 'Bank'}: {emp.bank_account}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-[9px] text-rams-ink-muted italic">- ไม่มีข้อมูลธนาคาร -</span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Action Buttons */}
                                            <td className="px-4 py-3.5 text-right">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <button
                                                        onClick={() => setInspectingStaff(emp)}
                                                        title="จำลองเงินเดือน & ตรวจสอบเรท (Simulator)"
                                                        className="p-1.5 bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule-light hover:border-rams-rule rounded-sm font-mono text-[10px] font-bold uppercase transition-all cursor-pointer flex items-center gap-1"
                                                    >
                                                        <Calculator size={13} className="text-rams-orange" />
                                                        <span className="hidden sm:inline">จำลอง</span>
                                                    </button>
                                                    <button
                                                        onClick={() => onEditStaff(emp)}
                                                        title="แก้ไขโปรไฟล์พนักงาน"
                                                        className="p-1.5 bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule-light hover:border-rams-rule rounded-sm font-mono text-[10px] font-bold uppercase transition-all cursor-pointer"
                                                    >
                                                        <Edit3 size={13} />
                                                    </button>
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
                                className="bg-rams-panel border border-rams-rule rounded-sm p-4.5 flex flex-col justify-between space-y-4 hover:border-rams-ink transition-all shadow-none"
                            >
                                {/* Card Header */}
                                <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-sm bg-rams-ink text-rams-panel flex items-center justify-center font-mono font-bold text-sm shrink-0">
                                            {emp.nickname ? emp.nickname.charAt(0).toUpperCase() : emp.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-bold text-rams-ink text-sm">{emp.name}</h4>
                                                {emp.nickname && (
                                                    <span className="px-1.5 py-0.2 rounded-xs bg-rams-bg border border-rams-rule-light text-rams-ink font-mono text-[10px] font-bold">
                                                        {emp.nickname}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-rams-ink-muted font-mono mt-0.5">
                                                {emp.position || "Staff"} · <span className="uppercase">{emp.job_level || "Junior"}</span>
                                            </p>
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 rounded-sm text-[9px] font-mono font-bold border uppercase tracking-wider ${
                                        isFulltime 
                                            ? 'bg-rams-green/15 text-rams-green border-rams-green/30' 
                                            : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light'
                                    }`}>
                                        {emp.employment_status || '-'}
                                    </span>
                                </div>

                                {/* Compensation Box */}
                                <div className="bg-rams-bg/70 p-3 rounded-sm border border-rams-rule-light space-y-1.5 text-xs font-mono">
                                    <div className="flex items-center justify-between">
                                        <span className="text-[10px] text-rams-ink-muted uppercase">Wage Model:</span>
                                        <span className="font-bold text-rams-orange uppercase text-[10px]">
                                            {wageType}
                                        </span>
                                    </div>
                                    {wageType === 'monthly' && (
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="text-[10px] text-rams-ink-muted">Base Salary</span>
                                            <span className="font-bold text-sm text-rams-ink">฿{Number(emp.base_salary || rates.base_salary || 0).toLocaleString()}</span>
                                        </div>
                                    )}
                                    {wageType === 'daily' && (
                                        <div className="grid grid-cols-2 gap-2 pt-1">
                                            <div>
                                                <span className="text-[9px] text-rams-ink-muted block">เช้า (Morning)</span>
                                                <span className="font-bold text-rams-ink">฿{rates.morning || 0}</span>
                                            </div>
                                            <div>
                                                <span className="text-[9px] text-rams-ink-muted block">ค่ำ (Evening)</span>
                                                <span className="font-bold text-rams-ink">฿{rates.evening || 0}</span>
                                            </div>
                                        </div>
                                    )}
                                    {wageType === 'hourly' && (
                                        <div className="flex items-baseline justify-between pt-1">
                                            <span className="text-[10px] text-rams-ink-muted">Hourly Rate</span>
                                            <span className="font-bold text-sm text-rams-ink">฿{rates.hourly_rate || 50}/ชม.</span>
                                        </div>
                                    )}
                                </div>

                                {/* LINE & Bank Info */}
                                <div className="space-y-1 text-[10px] font-mono text-rams-ink-muted border-t border-rams-rule-light pt-2">
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            <Smartphone size={12} className={emp.line_user_id ? 'text-rams-green' : 'text-rams-ink-muted'} /> LINE:
                                        </span>
                                        <span className="truncate max-w-[140px]" title={emp.line_user_id}>
                                            {emp.line_user_id || 'Not linked'}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="flex items-center gap-1">
                                            <CreditCard size={12} /> Bank:
                                        </span>
                                        <span className="font-bold text-rams-ink">
                                            {emp.bank_account ? `${emp.bank_name || 'Bank'}: ${emp.bank_account}` : '-'}
                                        </span>
                                    </div>
                                </div>

                                {/* Card Footer Actions */}
                                <div className="flex items-center justify-between gap-2 pt-2 border-t border-rams-rule-light">
                                    <button
                                        onClick={() => setInspectingStaff(emp)}
                                        className="flex-1 py-1.5 px-2.5 bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule-light hover:border-rams-rule rounded-sm font-mono text-[10px] font-bold uppercase transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                                    >
                                        <Calculator size={13} className="text-rams-orange" />
                                        <span>จำลองคำนวณเงินเดือน</span>
                                    </button>
                                    <button
                                        onClick={() => onEditStaff(emp)}
                                        className="p-1.5 bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule-light hover:border-rams-rule rounded-sm font-mono text-xs transition-all cursor-pointer"
                                    >
                                        <Edit3 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* --- QUICK RATE INSPECTOR & PAYROLL SIMULATOR DRAWER --- */}
            {inspectingStaff && (
                <div className="fixed inset-0 bg-rams-ink/40 backdrop-blur-xs flex items-center justify-center sm:justify-end z-50 p-3 sm:p-0">
                    <div className="bg-rams-panel border-l border-rams-rule w-full max-w-lg h-full max-h-screen overflow-y-auto p-6 space-y-6 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
                        
                        {/* Drawer Header */}
                        <div>
                            <div className="flex items-center justify-between border-b border-rams-rule-light pb-4">
                                <div>
                                    <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-orange">
                                        PAYROLL SIMULATOR & RATE INSPECTOR
                                    </span>
                                    <h3 className="text-lg font-bold text-rams-ink font-sans mt-0.5">
                                        {inspectingStaff.name} {inspectingStaff.nickname && `(${inspectingStaff.nickname})`}
                                    </h3>
                                    <p className="text-[11px] font-mono text-rams-ink-muted">
                                        {inspectingStaff.position} · {inspectingStaff.employment_status}
                                    </p>
                                </div>
                                <button
                                    onClick={() => setInspectingStaff(null)}
                                    className="w-8 h-8 flex items-center justify-center border border-rams-rule-light hover:border-rams-rule rounded-sm text-rams-ink transition-all cursor-pointer"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            {/* Current Configuration Summary */}
                            <div className="mt-4 bg-rams-bg p-4 rounded-sm border border-rams-rule-light space-y-2.5 font-mono text-xs">
                                <h4 className="font-bold text-rams-ink text-[11px] uppercase tracking-wider flex items-center justify-between">
                                    <span>โครงสร้างค่าตอบแทนปัจจุบัน</span>
                                    <span className="text-rams-orange font-bold">
                                        {getEmployeeWageType(inspectingStaff).toUpperCase()}
                                    </span>
                                </h4>
                                
                                <div className="grid grid-cols-2 gap-2 text-[11px] pt-1">
                                    {getEmployeeWageType(inspectingStaff) === 'monthly' ? (
                                        <div className="col-span-2 flex justify-between bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                            <span className="text-rams-ink-muted">ฐานเงินเดือน:</span>
                                            <span className="font-bold text-rams-ink">฿{Number(inspectingStaff.base_salary || inspectingStaff.shift_rates?.base_salary || 0).toLocaleString()}</span>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                                <span className="text-[10px] text-rams-ink-muted block">กะเช้า:</span>
                                                <span className="font-bold text-rams-ink">฿{inspectingStaff.shift_rates?.morning || 0}</span>
                                            </div>
                                            <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                                <span className="text-[10px] text-rams-ink-muted block">กะค่ำ:</span>
                                                <span className="font-bold text-rams-ink">฿{inspectingStaff.shift_rates?.evening || 0}</span>
                                            </div>
                                        </>
                                    )}
                                    <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                        <span className="text-[10px] text-rams-ink-muted block">อัตรา OT ต่อ ชม.:</span>
                                        <span className="font-bold text-rams-ink">฿{inspectingStaff.shift_rates?.ot_rate || 75}</span>
                                    </div>
                                    <div className="bg-rams-panel p-2 rounded-xs border border-rams-rule-light">
                                        <span className="text-[10px] text-rams-ink-muted block">เบี้ยขยัน:</span>
                                        <span className="font-bold text-rams-green">฿{inspectingStaff.shift_rates?.diligence_allowance || 0}</span>
                                    </div>
                                </div>
                            </div>

                            {/* Interactive Assumptions Simulator */}
                            <div className="mt-5 space-y-4">
                                <h4 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink flex items-center gap-1.5">
                                    <Calculator size={14} className="text-rams-orange" />
                                    จำลองสมมติฐานการทำงานใน 1 เดือน
                                </h4>

                                <div className="space-y-3 font-mono text-xs">
                                    {getEmployeeWageType(inspectingStaff) === 'daily' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] text-rams-ink-muted uppercase mb-1">จำนวนกะเช้า (วัน)</label>
                                                <input
                                                    type="number"
                                                    value={simAssumptions.morningShifts}
                                                    onChange={(e) => setSimAssumptions({ ...simAssumptions, morningShifts: Number(e.target.value) })}
                                                    className="w-full p-2 bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink font-mono text-xs outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] text-rams-ink-muted uppercase mb-1">จำนวนกะค่ำ (วัน)</label>
                                                <input
                                                    type="number"
                                                    value={simAssumptions.eveningShifts}
                                                    onChange={(e) => setSimAssumptions({ ...simAssumptions, eveningShifts: Number(e.target.value) })}
                                                    className="w-full p-2 bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink font-mono text-xs outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-[10px] text-rams-ink-muted uppercase mb-1">ชั่วโมงล่วงเวลา OT (ชม.)</label>
                                        <input
                                            type="number"
                                            value={simAssumptions.otHours}
                                            onChange={(e) => setSimAssumptions({ ...simAssumptions, otHours: Number(e.target.value) })}
                                            className="w-full p-2 bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink font-mono text-xs outline-none"
                                        />
                                    </div>

                                    <label className="flex items-center justify-between p-2 bg-rams-bg rounded-sm border border-rams-rule-light cursor-pointer">
                                        <span className="text-[11px] text-rams-ink font-bold">ได้รับเบี้ยขยัน (ไม่ขาด/ลา/มาสาย)</span>
                                        <input
                                            type="checkbox"
                                            checked={simAssumptions.hasDiligence}
                                            onChange={(e) => setSimAssumptions({ ...simAssumptions, hasDiligence: e.target.checked })}
                                            className="w-4 h-4 rounded-xs accent-rams-ink cursor-pointer"
                                        />
                                    </label>
                                </div>
                            </div>

                            {/* Simulation Breakdown Result */}
                            {simulatedPayout && (
                                <div className="mt-5 p-4 bg-rams-bg border border-rams-rule rounded-sm space-y-2.5 font-mono text-xs">
                                    <div className="flex justify-between text-rams-ink-muted text-[11px]">
                                        <span>ค่าแรงฐาน (Base Pay):</span>
                                        <span className="font-bold text-rams-ink">฿{simulatedPayout.basePay.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between text-rams-ink-muted text-[11px]">
                                        <span>ค่าล่วงเวลา OT ({simAssumptions.otHours} ชม.):</span>
                                        <span className="font-bold text-rams-orange">฿{simulatedPayout.otPay.toLocaleString()}</span>
                                    </div>
                                    {simulatedPayout.totalAllowances > 0 && (
                                        <div className="flex justify-between text-rams-ink-muted text-[11px]">
                                            <span>สวัสดิการ & เบี้ยขยัน:</span>
                                            <span className="font-bold text-rams-green">฿{simulatedPayout.totalAllowances.toLocaleString()}</span>
                                        </div>
                                    )}
                                    {simulatedPayout.totalDeductions > 0 && (
                                        <div className="flex justify-between text-rams-ink-muted text-[11px]">
                                            <span>รายการหัก (ปกส. / ภาษี):</span>
                                            <span className="font-bold text-rams-red">-฿{simulatedPayout.totalDeductions.toLocaleString()}</span>
                                        </div>
                                    )}
                                    <div className="pt-2 border-t border-rams-rule flex justify-between items-baseline">
                                        <span className="font-bold text-rams-ink text-xs uppercase">ยอดสุทธิประมาณการ (Net Take-home):</span>
                                        <span className="font-black text-rams-green text-lg">
                                            ฿{simulatedPayout.net.toLocaleString()}
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Drawer Actions */}
                        <div className="pt-4 border-t border-rams-rule-light flex gap-2">
                            <button
                                onClick={() => {
                                    const staffToEdit = inspectingStaff;
                                    setInspectingStaff(null);
                                    onEditStaff(staffToEdit);
                                }}
                                className="flex-1 py-2.5 px-4 bg-rams-orange hover:bg-rams-orange-active text-rams-panel rounded-sm font-mono text-xs font-bold uppercase tracking-wider shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] transition-all cursor-pointer text-center"
                            >
                                แก้ไขเรทในโปรไฟล์
                            </button>
                            <button
                                onClick={() => setInspectingStaff(null)}
                                className="py-2.5 px-4 bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule-light rounded-sm font-mono text-xs font-bold uppercase tracking-wider transition-all cursor-pointer"
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
