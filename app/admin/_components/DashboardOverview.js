"use client";
import React, { useState, useMemo, useEffect } from "react";
import { format, parseISO, differenceInMinutes, subDays, startOfWeek, addDays, isToday, isFuture, isPast } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/HausIcon";
import { getEffectiveDailyRoster } from "../../../utils/roster_logic";
import { formatDate, formatCurrency, formatTime } from "../../../utils/format";

// Purposeful Animated Counter (tasteskill Layer 1 entrance: cubic-bezier(0.22, 1, 0.36, 1), tabular-nums)
function AnimatedNumber({ value, suffix = "", duration = 680 }) {
    const [displayVal, setDisplayVal] = useState(0);

    useEffect(() => {
        const target = Number(value) || 0;
        let startTimestamp = null;
        let rafId = null;

        const step = (timestamp) => {
            if (!startTimestamp) startTimestamp = timestamp;
            const progress = Math.min((timestamp - startTimestamp) / duration, 1);
            // cubic-bezier(0.22, 1, 0.36, 1) approximation (easeOutQuart)
            const eased = 1 - Math.pow(1 - progress, 4);
            setDisplayVal(Math.round(eased * target));
            if (progress < 1) {
                rafId = window.requestAnimationFrame(step);
            } else {
                setDisplayVal(target);
            }
        };

        rafId = window.requestAnimationFrame(step);
        return () => {
            if (rafId) window.cancelAnimationFrame(rafId);
        };
    }, [value, duration]);

    return (
        <span className="tabular-nums">
            {displayVal.toLocaleString()}
            {suffix}
        </span>
    );
}

