"use client";
import React, { useEffect, useState, useMemo, useReducer } from "react";
import { supabase } from "../../lib/supabaseClient";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import { format, parseISO, startOfMonth, endOfMonth, differenceInMinutes, startOfWeek, addDays, subDays } from "date-fns";
import { th } from "date-fns/locale";
import * as XLSX from 'xlsx';
import { calculatePayroll } from "../../utils/payroll";
import { getEffectiveDailyRoster } from "../../utils/roster_logic";
import { formatDate, formatCurrency, formatTime } from "../../utils/format";

// --- Nendo UI Kit ---
import { Card } from "./_components/ui/Card";
import { Badge } from "./_components/ui/Badge";
import { TabButton } from "./_components/ui/TabButton";
import { Icons } from "./_components/ui/HausIcon";
import { LongPressButton } from "./_components/ui/LongPressButton";
import StaffModal from "./StaffModal";
import StaffDirectoryManager from "./_components/StaffDirectoryManager";
import YuzuKnowledgeManager from "./_components/YuzuKnowledgeManager";
import DashboardOverview from "./_components/DashboardOverview";
import IndividualHistoryManager from "./_components/IndividualHistoryManager";
import NfcStationManager from "./_components/NfcStationManager";
import MeetingNotesManager from "./_components/MeetingNotesManager";
import { useAdminAuth } from "./AdminAuthContext";

// --- Reducer for Cleaner State ---
const initialState = {
    logs: [],
    employees: [],
    pendingEmployees: [],
    shifts: [],
    schedules: {},
    leaveRequests: [],
    jobApplications: [],
    swapRequests: [],
    rosterOverrides: [],
    transactions: [],
    announcements: [],
    payrollConfig: { ot_rate: 60, double_shift_rate: 1000 },
    deductions: [],
    // Individual History
    individualLogs: [],
    individualStats: { work_days: 0, late: 0, absent: 0 }
};

function dataReducer(state, action) {
    switch (action.type) {
        case 'SET_DATA': return { ...state, ...action.payload };
        // Optimistic Updates
        case 'UPDATE_SCHEDULE': {
            const { empId, day, schedule } = action.payload;
            const newSchedules = { ...state.schedules };
            if (!newSchedules[empId]) newSchedules[empId] = {};
            newSchedules[empId][day] = schedule;
            return { ...state, schedules: newSchedules };
        }
        default: return state;
    }
}

