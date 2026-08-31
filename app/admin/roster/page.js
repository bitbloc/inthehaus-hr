"use client";

import React, { useState, useEffect } from 'react';
import { Badge } from '../_components/ui/Badge';
import { supabase } from '../../../lib/supabaseClient';
import { useRealtimeSync } from '../../../lib/useRealtimeSync';
import { startOfWeek, endOfWeek, addDays, format, subWeeks, addWeeks, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, CheckCircle, Save, Plus, Trash2, Printer, Search, Settings, Filter, UserCheck, UserX, AlertCircle, Sun } from 'lucide-react';

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
    const [presetModal, setPresetModal] = useState(null); // { start, end } or null

    // Employee Status, Vacation & Audit Filter State
    const [statusFilter, setStatusFilter] = useState('ALL'); // 'ALL' | 'ACTIVE' | 'SUSPENDED' | 'VACATION'
    const [searchQuery, setSearchQuery] = useState('');
    const [adjustingEmpModal, setAdjustingEmpModal] = useState(null);
    const [auditExceptionsOnly, setAuditExceptionsOnly] = useState(false);
    const [toast, setToast] = useState(null);

    const showToast = (message, type = 'success') => {
        setToast({ message, type });
        setTimeout(() => setToast(null), 4000);
    };

    const SYSTEM_STANDARD_PRESETS = [
        { start: '18:00', end: '22:30', name: 'INTHEHAUS', color: 'indigo', icon: '' },
        { start: '10:00', end: '00:30', name: 'ควบกะ 🔥', color: 'rose', icon: '🔥' },
        { start: '16:30', end: '00:30', name: 'กะค่ำ 🌙', color: 'sky', icon: '🌙' },
        { start: '10:00', end: '18:00', name: 'กะเช้า ☀️', color: 'amber', icon: '☀️' },
        { start: '10:00', end: '20:30', name: 'CHEF', color: 'emerald', icon: '' },
        { start: '12:30', end: '23:30', name: 'ผู้ช่วยครัว', color: 'violet', icon: '' },
        { start: '12:00', end: '20:00', name: 'กลางกะ', color: 'sky', icon: '' },
        { start: '12:30', end: '21:30', name: 'PART-TIME', color: 'rose', icon: '' },
    ];

    const PRESET_COLORS = [
        { id: 'sky', label: 'SKY', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', dot: 'bg-sky-500' },
        { id: 'amber', label: 'AMBER', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
        { id: 'indigo', label: 'INDIGO', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', dot: 'bg-indigo-500' },
        { id: 'rose', label: 'ROSE', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', dot: 'bg-rose-500' },
        { id: 'emerald', label: 'EMERALD', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
        { id: 'violet', label: 'VIOLET', bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200', dot: 'bg-violet-500' },
        { id: 'slate', label: 'SLATE', bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', dot: 'bg-slate-500' },
        { id: 'teal', label: 'TEAL', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200', dot: 'bg-teal-500' },
    ];
    const PRESET_ICONS = [];

    const getPresetColor = (colorId) => PRESET_COLORS.find(c => c.id === colorId) || PRESET_COLORS[0];

    useEffect(() => {
        try {
            const saved = localStorage.getItem('roster_custom_presets');
            if (saved) {
                setCustomPresets(JSON.parse(saved));
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    const allPresets = React.useMemo(() => {
        const combined = [...SYSTEM_STANDARD_PRESETS];
        (customPresets || []).forEach(cp => {
            const sClean = (cp.start || '').slice(0, 5);
            const eClean = (cp.end || '').slice(0, 5);
            const existingIdx = combined.findIndex(p => p.start === sClean && p.end === eClean);
            if (existingIdx >= 0) {
                combined[existingIdx] = { ...combined[existingIdx], ...cp };
            } else {
                combined.push(cp);
            }
        });
        return combined;
    }, [customPresets]);

    const openPresetModal = (start, end) => {
        setPresetModal({ start, end, name: '', color: 'sky', icon: '' });
    };

    const confirmSavePreset = () => {
        if (!presetModal) return;
        const { start, end, name, color, icon } = presetModal;
        if (!start || !end) return showToast('กรุณากรอกทั้งเวลาเริ่มและเวลาเลิก', 'error');
        const normStart = start.slice(0, 5);
        const normEnd = end.slice(0, 5);
        if (customPresets.some(p => (p.start || '').slice(0, 5) === normStart && (p.end || '').slice(0, 5) === normEnd)) {
            setPresetModal(null);
            return;
        }
        const newPresets = [...customPresets, { start: normStart, end: normEnd, name: name || `${normStart}-${normEnd}`, color: color || 'sky', icon: '' }];
        setCustomPresets(newPresets);
        localStorage.setItem('roster_custom_presets', JSON.stringify(newPresets));
        showToast('บันทึก Preset กะงานเรียบร้อยแล้ว', 'success');
        setPresetModal(null);
    };

    const deleteCustomPreset = (idx) => {
        const newPresets = customPresets.filter((_, i) => i !== idx);
        setCustomPresets(newPresets);
        localStorage.setItem('roster_custom_presets', JSON.stringify(newPresets));
    };

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    const weekEnd = addDays(weekStart, 6);
    const daysTitle = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
    const dates = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    useEffect(() => {
        fetchData();
    }, [currentDate]);

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

    const getCellAttendanceStatus = (empId, date, slots) => {
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
                    label: `IN ${format(checkIn, 'HH:mm')} - OUT ${format(checkOut, 'HH:mm')}`,
                    badgeColor: 'bg-rams-green/10 text-rams-green border-rams-green/30'
                };
            }
            if (checkIn && !checkOut) {
                if (isToday) {
                    return {
                        type: 'ACTIVE',
                        label: `ACTIVE (IN ${format(checkIn, 'HH:mm')})`,
                        badgeColor: 'bg-rams-ink text-rams-panel border-rams-ink'
                    };
                }
                return {
                    type: 'MISSED_OUT',
                    label: `MISSED OUT (IN ${format(checkIn, 'HH:mm')})`,
                    badgeColor: 'bg-rams-red/10 text-rams-red border-rams-red/30'
                };
            }
            if (!checkIn && checkOut) {
                return {
                    type: 'MISSED_IN',
                    label: `MISSED IN (OUT ${format(checkOut, 'HH:mm')})`,
                    badgeColor: 'bg-rams-red/10 text-rams-red border-rams-red/30'
                };
            }
            if (!checkIn && !checkOut && isPast) {
                return {
                    type: 'ABSENT',
                    label: 'ABSENT / NO CLOCK-IN',
                    badgeColor: 'bg-rams-red/10 text-rams-red border-rams-red/30'
                };
            }
        } else {
            // Scheduled OFF or empty slot
            if (checkIn && checkOut) {
                return {
                    type: 'OFF_DAY_WORK',
                    label: `OFF-DAY WORK: ${format(checkIn, 'HH:mm')}-${format(checkOut, 'HH:mm')}`,
                    badgeColor: 'bg-rams-orange text-rams-panel border-rams-orange font-bold'
                };
            }
            if (checkIn && !checkOut) {
                return {
                    type: 'OFF_DAY_MISSED_OUT',
                    label: `OFF-DAY: MISSED OUT (IN ${format(checkIn, 'HH:mm')})`,
                    badgeColor: 'bg-rams-orange/15 text-rams-orange border-rams-orange/40 font-bold'
                };
            }
            if (!checkIn && checkOut) {
                return {
                    type: 'OFF_DAY_MISSED_IN',
                    label: `OFF-DAY: MISSED IN (OUT ${format(checkOut, 'HH:mm')})`,
                    badgeColor: 'bg-rams-orange/15 text-rams-orange border-rams-orange/40 font-bold'
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

    const weeklyAuditStats = React.useMemo(() => {
        let missedCount = 0;
        let offDayCount = 0;
        let absentCount = 0;
        const empWithExceptions = new Set();

        employees.forEach(emp => {
            dates.forEach(d => {
                const dateStr = format(d, 'yyyy-MM-dd');
                const slots = transactions.filter(t => t.employee_id === emp.id && t.date === dateStr);
                const att = getCellAttendanceStatus(emp.id, d, slots);
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

    const dailyOnDutyStats = React.useMemo(() => {
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

    const getCellSlots = (empId, date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return transactions.filter(t => t.employee_id === empId && t.date === dateStr);
    };

    const openCellModal = (emp, date) => {
        const existingSlots = getCellSlots(emp.id, date);
        setEditingCell({
            employee: emp,
            date: date,
            slots: existingSlots.length > 0 ? existingSlots : [{
                slot_type: 'MAIN',
                is_off: false,
                shift_id: '',
                custom_start_time: '',
                custom_end_time: '',
                status: 'DRAFT',
                isNew: true
            }]
        });
    };

    const handleSlotChange = (index, field, value) => {
        const newSlots = [...editingCell.slots];
        newSlots[index][field] = value;
        setEditingCell({ ...editingCell, slots: newSlots });
    };

    const addSlot = () => {
        setEditingCell({
            ...editingCell,
            slots: [...editingCell.slots, {
                slot_type: 'SPLIT',
                is_off: false,
                shift_id: '',
                custom_start_time: '',
                custom_end_time: '',
                status: 'DRAFT',
                isNew: true
            }]
        });
    };

    const removeSlot = (index) => {
        const newSlots = [...editingCell.slots];
        newSlots.splice(index, 1);
        setEditingCell({ ...editingCell, slots: newSlots });
    };

    const saveCell = async () => {
        setSaving(true);
        const dateStr = format(editingCell.date, 'yyyy-MM-dd');
        const empId = editingCell.employee.id;

        const payload = editingCell.slots.map(s => ({
            employee_id: empId,
            date: dateStr,
            slot_type: s.slot_type,
            shift_id: s.shift_id ? parseInt(s.shift_id) : null,
            custom_start_time: s.custom_start_time || null,
            custom_end_time: s.custom_end_time || null,
            is_off: s.is_off,
            status: s.status || 'DRAFT'
        }));

        try {
            // Because we might have deleted some slots, let's just delete all for this cell first then insert
            await supabase.from('roster_transactions')
                .delete()
                .match({ employee_id: empId, date: dateStr });
            
            if (payload.length > 0) {
                const res = await fetch('/api/roster/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'UPSERT', transactions: payload })
                });
                if (!res.ok) throw new Error('Save failed');
            }
            
            await fetchData();
            setEditingCell(null);
            showToast('บันทึกกะงานเรียบร้อยแล้ว', 'success');
        } catch (e) {
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

    return (
        <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6 text-rams-ink font-sans min-h-screen bg-rams-bg selection:bg-rams-ink/10 relative">
            {/* In-App Toast Notification */}
            {toast && (
                <div className={`fixed top-5 right-5 z-50 flex items-center gap-3 px-4 py-3 rounded-sm border shadow-lg font-mono text-xs animate-in fade-in slide-in-from-top-3 duration-200 ${
                    toast.type === 'error' 
                        ? 'bg-rams-red text-rams-panel border-rams-red' 
                        : toast.type === 'info'
                        ? 'bg-rams-ink text-rams-panel border-rams-ink'
                        : 'bg-rams-green text-rams-panel border-rams-green'
                }`}>
                    <span className="font-bold">{toast.message}</span>
                    <button 
                        type="button" 
                        onClick={() => setToast(null)} 
                        className="opacity-70 hover:opacity-100 p-0.5 ml-2 cursor-pointer"
                    >
                        ✕
                    </button>
                </div>
            )}

            <div className="mb-2">
                <a href="/admin" className="text-xs font-mono font-bold text-rams-ink-muted hover:text-rams-ink flex items-center gap-1.5 w-fit transition-colors uppercase tracking-wider">
                    <ChevronLeft size={14} /> กลับสู่หน้าแดชบอร์ดหลัก
                </a>
            </div>

            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-rams-panel p-5 rounded-sm border border-rams-rule shadow-none">
                <div>
                    <div className="flex items-center gap-2">
                        <h1 className="text-lg font-mono font-bold tracking-wider text-rams-ink uppercase">จัดการตารางงาน (Matrix View)</h1>
                        <span className="px-2 py-0.5 text-[9px] font-mono font-bold uppercase tracking-widest bg-rams-orange text-rams-panel rounded-sm">
                            LIVE ROSTER
                        </span>
                    </div>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-rams-ink-muted mt-1.5">จัดกะการทำงานรองรับแบบยืดหยุ่น ข้ามวัน และกะควบ</p>
                </div>
                
                <div className="flex flex-wrap gap-2.5">
                    <button 
                        onClick={copyLastWeek} 
                        className="flex items-center gap-2 px-4 py-2.5 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink rounded-sm border border-rams-rule-light text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[40px] active:translate-y-[1px]"
                    >
                        <Copy size={14} className="text-rams-ink-muted" /> Copy from Last Week
                    </button>
                    <a 
                        href={`/admin/roster/report?start=${format(weekStart, 'yyyy-MM-dd')}`} 
                        target="_blank"
                        className="flex items-center gap-2 px-4 py-2.5 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink rounded-sm border border-rams-rule-light text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer min-h-[40px] active:translate-y-[1px]"
                    >
                        <Printer size={14} className="text-rams-ink-muted" /> Export PDF
                    </a>
                    <button 
                        onClick={publishWeek} 
                        className="flex items-center gap-2 px-4 py-2.5 bg-rams-orange hover:bg-rams-orange-active text-rams-panel rounded-sm border border-rams-rule text-xs font-mono font-bold uppercase tracking-wider shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer min-h-[40px]"
                    >
                        <CheckCircle size={14} /> Publish & Notify
                    </button>
                </div>
            </div>

            {/* Audit Summary Bar */}
            <div className="bg-rams-panel border border-rams-rule-light p-4 rounded-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-3 shadow-none">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                        AUDIT SUMMARY (สัปดาห์นี้):
                    </span>
                    <span className={`px-2 py-1 rounded-sm text-[9px] font-mono font-bold border uppercase tracking-wider ${weeklyAuditStats.missedCount > 0 ? 'bg-rams-red/10 text-rams-red border-rams-red/30' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light'}`}>
                        MISSED PUNCHES: {weeklyAuditStats.missedCount}
                    </span>
                    <span className={`px-2 py-1 rounded-sm text-[9px] font-mono font-bold border uppercase tracking-wider ${weeklyAuditStats.offDayCount > 0 ? 'bg-rams-orange/10 text-rams-orange border-rams-orange/30' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light'}`}>
                        OFF-DAY ATTENDANCE: {weeklyAuditStats.offDayCount}
                    </span>
                    <span className={`px-2 py-1 rounded-sm text-[9px] font-mono font-bold border uppercase tracking-wider ${weeklyAuditStats.absentCount > 0 ? 'bg-rams-red/10 text-rams-red border-rams-red/30' : 'bg-rams-bg text-rams-ink-muted border-rams-rule-light'}`}>
                        ABSENT: {weeklyAuditStats.absentCount}
                    </span>
                </div>

                <button
                    type="button"
                    onClick={() => setAuditExceptionsOnly(!auditExceptionsOnly)}
                    className={`px-3 py-1.5 rounded-sm text-[10px] font-mono font-bold uppercase tracking-wider border transition-all cursor-pointer min-h-[34px] ${auditExceptionsOnly ? 'bg-rams-red text-rams-panel border-rams-red' : 'bg-rams-bg text-rams-ink border-rams-rule-light hover:border-rams-rule'}`}
                >
                    {auditExceptionsOnly ? 'SHOWING EXCEPTIONS ONLY' : 'FILTER: EXCEPTIONS ONLY'}
                </button>
            </div>

            <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
                {/* Status Filter Bar & Search */}
                <div className="p-4 border-b border-rams-rule-light bg-rams-bg/20 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider flex items-center gap-1">
                            <Filter size={12} /> กรองพนักงาน:
                        </span>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('ALL')}
                            className={`px-3 py-1.5 rounded-sm text-xs font-mono font-bold transition-all cursor-pointer min-h-[34px] ${statusFilter === 'ALL' ? 'bg-rams-ink text-rams-panel' : 'bg-rams-bg border border-rams-rule-light text-rams-ink hover:border-rams-rule'}`}
                        >
                            ทั้งหมด ({employees.length})
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('ACTIVE')}
                            className={`px-3 py-1.5 rounded-sm text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer min-h-[34px] ${statusFilter === 'ACTIVE' ? 'bg-rams-green text-rams-panel' : 'bg-rams-bg border border-rams-rule-light text-rams-ink hover:border-rams-rule'}`}
                        >
                            <UserCheck size={12} /> ทำงานปกติ ({activeCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('SUSPENDED')}
                            className={`px-3 py-1.5 rounded-sm text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer min-h-[34px] ${statusFilter === 'SUSPENDED' ? 'bg-rams-red text-rams-panel' : 'bg-rams-bg border border-rams-rule-light text-rams-ink hover:border-rams-rule'}`}
                        >
                            <UserX size={12} /> พักงาน ({suspendedCount})
                        </button>
                        <button
                            type="button"
                            onClick={() => setStatusFilter('VACATION')}
                            className={`px-3 py-1.5 rounded-sm text-xs font-mono font-bold transition-all flex items-center gap-1 cursor-pointer min-h-[34px] ${statusFilter === 'VACATION' ? 'bg-rams-ink text-rams-panel' : 'bg-rams-bg border border-rams-rule-light text-rams-ink hover:border-rams-rule'}`}
                        >
                            <Sun size={12} /> พักร้อน ({vacationCount})
                        </button>
                    </div>

                    <div className="relative min-w-[200px]">
                        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-rams-ink-muted" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="ค้นชื่อ, ตำแหน่ง..."
                            className="w-full pl-8 pr-3 py-1.5 text-xs font-mono bg-rams-bg border border-rams-rule-light rounded-sm text-rams-ink outline-none focus:border-rams-rule min-h-[34px]"
                        />
                    </div>
                </div>

                <div className="flex items-center justify-between p-4 border-b border-rams-rule-light bg-rams-bg/30">
                    <button onClick={prevWeek} className="w-9 h-9 bg-rams-panel border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center rounded-sm transition-all cursor-pointer active:translate-y-[1px]"><ChevronLeft size={16} /></button>
                    <div className="text-center">
                        <h2 className="text-sm font-mono font-bold text-rams-ink uppercase tracking-wider">
                            {format(weekStart, 'dd MMM yyyy')} - {format(weekEnd, 'dd MMM yyyy')}
                        </h2>
                        <div className="text-[9px] font-mono text-rams-ink-muted uppercase tracking-widest mt-0.5">
                            สัปดาห์ที่ {format(weekStart, 'w')} ของปี {format(weekStart, 'yyyy')}
                        </div>
                    </div>
                    <button onClick={nextWeek} className="w-9 h-9 bg-rams-panel border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center rounded-sm transition-all cursor-pointer active:translate-y-[1px]"><ChevronRight size={16} /></button>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-16 text-center font-mono text-xs text-rams-ink-muted uppercase tracking-wider">Loading roster data...</div>
                    ) : filteredEmployees.length === 0 ? (
                        <div className="p-16 text-center font-mono text-xs text-rams-ink-muted uppercase tracking-wider">ไม่พบพนักงานในเงื่อนไขที่เลือก</div>
                    ) : (
                        <table className="w-full text-xs text-left border-collapse">
                            <thead className="bg-rams-bg/60 text-rams-ink-muted border-b border-rams-rule-light font-mono text-[9px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-4 py-3 min-w-[180px] sticky left-0 bg-rams-bg z-20 border-r border-rams-rule shadow-[2px_0_5px_rgba(0,0,0,0.06)]">
                                        พนักงาน / ตำแหน่ง
                                    </th>
                                    {dates.map((date, i) => (
                                        <th key={i} className="px-3 py-3 text-center min-w-[140px] border-l border-rams-rule-light">
                                            <div className="text-[9px] font-mono text-rams-ink-muted uppercase tracking-widest">{daysTitle[i]}</div>
                                            <div className="font-mono font-bold text-xs text-rams-ink mt-0.5">{format(date, 'dd/MM')}</div>
                                            <div className="mt-1">
                                                <span className="inline-block px-1.5 py-0.5 rounded-sm text-[8px] font-mono font-bold uppercase bg-rams-panel border border-rams-rule-light text-rams-ink">
                                                    ON DUTY: {dailyOnDutyStats[i]?.count || 0}
                                                </span>
                                            </div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rams-rule-light">
                                {filteredEmployees.map(emp => {
                                    const empSuspended = isSuspended(emp);
                                    const empVacation = hasVacation(emp);
                                    const empLeave = hasOtherLeave(emp);
                                    return (
                                        <tr key={emp.id} className={`hover:bg-rams-bg/30 text-rams-ink ${empSuspended ? 'bg-rams-red/5' : empVacation ? 'bg-rams-ink/5' : ''}`}>
                                            <td className="px-4 py-3 border-b border-rams-rule-light align-top space-y-1.5 sticky left-0 bg-rams-panel z-10 border-r border-rams-rule shadow-[2px_0_5px_rgba(0,0,0,0.06)]">
                                                <div className="flex items-center justify-between gap-1">
                                                    <span className="font-bold">{emp.nickname || emp.name}</span>
                                                    <button
                                                        type="button"
                                                        onClick={() => openAdjustingEmpModal(emp)}
                                                        className="p-1 text-rams-ink-muted hover:text-rams-orange border border-rams-rule-light hover:border-rams-orange rounded-sm transition-all cursor-pointer"
                                                        title="ปรับสถานะ/การลา"
                                                    >
                                                        <Settings size={12} />
                                                    </button>
                                                </div>
                                                <div className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-wider">{emp.position}</div>
                                                
                                                {/* Status Badges */}
                                                <div className="flex flex-wrap gap-1 pt-0.5 font-mono text-[9px]">
                                                    {empSuspended && (
                                                        <span className="px-1.5 py-0.5 font-bold bg-rams-red/10 border border-rams-red/30 text-rams-red rounded-sm uppercase">
                                                            SUSPENDED
                                                        </span>
                                                    )}
                                                    {empVacation && (
                                                        <span className="px-1.5 py-0.5 font-bold bg-rams-ink/10 border border-rams-ink/30 text-rams-ink rounded-sm uppercase">
                                                            VACATION
                                                        </span>
                                                    )}
                                                    {empLeave && !empVacation && (
                                                        <span className="px-1.5 py-0.5 font-bold bg-rams-amber/10 border border-rams-amber/30 text-rams-amber rounded-sm uppercase">
                                                            HAS LEAVE
                                                        </span>
                                                    )}
                                                </div>
                                            </td>
                                        {dates.map((date, i) => {
                                            const slots = getCellSlots(emp.id, date);
                                            const dateStr = format(date, 'yyyy-MM-dd');
                                            const empLeaves = leaveRequests.filter(l => l.employee_id === emp.id && l.leave_date === dateStr);
                                            const attendanceStatus = getCellAttendanceStatus(emp.id, date, slots);
                                            const hasDiscrepancy = attendanceStatus && (attendanceStatus.type === 'OFF_DAY_WORK' || attendanceStatus.type.includes('MISSED') || attendanceStatus.type === 'ABSENT');

                                            return (
                                                <td key={i} className={`px-2 py-2 border-l border-rams-rule-light align-top ${hasDiscrepancy ? 'bg-rams-orange/5' : 'bg-rams-panel/50'}`}>
                                                    <div 
                                                        className={`group h-full min-h-[70px] w-full rounded-sm border p-1.5 space-y-1.5 transition-all flex flex-col cursor-pointer ${
                                                            hasDiscrepancy 
                                                                ? 'border-rams-orange/40 bg-rams-orange/5 hover:border-rams-orange' 
                                                                : 'border-dashed border-rams-rule-light hover:border-rams-orange hover:bg-rams-orange/5'
                                                        }`}
                                                        onClick={() => openCellModal(emp, date)}
                                                    >
                                                        {slots.length === 0 && empLeaves.length === 0 && !attendanceStatus && (
                                                            <div className="h-full flex items-center justify-center py-4">
                                                                <span className="text-[10px] font-mono font-bold text-rams-ink-muted/40 uppercase group-hover:text-rams-orange transition-colors">
                                                                    + กะงาน
                                                                </span>
                                                            </div>
                                                        )}
                                                        
                                                        {/* Real-time Attendance Status Indicator */}
                                                        {attendanceStatus && (
                                                            <div className={`p-1 rounded-sm text-[9px] font-mono border ${attendanceStatus.badgeColor} text-center uppercase tracking-wider font-bold`}>
                                                                {attendanceStatus.label}
                                                            </div>
                                                        )}

                                                        {/* Leave Request Badges */}
                                                        {empLeaves.map((l, idx) => {
                                                            let badgeColor = 'bg-rams-amber/10 border-rams-amber/30 text-rams-amber';
                                                            let label = `LEAVE: ${l.leave_type === 'sick' ? 'SICK' : l.leave_type === 'business' ? 'BIZ' : 'VACATION'} (PENDING)`;
                                                            if (l.status === 'approved') {
                                                                badgeColor = 'bg-rams-green/10 border-rams-green/30 text-rams-green';
                                                                label = `LEAVE: ${l.leave_type === 'sick' ? 'SICK' : l.leave_type === 'business' ? 'BIZ' : 'VACATION'} (APPROVED)`;
                                                            } else if (l.status === 'rejected') {
                                                                badgeColor = 'bg-rams-red/10 border-rams-red/30 text-rams-red';
                                                                label = `LEAVE: ${l.leave_type === 'sick' ? 'SICK' : l.leave_type === 'business' ? 'BIZ' : 'VACATION'} (REJECTED)`;
                                                            }
                                                            return (
                                                                <div key={`leave-${idx}`} className={`p-1 rounded-sm text-[9px] font-mono font-bold border ${badgeColor} text-center uppercase tracking-wider`}>
                                                                    {label}
                                                                </div>
                                                            );
                                                        })}

                                                        {/* Scheduled Shifts */}
                                                        {slots.map((s, idx) => {
                                                            const shiftObj = shifts.find(sh => sh.id === s.shift_id);
                                                            const startClean = (s.custom_start_time || shiftObj?.start_time || '').slice(0, 5);
                                                            const endClean = (s.custom_end_time || shiftObj?.end_time || '').slice(0, 5);
                                                            const timeStr = startClean && endClean ? `${startClean}-${endClean}` : (shiftObj ? `${shiftObj.start_time.slice(0,5)}-${shiftObj.end_time.slice(0,5)}` : '');

                                                            // Match against all standard & custom presets
                                                            const matchedPreset = (!s.is_off && startClean && endClean)
                                                                ? allPresets.find(p => (p.start || '').slice(0, 5) === startClean && (p.end || '').slice(0, 5) === endClean)
                                                                : null;

                                                            // Match against DB shifts by start and end time if shiftObj is missing
                                                            const matchedDbShift = (!shiftObj && !s.is_off && startClean && endClean)
                                                                ? shifts.find(sh => (sh.start_time || '').slice(0, 5) === startClean && (sh.end_time || '').slice(0, 5) === endClean)
                                                                : null;

                                                            const approvedLeave = empLeaves.find(l => l.status === 'approved');
                                                            const isLeaveOff = s.is_off && approvedLeave;
                                                            const bgColor = isLeaveOff
                                                                ? 'bg-rams-amber/15 border-rams-amber text-rams-ink font-bold border-2 border-dashed shadow-none'
                                                                : (matchedPreset
                                                                    ? `${getPresetColor(matchedPreset.color).bg} ${getPresetColor(matchedPreset.color).border} ${getPresetColor(matchedPreset.color).text}`
                                                                    : getShiftColorClass(s, shiftObj || matchedDbShift));
                                                            const cellLabel = s.is_off
                                                                ? (approvedLeave
                                                                    ? `OFF (LEAVE: ${approvedLeave.leave_type === 'sick' ? 'SICK' : approvedLeave.leave_type === 'business' ? 'BIZ' : 'VACATION'})`
                                                                    : 'OFF')
                                                                : (matchedPreset ? matchedPreset.name : (shiftObj?.name || matchedDbShift?.name || (timeStr ? `กะ ${timeStr}` : 'CUSTOM')));

                                                            return (
                                                                <div key={idx} className={`p-1.5 rounded-sm text-[10px] font-mono border ${bgColor} ${s.status === 'DRAFT' ? 'border-dashed border-2' : ''}`}>
                                                                    <div className="font-bold uppercase tracking-wide">{cellLabel}</div>
                                                                    {!s.is_off && timeStr && <div className="text-[9px] font-bold text-rams-ink/80 mt-0.5">{timeStr}</div>}
                                                                    {s.slot_type !== 'MAIN' && <div className="text-[9px] uppercase font-bold tracking-wider opacity-60 mt-0.5">{s.slot_type}</div>}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                );
                            })}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-rams-rule bg-rams-bg/60 font-mono">
                                    <td className="px-4 py-3 sticky left-0 bg-rams-bg z-10 border-r border-rams-rule text-[10px] font-bold uppercase tracking-wider text-rams-ink shadow-[2px_0_5px_rgba(0,0,0,0.06)]">
                                        TOTAL ON DUTY (รวม)
                                    </td>
                                    {dates.map((date, i) => (
                                        <td key={`total-${i}`} className="px-3 py-2.5 text-center text-xs font-bold text-rams-ink border-l border-rams-rule-light">
                                            {dailyOnDutyStats[i]?.count || 0} คน
                                        </td>
                                    ))}
                                </tr>
                            </tfoot>
                        </table>
                    )}
                </div>
            </div>

            {/* Section: Leave Requests of the Week */}
            <div className="bg-rams-panel rounded-sm border border-rams-rule p-5 space-y-4 shadow-none">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-rams-ink flex items-center gap-2">
                            ข้อมูลการลาหยุดสัปดาห์นี้ ({leaveRequests.length} รายการ)
                        </h2>
                        <p className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-wider">จัดการ อนุมัติ ปรับรายละเอียดการลา และซิงค์เข้าสู่ตารางเวร roster โดยตรง</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {selectedLeaveIds.length > 0 && (
                            <button
                                type="button"
                                onClick={handleDeleteMultipleLeaves}
                                className="flex items-center gap-2 px-3 py-1.5 bg-rams-red/10 hover:bg-rams-red/20 text-rams-red border border-rams-red/30 rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-none cursor-pointer"
                            >
                                ลบใบลาที่เลือก ({selectedLeaveIds.length})
                            </button>
                        )}
                        {leaveRequests.length > 0 && (
                            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-rams-bg hover:bg-rams-panel border border-rams-rule-light rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer select-none">
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
                                    className="w-3 h-3 rounded-sm border-rams-rule bg-rams-bg accent-rams-orange focus:ring-0 cursor-pointer"
                                />
                                เลือกทั้งหมด
                            </label>
                        )}
                        {leaveRequests.filter(l => l.status === 'approved').length > 0 && (
                            <button 
                                type="button"
                                onClick={syncAllApprovedLeaves}
                                className="flex items-center gap-2 px-3 py-1.5 bg-rams-panel hover:bg-rams-bg text-rams-ink border border-rams-rule rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-none cursor-pointer"
                            >
                                🔄 ซิงค์ใบลาที่อนุมัติแล้วทั้งหมดเข้าตาราง
                            </button>
                        )}
                    </div>
                </div>
                
                {leaveRequests.length === 0 ? (
                    <div className="text-center py-8 text-rams-ink-muted text-xs font-mono uppercase tracking-wider bg-rams-bg rounded-sm border border-dashed border-rams-rule-light">
                        ไม่มีคำขอลาหยุดในสัปดาห์นี้
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {leaveRequests.map((req) => {
                            const isEditing = editingLeaveId === req.id;
                            return (
                                <div key={req.id} className="bg-rams-panel border border-rams-rule-light rounded-sm shadow-none overflow-hidden flex flex-col transition-all">
                                    {/* Card Header */}
                                    <div className="px-4 py-3 bg-rams-bg border-b border-rams-rule-light flex justify-between items-center">
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
                                                className="w-3.5 h-3.5 rounded-sm border-rams-rule bg-rams-bg accent-rams-orange focus:ring-0 cursor-pointer"
                                            />
                                            <div>
                                                <div className="font-bold text-rams-ink">{req.employees?.nickname || req.employees?.name}</div>
                                                <div className="text-[9px] text-rams-ink-muted font-mono font-bold uppercase tracking-widest">{req.employees?.position || 'พนักงาน'}</div>
                                            </div>
                                        </div>
                                        <Badge color={req.status === 'approved' ? 'emerald' : req.status === 'rejected' ? 'rose' : 'amber'}>
                                            {req.status === 'approved' ? 'อนุมัติแล้ว' : req.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รออนุมัติ'}
                                        </Badge>
                                    </div>
                                    
                                    {/* Card Body */}
                                    <div className="p-4 flex-1 space-y-3 text-xs text-rams-ink">
                                        {isEditing ? (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">วันที่เริ่มลา</label>
                                                        <input 
                                                            type="date"
                                                            value={leaveForm.startDate}
                                                            onChange={e => setLeaveForm({ 
                                                                ...leaveForm, 
                                                                startDate: e.target.value,
                                                                endDate: leaveForm.endDate < e.target.value ? e.target.value : leaveForm.endDate 
                                                            })}
                                                            className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">วันสิ้นสุด</label>
                                                        <input 
                                                            type="date"
                                                            value={leaveForm.endDate}
                                                            onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                                                            className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule"
                                                            min={leaveForm.startDate}
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">ประเภท</label>
                                                    <select
                                                        value={leaveForm.leave_type}
                                                        onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                                                        className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule cursor-pointer"
                                                    >
                                                        <option value="sick">ลาป่วย 😷</option>
                                                        <option value="business">ลากิจ 💼</option>
                                                        <option value="vacation">พักร้อน 🏖️</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">คนแทน</label>
                                                    <select
                                                        value={leaveForm.replacement_employee_id}
                                                        onChange={e => setLeaveForm({ ...leaveForm, replacement_employee_id: e.target.value })}
                                                        className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule cursor-pointer"
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
                                                    <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">เหตุผล</label>
                                                    <input 
                                                        type="text"
                                                        value={leaveForm.reason}
                                                        onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                                                        className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-sans text-rams-ink bg-rams-bg outline-none focus:border-rams-rule"
                                                        placeholder="ระบุเหตุผล"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">วันที่ลา:</span>
                                                    <span className="font-mono text-xs font-bold text-rams-ink">
                                                        {req.leave_date ? format(parseISO(req.leave_date), 'dd/MM/yyyy') : '-'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">ประเภท:</span>
                                                    <span className="font-bold text-rams-ink text-xs">
                                                        {req.leave_type === 'sick' ? 'ลาป่วย 😷' : req.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">ปฏิบัติงานแทนโดย:</span>
                                                    <span className="font-bold text-rams-ink text-xs">
                                                        {req.replacement_employee ? `${req.replacement_employee.name} (${req.replacement_employee.nickname || "-"})` : '-'}
                                                    </span>
                                                </div>
                                                <div className="pt-1 border-t border-rams-rule-light mt-1">
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted block mb-0.5 uppercase tracking-widest">เหตุผลการลา:</span>
                                                    <span className="text-rams-ink italic block text-xs">&ldquo;{req.reason || '-'}&rdquo;</span>
                                                </div>
                                                {req.status === 'approved' && (() => {
                                                    const isRequesterOff = transactions.some(t => t.employee_id === req.employee_id && t.date === req.leave_date && t.is_off);
                                                    const isReplacementScheduled = req.replacement_employee_id 
                                                        ? transactions.some(t => t.employee_id === req.replacement_employee_id && t.date === req.leave_date && !t.is_off)
                                                        : false;
                                                    return (
                                                        <div className="mt-2 p-2 bg-rams-green/5 rounded-sm border border-rams-green/20 flex flex-col gap-1 text-[10px] text-rams-green font-mono font-bold uppercase tracking-wider">
                                                            <div className="flex items-center gap-1">
                                                                <span>{isRequesterOff ? '✅' : '❌'}</span>
                                                                <span>พนักงานลาหยุด: {isRequesterOff ? 'บันทึกวันหยุด (OFF) แล้ว' : 'ยังไม่ได้บันทึกวันหยุด'}</span>
                                                            </div>
                                                            {req.replacement_employee_id && (
                                                                <div className="flex items-center gap-1">
                                                                    <span>{isReplacementScheduled ? '✅' : '❌'}</span>
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
                                    <div className="px-4 py-3 bg-rams-bg border-t border-rams-rule-light flex justify-end gap-2">
                                        {isEditing ? (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={() => setEditingLeaveId(null)}
                                                    className="px-3 py-1.5 bg-rams-bg hover:bg-rams-ink-muted/10 border border-rams-rule-light text-rams-ink font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider transition-all cursor-pointer"
                                                >
                                                    ยกเลิก
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => saveLeaveEdit(req.id)}
                                                    className="px-3 py-1.5 bg-rams-orange text-rams-panel font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                                                >
                                                    บันทึก
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={() => startEditLeave(req)}
                                                    className="px-3 py-1.5 bg-rams-bg hover:bg-rams-ink-muted/10 border border-rams-rule-light text-rams-ink font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider transition-all cursor-pointer"
                                                >
                                                    แก้ไขข้อมูล
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => handleDeleteLeaveRequest(req)}
                                                    className="px-3 py-1.5 bg-rams-red/10 hover:bg-rams-red/20 text-rams-red border border-rams-red/20 font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                                    title="ลบคำขอลาหยุด"
                                                >
                                                    🗑️ ลบใบลา
                                                </button>
                                                {req.status === 'pending' && (
                                                    <>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleApproveAndSyncLeave(req)}
                                                            className="px-3 py-1.5 bg-rams-green text-rams-panel font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-green/90 active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
                                                        >
                                                            อนุมัติ & ซิงค์
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleRejectLeave(req)}
                                                            className="px-3 py-1.5 bg-rams-red text-rams-panel font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-red/90 active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                                                        >
                                                            ปฏิเสธ
                                                        </button>
                                                    </>
                                                )}
                                                {req.status === 'approved' && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleResetLeaveStatus(req)}
                                                        className="px-3 py-1.5 bg-rams-amber text-rams-panel font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-amber/90 active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
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

            {/* Edit Cell Modal */}
            {editingCell && (
                <div className="fixed inset-0 bg-rams-ink/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
                    <div className="bg-rams-panel border border-rams-rule rounded-sm w-full max-w-md overflow-hidden shadow-none flex flex-col">
                        <div className="px-6 py-4 border-b border-rams-rule-light flex justify-between items-center bg-rams-bg/30">
                            <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-rams-ink">
                                จัดตาราง: {editingCell.employee.nickname} <br/>
                                <span className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-widest block mt-0.5">{format(editingCell.date, 'dd MMM yyyy')}</span>
                            </h3>
                        </div>
                        
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto bg-rams-panel custom-scrollbar">
                            {(() => {
                                const dateStr = format(editingCell.date, 'yyyy-MM-dd');
                                const cellLeaves = leaveRequests.filter(l => l.employee_id === editingCell.employee.id && l.leave_date === dateStr);
                                if (cellLeaves.length === 0) return null;
                                return (
                                    <div className="space-y-3 mb-2">
                                        {cellLeaves.map((l, idx) => (
                                            <div key={idx} className="bg-rams-amber/10 border border-rams-rule-light rounded-sm p-4 space-y-2 text-xs text-rams-ink shadow-none font-sans">
                                                <div className="font-mono font-bold uppercase tracking-wider text-[10px] text-rams-ink flex justify-between items-center">
                                                    <span className="flex items-center gap-1">📌 ข้อมูลการลาหยุดวันนี้</span>
                                                    <Badge color={l.status === 'approved' ? 'emerald' : l.status === 'rejected' ? 'rose' : 'amber'}>
                                                        {l.status === 'approved' ? 'อนุมัติแล้ว' : l.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รออนุมัติ'}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-1 font-mono text-[10px] text-rams-ink-muted uppercase tracking-wider">
                                                    <div><strong>ประเภท:</strong> {l.leave_type === 'sick' ? 'ลาป่วย 😷' : l.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'}</div>
                                                    <div><strong>คนปฏิบัติแทน:</strong> {l.replacement_employee ? (l.replacement_employee.nickname || l.replacement_employee.name) : '-'}</div>
                                                </div>
                                                <div className="mt-1 font-sans text-xs text-rams-ink"><strong>เหตุผล:</strong> {l.reason || '-'}</div>
                                                
                                                <div className="flex gap-2 pt-1 border-t border-rams-rule-light mt-2">
                                                    {l.status === 'pending' && (
                                                        <>
                                                            <button 
                                                                type="button"
                                                                onClick={async () => {
                                                                    await handleApproveAndSyncLeave(l);
                                                                    setEditingCell(null);
                                                                }}
                                                                className="px-3 py-1.5 bg-rams-green text-rams-panel font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-green/90 active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
                                                            >
                                                                อนุมัติและปรับตารางเวร
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={async () => {
                                                                    await handleRejectLeave(l);
                                                                    setEditingCell(null);
                                                                }}
                                                                className="px-3 py-1.5 bg-rams-red text-rams-panel font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-red/90 active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
                                                            >
                                                                ปฏิเสธคำขอลา
                                                            </button>
                                                        </>
                                                    )}
                                                    {l.status === 'approved' && (
                                                        <button 
                                                            type="button"
                                                            onClick={async () => {
                                                                await handleResetLeaveStatus(l);
                                                                setEditingCell(null);
                                                            }}
                                                            className="px-3 py-1.5 bg-rams-bg border border-rams-rule-light text-rams-ink-muted font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider hover:bg-rams-ink-muted/10 cursor-pointer transition-all"
                                                        >
                                                            ยกเลิกการอนุมัติ (กลับเป็นรออนุมัติ)
                                                        </button>
                                                    )}
                                                    <button 
                                                        type="button"
                                                        onClick={async () => {
                                                            await handleDeleteLeaveRequest(l);
                                                            setEditingCell(null);
                                                        }}
                                                        className="px-3 py-1.5 bg-rams-red/10 hover:bg-rams-red/20 text-rams-red border border-rams-red/20 font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider cursor-pointer transition-all"
                                                    >
                                                        🗑️ ลบใบลา
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                            {editingCell.slots.map((slot, index) => (
                                <div key={index} className="bg-rams-panel p-4 rounded-sm border border-rams-rule-light shadow-none space-y-3 relative">
                                    <div className="flex justify-between items-center mb-2">
                                        <select 
                                            value={slot.slot_type}
                                            onChange={e => handleSlotChange(index, 'slot_type', e.target.value)}
                                            className="text-[10px] font-mono font-bold uppercase bg-rams-bg text-rams-ink px-2 py-1 rounded-sm border border-rams-rule-light outline-none cursor-pointer"
                                        >
                                            <option value="MAIN">Main Shift</option>
                                            <option value="SPLIT">Split Shift</option>
                                            <option value="OVERTIME">Overtime</option>
                                        </select>
                                        <button onClick={() => removeSlot(index)} className="text-rams-red hover:text-rams-red/80 transition-colors cursor-pointer">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    
                                    <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-rams-red bg-rams-red/5 p-2 rounded-sm border border-rams-red/20 cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={slot.is_off}
                                            onChange={e => handleSlotChange(index, 'is_off', e.target.checked)}
                                            className="w-3.5 h-3.5 rounded-sm border-rams-red/30 bg-rams-bg accent-rams-red focus:ring-0 cursor-pointer"
                                        />
                                        วันหยุด (OFF)
                                    </label>
 
                                    {!slot.is_off && (
                                        <>
                                            <div>
                                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">เลือกกะสำเร็จรูป</label>
                                                <select 
                                                    value={slot.shift_id || ''}
                                                    onChange={e => handleSlotChange(index, 'shift_id', e.target.value)}
                                                    className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule cursor-pointer"
                                                >
                                                    <option value="">-- กะกำหนดเอง (Custom) --</option>
                                                    {shifts.map(sh => (
                                                        <option key={sh.id} value={sh.id}>{sh.name} ({sh.start_time.slice(0,5)} - {sh.end_time.slice(0,5)})</option>
                                                    ))}
                                                </select>
                                            </div>
 
                                            {!slot.shift_id && (
                                                <div className="space-y-2 border-t border-rams-rule-light pt-2">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">เวลาเริ่ม</label>
                                                            <input 
                                                                type="time" 
                                                                value={slot.custom_start_time || ''}
                                                                onChange={e => handleSlotChange(index, 'custom_start_time', e.target.value)}
                                                                className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">เวลาเลิก</label>
                                                            <input 
                                                                type="time" 
                                                                value={slot.custom_end_time || ''}
                                                                onChange={e => handleSlotChange(index, 'custom_end_time', e.target.value)}
                                                                className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none"
                                                            />
                                                        </div>
                                                    </div>
 
                                                    {slot.custom_start_time && slot.custom_end_time && (
                                                        <button 
                                                            type="button"
                                                            onClick={() => openPresetModal(slot.custom_start_time, slot.custom_end_time)}
                                                            className="text-[10px] font-mono font-bold text-rams-orange hover:text-rams-orange-active uppercase tracking-wider flex items-center gap-1 mt-1 transition-colors cursor-pointer"
                                                        >
                                                            💾 บันทึกเป็น Preset ({slot.custom_start_time} - {slot.custom_end_time})
                                                        </button>
                                                    )}
 
                                                    {allPresets.length > 0 && (
                                                        <div className="mt-3">
                                                            <label className="block text-[9px] font-mono font-bold text-rams-ink uppercase tracking-widest mb-1.5">⚡ Preset เวลามาตรฐาน & ที่บันทึกไว้:</label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {allPresets.map((preset, pIdx) => {
                                                                    const pc = getPresetColor(preset.color);
                                                                    const isCustom = customPresets.some(cp => (cp.start || '').slice(0,5) === (preset.start || '').slice(0,5) && (cp.end || '').slice(0,5) === (preset.end || '').slice(0,5));
                                                                    return (
                                                                        <div 
                                                                            key={pIdx}
                                                                            className={`flex items-center gap-1.5 px-2.5 py-1 ${pc.bg} hover:bg-opacity-90 ${pc.text} rounded-sm text-[10px] font-mono font-bold cursor-pointer border ${pc.border} transition-all uppercase tracking-wider`}
                                                                            onClick={() => {
                                                                                handleSlotChange(index, 'custom_start_time', preset.start);
                                                                                handleSlotChange(index, 'custom_end_time', preset.end);
                                                                            }}
                                                                        >
                                                                            <span>{preset.icon || '⏰'}</span>
                                                                            <span>{preset.name || `${preset.start}-${preset.end}`}</span>
                                                                            <span className="opacity-60 text-[10px] font-semibold">({preset.start}-{preset.end})</span>
                                                                            {isCustom && (
                                                                                <button
                                                                                    type="button"
                                                                                    onClick={(e) => {
                                                                                        e.stopPropagation();
                                                                                        const customIdx = customPresets.findIndex(cp => (cp.start || '').slice(0,5) === (preset.start || '').slice(0,5) && (cp.end || '').slice(0,5) === (preset.end || '').slice(0,5));
                                                                                        if (customIdx >= 0) deleteCustomPreset(customIdx);
                                                                                    }}
                                                                                    className="opacity-50 hover:opacity-100 hover:text-rams-red ml-1 font-bold text-xs leading-none cursor-pointer"
                                                                                    title="ลบ"
                                                                                >
                                                                                    ×
                                                                                </button>
                                                                            )}
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))}
 
                            <button onClick={addSlot} className="w-full py-2 border border-dashed border-rams-rule-light rounded-sm text-rams-ink-muted font-mono font-bold text-xs uppercase tracking-wider hover:bg-rams-bg transition-colors flex justify-center items-center gap-2 cursor-pointer">
                                <Plus size={16} /> เพิ่มกะในวันนี้ (Split Shift)
                            </button>
                        </div>
 
                        <div className="px-6 py-4 border-t border-rams-rule-light flex justify-end gap-3 bg-rams-bg/30 shrink-0">
                            <button 
                                onClick={() => setEditingCell(null)}
                                className="px-4 py-2 text-rams-ink hover:bg-rams-ink-muted/10 border border-rams-rule-light rounded-sm font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button 
                                onClick={saveCell}
                                disabled={saving}
                                className="px-4 py-2 bg-rams-orange text-rams-panel font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                            >
                                {saving ? 'กำลังบันทึก...' : <><Save size={16} /> บันทึก</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preset Creation Modal */}
            {presetModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-rams-ink/40 backdrop-blur-[2px] p-4">
                    <div className="bg-rams-panel border border-rams-rule rounded-sm w-full max-w-sm overflow-hidden shadow-none">
                        <div className="px-6 py-4 border-b border-rams-rule-light bg-rams-bg/30">
                            <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-rams-ink">✨ สร้าง Preset ใหม่</h3>
                            <p className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-widest block mt-0.5">เวลา: {presetModal.start} - {presetModal.end}</p>
                        </div>
                        <div className="px-6 py-5 space-y-5">
                            {/* Name */}
                            <div>
                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">ชื่อ Preset</label>
                                <input
                                    type="text"
                                    value={presetModal.name}
                                    onChange={e => setPresetModal(p => ({ ...p, name: e.target.value }))}
                                    placeholder={`เช่น กะพิเศษ, เปิดร้าน...`}
                                    className="w-full border border-rams-rule-light rounded-sm px-3 py-2 text-xs font-sans text-rams-ink bg-rams-bg outline-none focus:border-rams-rule"
                                />
                            </div>
                            {/* Icon */}
                            <div>
                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">เลือก Icon</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_ICONS.map(icon => (
                                        <button
                                            key={icon}
                                            type="button"
                                            onClick={() => setPresetModal(p => ({ ...p, icon }))}
                                            className={`w-9 h-9 rounded-sm text-sm flex items-center justify-center border transition-all cursor-pointer ${
                                                presetModal.icon === icon
                                                    ? 'border-rams-rule bg-rams-ink text-rams-panel'
                                                    : 'border-rams-rule-light bg-rams-bg hover:border-rams-rule text-rams-ink'
                                            }`}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Color */}
                            <div>
                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">เลือกสี</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setPresetModal(p => ({ ...p, color: c.id }))}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[10px] font-mono font-bold border transition-all cursor-pointer ${c.bg} ${c.text} ${
                                                presetModal.color === c.id
                                                    ? `${c.border} border-rams-rule ring-1 ring-rams-rule`
                                                    : 'border-rams-rule-light hover:border-rams-rule'
                                            }`}
                                        >
                                            <span className={`w-2.5 h-2.5 rounded-sm ${c.dot}`}></span>
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Preview */}
                            <div>
                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">ตัวอย่าง</label>
                                {(() => {
                                    const pc = getPresetColor(presetModal.color);
                                    return (
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${pc.bg} ${pc.text} rounded-sm text-xs font-mono font-bold border ${pc.border} uppercase tracking-wider`}>
                                            <span>{presetModal.icon || '⏰'}</span>
                                            <span>{presetModal.name || `${presetModal.start}-${presetModal.end}`}</span>
                                            <span className="opacity-50 text-[10px] font-semibold">({presetModal.start}-{presetModal.end})</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-rams-rule-light flex justify-end gap-3 bg-rams-bg/30">
                            <button
                                onClick={() => setPresetModal(null)}
                                className="px-4 py-2 text-rams-ink hover:bg-rams-ink-muted/10 border border-rams-rule-light rounded-sm font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmSavePreset}
                                className="px-5 py-2 bg-rams-orange text-rams-panel font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                            >
                                💾 บันทึก Preset
                            </button>
                        </div>
                    </div>
                </div>
            )}
 
            {/* Employee Status & Leave Adjuster Modal */}
            {adjustingEmpModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-rams-ink/40 backdrop-blur-[2px] p-4">
                    <div className="bg-rams-panel border border-rams-rule rounded-sm w-full max-w-lg overflow-hidden shadow-none flex flex-col max-h-[90vh]">
                        <div className="px-6 py-4 border-b border-rams-rule-light bg-rams-bg/30 flex justify-between items-center">
                            <div>
                                <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-rams-ink flex items-center gap-2">
                                    ⚙️ ปรับสถานะ & วันพักงาน/พักร้อน
                                </h3>
                                <p className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-widest block mt-0.5">
                                    {adjustingEmpModal.emp.name} ({adjustingEmpModal.emp.nickname || 'ไม่มีชื่อเล่น'}) - {adjustingEmpModal.emp.position || 'พนักงาน'}
                                </p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setAdjustingEmpModal(null)}
                                className="text-rams-ink-muted hover:text-rams-ink font-mono text-sm"
                            >
                                ✕
                            </button>
                        </div>

                        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar bg-rams-panel flex-1">
                            {/* Section 1: Main Status */}
                            <div className="bg-rams-bg p-4 border border-rams-rule-light rounded-sm space-y-4">
                                <h4 className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider flex items-center gap-1.5">
                                    👤 สถานะการทำงานของพนักงาน (Employment Status)
                                </h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">
                                            สถานะการจ้างงาน
                                        </label>
                                        <select
                                            value={adjustingEmpModal.employment_status}
                                            onChange={e => setAdjustingEmpModal(prev => ({ ...prev, employment_status: e.target.value }))}
                                            className="w-full p-2 rounded-sm border border-rams-rule-light bg-rams-panel text-xs font-mono text-rams-ink outline-none focus:border-rams-rule cursor-pointer"
                                        >
                                            <option value="Fulltime">Fulltime (ประจำ)</option>
                                            <option value="Probation">Probation (ทดลองงาน)</option>
                                            <option value="Contract">Contract (สัญญาจ้าง / Part-time)</option>
                                            <option value="Suspended">🛑 Suspended (พักงาน)</option>
                                            <option value="Vacation">🏖️ Vacation (พักร้อน)</option>
                                            <option value="Resigned">Resigned (ลาออก)</option>
                                        </select>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">
                                            สถานะบัญชี (Account Active)
                                        </label>
                                        <label className="flex items-center gap-2 p-2 border border-rams-rule-light bg-rams-panel rounded-sm cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={adjustingEmpModal.is_active}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, is_active: e.target.checked }))}
                                                className="w-4 h-4 rounded-sm border-rams-rule bg-rams-bg accent-rams-green focus:ring-0 cursor-pointer"
                                            />
                                            <span className={`text-xs font-mono font-bold ${adjustingEmpModal.is_active ? 'text-rams-green' : 'text-rams-red'}`}>
                                                {adjustingEmpModal.is_active ? '✅ เปิดใช้งาน (Active)' : '🛑 ระงับบัญชี (Inactive / พักงาน)'}
                                            </span>
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Section 2: Create Leave or Suspension Range */}
                            <div className="bg-rams-bg p-4 border border-rams-rule-light rounded-sm space-y-4">
                                <label className="flex items-center justify-between cursor-pointer select-none">
                                    <span className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider flex items-center gap-1.5">
                                        📅 บันทึกวันพักงาน / พักร้อน / วันลา เข้าสู่ระบบ
                                    </span>
                                    <input
                                        type="checkbox"
                                        checked={adjustingEmpModal.createLeave}
                                        onChange={e => setAdjustingEmpModal(prev => ({ ...prev, createLeave: e.target.checked }))}
                                        className="w-4 h-4 rounded-sm border-rams-rule bg-rams-bg accent-rams-orange focus:ring-0 cursor-pointer"
                                    />
                                </label>

                                {adjustingEmpModal.createLeave && (
                                    <div className="space-y-4 pt-2 border-t border-rams-rule-light">
                                        <div>
                                            <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">
                                                ประเภทการพัก/ลา
                                            </label>
                                            <select
                                                value={adjustingEmpModal.leave_type}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, leave_type: e.target.value }))}
                                                className="w-full p-2 rounded-sm border border-rams-rule-light bg-rams-panel text-xs font-mono text-rams-ink outline-none focus:border-rams-rule cursor-pointer"
                                            >
                                                <option value="vacation">🏖️ พักร้อน (Vacation)</option>
                                                <option value="suspension">🛑 พักงาน (Suspension)</option>
                                                <option value="sick">😷 ลาป่วย (Sick Leave)</option>
                                                <option value="business">💼 ลากิจ (Business Leave)</option>
                                            </select>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">
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
                                                    className="w-full p-2 rounded-sm border border-rams-rule-light bg-rams-panel text-xs font-mono text-rams-ink outline-none focus:border-rams-rule"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">
                                                    วันที่สิ้นสุด
                                                </label>
                                                <input
                                                    type="date"
                                                    value={adjustingEmpModal.endDate}
                                                    min={adjustingEmpModal.startDate}
                                                    onChange={e => setAdjustingEmpModal(prev => ({ ...prev, endDate: e.target.value }))}
                                                    className="w-full p-2 rounded-sm border border-rams-rule-light bg-rams-panel text-xs font-mono text-rams-ink outline-none focus:border-rams-rule"
                                                />
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">
                                                พนักงานปฏิบัติงานแทน (Optional)
                                            </label>
                                            <select
                                                value={adjustingEmpModal.replacement_employee_id}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, replacement_employee_id: e.target.value }))}
                                                className="w-full p-2 rounded-sm border border-rams-rule-light bg-rams-panel text-xs font-mono text-rams-ink outline-none focus:border-rams-rule cursor-pointer"
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
                                            <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">
                                                เหตุผล / หมายเหตุ
                                            </label>
                                            <input
                                                type="text"
                                                value={adjustingEmpModal.reason}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, reason: e.target.value }))}
                                                placeholder="เช่น พักงานทางวินัย 3 วัน, ลาพักร้อนประจำปี..."
                                                className="w-full p-2 rounded-sm border border-rams-rule-light bg-rams-panel text-xs font-sans text-rams-ink outline-none focus:border-rams-rule"
                                            />
                                        </div>

                                        <label className="flex items-center gap-2 pt-1 cursor-pointer select-none">
                                            <input
                                                type="checkbox"
                                                checked={adjustingEmpModal.autoSyncRoster}
                                                onChange={e => setAdjustingEmpModal(prev => ({ ...prev, autoSyncRoster: e.target.checked }))}
                                                className="w-3.5 h-3.5 rounded-sm border-rams-rule bg-rams-bg accent-rams-orange focus:ring-0 cursor-pointer"
                                            />
                                            <span className="text-xs font-mono font-bold text-rams-ink">
                                                🔄 ปรับตั้งค่าในตารางเวร Roster เป็นวันหยุด (OFF) โดยอัตโนมัติ
                                            </span>
                                        </label>
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="px-6 py-4 border-t border-rams-rule-light flex justify-end gap-3 bg-rams-bg/30 shrink-0">
                            <button
                                type="button"
                                onClick={() => setAdjustingEmpModal(null)}
                                className="px-4 py-2 text-rams-ink hover:bg-rams-ink-muted/10 border border-rams-rule-light rounded-sm font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button
                                type="button"
                                onClick={handleSaveAdjustingEmp}
                                disabled={saving}
                                className="px-5 py-2 bg-rams-orange text-rams-panel font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[1px] active:shadow-none transition-all cursor-pointer flex items-center gap-2"
                            >
                                {saving ? 'กำลังบันทึก...' : <><Save size={16} /> บันทึกการเปลี่ยนแปลง</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
            {/* End Employee Status Adjuster Modal */}
        </div>
    );
}

const getShiftColorClass = (s, shiftObj) => {
    if (s.is_off) return 'bg-red-50 border-red-200 text-red-700';

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
