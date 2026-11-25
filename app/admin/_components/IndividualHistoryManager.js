"use client";
import { initialOf } from "../../../utils/initial";

import React, { useState, useMemo } from "react";
import { 
    format, parseISO, differenceInMinutes, subDays, addDays, isValid 
} from "date-fns";
import { th } from "date-fns/locale";
import { Search, Filter } from 'lucide-react';
import * as XLSX from "xlsx";
import { Badge } from "./ui/Badge";
import { Card } from "./ui/Card";
import { formatDate, formatTime } from "../../../utils/format";

// Staff Avatar with image fallback & Dieter Rams aesthetic
function StaffAvatar({ employee, className = "w-11 h-11", textClassName = "text-base" }) {
    const [imgError, setImgError] = useState(false);
    const photoUrl = employee?.photo_url;
    const initialChar = initialOf(employee?.nickname, employee?.name);

    return (
        <div className="relative shrink-0 select-none">
            {photoUrl && !imgError ? (
                <img
                    src={photoUrl}
                    alt={employee?.name || ""}
                    onError={() => setImgError(true)}
                    referrerPolicy="no-referrer"
                    className={`${className} object-cover border border-rule bg-cream`}
                />
            ) : (
                <div className={`${className} bg-charcoal text-cream font-num font-semibold ${textClassName} flex items-center justify-center border border-charcoal`}>
                    {initialChar}
                </div>
            )}
            {employee?.is_active !== false && (
                <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 bg-charcoal border-2 border-cream" />
            )}
        </div>
    );
}

