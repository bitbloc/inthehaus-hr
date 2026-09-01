"use client";
import React, { useState, useMemo, useEffect } from "react";
import { format, parseISO, differenceInMinutes, subDays, isToday, isFuture, isPast } from "date-fns";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/HausIcon";
import { getEffectiveDailyRoster } from "../../../utils/roster_logic";
import { formatDate, formatCurrency, formatTime } from "../../../utils/format";

// Graceful Staff Avatar Component handling image loading errors & Dieter Rams initial fallbacks
function StaffAvatar({ employee, className = "w-10 h-10", textClassName = "text-sm", isWorking = false }) {
    const [imgError, setImgError] = useState(false);
    const photoUrl = employee?.photo_url;

    useEffect(() => {
        setImgError(false);
    }, [photoUrl]);

    const initialChar = (employee?.name || employee?.nickname || "E").charAt(0);

    return (
        <div className="relative shrink-0">
            {photoUrl && !imgError ? (
                <img
                    src={photoUrl}
                    alt=""
                    onError={() => setImgError(true)}
                    referrerPolicy="no-referrer"
                    className={`${className} rounded-sm object-cover border border-rams-rule-light bg-rams-bg`}
                />
            ) : (
                <div className={`${className} rounded-sm bg-rams-ink text-rams-panel font-mono font-black ${textClassName} flex items-center justify-center border border-rams-rule select-none uppercase`}>
                    {initialChar}
                </div>
            )}
            {isWorking && (
                <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rams-green border-2 border-rams-panel flex items-center justify-center">
                    <span className="w-1.5 h-1.5 rounded-full bg-rams-green animate-ping"></span>
                </span>
            )}
        </div>
    );
}