// Graceful Staff Avatar Component handling image loading errors & Dieter Rams initial fallbacks
function StaffAvatar({ employee, className = "w-10 h-10", textClassName = "text-sm", isWorking = false }) {
    const photoUrl = employee?.photo_url;
    const [prevPhotoUrl, setPrevPhotoUrl] = useState(photoUrl);
    const [imgError, setImgError] = useState(false);

    if (prevPhotoUrl !== photoUrl) {
        setPrevPhotoUrl(photoUrl);
        setImgError(false);
    }

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
        if (!log || !log.timestamp) return { label: '-', color: 'slate' };

        const emp = (data.employees || []).find(e => String(e.id) === String(log.employee_id));
        const empPos = (emp?.position || '').toLowerCase();
        const isOwner = empPos.includes('owner') || empPos.includes('ceo');

        if (isOwner) {
            return log.action_type === 'check_in'
                ? { label: '👑 Owner (ลงเวลา)', color: 'amber', isLate: false, lateMinutes: 0 }
                : { label: 'ออกงาน', color: 'slate' };
        }

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

            const empPos = (emp.position || '').toLowerCase();
            const isOwner = empPos.includes('owner') || empPos.includes('ceo');

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
            } else if (isOwner) {
                // Owner is exempt from required check-in
                if (latestLog && latestLog.action_type === 'check_in') {
                    statusCategory = 'ON_DUTY';
                    statusLabel = '👑 ปฏิบัติงาน (Owner)';
                    statusBadgeColor = 'emerald';
                    punchTime = latestLog.timestamp;
                } else if (latestLog && latestLog.action_type === 'check_out') {
                    statusCategory = 'COMPLETED';
                    statusLabel = 'ออกกะแล้ว';
                    statusBadgeColor = 'slate';
                    punchTime = latestLog.timestamp;
                } else if (rosterItem.is_off) {
                    statusCategory = 'OFF';
                    statusLabel = 'วันหยุด (Owner)';
                    statusBadgeColor = 'slate';
                } else {
                    statusCategory = 'UPCOMING';
                    statusLabel = '👑 ยกเว้นการลงเวลา';
                    statusBadgeColor = 'amber';
                }
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

    // --- 5.5 Weekly Telemetry for tasteskill "Overview / This week" Bar Chart (Mon - Sun) ---
    const [chartMetric, setChartMetric] = useState("shifts"); // 'shifts' | 'punctuality'
    const currentDayMondayIndex = (todayObj.getDay() + 6) % 7; // Mon=0 .. Sun=6
    const [hoveredDayIdx, setHoveredDayIdx] = useState(null);
    const [selectedDayIdx, setSelectedDayIdx] = useState(currentDayMondayIndex);

    const weeklyTelemetry = useMemo(() => {
        const weekStart = startOfWeek(todayObj, { weekStartsOn: 1 }); // Monday
        const activeEmployees = (data.employees || []).filter(e => e.is_active !== false);
        const dayLabels = [
            { short: "Mon", th: "จันทร์" },
            { short: "Tue", th: "อังคาร" },
            { short: "Wed", th: "พุธ" },
            { short: "Thu", th: "พฤหัสฯ" },
            { short: "Fri", th: "ศุกร์" },
            { short: "Sat", th: "เสาร์" },
            { short: "Sun", th: "อาทิตย์" },
        ];

        const days = dayLabels.map((lbl, idx) => {
            const dObj = addDays(weekStart, idx);
            const dStr = format(dObj, "yyyy-MM-dd");
            const dayRoster = getEffectiveDailyRoster(
                activeEmployees,
                data.schedules || {},
                data.transactions || [],
                data.shifts || [],
                dObj,
                { includeDrafts: true }
            );
            const scheduled = dayRoster.filter(r => !r.is_off).length;

            const dayCheckIns = (data.logs || []).filter(l => {
                if (!l.timestamp || l.action_type !== "check_in") return false;
                return format(new Date(l.timestamp), "yyyy-MM-dd") === dStr;
            });
            const checkInCount = dayCheckIns.length;
            const lateCount = dayCheckIns.filter(l => getShiftStatusForLog(l).isLate).length;
            const onTimeCount = Math.max(0, checkInCount - lateCount);
            const punctuality = checkInCount > 0 ? Math.round((onTimeCount / checkInCount) * 100) : (isFuture(dObj) ? 100 : 100);

            // Use actual check-ins if recorded, otherwise scheduled shift volume so the 7-day chart is always informative
            const shiftVolume = checkInCount > 0 ? checkInCount : scheduled;

            return {
                idx,
                short: lbl.short,
                th: lbl.th,
                dateStr: dStr,
                dateFormatted: format(dObj, "dd MMM"),
                isToday: dStr === todayStr,
                isFuture: isFuture(dObj) && dStr !== todayStr,
                scheduled,
                checkInCount,
                lateCount,
                punctuality,
                shiftVolume,
            };
        });

        const values = days.map(d => (chartMetric === "shifts" ? d.shiftVolume : d.punctuality));
        const maxVal = Math.max(...values, chartMetric === "shifts" ? 6 : 100);
        const nonZeroShifts = days.filter(d => d.shiftVolume > 0);
        const avgShifts = nonZeroShifts.length > 0
            ? (nonZeroShifts.reduce((acc, d) => acc + d.shiftVolume, 0) / nonZeroShifts.length).toFixed(1)
            : "0.0";
        const avgPunctuality = Math.round(days.reduce((acc, d) => acc + d.punctuality, 0) / 7);

        return {
            days,
            maxVal,
            avgShifts,
            avgPunctuality,
            avgRatio: chartMetric === "shifts"
                ? Math.min(0.85, Math.max(0.2, Number(avgShifts) / (maxVal || 1)))
                : Math.min(0.9, Math.max(0.25, avgPunctuality / 100)),
        };
    }, [data.employees, data.schedules, data.transactions, data.shifts, data.logs, todayStr, chartMetric]);

    const activeBarIdx = hoveredDayIdx !== null ? hoveredDayIdx : selectedDayIdx;
    const activeDayData = weeklyTelemetry.days[activeBarIdx] || weeklyTelemetry.days[currentDayMondayIndex];

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

    return (
        <div className="space-y-6 pb-12 font-sans">
            {/* --- SECTION 1: COMMAND HEADER & QUICK ACTIONS BAR --- */}
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                className="bg-rams-panel border border-rams-rule rounded-sm p-5 sm:p-6 shadow-none relative overflow-hidden"
            >
                <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-5 relative z-10">
                    <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-2">
                            <span className="text-[9px] tracking-widest uppercase font-mono font-bold text-rams-ink bg-rams-bg border border-rams-rule-light px-2.5 py-1 rounded-sm">
                                IN THE HAUS · COMMAND OS
                            </span>
                            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[9px] font-mono font-bold uppercase tracking-widest bg-rams-green/10 text-rams-green border border-rams-green/30">
                                <span className="w-1.5 h-1.5 rounded-full bg-rams-green animate-ping"></span>
                                Telemetry Live
                            </span>
                        </div>
                        <h2 className="text-2xl md:text-3xl font-sans font-bold tracking-tight text-rams-ink">
                            ยินดีต้อนรับกลับมา, บอส 👋
                        </h2>
                        <p className="text-xs text-rams-ink-muted font-sans flex flex-wrap items-center gap-2">
                            <span className="font-mono">{formatDate(todayObj)}</span>
                            <span>•</span>
                            <span className="font-mono font-bold text-rams-ink">
                                พนักงานปฏิบัติงาน {currentlyOnDutyCount}/{scheduledTodayCount} กะ · ความตรงเวลา {todayPunctualityRate}%
                            </span>
                        </p>
                    </div>

                    {/* Tactile Micro-Interaction Command Buttons */}
                    <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto">
                        <button
                            onClick={() => {
                                window.location.href = '/admin/roster';
                            }}
                            className="px-3.5 py-2 bg-rams-ink hover:bg-rams-ink/90 text-rams-panel text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:-translate-y-[1px] active:translate-y-[1px] active:scale-[0.985] active:shadow-none transition-all duration-150 cursor-pointer flex items-center gap-1.5"
                            title="จัดตารางอัตโนมัติ / ตรวจสอบ Roster"
                        >
                            <span className="text-rams-orange font-bold">✨</span>
                            <span>Auto-Roster</span>
                        </button>
                        <button
                            onClick={() => handleNotify('/api/notify')}
                            className="px-3.5 py-2 bg-rams-bg hover:bg-rams-panel text-rams-ink text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule-light hover:border-rams-rule hover:-translate-y-[1px] active:translate-y-[1px] active:scale-[0.985] transition-all duration-150 cursor-pointer flex items-center gap-1.5"
                            title="ส่งสรุปเข้า LINE กลุ่ม"
                        >
                            <Icons.Yuzu size={14} className="text-rams-orange" />
                            <span>LINE Summary</span>
                        </button>
                        <button
                            onClick={() => setShowManualModal(true)}
                            className="px-3.5 py-2 bg-rams-orange hover:bg-rams-orange-active text-rams-panel text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:-translate-y-[1px] active:translate-y-[1px] active:scale-[0.985] active:shadow-none transition-all duration-150 cursor-pointer flex items-center gap-1.5"
                        >
                            <span>+ Manual Entry</span>
                        </button>
                        <button
                            onClick={() => onTabChange?.('requests')}
                            className="px-3 py-2 bg-rams-panel hover:bg-rams-bg text-rams-ink text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule-light hover:border-rams-rule hover:-translate-y-[1px] active:translate-y-[1px] active:scale-[0.985] transition-all duration-150 cursor-pointer flex items-center gap-1.5"
                        >
                            <span>+ บันทึกใบลา</span>
                        </button>
                        <button
                            onClick={handleFinalizeDay}
                            className="px-3.5 py-2 bg-rams-ink text-rams-panel hover:bg-rams-ink-muted text-xs font-mono font-bold uppercase tracking-wider rounded-sm border border-rams-rule hover:-translate-y-[1px] active:translate-y-[1px] active:scale-[0.985] transition-all duration-150 cursor-pointer flex items-center gap-1.5"
                        >
                            <span>🏁 Cut-off วัน</span>
                        </button>
                    </div>
                </div>
            </motion.div>

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

            {/* --- SECTION 3: TASTESKILL APP-SCREEN TELEMETRY PANEL (QUIET PANELS, ALIGNED FIGURES, COLOUR SPENT ON DATA) --- */}
            <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.06, ease: [0.22, 1, 0.36, 1] }}
                className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-[0_14px_34px_-18px_rgba(25,25,24,0.12)]"
            >
                {/* Top Header Strip: Overview | This week */}
                <div className="px-6 py-3.5 border-b border-rams-rule-light flex flex-wrap items-center justify-between gap-3 bg-rams-panel">
                    <div className="flex items-center gap-2.5">
                        <span className="text-xs font-sans font-semibold text-rams-ink-muted tracking-tight">
                            Overview
                        </span>
                        <span className="text-rams-rule-light">·</span>
                        <span className="text-[11px] font-mono text-rams-ink font-bold uppercase tracking-wider">
                            ภาพรวมการปฏิบัติงานและวินัยเข้ากะ
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="inline-flex items-center bg-rams-bg p-0.5 rounded-sm border border-rams-rule-light">
                            {[
                                { id: "shifts", label: "Shifts by day" },
                                { id: "punctuality", label: "Punctuality %" }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setChartMetric(tab.id)}
                                    className={`relative px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider rounded-xs transition-colors cursor-pointer ${
                                        chartMetric === tab.id ? "text-rams-panel" : "text-rams-ink-muted hover:text-rams-ink"
                                    }`}
                                >
                                    {chartMetric === tab.id && (
                                        <motion.span
                                            layoutId="overviewChartModePill"
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                            className="absolute inset-0 bg-rams-ink rounded-xs"
                                        />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        <span className="text-xs font-sans font-medium text-rams-ink-muted pl-1">
                            This week
                        </span>
                    </div>
                </div>

                {/* Row 1: Aligned Tabular Figures separated by 1px hairlines */}
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-rams-rule-light border-b border-rams-rule-light bg-rams-panel">
                    {/* Metric 1: Live On Duty / Attendance Today */}
                    <div className="p-5 sm:p-6 transition-colors hover:bg-rams-bg/35">
                        <p className="text-xs font-sans text-rams-ink-muted font-medium">
                            On Duty Now
                        </p>
                        <div className="mt-1.5 flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-mono font-bold tracking-tight text-rams-ink tabular-nums">
                                <AnimatedNumber value={currentlyOnDutyCount} />
                            </span>
                            <span className="text-sm font-mono font-semibold text-rams-ink-muted tabular-nums">
                                / {scheduledTodayCount} กะ
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-mono font-bold">
                            <span className="text-rams-green">
                                ● ลงเวลาวันนี้ {todayCheckInsCount} ครั้ง
                            </span>
                        </div>
                    </div>

                    {/* Metric 2: Monthly Check-ins */}
                    <div
                        onClick={() => onTabChange?.("payroll")}
                        className="p-5 sm:p-6 transition-colors hover:bg-rams-bg/35 cursor-pointer group"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-sans text-rams-ink-muted font-medium">
                                Monthly Shifts
                            </p>
                            <span className="text-[10px] font-mono text-rams-ink-muted group-hover:text-rams-orange transition-colors">
                                Payroll ↗
                            </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-mono font-bold tracking-tight text-rams-ink tabular-nums">
                                <AnimatedNumber value={monthCheckInsCount} />
                            </span>
                            <span className="text-xs font-mono text-rams-ink-muted">
                                กะสะสม
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-mono font-bold">
                            <span className="text-rams-green">
                                +{todayCheckInsCount} วันนี้
                            </span>
                            <span className="text-rams-ink-muted font-normal text-[11px]">
                                ({activeStaffCount} พนักงาน)
                            </span>
                        </div>
                    </div>

                    {/* Metric 3: Punctuality Rate */}
                    <div className="p-5 sm:p-6 transition-colors hover:bg-rams-bg/35">
                        <p className="text-xs font-sans text-rams-ink-muted font-medium">
                            Punctuality Rate
                        </p>
                        <div className="mt-1.5 flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-mono font-bold tracking-tight text-rams-ink tabular-nums">
                                <AnimatedNumber value={monthPunctualityRate} suffix="%" />
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs font-mono font-bold">
                            {todayLateCount === 0 ? (
                                <span className="text-rams-green">วันนี้ตรงเวลา 100%</span>
                            ) : (
                                <span className="text-rams-orange">วันนี้สาย {todayLateCount} คน ({todayPunctualityRate}%)</span>
                            )}
                        </div>
                    </div>

                    {/* Metric 4: Pending & NFC Stations */}
                    <div
                        onClick={() => onTabChange?.(totalAlertsCount > 0 ? "requests" : "nfc_stations")}
                        className="p-5 sm:p-6 transition-colors hover:bg-rams-bg/35 cursor-pointer group"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-xs font-sans text-rams-ink-muted font-medium">
                                {totalAlertsCount > 0 ? "Pending Requests" : "NFC Hardware Stations"}
                            </p>
                            <span className="text-[10px] font-mono text-rams-ink-muted group-hover:text-rams-orange transition-colors">
                                {totalAlertsCount > 0 ? "Review ↗" : "Manage ↗"}
                            </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-2">
                            <span className={`text-3xl sm:text-4xl font-mono font-bold tracking-tight tabular-nums ${totalAlertsCount > 0 ? "text-rams-orange" : "text-rams-ink"}`}>
                                <AnimatedNumber value={totalAlertsCount > 0 ? totalAlertsCount : 9} />
                            </span>
                            <span className="text-xs font-mono text-rams-ink-muted">
                                {totalAlertsCount > 0 ? "รายการรออนุมัติ" : "จุดแตะในร้าน"}
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-mono font-bold">
                            {totalAlertsCount > 0 ? (
                                <span className="text-rams-orange">● รอกดอนุมัติใบลา/สลับกะ</span>
                            ) : (
                                <span className="text-rams-green">● Tap-to-Punch & SOP Active</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Row 2: Interactive 7-Day Bar Chart (Mon - Sun) with Dashed Avg Line & Signal Orange Active Callout */}
                <div className="p-6 sm:p-7 bg-rams-panel">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-8">
                        <div>
                            <h3 className="text-xs font-sans font-semibold text-rams-ink-muted">
                                {chartMetric === "shifts"
                                    ? "Shifts & attendance by day (จำนวนกะและการลงเวลารายวัน)"
                                    : "Punctuality rate by day (อัตราการเข้างานตรงเวลารายวัน)"}
                            </h3>
                        </div>
                        {activeDayData && (
                            <div className="flex items-center gap-3 text-xs font-mono">
                                <span className="text-rams-ink-muted">
                                    วัน{activeDayData.th} ({activeDayData.dateFormatted}):
                                </span>
                                <span className="font-bold text-rams-ink tabular-nums">
                                    ลงเวลา {activeDayData.checkInCount} ครั้ง
                                </span>
                                <span className="text-rams-rule-light">|</span>
                                <span className="font-bold text-rams-ink tabular-nums">
                                    ตาราง {activeDayData.scheduled} กะ
                                </span>
                                <span className="text-rams-rule-light">|</span>
                                <span className={`font-bold tabular-nums ${activeDayData.lateCount > 0 ? "text-rams-orange" : "text-rams-green"}`}>
                                    ตรงเวลา {activeDayData.punctuality}%
                                </span>
                            </div>
                        )}
                    </div>

                    {/* Bar Chart Stage */}
                    <div
                        className="relative h-48 sm:h-52 pt-9 pb-7 select-none"
                        onMouseLeave={() => setHoveredDayIdx(null)}
                    >
                        {/* Horizontal Dashed Average Reference Line (like tasteskill reference) */}
                        <div
                            className="absolute left-0 right-0 pointer-events-none z-10 transition-all duration-500"
                            style={{
                                bottom: `calc(28px + ${Math.round(weeklyTelemetry.avgRatio * 124)}px)`
                            }}
                        >
                            <div className="text-[11px] font-mono font-medium text-rams-ink-muted mb-1 tabular-nums">
                                {chartMetric === "shifts"
                                    ? `avg ${weeklyTelemetry.avgShifts} กะ/วัน`
                                    : `avg ${weeklyTelemetry.avgPunctuality}%`}
                            </div>
                            <div className="w-full border-b border-dashed border-rams-ink-muted/45" />
                        </div>

                        {/* 7 Bars Grid (Mon - Sun) */}
                        <div className="grid grid-cols-7 gap-2.5 sm:gap-5 h-full items-end relative z-20">
                            {weeklyTelemetry.days.map((day, idx) => {
                                const rawVal = chartMetric === "shifts" ? day.shiftVolume : day.punctuality;
                                const ratio = weeklyTelemetry.maxVal > 0
                                    ? Math.max(0.14, Math.min(1, rawVal / weeklyTelemetry.maxVal))
                                    : 0.18;
                                const isHighlighted = idx === activeBarIdx;

                                return (
                                    <div
                                        key={day.short}
                                        onMouseEnter={() => setHoveredDayIdx(idx)}
                                        onClick={() => setSelectedDayIdx(idx)}
                                        className="flex flex-col items-center justify-end h-full cursor-pointer group relative"
                                    >
                                        {/* Floating Dark Pill Callout above the active Signal Orange bar */}
                                        <AnimatePresence>
                                            {isHighlighted && (
                                                <motion.div
                                                    layoutId="activeChartCallout"
                                                    initial={{ opacity: 0, y: 6, scale: 0.94 }}
                                                    animate={{ opacity: 1, y: 0, scale: 1 }}
                                                    exit={{ opacity: 0, y: 4, scale: 0.95 }}
                                                    transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
                                                    className="mb-2 px-2.5 py-1 rounded-md bg-rams-ink text-rams-panel text-[11px] font-mono font-bold tracking-tight whitespace-nowrap shadow-md z-30 tabular-nums"
                                                >
                                                    {day.short}{" "}
                                                    {chartMetric === "shifts"
                                                        ? `${day.shiftVolume} กะ`
                                                        : `${day.punctuality}%`}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>

                                        {/* Animated Vertical Bar */}
                                        <div className="w-full flex-1 flex items-end">
                                            <motion.div
                                                initial={{ scaleY: 0 }}
                                                animate={{ scaleY: 1 }}
                                                transition={{
                                                    duration: 0.65,
                                                    delay: 0.08 + idx * 0.045,
                                                    ease: [0.22, 1, 0.36, 1]
                                                }}
                                                style={{
                                                    height: `${Math.round(ratio * 100)}%`,
                                                    transformOrigin: "bottom"
                                                }}
                                                className={`w-full rounded-t-md transition-colors duration-200 relative ${
                                                    isHighlighted
                                                        ? "bg-rams-orange shadow-[0_8px_20px_-6px_rgba(224,79,38,0.45)]"
                                                        : day.isToday
                                                        ? "bg-[#D5CEC0] group-hover:bg-rams-orange/80"
                                                        : day.isFuture
                                                        ? "bg-[#EAE5DA] border border-dashed border-rams-rule-light group-hover:bg-[#DDD6C7]"
                                                        : "bg-[#E4DED1] group-hover:bg-[#D6CFC0]"
                                                }`}
                                            />
                                        </div>

                                        {/* Day Label (Mon .. Sun) */}
                                        <div className="mt-2.5 flex items-center gap-1">
                                            <span
                                                className={`text-xs font-mono transition-colors ${
                                                    isHighlighted
                                                        ? "font-bold text-rams-ink"
                                                        : day.isToday
                                                        ? "font-bold text-rams-orange"
                                                        : "font-medium text-rams-ink-muted group-hover:text-rams-ink"
                                                }`}
                                            >
                                                {day.short}
                                            </span>
                                            {day.isToday && (
                                                <span
                                                    className="w-1.5 h-1.5 rounded-full bg-rams-orange"
                                                    title="วันนี้ (Today)"
                                                />
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* --- SECTION 4: LIVE FLOOR RADAR WITH SLIDING INK PILL & SHIFT PROGRESS --- */}
            <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: 0.12, ease: [0.22, 1, 0.36, 1] }}
                className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none"
            >
                <div className="p-5 border-b border-rams-rule-light bg-rams-bg/40 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h3 className="font-mono font-bold text-rams-ink text-sm uppercase tracking-wider">Live Floor Radar · สถานะพนักงานวันนี้</h3>
                            <Badge color="emerald">{currentlyOnDutyCount} On Duty</Badge>
                        </div>
                        <p className="text-[11px] font-sans text-rams-ink-muted mt-0.5">สรุปสถานะการเข้ากะของทีมงานตามตาราง Roster ประจำวัน ({todayStr})</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {[
                            { id: 'all', label: `ALL (${liveFloorList.length})` },
                            { id: 'on_duty', label: `ON DUTY (${currentlyOnDutyCount})` },
                            { id: 'upcoming', label: 'UPCOMING' },
                            { id: 'completed', label: 'COMPLETED' },
                            { id: 'late', label: 'LATE' },
                            { id: 'off', label: 'OFF' }
                        ].map(tab => {
                            const active = rosterFilter === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setRosterFilter(tab.id)}
                                    className={`relative px-2.5 py-1 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                                        active
                                            ? 'text-rams-panel border-rams-rule'
                                            : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light hover:text-rams-ink hover:border-rams-rule'
                                    }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="floorRadarFilterPill"
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                            className="absolute inset-0 bg-rams-ink rounded-xs"
                                        />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            );
                        })}
                    </div>
                </div>
                <div className="p-5">
                    <motion.div layout className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                        <AnimatePresence mode="popLayout">
                            {filteredFloorList.map((item, idx) => {
                                const emp = item.employee;
                                const isWorking = item.statusCategory === 'ON_DUTY' || item.statusCategory === 'LATE';
                                const isCompleted = item.statusCategory === 'COMPLETED';

                                // Compute shift timeline progress (0 - 100%)
                                let shiftProgressPct = isCompleted ? 100 : 0;
                                if (isWorking && item.roster?.start_time && item.roster?.end_time) {
                                    const [sh, sm] = item.roster.start_time.split(':').map(Number);
                                    const [eh, em] = item.roster.end_time.split(':').map(Number);
                                    const startMins = sh * 60 + sm;
                                    let endMins = eh * 60 + em;
                                    if (endMins <= startMins) endMins += 24 * 60;
                                    const nowMins = todayObj.getHours() * 60 + todayObj.getMinutes();
                                    const adjustedNow = nowMins < startMins && endMins > 24 * 60 ? nowMins + 24 * 60 : nowMins;
                                    const totalSpan = Math.max(60, endMins - startMins);
                                    shiftProgressPct = Math.min(100, Math.max(8, Math.round(((adjustedNow - startMins) / totalSpan) * 100)));
                                } else if (isWorking) {
                                    shiftProgressPct = 60;
                                }

                                return (
                                    <motion.div
                                        layout
                                        initial={{ opacity: 0, y: 10 }}
                                        animate={{ opacity: 1, y: 0 }}
                                        exit={{ opacity: 0, scale: 0.96 }}
                                        transition={{ duration: 0.25, delay: Math.min(idx * 0.03, 0.24), ease: [0.22, 1, 0.36, 1] }}
                                        key={emp.id || idx}
                                        className={`p-3.5 rounded-sm border transition-all duration-150 hover:-translate-y-[2px] hover:shadow-[0_10px_22px_-10px_rgba(25,25,24,0.12)] ${
                                            isWorking
                                                ? 'bg-rams-panel border-rams-rule'
                                                : 'bg-rams-bg/40 border-rams-rule-light hover:border-rams-rule'
                                        }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <StaffAvatar employee={emp} className="w-10 h-10" textClassName="text-sm" isWorking={isWorking} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                    <h4 className="text-xs font-bold text-rams-ink truncate">
                                                        {emp.name}
                                                        {emp.nickname ? <span className="text-rams-ink-muted font-mono font-normal ml-1">({emp.nickname})</span> : null}
                                                    </h4>
                                                </div>
                                                <p className="text-[9px] font-mono text-rams-ink-muted uppercase">{emp.position || 'Staff'}</p>
                                                <div className="mt-2 text-[10px] font-mono flex justify-between tabular-nums">
                                                    <span className="font-bold text-rams-ink">{item.shiftName}</span>
                                                    <span className="text-rams-ink-muted">{item.shiftTime}</span>
                                                </div>
                                                <div className="mt-1.5 flex items-center justify-between">
                                                    <Badge color={item.statusBadgeColor} className="text-[8px] px-1.5">{item.statusLabel}</Badge>
                                                    {item.punchTime && <span className="text-[9px] font-mono text-rams-ink-muted font-bold tabular-nums">{formatTime(item.punchTime)}</span>}
                                                </div>

                                                {/* Subtle Shift Telemetry Progress Bar */}
                                                {(isWorking || isCompleted) && (
                                                    <div className="mt-2.5 w-full h-1 bg-rams-bg rounded-full overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${shiftProgressPct}%` }}
                                                            transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                                                            className={`h-full rounded-full ${
                                                                item.statusCategory === 'LATE'
                                                                    ? 'bg-rams-orange'
                                                                    : isCompleted
                                                                    ? 'bg-rams-ink-muted'
                                                                    : 'bg-rams-green'
                                                            }`}
                                                        />
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </motion.div>
                                );
                            })}
                        </AnimatePresence>
                    </motion.div>
                </div>
            </motion.div>

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
                                <Icons.Clock size={15} className="text-rams-orange" />
                                <span>Hardware & NFC Stations · จุดแตะบัตรร้าน</span>
                            </h3>
                            <p className="text-[10px] font-mono text-rams-ink-muted mt-0.5">
                                ระบบจุดแตะแผ่น NFC ลงเวลา เช็กลิสต์ และนับสต็อก ({todayStr})
                            </p>
                        </div>
                        <button
                            onClick={() => onTabChange?.('nfc_stations')}
                            className="text-[10px] font-mono font-bold text-rams-orange hover:underline cursor-pointer uppercase tracking-wider bg-rams-bg px-2.5 py-1 rounded-sm border border-rams-rule-light"
                        >
                            จัดการแผ่น NFC →
                        </button>
                    </div>

                    <div className="space-y-4 flex-1">
                        <div className="space-y-2">
                            <div className="p-3 bg-rams-bg/50 border border-rams-rule-light rounded-sm flex justify-between items-center text-xs">
                                <div>
                                    <span className="font-mono font-bold text-rams-ink">BAR_PUNCH & KITCHEN_PUNCH</span>
                                    <p className="text-[10px] font-mono text-rams-ink-muted mt-0.5">จุดแตะลงเวลาเข้า-ออกงาน (แก้ปัญหา GPS ในอาคาร)</p>
                                </div>
                                <Badge color="emerald" className="text-[9px]">ACTIVE</Badge>
                            </div>
                            <div className="p-3 bg-rams-bg/50 border border-rams-rule-light rounded-sm flex justify-between items-center text-xs">
                                <div>
                                    <span className="font-mono font-bold text-rams-ink">ESPRESSO_CAL & ZONE SOP</span>
                                    <p className="text-[10px] font-mono text-rams-ink-muted mt-0.5">จุดแตะเครื่องชงกาแฟ & ตรวจเช็กลิสต์ 4 โซน</p>
                                </div>
                                <Badge color="amber" className="text-[9px]">4 ZONES</Badge>
                            </div>
                        </div>

                        {/* Store Quick Telemetry */}
                        <div className="pt-3 border-t border-rams-rule-light/50 grid grid-cols-2 gap-3">
                            <a
                                href="/checkin/qr-display"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-3 bg-rams-bg/40 hover:bg-rams-bg border border-rams-rule-light hover:border-rams-rule rounded-sm transition block"
                            >
                                <div className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                    POS QR Display
                                </div>
                                <div className="text-xs font-mono font-bold text-rams-orange mt-1">
                                    เปิดจอ QR ร้าน →
                                </div>
                            </a>
                            <a
                                href="/checklist"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-3 bg-rams-bg/40 hover:bg-rams-bg border border-rams-rule-light hover:border-rams-rule rounded-sm transition block"
                            >
                                <div className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">
                                    Checklist & SOP
                                </div>
                                <div className="text-xs font-mono font-bold text-rams-green mt-1 flex items-center gap-1">
                                    <span>✓ เปิดหน้าเช็กลิสต์ →</span>
                                </div>
                            </a>
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

                    {/* Activity Filter Chips with Sliding Pill */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rams-rule-light/40">
                        {[
                            { id: 'today', label: `เฉพาะวันนี้ (Today - ${todayLogs.length})` },
                            { id: 'all', label: `ทั้งเดือน (All - ${(data.logs || []).length})` },
                            { id: 'check_in', label: 'เข้างาน (Check In)' },
                            { id: 'check_out', label: 'ออกงาน (Check Out)' },
                            { id: 'late', label: 'เข้างานสาย (Late)' },
                            { id: 'overnight', label: '🌙 กะข้ามคืน (Overnight)' },
                        ].map(tab => {
                            const active = activityFilter === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActivityFilter(tab.id)}
                                    className={`relative px-3 py-1.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider transition-colors cursor-pointer border ${
                                        active
                                            ? 'text-rams-panel border-rams-rule'
                                            : 'bg-rams-panel text-rams-ink-muted border-rams-rule-light hover:text-rams-ink hover:border-rams-rule'
                                    }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="activityFeedFilterPill"
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                            className="absolute inset-0 bg-rams-ink rounded-xs"
                                        />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            );
                        })}
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
                                                        onClick={() => setSelectedPhoto(log)}
                                                        className="cursor-pointer group/photo inline-block"
                                                        title="คลิกเพื่อดูรูปและข้อมูลยืนยันเวลา"
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

            {/* --- LIGHTBOX MODAL FOR VERIFICATION PHOTO WITH RAMS TELEMETRY HUD --- */}
            {selectedPhoto && (
                <div 
                    className="fixed inset-0 z-[70] bg-rams-ink/80 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <div
                        className="bg-rams-panel border border-rams-rule rounded-sm max-w-lg w-full p-5 space-y-4 shadow-2xl"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex justify-between items-center border-b border-rams-rule-light pb-2.5">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full bg-rams-orange animate-pulse"></span>
                                <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                                    IN THE HAUS · ATTENDANCE TELEMETRY
                                </span>
                            </div>
                            <div className="flex items-center gap-2">
                                {typeof selectedPhoto === 'object' && selectedPhoto?.id && (
                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted bg-rams-bg px-2 py-0.5 border border-rams-rule-light rounded-xs">
                                        #ATT-{selectedPhoto.id}
                                    </span>
                                )}
                                <button
                                    onClick={() => setSelectedPhoto(null)}
                                    className="w-6 h-6 flex items-center justify-center border border-rams-rule-light bg-rams-bg text-rams-ink font-mono text-xs cursor-pointer hover:border-rams-rule"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>

                        {/* Image Canvas Container */}
                        <div className="flex items-center justify-center bg-rams-bg border border-rams-rule-light rounded-sm p-1.5 overflow-hidden">
                            <img
                                src={typeof selectedPhoto === 'object' ? selectedPhoto.photo_url : selectedPhoto}
                                alt="Scan Verification"
                                className="max-h-[52vh] w-auto max-w-full object-contain rounded-xs shadow-inner"
                                referrerPolicy="no-referrer"
                            />
                        </div>

                        {/* Dieter Rams Style Telemetry & Timestamp Audit Card */}
                        {typeof selectedPhoto === 'object' && (
                            <div className="bg-rams-bg border border-rams-rule-light p-3.5 rounded-sm space-y-2.5 font-mono text-xs">
                                {/* Row 1: Staff Identity & Punch Action */}
                                <div className="flex items-center justify-between border-b border-rams-rule-light/70 pb-2">
                                    <div className="flex items-center gap-2">
                                        <StaffAvatar
                                            employee={selectedPhoto.employees}
                                            className="w-6 h-6"
                                            textClassName="text-[10px]"
                                        />
                                        <div>
                                            <span className="font-bold text-rams-ink text-xs">
                                                {selectedPhoto.employees?.name || 'พนักงาน'}
                                            </span>
                                            {selectedPhoto.employees?.nickname && (
                                                <span className="text-[10px] text-rams-orange font-bold ml-1">
                                                    ({selectedPhoto.employees.nickname})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 text-[9px] font-bold uppercase rounded-xs border ${
                                        selectedPhoto.action_type === 'check_in'
                                            ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                            : 'bg-indigo-50 text-indigo-800 border-indigo-300'
                                    }`}>
                                        {selectedPhoto.action_type === 'check_in' ? '● CHECK-IN (เข้างาน)' : '■ CHECK-OUT (ออกงาน)'}
                                    </span>
                                </div>

                                {/* Row 2: Precision Timestamp & Telemetry Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[10px] text-rams-ink">
                                    <div>
                                        <span className="text-[9px] text-rams-ink-muted uppercase block font-bold">
                                            EXACT TIME (UTC+7 / ICT)
                                        </span>
                                        <span className="font-bold tracking-tight text-rams-ink">
                                            {selectedPhoto.timestamp ? format(new Date(selectedPhoto.timestamp), 'yyyy-MM-dd · HH:mm:ss') : '-'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[9px] text-rams-ink-muted uppercase block font-bold">
                                            METHOD & VERIFICATION
                                        </span>
                                        <span className="text-rams-ink font-semibold">
                                            {selectedPhoto.verification_method === 'QR_CODE' 
                                                ? 'DYNAMIC IN-STORE QR' 
                                                : `GPS GEOFENCE (${selectedPhoto.accuracy_meters ? `±${selectedPhoto.accuracy_meters}M` : 'VERIFIED'})`}
                                        </span>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Modal Footer Controls */}
                        <div className="flex justify-between items-center pt-1">
                            <a
                                href={typeof selectedPhoto === 'object' ? selectedPhoto.photo_url : selectedPhoto}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[10px] font-mono text-rams-ink-muted hover:text-rams-orange underline underline-offset-2"
                            >
                                ดูรูปไฟล์เต็ม (RAW ASSET) ↗
                            </a>
                            <button
                                onClick={() => setSelectedPhoto(null)}
                                className="px-5 py-2 bg-rams-ink text-rams-panel text-xs font-mono font-bold uppercase rounded-sm cursor-pointer hover:opacity-90 active:translate-y-[1px]"
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