export default function IndividualHistoryManager({
    employees = [],
    shifts = [],
    schedules = {},
    transactions = [],
    leaveRequests = [],
    individualLogs = [],
    individualStats = { work_days: 0, late: 0, absent: 0 },
    selectedEmpId = "ALL",
    setSelectedEmpId,
    selectedMonth,
    setSelectedMonth,
    getShiftStatus,
    handleToggleLogAction,
    handleDeleteLog,
    setShowManualModal,
    setManualForm,
    onRefresh
}) {
    // Local State
    const [viewMode, setViewMode] = useState("shifts"); // 'shifts' (Daily Paired) | 'raw' (Timeline)
    const [statusFilter, setStatusFilter] = useState("ALL"); // ALL | ON_TIME | LATE | OFF_DAY | LEAVE | MISSING_OUT
    const [searchQuery, setSearchQuery] = useState("");
    const [selectedPhoto, setSelectedPhoto] = useState(null); // Photo Lightbox Modal
    const [isExporting, setIsExporting] = useState(false);

    // Current Selected Employee Object
    const currentEmployee = useMemo(() => {
        if (!selectedEmpId || selectedEmpId === "ALL") return null;
        return employees.find(e => String(e.id) === String(selectedEmpId)) || null;
    }, [employees, selectedEmpId]);

    // Active Employees for Navigation & Selection
    const activeEmployees = useMemo(() => {
        return employees.filter(e => e.is_active !== false);
    }, [employees]);

    // Navigate to Prev / Next Staff
    const handlePrevStaff = () => {
        if (!activeEmployees.length) return;
        const currentIndex = activeEmployees.findIndex(e => String(e.id) === String(selectedEmpId));
        if (currentIndex <= 0) {
            setSelectedEmpId(String(activeEmployees[activeEmployees.length - 1].id));
        } else {
            setSelectedEmpId(String(activeEmployees[currentIndex - 1].id));
        }
    };

    const handleNextStaff = () => {
        if (!activeEmployees.length) return;
        const currentIndex = activeEmployees.findIndex(e => String(e.id) === String(selectedEmpId));
        if (currentIndex === -1 || currentIndex >= activeEmployees.length - 1) {
            setSelectedEmpId(String(activeEmployees[0].id));
        } else {
            setSelectedEmpId(String(activeEmployees[currentIndex + 1].id));
        }
    };

    // -------------------------------------------------------------------------
    // 1. DATA PROCESSING: Group raw logs into Daily Paired Shifts
    // -------------------------------------------------------------------------
    const pairedDailyShifts = useMemo(() => {
        if (!currentEmployee || !individualLogs.length) return [];

        // Sort logs ascending by timestamp
        const sortedLogs = [...individualLogs].sort(
            (a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        );

        // Group by logical work date (taking overnight checkout into account)
        const dateMap = new Map();

        sortedLogs.forEach(log => {
            const logDate = new Date(log.timestamp);
            const dateStr = format(logDate, "yyyy-MM-dd");
            const hour = logDate.getHours();

            // Check if overnight checkout (between 00:00 and 06:00)
            let shiftDateKey = dateStr;
            if (log.action_type === "check_out" && hour >= 0 && hour < 6) {
                const yesterdayStr = format(subDays(logDate, 1), "yyyy-MM-dd");
                // If yesterday exists in map with an open check_in, attach to yesterday
                if (dateMap.has(yesterdayStr)) {
                    shiftDateKey = yesterdayStr;
                }
            }

            if (!dateMap.has(shiftDateKey)) {
                dateMap.set(shiftDateKey, []);
            }
            dateMap.get(shiftDateKey).push(log);
        });

        // Convert Map into structured daily records
        const results = [];

        dateMap.forEach((logsOnDate, dateStr) => {
            const dateObj = parseISO(dateStr);
            const checkIns = logsOnDate.filter(l => l.action_type === "check_in");
            const checkOuts = logsOnDate.filter(l => l.action_type === "check_out");
            const firstCheckIn = checkIns[0] || null;
            const lastCheckOut = checkOuts[checkOuts.length - 1] || null;

            // Scheduled Shift for this date (from roster_transactions or weekly template)
            const tx = transactions.find(t => 
                String(t.employee_id) === String(selectedEmpId) && t.date === dateStr
            );

            let scheduledShift = null;
            let isOffDay = false;

            if (tx) {
                isOffDay = tx.is_off;
                if (tx.shift_id) {
                    scheduledShift = shifts.find(s => s.id === tx.shift_id) || tx.shifts;
                }
            } else {
                const dayOfWeek = dateObj.getDay();
                const sched = schedules[selectedEmpId]?.[dayOfWeek];
                if (sched) {
                    isOffDay = sched.is_off;
                    scheduledShift = sched.shifts;
                }
            }

            // Calculate duration in minutes and hours
            let workMinutes = 0;
            let durationText = "-";
            if (firstCheckIn && lastCheckOut) {
                const inTime = new Date(firstCheckIn.timestamp);
                const outTime = new Date(lastCheckOut.timestamp);
                const diff = differenceInMinutes(outTime, inTime);
                if (diff > 0) {
                    workMinutes = diff;
                    const hrs = Math.floor(diff / 60);
                    const mins = diff % 60;
                    durationText = `${hrs} ชม. ${mins > 0 ? `${mins} น.` : ''}`;
                }
            }

            // Punctuality & Status Calculation
            let statusBadge = { label: "ปกติ", color: "slate" };
            let isLate = false;
            let lateMinutes = 0;

            if (firstCheckIn) {
                const checkInDate = new Date(firstCheckIn.timestamp);
                if (isOffDay) {
                    statusBadge = { label: "ทำงานวันหยุด", color: "purple" };
                } else if (scheduledShift?.start_time) {
                    const [sh, sm] = scheduledShift.start_time.split(":");
                    const shiftStart = new Date(checkInDate);
                    shiftStart.setHours(parseInt(sh, 10), parseInt(sm, 10), 0, 0);

                    const diff = differenceInMinutes(checkInDate, shiftStart);
                    if (diff > 15) {
                        isLate = true;
                        lateMinutes = diff;
                        statusBadge = { label: `สาย +${diff} นาที`, color: "amber" };
                    } else {
                        statusBadge = { label: "ตรงเวลา", color: "emerald" };
                    }
                } else {
                    statusBadge = { label: "เข้างานปกติ", color: "emerald" };
                }
            } else if (logsOnDate.some(l => l.action_type === "absent")) {
                statusBadge = { label: "ขาดงาน", color: "rose" };
            }

            // Check if there was an approved leave on this date
            const leaveOnDate = leaveRequests.find(l => 
                String(l.employee_id) === String(selectedEmpId) && 
                l.leave_date === dateStr &&
                l.status === "approved"
            );

            results.push({
                dateStr,
                dateObj,
                logs: logsOnDate,
                firstCheckIn,
                lastCheckOut,
                scheduledShift,
                isOffDay,
                workMinutes,
                durationText,
                statusBadge,
                isLate,
                lateMinutes,
                leaveOnDate,
                isMissingCheckout: !!(firstCheckIn && !lastCheckOut)
            });
        });

        // Sort descending by date
        return results.sort((a, b) => b.dateObj.getTime() - a.dateObj.getTime());
    }, [currentEmployee, individualLogs, transactions, shifts, schedules, selectedEmpId, leaveRequests]);

    // -------------------------------------------------------------------------
    // 2. DETAILED SUMMARY METRICS
    // -------------------------------------------------------------------------
    const summaryMetrics = useMemo(() => {
        const totalWorkDays = pairedDailyShifts.filter(s => s.firstCheckIn).length;
        const totalMinutes = pairedDailyShifts.reduce((acc, s) => acc + s.workMinutes, 0);
        const totalHours = (totalMinutes / 60).toFixed(1);
        const avgHoursPerDay = totalWorkDays > 0 ? (totalMinutes / 60 / totalWorkDays).toFixed(1) : 0;

        const lateCount = pairedDailyShifts.filter(s => s.isLate).length;
        const onTimeCount = totalWorkDays - lateCount;
        const onTimeRate = totalWorkDays > 0 ? Math.round((onTimeCount / totalWorkDays) * 100) : 100;

        const offDayWorkCount = pairedDailyShifts.filter(s => s.isOffDay && s.firstCheckIn).length;
        const missingCheckoutCount = pairedDailyShifts.filter(s => s.isMissingCheckout).length;

        // Count approved leaves for selected employee this month
        const approvedLeaves = leaveRequests.filter(l => 
            String(l.employee_id) === String(selectedEmpId) && l.status === "approved"
        ).length;

        return {
            totalWorkDays,
            totalHours,
            avgHoursPerDay,
            lateCount,
            onTimeRate,
            offDayWorkCount,
            missingCheckoutCount,
            approvedLeaves
        };
    }, [pairedDailyShifts, leaveRequests, selectedEmpId]);

    // -------------------------------------------------------------------------
    // 3. FILTERED SHIFTS
    // -------------------------------------------------------------------------
    const filteredShifts = useMemo(() => {
        return pairedDailyShifts.filter(s => {
            // Status Filter
            if (statusFilter === "ON_TIME" && s.isLate) return false;
            if (statusFilter === "LATE" && !s.isLate) return false;
            if (statusFilter === "OFF_DAY" && !s.isOffDay) return false;
            if (statusFilter === "MISSING_OUT" && !s.isMissingCheckout) return false;
            if (statusFilter === "LEAVE" && !s.leaveOnDate) return false;

            // Search Query Filter
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchDate = s.dateStr.includes(q) || formatDate(s.dateObj).toLowerCase().includes(q);
                const matchNote = s.logs.some(l => 
                    (l.mood_status && l.mood_status.toLowerCase().includes(q)) ||
                    (l.mood_note && l.mood_note.toLowerCase().includes(q))
                );
                const matchShift = s.scheduledShift?.name?.toLowerCase().includes(q);
                if (!matchDate && !matchNote && !matchShift) return false;
            }

            return true;
        });
    }, [pairedDailyShifts, statusFilter, searchQuery]);

    // Filtered Raw Logs
    const filteredRawLogs = useMemo(() => {
        return individualLogs.filter(log => {
            if (searchQuery.trim()) {
                const q = searchQuery.toLowerCase();
                const matchAction = log.action_type.toLowerCase().includes(q);
                const matchTime = log.timestamp.toLowerCase().includes(q);
                const matchMood = log.mood_status?.toLowerCase().includes(q) || log.mood_note?.toLowerCase().includes(q);
                if (!matchAction && !matchTime && !matchMood) return false;
            }
            return true;
        });
    }, [individualLogs, searchQuery]);

    // -------------------------------------------------------------------------
    // 4. EXPORT TO EXCEL
    // -------------------------------------------------------------------------
    const handleExportExcel = () => {
        if (!currentEmployee || !pairedDailyShifts.length) {
            alert("ไม่มีข้อมูลสำหรับการส่งออกไฟล์");
            return;
        }

        setIsExporting(true);
        try {
            const excelRows = pairedDailyShifts.map(item => ({
                "วันที่": item.dateStr,
                "วันในสัปดาห์": format(item.dateObj, "EEEE", { locale: th }),
                "ชื่อพนักงาน": currentEmployee.name,
                "ชื่อเล่น": currentEmployee.nickname || "-",
                "กะงานที่กำหนด": item.scheduledShift ? `${item.scheduledShift.name} (${item.scheduledShift.start_time} - ${item.scheduledShift.end_time})` : (item.isOffDay ? "วันหยุด" : "-"),
                "เวลาเข้างาน": item.firstCheckIn ? formatTime(item.firstCheckIn.timestamp) : "-",
                "เวลาออกงาน": item.lastCheckOut ? formatTime(item.lastCheckOut.timestamp) : "-",
                "ชั่วโมงทำงานจริง": item.durationText,
                "นาทีรวม": item.workMinutes,
                "สถานะการเข้างาน": item.statusBadge.label,
                "สาย (นาที)": item.lateMinutes || 0,
                "หมายเหตุ / อารมณ์": item.firstCheckIn?.mood_note || item.firstCheckIn?.mood_status || "-"
            }));

            const worksheet = XLSX.utils.json_to_sheet(excelRows);
            const workbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(workbook, worksheet, "Attendance History");

            // Format column widths
            worksheet["!cols"] = [
                { wch: 12 }, { wch: 15 }, { wch: 22 }, { wch: 12 },
                { wch: 28 }, { wch: 12 }, { wch: 12 }, { wch: 16 },
                { wch: 10 }, { wch: 20 }, { wch: 12 }, { wch: 30 }
            ];

            const fileName = `Attendance_${currentEmployee.nickname || currentEmployee.name}_${selectedMonth}.xlsx`;
            XLSX.writeFile(workbook, fileName);
        } catch (error) {
            console.error("Export Error:", error);
            alert("เกิดข้อผิดพลาดในการส่งออกไฟล์ Excel: " + error.message);
        } finally {
            setIsExporting(false);
        }
    };

    // -------------------------------------------------------------------------
    // RENDER: EMPTY STATE IF NO STAFF SELECTED
    // -------------------------------------------------------------------------
    if (!selectedEmpId || selectedEmpId === "ALL") {
        return (
            <div className="space-y-6">
                {/* Header Banner */}
                <div className="bg-cream p-6 border border-rule">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                        <div>
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 bg-plum"></span>
                                <h2 className="text-base font-semibold text-charcoal">
                                    ประวัติการเข้างานรายคน
                                </h2>
                            </div>
                            <p className="text-xs text-neutral mt-1">
                                เลือกพนักงานเพื่อเรียกดูสถิติการลงเวลา บันทึกการเข้า-ออกงาน และตรวจสอบภาพถ่ายยืนยันตัวตน
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(e.target.value)}
                                className="bg-cream border border-charcoal px-3 py-1.5 font-num text-xs font-semibold text-charcoal outline-none cursor-pointer"
                            />
                        </div>
                    </div>
                </div>

                {/* Staff Selection Grid */}
                <Card className="p-6">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-rule">
                        <span className="text-xs font-semibold text-charcoal flex items-center gap-2">
                                                        เลือกพนักงานเพื่อดูประวัติ ({activeEmployees.length} คน)
                        </span>
                        <span className="text-xs text-neutral">
                            คลิกที่การ์ดพนักงานเพื่อเปิดประวัติทันที
                        </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                        {activeEmployees.map(emp => (
                            <button
                                key={emp.id}
                                onClick={() => setSelectedEmpId(String(emp.id))}
                                className="flex items-center gap-3 p-3 text-left bg-cream hover:bg-cream border border-rule hover:border-plum transition-colors duration-150 duration-150 group cursor-pointer"
                            >
                                <StaffAvatar employee={emp} className="w-10 h-10" />
                                <div className="min-w-0 flex-1">
                                    <div className="font-num font-semibold text-xs text-charcoal group-hover:text-plum truncate">
                                        {emp.nickname ? `${emp.nickname} · ${emp.name}` : emp.name}
                                    </div>
                                    <div className="text-xs font-num text-neutral truncate mt-0.5">
                                        {emp.position || "Staff"} · {emp.employment_status || "Fulltime"}
                                    </div>
                                </div>
                                                            </button>
                        ))}
                    </div>
                </Card>
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // RENDER: ACTIVE STAFF HISTORY DASHBOARD
    // -------------------------------------------------------------------------
    return (
        <div className="space-y-6">
            {/* 1. TOP CONTROL & STAFF PROFILE BAR */}
            <div className="bg-cream p-5 border border-rule">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                    {/* Staff Profile & Navigation */}
                    <div className="flex items-center gap-3">
                        <StaffAvatar employee={currentEmployee} className="w-14 h-14" textClassName="text-xl" />
                        <div>
                            <div className="flex items-center gap-2 flex-wrap">
                                <h2 className="text-base font-num font-semibold text-charcoal">
                                    {currentEmployee?.nickname ? `${currentEmployee.nickname} (${currentEmployee.name})` : currentEmployee?.name}
                                </h2>
                                <Badge color="blue">
                                    {currentEmployee?.position || "พนักงาน"}
                                </Badge>
                                <Badge color={currentEmployee?.employment_status === "Probation" ? "amber" : "slate"}>
                                    {currentEmployee?.employment_status || "Fulltime"}
                                </Badge>
                            </div>
                            <div className="flex items-center gap-4 text-xs font-num text-neutral mt-1 flex-wrap">
                                <span>รหัส: #{currentEmployee?.id}</span>
                                {currentEmployee?.phone && <span>โทร: {currentEmployee.phone}</span>}
                                <span>กะประจำ: {currentEmployee?.shift_rates?.wage_type === 'monthly' ? 'เงินเดือน' : 'รายวัน/ชั่วโมง'}</span>
                            </div>
                        </div>
                    </div>

                    {/* Controls: Prev/Next, Staff Dropdown, Month Picker, Export */}
                    <div className="flex items-center gap-2 flex-wrap">
                        {/* Prev / Next Stepper */}
                        <div className="flex items-center border border-rule bg-cream overflow-hidden">
                            <button
                                onClick={handlePrevStaff}
                                title="พนักงานคนก่อนหน้า"
                                className="hover:bg-cream text-charcoal transition-colors cursor-pointer border-r border-rule min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                            >← ก่อนหน้า</button>
                            <select
                                value={selectedEmpId}
                                onChange={e => setSelectedEmpId(e.target.value)}
                                className="p-2 font-num text-xs font-semibold text-charcoal bg-transparent outline-none cursor-pointer max-w-[160px]"
                            >
                                {activeEmployees.map(e => (
                                    <option key={e.id} value={e.id}>
                                        {e.nickname || e.name}
                                    </option>
                                ))}
                            </select>
                            <button
                                onClick={handleNextStaff}
                                title="พนักงานคนถัดไป"
                                className="hover:bg-cream text-charcoal transition-colors cursor-pointer border-l border-rule min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                            >ถัดไป →</button>
                        </div>

                        {/* Month Selector */}
                        <input
                            type="month"
                            value={selectedMonth}
                            onChange={e => setSelectedMonth(e.target.value)}
                            className="bg-cream border border-charcoal px-3 py-2 font-num text-xs font-semibold text-charcoal outline-none cursor-pointer"
                        />

                        {/* Export Button */}
                        <button
                            onClick={handleExportExcel}
                            disabled={isExporting}
                            className="flex items-center gap-1.5 px-3 py-2 bg-cream hover:bg-cream text-charcoal border border-rule font-num text-xs font-semibold transition-colors cursor-pointer"
                            title="ดาวน์โหลด Excel"
                        >
                                                        <span className="hidden sm:inline">Excel</span>
                        </button>

                        {/* Manual Punch Button */}
                        <button
                            onClick={() => {
                                if (setManualForm) {
                                    setManualForm(prev => ({ ...prev, empId: selectedEmpId }));
                                }
                                if (setShowManualModal) setShowManualModal(true);
                            }}
                            className="flex items-center gap-1.5 px-3 py-2 bg-plum hover:bg-plum-2 text-cream font-num text-xs font-semibold tactile-btn cursor-pointer"
                        >
                                                        <span className="hidden sm:inline">ลงเวลาย้อนหลัง</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* 2. SUMMARY METRIC CARDS (4 Columns) */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {/* Work Days */}
                <Card className="p-4 border border-rule bg-cream">
                    <div className="flex items-center justify-between text-neutral mb-2">
                        <span className="text-xs font-semibold">วันทำงานจริง</span>
                                            </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-num font-semibold text-charcoal">
                            {summaryMetrics.totalWorkDays}
                        </span>
                        <span className="text-xs text-neutral">วัน</span>
                    </div>
                    <div className="text-xs text-neutral mt-1">
                        รวม {summaryMetrics.totalHours} ชม. (เฉลี่ย {summaryMetrics.avgHoursPerDay} ชม./วัน)
                    </div>
                </Card>

                {/* On-Time Rate */}
                <Card className="p-4 border border-rule bg-cream">
                    <div className="flex items-center justify-between text-neutral mb-2">
                        <span className="text-xs font-semibold">อัตราตรงเวลา</span>
                                            </div>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-num font-semibold ${summaryMetrics.lateCount > 0 ? "text-plum" : "text-charcoal"}`}>
                            {summaryMetrics.onTimeRate}%
                        </span>
                    </div>
                    <div className="text-xs text-neutral mt-1">
                        {summaryMetrics.lateCount > 0 ? `เข้าสาย ${summaryMetrics.lateCount} ครั้ง` : "เข้างานตรงเวลา 100% "}
                    </div>
                </Card>

                {/* Off-Day & Special Shifts */}
                <Card className="p-4 border border-rule bg-cream">
                    <div className="flex items-center justify-between text-neutral mb-2">
                        <span className="text-xs font-semibold">งานนอกกะ / วันหยุด</span>
                                            </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-num font-semibold text-charcoal">
                            {summaryMetrics.offDayWorkCount}
                        </span>
                        <span className="text-xs text-neutral">กะ</span>
                    </div>
                    <div className="text-xs text-neutral mt-1">
                        {summaryMetrics.missingCheckoutCount > 0 ? `ลืมสแกนออก ${summaryMetrics.missingCheckoutCount} วัน` : "สแกนครบทุกกะงาน"}
                    </div>
                </Card>

                {/* Approved Leaves & Absences */}
                <Card className="p-4 border border-rule bg-cream">
                    <div className="flex items-center justify-between text-neutral mb-2">
                        <span className="text-xs font-semibold">การลา / ขาดงาน</span>
                                            </div>
                    <div className="flex items-baseline gap-2">
                        <span className={`text-2xl font-num font-semibold ${summaryMetrics.approvedLeaves > 0 ? "text-plum" : "text-charcoal"}`}>
                            {summaryMetrics.approvedLeaves}
                        </span>
                        <span className="text-xs text-neutral">วันลา</span>
                    </div>
                    <div className="text-xs text-neutral mt-1">
                        {individualStats.absent > 0 ? `ขาดงาน ${individualStats.absent} วัน` : "ไม่มีประวัติขาดงาน"}
                    </div>
                </Card>
            </div>

            {/* 3. TOOLBAR: VIEW TOGGLE & STATUS FILTERS */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-cream p-3 border border-rule">
                {/* View Tabs */}
                <div className="flex items-center gap-1 bg-cream p-1 border border-rule">
                    <button
                        onClick={() => setViewMode("shifts")}
                        className={`px-3 py-1.5 font-num text-xs font-semibold transition-colors cursor-pointer ${
 viewMode === "shifts"
 ? "bg-cream text-charcoal border border-rule"
 : "text-neutral hover:text-charcoal"
 }`}
                    >
                        กะงานรายวัน
                    </button>
                    <button
                        onClick={() => setViewMode("raw")}
                        className={`px-3 py-1.5 font-num text-xs font-semibold transition-colors cursor-pointer ${
 viewMode === "raw"
 ? "bg-cream text-charcoal border border-rule"
 : "text-neutral hover:text-charcoal"
 }`}
                    >
                        ประวัติสแกนทั้งหมด
                    </button>
                </div>

                {/* Filter & Search */}
                <div className="flex items-center gap-2 flex-wrap">
                    {/* Status Filter Chips (only on shifts view) */}
                    {viewMode === "shifts" && (
                        <div className="flex items-center gap-1 text-xs overflow-x-auto pb-1 sm:pb-0">
                            {[
                                { id: "ALL", label: "ทั้งหมด" },
                                { id: "ON_TIME", label: "ตรงเวลา" },
                                { id: "LATE", label: "สาย" },
                                { id: "OFF_DAY", label: "วันหยุด" },
                                { id: "MISSING_OUT", label: "ยังไม่สแกนออก" }
                            ].map(filter => (
                                <button
                                    key={filter.id}
                                    onClick={() => setStatusFilter(filter.id)}
                                    className={`px-2.5 py-1 font-semibold transition-colors cursor-pointer border ${
 statusFilter === filter.id
 ? "bg-plum text-cream border-plum"
 : "bg-cream text-neutral border-rule hover:text-charcoal"
 }`}
                                >
                                    {filter.label}
                                </button>
                            ))}
                        </div>
                    )}

                    {/* Search Input */}
                    <div className="relative flex-1 sm:w-44">
                                                <input
                            type="text"
                            placeholder="ค้นหาวันที่ / บันทึก..."
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            className="w-full bg-cream border border-rule pl-8 pr-3 py-1 font-num text-xs text-charcoal outline-none focus:border-plum"
                        />
                    </div>
                </div>
            </div>

            {/* 4. MAIN CONTENT AREA: VIEW MODE 1 - PAIRED DAILY SHIFTS */}
            {viewMode === "shifts" && (
                <Card className="p-0 overflow-hidden border border-rule">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-cream border-b border-rule font-num font-semibold text-xs text-neutral">
                                    <th className="py-3 px-4">วันที่</th>
                                    <th className="py-3 px-4">กะที่กำหนด</th>
                                    <th className="py-3 px-4">เข้างาน</th>
                                    <th className="py-3 px-4">ออกงาน</th>
                                    <th className="py-3 px-4">ชั่วโมงทำงาน</th>
                                    <th className="py-3 px-4">สถานะ</th>
                                    <th className="py-3 px-4">ความรู้สึก / บันทึก</th>
                                    <th className="py-3 px-4 text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rule font-num">
                                {filteredShifts.length === 0 ? (
                                    <tr>
                                        <td colSpan={8} className="py-12 text-center text-neutral text-xs">
                                            ไม่พบข้อมูลการเข้างานตามเงื่อนไขที่เลือก
                                        </td>
                                    </tr>
                                ) : (
                                    filteredShifts.map((dayItem) => {
                                        const { 
                                            dateStr, dateObj, firstCheckIn, lastCheckOut, 
                                            scheduledShift, isOffDay, durationText, 
                                            statusBadge, isLate, isMissingCheckout 
                                        } = dayItem;

                                        return (
                                            <tr key={dateStr} className="hover:bg-paper-2 transition-colors">
                                                {/* Date & Day */}
                                                <td className="py-3 px-4 font-semibold text-charcoal whitespace-nowrap">
                                                    <div>{formatDate(dateObj)}</div>
                                                    <div className="text-xs text-neutral font-normal">
                                                        {format(dateObj, "EEEE", { locale: th })}
                                                    </div>
                                                </td>

                                                {/* Scheduled Shift */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    {scheduledShift ? (
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="w-2 h-2 bg-plum" />
                                                            <span className="font-semibold text-charcoal">
                                                                {scheduledShift.name}
                                                            </span>
                                                            <span className="text-xs text-neutral">
                                                                ({scheduledShift.start_time} - {scheduledShift.end_time})
                                                            </span>
                                                        </div>
                                                    ) : isOffDay ? (
                                                        <Badge color="purple">วันหยุด</Badge>
                                                    ) : (
                                                        <span className="text-neutral">-</span>
                                                    )}
                                                </td>

                                                {/* Check In */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    {firstCheckIn ? (
                                                        <div className="flex items-center gap-2">
                                                            {firstCheckIn.photo_url ? (
                                                                <button
                                                                    onClick={() => setSelectedPhoto(firstCheckIn)}
                                                                    title="ดูภาพถ่ายเข้างาน"
                                                                    className="relative group/pic cursor-pointer"
                                                                >
                                                                    <img
                                                                        src={firstCheckIn.photo_url}
                                                                        alt="Check In"
                                                                        className="w-7 h-7 object-cover border border-rule group-hover/pic:border-plum"
                                                                    />
                                                                                                                                    </button>
                                                            ) : (
                                                                <span className="w-7 h-7 bg-cream border border-rule flex items-center justify-center text-neutral">
                                                                                                                                    </span>
                                                            )}
                                                            <div>
                                                                <span className="font-semibold text-charcoal">
                                                                    {formatTime(firstCheckIn.timestamp)}
                                                                </span>
                                                                {firstCheckIn.verification_method && (
                                                                    <div className="text-xs text-neutral">
                                                                        {firstCheckIn.verification_method}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <span className="text-neutral">-</span>
                                                    )}
                                                </td>

                                                {/* Check Out */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    {lastCheckOut ? (
                                                        <div className="flex items-center gap-2">
                                                            {lastCheckOut.photo_url ? (
                                                                <button
                                                                    onClick={() => setSelectedPhoto(lastCheckOut)}
                                                                    title="ดูภาพถ่ายออกงาน"
                                                                    className="relative group/pic cursor-pointer"
                                                                >
                                                                    <img
                                                                        src={lastCheckOut.photo_url}
                                                                        alt="Check Out"
                                                                        className="w-7 h-7 object-cover border border-rule group-hover/pic:border-plum"
                                                                    />
                                                                                                                                    </button>
                                                            ) : (
                                                                <span className="w-7 h-7 bg-cream border border-rule flex items-center justify-center text-neutral">
                                                                                                                                    </span>
                                                            )}
                                                            <div>
                                                                <span className="font-semibold text-charcoal">
                                                                    {formatTime(lastCheckOut.timestamp)}
                                                                </span>
                                                                {new Date(lastCheckOut.timestamp).getHours() < 6 && (
                                                                    <span className="text-xs text-plum block">
                                                                        กะข้ามคืน
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ) : isMissingCheckout ? (
                                                        <span className="text-xs text-plum font-semibold bg-plum/10 px-2 py-0.5">
                                                            ยังไม่สแกนออก
                                                        </span>
                                                    ) : (
                                                        <span className="text-neutral">-</span>
                                                    )}
                                                </td>

                                                {/* Work Duration */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <span className="font-semibold text-charcoal">
                                                        {durationText}
                                                    </span>
                                                </td>

                                                {/* Status Badge */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <Badge color={statusBadge.color}>
                                                        {statusBadge.label}
                                                    </Badge>
                                                </td>

                                                {/* Mood & Notes */}
                                                <td className="py-3 px-4 max-w-[200px] truncate text-neutral text-xs">
                                                    {firstCheckIn?.mood_status || firstCheckIn?.mood_note ? (
                                                        <div className="flex items-center gap-1.5 truncate">
                                                            {firstCheckIn.mood_status && (
                                                                <span className="text-xs">{firstCheckIn.mood_status}</span>
                                                            )}
                                                            {firstCheckIn.mood_note && (
                                                                <span className="truncate text-charcoal">
                                                                    {firstCheckIn.mood_note}
                                                                </span>
                                                            )}
                                                        </div>
                                                    ) : (
                                                        <span className="text-neutral/50">-</span>
                                                    )}
                                                </td>

                                                {/* Row Actions */}
                                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                                    {firstCheckIn && (
                                                        <div className="flex items-center justify-end gap-1">
                                                            <button
                                                                onClick={() => handleToggleLogAction && handleToggleLogAction(firstCheckIn)}
                                                                title="สลับสถานะ เข้า/ออก"
                                                                className="text-neutral hover:text-plum hover:bg-cream transition-colors cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                                            >สลับ</button>
                                                            <button
                                                                onClick={() => handleDeleteLog && handleDeleteLog(firstCheckIn.id)}
                                                                title="ลบรายการสแกนนี้"
                                                                className="hover:bg-cream transition-colors cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline text-error"
                                                            >ลบ</button>
                                                        </div>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* 4. MAIN CONTENT AREA: VIEW MODE 2 - RAW LOG TIMELINE */}
            {viewMode === "raw" && (
                <Card className="p-0 overflow-hidden border border-rule">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-cream border-b border-rule font-num font-semibold text-xs text-neutral">
                                    <th className="py-3 px-4">วันและเวลา</th>
                                    <th className="py-3 px-4">การกระทำ</th>
                                    <th className="py-3 px-4">สถานะกะ</th>
                                    <th className="py-3 px-4">ภาพถ่าย</th>
                                    <th className="py-3 px-4">วิธีระบุตัวตน</th>
                                    <th className="py-3 px-4">อารมณ์ / หมายเหตุ</th>
                                    <th className="py-3 px-4 text-right">จัดการ</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rule font-num">
                                {filteredRawLogs.length === 0 ? (
                                    <tr>
                                        <td colSpan={7} className="py-12 text-center text-neutral text-xs">
                                            ไม่พบประวัติการสแกนในเดือนนี้
                                        </td>
                                    </tr>
                                ) : (
                                    filteredRawLogs.map(log => {
                                        const shiftStatus = getShiftStatus ? getShiftStatus(log) : { label: "ปกติ", color: "slate" };
                                        const isCheckIn = log.action_type === "check_in";

                                        return (
                                            <tr key={log.id} className="hover:bg-paper-2 transition-colors">
                                                {/* Timestamp */}
                                                <td className="py-3 px-4 font-semibold text-charcoal whitespace-nowrap">
                                                    {formatDate(log.timestamp)} {formatTime(log.timestamp)}
                                                </td>

                                                {/* Action */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <Badge color={isCheckIn ? "blue" : log.action_type === "absent" ? "rose" : "slate"}>
                                                        {isCheckIn ? "CHECK IN (เข้างาน)" : log.action_type === "absent" ? "ABSENT (ขาดงาน)" : "CHECK OUT (ออกงาน)"}
                                                    </Badge>
                                                </td>

                                                {/* Shift Status */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    <Badge color={shiftStatus.color}>
                                                        {shiftStatus.label}
                                                    </Badge>
                                                </td>

                                                {/* Photo Thumbnail */}
                                                <td className="py-3 px-4 whitespace-nowrap">
                                                    {log.photo_url ? (
                                                        <button
                                                            onClick={() => setSelectedPhoto(log)}
                                                            className="flex items-center gap-1.5 text-plum hover:underline cursor-pointer"
                                                        >
                                                            <img
                                                                src={log.photo_url}
                                                                alt=""
                                                                className="w-6 h-6 object-cover border border-rule"
                                                            />
                                                            <span className="text-xs">ดูรูป</span>
                                                        </button>
                                                    ) : (
                                                        <span className="text-neutral/50 text-xs">-</span>
                                                    )}
                                                </td>

                                                {/* Verification Method */}
                                                <td className="py-3 px-4 whitespace-nowrap text-neutral text-xs">
                                                    <div className="flex items-center gap-1">
                                                                                                                <span>{log.verification_method || "GPS"}</span>
                                                        {log.accuracy_meters && (
                                                            <span className="text-xs">({Math.round(log.accuracy_meters)}m)</span>
                                                        )}
                                                    </div>
                                                </td>

                                                {/* Mood / Note */}
                                                <td className="py-3 px-4 max-w-[200px] truncate text-neutral text-xs">
                                                    {log.mood_status || log.mood_note ? (
                                                        <div className="truncate">
                                                            <span className="font-semibold text-charcoal mr-1">{log.mood_status}</span>
                                                            <span className="text-neutral">{log.mood_note}</span>
                                                        </div>
                                                    ) : (
                                                        <span className="text-neutral/50">-</span>
                                                    )}
                                                </td>

                                                {/* Actions */}
                                                <td className="py-3 px-4 text-right whitespace-nowrap">
                                                    <div className="flex items-center justify-end gap-1">
                                                        <button
                                                            onClick={() => handleToggleLogAction && handleToggleLogAction(log)}
                                                            title="สลับสถานะ"
                                                            className="text-neutral hover:text-plum hover:bg-cream transition-colors cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                                        >สลับ</button>
                                                        <button
                                                            onClick={() => handleDeleteLog && handleDeleteLog(log.id)}
                                                            title="ลบ"
                                                            className="hover:bg-cream transition-colors cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline text-error"
                                                        >ลบ</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        );
                                    })
                                )}
                            </tbody>
                        </table>
                    </div>
                </Card>
            )}

            {/* 5. PHOTO LIGHTBOX MODAL */}
            {selectedPhoto && (
                <div 
                    className="fixed inset-0 z-50 bg-charcoal/70 flex items-center justify-center p-4"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <div 
                        className="bg-cream border border-charcoal max-w-md w-full overflow-hidden"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="p-3 border-b border-rule flex items-center justify-between bg-cream">
                            <div className="flex items-center gap-2">
                                                                <span className="text-xs font-semibold text-charcoal">
                                    หลักฐานการสแกน · {selectedPhoto.action_type === 'check_in' ? 'เข้างาน' : 'ออกงาน'}
                                </span>
                            </div>
                            <button
                                onClick={() => setSelectedPhoto(null)}
                                className="text-neutral hover:text-charcoal cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                            >ปิด</button>
                        </div>

                        <div className="p-4 bg-cream flex items-center justify-center">
                            <img
                                src={selectedPhoto.photo_url}
                                alt="Attendance Proof"
                                className="max-h-[360px] w-auto object-contain border border-rule"
                            />
                        </div>

                        <div className="p-4 space-y-2 font-num text-xs border-t border-rule">
                            <div className="flex justify-between">
                                <span className="text-neutral">เวลาสแกน:</span>
                                <span className="font-semibold text-charcoal">
                                    {formatDate(selectedPhoto.timestamp)} {formatTime(selectedPhoto.timestamp)}
                                </span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-neutral">วิธีระบุตัวตน:</span>
                                <span className="font-semibold text-charcoal">
                                    {selectedPhoto.verification_method || "GPS"}
                                    {selectedPhoto.accuracy_meters && ` (รัศมี ${Math.round(selectedPhoto.accuracy_meters)} ม.)`}
                                </span>
                            </div>
                            {selectedPhoto.mood_status && (
                                <div className="flex justify-between">
                                    <span className="text-neutral">อารมณ์ / หมายเหตุ:</span>
                                    <span className="text-charcoal">
                                        {selectedPhoto.mood_status} {selectedPhoto.mood_note ? `- ${selectedPhoto.mood_note}` : ''}
                                    </span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