export default function AdminDashboard() {
    const { user, signOut } = useAdminAuth();
    const [activeTab, setActiveTab] = useState("dashboard");
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
    const [data, dispatch] = useReducer(dataReducer, initialState);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    useEffect(() => {
        try {
            const stored = typeof window !== "undefined" ? localStorage.getItem("dismissed_draft_weeks") : null;
            if (stored) {
                setDismissedDraftWeeks(JSON.parse(stored));
            }
        } catch (e) {
            console.warn("Storage access restricted or unavailable:", e);
        }
    }, []);



    // UI Local State
    const [leaveStatusFilter, setLeaveStatusFilter] = useState("all");
    const [leaveShowAllMonths, setLeaveShowAllMonths] = useState(false);
    const [leaveSearchQuery, setLeaveSearchQuery] = useState("");
    const [selectedLeaveIds, setSelectedLeaveIds] = useState([]);

    const [showStaffModal, setShowStaffModal] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [selectedEmpId, setSelectedEmpId] = useState("ALL");
    const [expandedPayrollRow, setExpandedPayrollRow] = useState(null);
    const [showDeductModal, setShowDeductModal] = useState(false);
    const [deductForm, setDeductForm] = useState({ empId: "", amount: "", isPercent: false, reason: "" });
    const [newAnnouncement, setNewAnnouncement] = useState("");
    const [announcementType, setAnnouncementType] = useState("fixed"); // fixed or temporary
    const [expiresAt, setExpiresAt] = useState("");
    const [announcementFilter, setAnnouncementFilter] = useState("active");
    const [editingAnnouncement, setEditingAnnouncement] = useState(null); // for edit modal
    const [announcementPriority, setAnnouncementPriority] = useState(1);
    const [showAllLogs, setShowAllLogs] = useState(false);
    const [dismissedDraftWeeks, setDismissedDraftWeeks] = useState([]);


    // Admin Leave Creation State
    const [showAdminLeaveModal, setShowAdminLeaveModal] = useState(false);
    const [adminLeaveForm, setAdminLeaveForm] = useState({
        empId: "",
        startDate: format(new Date(), "yyyy-MM-dd"),
        endDate: format(new Date(), "yyyy-MM-dd"),
        type: "sick",
        reason: "",
        replacementId: "",
        status: "approved"
    });
    const [adminLeaveLoading, setAdminLeaveLoading] = useState(false);

    // Manual Entry State
    const [showManualModal, setShowManualModal] = useState(false);
    const [manualForm, setManualForm] = useState({
        empId: "",
        type: "check_in",
        date: format(new Date(), "yyyy-MM-dd"),
        time: format(new Date(), "HH:mm")
    });

    // --- Helper Fetchers ---
    const fetchData = async (table, keyInState, transform = null) => {
        let query = supabase.from(table).select("*");
        if (table === 'leave_requests') {
            query = supabase.from(table).select("*, employees!employee_id(name, nickname, position, photo_url), replacement_employee:employees!replacement_employee_id(name, nickname, position, photo_url)");
        }
        const { data: res } = await query.order("id");
        dispatch({ type: 'SET_DATA', payload: { [keyInState]: transform ? transform(res) : res || [] } });
    };

    const fetchEmployees = () => supabase.from("employees").select("*").order("id")
        .then(({ data }) => dispatch({ type: 'SET_DATA', payload: { employees: data || [] } }));

    const fetchSchedules = async () => {
        const { data: scheds } = await supabase.from("employee_schedules").select("*, shifts(id, name, start_time, end_time)");
        const map = {};
        scheds?.forEach(s => {
            if (!map[s.employee_id]) map[s.employee_id] = {};
            map[s.employee_id][s.day_of_week] = s;
        });
        dispatch({ type: 'SET_DATA', payload: { schedules: map } });
    };

    const fetchTransactions = async () => {
        const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
        const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();
        const { data: txs } = await supabase.from("roster_transactions")
            .select("*, shifts(id, name, start_time, end_time)")
            .gte("date", startDate.split('T')[0])
            .lte("date", endDate.split('T')[0]);
        dispatch({ type: 'SET_DATA', payload: { transactions: txs || [] } });
    };

    const fetchLogs = async () => {
        const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
        const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();
        const { data: logs } = await supabase.from("attendance_logs")
            .select("*, employees(name)")
            .gte("timestamp", startDate)
            .lte("timestamp", endDate)
            .order("timestamp", { ascending: false });
        dispatch({ type: 'SET_DATA', payload: { logs: logs || [] } });
    };

    const fetchIndividualLogs = async () => {
        if (selectedEmpId === 'ALL') return;
        const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
        const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();
        const { data: logs } = await supabase.from("attendance_logs")
            .select("*, employees(name)")
            .eq("employee_id", selectedEmpId)
            .gte("timestamp", startDate)
            .lte("timestamp", endDate)
            .order("timestamp", { ascending: false });

        dispatch({ type: 'SET_DATA', payload: { individualLogs: logs || [] } });

        // Calcs
        let late = 0, absent = 0;
        const workDaysSet = new Set();
        logs?.forEach(l => {
            if (l.action_type === 'absent') absent++;
            else if (l.action_type === 'check_in') {
                workDaysSet.add(l.timestamp.split('T')[0]);
                const status = getShiftStatus(l);
                if (status.label.includes('Late')) late++;
            }
        });
        dispatch({ type: 'SET_DATA', payload: { individualStats: { work_days: workDaysSet.size, late, absent } } });
    };

    // --- Tab-based Lazy Loading ---
    useEffect(() => {
        fetchData('shifts', 'shifts');
        fetchEmployees();
        fetchSchedules();
        supabase.from('payroll_config').select('*').then(({ data }) => {
            const config = { ot_rate: 60, double_shift_rate: 1000 };
            data?.forEach(item => config[item.key] = item.value);
            dispatch({ type: 'SET_DATA', payload: { payrollConfig: config } });
        });
    }, []);

    useEffect(() => {
        setSelectedLeaveIds([]);
        if (activeTab === 'dashboard') {
            fetchLogs();
            fetchTransactions();
            fetchData('leave_requests', 'leaveRequests');
            fetchData('job_applications', 'jobApplications');
            supabase.from('shift_swap_requests').select('*, requester:employees!requester_id(name, position), peer:employees!target_peer_id(name), shift:shifts!old_shift_id(name, start_time, end_time)').order('created_at', { ascending: false })
                .then(({ data }) => dispatch({ type: 'SET_DATA', payload: { swapRequests: data || [] } }));
            supabase.from("employees").select("*").eq("is_active", false).order("created_at", { ascending: false })
                .then(({ data }) => dispatch({ type: 'SET_DATA', payload: { pendingEmployees: data || [] } }));
        }
        if (activeTab === 'payroll') { fetchLogs(); fetchData('payroll_deductions', 'deductions'); fetchTransactions(); }
        if (activeTab === 'roster') { fetchSchedules(); fetchData('roster_overrides', 'rosterOverrides'); }
        if (activeTab === 'requests') fetchData('leave_requests', 'leaveRequests');
        if (activeTab === 'shift_manage') {
            supabase.from('shift_swap_requests').select('*, requester:employees!requester_id(name, position), peer:employees!target_peer_id(name), shift:shifts!old_shift_id(name, start_time, end_time)').order('created_at', { ascending: false })
                .then(({ data }) => dispatch({ type: 'SET_DATA', payload: { swapRequests: data || [] } }));
            fetchData('roster_overrides', 'rosterOverrides');
        }
        if (activeTab === 'announcements') fetchData('announcements', 'announcements');
        if (activeTab === 'applications') fetchData('job_applications', 'jobApplications');
        if (activeTab === 'history') {
            fetchTransactions();
            fetchData('leave_requests', 'leaveRequests');
            fetchIndividualLogs();
        }
    }, [activeTab, selectedMonth]);

    useEffect(() => {
        if (activeTab === 'history' && selectedEmpId !== 'ALL') fetchIndividualLogs();
    }, [selectedEmpId]);

    // Realtime Sync for Admin Dashboard
    useRealtimeSync(['attendance_logs', 'leave_requests', 'shift_swap_requests', 'roster_transactions', 'announcements'], () => {
        if (activeTab === 'dashboard') {
            fetchLogs();
            fetchTransactions();
            fetchData('leave_requests', 'leaveRequests');
        } else if (activeTab === 'payroll') {
            fetchLogs();
            fetchTransactions();
        } else if (activeTab === 'requests') {
            fetchData('leave_requests', 'leaveRequests');
        } else if (activeTab === 'announcements') {
            fetchData('announcements', 'announcements');
        } else if (activeTab === 'history') {
            fetchIndividualLogs();
        }
    }, [activeTab, selectedMonth, selectedEmpId]);

    // --- Payroll Memoization ---
    const payrollData = useMemo(() => {
        if (!data.employees.length) return [];
        const flatSchedules = [];
        if (data.schedules) {
            Object.values(data.schedules).forEach(empScheds => {
                if (empScheds) {
                    Object.values(empScheds).forEach(s => {
                        if (s) flatSchedules.push(s);
                    });
                }
            });
        }
        // No draft stage (owner, 2026-11-25): every roster row counts
        return calculatePayroll(
            data.employees, data.logs, data.transactions || [], data.shifts,
            data.payrollConfig, data.deductions, selectedMonth,
            flatSchedules
        );
    }, [data.employees, data.logs, data.transactions, data.shifts, data.payrollConfig, data.deductions, selectedMonth, data.schedules]);


    // --- Actions ---
    // --- Actions ---
    const handleFinalizeDay = async () => {
        const dateStr = prompt("Enter date to finalize (YYYY-MM-DD). Leave empty for today:", format(new Date(), "yyyy-MM-dd"));
        if (dateStr === null) return; // Cancel

        const url = dateStr ? `/api/finalize-day?date=${dateStr}` : '/api/finalize-day';
        await fetch(url, { method: 'POST' }).then(r => r.json()).then(d => alert(d.message));
        fetchLogs();
    };

    const handleManualSubmit = async () => {
        if (!manualForm.empId || !manualForm.date || !manualForm.time) return alert("Please fill all fields");

        try {
            // Construct Timestamp
            const dateTimeStr = `${manualForm.date}T${manualForm.time}:00`;
            const timestamp = new Date(dateTimeStr).toISOString();

            // Insert Log
            const { error } = await supabase.from('attendance_logs').insert({
                employee_id: manualForm.empId,
                action_type: manualForm.type,
                timestamp: timestamp,
                photo_url: null, // Manual entry usually has no photo
                mood_status: 'Manual By Admin'
            });

            if (error) throw error;

            alert("Manual Entry Success");
            setShowManualModal(false);
            fetchLogs(); // Refresh
        } catch (e) {
            alert("Error: " + e.message);
        }
    };

    const handleNotify = async (api) => { if (confirm("Send?")) await fetch(api, { method: 'POST' }); };

    const handleDeleteLog = async (logId) => {
        if (!confirm("Are you sure you want to delete this activity log?")) return;

        const { error } = await supabase.from('attendance_logs').delete().eq('id', logId);
        if (error) {
            alert("Error deleting log: " + error.message);
        } else {
            fetchLogs();
            alert("Log deleted successfully");
        }
    };

    const handleToggleLogAction = async (log) => {
        const newAction = log.action_type === 'check_in' ? 'check_out' : 'check_in';
        const actionName = newAction === 'check_out' ? 'CHECK OUT (ออกงาน)' : 'CHECK IN (เข้างาน)';
        if (!confirm(`ต้องการเปลี่ยนสถานะของ ${log.employees?.name || 'พนักงาน'} (${formatTime(log.timestamp)}) เป็น "${actionName}" หรือไม่?`)) return;

        const { error } = await supabase.from('attendance_logs').update({ action_type: newAction }).eq('id', log.id);
        if (error) {
            alert("Error updating log: " + error.message);
        } else {
            fetchLogs();
            alert(`แก้ไขสถานะเป็น ${actionName} สำเร็จ`);
        }
    };

    // Roster Action
    const handleUpdateSchedule = async (empId, day, shiftId, isOff) => {
        // Optimistic Update
        const optimisticSchedule = { employee_id: empId, day_of_week: day, shift_id: isOff ? null : shiftId, is_off: isOff };
        dispatch({ type: 'UPDATE_SCHEDULE', payload: { empId, day, schedule: optimisticSchedule } });

        const { error } = await supabase.from("employee_schedules").upsert({
            employee_id: empId, day_of_week: day, shift_id: isOff ? null : shiftId, is_off: isOff
        }, { onConflict: 'employee_id, day_of_week' });

        if (error) {
            alert("Error updating schedule");
            fetchSchedules(); // Revert
        }
    };
    const handleNotifySchedule = async () => { if (confirm("ส่งตารางงานเข้า LINE?")) try { await fetch('/api/notify-schedule', { method: 'POST' }); alert("ส่งแล้ว"); } catch (e) { } };

    // Employee Action
    const handleDeleteEmployee = async (id) => {
        if (!confirm("This will PERMANENTLY delete this staff and all their history.\n\nAre you sure you want to completely remove them from the system so they can register again?")) return;

        try {
            // 1. Delete Attendance Logs
            const { error: err1 } = await supabase.from('attendance_logs').delete().eq('employee_id', id);
            if (err1) throw new Error("Attendance Logs: " + err1.message);

            // 2. Delete Schedules
            const { error: err2 } = await supabase.from('employee_schedules').delete().eq('employee_id', id);
            if (err2) throw new Error("Schedules: " + err2.message);

            // 3. Delete Leave Requests
            const { error: err3 } = await supabase.from('leave_requests').delete().eq('employee_id', id);
            if (err3) throw new Error("Leave Requests: " + err3.message);

            // 4. Delete Roster Overrides
            const { error: err4 } = await supabase.from('roster_overrides').delete().eq('employee_id', id);
            if (err4) throw new Error("Roster Overrides: " + err4.message);

            // 5. Delete Payroll Deductions
            const { error: err5 } = await supabase.from('payroll_deductions').delete().eq('employee_id', id);
            if (err5) throw new Error("Payroll Deductions: " + err5.message);

            // 6. Delete Shift Swap Requests (Both as requester and peer)
            const { error: err6a } = await supabase.from('shift_swap_requests').delete().eq('requester_id', id);
            if (err6a) throw new Error("Swap Requests (Requester): " + err6a.message);

            const { error: err6b } = await supabase.from('shift_swap_requests').delete().eq('target_peer_id', id);
            if (err6b) throw new Error("Swap Requests (Peer): " + err6b.message);

            // 7. Finally Delete Employee
            const { error: errFinal } = await supabase.from("employees").delete().eq("id", id);
            if (errFinal) throw new Error("Employee: " + errFinal.message);

            fetchEmployees();
            // Refresh pending list too
            supabase.from("employees").select("*").eq("is_active", false).order("created_at", { ascending: false })
                .then(({ data }) => dispatch({ type: 'SET_DATA', payload: { pendingEmployees: data || [] } }));

            alert("Staff deleted successfully!");

        } catch (error) {
            console.error(error);
            alert("Delete Failed: " + error.message);
        }
    };

    // Deduction Action
    const handleAddDeduction = async () => {
        if (!deductForm.empId || !deductForm.amount) return alert("Info missing");
        const { error } = await supabase.from('payroll_deductions').insert({ employee_id: deductForm.empId, month: selectedMonth, amount: deductForm.amount, is_percentage: deductForm.isPercent, reason: deductForm.reason });
        if (!error) { setShowDeductModal(false); fetchData('payroll_deductions', 'deductions'); }
    };

    // Swap Action
    const handleSwapDecision = async (id, action) => {
        if (!confirm(`Confirm ${action}?`)) return;
        await fetch('/api/shift-swap/approve', { method: 'POST', body: JSON.stringify({ request_id: id, action }), headers: { 'Content-Type': 'application/json' } });
        fetchData('shift_swap_requests', 'swapRequests');
    };

    // Requests Action
    const handleLeaveAction = async (req, newStatus) => {
        if (!confirm(`Confirm ${newStatus}?`)) return;
        const { error } = await supabase.from('leave_requests').update({ status: newStatus }).eq('id', req.id);
        if (!error) {
            if (newStatus === 'approved') {
                // 1. Mark leaving employee as OFF
                await supabase.from('roster_overrides').upsert({
                    employee_id: req.employee_id,
                    date: req.leave_date,
                    is_off: true
                });

                await supabase.from('roster_transactions').upsert({
                    employee_id: req.employee_id,
                    date: req.leave_date,
                    is_off: true,
                    slot_type: 'MAIN',
                    status: 'PUBLISHED'
                }, { onConflict: 'employee_id, date, slot_type' });

                // 2. If there is a replacement, assign the leaving employee's shift to them
                if (req.replacement_employee_id) {
                    let originalShiftId = null;
                    let originalStart = null;
                    let originalEnd = null;

                    // Query original shift from roster_transactions
                    const { data: tx } = await supabase
                        .from('roster_transactions')
                        .select('shift_id, custom_start_time, custom_end_time')
                        .eq('employee_id', req.employee_id)
                        .eq('date', req.leave_date)
                        .eq('slot_type', 'MAIN')
                        .eq('status', 'PUBLISHED')
                        .eq('is_off', false)
                        .maybeSingle();

                    if (tx && tx.shift_id) {
                        originalShiftId = tx.shift_id;
                        originalStart = tx.custom_start_time;
                        originalEnd = tx.custom_end_time;
                    } else {
                        // Fallback: Check template schedule
                        const dayOfWeek = (new Date(req.leave_date).getDay() + 6) % 7; // Map JS getDay() (0=Sun, 1=Mon) to DB day_of_week (0=Mon, 6=Sun)
                        const { data: sched } = await supabase
                            .from('employee_schedules')
                            .select('shift_id')
                            .eq('employee_id', req.employee_id)
                            .eq('day_of_week', dayOfWeek)
                            .eq('is_off', false)
                            .maybeSingle();

                        if (sched && sched.shift_id) {
                            originalShiftId = sched.shift_id;
                            const { data: shiftObj } = await supabase
                                .from('shifts')
                                .select('start_time, end_time')
                                .eq('id', sched.shift_id)
                                .single();
                            if (shiftObj) {
                                originalStart = shiftObj.start_time;
                                originalEnd = shiftObj.end_time;
                            }
                        }
                    }

                    if (originalShiftId) {
                        await supabase.from('roster_overrides').upsert({
                            employee_id: req.replacement_employee_id,
                            date: req.leave_date,
                            shift_id: originalShiftId,
                            is_off: false,
                            custom_start_time: originalStart,
                            custom_end_time: originalEnd
                        });

                        await supabase.from('roster_transactions').upsert({
                            employee_id: req.replacement_employee_id,
                            date: req.leave_date,
                            shift_id: originalShiftId,
                            is_off: false,
                            custom_start_time: originalStart,
                            custom_end_time: originalEnd,
                            slot_type: 'MAIN',
                            status: 'PUBLISHED'
                        }, { onConflict: 'employee_id, date, slot_type' });
                    }
                }
            }
            try {
                const repName = req.replacement_employee?.nickname || req.replacement_employee?.name || "";
                const notifyRes = await fetch('/api/notify-leave-status', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: req.employees?.name,
                        date: req.leave_date,
                        type: req.leave_type,
                        reason: req.reason,
                        status: newStatus,
                        replacementName: repName
                    }),
                    headers: { 'Content-Type': 'application/json' }
                });
                if (!notifyRes.ok) {
                    console.error("Failed to push notify line", await notifyRes.text());
                }
            } catch (e) { console.error("Line notify catch block:", e); }
            fetchData('leave_requests', 'leaveRequests');
        }
    };

    const handleDeleteLeaveRequest = async (req) => {
        const isConfirmed = confirm(`คุณต้องการลบใบลาของคุณ ${req.employees?.nickname || req.employees?.name || 'พนักงาน'} วันที่ ${req.leave_date} ใช่หรือไม่?`);
        if (!isConfirmed) return;

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

            alert("ลบข้อมูลใบลาและเคลียร์ตาราง Roster เรียบร้อยแล้ว!");
            setSelectedLeaveIds(prev => prev.filter(id => id !== req.id));
            
            // Refresh
            fetchData('leave_requests', 'leaveRequests');
            fetchTransactions();
        } catch (e) {
            alert("เกิดข้อผิดพลาดในการลบใบลา: " + e.message);
        }
    };

    const handleDeleteMultipleLeaves = async () => {
        const count = selectedLeaveIds.length;
        if (count === 0) return;
        
        const isConfirmed = confirm(`คุณต้องการลบใบลาที่เลือกทั้งหมด ${count} รายการใช่หรือไม่?`);
        if (!isConfirmed) return;

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

            alert(`ลบใบลาสำเร็จ ${idsToDelete.length} รายการ และเคลียร์ตาราง Roster เรียบร้อยแล้ว!`);
            setSelectedLeaveIds([]);
            
            // Refresh
            fetchData('leave_requests', 'leaveRequests');
            fetchTransactions();
        } catch (e) {
            alert("เกิดข้อผิดพลาดในการลบใบลา: " + e.message);
        }
    };

    // Admin Create Leave Request
    const handleAdminCreateLeave = async () => {
        if (!adminLeaveForm.empId) return alert("กรุณาเลือกพนักงานที่ต้องการลา");
        if (!adminLeaveForm.startDate || !adminLeaveForm.endDate) return alert("กรุณาระบุวันที่ลา");
        if (!adminLeaveForm.reason) return alert("กรุณาระบุเหตุผลการลา");

        setAdminLeaveLoading(true);
        try {
            // Generate date range
            const dates = [];
            let current = new Date(adminLeaveForm.startDate);
            const end = new Date(adminLeaveForm.endDate);
            while (current <= end) {
                const y = current.getFullYear();
                const m = String(current.getMonth() + 1).padStart(2, '0');
                const d = String(current.getDate()).padStart(2, '0');
                dates.push(`${y}-${m}-${d}`);
                current.setDate(current.getDate() + 1);
            }

            if (dates.length === 0) return alert("ช่วงวันที่ไม่ถูกต้อง");

            const rowsToInsert = dates.map(date => ({
                employee_id: parseInt(adminLeaveForm.empId, 10),
                leave_date: date,
                leave_type: adminLeaveForm.type,
                reason: `[Admin] ${adminLeaveForm.reason}`,
                replacement_employee_id: adminLeaveForm.replacementId ? parseInt(adminLeaveForm.replacementId, 10) : null,
                status: adminLeaveForm.status
            }));

            const { data: insertedData, error } = await supabase
                .from('leave_requests')
                .insert(rowsToInsert)
                .select();

            if (error) throw error;

            // If auto-approved, sync to roster
            if (adminLeaveForm.status === 'approved' && insertedData) {
                for (const req of insertedData) {
                    // Mark leaving employee as OFF
                    await supabase.from('roster_overrides').upsert({
                        employee_id: req.employee_id,
                        date: req.leave_date,
                        is_off: true
                    });

                    await supabase.from('roster_transactions').upsert({
                        employee_id: req.employee_id,
                        date: req.leave_date,
                        is_off: true,
                        slot_type: 'MAIN',
                        status: 'PUBLISHED'
                    }, { onConflict: 'employee_id, date, slot_type' });

                    // If replacement, assign shift
                    if (req.replacement_employee_id) {
                        const dayOfWeek = (new Date(req.leave_date).getDay() + 6) % 7;
                        const { data: sched } = await supabase
                            .from('employee_schedules')
                            .select('shift_id')
                            .eq('employee_id', req.employee_id)
                            .eq('day_of_week', dayOfWeek)
                            .eq('is_off', false)
                            .maybeSingle();

                        if (sched?.shift_id) {
                            const { data: shiftObj } = await supabase
                                .from('shifts')
                                .select('start_time, end_time')
                                .eq('id', sched.shift_id)
                                .single();

                            if (shiftObj) {
                                await supabase.from('roster_overrides').upsert({
                                    employee_id: req.replacement_employee_id,
                                    date: req.leave_date,
                                    shift_id: sched.shift_id,
                                    is_off: false,
                                    custom_start_time: shiftObj.start_time,
                                    custom_end_time: shiftObj.end_time
                                });

                                await supabase.from('roster_transactions').upsert({
                                    employee_id: req.replacement_employee_id,
                                    date: req.leave_date,
                                    shift_id: sched.shift_id,
                                    is_off: false,
                                    custom_start_time: shiftObj.start_time,
                                    custom_end_time: shiftObj.end_time,
                                    slot_type: 'MAIN',
                                    status: 'PUBLISHED'
                                }, { onConflict: 'employee_id, date, slot_type' });
                            }
                        }
                    }
                }
            }

            alert(`✅ เพิ่มใบลาจำนวน ${dates.length} วัน สำเร็จ! (สถานะ: ${adminLeaveForm.status === 'approved' ? 'อนุมัติแล้ว + Sync Roster' : adminLeaveForm.status === 'pending' ? 'รออนุมัติ' : 'ปฏิเสธ'})`);
            setShowAdminLeaveModal(false);
            setAdminLeaveForm({
                empId: "", startDate: format(new Date(), "yyyy-MM-dd"), endDate: format(new Date(), "yyyy-MM-dd"),
                type: "sick", reason: "", replacementId: "", status: "approved"
            });
            fetchData('leave_requests', 'leaveRequests');
            fetchTransactions();
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        } finally {
            setAdminLeaveLoading(false);
        }
    };


    // Announcement Action
    const applyPresetExpiresAt = (preset, isEdit = false) => {
        const now = new Date();
        let targetDate = new Date();

        if (preset === '1h') {
            targetDate.setHours(now.getHours() + 1);
        } else if (preset === 'today') {
            targetDate.setHours(23, 59, 59, 999);
        } else if (preset === 'tomorrow') {
            targetDate.setDate(now.getDate() + 1);
            targetDate.setHours(23, 59, 59, 999);
        } else if (preset === '3d') {
            targetDate.setDate(now.getDate() + 3);
        } else if (preset === '1w') {
            targetDate.setDate(now.getDate() + 7);
        }

        const formatted = format(targetDate, "yyyy-MM-dd'T'HH:mm");
        if (isEdit) {
            setEditingAnnouncement(prev => ({ ...prev, expires_at_formatted: formatted }));
        } else {
            setExpiresAt(formatted);
        }
    };

    const handleAddAnnouncement = async (e) => {
        if (e) e.preventDefault();
        if (!newAnnouncement.trim()) return alert("กรุณาพิมพ์ข้อความประกาศ");
        
        const payload = {
            message: newAnnouncement,
            is_active: true,
            priority: Number(announcementPriority),
            expires_at: announcementType === 'temporary' && expiresAt ? new Date(expiresAt).toISOString() : null
        };

        const { error } = await supabase.from('announcements').insert(payload);
        if (!error) {
            setNewAnnouncement("");
            setExpiresAt("");
            setAnnouncementPriority(1);
            setAnnouncementType("fixed");
            fetchData('announcements', 'announcements');
        } else {
            alert("เกิดข้อผิดพลาด: " + error.message);
        }
    };

    const handleToggleAnnouncement = async (id, status) => {
        await supabase.from('announcements').update({ is_active: !status }).eq('id', id);
        fetchData('announcements', 'announcements');
    };

    const handleDeleteAnnouncement = async (id) => {
        if (confirm("ต้องการลบประกาศนี้ใช่หรือไม่?")) {
            await supabase.from('announcements').delete().eq('id', id);
            fetchData('announcements', 'announcements');
        }
    };

    const handleEditAnnouncement = (announcement) => {
        setEditingAnnouncement({
            ...announcement,
            type: announcement.expires_at ? "temporary" : "fixed",
            expires_at_formatted: announcement.expires_at ? format(new Date(announcement.expires_at), "yyyy-MM-dd'T'HH:mm") : ""
        });
    };

    const handleSaveEditAnnouncement = async () => {
        if (!editingAnnouncement || !editingAnnouncement.message.trim()) return alert("กรุณากรอกข้อความประกาศ");

        const payload = {
            message: editingAnnouncement.message,
            priority: Number(editingAnnouncement.priority),
            expires_at: editingAnnouncement.type === 'temporary' && editingAnnouncement.expires_at_formatted
                ? new Date(editingAnnouncement.expires_at_formatted).toISOString()
                : null
        };

        const { error } = await supabase
            .from('announcements')
            .update(payload)
            .eq('id', editingAnnouncement.id);

        if (!error) {
            setEditingAnnouncement(null);
            fetchData('announcements', 'announcements');
            alert("แก้ไขประกาศสำเร็จ!");
        } else {
            alert("เกิดข้อผิดพลาด: " + error.message);
        }
    };

    // Application Action
    const handleUpdateApplicationStatus = async (id, status) => {
        await supabase.from('job_applications').update({ status }).eq('id', id);
        fetchData('job_applications', 'jobApplications');
    };

    // Settings Action
    const handleUpdateShift = async (id, field, val) => {
        await supabase.from("shifts").update({ [field]: val }).eq("id", id);
        fetchData('shifts', 'shifts');
    };

    const handleSaveStaff = async (staffData) => {
        try {
            // Basic Validation
            if (!staffData.name || !staffData.line_user_id) return alert("Name and LINE ID required");

            // Prepare payload - ensure shift_rates is clean
            const payload = { ...staffData };
            delete payload.created_at; // Don't update this

            // If we have an ID, it's an update. Upsert handles both if ID is present.
            const { error } = await supabase.from('employees').upsert(payload);

            if (error) throw error;

            alert("Staff saved!");
            setShowStaffModal(false);
            setEditingStaff(null);
            fetchEmployees();

            // Refresh pending list
            supabase.from("employees").select("*").eq("is_active", false).order("created_at", { ascending: false })
                .then(({ data }) => dispatch({ type: 'SET_DATA', payload: { pendingEmployees: data || [] } }));

        } catch (e) {
            alert("Error: " + e.message);
        }
    };

    const handleApproveStaff = (staff) => {
        setEditingStaff(staff);
        setShowStaffModal(true);
    };

    // Excel
    // Excel
    const handleExportExcel = () => {
        if (!payrollData || payrollData.length === 0) return alert("No data to export");

        const exportRows = [];

        payrollData.forEach(p => {
            // Add Header Row for Employee (Optional, or just flatten)
            // Flattening is better for data analysis.
            p.dailyDetails.forEach(day => {
                exportRows.push({
                    "Date": day.date,
                    "Employee": p.emp.name,
                    "Position": p.emp.position || '-',
                    "Shift": day.shift,
                    "Time In": day.in,
                    "Time Out": day.out,
                    "Wage": day.wage || 0,
                    "OT Pay": day.ot || 0,
                    "OT Hrs": day.ot_hours || 0,
                    "Status": day.status
                });
            });
        });

        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(exportRows);

        // Column Widths
        const wscols = [
            { wch: 12 }, // Date
            { wch: 20 }, // Employee
            { wch: 15 }, // Position
            { wch: 15 }, // Shift
            { wch: 10 }, // In
            { wch: 10 }, // Out
            { wch: 10 }, // Wage
            { wch: 10 }, // OT Pay
            { wch: 10 }, // OT Hrs
            { wch: 15 }  // Status
        ];
        ws['!cols'] = wscols;

        XLSX.utils.book_append_sheet(wb, ws, "Payroll_Detailed");
        XLSX.writeFile(wb, `Payroll_Detailed_${selectedMonth}.xlsx`);
    };

    // --- Helpers ---
    const getShiftStatus = (log) => {
        const date = new Date(log.timestamp);
        const logDateLocalStr = format(date, 'yyyy-MM-dd');
        const hour = date.getHours();
        
        // 0. Detect Overnight Check-out (punched between 00:00 and 06:00 AM)
        if (log.action_type === 'check_out' && hour >= 0 && hour < 6) {
            const yesterdayDate = subDays(date, 1);
            const yesterdayStr = format(yesterdayDate, 'yyyy-MM-dd');
            
            // Check if there was a check-in within the last 18 hours
            const priorCheckin = (data.logs || []).find(l => 
                String(l.employee_id) === String(log.employee_id) && 
                l.action_type === 'check_in' && 
                new Date(l.timestamp) < date &&
                (date - new Date(l.timestamp)) <= (18 * 60 * 60 * 1000)
            );
            
            const targetDateStr = priorCheckin ? format(new Date(priorCheckin.timestamp), 'yyyy-MM-dd') : yesterdayStr;
            const targetDateObj = parseISO(targetDateStr);

            return {
                label: `ออกกะเมื่อวาน (${formatDate(targetDateObj)})`,
                color: 'purple',
                isOvernight: true,
                shiftDate: targetDateStr
            };
        }

        // 1. Check roster transaction override first (draft or published)
        const tx = data.transactions?.find(t => 
            String(t.employee_id) === String(log.employee_id) && 
            t.date === logDateLocalStr
        );

        if (tx) {
            if (tx.is_off) {
                return log.action_type === 'check_in' 
                    ? { label: 'Off Day Work', color: 'purple' } 
                    : { label: 'Out', color: 'slate' };
            }
            const shift = data.shifts?.find(s => s.id === tx.shift_id);
            const startTimeStr = tx.custom_start_time || shift?.start_time;
            if (!startTimeStr) return { label: '-', color: 'slate' };
            
            const [sh, sm] = startTimeStr.split(':');
            const shiftStart = new Date(date);
            shiftStart.setHours(sh, sm, 0, 0);
            
            if (log.action_type === 'check_in') {
                const diff = differenceInMinutes(date, shiftStart);
                return diff > 15 ? { label: `Late +${diff}m`, color: 'amber' } : { label: 'On Time', color: 'emerald' };
            }
            return { label: 'Out', color: 'slate' };
        }

        // 2. Fallback to weekly schedule
        const schedule = data.schedules[log.employee_id]?.[date.getDay()];
        if (!schedule) return { label: '-', color: 'slate' };
        if (schedule.is_off) {
            return log.action_type === 'check_in' 
                ? { label: 'Off Day Work', color: 'purple' } 
                : { label: 'Out', color: 'slate' };
        }
        if (!schedule.shifts) return { label: '-', color: 'slate' };
        if (log.action_type === 'absent') return { label: 'Absent', color: 'rose' };

        const [sh, sm] = schedule.shifts.start_time.split(':');
        const shiftStart = new Date(date);
        shiftStart.setHours(sh, sm, 0, 0);

        if (log.action_type === 'check_in') {
            const diff = differenceInMinutes(date, shiftStart);
            return diff > 15 ? { label: `Late +${diff}m`, color: 'amber' } : { label: 'On Time', color: 'emerald' };
        }
        return { label: 'Out', color: 'slate' };
    };

    // --- Staff Tab (Active & Pending) ---
    useEffect(() => {
        if (activeTab === 'employees') {
            fetchEmployees();
            supabase.from("employees").select("*").eq("is_active", false).order("created_at", { ascending: false })
                .then(({ data }) => dispatch({ type: 'SET_DATA', payload: { pendingEmployees: data || [] } }));
        }
    }, [activeTab]);

    const draftWeeks = useMemo(() => {
        // Group draft transactions by their week start (Monday)
        const weeks = {};
        data.transactions?.forEach(tx => {
            if (tx.status === 'DRAFT') {
                const txDate = parseISO(tx.date);
                const mon = startOfWeek(txDate, { weekStartsOn: 1 });
                const monStr = format(mon, 'yyyy-MM-dd');
                if (dismissedDraftWeeks.includes(monStr)) return;
                if (!weeks[monStr]) {
                    const sun = addDays(mon, 6);
                    weeks[monStr] = {
                        start: monStr,
                        end: format(sun, 'yyyy-MM-dd'),
                        count: 0
                    };
                }
                weeks[monStr].count++;
            }
        });
        return Object.values(weeks).sort((a, b) => a.start.localeCompare(b.start));
    }, [data.transactions, dismissedDraftWeeks]);




    const handlePublishRoster = async (startDateStr, endDateStr) => {
        if (!confirm(`ต้องการอนุมัติและประกาศตารางงานจากกะ Draft ในวันที่ ${startDateStr} ถึง ${endDateStr} ใช่หรือไม่?`)) return;
        try {
            const res = await fetch('/api/notify-schedule', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ startDate: startDateStr, endDate: endDateStr })
            });
            const result = await res.json();
            if (result.success) {
                alert("เผยแพร่ตารางงานสำเร็จแล้ว!");
                fetchTransactions(); // reload transactions to update status to PUBLISHED
            } else {
                alert(result.message || "เกิดข้อผิดพลาดในการประกาศตารางงาน");
            }
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        }
    };

    const handleDismissDraftWeek = (weekStart) => {
        const updated = [...dismissedDraftWeeks, weekStart];
        setDismissedDraftWeeks(updated);
        try {
            if (typeof window !== "undefined") {
                localStorage.setItem("dismissed_draft_weeks", JSON.stringify(updated));
            }
        } catch (e) {
            console.warn("Storage access restricted or unavailable:", e);
        }
    };


    const navigationCategories = [
        {
            title: "งานหลัก",
            items: [
                { id: 'dashboard', label: 'ภาพรวม' },
                { id: 'roster', label: 'ตารางงาน', isLink: true, href: '/admin/roster' },
                { id: 'shift_manage', label: 'แลกกะ' },
                { id: 'requests', label: 'ใบลา' },
                { id: 'payroll', label: 'เงินเดือน', isLink: true, href: '/admin/payroll' },
            ]
        },
        {
            title: "ร้าน",
            items: [
                { id: 'nfc_stations', label: 'จุดแตะ NFC' },
                { id: 'applications', label: 'รับสมัครงาน' },
            ]
        },
        {
            title: "ระบบ",
            items: [
                { id: 'employees', label: 'รายชื่อพนักงาน' },
                { id: 'announcements', label: 'ประกาศ' },
                { id: 'meetings', label: 'บันทึกการประชุม' },
                { id: 'history', label: 'ประวัติรายคน' },
                { id: 'yuzu', label: 'Yuzu AI' },
                { id: 'settings', label: 'ตั้งค่ากะ' },
            ]
        }
    ];
    const tabTitle = navigationCategories.flatMap(c => c.items).find(i => i.id === activeTab)?.label || activeTab;

    const pendingLeaveCount = data.leaveRequests.filter(r => r.status === 'pending').length;
    const pendingSwapCount = data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').length;
    const pendingStaffCount = data.pendingEmployees?.length || 0;
    const totalAlertsCount = pendingLeaveCount + pendingSwapCount + pendingStaffCount;
    const pendingApplications = data.jobApplications.filter(r => r.status === 'Pending').length;
    const countFor = (id) => id === 'requests' ? pendingLeaveCount : id === 'shift_manage' ? pendingSwapCount : id === 'applications' ? pendingApplications : 0;

    // One menu for the desktop sidebar and the phone drawer
    const renderNav = () => (
        <>
            <div className="bg-plum text-cream px-5 py-4 border-b border-plum-3 shrink-0">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logo-inbaan-wordmark-cream-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto" />
                <p className="text-sm text-on-plum-2 mt-1">หลังบ้าน · HR</p>
            </div>
            <nav aria-label="เมนูหลังบ้าน" className="flex-1 overflow-y-auto py-4 custom-scrollbar">
                {navigationCategories.map((category) => (
                    <div key={category.title} className="mb-4">
                        <p className="px-5 pb-1 text-sm font-semibold text-neutral">{category.title}</p>
                        {category.items.map(item => {
                            const active = activeTab === item.id;
                            const n = countFor(item.id);
                            return (
                                <button
                                    key={item.id}
                                    type="button"
                                    aria-current={active ? 'page' : undefined}
                                    onClick={() => {
                                        if (item.isLink) {
                                            window.location.href = item.href;
                                        } else {
                                            setActiveTab(item.id);
                                            setIsDrawerOpen(false);
                                        }
                                    }}
                                    className={`w-full min-h-11 px-5 flex items-center justify-between gap-3 text-left text-base transition-colors duration-150 ${active ? 'bg-plum text-cream font-semibold' : 'text-charcoal hover:bg-paper-2'}`}
                                >
                                    <span>{item.label}{item.isLink && <span className={`ml-1 text-sm ${active ? 'text-on-plum-2' : 'text-neutral'}`}>↗</span>}</span>
                                    {n > 0 && <span className={`font-num text-sm px-1.5 ${active ? 'bg-cream text-plum' : 'bg-charcoal text-cream'}`}>{n}</span>}
                                </button>
                            );
                        })}
                    </div>
                ))}
            </nav>
            <div className="border-t border-rule px-5 py-3 shrink-0">
                <p className="text-sm text-neutral truncate" title={user?.email || "admin"}>{user?.email || "admin"}</p>
                <button type="button" onClick={signOut} className="mt-1 min-h-11 text-base text-plum underline underline-offset-4">ออกจากระบบ</button>
            </div>
        </>
    );

    return (
        <div className="brand-v2 flex min-h-screen">
            {/* Desktop sidebar */}
            <aside className="hidden lg:flex flex-col w-64 bg-cream border-r border-charcoal sticky top-0 h-screen shrink-0 z-30">
                {renderNav()}
            </aside>

            {/* Phone drawer */}
            {isDrawerOpen && (
                <div className="fixed inset-0 z-50 lg:hidden flex" role="dialog" aria-modal="true" aria-label="เมนู">
                    <div onClick={() => setIsDrawerOpen(false)} className="fixed inset-0 bg-charcoal/50" />
                    <aside className="relative flex flex-col w-72 max-w-[85vw] bg-cream border-r border-charcoal h-full z-50">
                        <button type="button" onClick={() => setIsDrawerOpen(false)} className="absolute top-3 right-3 z-10 min-h-11 px-3 text-base font-semibold text-cream hover:bg-plum-2 transition-colors duration-150">ปิด</button>
                        {renderNav()}
                    </aside>
                </div>
            )}

            <div className="flex-1 flex flex-col min-w-0">
                {/* Phone top bar */}
                <header className="lg:hidden sticky top-0 z-40 bg-plum text-cream border-b border-plum-3 flex items-stretch">
                    <button type="button" onClick={() => setIsDrawerOpen(true)} className="min-h-14 px-4 border-r border-plum-3 text-base font-semibold hover:bg-plum-2 transition-colors duration-150">
                        เมนู{totalAlertsCount > 0 && <span className="ml-1.5 font-num text-sm bg-cream text-plum px-1.5">{totalAlertsCount}</span>}
                    </button>
                    <div className="flex-1 px-4 flex items-center min-w-0">
                        <span className="font-head text-xl truncate">{tabTitle}</span>
                    </div>
                    <label className="flex items-center px-3 border-l border-plum-3">
                        <span className="sr-only">เดือน</span>
                        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-transparent font-num text-sm text-cream outline-none w-[10rem] [color-scheme:dark]" />
                    </label>
                </header>

                <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
                    {/* Desktop page header */}
                    <div className="hidden lg:flex justify-between items-end border-b-2 border-charcoal pb-3">
                        <h1 className="font-head text-3xl leading-normal text-charcoal">{tabTitle}</h1>
                        <label className="text-sm font-semibold text-neutral">
                            เดือน
                            <input
                                type="month"
                                value={selectedMonth}
                                onChange={e => setSelectedMonth(e.target.value)}
                                className="block mt-1 min-h-11 px-3 bg-cream border border-charcoal font-num text-base text-charcoal outline-none focus-visible:border-plum"
                            />
                        </label>
                    </div>

                    {/* --- DASHBOARD OVERVIEW --- */}
                    {activeTab === 'dashboard' && (
                        <DashboardOverview
                            data={data}
                            selectedMonth={selectedMonth}
                            setSelectedMonth={setSelectedMonth}
                            draftWeeks={draftWeeks}
                            dismissedDraftWeeks={dismissedDraftWeeks}
                            setDismissedDraftWeeks={setDismissedDraftWeeks}
                            handlePublishRoster={handlePublishRoster}
                            handleDismissDraftWeek={handleDismissDraftWeek}
                            handleNotify={handleNotify}
                            handleFinalizeDay={handleFinalizeDay}
                            setShowManualModal={setShowManualModal}
                            setShowAdminLeaveModal={setShowAdminLeaveModal}
                            setEditingStaff={setEditingStaff}
                            setShowStaffModal={setShowStaffModal}
                            handleLeaveAction={handleLeaveAction}
                            handleSwapDecision={handleSwapDecision}
                            handleToggleLogAction={handleToggleLogAction}
                            handleDeleteLog={handleDeleteLog}
                            onTabChange={(tabId) => {
                                const matchedNav = navigationCategories.flatMap(c => c.items).find(i => i.id === tabId);
                                if (matchedNav?.isLink) {
                                    window.location.href = matchedNav.href;
                                } else {
                                    setActiveTab(tabId);
                                }
                            }}
                        />
                    )}

                    {/* Manual Entry Modal */}
                    {showManualModal && (
                        <div className="fixed inset-0 z-[60] bg-charcoal/50 flex items-center justify-center p-4">
                            <div className="bg-cream border border-charcoal w-full max-w-sm p-6 space-y-4">
                                <div className="flex justify-between items-center border-b border-rule pb-2">
                                    <h3 className="font-num font-semibold text-charcoal text-sm">Manual Attendance</h3>
                                    <button onClick={() => setShowManualModal(false)} className="flex items-center justify-center border border-rule hover:border-charcoal bg-cream text-charcoal text-xs transition-colors duration-150 cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline">ปิด</button>
                                </div>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-num font-semibold text-neutral mb-1.5">Employee</label>
                                        <select
                                            className="w-full p-2.5 bg-cream border border-rule text-xs font-num font-semibold text-charcoal outline-none focus:border-charcoal transition-colors duration-150 cursor-pointer appearance-none"
                                            value={manualForm.empId}
                                            onChange={e => setManualForm({ ...manualForm, empId: e.target.value })}
                                        >
                                            <option value="">Select Employee</option>
                                            {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-num font-semibold text-neutral mb-1.5">Date</label>
                                            <input
                                                type="date"
                                                className="w-full p-2.5 bg-cream border border-rule text-xs font-num font-semibold text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                                                value={manualForm.date}
                                                onChange={e => setManualForm({ ...manualForm, date: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-num font-semibold text-neutral mb-1.5">Time</label>
                                            <input
                                                type="time"
                                                className="w-full p-2.5 bg-cream border border-rule text-xs font-num font-semibold text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                                                value={manualForm.time}
                                                onChange={e => setManualForm({ ...manualForm, time: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-num font-semibold text-neutral mb-1.5">Action Type</label>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                            <button
                                                onClick={() => setManualForm({ ...manualForm, type: 'check_in' })}
                                                className={`p-2.5 text-xs font-num font-semibold border transition-colors duration-150 cursor-pointer ${manualForm.type === 'check_in' ? 'bg-charcoal/10 border-charcoal text-charcoal' : 'bg-cream border-rule text-neutral hover:border-charcoal'}`}
                                            >
                                                Check In
                                            </button>
                                            <button
                                                onClick={() => setManualForm({ ...manualForm, type: 'check_out' })}
                                                className={`p-2.5 text-xs font-num font-semibold border transition-colors duration-150 cursor-pointer ${manualForm.type === 'check_out' ? 'bg-plum/10 border-plum text-plum' : 'bg-cream border-rule text-neutral hover:border-charcoal'}`}
                                            >
                                                Check Out
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleManualSubmit}
                                        className="w-full py-2.5 bg-plum text-cream border border-charcoal font-num font-semibold text-xs hover:bg-plum-2 transition-colors duration-150 cursor-pointer mt-4"
                                    >
                                        Confirm Entry
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- STAFF DIRECTORY --- */}
                    {activeTab === 'employees' && (
                        <div className="space-y-6">
                            <StaffDirectoryManager
                                employees={data.employees}
                                pendingEmployees={data.pendingEmployees}
                                onAddStaff={() => { setEditingStaff(null); setShowStaffModal(true); }}
                                onEditStaff={(emp) => { setEditingStaff(emp); setShowStaffModal(true); }}
                                onDeleteStaff={handleDeleteEmployee}
                                onApproveStaff={handleApproveStaff}
                                onRefresh={fetchEmployees}
                            />
                            <StaffModal 
                                isOpen={showStaffModal} 
                                onClose={() => { setShowStaffModal(false); setEditingStaff(null); }} 
                                onSave={handleSaveStaff} 
                                initialData={editingStaff} 
                                isEditing={!!editingStaff} 
                            />
                        </div>
                    )}

                    {/* --- LEAVE REQUESTS --- */}
                    {activeTab === 'requests' && (() => {
                        // 1. Calculate stats for the selected month
                        const monthRequests = data.leaveRequests.filter(req => req.leave_date && req.leave_date.startsWith(selectedMonth));
                        const stats = {
                            pending: monthRequests.filter(r => r.status === 'pending').length,
                            approved: monthRequests.filter(r => r.status === 'approved').length,
                            rejected: monthRequests.filter(r => r.status === 'rejected').length,
                            total: monthRequests.length
                        };

                        // 2. Filter requests based on state
                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                        let filteredLeaveRequests = data.leaveRequests.filter(req => {
                            // By default, only show leaves in the selected month
                            if (!leaveShowAllMonths) {
                                if (!req.leave_date || !req.leave_date.startsWith(selectedMonth)) {
                                    return false;
                                }
                            }
                            // Status filter
                            if (leaveStatusFilter !== "all" && req.status !== leaveStatusFilter) return false;
                            // Search query
                            if (leaveSearchQuery) {
                                const query = leaveSearchQuery.toLowerCase();
                                const empName = (req.employees?.name || "").toLowerCase();
                                const empNickname = (req.employees?.nickname || "").toLowerCase();
                                const repName = (req.replacement_employee?.name || "").toLowerCase();
                                const repNickname = (req.replacement_employee?.nickname || "").toLowerCase();
                                const reason = (req.reason || "").toLowerCase();
                                if (!empName.includes(query) && 
                                    !empNickname.includes(query) && 
                                    !repName.includes(query) && 
                                    !repNickname.includes(query) &&
                                    !reason.includes(query)) {
                                    return false;
                                }
                            }
                            return true;
                        });

                        // Sort the requests by leave_date
                        filteredLeaveRequests = [...filteredLeaveRequests].sort((a, b) => {
                            const dateA = a.leave_date || '';
                            const dateB = b.leave_date || '';
                            if (leaveShowAllMonths) {
                                // History view: sort descending (newest/most recent first)
                                return dateB.localeCompare(dateA);
                            } else {
                                // Default view (upcoming/active): sort ascending (soonest first)
                                return dateA.localeCompare(dateB);
                            }
                        });

                        const formatThaiLeaveDate = (dateStr) => {
                            if (!dateStr) return "-";
                            try {
                                const days = ["วันอาทิตย์", "วันจันทร์", "วันอังคาร", "วันพุธ", "วันพฤหัสบดี", "วันศุกร์", "วันเสาร์"];
                                const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
                                const dateObj = new Date(dateStr);
                                const dayName = days[dateObj.getDay()];
                                const dayNum = dateObj.getDate();
                                const monthName = months[dateObj.getMonth()];
                                const year = dateObj.getFullYear();
                                return `${dayName}ที่ ${dayNum} ${monthName} ${year}`;
                            } catch (e) {
                                return dateStr;
                            }
                        };

                        return (
                            <div className="space-y-6">
                                {/* Header Title */}
                                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                    <div>
                                        <h3 className="font-semibold text-charcoal text-2xl">ใบลาของพนักงาน</h3>
                                        <p className="text-neutral text-xs mt-1 font-medium font-semibold">จัดการใบลา อนุมัติ และตรวจสอบการทำงานแทนกันในระบบ</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedLeaveIds.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleDeleteMultipleLeaves}
                                                className="px-4 py-2 text-xs font-semibold transition-colors duration-150 border bg-error text-cream border-error hover:bg-error/90 "
                                            >
                                                ลบใบลาที่เลือก ({selectedLeaveIds.length})
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setLeaveShowAllMonths(prev => !prev)}
                                            className={`px-4 py-2 text-xs font-semibold transition-colors duration-150 border ${
 leaveShowAllMonths
 ? 'bg-charcoal text-cream border-charcoal hover:bg-charcoal-2'
 : 'bg-cream text-charcoal border-rule hover:bg-paper-2'
 }`}
                                        >
                                            {leaveShowAllMonths ? 'แสดงเฉพาะเดือนที่เลือก' : 'แสดงประวัติทั้งหมด'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowAdminLeaveModal(true)}
                                            className="px-4 py-2 text-xs font-semibold transition-colors duration-150 border bg-charcoal text-cream border-plum hover:bg-charcoal-2 "
                                        >
                                            บันทึกใบลาแทนพนักงาน
                                        </button>
                                    </div>
                                </div>


                                {/* Stat Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-cream border border-rule p-4 flex items-center gap-4">
                                        <div>
                                            <div className="text-xs font-semibold text-neutral">ทั้งหมด (เดือนนี้)</div>
                                            <div className="text-xl font-semibold text-charcoal">{stats.total} รายการ</div>
                                        </div>
                                    </div>
                                    <div className="bg-paper-2 border border-plum p-4 flex items-center gap-4">
                                        <div>
                                            <div className="text-xs font-semibold text-plum">รออนุมัติ</div>
                                            <div className="text-xl font-semibold text-plum">{stats.pending} รายการ</div>
                                        </div>
                                    </div>
                                    <div className="bg-paper-2 border border-plum p-4 flex items-center gap-4">
                                        <div>
                                            <div className="text-xs font-semibold text-plum">อนุมัติแล้ว</div>
                                            <div className="text-xl font-semibold text-plum">{stats.approved} รายการ</div>
                                        </div>
                                    </div>
                                    <div className="bg-cream border border-rule p-4 flex items-center gap-4">
                                        <div>
                                            <div className="text-xs font-semibold text-neutral">ปฏิเสธแล้ว</div>
                                            <div className="text-xl font-semibold text-charcoal">{stats.rejected} รายการ</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Filters and Search Row */}
                                <div className="bg-cream border border-rule p-4 flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                                    {/* Tabs */}
                                    <div className="flex bg-paper-2 p-1 gap-1">
                                        {[
                                            { id: 'all', label: 'ทั้งหมด' },
                                            { id: 'pending', label: 'รออนุมัติ' },
                                            { id: 'approved', label: 'อนุมัติแล้ว ' },
                                            { id: 'rejected', label: 'ปฏิเสธแล้ว ' }
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => setLeaveStatusFilter(tab.id)}
                                                className={`px-3 py-1.5 text-xs font-semibold transition-colors duration-150 ${
 leaveStatusFilter === tab.id
 ? 'bg-cream text-charcoal '
 : 'text-neutral hover:text-charcoal'
 }`}
                                            >
                                                {tab.label}
                                            </button>
                                        ))}
                                    </div>

                                    {/* Search Input */}
                                    <div className="relative flex-1 max-w-md">
                                        <input
                                            type="text"
                                            value={leaveSearchQuery}
                                            onChange={e => setLeaveSearchQuery(e.target.value)}
                                            placeholder="ค้นหาตามชื่อพนักงาน, คนปฏิบัติแทน หรือเหตุผล..."
                                            className="w-full bg-paper-2 border border-rule pl-4 pr-10 py-2 text-xs font-semibold text-charcoal focus:outline-none focus:ring-2 focus:ring-slate-200 transition-colors duration-150 placeholder:text-neutral font-semibold"
                                        />
                                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-neutral select-none text-xs"></span>
                                    </div>
                                </div>

                                {/* Table Card */}
                                <Card className="p-0 overflow-hidden border border-rule">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-paper-2 text-neutral font-semibold text-xs border-b border-rule">
                                            <tr>
                                                <th className="p-4 w-10">
                                                    <input
                                                        type="checkbox"
                                                        checked={filteredLeaveRequests.length > 0 && selectedLeaveIds.length === filteredLeaveRequests.length}
                                                        onChange={(e) => {
                                                            if (e.target.checked) {
                                                                setSelectedLeaveIds(filteredLeaveRequests.map(r => r.id));
                                                            } else {
                                                                setSelectedLeaveIds([]);
                                                            }
                                                        }}
                                                        className="w-4 h-4 text-plum focus:ring-indigo-500 border-rule cursor-pointer"
                                                    />
                                                </th>
                                                <th className="p-4">พนักงาน</th>
                                                <th className="p-4">วันที่ขอลา</th>
                                                <th className="p-4">ประเภท</th>
                                                <th className="p-4">เหตุผลการลา</th>
                                                <th className="p-4">ปฏิบัติแทนโดย</th>
                                                <th className="p-4 text-center">สถานะ</th>
                                                <th className="p-4 text-right">การจัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {filteredLeaveRequests.map(req => {
                                                const leaveTypeMap = {
                                                    sick: { label: 'ลาป่วย ', color: 'bg-paper-2 text-error border-error' },
                                                    business: { label: 'ลากิจ ', color: 'bg-paper-2 text-plum border-plum' },
                                                    vacation: { label: 'พักร้อน ', color: 'bg-paper-2 text-plum border-plum' }
                                                };
                                                const currentType = leaveTypeMap[req.leave_type] || { label: req.leave_type, color: 'bg-paper-2 text-charcoal border-rule' };

                                                return (
                                                    <tr key={req.id} className="hover:bg-paper-2/50 transition-colors">
                                                        <td className="p-4 w-10">
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
                                                                className="w-4 h-4 text-plum focus:ring-indigo-500 border-rule cursor-pointer"
                                                            />
                                                        </td>
                                                        {/* Employee Name & Profile */}
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-3">
                                                                <EmployeeAvatar employee={req.employees} className="w-9 h-9" textClassName="text-xs font-semibold" />
                                                                <div>
                                                                    <div className="font-semibold text-charcoal">{req.employees?.nickname || req.employees?.name}</div>
                                                                    <div className="text-xs text-neutral font-semibold">{req.employees?.position || 'พนักงาน'}</div>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Date */}
                                                        <td className="p-4 font-semibold text-charcoal text-xs">
                                                            {formatThaiLeaveDate(req.leave_date)}
                                                        </td>

                                                        {/* Leave Type */}
                                                        <td className="p-4">
                                                            <span className={`px-2.5 py-1.5 text-xs font-semibold border ${currentType.color} inline-block`}>
                                                                {currentType.label}
                                                            </span>
                                                        </td>

                                                        {/* Reason */}
                                                        <td className="p-4 text-xs font-medium text-neutral max-w-[200px] truncate" title={req.reason}>
                                                            &ldquo;{req.reason || '-'}&rdquo;
                                                        </td>

                                                        {/* Replacement Employee */}
                                                        <td className="p-4">
                                                            {req.replacement_employee ? (
                                                                <div className="flex items-center gap-2">
                                                                    <EmployeeAvatar employee={req.replacement_employee} className="w-6 h-6" textClassName="text-xs font-semibold" />
                                                                    <span className="font-semibold text-charcoal text-xs">
                                                                        {req.replacement_employee.nickname || req.replacement_employee.name}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-neutral text-xs font-semibold">-</span>
                                                            )}
                                                        </td>

                                                        {/* Status Badge */}
                                                        <td className="p-4 text-center">
                                                            <span className={`px-2.5 py-1 text-xs font-semibold border ${
 req.status === 'approved' 
 ? 'bg-paper-2 text-plum border-plum' 
 : req.status === 'rejected' 
 ? 'bg-paper-2 text-error border-error' 
 : 'bg-paper-2 text-plum border-plum '
 }`}>
                                                                {req.status === 'approved' ? 'อนุมัติแล้ว' : req.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รออนุมัติ'}
                                                            </span>
                                                        </td>

                                                        {/* Actions */}
                                                        <td className="p-4 text-right">
                                                            <div className="flex justify-end gap-1.5">
                                                                {req.status === 'pending' ? (
                                                                    <>
                                                                        <button 
                                                                            onClick={() => handleLeaveAction(req, 'approved')} 
                                                                            className="px-2.5 py-1.5 bg-charcoal hover:bg-charcoal-2 text-cream font-semibold text-xs transition-colors flex items-center gap-1"
                                                                        >
                                                                            <span></span> อนุมัติ & ซิงค์
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleLeaveAction(req, 'rejected')} 
                                                                            className="px-2.5 py-1.5 bg-charcoal hover:bg-charcoal-2 text-cream font-semibold text-xs transition-colors flex items-center gap-1"
                                                                        >
                                                                            <span></span> ปฏิเสธคำขอ
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <button 
                                                                        onClick={() => handleLeaveAction(req, 'pending')}
                                                                        className="px-2 py-1 bg-paper-2 hover:bg-paper-3 text-charcoal border border-rule font-semibold text-xs transition-colors"
                                                                    >
                                                                        เปลี่ยนเป็นรออนุมัติ
                                                                    </button>
                                                                )}
                                                                <button 
                                                                    onClick={() => handleDeleteLeaveRequest(req)}
                                                                    className="px-2.5 py-1.5 bg-paper-2 hover:bg-paper-2 text-error border border-error font-semibold text-xs transition-colors flex items-center gap-1"
                                                                    title="ลบใบลาหยุด"
                                                                >
                                                                    <span></span> ลบใบลา
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredLeaveRequests.length === 0 && (
                                        <div className="p-12 text-center text-neutral font-semibold bg-paper-2/50">
                                            ไม่พบรายการคำขอลาหยุดในเงื่อนไขการกรองนี้
                                        </div>
                                    )}
                                </Card>
                            </div>
                        );
                    })()}

                    {/* Admin Leave Creation Modal */}
                    {showAdminLeaveModal && (
                        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowAdminLeaveModal(false)}>
                            <div className="bg-cream max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                                {/* Modal Header */}
                                <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-cream p-6 rounded-t-3xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-semibold">เพิ่มใบลาหยุด</h3>
                                            <p className="text-plum text-xs mt-1 font-medium">สร้างใบลาให้พนักงานโดย Admin พร้อม Sync Roster อัตโนมัติ</p>
                                        </div>
                                        <button onClick={() => setShowAdminLeaveModal(false)} className="bg-cream/20 flex items-center justify-center hover:bg-cream/30 transition-colors text-sm font-semibold min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline">ปิด</button>
                                    </div>
                                </div>

                                {/* Modal Body */}
                                <div className="p-6 space-y-5">
                                    {/* Employee Selection */}
                                    <div>
                                        <label className="block text-xs font-semibold text-plum mb-1.5">เลือกพนักงาน</label>
                                        <select
                                            value={adminLeaveForm.empId}
                                            onChange={e => setAdminLeaveForm(prev => ({ ...prev, empId: e.target.value, replacementId: "" }))}
                                            className="w-full p-3 border border-rule bg-paper-2 text-charcoal font-semibold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-plum transition"
                                        >
                                            <option value="">-- เลือกพนักงาน --</option>
                                            {data.employees.map(emp => (
                                                <option key={emp.id} value={emp.id}>
                                                    {emp.name} {emp.nickname ? `(${emp.nickname})` : ""} — {emp.position || "ทั่วไป"}
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    {/* Date Range */}
                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="block text-xs font-semibold text-plum mb-1.5">เริ่มวันที่</label>
                                            <input
                                                type="date"
                                                value={adminLeaveForm.startDate}
                                                onChange={e => {
                                                    const v = e.target.value;
                                                    setAdminLeaveForm(prev => ({
                                                        ...prev,
                                                        startDate: v,
                                                        endDate: !prev.endDate || prev.endDate < v ? v : prev.endDate
                                                    }));
                                                }}
                                                className="w-full p-3 border border-rule bg-paper-2 text-charcoal font-semibold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-plum transition"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-semibold text-plum mb-1.5">ถึงวันที่</label>
                                            <input
                                                type="date"
                                                value={adminLeaveForm.endDate}
                                                min={adminLeaveForm.startDate}
                                                onChange={e => setAdminLeaveForm(prev => ({ ...prev, endDate: e.target.value }))}
                                                className="w-full p-3 border border-rule bg-paper-2 text-charcoal font-semibold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-plum transition"
                                            />
                                        </div>
                                    </div>

                                    {/* Days Summary */}
                                    {adminLeaveForm.startDate && adminLeaveForm.endDate && (() => {
                                        const s = new Date(adminLeaveForm.startDate);
                                        const e = new Date(adminLeaveForm.endDate);
                                        const totalDays = Math.max(0, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
                                        return (
                                            <div className="bg-paper-2 border border-plum p-3 flex items-center justify-between">
                                                <span className="text-xs font-semibold text-plum">จำนวนวันที่เลือก</span>
                                                <span className="text-lg font-semibold text-plum">{totalDays} วัน</span>
                                            </div>
                                        );
                                    })()}

                                    {/* Leave Type */}
                                    <div>
                                        <label className="block text-xs font-semibold text-plum mb-1.5">ประเภทการลา</label>
                                        <select
                                            value={adminLeaveForm.type}
                                            onChange={e => setAdminLeaveForm(prev => ({ ...prev, type: e.target.value }))}
                                            className="w-full p-3 border border-rule bg-paper-2 text-charcoal font-semibold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-plum transition cursor-pointer"
                                        >
                                            <option value="sick">ลาป่วย</option>
                                            <option value="business">ลากิจ</option>
                                            <option value="vacation">พักร้อน</option>
                                        </select>
                                    </div>

                                    {/* Reason */}
                                    <div>
                                        <label className="block text-xs font-semibold text-plum mb-1.5">เหตุผล</label>
                                        <textarea
                                            value={adminLeaveForm.reason}
                                            onChange={e => setAdminLeaveForm(prev => ({ ...prev, reason: e.target.value }))}
                                            rows={2}
                                            placeholder="ระบุเหตุผลการลา..."
                                            className="w-full p-3 border border-rule bg-paper-2 text-charcoal font-medium text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-plum transition resize-none placeholder:text-neutral"
                                        />
                                    </div>

                                    {/* Replacement Employee */}
                                    <div>
                                        <label className="block text-xs font-semibold text-plum mb-1.5">พนักงานทำงานแทน (ไม่บังคับ)</label>
                                        <select
                                            value={adminLeaveForm.replacementId}
                                            onChange={e => setAdminLeaveForm(prev => ({ ...prev, replacementId: e.target.value }))}
                                            className="w-full p-3 border border-rule bg-paper-2 text-charcoal font-semibold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-plum transition cursor-pointer"
                                        >
                                            <option value="">-- ไม่ระบุ --</option>
                                            {data.employees
                                                .filter(emp => String(emp.id) !== String(adminLeaveForm.empId))
                                                .map(emp => (
                                                    <option key={emp.id} value={emp.id}>
                                                        {emp.name} {emp.nickname ? `(${emp.nickname})` : ""} — {emp.position || "ทั่วไป"}
                                                    </option>
                                                ))
                                            }
                                        </select>
                                    </div>

                                    {/* Status */}
                                    <div>
                                        <label className="block text-xs font-semibold text-plum mb-1.5">สถานะใบลา</label>
                                        <div className="flex gap-2">
                                            {[
                                                { id: 'approved', label: 'อนุมัติทันที', desc: 'Sync ลง Roster อัตโนมัติ' },
                                                { id: 'pending', label: ' รออนุมัติ', desc: 'ยังไม่ Sync Roster' },
                                            ].map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => setAdminLeaveForm(prev => ({ ...prev, status: s.id }))}
                                                    className={`flex-1 p-3 text-xs font-semibold border-2 transition-colors duration-150 ${
 adminLeaveForm.status === s.id
 ? s.id === 'approved'
 ? 'bg-paper-2 border-plum text-plum ring-2 ring-emerald-200'
 : 'bg-paper-2 border-plum text-plum ring-2 ring-amber-200'
 : 'bg-paper-2 border-rule text-neutral hover:bg-paper-2'
 }`}
                                                >
                                                    <div>{s.label}</div>
                                                    <div className="text-xs mt-0.5 font-medium opacity-70">{s.desc}</div>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                {/* Modal Footer */}
                                <div className="p-6 pt-0 flex gap-3">
                                    <button
                                        type="button"
                                        onClick={() => setShowAdminLeaveModal(false)}
                                        className="flex-1 py-3 font-semibold text-sm bg-paper-2 text-neutral hover:bg-paper-3 border border-rule transition-colors duration-150"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAdminCreateLeave}
                                        disabled={adminLeaveLoading}
                                        className={`flex-1 py-3 font-semibold text-sm transition-colors duration-150 ${
 adminLeaveLoading
 ? 'bg-paper-3 text-neutral cursor-not-allowed'
 : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-cream hover:from-indigo-700 hover:to-indigo-800  '
 }`}
                                    >
                                        {adminLeaveLoading ? ' กำลังบันทึก...' : 'บันทึกใบลา'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- HIRING (APPLICATIONS) --- */}
                    {activeTab === 'applications' && (
                        <div className="space-y-6">
                            <h3 className="font-semibold text-charcoal">ใบสมัครงาน</h3>
                            <Card className="p-0 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-paper-2 text-neutral font-semibold text-xs">
                                        <tr><th className="p-4">ชื่อ</th><th className="p-4">ตำแหน่ง</th><th className="p-4">สถานะ</th><th className="p-4 text-right">จัดการ</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.jobApplications.map(app => (
                                            <tr key={app.id} className="hover:bg-paper-2">
                                                <td className="p-4 font-semibold text-charcoal">{app.full_name}</td>
                                                <td className="p-4 font-semibold text-charcoal">{app.position_applied}</td>
                                                <td className="p-4"><Badge color="slate">{app.status}</Badge></td>
                                                <td className="p-4 text-right">
                                                    <select value={app.status} onChange={(e) => handleUpdateApplicationStatus(app.id, e.target.value)} className="bg-paper-2 border text-xs p-1.5 font-semibold outline-none">
                                                        <option>Pending</option>
                                                        <option>Hired</option>
                                                        <option>Rejected</option>
                                                    </select>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                        </div>
                    )}

                    {/* --- NEWS/ANNOUNCEMENTS --- */}
                    {activeTab === 'announcements' && (
                        <div className="space-y-6">
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Creation Form */}
                                <div className="lg:col-span-2">
                                    <Card className="p-6">
                                        <h3 className="font-semibold text-charcoal text-lg mb-4 flex items-center gap-2">
                                            <span></span> โพสต์ประกาศใหม่
                                        </h3>
                                        <form onSubmit={handleAddAnnouncement} className="space-y-4">
                                            {/* Type Selection */}
                                            <div>
                                                <label className="text-xs font-semibold text-neutral block mb-2">ประเภทประกาศ</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnouncementType("fixed")}
                                                        className={`flex-1 py-3 px-4 border text-xs font-semibold transition-colors duration-150 duration-200 ${
 announcementType === "fixed"
 ? "bg-charcoal text-cream border-charcoal "
 : "bg-paper-2 border-rule text-charcoal hover:bg-paper-2"
 }`}
                                                    >
                                                        ปักหมุด (ถาวร)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnouncementType("temporary")}
                                                        className={`flex-1 py-3 px-4 border text-xs font-semibold transition-colors duration-150 duration-200 ${
 announcementType === "temporary"
 ? "bg-charcoal text-cream border-charcoal "
 : "bg-paper-2 border-rule text-charcoal hover:bg-paper-2"
 }`}
                                                    >
                                                        ชั่วคราว (กำหนดวันหมดอายุ)
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Message Input */}
                                            <div>
                                                <label className="text-xs font-semibold text-neutral block mb-1.5">ข้อความประกาศ</label>
                                                <textarea
                                                    rows="3"
                                                    value={newAnnouncement}
                                                    onChange={e => setNewAnnouncement(e.target.value)}
                                                    placeholder="พิมพ์ข้อความประกาศหรือระเบียบการที่นี่..."
                                                    className="w-full p-4 bg-paper-2 border border-rule text-sm font-semibold text-charcoal outline-none focus:ring-2 focus:ring-slate-300 transition-colors duration-150 placeholder:text-neutral placeholder:font-medium resize-none"
                                                />
                                            </div>

                                            {/* Expiration Settings (Only for temporary) */}
                                            {announcementType === "temporary" && (
                                                <div className="bg-paper-2 p-4 border border-rule space-y-3">
                                                    <label className="text-xs font-semibold text-neutral block">ตั้งเวลาหมดอายุ</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={expiresAt}
                                                        onChange={e => setExpiresAt(e.target.value)}
                                                        className="w-full p-3 bg-cream border border-rule text-sm font-semibold text-charcoal outline-none focus:ring-2"
                                                    />
                                                    {/* Presets */}
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        <button type="button" onClick={() => applyPresetExpiresAt('1h')} className="px-2.5 py-1.5 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            +1 ชม.
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('today')} className="px-2.5 py-1.5 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            สิ้นสุดวันนี้ (23:59)
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('tomorrow')} className="px-2.5 py-1.5 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            สิ้นสุดพรุ่งนี้ (23:59)
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('3d')} className="px-2.5 py-1.5 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            +3 วัน
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('1w')} className="px-2.5 py-1.5 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            +1 สัปดาห์
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Priority Settings */}
                                            <div>
                                                <label className="text-xs font-semibold text-neutral block mb-2">ระดับความสำคัญ</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnouncementPriority(1)}
                                                        className={`flex-1 py-2 px-4 border text-xs font-semibold transition-colors duration-150 duration-200 ${
 announcementPriority === 1
 ? "bg-paper-2 border-rule text-charcoal font-semibold "
 : "bg-paper-2 border-rule text-neutral hover:bg-paper-2"
 }`}
                                                    >
                                                        ปกติ
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnouncementPriority(2)}
                                                        className={`flex-1 py-2 px-4 border text-xs font-semibold transition-colors duration-150 duration-200 ${
 announcementPriority === 2
 ? "bg-paper-2 border-error text-error font-semibold "
 : "bg-paper-2 border-rule text-neutral hover:bg-paper-2"
 }`}
                                                    >
                                                        สำคัญ / ด่วน
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Submit Button */}
                                            <button
                                                type="submit"
                                                className="w-full py-4 bg-charcoal hover:bg-charcoal-2 text-cream text-sm font-semibold transition-colors duration-150 flex items-center justify-center gap-2"
                                            >
                                                เผยแพร่ประกาศ
                                            </button>
                                        </form>
                                    </Card>
                                </div>

                                {/* Live Preview Frame */}
                                <div>
                                    <Card className="p-6 h-full flex flex-col justify-between bg-paper-2/50 border-dashed border-rule">
                                        <div>
                                            <h4 className="text-xs font-semibold text-neutral mb-4 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 bg-paper-2"></span>
                                                ตัวอย่างบนมือถือ
                                            </h4>
                                            <div className="bg-paper-2 p-4 pt-8 pb-12 border-4 border-rule relative max-w-sm mx-auto overflow-hidden">
                                                {/* Phone speaker mimic */}
                                                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-4 bg-paper-3 flex items-center justify-center">
                                                    <span className="w-8 h-1 bg-neutral"></span>
                                                </div>

                                                {/* Weather Card Compact Mockup */}
                                                <div className="bg-cream/80 border border-white/80 p-3 mb-4 text-xs font-semibold text-neutral flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xl"></span>
                                                        <span className="text-charcoal text-xs font-semibold">32°C • แจ่มใส</span>
                                                    </div>
                                                    <span>ในบ้าน</span>
                                                </div>

                                                {/* Simulated Announcement Display */}
                                                <div className="space-y-3">
                                                    {announcementType === "fixed" ? (
                                                        <div className="w-full bg-cream border border-white p-3.5 flex items-start gap-2 relative overflow-hidden">
                                                            <div className="absolute top-0 left-0 w-1 h-full bg-paper-2" />
                                                            <span className="text-sm shrink-0"></span>
                                                            <div>
                                                                <div className="flex gap-1 mb-1">
                                                                    <span className="text-xs font-semibold text-plum bg-paper-2 px-1.5 py-0.5 border border-plum">ปักหมุด</span>
                                                                    {announcementPriority === 2 && <span className="text-xs font-semibold text-error bg-paper-2 px-1.5 py-0.5 border border-error">Urgent</span>}
                                                                </div>
                                                                <p className="text-xs font-semibold text-charcoal leading-normal break-words">{newAnnouncement || "พิมพ์ข้อความในแบบฟอร์มเพื่อดูตัวอย่าง..."}</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className={`w-full ${announcementPriority === 2 ? 'bg-gradient-to-br from-orange-50 to-white border-plum' : 'bg-cream border-white'} border p-3.5 flex items-start gap-2 relative overflow-hidden`}>
                                                            <div className={`absolute top-0 left-0 w-1 h-full ${announcementPriority === 2 ? 'bg-paper-2' : 'bg-paper-2'}`} />
                                                            <span className="text-sm shrink-0">{announcementPriority === 2 ? '🚨' : '📢'}</span>
                                                            <div className="pr-4">
                                                                <div className="flex items-center gap-1 mb-1 flex-wrap">
                                                                    <span className={`text-xs font-semibold ${announcementPriority === 2 ? 'text-plum bg-paper-2 border-plum' : 'text-plum bg-paper-2 border-plum'} px-1.5 py-0.5 border`}>
                                                                        {announcementPriority === 2 ? 'Important' : 'News'}
                                                                    </span>
                                                                    <span className="text-xs font-semibold text-neutral"> {expiresAt ? "หมดใน " + format(new Date(expiresAt), "HH:mm") : "สิ้นสุดวันนี้"}</span>
                                                                </div>
                                                                <p className="text-xs font-semibold text-charcoal leading-normal break-words">{newAnnouncement || "พิมพ์ข้อความในแบบฟอร์มเพื่อดูตัวอย่าง..."}</p>
                                                            </div>
                                                            <span className="absolute top-2 right-2 text-xs text-charcoal"></span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-xs text-neutral font-semibold text-center mt-4">
                                            *ตัวอย่างเสมือนจริงบนสเกลของเครื่องจริงหน้างาน
                                        </p>
                                    </Card>
                                </div>
                            </div>

                            {/* Announcements List Manager */}
                            <Card className="p-0 overflow-hidden">
                                {/* Tab filters */}
                                <div className="flex border-b border-rule p-2 bg-paper-2 gap-1 flex-wrap">
                                    {['active', 'expired', 'hidden', 'all'].map((f) => {
                                        const labelMap = { active: 'กำลังแสดงผล', expired: 'หมดอายุการใช้งาน', hidden: 'ปิดแสดงผล ', all: 'ทั้งหมด' };
                                        const count = data.announcements.filter(a => {
                                            const isExpired = a.expires_at && new Date(a.expires_at) <= new Date();
                                            if (f === 'active') return a.is_active && !isExpired;
                                            if (f === 'expired') return a.expires_at && isExpired;
                                            if (f === 'hidden') return !a.is_active;
                                            return true;
                                        }).length;
                                        return (
                                            <button
                                                key={f}
                                                type="button"
                                                onClick={() => setAnnouncementFilter(f)}
                                                className={`py-2 px-4 text-xs font-semibold transition-colors duration-150 ${
 announcementFilter === f
 ? 'bg-charcoal text-cream '
 : 'text-neutral hover:bg-paper-3/50 hover:text-charcoal'
 }`}
                                            >
                                                {labelMap[f]} ({count})
                                            </button>
                                        );
                                    })}
                                </div>

                                {/* Table layout */}
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-paper-2 text-neutral font-semibold text-xs border-b border-rule">
                                            <tr>
                                                <th className="px-4 py-3 whitespace-nowrap">ข้อมูลประกาศ</th>
                                                <th className="px-4 py-3 whitespace-nowrap">ระดับ</th>
                                                <th className="px-4 py-3 whitespace-nowrap">ประเภท</th>
                                                <th className="px-4 py-3 whitespace-nowrap">หมดอายุ</th>
                                                <th className="px-4 py-3 whitespace-nowrap">วันที่สร้าง</th>
                                                <th className="px-4 py-3 whitespace-nowrap text-right">การจัดการ</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {data.announcements
                                                .filter(a => {
                                                    const isExpired = a.expires_at && new Date(a.expires_at) <= new Date();
                                                    if (announcementFilter === 'active') return a.is_active && !isExpired;
                                                    if (announcementFilter === 'expired') return a.expires_at && isExpired;
                                                    if (announcementFilter === 'hidden') return !a.is_active;
                                                    return true;
                                                })
                                                .map(a => {
                                                    const isExpired = a.expires_at && new Date(a.expires_at) <= new Date();
                                                    const isFixed = a.expires_at === null;
                                                    
                                                    // Time remaining calculation
                                                    let timeStatus = "";
                                                    if (isFixed) {
                                                        timeStatus = "ปักหมุดถาวร";
                                                    } else {
                                                        const diffMs = new Date(a.expires_at) - new Date();
                                                        if (diffMs > 0) {
                                                            const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                                                            const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                                                            if (diffHrs > 0) {
                                                                timeStatus = `เหลือเวลาอีก ${diffHrs} ชม.`;
                                                            } else {
                                                                timeStatus = `เหลือเวลาอีก ${diffMins} นาที`;
                                                            }
                                                        } else {
                                                            timeStatus = "หมดอายุการใช้งานแล้ว";
                                                        }
                                                    }

                                                    return (
                                                        <tr key={a.id} className="hover:bg-paper-2/50">
                                                            <td className="px-4 py-3">
                                                                <div className="font-semibold text-charcoal max-w-xs truncate" title={a.message}>
                                                                    {a.message}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                <Badge color={a.priority > 1 ? 'rose' : 'slate'}>
                                                                    {a.priority > 1 ? 'ด่วน ' : 'ปกติ'}
                                                                </Badge>
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                <Badge color={isFixed ? 'blue' : 'amber'}>
                                                                    {isFixed ? 'ถาวร' : 'มีวันหมดอายุ'}
                                                                </Badge>
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap">
                                                                <div className="font-semibold text-charcoal text-xs">
                                                                    {!isFixed && format(new Date(a.expires_at), "d MMM yy · HH:mm", { locale: th })}
                                                                </div>
                                                                <div className={`text-xs font-semibold ${isExpired ? 'text-error' : isFixed ? 'text-plum' : 'text-plum'} mt-0.5`}>
                                                                    {timeStatus}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3 whitespace-nowrap font-semibold text-xs text-neutral">
                                                                {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <div className="flex justify-end gap-1 whitespace-nowrap">
                                                                <button
                                                                    onClick={() => handleToggleAnnouncement(a.id, a.is_active)}
                                                                    className={`min-h-11 px-3 text-sm font-semibold border transition-colors duration-150 ${
 a.is_active
 ? "bg-cream hover:bg-paper-2 border-rule text-charcoal"
 : "bg-cream hover:bg-paper-2 border-plum text-plum"
 }`}
                                                                    title={a.is_active ? "คลิกเพื่อซ่อน" : "คลิกเพื่อเปิดใช้งาน"}
                                                                >
                                                                    {a.is_active ? 'ซ่อน' : 'แสดง'}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleEditAnnouncement(a)}
                                                                    className="min-h-11 px-3 bg-cream border border-charcoal text-charcoal hover:bg-paper-2 text-sm font-semibold transition-colors duration-150"
                                                                >
                                                                    แก้ไข
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteAnnouncement(a.id)}
                                                                    className="hover:bg-paper-2 transition-colors duration-150 min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline text-error"
                                                                >ลบ</button>
                                                                </div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                    {data.announcements.length === 0 && (
                                        <div className="p-12 text-center text-neutral font-semibold">ไม่มีข้อมูลประกาศบันทึกอยู่</div>
                                    )}
                                </div>
                            </Card>

                            {/* Edit Announcement Modal */}
                            {editingAnnouncement && (
                                <div className="fixed inset-0 bg-charcoal/60 flex items-center justify-center z-50 p-4">
                                    <Card className="w-full max-w-lg bg-cream p-6 relative">
                                        <h3 className="text-lg font-semibold text-charcoal mb-4 flex items-center gap-1.5">
                                            แก้ไขข้อมูลประกาศ
                                        </h3>
                                        
                                        <div className="space-y-4">
                                            {/* Type */}
                                            <div>
                                                <label className="text-xs font-semibold text-neutral block mb-2">ประเภทประกาศ</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAnnouncement(prev => ({ ...prev, type: "fixed" }))}
                                                        className={`flex-1 py-2.5 px-4 border text-xs font-semibold transition-colors duration-150 duration-200 ${
 editingAnnouncement.type === "fixed"
 ? "bg-charcoal text-cream border-charcoal "
 : "bg-paper-2 border-rule text-charcoal hover:bg-paper-2"
 }`}
                                                    >
                                                        ปักหมุด (ถาวร)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAnnouncement(prev => ({ ...prev, type: "temporary" }))}
                                                        className={`flex-1 py-2.5 px-4 border text-xs font-semibold transition-colors duration-150 duration-200 ${
 editingAnnouncement.type === "temporary"
 ? "bg-charcoal text-cream border-charcoal "
 : "bg-paper-2 border-rule text-charcoal hover:bg-paper-2"
 }`}
                                                    >
                                                        ชั่วคราว (กำหนดวันหมดอายุ)
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Message */}
                                            <div>
                                                <label className="text-xs font-semibold text-neutral block mb-1.5">ข้อความประกาศ</label>
                                                <textarea
                                                    rows="3"
                                                    value={editingAnnouncement.message}
                                                    onChange={e => setEditingAnnouncement(prev => ({ ...prev, message: e.target.value }))}
                                                    className="w-full p-4 bg-paper-2 border border-rule text-sm font-semibold text-charcoal outline-none focus:ring-2 focus:ring-slate-300 transition-colors duration-150 resize-none"
                                                />
                                            </div>

                                            {/* Expiration Settings (Only for temporary) */}
                                            {editingAnnouncement.type === "temporary" && (
                                                <div className="bg-paper-2 p-4 border border-rule space-y-3">
                                                    <label className="text-xs font-semibold text-neutral block">ตั้งเวลาหมดอายุ</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={editingAnnouncement.expires_at_formatted}
                                                        onChange={e => setEditingAnnouncement(prev => ({ ...prev, expires_at_formatted: e.target.value }))}
                                                        className="w-full p-3 bg-cream border border-rule text-sm font-semibold text-charcoal outline-none focus:ring-2"
                                                    />
                                                    {/* Presets for edit */}
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        <button type="button" onClick={() => applyPresetExpiresAt('1h', true)} className="px-2 py-1 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            +1 ชม.
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('today', true)} className="px-2 py-1 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            สิ้นสุดวันนี้
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('tomorrow', true)} className="px-2 py-1 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            สิ้นสุดพรุ่งนี้
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('3d', true)} className="px-2 py-1 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            +3 วัน
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('1w', true)} className="px-2 py-1 bg-cream border border-rule hover:border-rule text-xs font-semibold text-neutral">
                                                            +1 สัปดาห์
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Priority Settings */}
                                            <div>
                                                <label className="text-xs font-semibold text-neutral block mb-2">ระดับความสำคัญ</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAnnouncement(prev => ({ ...prev, priority: 1 }))}
                                                        className={`flex-1 py-2 px-4 border text-xs font-semibold transition-colors duration-150 duration-200 ${
 Number(editingAnnouncement.priority) === 1
 ? "bg-paper-2 border-rule text-charcoal font-semibold"
 : "bg-paper-2 border-rule text-neutral hover:bg-paper-2"
 }`}
                                                    >
                                                        ปกติ
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAnnouncement(prev => ({ ...prev, priority: 2 }))}
                                                        className={`flex-1 py-2 px-4 border text-xs font-semibold transition-colors duration-150 duration-200 ${
 Number(editingAnnouncement.priority) === 2
 ? "bg-paper-2 border-error text-error font-semibold"
 : "bg-paper-2 border-rule text-neutral hover:bg-paper-2"
 }`}
                                                    >
                                                        สำคัญ / ด่วน
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 mt-6">
                                            <button
                                                type="button"
                                                onClick={() => setEditingAnnouncement(null)}
                                                className="flex-1 py-3 border border-rule text-neutral hover:bg-paper-2 text-sm font-semibold transition-colors"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveEditAnnouncement}
                                                className="flex-1 py-3 bg-charcoal hover:bg-charcoal-2 text-cream text-sm font-semibold transition-colors"
                                            >
                                                บันทึกการแก้ไข
                                            </button>
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- MEETING NOTES (PDF) --- */}
                    {activeTab === 'meetings' && (
                        <MeetingNotesManager />
                    )}

                    {/* --- NFC STATIONS MANAGER --- */}
                    {activeTab === 'nfc_stations' && (
                        <NfcStationManager />
                    )}

                    {/* --- STAFF INDIVIDUAL HISTORY --- */}
                    {activeTab === 'history' && (
                        <IndividualHistoryManager
                            employees={data.employees}
                            shifts={data.shifts}
                            schedules={data.schedules}
                            transactions={data.transactions}
                            leaveRequests={data.leaveRequests}
                            individualLogs={data.individualLogs}
                            individualStats={data.individualStats}
                            selectedEmpId={selectedEmpId}
                            setSelectedEmpId={setSelectedEmpId}
                            selectedMonth={selectedMonth}
                            setSelectedMonth={setSelectedMonth}
                            getShiftStatus={getShiftStatus}
                            handleToggleLogAction={handleToggleLogAction}
                            handleDeleteLog={handleDeleteLog}
                            setShowManualModal={setShowManualModal}
                            setManualForm={setManualForm}
                            onRefresh={fetchIndividualLogs}
                        />
                    )}

                    {/* --- SHIFT CONFIGURATION (SETTINGS) --- */}
                    {activeTab === 'settings' && (
                        <div className="space-y-6">
                            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-cream p-5 border border-charcoal">
                                <div>
                                    <h2 className="text-base font-semibold text-charcoal">
                                        ตั้งค่ากะงานและค่าจ้างมาตรฐาน
                                    </h2>
                                    <p className="text-xs text-neutral mt-1">
                                        กำหนดช่วงเวลาทำงาน ทำงาน, เวลาพัก, และเรทค่าจ้างมาตรฐานเริ่มต้นสำหรับแต่ละกะ
                                    </p>
                                </div>
                                <button
                                    onClick={async () => {
                                        const name = prompt("ระบุชื่อกะงานใหม่ (เช่น กะพิเศษ / Prep Shift):");
                                        if (!name) return;
                                        const startTime = prompt("เวลาเริ่ม (HH:mm):", "12:00") || "12:00";
                                        const endTime = prompt("เวลาสิ้นสุด (HH:mm):", "21:00") || "21:00";
                                        const rate = Number(prompt("อัตราค่าจ้างประจำกะ (บาท):", "380")) || 380;
                                        
                                        const { error } = await supabase.from('shifts').insert({
                                            name,
                                            start_time: startTime,
                                            end_time: endTime,
                                            rate,
                                            break_minutes: 60,
                                            is_active: true
                                        });
                                        if (!error) fetchData('shifts', 'shifts');
                                    }}
                                    className="flex items-center gap-1.5 px-4 py-2 bg-plum hover:bg-plum-2 text-cream text-xs font-semibold transition-colors duration-150 cursor-pointer"
                                >
                                    + เพิ่มกะงานใหม่
                                </button>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                {data.shifts.map(s => (
                                    <div key={s.id} className="p-4 bg-cream border border-charcoal space-y-3">
                                        <div className="flex items-center justify-between border-b border-rule pb-2.5">
                                            <div className="flex items-center gap-2">
                                                <div className="w-2.5 h-2.5 bg-plum"></div>
                                                <input 
                                                    type="text" 
                                                    value={s.name} 
                                                    onChange={e => handleUpdateShift(s.id, 'name', e.target.value)} 
                                                    className="font-num font-semibold text-sm text-charcoal bg-transparent outline-none border-b border-transparent focus:border-plum transition-colors duration-150"
                                                />
                                            </div>
                                            <span className="text-xs font-num text-neutral">
                                                ID: #{s.id}
                                            </span>
                                        </div>

                                        <div className="grid grid-cols-2 gap-3 text-xs font-num">
                                            <div>
                                                <label className="block text-xs text-neutral mb-1">เวลาเข้า - ออกงาน</label>
                                                <div className="flex items-center gap-1.5 bg-cream p-1.5 border border-rule">
                                                    <input 
                                                        type="time" 
                                                        value={s.start_time} 
                                                        onChange={e => handleUpdateShift(s.id, 'start_time', e.target.value)} 
                                                        className="w-full bg-transparent font-num text-center font-semibold text-charcoal outline-none text-xs" 
                                                    />
                                                    <span className="text-neutral text-xs"></span>
                                                    <input 
                                                        type="time" 
                                                        value={s.end_time} 
                                                        onChange={e => handleUpdateShift(s.id, 'end_time', e.target.value)} 
                                                        className="w-full bg-transparent font-num text-center font-semibold text-charcoal outline-none text-xs" 
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="block text-xs text-neutral mb-1">ค่าจ้างประจำกะ (บาท/กะ)</label>
                                                <div className="flex items-center bg-cream p-1.5 border border-rule">
                                                    <span className="text-neutral text-xs mr-1">฿</span>
                                                    <input 
                                                        type="number" 
                                                        value={s.rate ?? ''} 
                                                        placeholder="350"
                                                        onChange={e => handleUpdateShift(s.id, 'rate', Number(e.target.value))} 
                                                        className="w-full bg-transparent font-num font-semibold text-charcoal outline-none text-xs" 
                                                    />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex justify-between items-center text-xs font-num text-neutral pt-1">
                                            <span>หักเวลาพัก: {s.break_minutes || 60} นาที</span>
                                            <span className="text-plum font-semibold">
                                                {s.start_time} - {s.end_time}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    
                    {/* --- YUZU AI --- */}
                    {activeTab === 'yuzu' && (
                        <YuzuKnowledgeManager />
                    )}

                    {/* --- SHIFT SWAP & REQUESTS (SHIFTS TAB) --- */}
                    {activeTab === 'shift_manage' && (
                        <div className="grid md:grid-cols-2 gap-6">
                            <div className="space-y-4">
                                <h3 className="font-semibold text-charcoal">คำขอแลกกะรออนุมัติ</h3>
                                {data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').length === 0 ? <Card className="text-center text-neutral py-8 font-semibold">ไม่มีคำขอแลกกะค้าง</Card> :
                                    data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').map(req => (
                                        <Card key={req.id} className="space-y-3 border border-rule">
                                            <div className="flex justify-between"><Badge color="blue">{req.type}</Badge><span className="text-xs font-semibold text-charcoal">{req.target_date}</span></div>
                                            <div className="flex items-center gap-2 text-sm text-charcoal font-semibold"><span>{req.requester?.name}</span><span></span><span>{req.peer?.name || 'ใครก็ได้'}</span></div>
                                            <div className="text-xs text-neutral font-semibold">&quot;{req.notes}&quot;</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button onClick={() => handleSwapDecision(req.id, 'APPROVE')} className="bg-charcoal hover:bg-charcoal text-cream py-2 text-xs font-semibold">อนุมัติ</button>
                                                <button onClick={() => handleSwapDecision(req.id, 'REJECT')} className="bg-paper-2 hover:bg-paper-3 text-charcoal py-2 text-xs font-semibold">ไม่อนุมัติ</button>
                                            </div>
                                        </Card>
                                    ))}
                            </div>
                        </div>
                    )}
                    <footer className="w-full text-center py-6 mt-12 border-t border-rule text-xs text-neutral select-none">
                        ในบ้าน · หลังบ้าน HR
                    </footer>
                </main>
            </div>
        </div>
    );
}

// A reusable component to handle profile image loading errors gracefully.
// It falls back to a text-based initial avatar if the image fails to load.
const EmployeeAvatar = ({ employee, className = "w-9 h-9 ", textClassName = "text-xs font-semibold" }) => {
    const photoUrl = employee?.photo_url;
    const [prevPhotoUrl, setPrevPhotoUrl] = useState(photoUrl);
    const [imgError, setImgError] = useState(false);

    if (prevPhotoUrl !== photoUrl) {
        setPrevPhotoUrl(photoUrl);
        setImgError(false);
    }

    if (photoUrl && !imgError) {
        return (
            <img
                src={photoUrl}
                alt=""
                onError={() => setImgError(true)}
                className={`${className} object-cover border border-rule `}
                referrerPolicy="no-referrer"
            />
        );
    }

    const name = employee?.nickname || employee?.name || "??";
    const initials = name.slice(0, 2);
    return (
        <div className={`${className} bg-paper-2 border border-rule text-neutral flex items-center justify-center ${textClassName}`}>
            {initials}
        </div>
    );
};