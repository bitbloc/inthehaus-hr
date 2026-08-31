"use client";
import React, { useState, useMemo } from "react";
import { format, parseISO, differenceInMinutes, subDays, isToday, isFuture, isPast } from "date-fns";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/HausIcon";
import { getEffectiveDailyRoster } from "../../../utils/roster_logic";
import { formatDate, formatCurrency, formatTime } from "../../../utils/format";

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
                    statusLabel = 'วันหยุดประจำ';
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
                shiftName: rosterItem.shift_name || 'กะงาน',
                shiftTime: rosterItem.start_time && rosterItem.end_time ? `${rosterItem.start_time.slice(0, 5)} - ${rosterItem.end_time.slice(0, 5)}` : (rosterItem.is_off ? 'OFF' : '-')
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

    // Restaurant Ops for Today
    const todayReservations = (data.tableReservations || []).filter(r => {
        if (!r.reservation_date) return false;
        return r.reservation_date === todayStr || r.reservation_date.startsWith(todayStr);
    });
    const todayOrders = (data.phoneOrders || []).filter(o => {
        if (!o.created_at) return false;
        return format(new Date(o.created_at), 'yyyy-MM-dd') === todayStr;
    });

    // --- 6. Filtered Activity Feed ---
    const filteredLogs = useMemo(() => {
        let list = data.logs || [];

        if (activityFilter === 'today') {
            list = list.filter(l => format(new Date(l.timestamp), 'yyyy-MM-dd') === todayStr);
        } else if (activityFilter === 'check_in') {
            list = list.filter(l => l.action_type === 'check_in');
        } else if (activityFilter === 'check_out') {
            list = list.filter(l => l.action_type === 'check_out');
        } else if (activityFilter === 'late') {
            list = list.filter(l => {
                if (l.action_type !== 'check_in') return false;
                return getShiftStatusForLog(l).isLate;
            });
        } else if (activityFilter === 'overnight') {
            list = list.filter(l => getShiftStatusForLog(l).isOvernight);
        }

        if (activitySearch.trim()) {
            const q = activitySearch.toLowerCase();
            list = list.filter(l => {
                const name = (l.employees?.name || '').toLowerCase();
                const nickname = (l.employees?.nickname || '').toLowerCase();
                const action = (l.action_type || '').toLowerCase();
                const mood = (l.mood_status || '').toLowerCase();
                const note = (l.mood_note || '').toLowerCase();
                return name.includes(q) || nickname.includes(q) || action.includes(q) || mood.includes(q) || note.includes(q);
            });
        }

        return list;
    }, [data.logs, activityFilter, activitySearch, todayStr]);

    return (
        <div className="space-y-6 animate-fade-in">
            {/* --- SECTION 1: HEADER & COMMAND STATION --- */}
            <div className="bg-rams-panel border border-rams-rule rounded-sm p-6 md:p-8 text-rams-ink relative overflow-hidden shadow-none">
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

            {/* Restore dismissed draft alerts */}
            {dismissedDraftWeeks.length > 0 && (
                <div className="flex justify-end pr-2">
                    <button
                        onClick={() => {
                            setDismissedDraftWeeks([]);
                            localStorage.removeItem("dismissed_draft_weeks");
                        }}
                        className="text-[10px] font-mono font-bold text-rams-ink bg-rams-panel border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] px-3 py-1.5 rounded-sm hover:bg-rams-bg-active active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-1.5 cursor-pointer uppercase tracking-wider"
                    >
                        <Icons.Swap size={12} />
                        แสดงตารางงานร่างที่ซ่อนไว้ ({dismissedDraftWeeks.length})
                    </button>
                </div>
            )}

            {/* --- SECTION 3: 5 HIGH-DENSITY KPI METRIC CARDS --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                {/* 1. Live Floor On Duty */}
                <Card className="shadow-none relative overflow-hidden border-rams-rule">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                Live On Duty
                            </p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-3xl font-mono font-black text-rams-green">{currentlyOnDutyCount}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">/ {scheduledTodayCount} กะ</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">
                                หน้าร้านตอนนี้ ({activeStaffCount} คนทั้งหมด)
                            </p>
                        </div>
                        <div className="w-9 h-9 bg-rams-green/10 border border-rams-green/30 rounded-sm flex items-center justify-center text-rams-green shrink-0">
                            <Icons.Staff size={18} />
                        </div>
                    </div>
                </Card>

                {/* 2. Today Attendance & Punctuality */}
                <Card className="shadow-none border-rams-rule-light">
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                Today Check-Ins
                            </p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-3xl font-mono font-black text-rams-orange">{todayCheckInsCount}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">ครั้ง</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">
                                {todayLateCount > 0 ? (
                                    <span className="text-rams-amber font-bold">สาย {todayLateCount} คน ({todayPunctualityRate}%)</span>
                                ) : (
                                    <span className="text-rams-green font-bold">ตรงเวลา 100% ✨</span>
                                )}
                            </p>
                        </div>
                        <div className="w-9 h-9 bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-center text-rams-orange shrink-0">
                            <Icons.Check size={18} />
                        </div>
                    </div>
                </Card>

                {/* 3. Action Center & Pending Alerts */}
                <Card 
                    className={`shadow-none cursor-pointer transition-all ${totalAlertsCount > 0 ? 'border-rams-red bg-rams-red/5' : 'border-rams-rule-light'}`}
                    onClick={() => {
                        if (pendingLeaveCount > 0) onTabChange?.('requests');
                        else if (pendingSwapCount > 0) onTabChange?.('shift_manage');
                        else if (pendingStaffCount > 0) onTabChange?.('employees');
                        else if (pendingJobsCount > 0) onTabChange?.('applications');
                    }}
                >
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                Pending Alerts
                            </p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className={`text-3xl font-mono font-black ${totalAlertsCount > 0 ? 'text-rams-red' : 'text-rams-ink'}`}>
                                    {totalAlertsCount}
                                </h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">รายการ</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">
                                {totalAlertsCount > 0 ? `ลา ${pendingLeaveCount} · สลับ ${pendingSwapCount} · สมัคร ${pendingStaffCount + pendingJobsCount}` : 'เคลียร์ครบทุกรายการ ✓'}
                            </p>
                        </div>
                        <div className={`w-9 h-9 border rounded-sm flex items-center justify-center shrink-0 ${totalAlertsCount > 0 ? 'bg-rams-red/10 border-rams-red text-rams-red' : 'bg-rams-bg border-rams-rule-light text-rams-ink-muted'}`}>
                            <Icons.Bell size={18} />
                        </div>
                    </div>
                </Card>

                {/* 4. Month-to-Date Operational Pulse */}
                <Card 
                    className="shadow-none border-rams-rule-light cursor-pointer hover:border-rams-rule transition-all"
                    onClick={() => onTabChange?.('payroll')}
                >
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                Monthly Attendance
                            </p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-3xl font-mono font-black text-rams-ink">{monthCheckInsCount}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">กะงาน</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">
                                Punctuality: <span className="font-bold text-rams-ink">{monthPunctualityRate}%</span> (สาย {monthLateCount})
                            </p>
                        </div>
                        <div className="w-9 h-9 bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-center text-rams-ink-muted shrink-0">
                            <Icons.Calendar size={18} />
                        </div>
                    </div>
                </Card>

                {/* 5. Restaurant Operations Radar */}
                <Card 
                    className="shadow-none border-rams-rule-light cursor-pointer hover:border-rams-rule transition-all"
                    onClick={() => onTabChange?.('reservations')}
                >
                    <div className="flex justify-between items-start">
                        <div className="space-y-1">
                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                Restaurant Ops
                            </p>
                            <div className="flex items-baseline gap-1.5">
                                <h3 className="text-3xl font-mono font-black text-rams-ink">{todayReservations.length}</h3>
                                <span className="text-xs font-mono font-bold text-rams-ink-muted">โต๊ะจอง</span>
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted">
                                Orders: <span className="font-bold text-rams-ink">{todayOrders.length}</span> สายโทรเข้า
                            </p>
                        </div>
                        <div className="w-9 h-9 bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-center text-rams-ink-muted shrink-0">
                            <Icons.Clock size={18} />
                        </div>
                    </div>
                </Card>
            </div>

            {/* --- SECTION 4: LIVE FLOOR RADAR (TODAY'S STAFF ON DUTY) --- */}
            <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
                <div className="p-5 border-b border-rams-rule-light bg-rams-bg/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h3 className="font-mono font-bold text-rams-ink text-sm uppercase tracking-wider">
                                Live Floor Radar · สถานะพนักงานวันนี้
                            </h3>
                            <Badge color="emerald">
                                {currentlyOnDutyCount} On Duty
                            </Badge>
                        </div>
                        <p className="text-[11px] font-sans text-rams-ink-muted mt-0.5">
                            สรุปสถานะการเข้ากะของทีมงานตามตาราง Roster ประจำวัน ({todayStr})
                        </p>
                    </div>

                    {/* Filter Chips */}
                    <div className="flex flex-wrap items-center gap-1.5">
                        {[
                            { id: 'all', label: `ทั้งหมด (${liveFloorList.length})` },
                            { id: 'on_duty', label: `🟢 ทำงาน (${currentlyOnDutyCount})` },
                            { id: 'upcoming', label: `⚪ รอเข้ากะ (${liveFloorList.filter(i => i.statusCategory === 'UPCOMING').length})` },
                            { id: 'completed', label: `🏁 ออกกะ (${liveFloorList.filter(i => i.statusCategory === 'COMPLETED').length})` },
                            { id: 'late', label: `🟡 สาย/เกินเวลา (${liveFloorList.filter(i => i.statusCategory === 'LATE' || i.statusCategory === 'OVERDUE').length})` },
                            { id: 'off', label: `🏖️ หยุด/ลา (${liveFloorList.filter(i => i.statusCategory === 'OFF' || i.statusCategory === 'LEAVE').length})` },
                        ].map(chip => (
                            <button
                                key={chip.id}
                                onClick={() => setRosterFilter(chip.id)}
                                className={`px-2.5 py-1 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                                    rosterFilter === chip.id
                                        ? 'bg-rams-ink text-rams-panel border-rams-rule'
                                        : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light hover:text-rams-ink hover:border-rams-rule'
                                }`}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Floor Grid */}
                <div className="p-5">
                    {filteredFloorList.length === 0 ? (
                        <div className="text-center py-8 text-rams-ink-muted font-mono text-xs">
                            ไม่มีรายการในตัวกรองนี้
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3.5">
                            {filteredFloorList.map((item, idx) => {
                                const emp = item.employee;
                                const isWorking = item.statusCategory === 'ON_DUTY' || item.statusCategory === 'LATE';

                                return (
                                    <div
                                        key={emp.id || idx}
                                        className={`p-3.5 rounded-sm border transition-all relative ${
                                            isWorking
                                                ? 'bg-rams-panel border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)]'
                                                : item.statusCategory === 'UPCOMING'
                                                ? 'bg-rams-panel border-rams-rule-light'
                                                : item.statusCategory === 'OVERDUE'
                                                ? 'bg-rams-red/5 border-rams-red'
                                                : 'bg-rams-bg/40 border-rams-rule-light opacity-80'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            {/* Avatar */}
                                            <div className="relative shrink-0">
                                                {emp.photo_url ? (
                                                    <img
                                                        src={emp.photo_url}
                                                        alt={emp.name}
                                                        className="w-10 h-10 rounded-sm object-cover border border-rams-rule-light"
                                                    />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-sm bg-rams-ink text-rams-panel font-mono font-black text-sm flex items-center justify-center border border-rams-rule">
                                                        {emp.name?.charAt(0) || 'E'}
                                                    </div>
                                                )}
                                                {isWorking && (
                                                    <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-rams-green border-2 border-rams-panel flex items-center justify-center">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-rams-green animate-ping"></span>
                                                    </span>
                                                )}
                                            </div>

                                            {/* Staff Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                    <h4 className="text-xs font-bold text-rams-ink truncate">
                                                        {emp.name}
                                                    </h4>
                                                    {emp.nickname && (
                                                        <span className="text-[10px] font-mono font-bold text-rams-orange shrink-0">
                                                            ({emp.nickname})
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-[9px] font-mono text-rams-ink-muted uppercase tracking-wider truncate">
                                                    {emp.position || 'Staff'}
                                                </p>

                                                {/* Shift Details */}
                                                <div className="mt-2 pt-2 border-t border-rams-rule-light/50 flex items-center justify-between text-[10px] font-mono">
                                                    <span className="font-bold text-rams-ink truncate max-w-[120px]">
                                                        {item.shiftName}
                                                    </span>
                                                    <span className="text-rams-ink-muted">
                                                        {item.shiftTime}
                                                    </span>
                                                </div>

                                                {/* Status Badge */}
                                                <div className="mt-2 flex items-center justify-between">
                                                    <Badge color={item.statusBadgeColor} className="text-[8px] px-1.5 py-0">
                                                        {item.statusLabel}
                                                    </Badge>
                                                    {item.punchTime && (
                                                        <span className="text-[9px] font-mono text-rams-ink-muted font-bold">
                                                            {formatTime(item.punchTime)}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>

            {/* --- SECTION 5: MAIN GRID (ACTIVITY FEED & ACTION HUB) --- */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* 5.1 Real-time Activity Feed (Audit Trail) */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden flex flex-col">
                        {/* Feed Header */}
                        <div className="p-4 md:p-5 border-b border-rams-rule-light bg-rams-bg/30 space-y-3">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3">
                                <div>
                                    <h3 className="font-mono font-bold text-rams-ink text-sm uppercase tracking-wider">
                                        Real-Time Activity Feed
                                    </h3>
                                    <p className="text-[10px] font-mono text-rams-ink-muted mt-0.5">
                                        ประวัติการสแกนเข้า-ออกงาน และการทำงานแบบเรียลไทม์ ({filteredLogs.length} รายการ)
                                    </p>
                                </div>

                                {/* Search Bar */}
                                <div className="relative w-full sm:w-56">
                                    <input
                                        type="text"
                                        placeholder="ค้นหาชื่อ, กะ, โน้ต..."
                                        value={activitySearch}
                                        onChange={e => setActivitySearch(e.target.value)}
                                        className="w-full pl-7 pr-3 py-1.5 bg-rams-panel border border-rams-rule-light rounded-sm text-xs font-mono text-rams-ink outline-none focus:border-rams-rule transition-all"
                                    />
                                    <Icons.Search size={12} className="absolute left-2.5 top-2.5 text-rams-ink-muted" />
                                    {activitySearch && (
                                        <button
                                            onClick={() => setActivitySearch("")}
                                            className="absolute right-2 top-2 text-[10px] font-mono text-rams-ink-muted hover:text-rams-ink"
                                        >
                                            ✕
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* Activity Filter Chips */}
                            <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                {[
                                    { id: 'today', label: 'เฉพาะวันนี้ (Today)' },
                                    { id: 'all', label: 'ทั้งเดือน (All)' },
                                    { id: 'check_in', label: 'เข้างาน (Check In)' },
                                    { id: 'check_out', label: 'ออกงาน (Check Out)' },
                                    { id: 'late', label: 'เข้างานสาย (Late)' },
                                    { id: 'overnight', label: '🌙 กะข้ามคืน (Overnight)' },
                                ].map(tab => (
                                    <button
                                        key={tab.id}
                                        onClick={() => setActivityFilter(tab.id)}
                                        className={`px-2.5 py-1 rounded-sm text-[9px] font-mono font-bold uppercase tracking-wider transition-all cursor-pointer border ${
                                            activityFilter === tab.id
                                                ? 'bg-rams-ink text-rams-panel border-rams-rule'
                                                : 'bg-rams-panel text-rams-ink-muted border-rams-rule-light hover:text-rams-ink hover:border-rams-rule'
                                        }`}
                                    >
                                        {tab.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Table */}
                        <div className="overflow-x-auto max-h-[550px] custom-scrollbar">
                            <table className="w-full text-xs text-left relative">
                                <thead className="bg-rams-bg text-rams-ink-muted uppercase text-[9px] font-mono font-bold tracking-widest sticky top-0 z-10 border-b border-rams-rule-light shadow-none">
                                    <tr>
                                        <th className="px-5 py-3 whitespace-nowrap">Date / Time</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Photo</th>
                                        <th className="px-5 py-3 whitespace-nowrap">Staff Member</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Action</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Status</th>
                                        <th className="px-4 py-3 whitespace-nowrap">Mood / Note</th>
                                        <th className="px-4 py-3 whitespace-nowrap w-10 text-right"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-rams-rule-light bg-rams-panel">
                                    {filteredLogs.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="text-center py-12 text-rams-ink-muted font-mono text-xs">
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
                                                    <td className="px-5 py-3.5 font-mono text-rams-ink text-xs whitespace-nowrap">
                                                        <div className="font-bold">{formatDate(log.timestamp)}</div>
                                                        <div className="text-[11px] text-rams-ink-muted font-semibold">
                                                            {formatTime(log.timestamp)}
                                                        </div>
                                                        {status.isOvernight && (
                                                            <div className="text-[9px] font-mono text-purple-700 font-extrabold flex items-center gap-1 mt-0.5">
                                                                <span>🌙 กะข้ามคืน ({formatDate(parseISO(status.shiftDate))})</span>
                                                            </div>
                                                        )}
                                                    </td>

                                                    {/* Photo */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        {log.photo_url ? (
                                                            <button
                                                                onClick={() => setSelectedPhoto(log.photo_url)}
                                                                className="cursor-pointer group/photo block"
                                                                title="คลิกเพื่อดูรูปขนาดใหญ่"
                                                            >
                                                                <img
                                                                    src={log.photo_url}
                                                                    alt="punch"
                                                                    className="w-9 h-9 rounded-sm object-cover border border-rams-rule-light group-hover/photo:border-rams-rule transition-all"
                                                                    referrerPolicy="no-referrer"
                                                                />
                                                            </button>
                                                        ) : (
                                                            <span className="text-rams-ink-muted font-mono text-xs">-</span>
                                                        )}
                                                    </td>

                                                    {/* Staff */}
                                                    <td className="px-5 py-3.5 whitespace-nowrap">
                                                        <div className="flex items-center gap-2.5">
                                                            <div className="w-7 h-7 rounded-sm bg-rams-ink border border-rams-rule flex items-center justify-center text-xs text-rams-panel font-mono font-bold shrink-0">
                                                                {log.employees?.name?.charAt(0) || 'S'}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-rams-ink text-xs">
                                                                    {log.employees?.name}
                                                                </div>
                                                                {log.employees?.nickname && (
                                                                    <div className="text-[10px] font-mono text-rams-orange font-bold">
                                                                        ({log.employees.nickname})
                                                                    </div>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    {/* Action */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <button
                                                            type="button"
                                                            onClick={() => handleToggleLogAction(log)}
                                                            className="cursor-pointer hover:opacity-80 active:scale-95 transition-all text-left"
                                                            title="คลิกเพื่อสลับ Check In / Check Out"
                                                        >
                                                            <Badge color={status.isOvernight ? 'purple' : log.action_type === 'check_in' ? 'blue' : log.action_type === 'absent' ? 'rose' : 'slate'}>
                                                                {status.isOvernight ? 'Check Out (ข้ามคืน 🌙)' : log.action_type === 'check_in' ? 'Check In 🔄' : 'Check Out 🔄'}
                                                            </Badge>
                                                        </button>
                                                    </td>

                                                    {/* Status */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap">
                                                        <Badge color={status.color}>{status.label}</Badge>
                                                    </td>

                                                    {/* Mood & Note */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap font-mono text-[10px]">
                                                        {log.mood_status || log.mood_note ? (
                                                            <div className="space-y-0.5">
                                                                {log.mood_status && (
                                                                    <span className="font-bold text-rams-ink">{log.mood_status}</span>
                                                                )}
                                                                {log.mood_note && (
                                                                    <p className="text-rams-ink-muted max-w-[120px] truncate">&quot;{log.mood_note}&quot;</p>
                                                                )}
                                                            </div>
                                                        ) : (
                                                            <span className="text-rams-ink-muted">-</span>
                                                        )}
                                                    </td>

                                                    {/* Delete Log */}
                                                    <td className="px-4 py-3.5 whitespace-nowrap text-right">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}
                                                            className="w-7 h-7 flex items-center justify-center border border-rams-rule-light hover:border-rams-red hover:bg-rams-red/10 text-rams-ink-muted hover:text-rams-red transition-all cursor-pointer rounded-sm"
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
                            <div className="p-3 border-t border-rams-rule-light bg-rams-bg/20 flex justify-between items-center text-xs font-mono">
                                <span className="text-rams-ink-muted text-[10px]">
                                    แสดง {activityLimit} จาก {filteredLogs.length} รายการ
                                </span>
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setActivityLimit(prev => prev + 30)}
                                        className="px-3 py-1 bg-rams-panel border border-rams-rule-light hover:border-rams-rule rounded-sm text-[10px] font-bold text-rams-ink uppercase transition-all cursor-pointer"
                                    >
                                        แสดงเพิ่มอีก 30 รายการ
                                    </button>
                                    <button
                                        onClick={() => setActivityLimit(filteredLogs.length)}
                                        className="px-3 py-1 bg-rams-ink text-rams-panel border border-rams-rule rounded-sm text-[10px] font-bold uppercase transition-all cursor-pointer"
                                    >
                                        แสดงทั้งหมด
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* 5.2 Action Center & Alerts Hub */}
                <div className="space-y-6">
                    <div className="bg-rams-panel border border-rams-rule rounded-sm p-5 shadow-none">
                        <div className="flex justify-between items-center mb-4 pb-3 border-b border-rams-rule-light -mx-5 -mt-5 p-5 bg-rams-bg/40">
                            <div>
                                <h3 className="font-mono font-bold text-rams-ink text-sm uppercase tracking-wider">
                                    Action Center
                                </h3>
                                <p className="text-[10px] font-mono text-rams-ink-muted mt-0.5">
                                    ศูนย์จัดการคำขอและรายการรอดำเนินการ
                                </p>
                            </div>
                            <Badge color={totalAlertsCount > 0 ? "orange" : "emerald"}>
                                {totalAlertsCount > 0 ? `${totalAlertsCount} pending` : "All cleared"}
                            </Badge>
                        </div>

                        <div className="space-y-3.5 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                            {totalAlertsCount === 0 ? (
                                <div className="text-center py-10 space-y-3 bg-rams-panel">
                                    <div className="w-10 h-10 bg-rams-green/10 border border-rams-green/30 text-rams-green rounded-sm flex items-center justify-center mx-auto text-sm font-mono font-bold">
                                        ✓
                                    </div>
                                    <p className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider">
                                        ทุกอย่างเรียบร้อยดี!
                                    </p>
                                    <p className="text-[10px] font-mono text-rams-ink-muted">
                                        ไม่มีคำขออนุมัติใบลา สลับกะ หรือพนักงานสมัครใหม่
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

                    {/* 5.3 Operations & Announcements Glance */}
                    <div className="bg-rams-panel border border-rams-rule rounded-sm p-5 shadow-none space-y-4">
                        <div className="flex justify-between items-center border-b border-rams-rule-light pb-3">
                            <h4 className="font-mono font-bold text-rams-ink text-xs uppercase tracking-wider flex items-center gap-2">
                                <Icons.Calendar size={14} className="text-rams-orange" />
                                <span>Today Reservations ({todayReservations.length})</span>
                            </h4>
                            <button
                                onClick={() => onTabChange?.('reservations')}
                                className="text-[9px] font-mono font-bold text-rams-orange hover:underline cursor-pointer uppercase"
                            >
                                ดูทั้งหมด →
                            </button>
                        </div>

                        {todayReservations.length === 0 ? (
                            <p className="text-[11px] font-mono text-rams-ink-muted text-center py-3">
                                ไม่มีรายการจองโต๊ะสำหรับวันนี้
                            </p>
                        ) : (
                            <div className="space-y-2">
                                {todayReservations.slice(0, 4).map(res => (
                                    <div key={res.id} className="p-2.5 bg-rams-bg/50 border border-rams-rule-light rounded-sm flex justify-between items-center text-xs">
                                        <div>
                                            <span className="font-bold text-rams-ink">{res.customer_name}</span>
                                            <span className="text-[10px] font-mono text-rams-ink-muted ml-2">({res.guest_count || res.pax || 2} ท่าน)</span>
                                        </div>
                                        <Badge color={res.status === 'confirmed' ? 'emerald' : 'slate'} className="text-[8px]">
                                            {res.reservation_time || res.status}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* --- LIGHTBOX MODAL FOR PUNCH PHOTO --- */}
            {selectedPhoto && (
                <div
                    className="fixed inset-0 z-[70] bg-rams-ink/60 backdrop-blur-sm flex items-center justify-center p-4"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <div
                        className="bg-rams-panel border border-rams-rule rounded-sm max-w-md w-full p-4 space-y-3"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex justify-between items-center border-b border-rams-rule-light pb-2">
                            <h4 className="font-mono font-bold text-rams-ink text-xs uppercase tracking-wider">
                                Check-in Photo Preview
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
                            className="w-full h-80 object-cover rounded-sm border border-rams-rule-light"
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
