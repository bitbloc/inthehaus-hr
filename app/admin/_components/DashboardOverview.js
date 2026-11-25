"use client";
import { initialOf } from "../../../utils/initial";
import React, { useState, useMemo, useEffect } from "react";
import { format, parseISO, differenceInMinutes, subDays, startOfWeek, addDays, isToday, isFuture, isPast } from "date-fns";
import { th } from "date-fns/locale";
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

    const initialChar = initialOf(employee?.nickname, employee?.name);

    return (
        <div className="relative shrink-0">
            {photoUrl && !imgError ? (
                <img
                    src={photoUrl}
                    alt=""
                    onError={() => setImgError(true)}
                    referrerPolicy="no-referrer"
                    className={`${className} object-cover border border-rule bg-cream`}
                />
            ) : (
                <div className={`${className} bg-charcoal text-cream font-num font-semibold ${textClassName} flex items-center justify-center border border-charcoal select-none`}>
                    {initialChar}
                </div>
            )}
            {isWorking && (
                <span className="absolute -top-1 -right-1 w-3 h-3 bg-charcoal border-2 border-cream flex items-center justify-center">
                    <span className="w-1.5 h-1.5 bg-charcoal"></span>
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
                ? { label: 'Owner (ลงเวลา)', color: 'amber', isLate: false, lateMinutes: 0 }
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
                label: `กะข้ามคืน (${formatDate(targetDateObj)})`,
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
                statusLabel = 'ลาหยุด';
                statusBadgeColor = 'rose';
            } else if (isOwner) {
                // Owner is exempt from required check-in
                if (latestLog && latestLog.action_type === 'check_in') {
                    statusCategory = 'ON_DUTY';
                    statusLabel = 'ปฏิบัติงาน';
                    statusBadgeColor = 'emerald';
                    punchTime = latestLog.timestamp;
                } else if (latestLog && latestLog.action_type === 'check_out') {
                    statusCategory = 'COMPLETED';
                    statusLabel = 'ออกกะแล้ว';
                    statusBadgeColor = 'slate';
                    punchTime = latestLog.timestamp;
                } else if (rosterItem.is_off) {
                    statusCategory = 'OFF';
                    statusLabel = 'วันหยุด';
                    statusBadgeColor = 'slate';
                } else {
                    statusCategory = 'UPCOMING';
                    statusLabel = 'ยกเว้นการลงเวลา';
                    statusBadgeColor = 'amber';
                }
            } else if (rosterItem.is_off) {
                if (latestLog && latestLog.action_type === 'check_in') {
                    statusCategory = 'ON_DUTY';
                    statusLabel = 'ทำงานวันหยุด';
                    statusBadgeColor = 'purple';
                    punchTime = latestLog.timestamp;
                } else if (latestLog && latestLog.action_type === 'check_out') {
                    statusCategory = 'COMPLETED';
                    statusLabel = 'ออกกะแล้ว (วันหยุด)';
                    statusBadgeColor = 'slate';
                    punchTime = latestLog.timestamp;
                } else {
                    statusCategory = 'OFF';
                    statusLabel = rosterItem.source === 'TRANSACTION' ? 'วันหยุดตามตาราง' : 'ไม่ได้ลงตาราง';
                    statusBadgeColor = 'slate';
                }
            } else {
                // Scheduled Shift
                if (latestLog && latestLog.action_type === 'check_in') {
                    const statusInfo = getShiftStatusForLog(latestLog);
                    if (statusInfo.isLate) {
                        statusCategory = 'LATE';
                        statusLabel = `สาย +${statusInfo.lateMinutes}น.`;
                        statusBadgeColor = 'amber';
                        lateMins = statusInfo.lateMinutes;
                    } else {
                        statusCategory = 'ON_DUTY';
                        statusLabel = 'อยู่ในกะ';
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
                    roster: { is_off: true, shift_name: 'กะพิเศษ' },
                    statusCategory: isOnDuty ? 'ON_DUTY' : 'COMPLETED',
                    statusLabel: isOnDuty ? 'ทำงานนอกตาราง' : 'ออกกะแล้ว',
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
            { short: "จ.", th: "จันทร์" },
            { short: "อ.", th: "อังคาร" },
            { short: "พ.", th: "พุธ" },
            { short: "พฤ.", th: "พฤหัสฯ" },
            { short: "ศ.", th: "ศุกร์" },
            { short: "ส.", th: "เสาร์" },
            { short: "อา.", th: "อาทิตย์" },
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
                dateFormatted: format(dObj, "d MMM", { locale: th }),
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
        <div className="space-y-6 pb-12">
            {/* --- Header: greeting, today's numbers, actions (Brand v2) --- */}
            <section className="border border-charcoal bg-cream">
                <div className="px-5 py-4">
                    <p className="text-sm text-neutral">{formatDate(todayObj)}</p>
                    <h2 className="font-head text-3xl leading-normal text-charcoal">สวัสดีครับบอส</h2>
                    <p className="text-base text-subtle">
                        วันนี้เข้างานแล้ว <span className="font-num text-charcoal">{currentlyOnDutyCount}/{scheduledTodayCount}</span> กะ · ตรงเวลา <span className="font-num text-charcoal">{todayPunctualityRate}%</span>
                    </p>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-px bg-rule border-t border-rule">
                    {[
                        { label: 'ตารางงาน', onClick: () => { window.location.href = '/admin/roster'; } },
                        { label: 'ลงเวลาแทนพนักงาน', onClick: () => setShowManualModal(true) },
                        { label: 'บันทึกใบลา', onClick: () => onTabChange?.('requests') },
                        { label: 'ส่งสรุปเข้า LINE', onClick: () => handleNotify('/api/notify') },
                        { label: 'ปิดยอดวันนี้', onClick: handleFinalizeDay },
                    ].map(a => (
                        <button key={a.label} type="button" onClick={a.onClick} className="min-h-12 px-3 bg-cream hover:bg-paper-2 text-base font-semibold text-charcoal transition-colors duration-150 last:col-span-2 sm:last:col-span-1">
                            {a.label}
                        </button>
                    ))}
                </div>
            </section>
            {/* Draft-roster banners removed: no draft stage (owner, 2026-11-25) */}

            {/* --- SECTION 3: TASTESKILL APP-SCREEN TELEMETRY PANEL (QUIET PANELS, ALIGNED FIGURES, COLOUR SPENT ON DATA) --- */}
            <motion.div
                initial={{ opacity: 0, y: 18 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.16, delay: 0.06, ease: 'easeOut' }}
                className="bg-cream border border-charcoal overflow-hidden"
            >
                {/* Top Header Strip: Overview | This week */}
                <div className="px-6 py-3.5 border-b border-rule flex flex-wrap items-center justify-between gap-3 bg-cream">
                    <div className="flex items-center gap-2.5">
                        <span className="text-sm text-charcoal font-semibold">
                            ภาพรวมการปฏิบัติงานและวินัยเข้ากะ
                        </span>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="inline-flex items-center bg-cream p-0.5 border border-rule">
                            {[
                                { id: "shifts", label: "กะรายวัน" },
                                { id: "punctuality", label: "ตรงเวลา %" }
                            ].map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setChartMetric(tab.id)}
                                    className={`relative px-2.5 py-1 text-xs font-num font-semibold transition-colors cursor-pointer ${
 chartMetric === tab.id ? "text-cream" : "text-neutral hover:text-charcoal"
 }`}
                                >
                                    {chartMetric === tab.id && (
                                        <motion.span
                                            layoutId="overviewChartModePill"
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                            className="absolute inset-0 bg-charcoal"
                                        />
                                    )}
                                    <span className="relative z-10">{tab.label}</span>
                                </button>
                            ))}
                        </div>
                        <span className="text-xs font-medium text-neutral pl-1">สัปดาห์นี้</span>
                    </div>
                </div>

                {/* Row 1: Aligned Tabular Figures separated by 1px hairlines */}
                <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-rule border-b border-rule bg-cream">
                    {/* Metric 1: Live On Duty / Attendance Today */}
                    <div className="p-5 sm:p-6 transition-colors hover:bg-paper-2">
                        <p className="text-xs text-neutral font-medium">อยู่ในกะตอนนี้</p>
                        <div className="mt-1.5 flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-num font-semibold text-charcoal tabular-nums">
                                <AnimatedNumber value={currentlyOnDutyCount} />
                            </span>
                            <span className="text-sm font-semibold text-neutral tabular-nums">
                                / {scheduledTodayCount} กะ
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-num font-semibold">
                            <span className="text-charcoal">
                                ● ลงเวลาวันนี้ {todayCheckInsCount} ครั้ง
                            </span>
                        </div>
                    </div>

                    {/* Metric 2: Monthly Check-ins */}
                    <div
                        onClick={() => onTabChange?.("payroll")}
                        className="p-5 sm:p-6 transition-colors hover:bg-paper-2 cursor-pointer group"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-neutral font-medium">กะเดือนนี้</p>
                            <span className="text-xs text-neutral group-hover:text-plum transition-colors">
                                เงินเดือน ↗
                            </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-num font-semibold text-charcoal tabular-nums">
                                <AnimatedNumber value={monthCheckInsCount} />
                            </span>
                            <span className="text-xs text-neutral">
                                กะสะสม
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-num font-semibold">
                            <span className="text-charcoal">
                                +{todayCheckInsCount} วันนี้
                            </span>
                            <span className="text-neutral font-normal text-xs">
                                ({activeStaffCount} พนักงาน)
                            </span>
                        </div>
                    </div>

                    {/* Metric 3: Punctuality Rate */}
                    <div className="p-5 sm:p-6 transition-colors hover:bg-paper-2">
                        <p className="text-xs text-neutral font-medium">ตรงเวลาเดือนนี้</p>
                        <div className="mt-1.5 flex items-baseline gap-2">
                            <span className="text-3xl sm:text-4xl font-num font-semibold text-charcoal tabular-nums">
                                <AnimatedNumber value={monthPunctualityRate} suffix="%" />
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-2 text-xs font-num font-semibold">
                            {todayLateCount === 0 ? (
                                <span className="text-charcoal">วันนี้ตรงเวลา 100%</span>
                            ) : (
                                <span className="text-plum">วันนี้สาย {todayLateCount} คน ({todayPunctualityRate}%)</span>
                            )}
                        </div>
                    </div>

                    {/* Metric 4: Pending & NFC Stations */}
                    <div
                        onClick={() => onTabChange?.(totalAlertsCount > 0 ? "requests" : "nfc_stations")}
                        className="p-5 sm:p-6 transition-colors hover:bg-paper-2 cursor-pointer group"
                    >
                        <div className="flex items-center justify-between">
                            <p className="text-xs text-neutral font-medium">
                                {totalAlertsCount > 0 ? "คำขอรออนุมัติ" : "จุดแตะ NFC"}
                            </p>
                            <span className="text-xs text-neutral group-hover:text-plum transition-colors">
                                {totalAlertsCount > 0 ? "ตรวจ ↗" : "จัดการ ↗"}
                            </span>
                        </div>
                        <div className="mt-1.5 flex items-baseline gap-2">
                            <span className={`text-3xl sm:text-4xl font-num font-semibold tabular-nums ${totalAlertsCount > 0 ? "text-plum" : "text-charcoal"}`}>
                                <AnimatedNumber value={totalAlertsCount > 0 ? totalAlertsCount : 9} />
                            </span>
                            <span className="text-xs text-neutral">
                                {totalAlertsCount > 0 ? "รายการรออนุมัติ" : "จุดแตะในร้าน"}
                            </span>
                        </div>
                        <div className="mt-2 flex items-center gap-1.5 text-xs font-num font-semibold">
                            {totalAlertsCount > 0 ? (
                                <span className="text-plum">● รอกดอนุมัติใบลา/สลับกะ</span>
                            ) : (
                                <span className="text-charcoal">● ใช้งานอยู่</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Row 2: Interactive 7-Day Bar Chart (Mon - Sun) with Dashed Avg Line & Signal Orange Active Callout */}
                <div className="p-6 sm:p-7 bg-cream">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-8">
                        <div>
                            <h3 className="text-xs font-semibold text-neutral">
                                {chartMetric === "shifts"
                                    ? "จำนวนกะและการลงเวลารายวัน"
                                    : "อัตราเข้างานตรงเวลารายวัน"}
                            </h3>
                        </div>
                        {activeDayData && (
                            <div className="flex items-center gap-3 text-xs font-num">
                                <span className="text-neutral">
                                    วัน{activeDayData.th} ({activeDayData.dateFormatted}):
                                </span>
                                <span className="font-semibold text-charcoal tabular-nums">
                                    ลงเวลา {activeDayData.checkInCount} ครั้ง
                                </span>
                                <span className="text-rule">|</span>
                                <span className="font-semibold text-charcoal tabular-nums">
                                    ตาราง {activeDayData.scheduled} กะ
                                </span>
                                <span className="text-rule">|</span>
                                <span className={`font-semibold tabular-nums ${activeDayData.lateCount > 0 ? "text-plum" : "text-charcoal"}`}>
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
                            className="absolute left-0 right-0 pointer-events-none z-10 transition-colors duration-150 duration-500"
                            style={{
                                bottom: `calc(28px + ${Math.round(weeklyTelemetry.avgRatio * 124)}px)`
                            }}
                        >
                            <div className="text-xs font-medium text-neutral mb-1 tabular-nums">
                                {chartMetric === "shifts"
                                    ? `เฉลี่ย ${weeklyTelemetry.avgShifts} กะ/วัน`
                                    : `เฉลี่ย ${weeklyTelemetry.avgPunctuality}%`}
                            </div>
                            <div className="w-full border-b border-dashed border-neutral/45" />
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
                                                    transition={{ duration: 0.16, ease: 'easeOut' }}
                                                    className="mb-2 px-2.5 py-1 bg-charcoal text-cream text-xs font-semibold whitespace-nowrap z-30 tabular-nums"
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
                                                    duration: 0.16,
                                                    delay: 0.08 + idx * 0.045,
                                                    ease: 'easeOut'
                                                }}
                                                style={{
                                                    height: `${Math.round(ratio * 100)}%`,
                                                    transformOrigin: "bottom"
                                                }}
                                                className={`w-full transition-colors duration-200 relative ${
 isHighlighted
 ? "bg-plum "
 : day.isToday
 ? "bg-plum/40 group-hover:bg-plum/60"
 : day.isFuture
 ? "bg-paper-2 border border-dashed border-neutral"
 : "bg-neutral/35 group-hover:bg-neutral/50"
 }`}
                                            />
                                        </div>

                                        {/* Day Label (Mon .. Sun) */}
                                        <div className="mt-2.5 flex items-center gap-1">
                                            <span
                                                className={`text-xs font-num transition-colors ${
 isHighlighted
 ? "font-semibold text-charcoal"
 : day.isToday
 ? "font-semibold text-plum"
 : "font-medium text-neutral group-hover:text-charcoal"
 }`}
                                            >
                                                {day.short}
                                            </span>
                                            {day.isToday && (
                                                <span
                                                    className="w-1.5 h-1.5 bg-plum"
                                                    title="วันนี้"
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
                transition={{ duration: 0.16, delay: 0.12, ease: 'easeOut' }}
                className="bg-cream border border-charcoal overflow-hidden"
            >
                <div className="p-5 border-b border-rule bg-paper-2 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                    <div>
                        <div className="flex items-center gap-2.5">
                            <h3 className="font-semibold text-charcoal text-sm">สถานะพนักงานวันนี้</h3>
                            <Badge color="emerald">อยู่ในกะ {currentlyOnDutyCount}</Badge>
                        </div>
                        <p className="text-xs text-neutral mt-0.5">สรุปสถานะการเข้ากะของทีมงานตามตารางงานวันนี้ ({todayStr})</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                        {[
                            { id: 'all', label: `ทั้งหมด (${liveFloorList.length})` },
                            { id: 'on_duty', label: `อยู่ในกะ (${currentlyOnDutyCount})` },
                            { id: 'upcoming', label: 'ยังไม่ถึงเวลา' },
                            { id: 'completed', label: 'ออกกะแล้ว' },
                            { id: 'late', label: 'สาย' },
                            { id: 'off', label: 'หยุด/ลา' }
                        ].map(tab => {
                            const active = rosterFilter === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setRosterFilter(tab.id)}
                                    className={`relative px-2.5 py-1 text-xs font-num font-semibold transition-colors cursor-pointer border ${
 active
 ? 'text-cream border-charcoal'
 : 'bg-cream text-neutral border-rule hover:text-charcoal hover:border-charcoal'
 }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="floorRadarFilterPill"
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                            className="absolute inset-0 bg-charcoal"
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
                                        transition={{ duration: 0.16, delay: Math.min(idx * 0.03, 0.24), ease: 'easeOut' }}
                                        key={emp.id || idx}
                                        className={`p-3.5 border transition-colors duration-150 duration-150 hover:-translate-y-[2px] hover: ${
 isWorking
 ? 'bg-cream border-charcoal'
 : 'bg-paper-2 border-rule hover:border-charcoal'
 }`}
                                    >
                                        <div className="flex items-start gap-3">
                                            <StaffAvatar employee={emp} className="w-10 h-10" textClassName="text-sm" isWorking={isWorking} />
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between gap-1">
                                                    <h4 className="text-xs font-semibold text-charcoal truncate">
                                                        {emp.name}
                                                        {emp.nickname ? <span className="text-neutral font-num font-normal ml-1">({emp.nickname})</span> : null}
                                                    </h4>
                                                </div>
                                                <p className="text-xs text-neutral">{emp.position || 'พนักงาน'}</p>
                                                <div className="mt-2 text-xs font-num flex justify-between tabular-nums">
                                                    <span className="font-semibold text-charcoal">{item.shiftName}</span>
                                                    <span className="text-neutral">{item.shiftTime}</span>
                                                </div>
                                                <div className="mt-1.5 flex items-center justify-between">
                                                    <Badge color={item.statusBadgeColor} className="text-xs px-1.5">{item.statusLabel}</Badge>
                                                    {item.punchTime && <span className="text-xs font-num text-neutral font-semibold tabular-nums">{formatTime(item.punchTime)}</span>}
                                                </div>

                                                {/* Subtle Shift Telemetry Progress Bar */}
                                                {(isWorking || isCompleted) && (
                                                    <div className="mt-2.5 w-full h-1 bg-cream overflow-hidden">
                                                        <motion.div
                                                            initial={{ width: 0 }}
                                                            animate={{ width: `${shiftProgressPct}%` }}
                                                            transition={{ duration: 0.16, ease: 'easeOut' }}
                                                            className={`h-full ${
 item.statusCategory === 'LATE'
 ? 'bg-plum'
 : isCompleted
 ? 'bg-neutral'
 : 'bg-charcoal'
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
                <div className="bg-cream border border-charcoal p-5 flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-rule -mx-5 -mt-5 p-5 bg-paper-2">
                        <div>
                            <h3 className="font-semibold text-charcoal text-sm">
                                คำขอรออนุมัติ
                            </h3>
                            <p className="text-xs text-neutral mt-0.5">
                                อนุมัติใบลา, คำขอสลับกะ, และบัญชีพนักงาน
                            </p>
                        </div>
                        <Badge color={totalAlertsCount > 0 ? "orange" : "emerald"}>
                            {totalAlertsCount > 0 ? `รอ ${totalAlertsCount} รายการ` : "ไม่มีค้าง"}
                        </Badge>
                    </div>

                    <div className="space-y-3.5 max-h-[380px] overflow-y-auto pr-1 custom-scrollbar flex-1">
                        {totalAlertsCount === 0 ? (
                            <div className="text-center py-10 space-y-3 bg-cream my-auto">
                                <div className="w-10 h-10 bg-charcoal/10 border border-charcoal/30 text-charcoal flex items-center justify-center mx-auto text-sm font-num font-semibold">
                                    
                                </div>
                                <p className="text-xs font-semibold text-charcoal">
                                    ทุกอย่างเรียบร้อยดี!
                                </p>
                                <p className="text-xs text-neutral">
                                    ไม่มีคำขออนุมัติใบลา สลับกะ หรือพนักงานสมัครใหม่ตกค้าง
                                </p>
                                <div className="pt-2 flex justify-center gap-2">
                                    <button
                                        onClick={() => onTabChange?.('roster')}
                                        className="px-3 py-1.5 bg-cream border border-rule text-charcoal text-xs font-semibold hover:border-charcoal cursor-pointer"
                                    >
                                        จัดการ Roster
                                    </button>
                                    <button
                                        onClick={() => onTabChange?.('payroll')}
                                        className="px-3 py-1.5 bg-cream border border-rule text-charcoal text-xs font-semibold hover:border-charcoal cursor-pointer"
                                    >
                                        สรุปเงินเดือน
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <>
                                {/* 1. Leave Requests */}
                                {(data.leaveRequests || []).filter(r => r.status === 'pending').map(req => (
                                    <div key={`leave-${req.id}`} className="p-3.5 bg-error/5 border border-rule space-y-2.5 animate-fade-in-up">
                                        <div className="flex justify-between items-start">
                                            <Badge color="rose">ขอลาหยุด</Badge>
                                            <span className="text-xs font-num font-semibold text-charcoal">{formatDate(req.leave_date)}</span>
                                        </div>
                                        <div className="text-xs text-charcoal">
                                            <span className="font-semibold">{req.employees?.name} {req.employees?.nickname ? `(${req.employees.nickname})` : ''}</span> ขอลาหยุดประเภท <span className="font-num font-semibold text-plum">{req.leave_type}</span>
                                            <div className="mt-1.5 p-2 bg-cream border border-rule text-xs text-neutral leading-normal">
                                                เหตุผล: &quot;{req.reason || '-'}&quot;
                                            </div>
                                            {req.replacement_employee && (
                                                <p className="mt-1.5 text-xs font-semibold text-neutral">
                                                    คนทำงานแทน: <span className="bg-cream border border-rule text-charcoal font-num px-1.5 py-0.5">{req.replacement_employee.name} {req.replacement_employee.nickname ? `(${req.replacement_employee.nickname})` : ""}</span>
                                                </p>
                                            )}
                                        </div>
                                        <div className="flex gap-2 justify-end pt-1">
                                            <button
                                                onClick={() => handleLeaveAction(req, 'approved')}
                                                className="px-3 py-1.5 bg-charcoal text-cream font-semibold text-xs border border-charcoal hover:bg-charcoal/90 cursor-pointer transition-colors duration-150"
                                            >
                                                อนุมัติ
                                            </button>
                                            <button
                                                onClick={() => handleLeaveAction(req, 'rejected')}
                                                className="px-3 py-1.5 bg-cream border border-rule text-neutral font-semibold text-xs hover:bg-neutral/10 cursor-pointer transition-colors duration-150"
                                            >
                                                ปฏิเสธ
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* 2. Shift Swaps */}
                                {(data.swapRequests || []).filter(r => r.status === 'PENDING_MANAGER').map(req => (
                                    <div key={`swap-${req.id}`} className="p-3.5 bg-plum/5 border border-rule space-y-2.5 animate-fade-in-up">
                                        <div className="flex justify-between items-start">
                                            <Badge color="blue">สลับกะ</Badge>
                                            <span className="text-xs font-num font-semibold text-charcoal">{req.target_date}</span>
                                        </div>
                                        <div className="text-xs text-charcoal">
                                            <span className="font-semibold">{req.requester?.name}</span> ขอสลับกะกับ <span className="font-semibold">{req.peer?.name || 'Open Pool'}</span>
                                            <div className="mt-1.5 p-2 bg-cream border border-rule text-xs text-neutral leading-normal">
                                                โน้ต: &quot;{req.notes || '-'}&quot;
                                            </div>
                                        </div>
                                        <div className="flex gap-2 justify-end pt-1">
                                            <button
                                                onClick={() => handleSwapDecision(req.id, 'APPROVE')}
                                                className="px-3 py-1.5 bg-charcoal text-cream font-semibold text-xs border border-charcoal hover:bg-charcoal/90 cursor-pointer transition-colors duration-150"
                                            >
                                                อนุมัติ
                                            </button>
                                            <button
                                                onClick={() => handleSwapDecision(req.id, 'REJECT')}
                                                className="px-3 py-1.5 bg-cream border border-rule text-neutral font-semibold text-xs hover:bg-neutral/10 cursor-pointer transition-colors duration-150"
                                            >
                                                ปฏิเสธ
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* 3. Pending Staff Registration */}
                                {data.pendingEmployees?.map(emp => (
                                    <div key={`emp-${emp.id}`} className="p-3.5 bg-plum/5 border border-rule space-y-2.5 animate-fade-in-up">
                                        <div className="flex justify-between items-start">
                                            <Badge color="amber">พนักงานสมัครใหม่</Badge>
                                            <span className="text-xs font-semibold text-charcoal">สมัครทาง LINE</span>
                                        </div>
                                        <div className="text-xs text-charcoal">
                                            <span className="font-semibold">{emp.name}</span> ได้สมัครบัญชีพนักงานเข้ามา รอคุณอนุมัติ
                                        </div>
                                        <div className="flex justify-end pt-1">
                                            <button
                                                onClick={() => { setEditingStaff(emp); setShowStaffModal(true); }}
                                                className="px-3 py-1.5 bg-plum text-cream font-semibold text-xs border border-charcoal hover:bg-plum-2 cursor-pointer transition-colors duration-150"
                                            >
                                                ตั้งค่า & อนุมัติบัญชี
                                            </button>
                                        </div>
                                    </div>
                                ))}

                                {/* 4. Pending Job Applications */}
                                {(data.jobApplications || []).filter(r => r.status === 'Pending').map(app => (
                                    <div key={`job-${app.id}`} className="p-3.5 bg-cream border border-rule space-y-2 animate-fade-in-up">
                                        <div className="flex justify-between items-start">
                                            <Badge color="slate">ใบสมัครงาน</Badge>
                                            <span className="text-xs font-num text-neutral">{formatDate(app.created_at)}</span>
                                        </div>
                                        <div className="text-xs text-charcoal">
                                            <span className="font-semibold">{app.full_name}</span> สมัครตำแหน่ง <span className="font-num font-semibold text-plum">{app.position_applied}</span>
                                        </div>
                                        <div className="flex justify-end pt-1">
                                            <button
                                                onClick={() => onTabChange?.('applications')}
                                                className="px-3 py-1 bg-cream border border-rule text-charcoal font-semibold text-xs hover:border-charcoal cursor-pointer"
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
                <div className="bg-cream border border-charcoal p-5 flex flex-col">
                    <div className="flex justify-between items-center mb-4 pb-3 border-b border-rule -mx-5 -mt-5 p-5 bg-paper-2">
                        <div>
                            <h3 className="font-num font-semibold text-charcoal text-sm flex items-center gap-2">
                                                                <span>จุดแตะ NFC ในร้าน</span>
                            </h3>
                            <p className="text-xs text-neutral mt-0.5">
                                ระบบจุดแตะแผ่น NFC ลงเวลา เช็กลิสต์ และนับสต็อก ({todayStr})
                            </p>
                        </div>
                        <button
                            onClick={() => onTabChange?.('nfc_stations')}
                            className="text-xs font-semibold text-plum hover:underline cursor-pointer bg-cream px-2.5 py-1 border border-rule"
                        >
                            จัดการแผ่น NFC →
                        </button>
                    </div>

                    <div className="space-y-4 flex-1">
                        <div className="space-y-2">
                            <div className="p-3 bg-paper-2 border border-rule flex justify-between items-center text-xs">
                                <div>
                                    <span className="font-semibold text-charcoal">จุดลงเวลา บาร์ และ ครัว</span>
                                    <p className="text-xs text-neutral mt-0.5">จุดแตะลงเวลาเข้า-ออกงาน (แก้ปัญหา GPS ในอาคาร)</p>
                                </div>
                                <Badge color="emerald" className="text-xs">ใช้งานอยู่</Badge>
                            </div>
                            <div className="p-3 bg-paper-2 border border-rule flex justify-between items-center text-xs">
                                <div>
                                    <span className="font-semibold text-charcoal">เครื่องชงกาแฟ และเช็กลิสต์โซน</span>
                                    <p className="text-xs text-neutral mt-0.5">จุดแตะเครื่องชงกาแฟ & ตรวจเช็กลิสต์ 4 โซน</p>
                                </div>
                                <Badge color="amber" className="text-xs">4 โซน</Badge>
                            </div>
                        </div>

                        {/* Store Quick Telemetry */}
                        <div className="pt-3 border-t border-rule grid grid-cols-2 gap-3">
                            <a
                                href="/checkin/qr-display"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-3 bg-paper-2 hover:bg-cream border border-rule hover:border-charcoal transition block"
                            >
                                <div className="text-xs font-semibold text-neutral">จอ QR หน้าร้าน</div>
                                <div className="text-xs font-semibold text-plum mt-1">
                                    เปิดจอ QR ร้าน →
                                </div>
                            </a>
                            <a
                                href="/checklist"
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-3 bg-paper-2 hover:bg-cream border border-rule hover:border-charcoal transition block"
                            >
                                <div className="text-xs font-semibold text-neutral">เช็กลิสต์และ SOP</div>
                                <div className="text-xs font-num font-semibold text-charcoal mt-1 flex items-center gap-1">
                                    <span>เปิดหน้าเช็กลิสต์ →</span>
                                </div>
                            </a>
                        </div>
                    </div>
                </div>
            </div>

            {/* --- SECTION 6: REAL-TIME ACTIVITY FEED (EXPANSIVE FULL-WIDTH AUDIT HUB) --- */}
            <div className="bg-cream border border-charcoal overflow-hidden flex flex-col">
                {/* Feed Header */}
                <div className="p-5 md:p-6 border-b border-rule bg-paper-2 space-y-4">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div>
                            <div className="flex items-center gap-2.5">
                                <h3 className="font-semibold text-charcoal text-base">
                                    บันทึกเวลาเข้า-ออก
                                </h3>
                                <span className="px-2 py-0.5 bg-cream border border-rule text-xs font-semibold text-charcoal">
                                    {filteredLogs.length} รายการ
                                </span>
                            </div>
                            <p className="text-xs text-neutral mt-0.5">
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
                                className="w-full pl-8 pr-4 py-2 bg-cream border border-rule text-xs font-num text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                            />
                                                        {activitySearch && (
                                <button
                                    onClick={() => setActivitySearch("")}
                                    className="absolute right-2.5 top-2 text-xs text-neutral hover:text-charcoal cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                >ล้าง</button>
                            )}
                        </div>
                    </div>

                    {/* Activity Filter Chips with Sliding Pill */}
                    <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-rule">
                        {[
                            { id: 'today', label: `วันนี้ (${todayLogs.length})` },
                            { id: 'all', label: `ทั้งเดือน (${(data.logs || []).length})` },
                            { id: 'check_in', label: 'เข้างาน' },
                            { id: 'check_out', label: 'ออกงาน' },
                            { id: 'late', label: 'เข้าสาย' },
                            { id: 'overnight', label: 'ข้ามคืน' },
                        ].map(tab => {
                            const active = activityFilter === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    onClick={() => setActivityFilter(tab.id)}
                                    className={`relative px-3 py-1.5 text-xs font-num font-semibold transition-colors cursor-pointer border ${
 active
 ? 'text-cream border-charcoal'
 : 'bg-cream text-neutral border-rule hover:text-charcoal hover:border-charcoal'
 }`}
                                >
                                    {active && (
                                        <motion.span
                                            layoutId="activityFeedFilterPill"
                                            transition={{ type: "spring", stiffness: 420, damping: 34 }}
                                            className="absolute inset-0 bg-charcoal"
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
                        <thead className="bg-cream text-neutral text-xs font-num font-semibold sticky top-0 z-10 border-b border-rule">
                            <tr>
                                <th className="px-6 py-3.5 whitespace-nowrap min-w-[150px]">วันที่ · เวลา</th>
                                <th className="px-4 py-3.5 whitespace-nowrap w-20 text-center">รูป</th>
                                <th className="px-6 py-3.5 whitespace-nowrap min-w-[200px]">พนักงาน</th>
                                <th className="px-5 py-3.5 whitespace-nowrap min-w-[140px]">รายการ</th>
                                <th className="px-5 py-3.5 whitespace-nowrap min-w-[160px]">สถานะ</th>
                                <th className="px-6 py-3.5 whitespace-nowrap">อารมณ์ · หมายเหตุ</th>
                                <th className="px-5 py-3.5 whitespace-nowrap w-12 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-rule bg-cream">
                            {filteredLogs.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="text-center py-16 text-neutral text-xs">
                                        ไม่พบบันทึกกิจกรรมตามเงื่อนไขที่เลือก
                                    </td>
                                </tr>
                            ) : (
                                filteredLogs.slice(0, activityLimit).map(log => {
                                    const status = getShiftStatusForLog(log);
                                    return (
                                        <tr
                                            key={log.id}
                                            className={`group transition-colors duration-150 duration-100 ${
 status.isOvernight
 ? 'bg-purple-50/40 hover:bg-purple-50/70 border-l-4 border-l-purple-500'
 : 'hover:bg-paper-2'
 }`}
                                        >
                                            {/* Date & Time */}
                                            <td className="px-6 py-4 font-num text-charcoal text-xs whitespace-nowrap">
                                                <div className="font-semibold">{formatDate(log.timestamp)}</div>
                                                <div className="text-xs text-neutral font-semibold mt-0.5">
                                                    {formatTime(log.timestamp)}
                                                </div>
                                                {status.isOvernight && (
                                                    <div className="text-xs font-num text-purple-700 font-semibold flex items-center gap-1 mt-1">
                                                        <span>กะข้ามคืน ({formatDate(parseISO(status.shiftDate))})</span>
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
                                                            className="w-10 h-10 object-cover border border-rule group-hover/photo:border-charcoal transition-colors duration-150 bg-cream"
                                                            referrerPolicy="no-referrer"
                                                        />
                                                    </button>
                                                ) : (
                                                    <span className="text-neutral font-num text-xs">-</span>
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
                                                        <div className="font-semibold text-charcoal text-xs flex items-center gap-1.5">
                                                            <span>{log.employees?.name}</span>
                                                            {log.employees?.nickname && (
                                                                <span className="text-xs font-num text-plum font-semibold">
                                                                    ({log.employees.nickname})
                                                                </span>
                                                            )}
                                                        </div>
                                                        <div className="text-xs text-neutral">
                                                            {log.employees?.position || 'พนักงาน'}
                                                        </div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Action */}
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <button
                                                    type="button"
                                                    onClick={() => handleToggleLogAction(log)}
                                                    className="cursor-pointer hover:opacity-80  transition-colors duration-150 text-left inline-block"
                                                    title="กดเพื่อสลับ เข้างาน / ออกงาน"
                                                >
                                                    <Badge color={status.isOvernight ? 'purple' : log.action_type === 'check_in' ? 'blue' : log.action_type === 'absent' ? 'rose' : 'slate'}>
                                                        {status.isOvernight ? 'ออกงาน (ข้ามคืน)' : log.action_type === 'check_in' ? 'เข้างาน' : 'ออกงาน'}
                                                    </Badge>
                                                </button>
                                            </td>

                                            {/* Status */}
                                            <td className="px-5 py-4 whitespace-nowrap">
                                                <Badge color={status.color}>{status.label}</Badge>
                                            </td>

                                            {/* Mood & Note */}
                                            <td className="px-6 py-4 whitespace-nowrap font-num text-xs">
                                                {log.mood_status || log.mood_note ? (
                                                    <div className="space-y-0.5">
                                                        {log.mood_status && (
                                                            <span className="font-semibold text-charcoal">{log.mood_status}</span>
                                                        )}
                                                        {log.mood_note && (
                                                            <p className="text-neutral max-w-[240px] truncate">&quot;{log.mood_note}&quot;</p>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="text-neutral">-</span>
                                                )}
                                            </td>

                                            {/* Delete Log */}
                                            <td className="px-5 py-4 whitespace-nowrap text-right">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}
                                                    className="flex items-center justify-center border border-rule hover:border-error hover:bg-error/10 transition-colors duration-150 cursor-pointer ml-auto min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline text-error"
                                                    title="Delete Log"
                                                >ลบ</button>
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
                    <div className="p-4 border-t border-rule bg-paper-2 flex flex-col sm:flex-row justify-between items-center gap-3 text-xs font-num">
                        <span className="text-neutral text-xs">
                            แสดง {activityLimit} จาก {filteredLogs.length} รายการ
                        </span>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setActivityLimit(prev => prev + 30)}
                                className="px-3 py-1.5 bg-cream border border-rule hover:border-charcoal text-xs font-semibold text-charcoal transition-colors duration-150 cursor-pointer"
                            >
                                แสดงเพิ่มอีก 30 รายการ
                            </button>
                            <button
                                onClick={() => setActivityLimit(filteredLogs.length)}
                                className="px-3 py-1.5 bg-charcoal text-cream border border-charcoal text-xs font-semibold transition-colors duration-150 cursor-pointer"
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
                    className="fixed inset-0 z-[70] bg-charcoal/80 flex items-center justify-center p-4 animate-fade-in"
                    onClick={() => setSelectedPhoto(null)}
                >
                    <div
                        className="bg-cream border border-charcoal max-w-lg w-full p-5 space-y-4"
                        onClick={e => e.stopPropagation()}
                    >
                        {/* Modal Header */}
                        <div className="flex justify-between items-center border-b border-rule pb-2.5">
                            <div className="flex items-center gap-2">
                                <span className="w-2.5 h-2.5 bg-plum"></span>
                                <span className="text-xs font-semibold text-neutral">รูปลงเวลา</span>
                            </div>
                            <div className="flex items-center gap-2">
                                {typeof selectedPhoto === 'object' && selectedPhoto?.id && (
                                    <span className="text-xs font-num font-semibold text-neutral bg-cream px-2 py-0.5 border border-rule">
                                        #ATT-{selectedPhoto.id}
                                    </span>
                                )}
                                <button
                                    onClick={() => setSelectedPhoto(null)}
                                    className="flex items-center justify-center border border-rule bg-cream text-charcoal text-xs cursor-pointer hover:border-charcoal min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                >ปิด</button>
                            </div>
                        </div>

                        {/* Image Canvas Container */}
                        <div className="flex items-center justify-center bg-cream border border-rule p-1.5 overflow-hidden">
                            <img
                                src={typeof selectedPhoto === 'object' ? selectedPhoto.photo_url : selectedPhoto}
                                alt="Scan Verification"
                                className="max-h-[52vh] w-auto max-w-full object-contain"
                                referrerPolicy="no-referrer"
                            />
                        </div>

                        {/* Dieter Rams Style Telemetry & Timestamp Audit Card */}
                        {typeof selectedPhoto === 'object' && (
                            <div className="bg-cream border border-rule p-3.5 space-y-2.5 font-num text-xs">
                                {/* Row 1: Staff Identity & Punch Action */}
                                <div className="flex items-center justify-between border-b border-rule pb-2">
                                    <div className="flex items-center gap-2">
                                        <StaffAvatar
                                            employee={selectedPhoto.employees}
                                            className="w-6 h-6"
                                            textClassName="text-xs"
                                        />
                                        <div>
                                            <span className="font-semibold text-charcoal text-xs">
                                                {selectedPhoto.employees?.name || 'พนักงาน'}
                                            </span>
                                            {selectedPhoto.employees?.nickname && (
                                                <span className="text-xs text-plum font-semibold ml-1">
                                                    ({selectedPhoto.employees.nickname})
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                    <span className={`px-2 py-0.5 text-xs font-semibold border ${
 selectedPhoto.action_type === 'check_in'
 ? 'bg-paper-2 text-plum border-plum'
 : 'bg-paper-2 text-plum border-plum'
 }`}>
                                        {selectedPhoto.action_type === 'check_in' ? 'เข้างาน' : 'ออกงาน'}
                                    </span>
                                </div>

                                {/* Row 2: Precision Timestamp & Telemetry Grid */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-charcoal">
                                    <div>
                                        <span className="text-xs text-neutral block font-semibold">เวลา (ไทย)</span>
                                        <span className="font-semibold text-charcoal">
                                            {selectedPhoto.timestamp ? format(new Date(selectedPhoto.timestamp), 'yyyy-MM-dd · HH:mm:ss') : '-'}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-xs text-neutral block font-semibold">วิธียืนยัน</span>
                                        <span className="text-charcoal font-semibold">
                                            {selectedPhoto.verification_method === 'QR_CODE' 
                                                ? 'สแกน QR ในร้าน' 
                                                : `GPS ในรัศมีร้าน${selectedPhoto.accuracy_meters ? ` (±${selectedPhoto.accuracy_meters} ม.)` : ''}`}
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
                                className="text-xs text-neutral hover:text-plum underline underline-offset-2"
                            >
                                ดูรูปไฟล์เต็ม ↗
                            </a>
                            <button
                                onClick={() => setSelectedPhoto(null)}
                                className="px-5 py-2 bg-charcoal text-cream text-xs font-semibold cursor-pointer hover:opacity-90"
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
