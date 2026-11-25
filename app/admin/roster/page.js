"use client";

import React, { useState, useEffect, useMemo } from 'react';
import { Badge } from '../_components/ui/Badge';
import { supabase } from '../../../lib/supabaseClient';
import { useRealtimeSync } from '../../../lib/useRealtimeSync';
import { startOfWeek, endOfWeek, addDays, format, subWeeks, addWeeks, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { SYSTEM_STANDARD_PRESETS, PRESET_COLORS } from '../../../utils/roster';

const weekLabelOf = (ws, we) => `${format(ws, 'd MMM', { locale: th })} – ${format(we, 'd MMM', { locale: th })} ${we.getFullYear() + 543}`;

export default function AdminRosterPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [loading, setLoading] = useState(true);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [editingLeaveId, setEditingLeaveId] = useState(null);
    const [selectedLeaveIds, setSelectedLeaveIds] = useState([]);
    const [leaveForm, setLeaveForm] = useState({
        leave_type: 'sick',
        reason: '',
        replacement_employee_id: '',
        startDate: '',
        endDate: ''
    });
    
    // Modal & Filter State
    const [editingCell, setEditingCell] = useState(null); // { employee, date, slots: [] }
    const [saving, setSaving] = useState(false);
    const [customPresets, setCustomPresets] = useState([]);
    const [hiddenPresetIds, setHiddenPresetIds] = useState([]); // standard presets the owner removed (this browser)
    const [managePresets, setManagePresets] = useState(false);
    const [quickPick, setQuickPick] = useState(null); // { emp, date, top, left }
    const [presetModal, setPresetModal] = useState(null); // { start, end } or null

    // Smart Auto-Generate Roster State
    const [showAutoGenModal, setShowAutoGenModal] = useState(false);
    const [autoGenForm, setAutoGenForm] = useState({ applyLeaves: true, syncTemplate: true, overwrite: true });
    const [learnedHabitsModal, setLearnedHabitsModal] = useState(null);
    const [isAutoGenerating, setIsAutoGenerating] = useState(false);

    // Employee Status, Vacation & Audit Filter State
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'VACATION'
    const [searchQuery, setSearchQuery] = useState('');
    const [adjustingEmpModal, setAdjustingEmpModal] = useState(null);
    const [auditExceptionsOnly, setAuditExceptionsOnly] = useState(false);
    const [toast, setToast] = useState(null);
    const [clearModal, setClearModal] = useState(null); // { keepLeaves }
    const [undoSnapshot, setUndoSnapshot] = useState(null); // { rows, label }
    const [customTimeOpen, setCustomTimeOpen] = useState({});

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const PRESET_ICONS = ['⏰', '🔥', '🌙', '☀️', '🍳', '🍸', '👑', '💼', '⚡', '☕', '🍴', '✨', '🎯', '📦'];

    const getPresetColor = (colorId) => PRESET_COLORS.find(c => c.id === colorId) || PRESET_COLORS[0];

    useEffect(() => {
        try {
            const saved = localStorage.getItem('roster_custom_presets');
            if (saved) {
                setCustomPresets(JSON.parse(saved));
            }
            const hidden = localStorage.getItem('roster_hidden_presets');
            if (hidden) setHiddenPresetIds(JSON.parse(hidden));
        } catch (e) {
            console.error(e);
        }
    }, []);

    // Strict Master Deduplication: Guarantees zero duplicate presets by (name + time)
    // Ensures distinct variations (e.g. ควบกะ 22:00 vs ควบกะ 00:30, CHEF 20:30 vs CHEF 21:30) are preserved,
    // while eliminating identical duplicates completely.
    const allPresets = useMemo(() => {
        const cleanList = SYSTEM_STANDARD_PRESETS.map(p => ({ ...p, isSystem: true }));

        const normalizeName = (s) => (s || '').replace(/[\s\(\)\:\-0-9\.🍳☀️🕒🌙🔥🍴⚡⏰👑✨🍸💼]/g, '').toLowerCase();
        const normalizeTime = (st, en) => `${(st || '').slice(0, 5)}-${(en || '').slice(0, 5)}`;

        (customPresets || []).forEach(cp => {
            if (!cp || !cp.start || !cp.end) return;
            const timeKey = normalizeTime(cp.start, cp.end);
            const nameKey = normalizeName(cp.name);
            const comboKey = `${nameKey}_${timeKey}`;

            const existingIdx = cleanList.findIndex(p => {
                const pCombo = `${normalizeName(p.name)}_${normalizeTime(p.start, p.end)}`;
                return (cp.id && p.id === cp.id) || pCombo === comboKey;
            });

            if (existingIdx >= 0) {
                cleanList[existingIdx] = {
                    ...cleanList[existingIdx],
                    ...cp,
                    id: cleanList[existingIdx].id,
                    isSystem: true,
                    isEdited: true
                };
            } else {
                cleanList.push({
                    ...cp,
                    id: cp.id || `custom_${timeKey}`,
                    category: 'custom',
                    categoryName: 'กะกำหนดเอง',
                    isCustom: true
                });
            }
        });

        const seenCombos = new Set();
        const deduplicated = [];

        for (const item of cleanList) {
            const timeKey = normalizeTime(item.start, item.end);
            const nameKey = normalizeName(item.name);
            const comboKey = `${nameKey}_${timeKey}`;

            if (seenCombos.has(comboKey)) {
                continue;
            }
            seenCombos.add(comboKey);
            deduplicated.push(item);
        }

        return deduplicated;
    }, [customPresets]);

    // Presets offered as choices. Hidden ones still label existing shifts in the grid.
    const visiblePresets = useMemo(() => allPresets.filter(p => !hiddenPresetIds.includes(p.id)), [allPresets, hiddenPresetIds]);

    // One-tap remove: custom presets are deleted, standard ones hidden. "คืนค่ากะมาตรฐาน" brings all back.
    const removePreset = (preset) => {
        if (preset.isCustom) {
            const next = (customPresets || []).filter(cp => cp.id !== preset.id && `custom_${(cp.start || '').slice(0, 5)}-${(cp.end || '').slice(0, 5)}` !== preset.id);
            setCustomPresets(next);
            try { localStorage.setItem('roster_custom_presets', JSON.stringify(next)); } catch (e) { console.error(e); }
        } else {
            const next = [...new Set([...hiddenPresetIds, preset.id])];
            setHiddenPresetIds(next);
            try { localStorage.setItem('roster_hidden_presets', JSON.stringify(next)); } catch (e) { console.error(e); }
        }
        showToast(`ลบกะ "${plainText(preset.name)}" ${(preset.start || '').slice(0, 5)}–${(preset.end || '').slice(0, 5)} แล้ว`, 'success');
    };

    const resetToDefaultPresets = () => {
        if (confirm('คุณต้องการรีเซ็ต Preset กะทั้งหมดกลับเป็นค่าเริ่มต้นมาตรฐานของร้าน (ตามเวลาเปิดร้านใหม่ 11:00-21:30 ครัวปิด 20:45) ใช่หรือไม่? รายการซ้ำซ้อนจะถูกลบทั้งหมด')) {
            setCustomPresets([]);
            setHiddenPresetIds([]);
            try {
                localStorage.removeItem('roster_custom_presets');
                localStorage.removeItem('roster_hidden_presets');
            } catch (e) {
                console.error(e);
            }
            showToast('รีเซ็ต Preset ทั้งหมดเป็นค่ามาตรฐานเรียบร้อยแล้ว (ร้าน 11:00-21:30)', 'success');
        }
    };

    const openPresetModal = (start = '', end = '') => {
        setPresetModal({
            isEditing: false,
            id: `custom_${Date.now()}`,
            start: (start || '').slice(0, 5) || '10:00',
            end: (end || '').slice(0, 5) || '18:00',
            name: '',
            color: 'sky',
            icon: '⏰'
        });
    };

    const openEditPresetModal = (preset) => {
        setPresetModal({
            isEditing: true,
            id: preset.id || preset.name,
            originalName: preset.name,
            start: (preset.start || '').slice(0, 5),
            end: (preset.end || '').slice(0, 5),
            name: preset.name || '',
            color: preset.color || 'sky',
            icon: preset.icon || '⏰',
            isSystem: preset.isSystem,
            isEdited: preset.isEdited,
            isCustom: preset.isCustom
        });
    };

    const confirmSavePreset = () => {
        if (!presetModal) return;
        const { id, isEditing, originalName, start, end, name, color, icon } = presetModal;
        if (!start || !end) return showToast('กรุณากรอกทั้งเวลาเริ่มและเวลาเลิก', 'error');

        const normStart = start.slice(0, 5);
        const normEnd = end.slice(0, 5);
        const presetName = (name || '').trim() || `${normStart}-${normEnd}`;

        let newCustom = [...(customPresets || [])];

        const updatedItem = {
            id: id || presetName,
            originalName: originalName || presetName,
            name: presetName,
            start: normStart,
            end: normEnd,
            color: color || 'sky',
            icon: icon || '⏰'
        };

        const existingIdx = newCustom.findIndex(p => p.id === id || p.name === originalName || p.name === presetName);
        if (existingIdx >= 0) {
            newCustom[existingIdx] = updatedItem;
        } else {
            newCustom.push(updatedItem);
        }

        setCustomPresets(newCustom);
        try {
            localStorage.setItem('roster_custom_presets', JSON.stringify(newCustom));
        } catch (e) {
            console.error(e);
        }

        showToast(`บันทึก Preset "${presetName}" (${normStart}-${normEnd}) เรียบร้อยแล้ว`, 'success');
        setPresetModal(null);
    };

    const deleteOrResetPreset = (modalData) => {
        if (!modalData) return;
        const { id, originalName, name, isSystem } = modalData;
        const confirmMsg = isSystem 
            ? `ต้องการคืนค่าเริ่มต้นของ Preset "${name}" หรือไม่?`
            : `ต้องการลบ Preset "${name}" หรือไม่?`;
            
        if (!confirm(confirmMsg)) return;

        const newCustom = (customPresets || []).filter(p => p.id !== id && p.name !== originalName && p.name !== name);
        setCustomPresets(newCustom);
        try {
            localStorage.setItem('roster_custom_presets', JSON.stringify(newCustom));
        } catch (e) {
            console.error(e);
        }

        showToast(isSystem ? `คืนค่าเริ่มต้น Preset "${name}" แล้ว` : `ลบ Preset "${name}" เรียบร้อยแล้ว`, 'success');
        setPresetModal(null);
    };

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    const weekEnd = addDays(weekStart, 6);
    const daysTitle = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
    const dates = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    useEffect(() => {
        fetchData();
    }, [currentDate]);

    useEffect(() => {
        if (!quickPick) return;
        // Close when the page or table scrolls (menu is fixed-positioned), but not when the menu's own list scrolls
        const close = (e) => { if (e?.target?.closest?.('[role="menu"]')) return; setQuickPick(null); };
        window.addEventListener('scroll', close, true);
        window.addEventListener('resize', close);
        return () => { window.removeEventListener('scroll', close, true); window.removeEventListener('resize', close); };
    }, [quickPick]);

    // Realtime Sync on Roster, Leaves, and Attendance
    useRealtimeSync(['roster_transactions', 'leave_requests', 'attendance_logs'], () => {
        fetchData();
    }, [currentDate]);

    async function fetchData() {
        setLoading(true);
        setSelectedLeaveIds([]);
        const [empRes, shiftRes, transRes, leaveRes, logsRes] = await Promise.all([
            supabase.from('employees').select('*').order('id'),
            supabase.from('shifts').select('*').order('start_time'),
            supabase.from('roster_transactions')
                .select('*')
                .gte('date', format(weekStart, 'yyyy-MM-dd'))
                .lte('date', format(weekEnd, 'yyyy-MM-dd')),
            supabase.from('leave_requests')
                .select('*, employees!employee_id(name, nickname, position), replacement_employee:employees!replacement_employee_id(name, nickname, position)')
                .gte('leave_date', format(weekStart, 'yyyy-MM-dd'))
                .lte('leave_date', format(weekEnd, 'yyyy-MM-dd')),
            supabase.from('attendance_logs')
                .select('*')
                .gte('timestamp', addDays(weekStart, -1).toISOString())
                .lte('timestamp', addDays(weekEnd, 2).toISOString())
                .order('timestamp', { ascending: true })
        ]);
        if (empRes.data) {
            const getPositionOrder = (position) => {
                const pos = (position || '').toLowerCase().trim();
                if (pos.includes('owner')) return 1;
                if (pos.includes('cook') || pos.includes('kitchen')) return 2;
                if (pos.includes('bar') || pos.includes('floor')) return 3;
                return 4;
            };
            const sorted = [...empRes.data].sort((a, b) => {
                const orderA = getPositionOrder(a.position);
                const orderB = getPositionOrder(b.position);
                if (orderA !== orderB) return orderA - orderB;
                return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'th');
            });
            setEmployees(sorted);
        }
        if (shiftRes.data) setShifts(shiftRes.data);
        if (transRes.data) setTransactions(transRes.data);
        if (leaveRes.data) setLeaveRequests(leaveRes.data);
        if (logsRes.data) setAttendanceLogs(logsRes.data);
        setLoading(false);
    }

    // Robust Session Punch Pairing Engine (Handles Overnight Shifts & Next-Day Check-outs)
    const getAttendanceOnDate = (empId, date) => {
        const targetDateStr = format(date, 'yyyy-MM-dd');
        const empLogs = (attendanceLogs || [])
            .filter(l => l.employee_id === empId)
            .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        
        const sessions = {};
        const claimedCheckOutKeys = new Set();

        const checkInLogs = empLogs.filter(l => l.action_type === 'check_in');
        const checkOutLogs = empLogs.filter(l => l.action_type === 'check_out');

        // 1. Pair each check_in with its corresponding check_out
        checkInLogs.forEach(inLog => {
            const inTime = new Date(inLog.timestamp);
            const inDateStr = format(inTime, 'yyyy-MM-dd');
            const maxOutWindow = new Date(inTime.getTime() + 20 * 60 * 60 * 1000); // 20-hour window

            const matchingOut = checkOutLogs.find(outLog => {
                const outKey = outLog.id ? String(outLog.id) : `${outLog.timestamp}_${outLog.action_type}`;
                if (claimedCheckOutKeys.has(outKey)) return false;
                const outTime = new Date(outLog.timestamp);
                return outTime > inTime && outTime <= maxOutWindow;
            });

            if (matchingOut) {
                const outKey = matchingOut.id ? String(matchingOut.id) : `${matchingOut.timestamp}_${matchingOut.action_type}`;
                claimedCheckOutKeys.add(outKey);
            }

            if (!sessions[inDateStr]) {
                sessions[inDateStr] = {
                    checkIn: inTime,
                    checkOut: matchingOut ? new Date(matchingOut.timestamp) : null
                };
            } else {
                if (inTime < sessions[inDateStr].checkIn) {
                    sessions[inDateStr].checkIn = inTime;
                }
                if (matchingOut) {
                    const outTime = new Date(matchingOut.timestamp);
                    if (!sessions[inDateStr].checkOut || outTime > sessions[inDateStr].checkOut) {
                        sessions[inDateStr].checkOut = outTime;
                    }
                }
            }
        });

        // 2. Identify unclaimed orphan check-outs
        checkOutLogs.forEach(outLog => {
            const outKey = outLog.id ? String(outLog.id) : `${outLog.timestamp}_${outLog.action_type}`;
            if (claimedCheckOutKeys.has(outKey)) return;
            const outTime = new Date(outLog.timestamp);
            const outDateStr = format(outTime, 'yyyy-MM-dd');

            if (!sessions[outDateStr]) {
                sessions[outDateStr] = {
                    checkIn: null,
                    checkOut: outTime
                };
            }
        });

        return sessions[targetDateStr] || { checkIn: null, checkOut: null };
    };

    // Every in/out session that started on this date, plus the gaps between them
    // (staff check out when they step out mid-day, then check in again).
    const getDaySessions = (empId, date) => {
        const target = format(date, 'yyyy-MM-dd');
        const logs = (attendanceLogs || []).filter(l => l.employee_id === empId).sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
        const outs = logs.filter(l => l.action_type === 'check_out');
        const claimed = new Set();
        const sessions = [];
        logs.filter(l => l.action_type === 'check_in').forEach(inLog => {
            const inTime = new Date(inLog.timestamp);
            const maxOut = inTime.getTime() + 20 * 60 * 60 * 1000;
            const out = outs.find(o => !claimed.has(o.id ?? o.timestamp) && new Date(o.timestamp) > inTime && new Date(o.timestamp).getTime() <= maxOut);
            if (out) claimed.add(out.id ?? out.timestamp);
            if (format(inTime, 'yyyy-MM-dd') === target) sessions.push({ in: inTime, out: out ? new Date(out.timestamp) : null });
        });
        const gaps = [];
        for (let k = 1; k < sessions.length; k++) {
            const prev = sessions[k - 1], cur = sessions[k];
            if (prev.out && cur.in > prev.out) gaps.push({ from: prev.out, to: cur.in, mins: Math.round((cur.in - prev.out) / 60000) });
        }
        const workedMins = sessions.reduce((sum, x) => sum + (x.out ? Math.round((x.out - x.in) / 60000) : 0), 0);
        return { sessions, gaps, workedMins };
    };
    const fmtMins = (mins) => {
        const h = Math.floor(mins / 60), m = mins % 60;
        return h > 0 ? `${h} ชม.${m ? ` ${m} น.` : ''}` : `${m} น.`;
    };

    const getCellAttendanceStatus = (empId, date, slots, empObj = null) => {
        const emp = empObj || (employees || []).find(e => e.id === empId);
        const isOwner = Boolean(emp && ((emp.position || '').toLowerCase().includes('owner') || (emp.position || '').toLowerCase().includes('ceo')));
        const { checkIn, checkOut } = getAttendanceOnDate(empId, date);
        const dateStr = format(date, 'yyyy-MM-dd');
        const todayStr = format(new Date(), 'yyyy-MM-dd');
        const isPast = dateStr < todayStr;
        const isToday = dateStr === todayStr;

        const hasWorkSlot = slots.length > 0 && !slots.some(s => s.is_off);
        const isOffSlot = slots.some(s => s.is_off);
        const isEmptySlot = slots.length === 0;

        if (hasWorkSlot) {
            if (checkIn && checkOut) {
                return {
                    type: 'OK',
                    label: `เข้า ${format(checkIn, 'HH:mm')} · ออก ${format(checkOut, 'HH:mm')}`,
                    badgeColor: 'bg-cream text-subtle border-rule'
                };
            }
            if (checkIn && !checkOut) {
                if (isToday) {
                    return {
                        type: 'ACTIVE',
                        label: `กำลังทำงาน · เข้า ${format(checkIn, 'HH:mm')}`,
                        badgeColor: 'bg-charcoal text-cream border-charcoal'
                    };
                }
                if (isOwner) return null;
                return {
                    type: 'MISSED_OUT',
                    label: `ลืมลงเวลาออก · เข้า ${format(checkIn, 'HH:mm')}`,
                    badgeColor: 'bg-plum text-cream border-plum'
                };
            }
            if (!checkIn && checkOut) {
                if (isOwner) return null;
                return {
                    type: 'MISSED_IN',
                    label: `ลืมลงเวลาเข้า · ออก ${format(checkOut, 'HH:mm')}`,
                    badgeColor: 'bg-plum text-cream border-plum'
                };
            }
            if (!checkIn && !checkOut && isPast) {
                // Owner / Executive is exempt from check-in and should not be marked as ABSENT
                if (isOwner) return null;
                return {
                    type: 'ABSENT',
                    label: 'ขาดงาน',
                    badgeColor: 'bg-plum text-cream border-plum'
                };
            }
        } else {
            // Scheduled OFF or empty slot
            if (checkIn && checkOut) {
                return {
                    type: 'OFF_DAY_WORK',
                    label: `มาวันหยุด ${format(checkIn, 'HH:mm')}–${format(checkOut, 'HH:mm')}`,
                    badgeColor: 'bg-plum/10 text-plum border-plum font-semibold'
                };
            }
            if (checkIn && !checkOut) {
                if (isOwner) return null;
                return {
                    type: 'OFF_DAY_MISSED_OUT',
                    label: `มาวันหยุด · ลืมออก (เข้า ${format(checkIn, 'HH:mm')})`,
                    badgeColor: 'bg-plum/10 text-plum border-plum font-semibold'
                };
            }
            if (!checkIn && checkOut) {
                if (isOwner) return null;
                return {
                    type: 'OFF_DAY_MISSED_IN',
                    label: `มาวันหยุด · ลืมเข้า (ออก ${format(checkOut, 'HH:mm')})`,
                    badgeColor: 'bg-plum/10 text-plum border-plum font-semibold'
                };
            }
        }

        return null;
    };

    // Helper checks for Employee Statuses
    const isSuspended = (emp) => emp.employment_status === 'Suspended' || emp.is_active === false;

    const hasVacation = (emp) => {
        if (emp.employment_status === 'Vacation') return true;
        return leaveRequests.some(l => l.employee_id === emp.id && l.leave_type === 'vacation' && l.status !== 'rejected');
    };

    const hasOtherLeave = (emp) => {
        return leaveRequests.some(l => l.employee_id === emp.id && (l.leave_type === 'sick' || l.leave_type === 'business') && l.status !== 'rejected');
    };

    // Filter calculations
    const suspendedCount = employees.filter(isSuspended).length;
    const vacationCount = employees.filter(hasVacation).length;
    const activeCount = employees.filter(e => !isSuspended(e) && !hasVacation(e)).length;

    const weeklyAuditStats = useMemo(() => {
        let missedCount = 0;
        let offDayCount = 0;
        let absentCount = 0;
        const empWithExceptions = new Set();

        employees.forEach(emp => {
            dates.forEach(d => {
                const dateStr = format(d, 'yyyy-MM-dd');
                const slots = transactions.filter(t => t.employee_id === emp.id && t.date === dateStr);
                const att = getCellAttendanceStatus(emp.id, d, slots, emp);
                if (att) {
                    if (att.type === 'MISSED_OUT' || att.type === 'MISSED_IN' || att.type === 'OFF_DAY_MISSED_OUT' || att.type === 'OFF_DAY_MISSED_IN') {
                        missedCount++;
                        empWithExceptions.add(emp.id);
                    } else if (att.type === 'OFF_DAY_WORK') {
                        offDayCount++;
                        empWithExceptions.add(emp.id);
                    } else if (att.type === 'ABSENT') {
                        absentCount++;
                        empWithExceptions.add(emp.id);
                    }
                }
            });
        });

        return { missedCount, offDayCount, absentCount, empWithExceptions };
    }, [employees, transactions, attendanceLogs, currentDate]);

    const dailyOnDutyStats = useMemo(() => {
        return dates.map(day => {
            const dateStr = format(day, 'yyyy-MM-dd');
            const workingTxs = (transactions || []).filter(t => t.date === dateStr && !t.is_off && t.status !== 'CANCELLED');
            const workingEmpIds = new Set(workingTxs.map(t => String(t.employee_id)));
            return {
                dateStr,
                count: workingEmpIds.size
            };
        });
    }, [transactions, dates]);

    const filteredEmployees = employees.filter(emp => {
        if (auditExceptionsOnly && !weeklyAuditStats.empWithExceptions.has(emp.id)) {
            return false;
        }
        if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase().trim();
            const matchName = (emp.name || '').toLowerCase().includes(q);
            const matchNick = (emp.nickname || '').toLowerCase().includes(q);
            const matchPos = (emp.position || '').toLowerCase().includes(q);
            if (!matchName && !matchNick && !matchPos) return false;
        }
        if (statusFilter === 'ACTIVE') return !isSuspended(emp) && !hasVacation(emp);
        if (statusFilter === 'SUSPENDED') return isSuspended(emp);
        if (statusFilter === 'VACATION') return hasVacation(emp);
        return true;
    });

    // Employee Status Adjuster Modal handlers
    const openAdjustingEmpModal = (emp) => {
        setAdjustingEmpModal({
            emp: emp,
            employment_status: emp.employment_status || 'Fulltime',
            is_active: emp.is_active !== false,
            createLeave: false,
            leave_type: emp.employment_status === 'Suspended' ? 'suspension' : 'vacation',
            startDate: format(weekStart, 'yyyy-MM-dd'),
            endDate: format(weekEnd, 'yyyy-MM-dd'),
            replacement_employee_id: '',
            reason: '',
            autoSyncRoster: true
        });
    };

    const handleSaveAdjustingEmp = async () => {
        if (!adjustingEmpModal) return;
        setSaving(true);
        const { emp, employment_status, is_active, createLeave, leave_type, startDate, endDate, replacement_employee_id, reason, autoSyncRoster } = adjustingEmpModal;

        try {
            // 1. Update employee status in DB
            const { error: empErr } = await supabase
                .from('employees')
                .update({
                    employment_status: employment_status,
                    is_active: is_active
                })
                .eq('id', emp.id);

            if (empErr) {
                console.warn("Update employment_status constraint note:", empErr.message);
                // Fallback: update is_active at least
                await supabase.from('employees').update({ is_active: is_active }).eq('id', emp.id);
            }

            // 2. If createLeave is checked, batch create leave requests and sync roster
            if (createLeave) {
                if (!startDate || !endDate) {
                    throw new Error("กรุณาระบุช่วงวันที่ลา/พักงานให้ครบถ้วน");
                }
                const dateList = [];
                let current = parseISO(startDate);
                const last = parseISO(endDate);
                while (current <= last) {
                    dateList.push(format(current, 'yyyy-MM-dd'));
                    current = addDays(current, 1);
                }

                if (dateList.length > 0) {
                    const mappedType = leave_type === 'suspension' ? 'business' : leave_type;
                    const mappedReason = leave_type === 'suspension' 
                        ? `[พักงาน] ${reason || 'พักงานชั่วคราว'}`
                        : (reason || (leave_type === 'vacation' ? 'พักร้อน' : 'ลางาน'));
                    const repId = replacement_employee_id ? parseInt(replacement_employee_id) : null;

                    // Bulk fetch existing leave requests for these dates
                    const { data: existingLeaves } = await supabase
                        .from('leave_requests')
                        .select('id, leave_date')
                        .eq('employee_id', emp.id)
                        .in('leave_date', dateList);

                    const existingLeaveMap = new Map((existingLeaves || []).map(l => [l.leave_date, l.id]));

                    const leavePayloads = dateList.map(dStr => {
                        const payload = {
                            employee_id: emp.id,
                            leave_date: dStr,
                            leave_type: mappedType,
                            reason: mappedReason,
                            replacement_employee_id: repId,
                            status: 'approved'
                        };
                        if (existingLeaveMap.has(dStr)) {
                            payload.id = existingLeaveMap.get(dStr);
                        }
                        return payload;
                    });

                    // Bulk upsert all leave requests in ONE single query!
                    const { error: leaveErr } = await supabase.from('leave_requests').upsert(leavePayloads);
                    if (leaveErr) throw leaveErr;

                    // Auto-sync Roster in Bulk
                    if (autoSyncRoster) {
                        // 1. Bulk delete existing roster_transactions for these dates
                        await supabase
                            .from('roster_transactions')
                            .delete()
                            .eq('employee_id', emp.id)
                            .in('date', dateList);

                        // 2. Prepare bulk insert for employee OFF transactions
                        const empOffTransactions = dateList.map(dStr => ({
                            employee_id: emp.id,
                            date: dStr,
                            is_off: true,
                            slot_type: 'MAIN',
                            status: 'PUBLISHED'
                        }));

                        // Bulk insert roster transactions via bulk API or direct upsert
                        await fetch('/api/roster/bulk', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'UPSERT', transactions: empOffTransactions })
                        });

                        // 3. Handle replacement employee if assigned
                        if (repId) {
                            // Bulk delete replacement's existing transactions for these dates
                            await supabase
                                .from('roster_transactions')
                                .delete()
                                .eq('employee_id', repId)
                                .in('date', dateList);

                            // Get employee schedules for day of week template
                            const { data: empSchedules } = await supabase
                                .from('employee_schedules')
                                .select('day_of_week, shift_id')
                                .eq('employee_id', emp.id)
                                .eq('is_off', false);

                            const schedMap = new Map((empSchedules || []).map(s => [s.day_of_week, s.shift_id]));

                            const repTransactions = dateList.map(dStr => {
                                const dayOfWeek = (parseISO(dStr).getDay() + 6) % 7;
                                const origShiftId = schedMap.get(dayOfWeek) || null;
                                return {
                                    employee_id: repId,
                                    date: dStr,
                                    shift_id: origShiftId,
                                    is_off: false,
                                    slot_type: 'MAIN',
                                    status: 'PUBLISHED'
                                };
                            });

                            await fetch('/api/roster/bulk', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'UPSERT', transactions: repTransactions })
                            });
                        }
                    }
                }
            }

            alert(`อัปเดตข้อมูลและสถานะของ ${emp.nickname || emp.name} เรียบร้อยแล้ว!`);
            setAdjustingEmpModal(null);
            await fetchData();
        } catch (e) {
            console.error(e);
            alert("เกิดข้อผิดพลาดในการบันทึก: " + e.message);
        } finally {
            setSaving(false);
        }
    };

    const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
    const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));

    // --- Brand v2 helpers ---
    const plainText = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}\uFE0F\u200D]/gu, '').replace(/\s{2,}/g, ' ').trim();

    // --- Clear the shown week ---
    // Runs with the admin's own Supabase session (RLS: authenticated may modify
    // roster_transactions), not through the unauthenticated /api/roster/bulk.
    const approvedLeaveKeys = useMemo(
        () => new Set(leaveRequests.filter(l => l.status === 'approved').map(l => `${l.employee_id}|${l.leave_date}`)),
        [leaveRequests]
    );
    const clearTargets = (keepLeaves) => transactions.filter(t => !(keepLeaves && t.is_off && approvedLeaveKeys.has(`${t.employee_id}|${t.date}`)));

    const clearWeek = async () => {
        const keep = clearModal?.keepLeaves !== false;
        const targets = clearTargets(keep);
        if (targets.length === 0) { setClearModal(null); return; }
        setSaving(true);
        try {
            const { error, count } = await supabase
                .from('roster_transactions')
                .delete({ count: 'exact' })
                .in('id', targets.map(t => t.id));
            if (error) throw error;
            if (!count) throw new Error('ลบไม่ได้ กรุณาล็อกอินแอดมินใหม่');
            setUndoSnapshot({ rows: targets, label: weekLabelOf(weekStart, weekEnd) });
            setClearModal(null);
            await fetchData();
            showToast(`ล้างตารางแล้ว ${count} กะ`, 'success');
        } catch (e) {
            showToast('ล้างตารางไม่สำเร็จ: ' + (e.message || e), 'error');
        } finally {
            setSaving(false);
        }
    };

    const undoClear = async () => {
        if (!undoSnapshot) return;
        setSaving(true);
        try {
            const rows = undoSnapshot.rows.map(({ id, created_at, ...rest }) => rest);
            const { error } = await supabase
                .from('roster_transactions')
                .upsert(rows, { onConflict: 'employee_id,date,slot_type' });
            if (error) throw error;
            setUndoSnapshot(null);
            await fetchData();
            showToast(`กู้คืนตารางแล้ว ${rows.length} กะ`, 'success');
        } catch (e) {
            showToast('กู้คืนไม่สำเร็จ: ' + (e.message || e), 'error');
        } finally {
            setSaving(false);
        }
    };

    const getCellSlots = (empId, date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return transactions.filter(t => t.employee_id === empId && t.date === dateStr);
    };

    const openCellModal = (emp, date) => {
        const existingSlots = getCellSlots(emp.id, date);
        setEditingCell({
            employee: emp,
            date: date,
            slots: existingSlots.length > 0 ? existingSlots.map(s => {
                const shiftObj = shifts.find(sh => sh.id === s.shift_id);
                return {
                    ...s,
                    shift_id: s.shift_id ? String(s.shift_id) : '',
                    preset_id: s.shift_id ? (allPresets.find(p => p.shiftId && String(p.shiftId) === String(s.shift_id))?.id || null) : null,
                    custom_start_time: (s.custom_start_time || shiftObj?.start_time || '').slice(0, 5),
                    custom_end_time: (s.custom_end_time || shiftObj?.end_time || '').slice(0, 5),
                };
            }) : [{
                slot_type: 'MAIN',
                is_off: false,
                shift_id: '',
                preset_id: null,
                custom_start_time: '',
                custom_end_time: '',
                status: 'PUBLISHED',
                isNew: true
            }]
        });
    };

    const updateSlot = (index, updates) => {
        setEditingCell(prev => {
            if (!prev) return prev;
            const newSlots = prev.slots.map((slot, i) => {
                if (i !== index) return slot;
                return { ...slot, ...updates };
            });
            return { ...prev, slots: newSlots };
        });
    };

    const handleSlotChange = (index, field, value) => {
        setEditingCell(prev => {
            if (!prev) return prev;
            const newSlots = prev.slots.map((slot, i) => {
                if (i !== index) return slot;
                const updated = { ...slot, [field]: value };
                if (field === 'shift_id') {
                    if (value) {
                        const found = shifts.find(sh => String(sh.id) === String(value));
                        if (found) {
                            updated.custom_start_time = (found.start_time || '').slice(0, 5);
                            updated.custom_end_time = (found.end_time || '').slice(0, 5);
                            updated.is_off = false;
                            updated.preset_id = allPresets.find(p => p.shiftId && String(p.shiftId) === String(value))?.id || null;
                        }
                    }
                }
                if (field === 'is_off' && value) {
                    updated.custom_start_time = '';
                    updated.custom_end_time = '';
                    updated.shift_id = '';
                    updated.preset_id = null;
                }
                return updated;
            });
            return { ...prev, slots: newSlots };
        });
    };

    // Map a preset to a DB shift id (explicit shiftId, or same name + times)
    const resolvePresetShiftId = (preset) => {
        if (preset.shiftId) return String(preset.shiftId);
        const norm = (v) => plainText(v).replace(/[\s\(\)\:\-0-9\.]/g, '').toLowerCase();
        const normPre = norm(preset.name);
        const matched = shifts.find(s => {
            const sameTime = (s.start_time || '').slice(0, 5) === (preset.start || '').slice(0, 5) &&
                (s.end_time || '').slice(0, 5) === (preset.end || '').slice(0, 5);
            const normS = norm(s.name);
            return sameTime && (normPre === normS || normPre.includes(normS) || normS.includes(normPre));
        });
        return matched ? String(matched.id) : '';
    };

    const applyPreset = (index, preset) => {
        setEditingCell(prev => {
            if (!prev) return prev;
            const newSlots = prev.slots.map((slot, i) => {
                if (i !== index) return slot;
                
                // Directly use preset's shiftId if available
                let targetShiftId = preset.shiftId ? String(preset.shiftId) : '';
                
                // If custom preset without shiftId, match by BOTH name and times against DB shifts
                if (!targetShiftId) {
                    const normPre = (preset.name || '').replace(/[\s\(\)\:\-0-9\.🍳☀️🕒🌙🔥🍴⚡⏰👑✨🍸💼]/g, '').toLowerCase();
                    const matchedShift = shifts.find(s => {
                        const sameTime = (s.start_time || '').slice(0, 5) === (preset.start || '').slice(0, 5) && 
                                         (s.end_time || '').slice(0, 5) === (preset.end || '').slice(0, 5);
                        const normS = (s.name || '').replace(/[\s\(\)\:\-0-9\.🍳☀️🕒🌙🔥🍴⚡⏰👑✨🍸💼]/g, '').toLowerCase();
                        return sameTime && (normPre === normS || normPre.includes(normS) || normS.includes(normPre));
                    });
                    if (matchedShift) targetShiftId = String(matchedShift.id);
                }

                return {
                    ...slot,
                    is_off: false,
                    shift_id: targetShiftId,
                    preset_id: preset.id || null,
                    preset_name: preset.name || null,
                    custom_start_time: (preset.start || '').slice(0, 5),
                    custom_end_time: (preset.end || '').slice(0, 5)
                };
            });
            return { ...prev, slots: newSlots };
        });
    };

    const addSlot = () => {
        setEditingCell(prev => {
            if (!prev) return prev;
            return {
                ...prev,
                slots: [
                    ...prev.slots,
                    {
                        slot_type: 'SPLIT',
                        is_off: false,
                        shift_id: '',
                        custom_start_time: '',
                        custom_end_time: '',
                        status: 'PUBLISHED',
                        isNew: true
                    }
                ]
            };
        });
    };

    const removeSlot = (index) => {
        setEditingCell(prev => {
            if (!prev) return prev;
            const newSlots = prev.slots.filter((_, i) => i !== index);
            return { ...prev, slots: newSlots };
        });
    };

    const postSaveCell = async (empId, dateStr, transactions) => {
        const res = await fetch('/api/roster/bulk', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'SAVE_CELL', employee_id: empId, date: dateStr, transactions })
        });
        if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.message || 'Save failed');
        }
    };

    // Quick pick from an empty cell: save one MAIN slot (preset) or OFF (preset = null)
    const quickSave = async (emp, date, preset) => {
        setQuickPick(null);
        const dateStr = format(date, 'yyyy-MM-dd');
        const shiftId = preset ? resolvePresetShiftId(preset) : '';
        const slot = preset
            ? { shift_id: shiftId ? parseInt(shiftId) : null, custom_start_time: (preset.start || '').slice(0, 5), custom_end_time: (preset.end || '').slice(0, 5), is_off: false }
            : { shift_id: null, custom_start_time: null, custom_end_time: null, is_off: true };
        setSaving(true);
        try {
            await postSaveCell(emp.id, dateStr, [{ employee_id: emp.id, date: dateStr, slot_type: 'MAIN', status: 'PUBLISHED', ...slot }]);
            await fetchData();
            const what = preset ? `${plainText(preset.name)} ${slot.custom_start_time}–${slot.custom_end_time}` : 'หยุด';
            showToast(`${emp.nickname || emp.name} · ${format(date, 'd MMM', { locale: th })}: ${what}`, 'success');
        } catch (e) {
            showToast(e.message || 'บันทึกไม่สำเร็จ', 'error');
        } finally {
            setSaving(false);
        }
    };

    const openQuickPick = (emp, date, el) => {
        const r = el.getBoundingClientRect();
        const W = 288, H = Math.min(window.innerHeight * 0.6, 480);
        const left = Math.max(8, Math.min(r.left, window.innerWidth - W - 8));
        const top = r.bottom + 4 + H > window.innerHeight ? Math.max(8, r.top - H - 4) : r.bottom + 4;
        setQuickPick({ emp, date, top, left });
    };

    // --- Copy shifts from the previous day ---
    const shiftTimes = (t) => {
        const sh = shifts.find(x => x.id === t.shift_id);
        return {
            start: (t.custom_start_time || sh?.start_time || '').slice(0, 5),
            end: (t.custom_end_time || sh?.end_time || '').slice(0, 5),
            name: plainText(sh?.name || ''),
        };
    };
    const slotSummary = (t) => {
        if (t.is_off) return 'หยุด';
        const { start, end, name } = shiftTimes(t);
        return [name, start && end ? `${start}–${end}` : ''].filter(Boolean).join(' ') || 'ยังไม่ระบุเวลา';
    };
    // Rows to copy for one person: skip OFF days that came from an approved leave, and rows with no time
    const copyRowsFor = (empId, fromStr, toStr) => transactions
        .filter(t => t.employee_id === empId && t.date === fromStr)
        .filter(t => !(t.is_off && approvedLeaveKeys.has(`${empId}|${fromStr}`)))
        .filter(t => t.is_off || (shiftTimes(t).start && shiftTimes(t).end))
        .map(t => {
            const { start, end } = shiftTimes(t);
            return {
                employee_id: empId, date: toStr, slot_type: t.slot_type || 'MAIN',
                shift_id: t.is_off ? null : (t.shift_id || null),
                custom_start_time: t.is_off ? null : start, custom_end_time: t.is_off ? null : end,
                is_off: !!t.is_off, status: t.status || 'PUBLISHED',
            };
        });

    const copyDayFrom = async (i) => {
        if (i === 0) return;
        const fromStr = format(dates[i - 1], 'yyyy-MM-dd');
        const toStr = format(dates[i], 'yyyy-MM-dd');
        const candidates = employees.filter(e => !isSuspended(e)).map(e => ({ e, rows: copyRowsFor(e.id, fromStr, toStr) })).filter(x => x.rows.length > 0);
        const plans = candidates.filter(x => getCellSlots(x.e.id, dates[i]).length === 0);
        const skipped = candidates.length - plans.length;
        if (plans.length === 0) {
            showToast(skipped > 0 ? `วัน${daysTitle[i]}มีกะครบแล้ว ไม่ได้คัดลอก` : `วัน${daysTitle[i - 1]}ยังไม่มีกะให้คัดลอก`, 'info');
            return;
        }
        if (!confirm(`คัดลอกกะวัน${daysTitle[i - 1]} ไปวัน${daysTitle[i]} ให้ ${plans.length} คน?${skipped > 0 ? `\n(ข้าม ${skipped} คนที่มีกะวัน${daysTitle[i]}อยู่แล้ว)` : ''}`)) return;
        setSaving(true);
        try {
            for (const x of plans) await postSaveCell(x.e.id, toStr, x.rows);
            await fetchData();
            showToast(`คัดลอกกะวัน${daysTitle[i - 1]} ไปวัน${daysTitle[i]} แล้ว ${plans.length} คน`, 'success');
        } catch (e) {
            await fetchData();
            showToast('คัดลอกไม่สำเร็จ: ' + (e.message || e), 'error');
        } finally {
            setSaving(false);
        }
    };

    const copyCellFromPrevDay = async (emp, date) => {
        setQuickPick(null);
        const toStr = format(date, 'yyyy-MM-dd');
        const fromStr = format(addDays(date, -1), 'yyyy-MM-dd');
        const rows = copyRowsFor(emp.id, fromStr, toStr);
        if (rows.length === 0) return;
        setSaving(true);
        try {
            await postSaveCell(emp.id, toStr, rows);
            await fetchData();
            showToast(`${emp.nickname || emp.name} · ${format(date, 'd MMM', { locale: th })}: เหมือนวันก่อน`, 'success');
        } catch (e) {
            showToast(e.message || 'บันทึกไม่สำเร็จ', 'error');
        } finally {
            setSaving(false);
        }
    };

    const saveCell = async () => {
        if (!editingCell) return;
        // A working shift must have a time, otherwise it shows up as an empty "กะพิเศษ"
        const missing = editingCell.slots.findIndex(sl => !sl.is_off && (!sl.custom_start_time || !sl.custom_end_time));
        if (missing >= 0) {
            showToast(`${editingCell.slots.length > 1 ? `กะที่ ${missing + 1}: ` : ''}เลือกกะ หรือใส่เวลาเริ่ม–เลิกก่อนบันทึก (หรือเลือก "หยุด")`, 'error');
            return;
        }
        setSaving(true);
        const dateStr = format(editingCell.date, 'yyyy-MM-dd');
        const empId = editingCell.employee.id;

        const payload = editingCell.slots.map(s => {
            const isOff = !!s.is_off;
            const startClean = isOff ? null : (s.custom_start_time ? s.custom_start_time.slice(0, 5) : null);
            const endClean = isOff ? null : (s.custom_end_time ? s.custom_end_time.slice(0, 5) : null);
            const shiftId = isOff ? null : (s.shift_id ? parseInt(s.shift_id) : null);

            return {
                employee_id: empId,
                date: dateStr,
                slot_type: s.slot_type || 'MAIN',
                shift_id: shiftId,
                custom_start_time: startClean,
                custom_end_time: endClean,
                is_off: isOff,
                status: s.status || 'PUBLISHED'
            };
        });

        try {
            await postSaveCell(empId, dateStr, payload);
            
            await fetchData();
            setEditingCell(null);
            showToast('บันทึกกะงานเรียบร้อยแล้ว', 'success');
        } catch (e) {
            console.error("saveCell error:", e);
            showToast(e.message || 'บันทึกไม่สำเร็จ', 'error');
        } finally {
            setSaving(false);
        }
    };

    const copyLastWeek = async () => {
        if (!confirm('ยืนยันคัดลอกตารางจากสัปดาห์ที่แล้วมายังสัปดาห์นี้? ข้อมูลเก่าในสัปดาห์นี้อาจถูกทับ')) return;
        setLoading(true);
        const lastWeekStart = format(subWeeks(weekStart, 1), 'yyyy-MM-dd');
        const lastWeekEnd = format(subWeeks(weekEnd, 1), 'yyyy-MM-dd');
        
        const { data: lastTrans } = await supabase.from('roster_transactions')
            .select('*')
            .gte('date', lastWeekStart)
            .lte('date', lastWeekEnd);
        
        if (lastTrans && lastTrans.length > 0) {
            const newTrans = lastTrans.map(t => {
                const oldDate = parseISO(t.date);
                const newDate = format(addWeeks(oldDate, 1), 'yyyy-MM-dd');
                return {
                    ...t,
                    date: newDate,
                    status: 'DRAFT', // Always copy as draft
                };
            });

            await fetch('/api/roster/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'UPSERT', transactions: newTrans })
            });
            await fetchData();
            showToast('คัดลอกตารางงานจากสัปดาห์ที่แล้วสำเร็จ', 'success');
        } else {
            showToast('ไม่พบข้อมูลสัปดาห์ที่แล้ว', 'error');
            setLoading(false);
        }
    };

    const publishWeek = async () => {
        if (!confirm('ยืนยันประกาศตารางงานสัปดาห์นี้? พนักงานจะได้รับการแจ้งเตือนผ่าน LINE')) return;
        setLoading(true);
        try {
            const res = await fetch('/api/roster/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'PUBLISH', 
                    startDate: format(weekStart, 'yyyy-MM-dd'),
                    endDate: format(weekEnd, 'yyyy-MM-dd')
                })
            });
            if (!res.ok) throw new Error('Publish failed');
            showToast('ประกาศตารางงานและส่งแจ้งเตือนเรียบร้อยแล้ว', 'success');
            await fetchData();
        } catch (e) {
            showToast(e.message || 'ประกาศตารางงานไม่สำเร็จ', 'error');
            setLoading(false);
        }
    };

    const handleExecuteAutoGenerate = async () => {
        setIsAutoGenerating(true);
        try {
            const res = await fetch('/api/roster/auto-generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'GENERATE',
                    startDate: format(weekStart, 'yyyy-MM-dd'),
                    endDate: format(weekEnd, 'yyyy-MM-dd'),
                    overwrite: autoGenForm.overwrite,
                    applyLeaves: autoGenForm.applyLeaves,
                    syncTemplate: autoGenForm.syncTemplate
                })
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.message || 'Auto-generate failed');

            setShowAutoGenModal(false);
            showToast(`จัดตารางอัตโนมัติสำเร็จ ${data.totalSlots} กะ (นำเข้าใบลา ${data.leavesApplied?.length || 0} รายการ)`, 'success');
            await fetchData();
        } catch (e) {
            showToast('เกิดข้อผิดพลาด: ' + e.message, 'error');
        } finally {
            setIsAutoGenerating(false);
        }
    };

    const handleViewLearnedHabits = async () => {
        try {
            const res = await fetch('/api/roster/auto-generate?action=LEARN');
            const data = await res.json();
            if (data.success) {
                setLearnedHabitsModal(data);
            } else {
                throw new Error(data.message || 'Failed to fetch learned habits');
            }
        } catch (e) {
            showToast('ไม่สามารถดึงข้อมูลแบบแผนได้: ' + e.message, 'error');
        }
    };

    const handleApproveAndSyncLeave = async (req) => {
        setLoading(true);
        try {
            // 1. Update status to approved
            await supabase.from('leave_requests')
                .update({ status: 'approved' })
                .eq('id', req.id);

            const dateStr = req.leave_date;

            // 2. Mark leaving employee as OFF
            await supabase.from('roster_transactions')
                .delete()
                .match({ employee_id: req.employee_id, date: dateStr });
            
            await supabase.from('roster_transactions')
                .insert({
                    employee_id: req.employee_id,
                    date: dateStr,
                    is_off: true,
                    slot_type: 'MAIN',
                    status: 'PUBLISHED'
                });

            // 3. If replacement employee exists, assign shift
            if (req.replacement_employee_id) {
                const dayOfWeek = (new Date(dateStr).getDay() + 6) % 7; // Map JS getDay() (0=Sun, 1=Mon) to DB day_of_week (0=Mon, 6=Sun)
                const { data: sched } = await supabase
                    .from('employee_schedules')
                    .select('shift_id')
                    .eq('employee_id', req.employee_id)
                    .eq('day_of_week', dayOfWeek)
                    .eq('is_off', false)
                    .maybeSingle();

                let originalShiftId = sched?.shift_id;
                let originalStart = null;
                let originalEnd = null;

                if (originalShiftId) {
                    const { data: shiftObj } = await supabase
                        .from('shifts')
                        .select('start_time, end_time')
                        .eq('id', originalShiftId)
                        .single();
                    if (shiftObj) {
                        originalStart = shiftObj.start_time;
                        originalEnd = shiftObj.end_time;
                    }
                }

                await supabase.from('roster_transactions')
                    .delete()
                    .match({ employee_id: req.replacement_employee_id, date: dateStr });

                await supabase.from('roster_transactions')
                    .insert({
                        employee_id: req.replacement_employee_id,
                        date: dateStr,
                        shift_id: originalShiftId || null,
                        custom_start_time: originalStart || null,
                        custom_end_time: originalEnd || null,
                        is_off: false,
                        slot_type: 'MAIN',
                        status: 'PUBLISHED'
                    });
            }

            alert("อนุมัติและปรับตาราง Roster เรียบร้อยแล้ว!");
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRejectLeave = async (req) => {
        if (!confirm("ต้องการปฏิเสธคำขอลาหยุดนี้ใช่หรือไม่?")) return;
        setLoading(true);
        try {
            await supabase.from('leave_requests')
                .update({ status: 'rejected' })
                .eq('id', req.id);
            alert("ปฏิเสธคำขอลาหยุดเรียบร้อยแล้ว");
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetLeaveStatus = async (req) => {
        if (!confirm("ต้องการยกเลิกการตัดสินใจ และเปลี่ยนสถานะกลับเป็นรออนุมัติใช่หรือไม่? (การตั้งค่าในตารางเวรจะไม่ถูกลบโดยอัตโนมัติ บอสสามารถปรับแก้เองเพิ่มเติมได้)")) return;
        setLoading(true);
        try {
            await supabase.from('leave_requests')
                .update({ status: 'pending' })
                .eq('id', req.id);
            showToast("เปลี่ยนสถานะคำขอลาหยุดกลับเป็นรออนุมัติเรียบร้อยแล้ว", "success");
            await fetchData();
        } catch (e) {
            showToast("เกิดข้อผิดพลาด: " + e.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteLeaveRequest = async (req) => {
        const isConfirmed = confirm(`คุณต้องการลบใบลาของคุณ ${req.employees?.nickname || req.employees?.name || 'พนักงาน'} วันที่ ${req.leave_date} ใช่หรือไม่?`);
        if (!isConfirmed) return;

        setLoading(true);
        try {
            const idsToDelete = [req.id];
            const datesToDelete = [req.leave_date];
            const replacementIds = req.replacement_employee_id ? [req.replacement_employee_id] : [];

            // 1. Delete leave requests
            const { error: delErr } = await supabase
                .from('leave_requests')
                .delete()
                .in('id', idsToDelete);
            if (delErr) throw delErr;

            // 2. Clean up roster overrides
            await supabase
                .from('roster_overrides')
                .delete()
                .eq('employee_id', req.employee_id)
                .in('date', datesToDelete);

            // 3. Clean up roster transactions
            await supabase
                .from('roster_transactions')
                .delete()
                .eq('employee_id', req.employee_id)
                .in('date', datesToDelete);

            // 4. Clean up replacements roster overrides & transactions
            for (const repId of replacementIds) {
                await supabase
                    .from('roster_overrides')
                    .delete()
                    .eq('employee_id', repId)
                    .in('date', datesToDelete);

                await supabase
                    .from('roster_transactions')
                    .delete()
                    .eq('employee_id', repId)
                    .in('date', datesToDelete);
            }

            showToast("ลบข้อมูลใบลาและเคลียร์ตาราง Roster เรียบร้อยแล้ว!", "success");
            setSelectedLeaveIds(prev => prev.filter(id => id !== req.id));
            await fetchData();
        } catch (e) {
            showToast("เกิดข้อผิดพลาดในการลบใบลา: " + e.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMultipleLeaves = async () => {
        const count = selectedLeaveIds.length;
        if (count === 0) return;
        
        const isConfirmed = confirm(`คุณต้องการลบใบลาที่เลือกทั้งหมด ${count} รายการใช่หรือไม่?`);
        if (!isConfirmed) return;

        setLoading(true);
        try {
            // Find all leave requests matching the selected IDs
            const { data: leaves, error: fetchErr } = await supabase
                .from('leave_requests')
                .select('id, employee_id, leave_date, replacement_employee_id')
                .in('id', selectedLeaveIds);
            
            if (fetchErr) throw fetchErr;
            if (!leaves || leaves.length === 0) return;

            const idsToDelete = leaves.map(l => l.id);

            // 1. Delete leave requests
            const { error: delErr } = await supabase
                .from('leave_requests')
                .delete()
                .in('id', idsToDelete);
            if (delErr) throw delErr;

            // 2. Clean up roster overrides and transactions for each leave
            for (const req of leaves) {
                const datesToDelete = [req.leave_date];
                const replacementIds = req.replacement_employee_id ? [req.replacement_employee_id] : [];

                await supabase
                    .from('roster_overrides')
                    .delete()
                    .eq('employee_id', req.employee_id)
                    .in('date', datesToDelete);

                await supabase
                    .from('roster_transactions')
                    .delete()
                    .eq('employee_id', req.employee_id)
                    .in('date', datesToDelete);

                for (const repId of replacementIds) {
                    await supabase
                        .from('roster_overrides')
                        .delete()
                        .eq('employee_id', repId)
                        .in('date', datesToDelete);

                    await supabase
                        .from('roster_transactions')
                        .delete()
                        .eq('employee_id', repId)
                        .in('date', datesToDelete);
                }
            }

            showToast(`ลบใบลาสำเร็จ ${idsToDelete.length} รายการ และเคลียร์ตาราง Roster เรียบร้อยแล้ว!`, "success");
            setSelectedLeaveIds([]);
            await fetchData();
        } catch (e) {
            showToast("เกิดข้อผิดพลาดในการลบใบลา: " + e.message, "error");
        } finally {
            setLoading(false);
        }
    };


    const syncAllApprovedLeaves = async () => {
        setLoading(true);
        const approvedLeaves = leaveRequests.filter(l => l.status === 'approved');
        if (approvedLeaves.length === 0) {
            showToast("ไม่มีใบลาที่อนุมัติแล้วในสัปดาห์นี้ให้ซิงค์", "info");
            setLoading(false);
            return;
        }

        try {
            let count = 0;
            for (const req of approvedLeaves) {
                const dateStr = req.leave_date;
                
                await supabase.from('roster_transactions')
                    .delete()
                    .match({ employee_id: req.employee_id, date: dateStr });
                
                await supabase.from('roster_transactions')
                    .insert({
                        employee_id: req.employee_id,
                        date: dateStr,
                        is_off: true,
                        slot_type: 'MAIN',
                        status: 'PUBLISHED'
                    });
                
                if (req.replacement_employee_id) {
                    const dayOfWeek = (new Date(dateStr).getDay() + 6) % 7; // Map JS getDay() (0=Sun, 1=Mon) to DB day_of_week (0=Mon, 6=Sun)
                    const { data: sched } = await supabase
                        .from('employee_schedules')
                        .select('shift_id')
                        .eq('employee_id', req.employee_id)
                        .eq('day_of_week', dayOfWeek)
                        .eq('is_off', false)
                        .maybeSingle();

                    let originalShiftId = sched?.shift_id;
                    let originalStart = null;
                    let originalEnd = null;

                    if (originalShiftId) {
                        const { data: shiftObj } = await supabase
                            .from('shifts')
                            .select('start_time, end_time')
                            .eq('id', originalShiftId)
                            .single();
                        if (shiftObj) {
                            originalStart = shiftObj.start_time;
                            originalEnd = shiftObj.end_time;
                        }
                    }

                    await supabase.from('roster_transactions')
                        .delete()
                        .match({ employee_id: req.replacement_employee_id, date: dateStr });

                    await supabase.from('roster_transactions')
                        .insert({
                            employee_id: req.replacement_employee_id,
                            date: dateStr,
                            shift_id: originalShiftId || null,
                            custom_start_time: originalStart || null,
                            custom_end_time: originalEnd || null,
                            is_off: false,
                            slot_type: 'MAIN',
                            status: 'PUBLISHED'
                        });
                }
                count++;
            }
            showToast(`ซิงค์ข้อมูลใบลาอนุมัติสำเร็จ ${count} รายการเข้าสู่ตารางเวร!`, "success");
            await fetchData();
        } catch (e) {
            showToast("เกิดข้อผิดพลาดในการซิงค์: " + e.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const startEditLeave = (req) => {
        setEditingLeaveId(req.id);
        setLeaveForm({
            leave_type: req.leave_type,
            reason: req.reason || '',
            replacement_employee_id: req.replacement_employee_id || '',
            startDate: req.leave_date,
            endDate: req.leave_date
        });
    };

    const saveLeaveEdit = async (id) => {
        if (!leaveForm.startDate || !leaveForm.endDate) return showToast("กรุณาระบุวันที่เริ่มและสิ้นสุด", "error");
        setLoading(true);
        try {
            // Find original request
            const req = leaveRequests.find(l => l.id === id);
            if (!req) throw new Error("ไม่พบข้อมูลคำขอลา");

            // Generate list of dates in range
            const dateList = [];
            let current = new Date(leaveForm.startDate);
            const last = new Date(leaveForm.endDate);
            while (current <= last) {
                dateList.push(format(current, 'yyyy-MM-dd'));
                current.setDate(current.getDate() + 1);
            }

            if (dateList.length === 0) throw new Error("ช่วงวันที่ระบุไม่ถูกต้อง");

            // 1. Update the original request with the first date of the range
            const { error: updateError } = await supabase
                .from('leave_requests')
                .update({
                    leave_date: dateList[0],
                    leave_type: leaveForm.leave_type,
                    reason: leaveForm.reason,
                    replacement_employee_id: leaveForm.replacement_employee_id ? parseInt(leaveForm.replacement_employee_id) : null,
                })
                .eq('id', id);

            if (updateError) throw updateError;

            // 2. If multiple dates, check and insert them
            if (dateList.length > 1) {
                const extraDates = dateList.slice(1);
                for (const date of extraDates) {
                    const { data: existing } = await supabase
                        .from('leave_requests')
                        .select('id')
                        .eq('employee_id', req.employee_id)
                        .eq('leave_date', date)
                        .maybeSingle();

                    const payload = {
                        employee_id: req.employee_id,
                        leave_date: date,
                        leave_type: leaveForm.leave_type,
                        reason: leaveForm.reason,
                        replacement_employee_id: leaveForm.replacement_employee_id ? parseInt(leaveForm.replacement_employee_id) : null,
                        status: req.status // Preserve original status
                    };

                    if (existing) {
                        await supabase.from('leave_requests').update(payload).eq('id', existing.id);
                    } else {
                        await supabase.from('leave_requests').insert(payload);
                    }
                }
            }

            showToast("อัปเดตช่วงวันลาเรียบร้อยแล้ว", "success");
            setEditingLeaveId(null);
            await fetchData();
        } catch (e) {
            showToast("เกิดข้อผิดพลาด: " + e.message, "error");
        } finally {
            setLoading(false);
        }
    };

    const weekLabel = weekLabelOf(weekStart, weekEnd);
    const leaveTypeTh = (t) => (t === 'sick' ? 'ลาป่วย' : t === 'business' ? 'ลากิจ' : 'พักร้อน');
    const toolBtn = 'min-h-12 px-4 flex items-center justify-center text-base font-semibold bg-cream text-charcoal hover:bg-paper-2 transition-colors duration-150 disabled:opacity-50';

    return (
        <div className="brand-v2 min-h-screen relative">
            {/* Toast */}
            {toast && (
                <div role="status" className={`fixed top-4 right-4 z-[60] max-w-sm flex items-start gap-3 px-4 py-3 border text-base ${
 toast.type === 'error'
 ? 'bg-error text-cream border-error'
 : 'bg-charcoal text-cream border-charcoal'
 }`}>
                    <span className="flex-1">{toast.message}</span>
                    <button type="button" onClick={() => setToast(null)} className="text-sm font-semibold underline underline-offset-4 shrink-0">
                        ปิด
                    </button>
                </div>
            )}

            {/* Header: plum bar */}
            <header className="w-full bg-plum text-cream border-b border-plum-3">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 flex items-stretch">
                    <a href="/admin" className="min-h-14 pr-4 flex items-center text-base text-on-plum-2 hover:text-cream transition-colors duration-150 border-r border-plum-3">
                        ← แดชบอร์ด
                    </a>
                    <div className="flex-1 px-4 py-3 min-w-0">
                        <h1 className="font-head text-2xl">จัดตารางงาน</h1>
                        <p className="text-sm text-on-plum-2">กะยืดหยุ่น ข้ามวัน และกะควบ</p>
                    </div>
                    <div className="hidden sm:flex items-center pl-4 border-l border-plum-3">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img src="/logo-inbaan-wordmark-cream-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto" />
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 flex flex-col gap-4">

                {/* Week navigator */}
                <section className="border border-charcoal bg-cream grid grid-cols-[auto_1fr_auto] items-stretch">
                    <button type="button" onClick={prevWeek} className="min-h-14 px-4 text-base font-semibold text-charcoal hover:bg-paper-2 border-r border-rule transition-colors duration-150">
                        ← <span className="hidden sm:inline">สัปดาห์ก่อน</span>
                    </button>
                    <div className="px-4 py-2 text-center">
                        <h2 className="text-xl font-semibold text-charcoal">{weekLabel}</h2>
                        <p className="text-sm text-neutral">สัปดาห์ที่ <span className="font-num">{format(weekStart, 'w')}</span></p>
                    </div>
                    <button type="button" onClick={nextWeek} className="min-h-14 px-4 text-base font-semibold text-charcoal hover:bg-paper-2 border-l border-rule transition-colors duration-150">
                        <span className="hidden sm:inline">สัปดาห์ถัดไป</span> →
                    </button>
                </section>

                {/* Toolbar: secondary actions as one bordered row, one charcoal primary */}
                <section className="flex flex-col lg:flex-row gap-2">
                    <div className="flex-1 grid grid-cols-2 sm:grid-cols-4 gap-px bg-rule border border-rule">
                        <button type="button" onClick={() => setShowAutoGenModal(true)} className={toolBtn}>จัดตารางอัตโนมัติ</button>
                        <button type="button" onClick={copyLastWeek} className={toolBtn}>คัดลอกสัปดาห์ก่อน</button>
                        <a href={`/admin/roster/report?start=${format(weekStart, 'yyyy-MM-dd')}`} target="_blank" className={toolBtn}>ส่งออก PDF</a>
                        <button
                            type="button"
                            onClick={() => setClearModal({ keepLeaves: true })}
                            disabled={transactions.length === 0}
                            className={`${toolBtn} !text-error`}
                        >
                            ล้างตารางสัปดาห์นี้
                        </button>
                    </div>
                    <button
                        type="button"
                        onClick={publishWeek}
                        className="min-h-12 px-6 bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold transition-colors duration-150 lg:min-w-[220px]"
                    >
                        ประกาศตาราง + แจ้ง LINE
                    </button>
                </section>

                {/* Undo after clearing */}
                {undoSnapshot && (
                    <section className="border border-charcoal bg-paper-2 px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <p className="text-base text-charcoal">
                            ล้างตาราง {undoSnapshot.label} แล้ว <span className="font-num">{undoSnapshot.rows.length}</span> กะ
                        </p>
                        <div className="flex gap-2 shrink-0">
                            <button type="button" onClick={undoClear} disabled={saving} className="min-h-12 px-4 bg-plum hover:bg-plum-2 text-cream text-base font-semibold transition-colors duration-150 disabled:opacity-50">
                                {saving ? 'กำลังกู้คืน…' : 'เลิกทำ'}
                            </button>
                            <button type="button" onClick={() => setUndoSnapshot(null)} className="min-h-12 px-4 border border-charcoal text-base text-charcoal hover:bg-cream transition-colors duration-150">
                                ปิด
                            </button>
                        </div>
                    </section>
                )}

                {/* Draft / empty notice */}
                {(() => {
                    const weekDrafts = transactions.filter(t => t.status === 'DRAFT');
                    if (weekDrafts.length > 0) {
                        return (
                            <section className="bg-plum text-cream px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <p className="text-base font-semibold">ตารางร่าง <span className="font-num">{weekDrafts.length}</span> กะ ยังไม่ได้ประกาศ</p>
                                    <p className="text-sm text-on-plum-2">ตรวจหรือแก้บางช่องได้ แล้วกด &ldquo;ประกาศตาราง + แจ้ง LINE&rdquo; เมื่อพร้อม</p>
                                </div>
                            </section>
                        );
                    }
                    if (!loading && transactions.length === 0) {
                        return (
                            <section className="border border-rule bg-cream px-4 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                <div>
                                    <p className="text-base font-semibold text-charcoal">สัปดาห์นี้ยังไม่มีตารางงาน</p>
                                    <p className="text-sm text-neutral">กด &ldquo;จัดตารางอัตโนมัติ&rdquo; ให้ระบบจัดตามเวลาเข้างานปกติ พร้อมใส่วันลาที่อนุมัติแล้ว</p>
                                </div>
                                <button type="button" onClick={() => setShowAutoGenModal(true)} className="min-h-12 px-4 border border-charcoal text-base font-semibold text-charcoal hover:bg-paper-2 transition-colors duration-150 shrink-0">
                                    จัดตารางอัตโนมัติ
                                </button>
                            </section>
                        );
                    }
                    return null;
                })()}

                {/* Audit summary */}
                <section className="border border-rule bg-cream flex flex-col md:flex-row md:items-stretch">
                    <div className="grid grid-cols-3 flex-1 divide-x divide-rule">
                        {[
                            { label: 'ลืมลงเวลา', n: weeklyAuditStats.missedCount },
                            { label: 'มาทำวันหยุด', n: weeklyAuditStats.offDayCount },
                            { label: 'ขาดงาน', n: weeklyAuditStats.absentCount },
                        ].map((s) => (
                            <div key={s.label} className="px-4 py-3">
                                <p className="text-sm text-neutral">{s.label}</p>
                                <p className={`font-num text-2xl ${s.n > 0 ? 'text-plum' : 'text-charcoal'}`}>{s.n}</p>
                            </div>
                        ))}
                    </div>
                    <button
                        type="button"
                        onClick={() => setAuditExceptionsOnly(!auditExceptionsOnly)}
                        aria-pressed={auditExceptionsOnly}
                        className={`min-h-12 px-4 border-t md:border-t-0 md:border-l border-rule text-base font-semibold transition-colors duration-150 ${auditExceptionsOnly ? 'bg-plum text-cream' : 'text-charcoal hover:bg-paper-2'}`}
                    >
                        {auditExceptionsOnly ? 'แสดงเฉพาะที่ผิดปกติ' : 'ดูเฉพาะที่ผิดปกติ'}
                    </button>
                </section>

                <section className="border border-charcoal bg-cream">
                    {/* Filters + search */}
                    <div className="p-4 border-b border-rule flex flex-col md:flex-row md:items-end justify-between gap-3">
                        <div>
                            <p className="text-sm font-semibold text-neutral mb-1">กรองพนักงาน</p>
                            <div className="grid w-full sm:inline-grid sm:w-auto grid-cols-2 sm:grid-cols-4 gap-px bg-rule border border-rule">
                                {[
                                    { id: 'ALL', label: 'ทั้งหมด', n: employees.length },
                                    { id: 'ACTIVE', label: 'ทำงานปกติ', n: activeCount },
                                    { id: 'SUSPENDED', label: 'พักงาน', n: suspendedCount },
                                    { id: 'VACATION', label: 'พักร้อน', n: vacationCount },
                                ].map((f) => (
                                    <button
                                        key={f.id}
                                        type="button"
                                        onClick={() => setStatusFilter(f.id)}
                                        aria-pressed={statusFilter === f.id}
                                        className={`min-h-12 px-4 text-base transition-colors duration-150 ${statusFilter === f.id ? 'bg-charcoal text-cream font-semibold' : 'bg-cream text-charcoal hover:bg-paper-2'}`}
                                    >
                                        {f.label} <span className="font-num text-sm">{f.n}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                        <div className="md:w-72">
                            <label htmlFor="roster-search" className="block text-sm font-semibold text-neutral mb-1">ค้นหา</label>
                            <input
                                id="roster-search"
                                type="search"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="ชื่อ หรือ ตำแหน่ง"
                                className="w-full min-h-12 px-4 text-base bg-cream border border-charcoal text-charcoal placeholder:text-neutral outline-none focus-visible:border-plum"
                            />
                        </div>
                    </div>

                    {/* Roster grid */}
                    <div className="overflow-x-auto">
                        {loading ? (
                            <p className="p-16 text-center text-base text-neutral">กำลังโหลดตารางงาน…</p>
                        ) : filteredEmployees.length === 0 ? (
                            <p className="p-16 text-center text-base text-neutral">ไม่พบพนักงานตามที่กรอง</p>
                        ) : (
                            <table className="w-full text-left border-collapse">
                                <thead className="border-b border-charcoal">
                                    <tr>
                                        <th className="px-4 py-3 min-w-[168px] sticky left-0 bg-cream z-20 border-r border-charcoal text-sm font-semibold text-neutral align-bottom">
                                            พนักงาน
                                        </th>
                                        {dates.map((date, i) => {
                                            const isToday = format(date, 'yyyy-MM-dd') === format(new Date(), 'yyyy-MM-dd');
                                            return (
                                                <th key={i} className={`px-3 py-3 text-center min-w-[136px] border-l border-rule align-bottom ${isToday ? 'bg-charcoal text-cream' : 'bg-cream'}`}>
                                                    <div className={`text-sm font-semibold ${isToday ? 'text-cream' : 'text-charcoal'}`}>{daysTitle[i]}</div>
                                                    <div className={`font-num text-base ${isToday ? 'text-cream' : 'text-charcoal'}`}>{format(date, 'dd/MM')}</div>
                                                    <div className={`text-xs ${isToday ? 'text-dark-muted' : 'text-neutral'}`}>เข้างาน <span className="font-num">{dailyOnDutyStats[i]?.count || 0}</span> คน</div>
                                                    {i > 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => copyDayFrom(i)}
                                                            disabled={saving}
                                                            className={`mt-1 min-h-8 px-2 text-xs font-normal underline underline-offset-4 disabled:opacity-50 ${isToday ? 'text-cream' : 'text-plum'}`}
                                                            title={`คัดลอกกะทุกคนจากวัน${daysTitle[i - 1]} มาใส่ช่องที่ยังว่าง`}
                                                        >
                                                            เหมือนวัน{daysTitle[i - 1]}
                                                        </button>
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEmployees.map(emp => {
                                        const empSuspended = isSuspended(emp);
                                        const empVacation = hasVacation(emp);
                                        const empLeave = hasOtherLeave(emp);
                                        return (
                                            <tr key={emp.id} className="border-b border-rule">
                                                <td className="p-0 sticky left-0 bg-cream z-10 border-r border-charcoal align-top">
                                                    <button
                                                        type="button"
                                                        onClick={() => openAdjustingEmpModal(emp)}
                                                        className="group/emp w-full min-h-[76px] px-4 py-3 text-left hover:bg-paper-2 transition-colors duration-150 flex flex-col"
                                                        title="ปรับสถานะ / การลา"
                                                    >
                                                        <span className="text-base font-semibold text-charcoal">{emp.nickname || emp.name}</span>
                                                        <span className="text-sm text-neutral">{emp.position}</span>
                                                        {(empSuspended || empVacation || (empLeave && !empVacation)) && (
                                                            <span className="flex flex-wrap gap-1 mt-1">
                                                                {empSuspended && <span className="px-1.5 text-xs font-semibold bg-error text-cream">พักงาน</span>}
                                                                {empVacation && <span className="px-1.5 text-xs font-semibold bg-charcoal text-cream">พักร้อน</span>}
                                                                {empLeave && !empVacation && <span className="px-1.5 text-xs font-semibold border border-plum text-plum">มีวันลา</span>}
                                                            </span>
                                                        )}
                                                        <span className="text-xs text-plum mt-1 opacity-0 group-hover/emp:opacity-100 group-focus-visible/emp:opacity-100 transition-opacity duration-150">ปรับสถานะ / การลา</span>
                                                    </button>
                                                </td>
                                                {dates.map((date, i) => {
                                                    const slots = getCellSlots(emp.id, date);
                                                    const dateStr = format(date, 'yyyy-MM-dd');
                                                    const empLeaves = leaveRequests.filter(l => l.employee_id === emp.id && l.leave_date === dateStr);
                                                    const attendanceStatus = getCellAttendanceStatus(emp.id, date, slots, emp);
                                                    const hasDiscrepancy = attendanceStatus && (attendanceStatus.type === 'OFF_DAY_WORK' || attendanceStatus.type.includes('MISSED') || attendanceStatus.type === 'ABSENT');

                                                    return (
                                                        <td key={i} className={`p-1.5 border-l border-rule align-top ${empSuspended ? 'bg-paper-2' : ''}`}>
                                                            <button
                                                                type="button"
                                                                onClick={(e) => slots.length === 0
                                                                    ? openQuickPick(emp, date, e.currentTarget)
                                                                    : openCellModal(emp, date)}
                                                                aria-haspopup={slots.length === 0 ? 'menu' : 'dialog'}
                                                                aria-label={`แก้กะ ${emp.nickname || emp.name} ${daysTitle[i]} ${format(date, 'dd/MM')}`}
                                                                className={`group w-full min-h-[76px] p-1.5 flex flex-col gap-1 text-left transition-colors duration-150 border ${
 hasDiscrepancy ? 'border-transparent bg-plum/5 hover:bg-plum/10' : 'border-transparent hover:border-charcoal hover:bg-paper-2'
 }`}
                                                            >
                                                                {slots.length === 0 && empLeaves.length === 0 && !attendanceStatus && (
                                                                    <span className="m-auto text-sm text-neutral opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100 transition-opacity duration-150">
                                                                        + เพิ่มกะ
                                                                    </span>
                                                                )}

                                                                {attendanceStatus && (
                                                                    <span className={`px-1.5 py-0.5 text-xs border ${attendanceStatus.badgeColor}`}>
                                                                        {attendanceStatus.label}
                                                                    </span>
                                                                )}
                                                                {(() => {
                                                                    const day = getDaySessions(emp.id, date);
                                                                    if (day.gaps.length === 0) return null;
                                                                    return (
                                                                        <span className="block px-1.5 py-0.5 text-xs text-plum border-l-2 border-plum">
                                                                            {day.gaps.map((g, gi) => (
                                                                                <span key={gi} className="block">ออกระหว่างวัน <span className="font-num">{format(g.from, 'HH:mm')}–{format(g.to, 'HH:mm')}</span> ({fmtMins(g.mins)})</span>
                                                                            ))}
                                                                            <span className="block text-subtle">ทำงานจริง {fmtMins(day.workedMins)}</span>
                                                                        </span>
                                                                    );
                                                                })()}

                                                                {empLeaves.map((l, idx) => (
                                                                    <span
                                                                        key={`leave-${idx}`}
                                                                        className={`px-1.5 py-0.5 text-xs border ${
 l.status === 'approved' ? 'border-charcoal text-charcoal'
 : l.status === 'rejected' ? 'border-rule text-neutral line-through'
 : 'border-plum text-plum font-semibold'
 }`}
                                                                    >
                                                                        {leaveTypeTh(l.leave_type)} · {l.status === 'approved' ? 'อนุมัติ' : l.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}
                                                                    </span>
                                                                ))}

                                                                {slots.map((s, idx) => {
                                                                    const shiftObj = shifts.find(sh => sh.id === s.shift_id);
                                                                    const startClean = (s.custom_start_time || shiftObj?.start_time || '').slice(0, 5);
                                                                    const endClean = (s.custom_end_time || shiftObj?.end_time || '').slice(0, 5);
                                                                    const timeStr = startClean && endClean ? `${startClean}–${endClean}` : (shiftObj ? `${shiftObj.start_time.slice(0, 5)}–${shiftObj.end_time.slice(0, 5)}` : '');

                                                                    // Match against presets prioritizing shift_id and exact role
                                                                    const matchedPreset = (!s.is_off && (s.shift_id || (startClean && endClean)))
                                                                        ? allPresets.find(p => {
                                                                            if (s.shift_id && p.shiftId && String(p.shiftId) === String(s.shift_id)) return true;
                                                                            if (shiftObj && (p.start || '').slice(0, 5) === startClean && (p.end || '').slice(0, 5) === endClean) {
                                                                                const normP = (p.name || '').replace(/[\s\(\)\:\-0-9\.🍳☀️🕒🌙🔥🍴⚡⏰👑✨🍸💼]/g, '').toLowerCase();
                                                                                const normS = (shiftObj.name || '').replace(/[\s\(\)\:\-0-9\.🍳☀️🕒🌙🔥🍴⚡⏰👑✨🍸💼]/g, '').toLowerCase();
                                                                                return normP === normS || normP.includes(normS) || normS.includes(normP);
                                                                            }
                                                                            return false;
                                                                        })
                                                                        : null;

                                                                    // Match against DB shifts only when shiftObj is missing
                                                                    const matchedDbShift = (!shiftObj && !s.is_off && startClean && endClean)
                                                                        ? shifts.find(sh => (sh.start_time || '').slice(0, 5) === startClean && (sh.end_time || '').slice(0, 5) === endClean)
                                                                        : null;

                                                                    const approvedLeave = empLeaves.find(l => l.status === 'approved');
                                                                    const incomplete = !s.is_off && !timeStr;
                                                                    const bgColor = s.is_off
                                                                        ? 'bg-paper-2 border-rule text-subtle'
                                                                        : incomplete ? 'bg-cream border-plum text-plum'
                                                                        : (matchedPreset
                                                                            ? `${getPresetColor(matchedPreset.color).bg} ${getPresetColor(matchedPreset.color).border} ${getPresetColor(matchedPreset.color).text}`
                                                                            : getShiftColorClass(s, shiftObj || matchedDbShift));
                                                                    const cellLabel = s.is_off
                                                                        ? (approvedLeave ? `หยุด · ${leaveTypeTh(approvedLeave.leave_type)}` : 'หยุด')
                                                                        : plainText(shiftObj ? shiftObj.name : (matchedPreset ? matchedPreset.name : (matchedDbShift?.name || (timeStr ? `กะ ${timeStr}` : 'ยังไม่ระบุเวลา'))));

                                                                    return (
                                                                        <span key={idx} className={`block px-1.5 py-1 border ${bgColor} ${s.status === 'DRAFT' ? '!border-dashed' : ''}`}>
                                                                            <span className="block text-sm font-semibold">{cellLabel}</span>
                                                                            {!s.is_off && timeStr && <span className="block font-num text-xs">{timeStr}</span>}
                                                                            {s.slot_type !== 'MAIN' && <span className="block text-xs opacity-70">{s.slot_type === 'SPLIT' ? 'กะแยก' : s.slot_type}</span>}
                                                                        </span>
                                                                    );
                                                                })}
                                                            </button>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        )}
                    </div>
                </section>

            {/* Section: Leave Requests of the Week */}
            <div className="bg-cream border border-charcoal p-5 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-sm font-num font-semibold text-charcoal flex items-center gap-2">
                            ข้อมูลการลาหยุดสัปดาห์นี้ ({leaveRequests.length} รายการ)
                        </h2>
                        <p className="text-xs font-num text-neutral">จัดการ อนุมัติ ปรับรายละเอียดการลา และซิงค์เข้าสู่ตารางเวร roster โดยตรง</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {selectedLeaveIds.length > 0 && (
                            <button
                                type="button"
                                onClick={handleDeleteMultipleLeaves}
                                className="flex items-center gap-2 px-3 py-1.5 bg-error/10 hover:bg-error/20 text-error border border-error/30 text-xs font-num font-semibold transition-colors duration-150 cursor-pointer"
                            >
                                ลบใบลาที่เลือก ({selectedLeaveIds.length})
                            </button>
                        )}
                        {leaveRequests.length > 0 && (
                            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-cream hover:bg-cream border border-rule text-xs font-num font-semibold transition-colors duration-150 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={leaveRequests.length > 0 && selectedLeaveIds.length === leaveRequests.length}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedLeaveIds(leaveRequests.map(r => r.id));
                                        } else {
                                            setSelectedLeaveIds([]);
                                        }
                                    }}
                                    className="w-3 h-3 border-charcoal bg-cream accent-plum focus:ring-0 cursor-pointer"
                                />
                                เลือกทั้งหมด
                            </label>
                        )}
                        {leaveRequests.filter(l => l.status === 'approved').length > 0 && (
                            <button 
                                type="button"
                                onClick={syncAllApprovedLeaves}
                                className="flex items-center gap-2 px-3 py-1.5 bg-cream hover:bg-cream text-charcoal border border-charcoal text-xs font-num font-semibold transition-colors duration-150 cursor-pointer"
                            >
                                ซิงค์ใบลาที่อนุมัติแล้วทั้งหมดเข้าตาราง
                            </button>
                        )}
                    </div>
                </div>
                
                {leaveRequests.length === 0 ? (
                    <div className="text-center py-8 text-neutral text-xs font-num bg-cream border border-dashed border-rule">
                        ไม่มีคำขอลาหยุดในสัปดาห์นี้
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {leaveRequests.map((req) => {
                            const isEditing = editingLeaveId === req.id;
                            return (
                                <div key={req.id} className="bg-cream border border-rule overflow-hidden flex flex-col transition-colors duration-150">
                                    {/* Card Header */}
                                    <div className="px-4 py-3 bg-cream border-b border-rule flex justify-between items-center">
                                        <div className="flex items-center gap-2.5">
                                            <input 
                                                type="checkbox"
                                                checked={selectedLeaveIds.includes(req.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedLeaveIds([...selectedLeaveIds, req.id]);
                                                    } else {
                                                        setSelectedLeaveIds(selectedLeaveIds.filter(id => id !== req.id));
                                                    }
                                                }}
                                                className="w-3.5 h-3.5 border-charcoal bg-cream accent-plum focus:ring-0 cursor-pointer"
                                            />
                                            <div>
                                                <div className="font-semibold text-charcoal">{req.employees?.nickname || req.employees?.name}</div>
                                                <div className="text-xs text-neutral font-num font-semibold">{req.employees?.position || 'พนักงาน'}</div>
                                            </div>
                                        </div>
                                        <Badge color={req.status === 'approved' ? 'emerald' : req.status === 'rejected' ? 'rose' : 'amber'}>
                                            {req.status === 'approved' ? 'อนุมัติแล้ว' : req.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รออนุมัติ'}
                                        </Badge>
                                    </div>
                                    
                                    {/* Card Body */}
                                    <div className="p-4 flex-1 space-y-3 text-xs text-charcoal">
                                        {isEditing ? (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-xs font-num font-semibold text-neutral mb-1">วันที่เริ่มลา</label>
                                                        <input 
                                                            type="date"
                                                            value={leaveForm.startDate}
                                                            onChange={e => setLeaveForm({ 
                                                                ...leaveForm, 
                                                                startDate: e.target.value,
                                                                endDate: leaveForm.endDate < e.target.value ? e.target.value : leaveForm.endDate 
                                                            })}
                                                            className="w-full border border-rule p-2 text-xs font-num text-charcoal bg-cream outline-none focus:border-charcoal"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-xs font-num font-semibold text-neutral mb-1">วันสิ้นสุด</label>
                                                        <input 
                                                            type="date"
                                                            value={leaveForm.endDate}
                                                            onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                                                            className="w-full border border-rule p-2 text-xs font-num text-charcoal bg-cream outline-none focus:border-charcoal"
                                                            min={leaveForm.startDate}
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-num font-semibold text-neutral mb-1">ประเภท</label>
                                                    <select
                                                        value={leaveForm.leave_type}
                                                        onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                                                        className="w-full border border-rule p-2 text-xs font-num text-charcoal bg-cream outline-none focus:border-charcoal cursor-pointer"
                                                    >
                                                        <option value="sick">ลาป่วย </option>
                                                        <option value="business">ลากิจ </option>
                                                        <option value="vacation">พักร้อน </option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-num font-semibold text-neutral mb-1">คนแทน</label>
                                                    <select
                                                        value={leaveForm.replacement_employee_id}
                                                        onChange={e => setLeaveForm({ ...leaveForm, replacement_employee_id: e.target.value })}
                                                        className="w-full border border-rule p-2 text-xs font-num text-charcoal bg-cream outline-none focus:border-charcoal cursor-pointer"
                                                    >
                                                        <option value="">-- เลือกผู้ปฏิบัติหน้าที่แทน --</option>
                                                        {employees.filter(e => e.id !== req.employee_id).map(emp => (
                                                            <option key={emp.id} value={emp.id}>
                                                                {emp.name} {emp.nickname ? `(${emp.nickname})` : ""} - {emp.position || "ทั่วไป"}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-xs font-num font-semibold text-neutral mb-1">เหตุผล</label>
                                                    <input 
                                                        type="text"
                                                        value={leaveForm.reason}
                                                        onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                                                        className="w-full border border-rule p-2 text-xs font-sans text-charcoal bg-cream outline-none focus:border-charcoal"
                                                        placeholder="ระบุเหตุผล"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-num font-semibold text-neutral">วันที่ลา:</span>
                                                    <span className="font-num text-xs font-semibold text-charcoal">
                                                        {req.leave_date ? format(parseISO(req.leave_date), 'dd/MM/yyyy') : '-'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-num font-semibold text-neutral">ประเภท:</span>
                                                    <span className="font-semibold text-charcoal text-xs">
                                                        {req.leave_type === 'sick' ? 'ลาป่วย ' : req.leave_type === 'business' ? 'ลากิจ ' : 'พักร้อน '}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-xs font-num font-semibold text-neutral">ปฏิบัติงานแทนโดย:</span>
                                                    <span className="font-semibold text-charcoal text-xs">
                                                        {req.replacement_employee ? `${req.replacement_employee.name} (${req.replacement_employee.nickname || "-"})` : '-'}
                                                    </span>
                                                </div>
                                                <div className="pt-1 border-t border-rule mt-1">
                                                    <span className="text-xs font-num font-semibold text-neutral block mb-0.5">เหตุผลการลา:</span>
                                                    <span className="text-charcoal italic block text-xs">&ldquo;{req.reason || '-'}&rdquo;</span>
                                                </div>
                                                {req.status === 'approved' && (() => {
                                                    const isRequesterOff = transactions.some(t => t.employee_id === req.employee_id && t.date === req.leave_date && t.is_off);
                                                    const isReplacementScheduled = req.replacement_employee_id 
                                                        ? transactions.some(t => t.employee_id === req.replacement_employee_id && t.date === req.leave_date && !t.is_off)
                                                        : false;
                                                    return (
                                                        <div className="mt-2 p-2 bg-charcoal/5 border border-charcoal/20 flex flex-col gap-1 text-xs text-charcoal font-num font-semibold">
                                                            <div className="flex items-center gap-1">
                                                                <span>{isRequesterOff ? '' : ''}</span>
                                                                <span>พนักงานลาหยุด: {isRequesterOff ? 'บันทึกวันหยุด (OFF) แล้ว' : 'ยังไม่ได้บันทึกวันหยุด'}</span>
                                                            </div>
                                                            {req.replacement_employee_id && (
                                                                <div className="flex items-center gap-1">
                                                                    <span>{isReplacementScheduled ? '' : ''}</span>
                                                                    <span>พนักงานแทน: {isReplacementScheduled ? 'ลงตารางกะแทนแล้ว' : 'ยังไม่ได้ลงตารางกะแทน'}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Card Footer Actions */}
                                    <div className="px-4 py-3 bg-cream border-t border-rule flex justify-end gap-2">
                                        {isEditing ? (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={() => setEditingLeaveId(null)}
                                                    className="px-3 py-1.5 bg-cream hover:bg-neutral/10 border border-rule text-charcoal font-num font-semibold text-xs transition-colors duration-150 cursor-pointer"
                                                >
                                                    ยกเลิก
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => saveLeaveEdit(req.id)}
                                                    className="px-3 py-1.5 bg-plum text-cream font-num font-semibold text-xs border border-charcoal hover:bg-plum-2 transition-colors duration-150 cursor-pointer"
                                                >
                                                    บันทึก
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={() => startEditLeave(req)}
                                                    className="px-3 py-1.5 bg-cream hover:bg-neutral/10 border border-rule text-charcoal font-num font-semibold text-xs transition-colors duration-150 cursor-pointer"
                                                >
                                                    แก้ไขข้อมูล
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => handleDeleteLeaveRequest(req)}
                                                    className="px-3 py-1.5 bg-error/10 hover:bg-error/20 text-error border border-error/20 font-num font-semibold text-xs transition-colors duration-150 flex items-center gap-1 cursor-pointer"
                                                    title="ลบคำขอลาหยุด"
                                                >
                                                    ลบใบลา
                                                </button>
                                                {req.status === 'pending' && (
                                                    <>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleApproveAndSyncLeave(req)}
                                                            className="px-3 py-1.5 bg-charcoal text-cream font-num font-semibold text-xs border border-charcoal hover:bg-charcoal/90 cursor-pointer transition-colors duration-150"
                                                        >
                                                            อนุมัติ & ซิงค์
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleRejectLeave(req)}
                                                            className="px-3 py-1.5 bg-error text-cream font-num font-semibold text-xs border border-charcoal hover:bg-error/90 transition-colors duration-150 cursor-pointer"
                                                        >
                                                            ปฏิเสธ
                                                        </button>
                                                    </>
                                                )}
                                                {req.status === 'approved' && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleResetLeaveStatus(req)}
                                                        className="px-3 py-1.5 bg-plum text-cream font-num font-semibold text-xs border border-charcoal hover:bg-plum/90 transition-colors duration-150 cursor-pointer"
                                                    >
                                                        ยกเลิกการอนุมัติ
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            </main>

            {/* Edit Cell Modal */}
            {editingCell && (() => {
                const normName = (v) => plainText(v).replace(/[\s\(\)\:\-0-9\.]/g, '').toLowerCase();
                const durationOf = (st, en) => {
                    if (!st || !en) return '';
                    const [sh, sm] = st.split(':').map(Number);
                    const [eh, em] = en.split(':').map(Number);
                    let diff = (eh * 60 + em) - (sh * 60 + sm);
                    if (diff < 0) diff += 24 * 60;
                    const h = Math.floor(diff / 60);
                    const m = diff % 60;
                    return m > 0 ? `${h} ชม. ${m} น.` : `${h} ชม.`;
                };
                const isPresetSelected = (slot, preset, startClean, endClean) => {
                    if (slot.is_off) return false;
                    if (slot.preset_id && preset.id && slot.preset_id === preset.id) return true;
                    if (slot.shift_id && preset.shiftId && String(slot.shift_id) === String(preset.shiftId)) return true;
                    if (slot.shift_id) {
                        const curShift = shifts.find(sh => String(sh.id) === String(slot.shift_id));
                        if (curShift) {
                            const sameTime = (curShift.start_time || '').slice(0, 5) === (preset.start || '').slice(0, 5) &&
                                (curShift.end_time || '').slice(0, 5) === (preset.end || '').slice(0, 5);
                            const a = normName(curShift.name), b = normName(preset.name);
                            return sameTime && (a === b || a.includes(b) || b.includes(a));
                        }
                    }
                    if (startClean && endClean && startClean === (preset.start || '').slice(0, 5) && endClean === (preset.end || '').slice(0, 5)) {
                        if (slot.preset_name) return normName(slot.preset_name) === normName(preset.name);
                        return allPresets.filter(p => (p.start || '').slice(0, 5) === startClean && (p.end || '').slice(0, 5) === endClean).length === 1;
                    }
                    return false;
                };
                const PRESET_GROUPS = [
                    { key: 'floor', title: 'หน้าร้าน และบาร์', match: p => p.category === 'floor' },
                    { key: 'kitchen', title: 'ครัว', match: p => p.category === 'kitchen' },
                    { key: 'roles', title: 'บทบาทพิเศษ และพาร์ตไทม์', match: p => p.category === 'management' || p.category === 'parttime' },
                    { key: 'custom', title: 'กะที่สร้างเอง', match: p => p.category === 'custom' || p.isCustom },
                ];
                const dateStr = format(editingCell.date, 'yyyy-MM-dd');
                const cellLeaves = leaveRequests.filter(l => l.employee_id === editingCell.employee.id && l.leave_date === dateStr);
                const multi = editingCell.slots.length > 1;
                const slotTypeTh = { MAIN: 'กะหลัก', SPLIT: 'กะแยก', OVERTIME: 'OT' };

                return (
                <div className="brand-v2 !bg-charcoal/50 fixed inset-0 flex items-center justify-center z-50 p-3 sm:p-4" role="dialog" aria-modal="true" aria-labelledby="cell-modal-title">
                    <div className="bg-cream border border-charcoal w-full max-w-lg flex flex-col max-h-[92vh]">
                        <div className="bg-plum text-cream flex items-stretch shrink-0">
                            <div className="flex-1 px-4 py-3 min-w-0">
                                <h3 id="cell-modal-title" className="font-head text-2xl truncate">{editingCell.employee.nickname || editingCell.employee.name}</h3>
                                <p className="text-sm text-on-plum-2">{format(editingCell.date, 'EEEEที่ d MMMM', { locale: th })} {editingCell.date.getFullYear() + 543}</p>
                            </div>
                            <button type="button" onClick={() => setEditingCell(null)} className="min-w-16 px-4 border-l border-plum-3 text-base font-semibold hover:bg-plum-2 transition-colors duration-150">
                                ปิด
                            </button>
                        </div>

                        <div className="p-4 flex flex-col gap-4 overflow-y-auto custom-scrollbar">
                            {/* Leave on this day */}
                            {cellLeaves.map((l, idx) => (
                                <section key={idx} className="border border-plum">
                                    <div className="px-4 py-2 bg-plum/5 border-b border-plum flex items-baseline justify-between gap-3">
                                        <p className="text-base font-semibold text-plum">วันลา · {l.leave_type === 'sick' ? 'ลาป่วย' : l.leave_type === 'business' ? 'ลากิจ' : 'พักร้อน'}</p>
                                        <p className="text-sm font-semibold text-charcoal">{l.status === 'approved' ? 'อนุมัติแล้ว' : l.status === 'rejected' ? 'ไม่อนุมัติ' : 'รออนุมัติ'}</p>
                                    </div>
                                    <dl className="px-4 py-3 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-base">
                                        <dt className="text-sm text-neutral">เหตุผล</dt>
                                        <dd className="text-charcoal">{l.reason || '-'}</dd>
                                        <dt className="text-sm text-neutral">คนแทน</dt>
                                        <dd className="text-charcoal">{l.replacement_employee ? (l.replacement_employee.nickname || l.replacement_employee.name) : '-'}</dd>
                                    </dl>
                                    <div className="grid grid-cols-2 gap-px bg-rule border-t border-rule">
                                        {l.status === 'pending' && (
                                            <>
                                                <button type="button" onClick={async () => { await handleApproveAndSyncLeave(l); setEditingCell(null); }} className="min-h-12 px-3 bg-plum hover:bg-plum-2 text-cream text-base font-semibold transition-colors duration-150">
                                                    อนุมัติ + ปรับตาราง
                                                </button>
                                                <button type="button" onClick={async () => { await handleRejectLeave(l); setEditingCell(null); }} className="min-h-12 px-3 bg-cream hover:bg-paper-2 text-charcoal text-base transition-colors duration-150">
                                                    ไม่อนุมัติ
                                                </button>
                                            </>
                                        )}
                                        {l.status === 'approved' && (
                                            <button type="button" onClick={async () => { await handleResetLeaveStatus(l); setEditingCell(null); }} className="min-h-12 px-3 bg-cream hover:bg-paper-2 text-charcoal text-base transition-colors duration-150">
                                                ยกเลิกการอนุมัติ
                                            </button>
                                        )}
                                        <button type="button" onClick={async () => { await handleDeleteLeaveRequest(l); setEditingCell(null); }} className={`min-h-12 px-3 bg-cream hover:bg-paper-2 text-error text-base transition-colors duration-150 ${l.status === 'rejected' ? 'col-span-2' : ''}`}>
                                            ลบใบลา
                                        </button>
                                    </div>
                                </section>
                            ))}

                            {editingCell.slots.map((slot, index) => {
                                const startClean = (slot.custom_start_time || '').slice(0, 5);
                                const endClean = (slot.custom_end_time || '').slice(0, 5);
                                const selectedPreset = allPresets.find(p => isPresetSelected(slot, p, startClean, endClean));
                                const customKey = `${dateStr}-${editingCell.employee.id}-${index}`;
                                const customOpen = customTimeOpen[customKey] ?? (!slot.is_off && !!startClean && !selectedPreset);

                                return (
                                    <section key={index} className={multi || slot.slot_type !== 'MAIN' ? 'border border-rule' : ''}>
                                        {/* Slot header: only when there's more than one shift, or it's an extra slot */}
                                        {(multi || slot.slot_type !== 'MAIN') && (
                                            <div className="px-4 py-2 border-b border-rule flex items-center justify-between gap-3">
                                                <label className="flex items-center gap-2 text-sm text-neutral">
                                                    <span>กะที่ <span className="font-num">{index + 1}</span></span>
                                                    <select
                                                        value={slot.slot_type}
                                                        onChange={e => handleSlotChange(index, 'slot_type', e.target.value)}
                                                        className="min-h-10 px-2 bg-cream border border-rule text-base text-charcoal"
                                                    >
                                                        {Object.entries(slotTypeTh).map(([v, t]) => <option key={v} value={v}>{t}</option>)}
                                                    </select>
                                                </label>
                                                <button type="button" onClick={() => removeSlot(index)} className="min-h-10 px-3 text-base text-error hover:bg-paper-2 transition-colors duration-150">
                                                    ลบกะนี้
                                                </button>
                                            </div>
                                        )}

                                        <div className={`${multi || slot.slot_type !== 'MAIN' ? 'p-4' : ''} flex flex-col gap-4`}>
                                            {/* Work / OFF */}
                                            <div className="grid grid-cols-2 gap-px bg-rule border border-charcoal" role="radiogroup" aria-label="สถานะวันนี้">
                                                {[{ off: false, label: 'ทำงาน' }, { off: true, label: 'หยุด' }].map(o => (
                                                    <button
                                                        key={o.label}
                                                        type="button"
                                                        role="radio"
                                                        aria-checked={!!slot.is_off === o.off}
                                                        onClick={() => updateSlot(index, o.off ? { is_off: true, shift_id: '', preset_id: null, custom_start_time: '', custom_end_time: '' } : { is_off: false })}
                                                        className={`min-h-12 text-base transition-colors duration-150 ${!!slot.is_off === o.off ? 'bg-charcoal text-cream font-semibold' : 'bg-cream text-charcoal hover:bg-paper-2'}`}
                                                    >
                                                        {o.label}
                                                    </button>
                                                ))}
                                            </div>

                                            {!slot.is_off && (
                                                <>
                                                    {PRESET_GROUPS.map(group => {
                                                        const seen = new Set();
                                                        const groupPresets = visiblePresets.filter(group.match).filter(p => {
                                                            const k = `${normName(p.name)}|${(p.start || '').slice(0, 5)}|${(p.end || '').slice(0, 5)}`;
                                                            if (seen.has(k)) return false;
                                                            seen.add(k);
                                                            return true;
                                                        });
                                                        if (groupPresets.length === 0) return null;
                                                        return (
                                                            <div key={group.key}>
                                                                <p className="text-sm font-semibold text-neutral mb-1">{group.title}</p>
                                                                <div className="grid grid-cols-2 gap-px bg-rule border border-rule">
                                                                    {groupPresets.map((preset, pIdx) => {
                                                                        const sel = selectedPreset === preset;
                                                                        return (
                                                                            managePresets ? (
                                                                                <div key={preset.id || pIdx} className="min-h-14 pl-3 bg-cream flex items-stretch">
                                                                                    <span className="flex-1 py-2 flex flex-col justify-center min-w-0">
                                                                                        <span className="font-num text-base text-charcoal">{(preset.start || '').slice(0, 5)}–{(preset.end || '').slice(0, 5)}</span>
                                                                                        <span className="text-sm text-subtle truncate">{plainText(preset.name)}</span>
                                                                                    </span>
                                                                                    <button type="button" onClick={() => removePreset(preset)} aria-label={`ลบกะ ${plainText(preset.name)}`} className="px-3 border-l border-rule text-base text-error hover:bg-paper-2 transition-colors duration-150">
                                                                                        ลบ
                                                                                    </button>
                                                                                </div>
                                                                            ) : (
                                                                            <button
                                                                                key={preset.id || pIdx}
                                                                                type="button"
                                                                                onClick={() => applyPreset(index, preset)}
                                                                                aria-pressed={sel}
                                                                                className={`min-h-14 px-3 py-2 text-left flex flex-col justify-center transition-colors duration-150 ${sel ? 'bg-charcoal text-cream' : 'bg-cream text-charcoal hover:bg-paper-2'}`}
                                                                            >
                                                                                <span className="font-num text-base">{(preset.start || '').slice(0, 5)}–{(preset.end || '').slice(0, 5)}</span>
                                                                                <span className={`text-sm ${sel ? 'text-cream' : 'text-subtle'}`}>{plainText(preset.name)}</span>
                                                                            </button>
                                                                            )
                                                                        );
                                                                    })}
                                                                    {groupPresets.length % 2 === 1 && <span className="bg-cream" aria-hidden="true" />}
                                                                </div>
                                                            </div>
                                                        );
                                                    })}

                                                    {/* Time summary + optional manual edit */}
                                                    <div className="border border-rule">
                                                        <div className="px-4 py-3 flex items-center justify-between gap-3">
                                                            <div className="min-w-0">
                                                                <p className="text-sm text-neutral">เวลาทำงาน</p>
                                                                <p className="text-base text-charcoal">
                                                                    {startClean && endClean
                                                                        ? <><span className="font-num">{startClean}–{endClean}</span> · รวม {durationOf(startClean, endClean)}</>
                                                                        : 'ยังไม่ได้เลือกกะ'}
                                                                </p>
                                                            </div>
                                                            <button
                                                                type="button"
                                                                onClick={() => setCustomTimeOpen(prev => ({ ...prev, [customKey]: !customOpen }))}
                                                                aria-expanded={customOpen}
                                                                className="min-h-12 px-3 text-base text-plum font-semibold hover:bg-paper-2 transition-colors duration-150 shrink-0"
                                                            >
                                                                {customOpen ? 'ซ่อน' : 'ปรับเวลาเอง'}
                                                            </button>
                                                        </div>
                                                        {customOpen && (
                                                            <div className="px-4 pb-4 flex flex-col gap-3">
                                                                <div className="grid grid-cols-2 gap-3">
                                                                    <label className="text-sm text-neutral">
                                                                        เริ่ม
                                                                        <input type="time" value={slot.custom_start_time || ''} onChange={e => updateSlot(index, { custom_start_time: e.target.value, shift_id: '', preset_id: null, preset_name: null, is_off: false })} className="mt-1 w-full min-h-12 px-3 border border-charcoal bg-cream font-num text-base text-charcoal" />
                                                                    </label>
                                                                    <label className="text-sm text-neutral">
                                                                        เลิก
                                                                        <input type="time" value={slot.custom_end_time || ''} onChange={e => updateSlot(index, { custom_end_time: e.target.value, shift_id: '', preset_id: null, preset_name: null, is_off: false })} className="mt-1 w-full min-h-12 px-3 border border-charcoal bg-cream font-num text-base text-charcoal" />
                                                                    </label>
                                                                </div>
                                                                {startClean && endClean && !selectedPreset && (
                                                                    <button type="button" onClick={() => openPresetModal(startClean, endClean)} className="self-start min-h-10 text-base text-plum font-semibold underline underline-offset-4">
                                                                        บันทึกเวลานี้เป็นกะมาตรฐาน
                                                                    </button>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>

                                                    {/* Preset management: one row instead of a gear on every button */}
                                                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                                                        {selectedPreset && (
                                                            <button type="button" onClick={() => openEditPresetModal(selectedPreset)} className="min-h-10 text-plum underline underline-offset-4">
                                                                แก้กะ &ldquo;{plainText(selectedPreset.name)}&rdquo;
                                                            </button>
                                                        )}
                                                        <button type="button" onClick={() => openPresetModal(startClean || '10:00', endClean || '18:00')} className="min-h-10 text-plum underline underline-offset-4">
                                                            เพิ่มกะมาตรฐานใหม่
                                                        </button>
                                                        <button type="button" onClick={() => setManagePresets(v => !v)} aria-pressed={managePresets} className={`min-h-10 underline underline-offset-4 ${managePresets ? 'text-charcoal font-semibold' : 'text-plum'}`}>
                                                            {managePresets ? 'เสร็จ (กลับไปเลือกกะ)' : 'ลบกะที่ไม่ใช้'}
                                                        </button>
                                                        <button type="button" onClick={resetToDefaultPresets} className="min-h-10 text-neutral underline underline-offset-4" title="คืนค่ากะมาตรฐานตามเวลาเปิดร้าน (เอากะที่ลบกลับมาด้วย)">
                                                            คืนค่ากะมาตรฐาน
                                                        </button>
                                                    </div>
                                                </>
                                            )}
                                        </div>
                                    </section>
                                );
                            })}

                            <button type="button" onClick={addSlot} className="min-h-12 border border-charcoal text-base text-charcoal hover:bg-paper-2 transition-colors duration-150">
                                + เพิ่มกะแยกในวันนี้
                            </button>
                        </div>

                        <div className="px-4 py-3 border-t border-rule grid grid-cols-2 gap-3 shrink-0">
                            <button type="button" onClick={() => setEditingCell(null)} className="min-h-12 border border-charcoal text-base text-charcoal hover:bg-paper-2 transition-colors duration-150">
                                ยกเลิก
                            </button>
                            <button type="button" onClick={saveCell} disabled={saving} className="min-h-12 bg-charcoal hover:bg-charcoal-2 text-cream text-base font-semibold transition-colors duration-150 disabled:opacity-50">
                                {saving ? 'กำลังบันทึก…' : 'บันทึก'}
                            </button>
                        </div>
                    </div>
                </div>
                );
            })()}

            {/* Quick pick: dropdown from an empty cell's "+ เพิ่มกะ" */}
            {quickPick && (() => {
                const groups = [
                    { key: 'floor', title: 'หน้าร้าน และบาร์', match: p => p.category === 'floor' },
                    { key: 'kitchen', title: 'ครัว', match: p => p.category === 'kitchen' },
                    { key: 'roles', title: 'บทบาทพิเศษ และพาร์ตไทม์', match: p => p.category === 'management' || p.category === 'parttime' },
                    { key: 'custom', title: 'กะที่สร้างเอง', match: p => p.category === 'custom' || p.isCustom },
                ];
                const { emp, date } = quickPick;
                const prevStr = format(addDays(date, -1), 'yyyy-MM-dd');
                const prevRows = transactions.filter(t => t.employee_id === emp.id && t.date === prevStr);
                const copyable = copyRowsFor(emp.id, prevStr, format(date, 'yyyy-MM-dd'));
                const prevDayName = daysTitle[(addDays(date, -1).getDay() + 6) % 7];
                const actual = getAttendanceOnDate(emp.id, date);
                const actualStart = actual.checkIn ? format(actual.checkIn, 'HH:mm') : '';
                const actualEnd = actual.checkOut ? format(actual.checkOut, 'HH:mm') : '';
                const dayLeaves = leaveRequests.filter(l => l.employee_id === emp.id && l.leave_date === format(date, 'yyyy-MM-dd') && l.status !== 'rejected');
                const itemCls = 'w-full min-h-12 px-4 py-2 text-left flex items-baseline justify-between gap-3 hover:bg-paper-2 focus-visible:bg-paper-2 transition-colors duration-150';
                const firstKey = groups.find(g => visiblePresets.some(g.match))?.key;
                return (
                    <>
                        <div className="fixed inset-0 z-40" onClick={() => setQuickPick(null)} aria-hidden="true" />
                        <div
                            role="menu"
                            aria-label={`เลือกกะ ${emp.nickname || emp.name} ${format(date, 'dd/MM')}`}
                            className="brand-v2 fixed z-50 w-72 max-h-[60vh] overflow-y-auto custom-scrollbar border border-charcoal"
                            style={{ top: quickPick.top, left: quickPick.left }}
                            onKeyDown={e => { if (e.key === 'Escape') setQuickPick(null); }}
                        >
                            <div className="px-4 py-2 border-b border-rule bg-paper-2">
                                <p className="text-base font-semibold text-charcoal">{emp.nickname || emp.name}</p>
                                <p className="text-sm text-neutral">{format(date, 'EEEEที่ d MMM', { locale: th })}</p>
                            </div>
                            {dayLeaves.length > 0 && (
                                <p className="px-4 py-2 border-b border-rule text-sm text-plum">มีใบลาวันนี้ ({dayLeaves[0].status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ'}) · จัดการใน &ldquo;ปรับละเอียด…&rdquo;</p>
                            )}
                            {actualStart && actualEnd && (
                                <button type="button" role="menuitem" disabled={saving} onClick={() => quickSave(emp, date, { name: 'ตามเวลาที่มาจริง', start: actualStart, end: actualEnd })} className="w-full min-h-12 px-4 py-2 text-left border-b border-charcoal hover:bg-paper-2 focus-visible:bg-paper-2 transition-colors duration-150">
                                    <span className="block text-base font-semibold text-plum">ใส่ตามเวลาที่มาจริง</span>
                                    <span className="block font-num text-sm text-subtle">{actualStart}–{actualEnd}</span>
                                </button>
                            )}
                            {copyable.length > 0 && (
                                <button type="button" role="menuitem" disabled={saving} onClick={() => copyCellFromPrevDay(emp, date)} className="w-full min-h-12 px-4 py-2 text-left border-b border-charcoal hover:bg-paper-2 focus-visible:bg-paper-2 transition-colors duration-150">
                                    <span className="block text-base font-semibold text-plum">เหมือนวัน{prevDayName}</span>
                                    <span className="block text-sm text-subtle">{prevRows.filter(t => copyable.some(c => c.slot_type === (t.slot_type || 'MAIN'))).map(slotSummary).join(' + ')}</span>
                                </button>
                            )}
                            {groups.map(g => {
                                const list = visiblePresets.filter(g.match);
                                if (list.length === 0) return null;
                                return (
                                    <div key={g.key} className="border-b border-rule">
                                        <p className="px-4 pt-2 text-xs font-semibold text-neutral">{g.title}</p>
                                        {list.map((p, i) => (
                                            <button key={p.id || i} type="button" role="menuitem" autoFocus={g.key === firstKey && i === 0} disabled={saving} onClick={() => quickSave(emp, date, p)} className={itemCls}>
                                                <span className="font-num text-base text-charcoal shrink-0">{(p.start || '').slice(0, 5)}–{(p.end || '').slice(0, 5)}</span>
                                                <span className="text-sm text-subtle text-right">{plainText(p.name)}</span>
                                            </button>
                                        ))}
                                    </div>
                                );
                            })}
                            <button type="button" role="menuitem" disabled={saving} onClick={() => quickSave(emp, date, null)} className={`${itemCls} border-b border-rule`}>
                                <span className="text-base text-charcoal">หยุด</span>
                            </button>
                            <button type="button" role="menuitem" onClick={() => { setQuickPick(null); openCellModal(emp, date); }} className={itemCls}>
                                <span className="text-base text-plum font-semibold">ปรับละเอียด…</span>
                                <span className="text-sm text-neutral">กะแยก · เวลาเอง</span>
                            </button>
                        </div>
                    </>
                );
            })()}

            {/* Clear-week confirmation */}
            {clearModal && (() => {
                const keep = clearModal.keepLeaves !== false;
                const targets = clearTargets(keep);
                const people = new Set(targets.map(t => t.employee_id)).size;
                const kept = transactions.length - targets.length;
                const published = targets.filter(t => t.status === 'PUBLISHED').length;
                return (
                    <div className="brand-v2 !bg-charcoal/50 fixed inset-0 flex items-center justify-center z-50 p-4" role="alertdialog" aria-modal="true" aria-labelledby="clear-week-title">
                        <div className="bg-cream border border-charcoal w-full max-w-md">
                            <div className="bg-error text-cream px-4 py-3">
                                <h3 id="clear-week-title" className="text-xl font-semibold">ล้างตารางสัปดาห์นี้?</h3>
                                <p className="text-sm">{weekLabel}</p>
                            </div>
                            <div className="p-4 flex flex-col gap-3">
                                <p className="text-base text-charcoal">
                                    จะลบ <span className="font-num font-semibold">{targets.length}</span> กะ ของ <span className="font-num font-semibold">{people}</span> คน
                                    {kept > 0 && <> · เก็บไว้ <span className="font-num">{kept}</span> รายการ</>}
                                </p>
                                <label className="flex items-start gap-3 min-h-12 cursor-pointer">
                                    <input
                                        type="checkbox"
                                        checked={keep}
                                        onChange={e => setClearModal({ keepLeaves: e.target.checked })}
                                        className="mt-1 w-5 h-5 accent-charcoal"
                                    />
                                    <span className="text-base text-charcoal">
                                        เก็บวันหยุดจากใบลาที่อนุมัติแล้วไว้
                                        <span className="block text-sm text-neutral">ไม่ต้องอนุมัติใบลาซ้ำหลังจัดตารางใหม่</span>
                                    </span>
                                </label>
                                {published > 0 && (
                                    <p className="border border-plum px-3 py-2 text-sm text-plum">
                                        ในนี้มี <span className="font-num">{published}</span> กะที่ประกาศไปแล้ว พนักงานจะเห็นตารางว่างจนกว่าจะประกาศใหม่ (ระบบไม่ส่งแจ้งเตือน LINE ตอนล้าง)
                                    </p>
                                )}
                                <p className="text-sm text-neutral">กด &ldquo;เลิกทำ&rdquo; ได้ทันทีหลังล้าง ตราบใดที่ยังไม่ปิดหรือรีเฟรชหน้านี้</p>
                            </div>
                            <div className="px-4 pb-4 grid grid-cols-2 gap-3">
                                <button type="button" onClick={() => setClearModal(null)} className="min-h-12 border border-charcoal text-base text-charcoal hover:bg-paper-2 transition-colors duration-150">
                                    ยกเลิก
                                </button>
                                <button type="button" onClick={clearWeek} disabled={saving || targets.length === 0} className="min-h-12 bg-error hover:opacity-90 text-cream text-base font-semibold transition-opacity duration-150 disabled:opacity-50">
                                    {saving ? 'กำลังล้าง…' : `ล้าง ${targets.length} กะ`}
                                </button>
                            </div>
                        </div>
                    </div>
                );
            })()}

            {/* Preset Creation & Edit Modal */}
            {presetModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-charcoal/50 p-4">
                    <div className="bg-cream border border-charcoal w-full max-w-sm overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-rule bg-paper-2 flex justify-between items-center">
                            <div>
                                <h3 className="font-num font-semibold text-sm text-charcoal">
                                    {presetModal.isEditing ? `แก้ไข Preset` : 'สร้าง Preset ใหม่'}
                                </h3>
                                <p className="text-xs font-num text-neutral block mt-0.5">
                                    {presetModal.isEditing ? (presetModal.originalName || presetModal.name) : 'กำหนดเวลาและชื่อกะงาน'}
                                </p>
                            </div>
                            {presetModal.isEditing && (
                                <button
                                    type="button"
                                    onClick={() => deleteOrResetPreset(presetModal)}
                                    className="text-xs font-num font-semibold text-error hover:underline p-1 cursor-pointer transition-colors duration-150"
                                    title={presetModal.isSystem ? 'คืนค่าเริ่มต้น' : 'ลบ Preset'}
                                >
                                    {presetModal.isSystem ? 'คืนค่าเดิม' : 'ลบ Preset'}
                                </button>
                            )}
                        </div>
                        
                        <div className="px-6 py-5 space-y-4">
                            {/* Timing (Start and End) */}
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="block text-xs font-num font-semibold text-charcoal mb-1.5">
                                        เวลาเริ่ม (Start)
                                    </label>
                                    <input
                                        type="time"
                                        value={presetModal.start || ''}
                                        onChange={e => setPresetModal(p => ({ ...p, start: e.target.value }))}
                                        className="w-full border border-charcoal px-3 py-2 text-xs font-num font-semibold text-charcoal bg-cream outline-none focus:border-plum"
                                    />
                                </div>
                                <div>
                                    <label className="block text-xs font-num font-semibold text-charcoal mb-1.5">
                                        เวลาเลิก (End)
                                    </label>
                                    <input
                                        type="time"
                                        value={presetModal.end || ''}
                                        onChange={e => setPresetModal(p => ({ ...p, end: e.target.value }))}
                                        className="w-full border border-charcoal px-3 py-2 text-xs font-num font-semibold text-charcoal bg-cream outline-none focus:border-plum"
                                    />
                                </div>
                            </div>

                            {/* Name */}
                            <div>
                                <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                    ชื่อ Preset
                                </label>
                                <input
                                    type="text"
                                    value={presetModal.name || ''}
                                    onChange={e => setPresetModal(p => ({ ...p, name: e.target.value }))}
                                    placeholder={`เช่น INTHEHAUS, ควบกะ, กะค่ำ...`}
                                    className="w-full border border-rule px-3 py-2 text-xs font-sans text-charcoal bg-cream outline-none focus:border-charcoal"
                                />
                            </div>

                            {/* Icon */}
                            <div>
                                <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                    เลือก Icon
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {PRESET_ICONS.map(icon => (
                                        <button
                                            key={icon}
                                            type="button"
                                            onClick={() => setPresetModal(p => ({ ...p, icon }))}
                                            className={`w-8 h-8 text-xs flex items-center justify-center border transition-colors duration-150 cursor-pointer ${
 presetModal.icon === icon
 ? 'border-charcoal bg-charcoal text-cream'
 : 'border-rule bg-cream hover:border-charcoal text-charcoal'
 }`}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Color */}
                            <div>
                                <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                    เลือกสี
                                </label>
                                <div className="flex flex-wrap gap-1.5">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setPresetModal(p => ({ ...p, color: c.id }))}
                                            className={`flex items-center gap-1.5 px-2 py-1  text-xs font-num font-semibold border transition-colors duration-150 cursor-pointer ${c.bg} ${c.text} ${
                                                presetModal.color === c.id
                                                    ? `${c.border} border-charcoal ring-1 ring-charcoal`
                                                    : 'border-rule hover:border-charcoal'
                                            }`}
                                        >
                                            <span className={`w-2 h-2 ${c.dot}`}></span>
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Preview */}
                            <div>
                                <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                    ตัวอย่างแสดงผล
                                </label>
                                {(() => {
                                    const pc = getPresetColor(presetModal.color);
                                    return (
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${pc.bg} ${pc.text} text-xs font-num font-semibold border ${pc.border}`}>
                                            <span>{presetModal.icon || '⏰'}</span>
                                            <span>{presetModal.name || `${presetModal.start || ''}-${presetModal.end || ''}`}</span>
                                            <span className="opacity-70 text-xs font-normal">({presetModal.start || ''}-{presetModal.end || ''})</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-rule flex justify-end gap-3 bg-paper-2">
                            <button
                                type="button"
                                onClick={() => setPresetModal(null)}
                                className="px-4 py-2 text-charcoal hover:bg-neutral/10 border border-rule font-num font-semibold text-xs transition-colors duration-150 cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={confirmSavePreset}
                                className="px-5 py-2 bg-plum text-cream font-num font-semibold text-xs border border-charcoal hover:bg-plum-2 transition-colors duration-150 cursor-pointer"
                            >
                                บันทึก Preset
                            </button>
                        </div>
                    </div>
                </div>
            )}
 
            {/* Employee Status & Leave Adjuster Modal */}
            {adjustingEmpModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-charcoal/50 p-4">
                    <div className="bg-cream border border-charcoal w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-rule bg-paper-2 flex justify-between items-center">
                            <div>
                                <h3 className="font-num font-semibold text-sm text-charcoal flex items-center gap-2">
                                    ปรับสถานะ & วันพักงาน/พักร้อน
                                </h3>
                                <p className="text-xs font-num text-neutral block mt-0.5">
                                    {adjustingEmpModal.emp.name} ({adjustingEmpModal.emp.nickname || 'ไม่มีชื่อเล่น'}) - {adjustingEmpModal.emp.position || 'พนักงาน'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAdjustingEmpModal(null)}
                                className="text-neutral hover:text-charcoal font-num text-sm"
                            >
                                
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar bg-cream flex-1">
                            {/* Section 1: Main Status */}
                            <div className="bg-cream p-4 border border-rule space-y-4">
                                <h4 className="text-xs font-num font-semibold text-charcoal flex items-center gap-1.5">
                                    สถานะการทำงานของพนักงาน (Employment Status)
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                            สถานะการจ้างงาน
                                        </label>
                                        <select
                                            value={adjustingEmpModal.employment_status}
                                            onChange={e => setAdjustingEmpModal(prev => ({ ...prev, employment_status: e.target.value }))}
                                            className="w-full p-2 border border-rule bg-cream text-xs font-num text-charcoal outline-none focus:border-charcoal cursor-pointer"
                                        >
                                            <option value="Fulltime">Fulltime (ประจำ)</option>
                                            <option value="Probation">Probation (ทดลองงาน)</option>
                                            <option value="Contract">Contract (สัญญาจ้าง / Part-time)</option>
                                            <option value="Suspended">Suspended (พักงาน)</option>
                                            <option value="Vacation">Vacation (พักร้อน)</option>
                                            <option value="Resigned">Resigned (ลาออก)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                            สถานะบัญชี (Account Active)
                                        </label>
                                        <label className="flex items-center gap-2 p-2 border border-rule bg-cream cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={adjustingEmpModal.is_active}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, is_active: e.target.checked }))}
                                                className="w-4 h-4 border-charcoal bg-cream accent-charcoal focus:ring-0 cursor-pointer"
                                            />
                                            <span className={`text-xs font-num font-semibold ${adjustingEmpModal.is_active ? 'text-charcoal' : 'text-error'}`}>
                                                {adjustingEmpModal.is_active ? 'เปิดใช้งาน (Active)' : 'ระงับบัญชี (Inactive / พักงาน)'}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Create Leave or Suspension Range */}
                            <div className="bg-cream p-4 border border-rule space-y-4">
                                <label className="flex items-center justify-between cursor-pointer select-none">
                                    <span className="text-xs font-num font-semibold text-charcoal flex items-center gap-1.5">
                                        บันทึกวันพักงาน / พักร้อน / วันลา เข้าสู่ระบบ
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={adjustingEmpModal.createLeave}
                                        onChange={e => setAdjustingEmpModal(prev => ({ ...prev, createLeave: e.target.checked }))}
                                        className="w-4 h-4 border-charcoal bg-cream accent-plum focus:ring-0 cursor-pointer"
                                    />
                                </label>

                                {adjustingEmpModal.createLeave && (
                                    <div className="space-y-4 pt-2 border-t border-rule">
                                        <div>
                                            <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                                ประเภทการพัก/ลา
                                            </label>
                                            <select
                                                value={adjustingEmpModal.leave_type}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, leave_type: e.target.value }))}
                                                className="w-full p-2 border border-rule bg-cream text-xs font-num text-charcoal outline-none focus:border-charcoal cursor-pointer"
                                            >
                                                <option value="vacation">พักร้อน (Vacation)</option>
                                                <option value="suspension">พักงาน (Suspension)</option>
                                                <option value="sick">ลาป่วย (Sick Leave)</option>
                                                <option value="business">ลากิจ (Business Leave)</option>
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                                    วันที่เริ่ม
                                                </label>
                                                <input
                                                    type="date"
                                                    value={adjustingEmpModal.startDate}
                                                    onChange={e => setAdjustingEmpModal(prev => ({
                                                        ...prev,
                                                        startDate: e.target.value,
                                                        endDate: prev.endDate < e.target.value ? e.target.value : prev.endDate
                                                    }))}
                                                    className="w-full p-2 border border-rule bg-cream text-xs font-num text-charcoal outline-none focus:border-charcoal"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                                    วันที่สิ้นสุด
                                                </label>
                                                <input
                                                    type="date"
                                                    value={adjustingEmpModal.endDate}
                                                    min={adjustingEmpModal.startDate}
                                                    onChange={e => setAdjustingEmpModal(prev => ({ ...prev, endDate: e.target.value }))}
                                                    className="w-full p-2 border border-rule bg-cream text-xs font-num text-charcoal outline-none focus:border-charcoal"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                                พนักงานปฏิบัติงานแทน (Optional)
                                            </label>
                                            <select
                                                value={adjustingEmpModal.replacement_employee_id}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, replacement_employee_id: e.target.value }))}
                                                className="w-full p-2 border border-rule bg-cream text-xs font-num text-charcoal outline-none focus:border-charcoal cursor-pointer"
                                            >
                                                <option value="">-- ไม่ระบุผู้แทน --</option>
                                                {employees.filter(e => e.id !== adjustingEmpModal.emp.id).map(emp => (
                                                    <option key={emp.id} value={emp.id}>
                                                        {emp.name} ({emp.nickname || '-'}) - {emp.position || 'ทั่วไป'}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-num font-semibold text-neutral mb-1.5">
                                                เหตุผล / หมายเหตุ
                                            </label>
                                            <input
                                                type="text"
                                                value={adjustingEmpModal.reason}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, reason: e.target.value }))}
                                                placeholder="เช่น พักงานทางวินัย 3 วัน, ลาพักร้อนประจำปี..."
                                                className="w-full p-2 border border-rule bg-cream text-xs font-sans text-charcoal outline-none focus:border-charcoal"
                                            />
                                        </div>

                                        <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={adjustingEmpModal.autoSyncRoster}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, autoSyncRoster: e.target.checked }))}
                                                className="w-3.5 h-3.5 border-charcoal bg-cream accent-plum focus:ring-0 cursor-pointer"
                                            />
                                            <span className="text-xs font-num font-semibold text-charcoal">
                                                ปรับตั้งค่าในตารางเวร Roster เป็นวันหยุด (OFF) โดยอัตโนมัติ
                                            </span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-rule flex justify-end gap-3 bg-paper-2 shrink-0">
                            <button
                                type="button"
                                onClick={() => setAdjustingEmpModal(null)}
                                className="px-4 py-2 text-charcoal hover:bg-neutral/10 border border-rule font-num font-semibold text-xs transition-colors duration-150 cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveAdjustingEmp}
                                disabled={saving}
                                className="px-5 py-2 bg-plum text-cream font-num font-semibold text-xs border border-charcoal hover:bg-plum-2 transition-colors duration-150 cursor-pointer flex items-center gap-2"
                            >
                                {saving ? 'กำลังบันทึก...' : <>บันทึกการเปลี่ยนแปลง</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* End Employee Status Adjuster Modal */}

            {/* Smart Auto-Generate Roster Modal */}
            {showAutoGenModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-charcoal/50 p-4">
                    <div className="bg-cream border border-charcoal w-full max-w-lg overflow-hidden flex flex-col">
                        {/* Header */}
                        <div className="px-6 py-4 border-b border-rule flex justify-between items-center bg-paper-2">
                            <div>
                                <h3 className="font-num font-semibold text-sm text-charcoal flex items-center gap-2">
                                                                        จัดตารางงานอัตโนมัติ (AI & Smart Auto-Roster)
                                </h3>
                                <p className="text-xs font-num text-neutral mt-0.5">
                                    สัปดาห์: {format(weekStart, 'dd/MM/yyyy')} — {format(weekEnd, 'dd/MM/yyyy')}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setShowAutoGenModal(false)}
                                className="w-7 h-7 flex items-center justify-center border border-rule hover:border-charcoal bg-cream text-charcoal font-num text-xs transition-colors duration-150 cursor-pointer"
                            >
                                
                            </button>
                        </div>

                        {/* Body */}
                        <div className="p-6 space-y-4 max-h-[70vh] overflow-y-auto font-sans text-xs text-charcoal custom-scrollbar">
                            <div className="bg-paper-2 border border-rule p-3.5 space-y-2 font-num text-xs">
                                <div className="font-semibold text-charcoal flex items-center gap-1.5">
                                    <span></span>
                                    <span>ระบบจะเรียนรู้และจัดตารางให้อัตโนมัติ:</span>
                                </div>
                                <ul className="space-y-1.5 text-neutral list-disc list-inside">
                                    <li>วิเคราะห์เวลาเข้างานและวันหยุดประจำของพนักงานทั้ง {employees.length} คน จากสถิติย้อนหลัง 8 สัปดาห์</li>
                                    <li>ดึงใบลาที่อนุมัติแล้ว ({leaveRequests.filter(l => l.status === 'approved').length} รายการในสัปดาห์นี้) มาเป็นวันหยุด (OFF) อัตโนมัติ</li>
                                    <li>หากในใบระบุคนแทน จะสลับกะให้พนักงานปฏิบัติหน้าที่แทนโดยตรง</li>
                                    <li>บันทึกเป็น <strong className="text-charcoal">แบบร่าง (Draft)</strong> เพื่อให้บอสเข้ามาตรวจและปรับแต่งบางจุดได้ตามต้องการ</li>
                                </ul>
                            </div>

                            <div className="space-y-2.5 pt-1">
                                <label className="block text-xs font-num font-semibold text-charcoal">
                                    ตัวเลือกการจัดตาราง:
                                </label>

                                <label className="flex items-center gap-2.5 p-2.5 border border-rule bg-paper-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={autoGenForm.applyLeaves}
                                        onChange={e => setAutoGenForm(prev => ({ ...prev, applyLeaves: e.target.checked }))}
                                        className="w-4 h-4 border-charcoal bg-cream accent-plum focus:ring-0 cursor-pointer"
                                    />
                                    <div>
                                        <div className="font-num font-semibold text-xs text-charcoal">รวมใบลาที่อนุมัติแล้ว (Apply Approved Leaves)</div>
                                        <div className="text-xs font-num text-neutral">ปรับเป็นวันหยุด (OFF) และจัดกะให้คนแทนตามข้อมูลใบลา</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2.5 p-2.5 border border-rule bg-paper-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={autoGenForm.syncTemplate}
                                        onChange={e => setAutoGenForm(prev => ({ ...prev, syncTemplate: e.target.checked }))}
                                        className="w-4 h-4 border-charcoal bg-cream accent-plum focus:ring-0 cursor-pointer"
                                    />
                                    <div>
                                        <div className="font-num font-semibold text-xs text-charcoal">ซิงค์แบบแผนเข้าสู่ตารางฐาน (Sync to Template)</div>
                                        <div className="text-xs font-num text-neutral">อัปเดตตารางเวลาประจำ (employee_schedules) ในระบบให้ตรงกับสถิติล่าสุด</div>
                                    </div>
                                </label>

                                <label className="flex items-center gap-2.5 p-2.5 border border-rule bg-paper-2 cursor-pointer select-none">
                                    <input
                                        type="checkbox"
                                        checked={autoGenForm.overwrite}
                                        onChange={e => setAutoGenForm(prev => ({ ...prev, overwrite: e.target.checked }))}
                                        className="w-4 h-4 border-charcoal bg-cream accent-plum focus:ring-0 cursor-pointer"
                                    />
                                    <div>
                                        <div className="font-num font-semibold text-xs text-charcoal">เขียนทับกะที่เป็นแบบร่าง (Draft) เดิม</div>
                                        <div className="text-xs font-num text-neutral">ล้างกะ Draft เก่าในสัปดาห์นี้และลงชุดใหม่ที่ระบบเรียนรู้</div>
                                    </div>
                                </label>
                            </div>
                        </div>

                        {/* Footer */}
                        <div className="px-6 py-4 border-t border-rule flex flex-wrap justify-between items-center gap-2 bg-paper-2 shrink-0">
                            <button
                                type="button"
                                onClick={handleViewLearnedHabits}
                                className="px-3 py-2 bg-cream hover:bg-neutral/10 text-charcoal border border-rule font-num font-semibold text-xs transition-colors duration-150 cursor-pointer flex items-center gap-1.5"
                            >
                                ดูแบบแผนที่ระบบเรียนรู้
                            </button>
                            <div className="flex items-center gap-2">
                                <button
                                    type="button"
                                    onClick={() => setShowAutoGenModal(false)}
                                    className="px-4 py-2 text-charcoal hover:bg-neutral/10 border border-rule font-num font-semibold text-xs transition-colors duration-150 cursor-pointer"
                                >
                                    ยกเลิก
                                </button>
                                <button
                                    type="button"
                                    onClick={handleExecuteAutoGenerate}
                                    disabled={isAutoGenerating}
                                    className="px-5 py-2 bg-charcoal hover:bg-charcoal-2 text-cream font-num font-semibold text-xs border border-charcoal transition-colors duration-150 cursor-pointer flex items-center gap-2"
                                >
                                    {isAutoGenerating ? (
                                        <>กำลังสร้างตาราง...</>
                                    ) : (
                                        <>
                                            ยืนยันจัดตารางอัตโนมัติ
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Learned Habits Modal */}
            {learnedHabitsModal && (
                <div className="fixed inset-0 z-[70] flex items-center justify-center bg-charcoal/50 p-4">
                    <div className="bg-cream border border-charcoal w-full max-w-3xl overflow-hidden flex flex-col">
                        <div className="px-6 py-4 border-b border-rule flex justify-between items-center bg-paper-2">
                            <div>
                                <h3 className="font-num font-semibold text-sm text-charcoal flex items-center gap-2">
                                                                        แบบแผนเวลาทำงานที่ระบบเรียนรู้ (Learned Regular Habits)
                                </h3>
                                <p className="text-xs font-num text-neutral mt-0.5">
                                    วิเคราะห์จากสถิติย้อนหลัง {learnedHabitsModal.weeksAnalyzed} สัปดาห์ (ข้อมูล {learnedHabitsModal.totalHistoricalTxs} กะ)
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setLearnedHabitsModal(null)}
                                className="w-7 h-7 flex items-center justify-center border border-rule hover:border-charcoal bg-cream text-charcoal font-num text-xs transition-colors duration-150 cursor-pointer"
                            >
                                
                            </button>
                        </div>

                        <div className="p-6 max-h-[65vh] overflow-y-auto custom-scrollbar">
                            <table className="w-full text-xs text-left border-collapse font-num">
                                <thead className="bg-paper-2 text-neutral border-b border-rule text-xs">
                                    <tr>
                                        <th className="px-3 py-2">พนักงาน</th>
                                        <th className="px-2 py-2 text-center">จันทร์</th>
                                        <th className="px-2 py-2 text-center">อังคาร</th>
                                        <th className="px-2 py-2 text-center">พุธ</th>
                                        <th className="px-2 py-2 text-center">พฤหัส</th>
                                        <th className="px-2 py-2 text-center">ศุกร์</th>
                                        <th className="px-2 py-2 text-center">เสาร์</th>
                                        <th className="px-2 py-2 text-center">อาทิตย์</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-rule">
                                    {Object.values(learnedHabitsModal.learnedHabits || {}).map(empHabit => {
                                        const dayOrder = [1, 2, 3, 4, 5, 6, 0]; // Mon to Sun
                                        return (
                                            <tr key={empHabit.employee_id} className="hover:bg-paper-2">
                                                <td className="px-3 py-2.5 font-semibold text-charcoal">
                                                    <div>{empHabit.name}</div>
                                                    <div className="text-xs text-neutral font-normal">{empHabit.position}</div>
                                                </td>
                                                {dayOrder.map(d => {
                                                    const shiftInfo = empHabit.routine[d] || { is_off: true };
                                                    const isOff = shiftInfo.is_off;
                                                    const timeStr = shiftInfo.custom_start_time
                                                        ? `${shiftInfo.custom_start_time.slice(0, 5)}-${shiftInfo.custom_end_time.slice(0, 5)}`
                                                        : (shiftInfo.shift_id ? `กะ ${shiftInfo.shift_id}` : 'OFF');

                                                    return (
                                                        <td key={d} className="px-2 py-2 text-center border-l border-rule">
                                                            <div className={`p-1 text-xs font-semibold ${isOff ? 'bg-error/10 text-error' : 'bg-charcoal/10 text-charcoal'}`}>
                                                                {isOff ? 'OFF' : timeStr}
                                                            </div>
                                                            <div className="text-xs text-neutral mt-0.5">
                                                                {shiftInfo.confidence}%
                                                            </div>
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        <div className="px-6 py-4 border-t border-rule flex justify-between items-center bg-paper-2 shrink-0">
                            <span className="text-xs font-num text-neutral">
                                *ระบบจะนำแบบแผนเหล่านี้ไปลงกะอัตโนมัติเมื่อกดจัดตาราง และสามารถปรับแก้รายกะได้ตลอดเวลา
                            </span>
                            <button
                                type="button"
                                onClick={() => setLearnedHabitsModal(null)}
                                className="px-4 py-2 bg-charcoal text-cream font-num font-semibold text-xs border border-charcoal cursor-pointer"
                            >
                                ปิดหน้าต่าง
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const getShiftColorClass = (s, shiftObj) => {
    if (s.is_off) return 'bg-paper-2 border-rule text-subtle';

    const name = (shiftObj?.name || '').toLowerCase();
    const startClean = (s.custom_start_time || shiftObj?.start_time || '').slice(0, 5);
    const endClean = (s.custom_end_time || shiftObj?.end_time || '').slice(0, 5);

    if (name.includes('ควบ') || name.includes('double') || (startClean === '10:00' && endClean === '00:30')) {
        return 'bg-rose-50 border-rose-200 text-rose-950';
    }
    if (name.includes('ค่ำ') || name.includes('ดึก') || name.includes('night') || (startClean === '16:30' && endClean === '00:30')) {
        return 'bg-sky-50 border-sky-200 text-sky-950';
    }
    if (name.includes('inthehaus') || (startClean === '18:00' && endClean === '22:30')) {
        return 'bg-indigo-50 border-indigo-200 text-indigo-950';
    }
    if (name.includes('chef') || (startClean === '10:00' && endClean === '20:30')) {
        return 'bg-emerald-50 border-emerald-200 text-emerald-950';
    }
    if (name.includes('ครัว') || (startClean === '12:30' && endClean === '23:30')) {
        return 'bg-violet-50 border-violet-200 text-violet-950';
    }
    if (name.includes('เช้า') || name.includes('morning') || (startClean === '10:00' && endClean === '18:00')) {
        return 'bg-amber-50 border-amber-200 text-amber-950';
    }
    if (name.includes('กลาง') || (startClean === '12:00' && endClean === '20:00')) {
        return 'bg-sky-50 border-sky-200 text-sky-950';
    }
    if (name.includes('part-time') || (startClean === '12:30' && endClean === '21:30')) {
        return 'bg-rose-50 border-rose-200 text-rose-950';
    }
    
    return 'bg-sky-50 border-sky-200 text-sky-950';
};