export default function DashboardOverview({
    data,
    selectedMonth,
    setSelectedMonth,
    draftWeeks = [],
    dismissedDraftWeeks = [],
    setDismissedDraftWeeks,
    handlePublishRoster,
    handleDismissDraftWeek,
    handleNotify,
    handleFinalizeDay,
    setShowManualModal,
    setShowAdminLeaveModal,
    setEditingStaff,
    setShowStaffModal,
    handleLeaveAction,
    handleSwapDecision,
    handleToggleLogAction,
    handleDeleteLog,
    onTabChange
}) {
    // --- Local Filters & Interactive State ---
    const [activityFilter, setActivityFilter] = useState("today"); // 'today' | 'all' | 'check_in' | 'check_out' | 'late' | 'overnight'
    const [activitySearch, setActivitySearch] = useState("");
    const [activityLimit, setActivityLimit] = useState(15);
    const [rosterFilter, setRosterFilter] = useState("all"); // 'all' | 'on_duty' | 'upcoming' | 'completed' | 'late' | 'off'
    const [selectedPhoto, setSelectedPhoto] = useState(null); // lightbox

    const todayObj = new Date();
    const todayStr = format(todayObj, "yyyy-MM-dd");

    // --- 1. Calculate Today's Logs ---
    const todayLogs = useMemo(() => {
        return (data.logs || []).filter(log => {
            if (!log.timestamp) return false;
            return format(new Date(log.timestamp), "yyyy-MM-dd") === todayStr;
        });
    }, [data.logs, todayStr]);

    // --- 2. Calculate Effective Daily Roster for Today ---
    const todayEffectiveRoster = useMemo(() => {
        const activeEmployees = (data.employees || []).filter(e => e.is_active !== false);
        const roster = getEffectiveDailyRoster(
            activeEmployees,
            data.schedules || {},
            data.transactions || [],
            data.shifts || [],
            todayObj,
            { includeDrafts: true }
        );
        return roster;
    }, [data.employees, data.schedules, data.transactions, data.shifts, todayObj]);

    // Helper: Determine shift status for a log
    const getShiftStatusForLog = (log) => {
        const date = new Date(log.timestamp);
        const logDateLocalStr = format(date, 'yyyy-MM-dd');
        const hour = date.getHours();

        // Detect Overnight Check-out (punched between 00:00 and 06:00 AM)
        if (log.action_type === 'check_out' && hour >= 0 && hour < 6) {
            const yesterdayDate = subDays(date, 1);
            const yesterdayStr = format(yesterdayDate, 'yyyy-MM-dd');
            const priorCheckin = (data.logs || []).find(l =>
                String(l.employee_id) === String(log.employee_id) &&
                l.action_type === 'check_in' &&
                new Date(l.timestamp) < date &&
                (date - new Date(l.timestamp)) <= (18 * 60 * 60 * 1000)
            );
            const targetDateStr = priorCheckin ? format(new Date(priorCheckin.timestamp), 'yyyy-MM-dd') : yesterdayStr;
            const targetDateObj = parseISO(targetDateStr);

            return {
                label: `🌙 กะข้ามคืน (${formatDate(targetDateObj)})`,
                color: 'purple',
                isOvernight: true,
                shiftDate: targetDateStr
            };
        }

        // Check roster transactions
        const tx = (data.transactions || []).find(t =>
            String(t.employee_id) === String(log.employee_id) &&
            t.date === logDateLocalStr
        );

        if (tx) {
            if (tx.is_off) {
                return log.action_type === 'check_in'
                    ? { label: 'ทำงานวันหยุด', color: 'purple' }
                    : { label: 'ออกงาน', color: 'slate' };
            }
            const shift = (data.shifts || []).find(s => s.id === tx.shift_id);
            const startTimeStr = tx.custom_start_time || shift?.start_time;
            if (!startTimeStr) return { label: '-', color: 'slate' };

            const [sh, sm] = startTimeStr.split(':');
            const shiftStart = new Date(date);
            shiftStart.setHours(sh, sm, 0, 0);

            if (log.action_type === 'check_in') {
                const diff = differenceInMinutes(date, shiftStart);
                return diff > 15 ? { label: `สาย +${diff}น.`, color: 'amber', isLate: true, lateMinutes: diff } : { label: 'ตรงเวลา', color: 'emerald' };
            }
            return { label: 'ออกงาน', color: 'slate' };
        }

        // Fallback to weekly schedule
        const schedule = data.schedules?.[log.employee_id]?.[date.getDay()];
        if (!schedule) return { label: '-', color: 'slate' };
        if (schedule.is_off) {
            return log.action_type === 'check_in'
                ? { label: 'ทำงานวันหยุด', color: 'purple' }
                : { label: 'ออกงาน', color: 'slate' };
        }
        if (!schedule.shifts) return { label: '-', color: 'slate' };
        if (log.action_type === 'absent') return { label: 'ขาดงาน', color: 'rose' };

        const [sh, sm] = schedule.shifts.start_time.split(':');
        const shiftStart = new Date(date);
        shiftStart.setHours(sh, sm, 0, 0);

        if (log.action_type === 'check_in') {
            const diff = differenceInMinutes(date, shiftStart);
            return diff > 15 ? { label: `สาย +${diff}น.`, color: 'amber', isLate: true, lateMinutes: diff } : { label: 'ตรงเวลา', color: 'emerald' };
        }
        return { label: 'ออกงาน', color: 'slate' };
    };

    // --- 3. Live Floor Presence Matrix ---
    const liveFloorList = useMemo(() => {
        const list = [];
        const processedEmpIds = new Set();
        const now = new Date();

        // 1. Process scheduled employees
        todayEffectiveRoster.forEach(rosterItem => {
            const emp = rosterItem.employee;
            if (!emp) return;
            processedEmpIds.add(String(emp.id));

            // Find logs today for this employee
            const empLogsToday = todayLogs.filter(l => String(l.employee_id) === String(emp.id))
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            const latestLog = empLogsToday.length > 0 ? empLogsToday[empLogsToday.length - 1] : null;
            const firstCheckIn = empLogsToday.find(l => l.action_type === 'check_in');

            // Check if employee has approved leave today
            const isLeaveToday = (data.leaveRequests || []).some(lr =>
                String(lr.employee_id) === String(emp.id) &&
                lr.leave_date === todayStr &&
                lr.status === 'approved'
            );

            let statusCategory = 'OFF'; // 'ON_DUTY' | 'UPCOMING' | 'COMPLETED' | 'LATE' | 'OVERDUE' | 'LEAVE' | 'OFF'
            let statusLabel = 'วันหยุด';
            let statusBadgeColor = 'slate';
            let punchTime = null;
            let lateMins = 0;

            if (isLeaveToday) {
                statusCategory = 'LEAVE';
                statusLabel = 'ลาหยุด (Approved)';
                statusBadgeColor = 'rose';
            } else if (rosterItem.is_off) {
                if (latestLog && latestLog.action_type === 'check_in') {
                    statusCategory = 'ON_DUTY';
                    statusLabel = 'ทำงานวันหยุด (On Duty)';
                    statusBadgeColor = 'purple';
                    punchTime = latestLog.timestamp;
                } else if (latestLog && latestLog.action_type === 'check_out') {
                    statusCategory = 'COMPLETED';
                    statusLabel = 'ออกกะแล้ว (วันหยุด)';
                    statusBadgeColor = 'slate';
                    punchTime = latestLog.timestamp;
                } else {
                    statusCategory = 'OFF';
                    statusLabel = rosterItem.source === 'TRANSACTION' ? 'วันหยุดตามตาราง' : 'ไม่ได้ลงตาราง (OFF)';
                    statusBadgeColor = 'slate';
                }
            } else {
                // Scheduled Shift
                if (latestLog && latestLog.action_type === 'check_in') {
                    const statusInfo = getShiftStatusForLog(latestLog);
                    if (statusInfo.isLate) {
                        statusCategory = 'LATE';
                        statusLabel = `สาย +${statusInfo.lateMinutes}น. (On Duty)`;
                        statusBadgeColor = 'amber';
                        lateMins = statusInfo.lateMinutes;
                    } else {
                        statusCategory = 'ON_DUTY';
                        statusLabel = 'กำลังปฏิบัติงาน (On Duty)';
                        statusBadgeColor = 'emerald';
                    }
                    punchTime = latestLog.timestamp;
                } else if (latestLog && latestLog.action_type === 'check_out') {
                    statusCategory = 'COMPLETED';
                    statusLabel = 'ออกกะแล้ว';
                    statusBadgeColor = 'slate';
                    punchTime = latestLog.timestamp;
                } else {
                    // No logs yet -> Check start time vs now
                    if (rosterItem.start_time) {
                        const [sh, sm] = rosterItem.start_time.split(':');
                        const shiftStartDate = new Date(todayObj);
                        shiftStartDate.setHours(parseInt(sh, 10), parseInt(sm, 10), 0, 0);

                        const diffMins = differenceInMinutes(now, shiftStartDate);
                        if (diffMins > 30) {
                            statusCategory = 'OVERDUE';
                            statusLabel = `ยังไม่เข้ากะ (เกินเวลา +${diffMins}น.)`;
                            statusBadgeColor = 'rose';
                        } else {
                            statusCategory = 'UPCOMING';
                            statusLabel = `รอเข้ากะ (${rosterItem.start_time.slice(0, 5)})`;
                            statusBadgeColor = 'blue';
                        }
                    } else {
                        statusCategory = 'UPCOMING';
                        statusLabel = 'รอเข้ากะ';
                        statusBadgeColor = 'blue';
                    }
                }
            }

            list.push({
                employee: emp,
                roster: rosterItem,
                statusCategory,
                statusLabel,
                statusBadgeColor,
                latestLog,
                firstCheckIn,
                punchTime,
                lateMins,
                shiftName: rosterItem.is_off ? 'OFF' : (rosterItem.shift_name || 'กะงาน'),
                shiftTime: rosterItem.start_time && rosterItem.end_time ? `${rosterItem.start_time.slice(0, 5)} - ${rosterItem.end_time.slice(0, 5)}` : (rosterItem.is_off ? 'ไม่ได้ลงตาราง' : '-')
            });
        });

        // 2. Also check if any other active staff checked in today but wasn't on roster
        (data.employees || []).forEach(emp => {
            if (emp.is_active === false || processedEmpIds.has(String(emp.id))) return;
            const empLogsToday = todayLogs.filter(l => String(l.employee_id) === String(emp.id))
                .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (empLogsToday.length > 0) {
                const latestLog = empLogsToday[empLogsToday.length - 1];
                const isOnDuty = latestLog.action_type === 'check_in';
                list.push({
                    employee: emp,
                    roster: { is_off: true, shift_name: 'กะพิเศษ (Unscheduled)' },
                    statusCategory: isOnDuty ? 'ON_DUTY' : 'COMPLETED',
                    statusLabel: isOnDuty ? 'ทำงานนอกตาราง (On Duty)' : 'ออกกะแล้ว',
                    statusBadgeColor: isOnDuty ? 'purple' : 'slate',
                    latestLog,
                    punchTime: latestLog.timestamp,
                    shiftName: 'กะพิเศษ',
                    shiftTime: '-'
                });
            }
        });

        return list;
    }, [todayEffectiveRoster, todayLogs, data.leaveRequests, data.employees, todayStr]);

    // --- 4. Filtered Live Floor List ---
    const filteredFloorList = useMemo(() => {
        if (rosterFilter === 'all') return liveFloorList;
        if (rosterFilter === 'on_duty') return liveFloorList.filter(item => item.statusCategory === 'ON_DUTY' || item.statusCategory === 'LATE');
        if (rosterFilter === 'upcoming') return liveFloorList.filter(item => item.statusCategory === 'UPCOMING');
        if (rosterFilter === 'completed') return liveFloorList.filter(item => item.statusCategory === 'COMPLETED');
        if (rosterFilter === 'late') return liveFloorList.filter(item => item.statusCategory === 'LATE' || item.statusCategory === 'OVERDUE');
        if (rosterFilter === 'off') return liveFloorList.filter(item => item.statusCategory === 'OFF' || item.statusCategory === 'LEAVE');
        return liveFloorList;
    }, [liveFloorList, rosterFilter]);

    // --- 5. Key Operational Metrics ---
    const activeStaffCount = (data.employees || []).filter(e => e.is_active !== false).length;
    const scheduledTodayCount = liveFloorList.filter(item => !item.roster?.is_off && item.statusCategory !== 'LEAVE').length;
    const currentlyOnDutyCount = liveFloorList.filter(item => item.statusCategory === 'ON_DUTY' || item.statusCategory === 'LATE').length;
    
    const todayCheckInsCount = todayLogs.filter(l => l.action_type === 'check_in').length;
    const todayLateCount = todayLogs.filter(l => {
        if (l.action_type !== 'check_in') return false;
        const status = getShiftStatusForLog(l);
        return status.isLate;
    }).length;
    const todayPunctualityRate = todayCheckInsCount > 0 ? Math.round(((todayCheckInsCount - todayLateCount) / todayCheckInsCount) * 100) : 100;

    const pendingLeaveCount = (data.leaveRequests || []).filter(r => r.status === 'pending').length;
    const pendingSwapCount = (data.swapRequests || []).filter(r => r.status === 'PENDING_MANAGER').length;
    const pendingStaffCount = data.pendingEmployees?.length || 0;
    const pendingJobsCount = (data.jobApplications || []).filter(r => r.status === 'Pending').length;
    const totalAlertsCount = pendingLeaveCount + pendingSwapCount + pendingStaffCount + pendingJobsCount;

    // Month attendance stats
    const monthLogsCount = (data.logs || []).length;
    const monthCheckInsCount = (data.logs || []).filter(l => l.action_type === 'check_in').length;
    const monthLateCount = (data.logs || []).filter(l => {
        if (l.action_type !== 'check_in') return false;
        const status = getShiftStatusForLog(l);
        return status.isLate;
    }).length;
    const monthPunctualityRate = monthCheckInsCount > 0 ? Math.round(((monthCheckInsCount - monthLateCount) / monthCheckInsCount) * 100) : 100;

    // Filtered activity feed logs
    const filteredLogs = useMemo(() => {
        let logs = data.logs || [];

        // Apply Tab Filter
        if (activityFilter === 'today') {
            logs = logs.filter(l => format(new Date(l.timestamp), 'yyyy-MM-dd') === todayStr);
        } else if (activityFilter === 'check_in') {
            logs = logs.filter(l => l.action_type === 'check_in');
        } else if (activityFilter === 'check_out') {
            logs = logs.filter(l => l.action_type === 'check_out');
        } else if (activityFilter === 'late') {
            logs = logs.filter(l => {
                if (l.action_type !== 'check_in') return false;
                const status = getShiftStatusForLog(l);
                return status.isLate;
            });
        } else if (activityFilter === 'overnight') {
            logs = logs.filter(l => {
                const status = getShiftStatusForLog(l);
                return status.isOvernight;
            });
        }

        // Apply Search Filter
        if (activitySearch.trim()) {
            const query = activitySearch.toLowerCase().trim();
            logs = logs.filter(l => {
                const name = (l.employees?.name || '').toLowerCase();
                const nickname = (l.employees?.nickname || '').toLowerCase();
                const position = (l.employees?.position || '').toLowerCase();
                const action = (l.action_type || '').toLowerCase();
                const mood = (l.mood_status || '').toLowerCase();
                const note = (l.mood_note || '').toLowerCase();
                return name.includes(query) || nickname.includes(query) || position.includes(query) || action.includes(query) || mood.includes(query) || note.includes(query);
            });
        }

        return logs;
    }, [data.logs, activityFilter, activitySearch, todayStr]);

    // Reservations & Orders for today
    const todayReservations = (data.reservations || []).filter(r => r.reservation_date === todayStr);
    const todayOrders = (data.orders || []).filter(o => format(new Date(o.created_at || o.timestamp || Date.now()), 'yyyy-MM-dd') === todayStr);

    return (
        <div className="space-y-6 animate-fade-in pb-12 font-sans">
            {/* --- SECTION 1: HEADER & QUICK ACTIONS STATION --- */}
            <div className="bg-rams-panel border border-rams-rule rounded-sm p-6 shadow-none relative overflow-hidden">
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6 relative z-10">
                    <div className="space-y-2">
                        <div className="flex items-center gap-2">
                            <span className="text-[9px] tracking-widest uppercase font-mono font-bold text-rams-ink bg-rams-bg border border-rams-rule-light px-2.5 py-1 rounded-sm">
                                Restaurant OS · Command Center
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[9px] font-mono font-bold uppercase tracking-widest bg-rams-green/10 text-rams-green border border-rams-green/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-rams-green animate-ping"></span>
                                Live System Active
                            </span>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-sans font-bold tracking-tight text-rams-ink">
                            ยินดีต้อนรับกลับมา, บอส 👋
                        </h2>
                        <p className="text-xs text-rams-ink-muted font-sans flex items-center gap-2">
                            <span>{formatDate(todayObj)}</span>
                            <span>•</span>
                            <span className="font-mono font-bold text-rams-ink">สถานะความพร้อมร้าน & ตารางการปฏิบัติงานวันนี้</span>
                        </p>
                    </div>

                    {/* Quick Command Bar */}
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <button
                            onClick={() => handleNotify('/api/notify')}
                            className="px-3.5 py-2 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule-light transition-all cursor-pointer flex items-center gap-1.5"
                            title="ส่งสรุปเข้า LINE กลุ่ม"
                        >
                            <Icons.Yuzu size={14} className="text-rams-orange" />
                            <span>LINE Daily Summary</span>
                        </button>
                        <button
                            onClick={() => setShowManualModal(true)}
                            className="px-3.5 py-2 bg-rams-orange hover:bg-rams-orange-active text-rams-panel text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer flex items-center gap-1.5"
                        >
                            <span>+ Manual Entry</span>
                        </button>
                        <button
                            onClick={() => onTabChange?.('requests')}
                            className="px-3 py-2 bg-rams-panel hover:bg-rams-bg text-rams-ink text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule-light transition-all cursor-pointer flex items-center gap-1.5"
                        >
                            <span>+ บันทึกใบลา</span>
                        </button>
                        <button
                            onClick={handleFinalizeDay}
                            className="px-3.5 py-2 bg-rams-ink text-rams-panel hover:bg-rams-ink-muted text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule transition-all cursor-pointer flex items-center gap-1.5"
                        >
                            <span>🏁 Cut-off วัน</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* --- SECTION 2: DRAFT SCHEDULES WARNING (IF ANY) --- */}
            {draftWeeks.map(week => (
                <div key={week.start} className="relative bg-rams-amber/10 border border-rams-rule rounded-sm p-4 pr-12 sm:pr-14 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-none animate-fade-in-up">
                    <div className="flex gap-3">
                        <div className="w-10 h-10 bg-rams-amber/20 rounded-sm flex items-center justify-center border border-rams-rule text-rams-ink shrink-0">
                            <Icons.Alert size={18} />
                        </div>
                        <div>
                            <h4 className="font-mono font-bold text-rams-ink text-xs uppercase tracking-wider">
                                พบตารางงานร่าง (Draft Roster) ที่ยังไม่เผยแพร่
                            </h4>
                            <p className="text-[11px] font-sans text-rams-ink-muted mt-1">
                                สัปดาห์วันที่ {formatDate(week.start)} - {formatDate(week.end)} (มีทั้งหมด {week.count} กะงานที่ยังไม่ได้เผยแพร่)
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => onTabChange?.('roster')}
                            className="px-3 py-2 bg-rams-bg border border-rams-rule-light text-rams-ink font-mono font-bold text-xs uppercase tracking-wider rounded-sm hover:bg-rams-bg-active transition-all cursor-pointer shrink-0"
                        >
                            ดูตาราง Roster
                        </button>
                        <button
                            onClick={() => handlePublishRoster(week.start, week.end)}
                            className="px-4 py-2 bg-rams-orange text-rams-panel font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[2px] active:shadow-none transition-all cursor-pointer shrink-0"
                        >
                            อนุมัติ & ประกาศ LINE
                        </button>
                    </div>
                    <button
                        onClick={() => handleDismissDraftWeek(week.start)}
                        className="absolute top-4 right-4 w-6 h-6 flex items-center justify-center border border-rams-rule-light hover:border-rams-rule bg-rams-panel text-rams-ink-muted hover:text-rams-ink font-mono text-[10px] transition-all cursor-pointer rounded-sm"
                        title="ซ่อนคำเตือนนี้"
                    >
                        <Icons.X size={12} />
                    </button>
                </div>
            ))}

            {/* --- SECTION 3: KEY KPI METRICS --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                <Card className="shadow-none relative overflow-hidden border-rams-rule">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">Live On Duty</p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-3xl font-mono font-black text-rams-green">{currentlyOnDutyCount}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">/ {scheduledTodayCount}</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">หน้าร้านตอนนี้</p>
                        </div>
                        <div className="w-9 h-9 bg-rams-green/10 border border-rams-green/30 rounded-sm flex items-center justify-center text-rams-green shrink-0">
                            <Icons.Staff size={18} />
                        </div>
                    </div>
                </Card>
                <Card className="shadow-none border-rams-rule-light">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">Attendance</p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-3xl font-mono font-black text-rams-orange">{todayCheckInsCount}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">ครั้ง</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">{todayLateCount > 0 ? <span className="text-rams-amber font-bold">สาย {todayLateCount}</span> : "ตรงเวลา"}</p>
                        </div>
                        <div className="w-9 h-9 bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-center text-rams-orange shrink-0">
                            <Icons.Check size={18} />
                        </div>
                    </div>
                </Card>
                <Card className={`shadow-none border-rams-rule-light ${totalAlertsCount > 0 ? 'bg-rams-red/5' : ''}`}>
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">Alerts</p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className={`text-3xl font-mono font-black ${totalAlertsCount > 0 ? 'text-rams-red' : 'text-rams-ink'}`}>{totalAlertsCount}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">รายการ</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">รอดำเนินการ</p>
                        </div>
                        <div className={`w-9 h-9 border rounded-sm flex items-center justify-center shrink-0 ${totalAlertsCount > 0 ? 'bg-rams-red/10 border-rams-red text-rams-red' : 'bg-rams-bg border-rams-rule-light text-rams-ink-muted'}`}>
                            <Icons.Bell size={18} />
                        </div>
                    </div>
                </Card>
                <Card className="shadow-none border-rams-rule-light" onClick={() => onTabChange?.('payroll')}>
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">Monthly</p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-3xl font-mono font-black text-rams-ink">{monthCheckInsCount}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">กะ</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">Punctuality: {monthPunctualityRate}%</p>
                        </div>
                        <div className="w-9 h-9 bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-center text-rams-ink-muted shrink-0">
                            <Icons.Calendar size={18} />
                        </div>
                    </div>
                </Card>
                <Card className="shadow-none border-rams-rule-light" onClick={() => onTabChange?.('reservations')}>
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">Ops Radar</p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-3xl font-mono font-black text-rams-ink">{todayReservations.length}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">โต๊ะจอง</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">Orders: {todayOrders.length}</p>
                        </div>
                        <div className="w-9 h-9 bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-center text-rams-ink-muted shrink-0">
                            <Icons.Clock size={18} />
                        </div>
                    </div>
                </Card>
            </div>

            {/* --- SECTION 4: LIVE FLOOR RADAR --- */}
            <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
                <div className="p-5 border-b border-rams-rule-light bg-rams-bg/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h3 className="font-mono font-bold text-rams-ink text-sm uppercase tracking-wider">Live Floor Radar · สถานะพนักงานวันนี้</h3>
                            <Badge color="emerald">{currentlyOnDutyCount} On Duty</Badge>
                        </div>
                        <p className="text-[11px] font-sans text-rams-ink-muted mt-0.5">สรุปสถานะการเข้ากะของทีมงานตามตาราง Roster ประจำวัน ({todayStr})</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {['all', 'on_duty', 'upcoming', 'completed', 'late', 'off'].map(filter => (
                            <button
                                key={filter}
                                onClick={() => setRosterFilter(filter)}
                                className={`px-2.5 py-1 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer border ${rosterFilter === filter ? 'bg-rams-ink text-rams-panel border-rams-rule' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light'}`}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="p-5">
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        {filteredFloorList.map((item, idx) => {
                            const emp = item.employee;
                            const isWorking = item.statusCategory === 'ON_DUTY' || item.statusCategory === 'LATE';
                            return (
                                <div key={emp.id || idx} className={`p-3.5 rounded-sm border transition-all ${isWorking ? 'bg-rams-panel border-rams-rule' : 'bg-rams-bg/40 border-rams-rule-light'}`}>
                                    <div className="flex items-start gap-3">
                                        <StaffAvatar employee={emp} className="w-10 h-10" textClassName="text-sm" isWorking={isWorking} />
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-xs font-bold text-rams-ink truncate">{emp.name}</h4>
                                            <p className="text-[9px] font-mono text-rams-ink-muted uppercase">{emp.position || 'Staff'}</p>
                                            <div className="mt-2 text-[10px] font-mono flex justify-between">
                                                <span className="font-bold text-rams-ink">{item.shiftName}</span>
                                                <span className="text-rams-ink-muted">{item.shiftTime}</span>
                                            </div>
                                            <div className="mt-1 flex items-center justify-between">
                                                <Badge color={item.statusBadgeColor} className="text-[8px] px-1.5">{item.statusLabel}</Badge>
                                                {item.punchTime && <span className="text-[9px] font-mono text-rams-ink-muted font-bold">{formatTime(item.punchTime)}</span>}
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>

            {/* --- SECTION 5: ACTION CENTER & RESTAURANT OPERATIONS HUB --- */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 5.1 Action Center & Alerts Hub */}
                <div className="bg-rams-panel border border-rams-rule rounded-sm p-5 shadow-none flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-rams-rule-light -mx-5 -mt-5 p-5 bg-rams-bg/40">
                        <div>
                            <h3 className="font-mono font-bold text-rams-ink text-sm uppercase tracking-wider">
                                Action Center · ศูนย์จัดการคำขอ
                            </h3>
                            <p className="text-[10px] font-mono text-rams-ink-muted mt-0.5">
                                อนุมัติใบลา, คำขอสลับกะ, และบัญชีพนักงาน
                            </p>
                        </div>
                        <Badge color={totalAlertsCount > 0 ? "orange" : "emerald"}>
                            {totalAlertsCount > 0 ? `${totalAlertsCount} pending` : "All cleared ✓"}
                        </Badge>
                    </div>

                    <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar flex-1">
                        {totalAlertsCount === 0 ? (
                            <div className="text-center py-10 space-y-3 bg-rams-panel my-auto">
                                <div className="w-10 h-10 bg-rams-green/10 border border-rams-green/30 text-rams-green rounded-sm flex items-center justify-center mx-auto text-sm font-mono font-bold">
                                    ✓
                                </div>
                                <p className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider">
                                    ทุกอย่างเรียบร้อยดี!
                                </p>
                                <p className="text-[10px] font-mono text-rams-ink-muted">
                                    ไม่มีคำขออนุมัติใบลา สลับกะ หรือพนักงานสมัครใหม่ตกค้าง
                                </p>
                                <div className="pt-2 flex justify-center gap-2">
                                    <button
                                        onClick={() => onTabChange?.('roster')}
                                        className="px-3 py-1.5 bg-rams-bg border border-rams-rule-light text-rams-ink font-mono text-[9px] font-bold uppercase rounded-sm hover:border-rams-rule cursor-pointer"
                                    >
                                        จัดการ Roster
                                    </button>
                                    <button
                                        onClick={() => onTabChange?.('payroll')}
                                        className="px-3 py-1.5 bg-rams-bg border border-rams-rule-light text-rams-ink font-mono text-[9px] font-bold uppercase rounded-sm hover:border-rams-rule cursor-pointer"
                                    >
                                        สรุป Payroll
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* 1. Leave Requests */}
                                {(data.leaveRequests || []).filter(r => r.status === 'pending').map(req => (
                                    <div key={`leave-${req.id}`} className="p-3.5 bg-rams-red/5 border border-rams-rule-light rounded-sm space-y-2.5 animate-fade-in-up">
                                        <div className="flex justify-between items-start">
                                            <Badge color="rose">ขอลาหยุด</Badge>
                                            <span className="text-[10px] font-mono font-bold text-rams-ink">{formatDate(req.leave_date)}</span>
                                        </div>
                                        <div className="text-xs text-rams-ink font-sans">
                                            <span className="font-bold">{req.employees?.name} {req.employees?.nickname ? `(${req.employees.nickname})` : ''}</span> ขอลาหยุดประเภท <span className="font-mono font-bold text-rams-orange">{req.leave_type}</span>
                                            <div className="mt-1.5 p-2 bg-rams-bg border border-rams-rule-light rounded-sm font-mono text-[10px] text-rams-ink-muted leading-normal">
                                                เหตุผล: &quot;{req.reason || '-'}&quot;
                                            </div>
                                            {req.replacement_employee && (
                                                <p className="mt-1.5 text-xs font-mono font-bold text-rams-ink-muted">
                                                    👤 คนทำงานแทน: <span className="bg-rams-bg border border-rams-rule-light text-rams-ink font-mono px-1.5 py-0.5 rounded-sm">{req.replacement_employee.name} {req.replacement_employee.nickname ? `(${req.replacement_employee.nickname})` : ""}</span>
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-2 justify-end pt-1">
                                            <button
                                                onClick={() => handleLeaveAction(req, 'approved')}
                                                className="px-3 py-1.5 bg-rams-green text-rams-panel font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-green/90 active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
                                            >
                                                ✓ อนุมัติ
                                            </button>
                                            <button
                                                onClick={() => handleLeaveAction(req, 'rejected')}
                                                className="px-3 py-1.5 bg-rams-bg border border-rams-rule-light text-rams-ink-muted font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm hover:bg-rams-ink-muted/10 cursor-pointer transition-all"
                                            >
                                                ✕ ปฏิเสธ
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* 2. Shift Swaps */}
                                {(data.swapRequests || []).filter(r => r.status === 'PENDING_MANAGER').map(req => (
                                    <div key={`swap-${req.id}`} className="p-3.5 bg-rams-orange/5 border border-rams-rule-light rounded-sm space-y-2.5 animate-fade-in-up">
                                        <div className="flex justify-between items-start">
                                            <Badge color="blue">สลับกะ</Badge>
                                            <span className="text-[10px] font-mono font-bold text-rams-ink">{req.target_date}</span>
                                        </div>
                                        <div className="text-xs text-rams-ink font-sans">
                                            <span className="font-bold">{req.requester?.name}</span> ขอสลับกะกับ <span className="font-bold">{req.peer?.name || 'Open Pool'}</span>
                                            <div className="mt-1.5 p-2 bg-rams-bg border border-rams-rule-light rounded-sm font-mono text-[10px] text-rams-ink-muted leading-normal">
                                                โน้ต: &quot;{req.notes || '-'}&quot;
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end pt-1">
                                            <button
                                                onClick={() => handleSwapDecision(req.id, 'APPROVE')}
                                                className="px-3 py-1.5 bg-rams-green text-rams-panel font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-green/90 active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
                                            >
                                                ✓ อนุมัติ
                                            </button>
                                            <button
                                                onClick={() => handleSwapDecision(req.id, 'REJECT')}
                                                className="px-3 py-1.5 bg-rams-bg border border-rams-rule-light text-rams-ink-muted font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm hover:bg-rams-ink-muted/10 cursor-pointer transition-all"
                                            >
                                                ✕ ปฏิเสธ
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* 3. Pending Staff Registration */}
                                {data.pendingEmployees?.map(emp => (
                                    <div key={`emp-${emp.id}`} className="p-3.5 bg-rams-amber/5 border border-rams-rule-light rounded-sm space-y-2.5 animate-fade-in-up">
                                        <div className="flex justify-between items-start">
                                            <Badge color="amber">พนักงานสมัครใหม่</Badge>
                                            <span className="text-[9px] font-mono font-bold text-rams-ink uppercase tracking-wider">สมัครทาง LINE</span>
                                        </div>
                                        <div className="text-xs text-rams-ink font-sans">
                                            <span className="font-bold">{emp.name}</span> ได้สมัครบัญชีพนักงานเข้ามา รอคุณอนุมัติ
                                        </div>
                                        <div className="flex justify-end pt-1">
                                            <button
                                                onClick={() => { setEditingStaff(emp); setShowStaffModal(true); }}
                                                className="px-3 py-1.5 bg-rams-orange text-rams-panel font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
                                            >
                                                ตั้งค่า & อนุมัติบัญชี
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* 4. Pending Job Applications */}
                                {(data.jobApplications || []).filter(r => r.status === 'Pending').map(app => (
                                    <div key={`job-${app.id}`} className="p-3.5 bg-rams-bg border border-rams-rule-light rounded-sm space-y-2 animate-fade-in-up">
                                        <div className="flex justify-between items-start">
                                            <Badge color="slate">ใบสมัครงาน</Badge>
                                            <span className="text-[9px] font-mono text-rams-ink-muted">{formatDate(app.created_at)}</span>
                                        </div>
                                        <div className="text-xs text-rams-ink">
                                            <span className="font-bold">{app.full_name}</span> สมัครตำแหน่ง <span className="font-mono font-bold text-rams-orange">{app.position_applied}</span>
                                        </div>
                                        <div className="flex justify-end pt-1">
                                            <button
                                                onClick={() => onTabChange?.('applications')}
                                                className="px-3 py-1 bg-rams-bg border border-rams-rule-light text-rams-ink font-mono font-bold text-[9px] uppercase rounded-sm hover:border-rams-rule cursor-pointer"
                                            >
                                                ดูใบสมัคร
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </>
                        )}
                    </div>
                </div>

                {/* 5.2 Operations & Reservations Glance */}
                <div className="bg-rams-panel border border-rams-rule rounded-sm p-5 shadow-none flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-rams-rule-light -mx-5 -mt-5 p-5 bg-rams-bg/40">
                        <div>
                            <h3 className="font-mono font-bold text-rams-ink text-sm uppercase tracking-wider flex items-center gap-2">
                                <Icons.Calendar size={15} className="text-rams-orange" />
                                <span>Operations Radar · โต๊ะจอง & ออเดอร์</span>
                            </h3>
                            <p className="text-[10px] font-mono text-rams-ink-muted mt-0.5">
                                รายการจองโต๊ะและออเดอร์โทรสั่งของวันนี้ ({todayStr})
                            </p>
                        </div>
                        <button
                            onClick={() => onTabChange?.('reservations')}
                            className="text-[9px] font-mono font-bold text-rams-orange hover:underline cursor-pointer uppercase tracking-wider bg-rams-bg px-2.5 py-1 rounded-sm border border-rams-rule-light"
                        >
                            ดูตารางโต๊ะ →
                        </button>
                    </div>

                    <div className="space-y-4 flex-1">
                        {/* Reservations List */}
                        <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1 custom-scrollbar">
                            <div className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                จองโต๊ะวันนี้ ({todayReservations.length} โต๊ะ)
                            </div>
                            {todayReservations.length === 0 ? (
                                <p className="text-[11px] font-mono text-rams-ink-muted text-center py-4 bg-rams-bg/30 rounded-sm border border-rams-rule-light/50">
                                    ไม่มีรายการจองโต๊ะสำหรับวันนี้
                                </p>
                            ) : (
                                todayReservations.slice(0, 5).map(res => (
                                    <div key={res.id} className="p-2.5 bg-rams-bg/50 border border-rams-rule-light rounded-sm flex justify-between items-center text-xs">
                                        <div>
                                            <span className="font-bold text-rams-ink">{res.customer_name}</span>
                                            <span className="text-[10px] font-mono text-rams-ink-muted ml-2">({res.guest_count || res.pax || 2} ท่าน)</span>
                                        </div>
                                        <Badge color={res.status === 'confirmed' ? 'emerald' : 'slate'} className="text-[8px]">
                                            {res.reservation_time || res.status}
                                        </Badge>
                                    </div>
                                ))
                            )}
                        </div>

                        {/* Store Quick Telemetry */}
                        <div className="pt-3 border-t border-rams-rule-light/50 grid grid-cols-2 gap-3">
                            <div className="p-3 bg-rams-bg/40 border border-rams-rule-light rounded-sm">
                                <div className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                    Phone Orders
                                </div>
                                <div className="text-lg font-mono font-black text-rams-ink mt-0.5">
                                    {todayOrders.length} <span className="text-xs font-normal text-rams-ink-muted">สาย</span>
                                </div>
                            </div>
                            <div className="p-3 bg-rams-bg/40 border border-rams-rule-light rounded-sm">
                                <div className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                    Checklist Status
                                </div>
                                <div className="text-xs font-mono font-bold text-rams-green mt-1 flex items-center gap-1">
                                    <span>✓ เปิดร้านพร้อม</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- SECTION 6: REAL-TIME ACTIVITY FEED (EXPANSIVE FULL-WIDTH AUDIT HUB) --- */}
            <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden flex flex-col shadow-none">
                {/* Feed Header */}
                <div className="p-5 md:p-6 border-b border-rams-rule-light bg-rams-bg/30 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h3 className="font-mono font-bold text-rams-ink text-base uppercase tracking-wider">
                                    Real-Time Activity Feed · บันทึกเวลาปฏิบัติงาน
                                </h3>
                                <span className="px-2 py-0.5 bg-rams-bg border border-rams-rule-light rounded-sm text-[9px] font-mono font-bold text-rams-ink uppercase">
                                    {filteredLogs.length} รายการ
                                </span>
                            </div>
                            <p className="text-xs font-sans text-rams-ink-muted mt-0.5">
                                ตรวจสอบการสแกนเวลาเข้า-ออกงาน, สถานะตรงต่อเวลา, รูปถ่าย และอารมณ์/บันทึกการทำงาน
                            </p>
                        </div>

                        {/* Search Bar */}
                        <div className="relative w-full md:w-72">
                            <input
                                type="text"
                                placeholder="ค้นหาชื่อ, ชื่อเล่น, กะ, โน้ต..."
                                value={activitySearch}
                                onChange={e => setActivitySearch(e.target.value)}
                                className="w-full pl-8 pr-4 py-2 bg-rams-panel border border-rams-rule-light rounded-sm text-xs font-mono text-rams-ink outline-none focus:border-rams-rule transition-all"
                            />
                            <Icons.Search size={14} className="absolute left-2.5 top-2.5 text-rams-ink-muted" />
                            {activitySearch && (
                                <button
                                    onClick={() => setActivitySearch("")}
                                    className="absolute right-2.5 top-2 text-xs font-mono text-rams-ink-muted hover:text-rams-ink cursor-pointer"
                                >
                                    ✕
                                </button>
                            )}
                        </div>
                    </div>

                    {/* Activity Filter Chips */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rams-rule-light/40">
                        {[
                            { id: 'today', label: `เฉพาะวันนี้ (Today - ${todayLogs.length})` },
                            { id: 'all', label: `ทั้งเดือน (All - ${(data.logs || []).length})` },
                            { id: 'check_in', label: 'เข้างาน (Check In)' },
                            { id: 'check_out', label: 'ออกงาน (Check Out)' },
                            { id: 'late', label: 'เข้างานสาย (Late)' },
                            { id: 'overnight', label: '🌙 กะข้ามคืน (Overnight)' },
                        ].map(tab => (
                            <button
                                key={tab.id}
                                onClick={() => setActivityFilter(tab.id)}
                                className={`px-3 py-1.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                                    activityFilter === tab.id
                                        ? 'bg-rams-ink text-rams-panel border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)]'
                                        : 'bg-rams-panel text-rams-ink-muted border-rams-rule-light hover:text-rams-ink hover:border-rams-rule'
                                }`}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Table */}
                <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                    <table className="w-full text-xs text-left relative border-collapse">
                        <thead className="bg-rams-bg text-rams-ink-muted uppercase text-[9px] font-mono font-bold tracking-widest sticky top-0 z-10 border-b border-rams-rule-light shadow-none">
                            <tr>
                                <th className="px-6 py-3.5 whitespace-nowrap min-w-[150px]">Date / Time</th>
                                <th className="px-4 py-3.5 whitespace-nowrap w-20 text-center">Photo</th>
                                <th className="px-6 py-3.5 whitespace-nowrap min-w-[200px]">Staff Member</th>
                                <th className="px-5 py-3.5 whitespace-nowrap min-w-[140px]">Action</th>
                                <th className="px-5 py-3.5 whitespace-nowrap min-w-[160px]">Status</th>
                                <th className="px-6 py-3.5 whitespace-nowrap">Mood / Note</th>
                                <th className="px-5 py-3.5 whitespace-nowrap w-12 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-rams-rule-light bg-rams-panel">
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center py-16 text-rams-ink-muted font-mono text-xs">
                                        ไม่พบบันทึกกิจกรรมตามเงื่อนไขที่เลือก
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.slice(0, activityLimit).map(log => {
                                    const status = getShiftStatusForLog(log);
                                    return (
                                        <tr
                                            key={log.id}
                                            className={`group transition-all duration-100 ${
                                                status.isOvernight
                                                    ? 'bg-purple-50/40 hover:bg-purple-50/70 border-l-4 border-l-purple-500'
                                                    : 'hover:bg-rams-bg/40'
                                            }`}
                                        >
                                            {/* Date & Time */}
                                            <td className="px-6 py-4 font-mono text-rams-ink text-xs whitespace-nowrap">
                                                <div className="font-bold">{formatDate(log.timestamp)}</div>
                                                <div className="text-[11px] text-rams-ink-muted font-semibold mt-0.5">
                                                    {formatTime(log.timestamp)}
                                                </div>
                                                {status.isOvernight && (
                                                    <div className="text-[9px] font-mono text-purple-700 font-extrabold flex items-center gap-1 mt-1">
                                                        <span>🌙 กะข้ามคืน ({formatDate(parseISO(status.shiftDate))})</span>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Photo */}
                                            <td className="px-4 py-4 whitespace-nowrap text-center">
                                                {log.photo_url ? (
                                                    <button
                                                        onClick={() => setSelectedPhoto(log.photo_url)}
                                                        className="cursor-pointer group/photo inline-block"
                                                        title="คลิกเพื่อดูรูปขนาดใหญ่"
                                                    >
                                                        <img
                                                            src={log.photo_url}
                                                            alt=""
                                                            onError={(e) => {
                                                                e.currentTarget.style.display = 'none';
                                                            }}
                                                            className="w-10 h-10 rounded-sm object-cover border border-rams-rule-light group-hover/photo:border-rams-rule transition-all bg-rams-bg"
                                                            referrerPolicy="no-referrer"
                                                        />
                                                    </button>
                                                ) : (
                                                    <span className="text-rams-ink-muted font-mono text-xs">-</span>
                                                )}
                                            </td>

                                            {/* Staff */}
                                            <td className="px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3">
                                                    <StaffAvatar
                                                        employee={log.employees}
                                                        className="w-8 h-8"
                                                        textClassName="text-xs"
                                                    />
                                                    <div>
                                                        <div className="font-bold text-rams-ink text-xs flex items-center gap-1.5">
                                                            <span>{log.employees?.name}</span>
                                                            {log.employees?.nickname && (
                                                                <span className="text-[10px] font-mono text-rams-orange font-bold">
                                                                    ({log.employees.nickname})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-wider">
                                                            {log.employees?.position || 'Staff'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Action */}
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleLogAction(log)}
                                                    className="cursor-pointer hover:opacity-80 active:scale-95 transition-all text-left inline-block"
                                                    title="คลิกเพื่อสลับ Check In / Check Out"
                                                >
                                                    <Badge color={status.isOvernight ? 'purple' : log.action_type === 'check_in' ? 'blue' : log.action_type === 'absent' ? 'rose' : 'slate'}>
                                                        {status.isOvernight ? 'Check Out (ข้ามคืน 🌙)' : log.action_type === 'check_in' ? 'Check In 🔄' : 'Check Out 🔄'}
                                                    </Badge>
                                                </button>
                                            </td>

                                            {/* Status */}
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge color={status.color}>{status.label}</Badge>
                                            </td>

                                            {/* Mood & Note */}
                                            <td className="px-6 py-4 whitespace-nowrap font-mono text-[11px]">
                                                {log.mood_status || log.mood_note ? (
                                                    <div className="space-y-0.5">
                                                        {log.mood_status && (
                                                            <span className="font-bold text-rams-ink">{log.mood_status}</span>
                                                        )}
                                                        {log.mood_note && (
                                                            <p className="text-rams-ink-muted max-w-[240px] truncate">&quot;{log.mood_note}&quot;</p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-rams-ink-muted">-</span>
                                                )}
                                            </td>

                                            {/* Delete Log */}
                                            <td className="px-5 py-4 whitespace-nowrap text-right">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}
                                                    className="w-7 h-7 flex items-center justify-center border border-rams-rule-light hover:border-rams-red hover:bg-rams-red/10 text-rams-ink-muted hover:text-rams-red transition-all cursor-pointer rounded-sm ml-auto"
                                                    title="Delete Log"
                                                >
                                                    <Icons.Trash size={12} />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>

                {/* Pagination Footer */}
                {filteredLogs.length > activityLimit && (
                    <div className="p-4 border-t border-rams-rule-light bg-rams-bg/20 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs font-mono">
                        <span className="text-rams-ink-muted text-[10px]">
                            แสดง {activityLimit} จาก {filteredLogs.length} รายการ
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setActivityLimit(prev => prev + 30)}
                                className="px-3 py-1.5 bg-rams-panel border border-rams-rule-light hover:border-rams-rule rounded-sm text-[10px] font-bold text-rams-ink uppercase transition-all cursor-pointer"
                            >
                                แสดงเพิ่มอีก 30 รายการ
                            </button>
                            <button
                                onClick={() => setActivityLimit(filteredLogs.length)}
                                className="px-3 py-1.5 bg-rams-ink text-rams-panel border border-rams-rule rounded-sm text-[10px] font-bold uppercase transition-all cursor-pointer"
                            >
                                แสดงทั้งหมด ({filteredLogs.length})
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* --- LIGHTBOX MODAL FOR VERIFICATION PHOTO --- */}
            {selectedPhoto && (
                <div 
                    className="fixed inset-0 z-[70] bg-rams-ink/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <div
                        className="bg-rams-panel border border-rams-rule rounded-sm max-w-md w-full p-4 space-y-3"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b border-rams-rule-light pb-2">
                            <h4 className="font-mono font-bold text-rams-ink text-xs uppercase tracking-wider">
                                รูปถ่ายยืนยันการสแกนเวลา
                            </h4>
                            <button
                                onClick={() => setSelectedPhoto(null)}
                                className="w-6 h-6 flex items-center justify-center border border-rams-rule-light bg-rams-bg text-rams-ink font-mono text-xs cursor-pointer"
                            >
                                ✕
                            </button>
                        </div>
                        <img
                            src={selectedPhoto}
                            alt="Scan"
                            className="w-full h-80 object-cover rounded-sm border border-rams-rule-light bg-rams-bg"
                            referrerPolicy="no-referrer"
                        />
                        <div className="flex justify-end">
                            <button
                                onClick={() => setSelectedPhoto(null)}
                                className="px-4 py-1.5 bg-rams-ink text-rams-panel text-xs font-mono font-bold uppercase rounded-sm cursor-pointer"
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
