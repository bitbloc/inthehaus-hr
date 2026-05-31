"use client";
import React, { useEffect, useState, useMemo, useReducer } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth, differenceInMinutes, startOfWeek, addDays } from "date-fns";
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
import YuzuKnowledgeManager from "./_components/YuzuKnowledgeManager";

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
    individualStats: { work_days: 0, late: 0, absent: 0 },
    // Logistics
    phoneOrders: [],
    tableReservations: []
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
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [isCheckingAuth, setIsCheckingAuth] = useState(true);
    const [loginUser, setLoginUser] = useState("");
    const [loginPass, setLoginPass] = useState("");
    const [activeTab, setActiveTab] = useState("dashboard");
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
    const [data, dispatch] = useReducer(dataReducer, initialState);
    const [isDrawerOpen, setIsDrawerOpen] = useState(false);

    useEffect(() => {
        if (sessionStorage.getItem("adminAuth") === "true") {
            setIsAuthenticated(true);
        }
        setIsCheckingAuth(false);
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

    const fetchEmployees = () => supabase.from("employees").select("*").eq("is_active", true).order("id")
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
                const s = data.schedules[selectedEmpId]?.[new Date(l.timestamp).getDay()];
                if (s?.shifts) {
                    const [h, m] = s.shifts.start_time.split(':');
                    const start = new Date(l.timestamp); start.setHours(h, m, 0);
                    if (differenceInMinutes(new Date(l.timestamp), start) > 15) late++;
                }
            }
        });
        dispatch({ type: 'SET_DATA', payload: { individualStats: { work_days: workDaysSet.size, late, absent } } });
    };

    const fetchOrders = async () => {
        const { data: orders } = await supabase.from("phone_orders").select("*").order("created_at", { ascending: false });
        dispatch({ type: 'SET_DATA', payload: { phoneOrders: orders || [] } });
    };

    const fetchReservations = async () => {
        const { data: res } = await supabase.from("table_reservations").select("*").order("reservation_date", { ascending: true });
        dispatch({ type: 'SET_DATA', payload: { tableReservations: res || [] } });
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
        if (activeTab === 'history') fetchIndividualLogs();
        if (activeTab === 'orders') fetchOrders();
        if (activeTab === 'reservations') fetchReservations();
    }, [activeTab, selectedMonth]);

    useEffect(() => {
        if (activeTab === 'history' && selectedEmpId !== 'ALL') fetchIndividualLogs();
    }, [selectedEmpId]);

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
        const publishedTransactions = data.transactions?.filter(t => t.status === 'PUBLISHED') || [];
        return calculatePayroll(
            data.employees, data.logs, publishedTransactions, data.shifts,
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
    const handleNotifySchedule = async () => { if (confirm("Publish?")) try { await fetch('/api/notify-schedule', { method: 'POST' }); alert("Success"); } catch (e) { } };

    // Employee Action
    const handleDeleteEmployee = async (id) => {
        if (!confirm("⚠️ This will PERMANENTLY delete this staff and all their history.\n\nAre you sure you want to completely remove them from the system so they can register again?")) return;

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

    // Logistics Actions
    const handleUpdateOrderStatus = async (id, status) => {
        const { error } = await supabase.from('phone_orders').update({ 
            status, 
            confirmed_at: status === 'CONFIRMED' ? new Date().toISOString() : undefined,
            done_at: status === 'DONE' ? new Date().toISOString() : undefined
        }).eq('id', id);
        if (!error) fetchOrders();
    };

    const handleUpdateReservationStatus = async (id, status) => {
        const { error } = await supabase.from('table_reservations').update({ status }).eq('id', id);
        if (!error) fetchReservations();
    };

    // --- Helpers ---
    const getShiftStatus = (log) => {
        const date = new Date(log.timestamp);
        const logDateLocalStr = format(date, 'yyyy-MM-dd');
        
        // 1. Check roster transaction override first (must be PUBLISHED)
        const tx = data.transactions?.find(t => 
            String(t.employee_id) === String(log.employee_id) && 
            t.date === logDateLocalStr &&
            t.status === 'PUBLISHED'
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
    }, [data.transactions]);

    const handleLogin = (e) => {
        e.preventDefault();
        if (loginUser === "inthehaus" && loginPass === "inthehaus1120100144907") {
            sessionStorage.setItem("adminAuth", "true");
            setIsAuthenticated(true);
        } else {
            alert("Invalid username or password");
        }
    };

    if (isCheckingAuth) return null;

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-[#F8F9FA] flex flex-col items-center justify-center p-4">
                <Card className="w-full max-w-sm p-8 space-y-6 bg-white shadow-xl border border-slate-100 rounded-3xl">
                    <div className="text-center space-y-2">
                        <div className="w-16 h-16 bg-slate-900 rounded-2xl mx-auto flex items-center justify-center text-white text-2xl font-bold shadow-lg shadow-slate-200">H</div>
                        <h1 className="text-2xl font-bold tracking-tight text-slate-800">Admin Login</h1>
                        <p className="text-sm text-slate-500 font-medium">Please enter your credentials</p>
                    </div>
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Username</label>
                            <input
                                type="text"
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-300 transition-all"
                                value={loginUser}
                                onChange={e => setLoginUser(e.target.value)}
                                required
                            />
                        </div>
                        <div>
                            <label className="text-xs font-bold text-slate-400 uppercase tracking-wider ml-1">Password</label>
                            <input
                                type="password"
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl mt-1 text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-300 transition-all"
                                value={loginPass}
                                onChange={e => setLoginPass(e.target.value)}
                                required
                            />
                        </div>
                        <button type="submit" className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold shadow-lg shadow-slate-200 hover:bg-slate-800 transition-transform active:scale-95 mt-4">
                            Access Dashboard
                        </button>
                    </form>
                </Card>
            </div>
        );
    }

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

    const navigationCategories = [
        {
            title: "Main HR & Scheduling",
            items: [
                { id: 'dashboard', label: 'Overview', icon: Icons.Sun },
                { id: 'roster', label: 'Roster', icon: Icons.Clock, isLink: true, href: '/admin/roster' },
                { id: 'shift_manage', label: 'Shifts', icon: Icons.Swap },
                { id: 'requests', label: 'Leave Requests', icon: Icons.Bell },
                { id: 'payroll', label: 'Payroll', icon: Icons.Money, isLink: true, href: '/admin/payroll' },
            ]
        },
        {
            title: "Restaurant Operations",
            items: [
                { id: 'orders', label: 'Phone Orders', icon: Icons.Clock },
                { id: 'reservations', label: 'Table Bookings', icon: Icons.Calendar },
                { id: 'applications', label: 'Hiring', icon: Icons.Job },
            ]
        },
        {
            title: "System Tools",
            items: [
                { id: 'employees', label: 'Staff Directory', icon: Icons.Staff },
                { id: 'announcements', label: 'News/Alerts', icon: Icons.Alert },
                { id: 'history', label: 'Individual History', icon: Icons.File },
                { id: 'yuzu', label: 'Yuzu AI', icon: Icons.Yuzu },
                { id: 'settings', label: 'Shift Config', icon: Icons.Settings },
            ]
        }
    ];

    const pendingLeaveCount = data.leaveRequests.filter(r => r.status === 'pending').length;
    const pendingSwapCount = data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').length;
    const pendingStaffCount = data.pendingEmployees?.length || 0;
    const totalAlertsCount = pendingLeaveCount + pendingSwapCount + pendingStaffCount;

    return (
        <div className="flex min-h-screen bg-[#F8F9FA] text-slate-800 font-sans selection:bg-slate-200">
            {/* Desktop Sidebar */}
            <aside className="hidden lg:flex flex-col w-64 bg-white border-r border-slate-200/50 sticky top-0 h-screen shrink-0 z-30">
                <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-100 shrink-0">
                    <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-slate-200">H</div>
                    <div>
                        <h1 className="text-base font-extrabold tracking-tight text-slate-800 leading-none">In the Haus</h1>
                        <p className="text-[9px] uppercase tracking-widest text-indigo-600 font-bold mt-1">HR & Operations</p>
                    </div>
                </div>

                <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar">
                    {navigationCategories.map((category, idx) => (
                        <div key={idx} className="space-y-2">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3">{category.title}</span>
                            <div className="space-y-1">
                                {category.items.map(item => {
                                    const active = activeTab === item.id;
                                    const Icon = item.icon;
                                    return (
                                        <button
                                            key={item.id}
                                            onClick={() => {
                                                if (item.isLink) {
                                                    window.location.href = item.href;
                                                } else {
                                                    setActiveTab(item.id);
                                                    setIsDrawerOpen(false);
                                                }
                                            }}
                                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 ${
                                                active
                                                    ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10 scale-[1.02]"
                                                    : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                            }`}
                                        >
                                            {Icon && <Icon size={18} strokeWidth={active ? 2.5 : 2} className={active ? "text-indigo-400" : "text-slate-400"} />}
                                            <span>{item.label}</span>
                                            {item.id === 'requests' && pendingLeaveCount > 0 && (
                                                <span className="ml-auto w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold animate-pulse">
                                                    {pendingLeaveCount}
                                                </span>
                                            )}
                                            {item.id === 'applications' && data.jobApplications.filter(r => r.status === 'Pending').length > 0 && (
                                                <span className="ml-auto w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                                                    {data.jobApplications.filter(r => r.status === 'Pending').length}
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                </nav>

                <div className="p-4 border-t border-slate-100 shrink-0">
                    <div className="flex items-center gap-3 px-2 py-1.5">
                        <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                            AD
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="text-xs font-bold text-slate-800 truncate">Administrator</p>
                            <p className="text-[10px] text-slate-400 font-medium truncate">inthehaus</p>
                        </div>
                        <button 
                            onClick={() => {
                                sessionStorage.removeItem("adminAuth");
                                window.location.reload();
                            }}
                            className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors"
                            title="Log Out"
                        >
                            <Icons.Out size={16} />
                        </button>
                    </div>
                </div>
            </aside>

            {/* Mobile Drawer (Slide-over) */}
            {isDrawerOpen && (
                <div className="fixed inset-0 z-50 lg:hidden flex">
                    <div 
                        onClick={() => setIsDrawerOpen(false)}
                        className="fixed inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity duration-300"
                    />
                    
                    <aside className="relative flex flex-col w-64 max-w-xs bg-white h-full shadow-2xl animate-in slide-in-from-left duration-250 z-50">
                        <div className="absolute top-4 right-4">
                            <button 
                                onClick={() => setIsDrawerOpen(false)}
                                className="p-1.5 hover:bg-slate-50 text-slate-400 hover:text-slate-600 rounded-lg transition-colors"
                            >
                                <Icons.X size={20} />
                            </button>
                        </div>
                        
                        <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-100 shrink-0">
                            <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-slate-200">H</div>
                            <div>
                                <h1 className="text-base font-extrabold tracking-tight text-slate-800 leading-none">In the Haus</h1>
                                <p className="text-[9px] uppercase tracking-widest text-indigo-600 font-bold mt-1">HR & Operations</p>
                            </div>
                        </div>
                        
                        <nav className="flex-1 overflow-y-auto px-4 py-6 space-y-6 custom-scrollbar">
                            {navigationCategories.map((category, idx) => (
                                <div key={idx} className="space-y-2">
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider px-3">{category.title}</span>
                                    <div className="space-y-1">
                                        {category.items.map(item => {
                                            const active = activeTab === item.id;
                                            const Icon = item.icon;
                                            return (
                                                <button
                                                    key={item.id}
                                                    onClick={() => {
                                                        if (item.isLink) {
                                                            window.location.href = item.href;
                                                        } else {
                                                            setActiveTab(item.id);
                                                            setIsDrawerOpen(false);
                                                        }
                                                    }}
                                                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-sm font-bold transition-all duration-200 ${
                                                        active
                                                            ? "bg-slate-900 text-white shadow-lg shadow-slate-900/10 scale-[1.02]"
                                                            : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                                                    }`}
                                                >
                                                    {Icon && <Icon size={18} strokeWidth={active ? 2.5 : 2} className={active ? "text-indigo-400" : "text-slate-400"} />}
                                                    <span>{item.label}</span>
                                                    {item.id === 'requests' && pendingLeaveCount > 0 && (
                                                        <span className="ml-auto w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                                                            {pendingLeaveCount}
                                                        </span>
                                                    )}
                                                    {item.id === 'applications' && data.jobApplications.filter(r => r.status === 'Pending').length > 0 && (
                                                        <span className="ml-auto w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold">
                                                            {data.jobApplications.filter(r => r.status === 'Pending').length}
                                                        </span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            ))}
                        </nav>
                        
                        <div className="p-4 border-t border-slate-100 shrink-0">
                            <div className="flex items-center gap-3 px-2 py-1.5">
                                <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs font-bold text-indigo-600">
                                    AD
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-800 truncate">Administrator</p>
                                    <p className="text-[10px] text-slate-400 font-medium truncate">inthehaus</p>
                                </div>
                                <button 
                                    onClick={() => {
                                        sessionStorage.removeItem("adminAuth");
                                        window.location.reload();
                                    }}
                                    className="p-1.5 hover:bg-rose-50 text-slate-400 hover:text-rose-500 rounded-lg transition-colors"
                                    title="Log Out"
                                >
                                    <Icons.Out size={16} />
                                </button>
                            </div>
                        </div>
                    </aside>
                </div>
            )}

            {/* Main content wrapper */}
            <div className="flex-1 flex flex-col min-w-0">
                {/* Mobile Top Header */}
                <header className="lg:hidden sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-slate-200/50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <button 
                            onClick={() => setIsDrawerOpen(true)}
                            className="p-2 -ml-2 text-slate-600 hover:bg-slate-50 rounded-xl transition-colors"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-6 h-6">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
                            </svg>
                        </button>
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 bg-slate-900 rounded-lg flex items-center justify-center text-white text-sm font-bold shadow-md shadow-slate-200">H</div>
                            <h1 className="text-sm font-extrabold tracking-tight text-slate-800 leading-none">In the Haus</h1>
                        </div>
                    </div>
                    
                    <div className="group relative bg-white px-3 py-1.5 rounded-xl border border-slate-200 flex items-center gap-1.5 shadow-sm">
                        <Icons.Calendar size={12} className="text-slate-400" />
                        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-transparent font-bold text-slate-700 outline-none text-xs cursor-pointer border-none p-0 focus:ring-0 w-24" />
                    </div>
                </header>

                {/* Main Scrollable Content */}
                <main className="flex-1 p-4 md:p-6 lg:p-8 max-w-7xl w-full mx-auto space-y-6">
                    {/* Header bar on Desktop */}
                    <div className="hidden lg:flex justify-between items-center mb-2">
                        <div>
                            <h1 className="text-2xl font-black text-slate-900 tracking-tight capitalize">
                                {activeTab === 'dashboard' ? 'Overview' : activeTab === 'shift_manage' ? 'Shifts Approval' : activeTab.replace('_', ' ')}
                            </h1>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-white px-4 py-2.5 rounded-2xl border border-slate-200/60 shadow-sm hover:shadow transition-all">
                            <Icons.Calendar size={16} className="text-indigo-500" />
                            <input 
                                type="month" 
                                value={selectedMonth} 
                                onChange={e => setSelectedMonth(e.target.value)} 
                                className="bg-transparent font-bold text-slate-800 outline-none text-sm cursor-pointer border-none p-0 focus:ring-0" 
                            />
                        </div>
                    </div>

                    {/* --- DASHBOARD --- */}
                    {activeTab === 'dashboard' && (
                        <div className="space-y-6">
                            {/* Welcome Header */}
                            <div className="bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 rounded-[2rem] p-6 md:p-8 text-white shadow-xl relative overflow-hidden">
                                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                                <div className="absolute bottom-0 left-1/3 w-48 h-48 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                                
                                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative z-10">
                                    <div>
                                        <span className="text-[10px] tracking-widest uppercase font-bold text-indigo-300 bg-indigo-500/20 px-2.5 py-1 rounded-full">Restaurant OS</span>
                                        <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight mt-2 text-white">ยินดีต้อนรับกลับมา, บอส 👋</h2>
                                        <p className="text-xs md:text-sm text-slate-300 mt-1 font-medium">ภาพรวมการปฏิบัติงานและตารางงานวันนี้ของคุณ</p>
                                    </div>
                                    <div className="flex gap-2">
                                        <button onClick={() => handleNotify('/api/notify')} className="px-4 py-2.5 bg-white/10 hover:bg-white/20 text-white text-xs font-bold rounded-xl border border-white/15 transition-all">Daily Summary LINE</button>
                                        <button onClick={() => setShowManualModal(true)} className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold rounded-xl shadow transition-all">+ Manual Entry</button>
                                        <button onClick={handleFinalizeDay} className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white text-xs font-bold rounded-xl border border-slate-700 transition-all">🏁 Cut-off วัน</button>
                                    </div>
                                </div>
                            </div>

                            {/* Draft Schedules Warning Card */}
                            {draftWeeks.map(week => (
                                <div key={week.start} className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/30 rounded-3xl p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 shadow-sm hover:shadow transition-all animate-fade-in-up">
                                    <div className="flex gap-3">
                                        <div className="w-10 h-10 bg-amber-500/20 rounded-2xl flex items-center justify-center text-amber-700 shrink-0">
                                            <Icons.Alert size={20} />
                                        </div>
                                        <div>
                                            <h4 className="font-extrabold text-slate-800 text-sm">พบตารางงานร่าง (Draft Roster) ที่ยังไม่เผยแพร่</h4>
                                            <p className="text-xs text-slate-600 mt-1 font-medium">
                                                สัปดาห์วันที่ {formatDate(week.start)} - {formatDate(week.end)} (มีทั้งหมด {week.count} กะงานที่ยังไม่ได้เผยแพร่)
                                            </p>
                                        </div>
                                    </div>
                                    <button 
                                        onClick={() => handlePublishRoster(week.start, week.end)}
                                        className="w-full sm:w-auto px-4 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow transition-colors shrink-0"
                                    >
                                        อนุมัติ & ประกาศ LINE
                                    </button>
                                </div>
                            ))}

                            {/* Quick Stats */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                                <Card className="relative overflow-hidden hover:scale-[1.02]">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Active Staff</p>
                                            <h3 className="text-3xl font-black text-slate-800 mt-2">{data.employees.length}</h3>
                                        </div>
                                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-500">
                                            <Icons.Staff size={20} />
                                        </div>
                                    </div>
                                </Card>

                                <Card className="relative overflow-hidden hover:scale-[1.02]">
                                    {(() => {
                                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                                        const todayLogs = data.logs.filter(log => format(new Date(log.timestamp), 'yyyy-MM-dd') === todayStr);
                                        const todayCheckIns = todayLogs.filter(log => log.action_type === 'check_in').length;
                                        return (
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Today Check-ins</p>
                                                    <h3 className="text-3xl font-black text-indigo-600 mt-2">{todayCheckIns}</h3>
                                                </div>
                                                <div className="w-10 h-10 bg-indigo-50 rounded-xl flex items-center justify-center text-indigo-500">
                                                    <Icons.Check size={20} />
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </Card>

                                <Card className="relative overflow-hidden hover:scale-[1.02]">
                                    {(() => {
                                        const todayStr = format(new Date(), 'yyyy-MM-dd');
                                        const todayLogs = data.logs.filter(log => format(new Date(log.timestamp), 'yyyy-MM-dd') === todayStr);
                                        const todayLates = todayLogs.filter(log => {
                                            if (log.action_type !== 'check_in') return false;
                                            const status = getShiftStatus(log);
                                            return status.label.includes('Late');
                                        }).length;
                                        return (
                                            <div className="flex justify-between items-start">
                                                <div>
                                                    <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Late Today</p>
                                                    <h3 className="text-3xl font-black text-amber-600 mt-2">{todayLates}</h3>
                                                </div>
                                                <div className="w-10 h-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-500">
                                                    <Icons.Alert size={20} />
                                                </div>
                                            </div>
                                        );
                                    })()}
                                </Card>

                                <Card className="relative overflow-hidden hover:scale-[1.02]">
                                    <div className="flex justify-between items-start">
                                        <div>
                                            <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Pending Alerts</p>
                                            <h3 className="text-3xl font-black text-rose-600 mt-2">{totalAlertsCount}</h3>
                                        </div>
                                        <div className="w-10 h-10 bg-rose-50 rounded-xl flex items-center justify-center text-rose-500">
                                            <Icons.Bell size={20} />
                                        </div>
                                    </div>
                                </Card>
                            </div>

                            {/* Main Grid: Alerts Hub & Real-time Activity */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                {/* Real-time Activity Feed */}
                                <div className="lg:col-span-2 space-y-6">
                                    <Card className="p-0 overflow-hidden flex flex-col max-h-[650px] border border-slate-100">
                                        <div className="p-6 border-b border-slate-100 flex justify-between items-center shrink-0 bg-white sticky top-0 z-20">
                                            <h3 className="font-extrabold text-slate-800 text-base">Real-time Activity Feed</h3>
                                            <button
                                                onClick={() => setShowAllLogs(!showAllLogs)}
                                                className="text-xs font-bold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg hover:bg-slate-200 transition-colors"
                                            >
                                                {showAllLogs ? 'Show Less' : 'View All'}
                                            </button>
                                        </div>
                                        <div className="overflow-auto custom-scrollbar flex-1">
                                            <table className="w-full text-sm text-left relative">
                                                <thead className="bg-slate-50/95 backdrop-blur text-slate-500 uppercase text-[10px] font-extrabold tracking-wider sticky top-0 z-10 border-b border-slate-100 shadow-sm">
                                                    <tr>
                                                        <th className="px-6 py-4 whitespace-nowrap">Date</th>
                                                        <th className="px-6 py-4 whitespace-nowrap">Time</th>
                                                        <th className="px-6 py-4 whitespace-nowrap">Photo</th>
                                                        <th className="px-6 py-4 whitespace-nowrap">Staff</th>
                                                        <th className="px-6 py-4 whitespace-nowrap">Action</th>
                                                        <th className="px-6 py-4 whitespace-nowrap">Status</th>
                                                        <th className="px-6 py-4 whitespace-nowrap w-10"></th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-100">
                                                    {(showAllLogs ? data.logs : data.logs.slice(0, 15)).map(log => {
                                                        const status = getShiftStatus(log);
                                                        return (
                                                            <tr key={log.id} className="group hover:bg-slate-50/50 transition-all duration-150">
                                                                <td className="px-6 py-4 font-mono text-slate-900 font-extrabold text-xs whitespace-nowrap">{formatDate(log.timestamp)}</td>
                                                                <td className="px-6 py-4 font-mono text-slate-900 font-black text-sm whitespace-nowrap">{formatTime(log.timestamp)}</td>
                                                                <td className="px-6 py-4">
                                                                    {log.photo_url ? (
                                                                        <a href={log.photo_url} target="_blank" rel="noopener noreferrer">
                                                                            <img src={log.photo_url} alt="log" className="w-10 h-10 rounded-lg object-cover border border-slate-100 shadow-sm hover:scale-150 transition-transform duration-200" referrerPolicy="no-referrer" />
                                                                        </a>
                                                                    ) : <span className="text-slate-300 font-bold">-</span>}
                                                                </td>
                                                                <td className="px-6 py-4 font-black text-slate-900 flex items-center gap-3 whitespace-nowrap">
                                                                    <div className="w-8 h-8 rounded-full bg-indigo-50 border border-indigo-100 flex items-center justify-center text-xs text-indigo-600 font-black shrink-0">
                                                                        {log.employees?.name?.charAt(0)}
                                                                    </div>
                                                                    {log.employees?.name}
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap">
                                                                    <Badge color={log.action_type === 'check_in' ? 'blue' : log.action_type === 'absent' ? 'rose' : 'slate'}>
                                                                        {log.action_type === 'check_in' ? 'Check In' : log.action_type === 'check_out' ? 'Check Out' : 'Absent'}
                                                                    </Badge>
                                                                </td>
                                                                <td className="px-6 py-4 whitespace-nowrap"><Badge color={status.color}>{status.label}</Badge></td>
                                                                <td className="px-6 py-4 whitespace-nowrap text-right">
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleDeleteLog(log.id); }}
                                                                        className="p-2 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded-full transition-all"
                                                                        title="Delete Log"
                                                                    >
                                                                        <Icons.Trash size={14} />
                                                                    </button>
                                                                </td>
                                                            </tr>
                                                        );
                                                    })}
                                                    {!showAllLogs && data.logs.length > 15 && (
                                                        <tr>
                                                            <td colSpan="7" className="px-6 py-4 text-center">
                                                                <button
                                                                    onClick={() => setShowAllLogs(true)}
                                                                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
                                                                >
                                                                    Show {data.logs.length - 15} more...
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    )}
                                                </tbody>
                                            </table>
                                        </div>
                                    </Card>
                                </div>

                                {/* Alerts Hub (Action Center) */}
                                <div className="space-y-6">
                                    <Card className="border border-slate-100">
                                        <div className="flex justify-between items-center mb-4 pb-2 border-b border-slate-100">
                                            <h3 className="font-extrabold text-slate-800 text-base">Alerts Hub (Action Center)</h3>
                                            <Badge color={totalAlertsCount > 0 ? "orange" : "emerald"}>
                                                {totalAlertsCount > 0 ? `${totalAlertsCount} pending` : "All cleared"}
                                            </Badge>
                                        </div>

                                        <div className="space-y-4 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                                            {totalAlertsCount === 0 ? (
                                                <div className="text-center py-12 space-y-3">
                                                    <div className="w-12 h-12 bg-emerald-50 text-emerald-600 rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                                                        ✓
                                                    </div>
                                                    <p className="text-xs font-extrabold text-slate-700">ทุกอย่างเรียบร้อยดี!</p>
                                                    <p className="text-[10px] text-slate-600">ไม่มีคำขออนุมัติหรือพนักงานสมัครใหม่ในขณะนี้</p>
                                                </div>
                                            ) : (
                                                <>
                                                    {/* 1. Leave Requests */}
                                                    {data.leaveRequests.filter(r => r.status === 'pending').map(req => (
                                                        <div key={`leave-${req.id}`} className="p-4 bg-rose-50/50 border border-rose-100 rounded-2xl space-y-3 animate-fade-in-up">
                                                            <div className="flex justify-between items-start">
                                                                <Badge color="rose">ขอลาหยุด</Badge>
                                                                <span className="text-[10px] font-black text-slate-900">{formatDate(req.leave_date)}</span>
                                                            </div>
                                                            <div className="text-xs text-slate-800">
                                                                <span className="font-extrabold text-slate-900">{req.employees?.name}</span> ขอลาหยุดประเภท <span className="font-bold text-indigo-600">{req.leave_type}</span>
                                                                <p className="mt-1 font-medium text-slate-600 font-semibold">เหตุผล: &quot;{req.reason || '-'}&quot;</p>
                                                                {req.replacement_employee && (
                                                                    <p className="mt-1 text-xs font-bold text-slate-700">
                                                                        👤 คนทำงานแทน: <span className="text-indigo-650 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded-md">{req.replacement_employee.name} {req.replacement_employee.nickname ? `(${req.replacement_employee.nickname})` : ""}</span>
                                                                    </p>
                                                                )}
                                                            </div>
                                                            <div className="flex gap-2 justify-end pt-1">
                                                                <button 
                                                                    onClick={() => handleLeaveAction(req, 'approved')} 
                                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg shadow-sm"
                                                                >
                                                                    ✓ อนุมัติ
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleLeaveAction(req, 'rejected')} 
                                                                    className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[10px] rounded-lg"
                                                                >
                                                                    ✕ ปฏิเสธ
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {/* 2. Shift Swaps */}
                                                    {data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').map(req => (
                                                        <div key={`swap-${req.id}`} className="p-4 bg-blue-50/50 border border-blue-100 rounded-2xl space-y-3 animate-fade-in-up">
                                                            <div className="flex justify-between items-start">
                                                                <Badge color="blue">สลับกะ</Badge>
                                                                <span className="text-[10px] font-black text-slate-900">{req.target_date}</span>
                                                            </div>
                                                            <div className="text-xs text-slate-800">
                                                                <span className="font-extrabold text-slate-900">{req.requester?.name}</span> ขอสลับกะกับ <span className="font-bold text-slate-900">{req.peer?.name || 'Open Pool'}</span>
                                                                <p className="mt-1 font-medium text-slate-600 font-semibold">โน้ต: &quot;{req.notes || '-'}&quot;</p>
                                                            </div>
                                                            <div className="flex gap-2 justify-end pt-1">
                                                                <button 
                                                                    onClick={() => handleSwapDecision(req.id, 'APPROVE')} 
                                                                    className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg shadow-sm"
                                                                >
                                                                    ✓ อนุมัติ
                                                                </button>
                                                                <button 
                                                                    onClick={() => handleSwapDecision(req.id, 'REJECT')} 
                                                                    className="px-3 py-1.5 bg-rose-100 hover:bg-rose-200 text-rose-700 font-bold text-[10px] rounded-lg"
                                                                >
                                                                    ✕ ปฏิเสธ
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}

                                                    {/* 3. Pending Employees */}
                                                    {data.pendingEmployees?.map(emp => (
                                                        <div key={`emp-${emp.id}`} className="p-4 bg-amber-50/50 border border-amber-100 rounded-2xl space-y-3 animate-fade-in-up">
                                                            <div className="flex justify-between items-start">
                                                                <Badge color="amber">พนักงานสมัครใหม่</Badge>
                                                                <span className="text-[10px] font-black text-slate-900">สมัครทาง LINE</span>
                                                            </div>
                                                            <div className="text-xs text-slate-800">
                                                                <span className="font-extrabold text-slate-900">{emp.name}</span> ได้สมัครบัญชีพนักงานเข้ามา รอคุณอนุมัติ
                                                            </div>
                                                            <div className="flex justify-end pt-1">
                                                                <button 
                                                                    onClick={() => { setEditingStaff(emp); setShowStaffModal(true); }}
                                                                    className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-[10px] rounded-lg shadow-sm"
                                                                >
                                                                    ตั้งค่า & อนุมัติบัญชี
                                                                </button>
                                                            </div>
                                                        </div>
                                                    ))}
                                                </>
                                            )}
                                        </div>
                                    </Card>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Manual Entry Modal */}
                    {showManualModal && (
                        <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                            <Card className="w-full max-w-sm space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                <div className="flex justify-between items-center">
                                    <h3 className="font-extrabold text-slate-800">Manual Attendance</h3>
                                    <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                                </div>

                                <div className="space-y-3">
                                    <div>
                                        <label className="text-xs font-bold text-slate-700 uppercase">Employee</label>
                                        <select
                                            className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none focus:ring-2 focus:ring-slate-200"
                                            value={manualForm.empId}
                                            onChange={e => setManualForm({ ...manualForm, empId: e.target.value })}
                                        >
                                            <option value="">Select Employee</option>
                                            {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                        </select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-3">
                                        <div>
                                            <label className="text-xs font-bold text-slate-700 uppercase">Date</label>
                                            <input
                                                type="date"
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                                                value={manualForm.date}
                                                onChange={e => setManualForm({ ...manualForm, date: e.target.value })}
                                            />
                                        </div>
                                        <div>
                                            <label className="text-xs font-bold text-slate-700 uppercase">Time</label>
                                            <input
                                                type="time"
                                                className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                                                value={manualForm.time}
                                                onChange={e => setManualForm({ ...manualForm, time: e.target.value })}
                                            />
                                        </div>
                                    </div>

                                    <div>
                                        <label className="text-xs font-bold text-slate-700 uppercase">Action Type</label>
                                        <div className="grid grid-cols-2 gap-2 mt-1">
                                            <button
                                                onClick={() => setManualForm({ ...manualForm, type: 'check_in' })}
                                                className={`p-3 rounded-xl text-sm font-bold border transition-all ${manualForm.type === 'check_in' ? 'bg-emerald-50 border-emerald-500 text-emerald-700 ring-1 ring-emerald-500' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                            >
                                                Check In
                                            </button>
                                            <button
                                                onClick={() => setManualForm({ ...manualForm, type: 'check_out' })}
                                                className={`p-3 rounded-xl text-sm font-bold border transition-all ${manualForm.type === 'check_out' ? 'bg-amber-50 border-amber-500 text-amber-700 ring-1 ring-amber-500' : 'bg-white border-slate-200 text-slate-500 hover:border-slate-300'}`}
                                            >
                                                Check Out
                                            </button>
                                        </div>
                                    </div>

                                    <button
                                        onClick={handleManualSubmit}
                                        className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold shadow-lg shadow-slate-200 hover:bg-slate-900 transition-transform active:scale-95"
                                    >
                                        Confirm Entry
                                    </button>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* --- PAYROLL FALLBACK --- */}
                    {activeTab === 'payroll' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-end">
                                <div>
                                    <h2 className="text-xl font-extrabold text-slate-800">Payroll Overview</h2>
                                    <p className="text-slate-600 text-xs font-bold">Salary calculation period: {selectedMonth}</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => setShowDeductModal(true)} className="text-xs font-bold text-rose-600 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 hover:bg-rose-100">- Deduct</button>
                                    <button onClick={handleExportExcel} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 hover:bg-emerald-100">Export Excel</button>
                                </div>
                            </div>

                            <Card className="p-0 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-600 font-bold text-[10px] uppercase tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4 w-10"></th>
                                            <th className="px-6 py-4">Employee</th>
                                            <th className="px-6 py-4 text-center">Days</th>
                                            <th className="px-6 py-4 text-right">Base Pay</th>
                                            <th className="px-6 py-4 text-right">OT Pay</th>
                                            <th className="px-6 py-4 text-right text-rose-500">Deduct</th>
                                            <th className="px-6 py-4 text-right text-emerald-600">Net Total</th>
                                            <th className="px-6 py-4 text-center">Stats</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {payrollData.map((row) => (
                                            <React.Fragment key={row.emp.id}>
                                                <tr onClick={() => setExpandedPayrollRow(expandedPayrollRow === row.emp.id ? null : row.emp.id)} className={`cursor-pointer transition-colors hover:bg-slate-50 ${expandedPayrollRow === row.emp.id ? 'bg-slate-50' : ''}`}>
                                                    <td className="px-6 py-4 text-center text-slate-400 text-xs">{expandedPayrollRow === row.emp.id ? '▼' : '▶'}</td>
                                                    <td className="px-6 py-4 font-bold text-slate-900 flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs">{row.emp.name.charAt(0)}</div>
                                                        <div>{row.emp.name}<div className="text-[10px] font-bold text-slate-600">{row.emp.position}</div></div>
                                                    </td>
                                                    <td className="px-6 py-4 text-center font-bold text-slate-700">{row.workDays}</td>
                                                    <td className="px-6 py-4 text-right font-mono text-slate-900 font-bold">{row.totalSalary.toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-right font-mono text-blue-700 font-bold">{row.totalOTPay.toLocaleString()}</td>
                                                    <td className="px-6 py-4 text-right font-mono text-rose-500 font-bold">{row.totalDeduct > 0 ? `-${row.totalDeduct}` : '-'}</td>
                                                    <td className="px-6 py-4 text-right font-mono text-emerald-600 font-black text-base">{row.netSalary.toLocaleString()} ฿</td>
                                                    <td className="px-6 py-4 text-center"><div className="flex justify-center gap-1">{row.lateCount > 0 && <Badge color="amber">L:{row.lateCount}</Badge>}{row.absentCount > 0 && <Badge color="rose">A:{row.absentCount}</Badge>}</div></td>
                                                </tr>
                                                {expandedPayrollRow === row.emp.id && (
                                                    <tr className="bg-slate-50/50">
                                                        <td colSpan="8" className="p-6">
                                                            <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-inner">
                                                                <div className="p-3 bg-slate-100 flex justify-between items-center text-xs font-bold text-slate-500">
                                                                    <span>🗓️ Daily Details</span>
                                                                    <span className="font-mono text-slate-800 font-bold">Wage: {row.totalSalary} | OT: {row.totalOTPay} ({row.totalOTHours}h)</span>
                                                                </div>
                                                                <table className="w-full text-xs text-left">
                                                                    <thead className="border-b border-slate-100 bg-white text-slate-900"><tr><th className="p-3">Date</th><th className="p-3">Shift</th><th className="p-3 text-center">Time</th><th className="p-3 text-right">Wage</th><th className="p-3 text-right">OT</th><th className="p-3">Status</th></tr></thead>
                                                                    <tbody className="divide-y divide-slate-100">
                                                                        {row.dailyDetails.map((day, idx) => (
                                                                            <tr key={idx} className="hover:bg-slate-50">
                                                                                <td className="p-3 font-mono text-slate-900 font-black">{formatDate(day.date, "dd MMM")}</td>
                                                                                <td className="p-3 font-bold text-slate-800">{day.shift}</td>
                                                                                <td className="p-3 text-center font-mono text-slate-900 font-extrabold">{day.in} - {day.out}</td>
                                                                                <td className="p-3 text-right font-mono font-bold text-slate-900">{day.wage > 0 ? day.wage : '-'}</td>
                                                                                <td className="p-3 text-right font-mono text-blue-600 font-bold">{day.ot > 0 ? `+${day.ot}` : '-'}</td>
                                                                                <td className="p-3"><Badge color={day.status.includes('Late') ? 'amber' : day.status === 'Absent' ? 'rose' : day.status.includes('Extra') ? 'purple' : day.status === 'Normal' ? 'emerald' : 'slate'}>{day.status}</Badge></td>
                                                                            </tr>
                                                                        ))}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        ))}
                                    </tbody>
                                </table>
                                {showDeductModal && (<div className="fixed inset-0 bg-black/55 flex items-center justify-center z-50 p-4"><Card className="w-full max-w-sm"><h3 className="font-extrabold mb-4 text-slate-850">Add Deduction</h3><div className="space-y-2"><select className="w-full p-2 border rounded" onChange={e => setDeductForm({ ...deductForm, empId: e.target.value })}><option value="">Select Staff</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><input type="number" placeholder="Amount" className="w-full p-2 border rounded" onChange={e => setDeductForm({ ...deductForm, amount: e.target.value })} /><input type="text" placeholder="Reason" className="w-full p-2 border rounded" onChange={e => setDeductForm({ ...deductForm, reason: e.target.value })} /><div className="flex gap-2"><button onClick={handleAddDeduction} className="bg-slate-800 text-white flex-1 py-2 rounded">Save</button><button onClick={() => setShowDeductModal(false)} className="bg-slate-100 flex-1 py-2 rounded">Cancel</button></div></div></Card></div>)}
                            </Card>
                        </div>
                    )}

                    {/* --- ROSTER FALLBACK --- */}
                    {activeTab === 'roster' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-center bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                                <div className="font-extrabold text-slate-800 text-sm">Weekly Template Schedule</div>
                                <button onClick={handleNotifySchedule} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold">Publish to LINE</button>
                            </div>
                            <Card className="p-0 overflow-hidden">
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm border-collapse">
                                        <thead><tr><th className="p-4 text-left bg-slate-50 font-bold text-slate-500 text-xs">Staff</th>{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => <th key={d} className="p-4 bg-slate-50 text-center text-slate-500 text-xs">{d}</th>)}</tr></thead>
                                        <tbody>
                                            {data.employees.map(emp => (
                                                <tr key={emp.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                                                    <td className="p-4 font-black text-slate-800 bg-white sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{emp.name}</td>
                                                    {[0, 1, 2, 3, 4, 5, 6].map(i => {
                                                        const s = data.schedules[emp.id]?.[i];
                                                        return (
                                                            <td key={i} className="p-2 text-center min-w-[120px]">
                                                                <select
                                                                    className={`w-full p-2 rounded-lg text-xs font-bold outline-none cursor-pointer transition appearance-none text-center border ${s?.is_off
                                                                        ? 'bg-slate-100 text-slate-600 border-slate-200'
                                                                        : 'bg-indigo-50 text-indigo-600 border-indigo-100'
                                                                        }`}
                                                                    value={s?.is_off ? 'OFF' : (s?.shift_id || '')}
                                                                    onChange={(e) => handleUpdateSchedule(emp.id, i, e.target.value === 'OFF' ? null : e.target.value, e.target.value === 'OFF')}
                                                                >
                                                                    <option value="" disabled>-</option>
                                                                    {data.shifts.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
                                                                    <option value="OFF">OFF</option>
                                                                </select>
                                                            </td>
                                                        )
                                                    })}
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </div>
                    )}

                    {/* --- STAFF DIRECTORY --- */}
                    {activeTab === 'employees' && (
                        <div className="space-y-6">
                            {/* Pending Approvals Section */}
                            {data.pendingEmployees?.length > 0 && (
                                <div className="space-y-4 animate-fade-in-up">
                                    <h3 className="font-extrabold text-lg text-amber-600 flex items-center gap-2">
                                        ⚠️ Pending Approvals <Badge color="amber">{data.pendingEmployees.length}</Badge>
                                    </h3>
                                    <Card className="p-0 overflow-hidden border border-amber-200 ring-4 ring-amber-50">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-amber-50 text-amber-800 font-extrabold text-xs uppercase">
                                                <tr>
                                                    <th className="p-4">Name</th>
                                                    <th className="p-4">Suggested Role</th>
                                                    <th className="p-4 text-right">Action</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-amber-100 bg-white">
                                                {data.pendingEmployees.map(emp => (
                                                    <tr key={emp.id} className="hover:bg-amber-50/50">
                                                        <td className="p-4 font-black text-slate-800 flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-slate-200 overflow-hidden">
                                                                {emp.photo_url ? <img src={emp.photo_url} className="w-full h-full object-cover" referrerPolicy="no-referrer" /> : <div className="w-full h-full flex items-center justify-center text-xs text-slate-500 font-bold">{emp.name?.charAt(0)}</div>}
                                                            </div>
                                                            <div>
                                                                {emp.name}
                                                                <div className="text-[10px] text-slate-700 font-bold font-mono tracking-tight">{emp.line_user_id}</div>
                                                            </div>
                                                        </td>
                                                        <td className="p-4 text-slate-600 font-bold italic">Waiting for assignment...</td>
                                                        <td className="p-4 text-right">
                                                            <button
                                                                onClick={() => { setEditingStaff(emp); setShowStaffModal(true) }}
                                                                className="text-white bg-slate-850 font-bold text-xs hover:bg-slate-900 px-4 py-2 rounded-lg shadow-sm"
                                                            >
                                                                Inspect & Approve
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </Card>
                                </div>
                            )}

                            <div className="flex justify-between items-center"><h3 className="font-extrabold text-lg text-slate-800">Staff Management</h3><button onClick={() => { setEditingStaff(null); setShowStaffModal(true) }} className="bg-slate-850 text-white px-5 py-2.5 rounded-xl font-black hover:bg-slate-900 shadow-lg">+ Add Staff</button></div>
                            <Card className="p-0 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-extrabold text-xs uppercase">
                                        <tr><th className="p-4">Name</th><th className="p-4">Position</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.employees.map(emp => (
                                            <tr key={emp.id} className="hover:bg-slate-50">
                                                <td className="p-4 font-black text-slate-900">{emp.name}</td>
                                                <td className="p-4 text-slate-850 font-bold">{emp.position}</td>
                                                <td className="p-4"><Badge color={emp.employment_status === 'Fulltime' ? 'emerald' : 'slate'}>{emp.employment_status || '-'}</Badge></td>
                                                <td className="p-4 text-right flex justify-end gap-2">
                                                    <button onClick={() => { setEditingStaff(emp); setShowStaffModal(true) }} className="text-blue-600 font-black text-xs hover:bg-blue-50 px-2 py-1 rounded">Edit</button>
                                                    <LongPressButton onLongPress={() => handleDeleteEmployee(emp.id)} />
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </Card>
                            <StaffModal isOpen={showStaffModal} onClose={() => setShowStaffModal(false)} onSave={handleSaveStaff} initialData={editingStaff} isEditing={!!editingStaff} />
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
                                        <h3 className="font-extrabold text-slate-800 text-2xl">Leave Requests (คำขอลาหยุดพนักงาน)</h3>
                                        <p className="text-slate-500 text-xs mt-1 font-medium font-bold">จัดการใบลา อนุมัติ และตรวจสอบการทำงานแทนกันในระบบ</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        {selectedLeaveIds.length > 0 && (
                                            <button
                                                type="button"
                                                onClick={handleDeleteMultipleLeaves}
                                                className="px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm bg-rose-600 text-white border-rose-700 hover:bg-rose-700 active:scale-95"
                                            >
                                                🗑️ ลบใบลาที่เลือก ({selectedLeaveIds.length})
                                            </button>
                                        )}
                                        <button
                                            type="button"
                                            onClick={() => setLeaveShowAllMonths(prev => !prev)}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm ${
                                                leaveShowAllMonths
                                                    ? 'bg-slate-900 text-white border-slate-950 hover:bg-black'
                                                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                                            }`}
                                        >
                                            {leaveShowAllMonths ? '📅 แสดงเฉพาะเดือนที่เลือก' : '🌐 แสดงประวัติทั้งหมด'}
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setShowAdminLeaveModal(true)}
                                            className="px-4 py-2 rounded-xl text-xs font-bold transition-all border shadow-sm bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 active:scale-95"
                                        >
                                            ➕ เพิ่มใบลา (Admin)
                                        </button>
                                    </div>
                                </div>


                                {/* Stat Cards */}
                                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                                    <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex items-center gap-4">
                                        <div className="w-12 h-12 bg-slate-55 text-slate-600 rounded-xl flex items-center justify-center text-lg select-none">📋</div>
                                        <div>
                                            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">ทั้งหมด (เดือนนี้)</div>
                                            <div className="text-xl font-extrabold text-slate-850">{stats.total} รายการ</div>
                                        </div>
                                    </div>
                                    <div className="bg-amber-50/50 border border-amber-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
                                        <div className="w-12 h-12 bg-amber-100 text-amber-600 rounded-xl flex items-center justify-center text-lg select-none">⏳</div>
                                        <div>
                                            <div className="text-[10px] font-bold text-amber-500 uppercase tracking-wider">รออนุมัติ</div>
                                            <div className="text-xl font-extrabold text-amber-700">{stats.pending} รายการ</div>
                                        </div>
                                    </div>
                                    <div className="bg-emerald-50/50 border border-emerald-250 rounded-2xl p-4 shadow-sm flex items-center gap-4">
                                        <div className="w-12 h-12 bg-emerald-100 text-emerald-600 rounded-xl flex items-center justify-center text-lg select-none">✅</div>
                                        <div>
                                            <div className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider">อนุมัติแล้ว</div>
                                            <div className="text-xl font-extrabold text-emerald-700">{stats.approved} รายการ</div>
                                        </div>
                                    </div>
                                    <div className="bg-rose-50/50 border border-rose-250 rounded-2xl p-4 shadow-sm flex items-center gap-4">
                                        <div className="w-12 h-12 bg-rose-100 text-rose-600 rounded-xl flex items-center justify-center text-lg select-none">❌</div>
                                        <div>
                                            <div className="text-[10px] font-bold text-rose-500 uppercase tracking-wider">ปฏิเสธแล้ว</div>
                                            <div className="text-xl font-extrabold text-rose-700">{stats.rejected} รายการ</div>
                                        </div>
                                    </div>
                                </div>

                                {/* Filters and Search Row */}
                                <div className="bg-white border border-slate-200/80 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row justify-between items-stretch md:items-center gap-4">
                                    {/* Tabs */}
                                    <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
                                        {[
                                            { id: 'all', label: 'ทั้งหมด' },
                                            { id: 'pending', label: 'รออนุมัติ ⏳' },
                                            { id: 'approved', label: 'อนุมัติแล้ว ✅' },
                                            { id: 'rejected', label: 'ปฏิเสธแล้ว ❌' }
                                        ].map(tab => (
                                            <button
                                                key={tab.id}
                                                type="button"
                                                onClick={() => setLeaveStatusFilter(tab.id)}
                                                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                    leaveStatusFilter === tab.id
                                                        ? 'bg-white text-slate-800 shadow-sm'
                                                        : 'text-slate-500 hover:text-slate-800'
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
                                            className="w-full bg-slate-55 border border-slate-200 rounded-xl pl-4 pr-10 py-2 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-200 transition-all placeholder:text-slate-400 font-bold"
                                        />
                                        <span className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 select-none text-xs">🔍</span>
                                    </div>
                                </div>

                                {/* Table Card */}
                                <Card className="p-0 overflow-hidden border border-slate-200/80">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50 text-slate-500 font-extrabold text-xs uppercase tracking-wider border-b border-slate-100">
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
                                                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
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
                                                    sick: { label: 'ลาป่วย 😷', color: 'bg-rose-50 text-rose-700 border-rose-200' },
                                                    business: { label: 'ลากิจ 💼', color: 'bg-blue-50 text-blue-700 border-blue-200' },
                                                    vacation: { label: 'พักร้อน 🏖️', color: 'bg-emerald-50 text-emerald-700 border-emerald-250' }
                                                };
                                                const currentType = leaveTypeMap[req.leave_type] || { label: req.leave_type, color: 'bg-slate-100 text-slate-700 border-slate-200' };

                                                return (
                                                    <tr key={req.id} className="hover:bg-slate-50/50 transition-colors">
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
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                                                            />
                                                        </td>
                                                        {/* Employee Name & Profile */}
                                                        <td className="p-4">
                                                            <div className="flex items-center gap-3">
                                                                {req.employees?.photo_url ? (
                                                                    <img src={req.employees.photo_url} alt="" className="w-9 h-9 rounded-xl object-cover border border-slate-200 shadow-sm" />
                                                                ) : (
                                                                    <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center font-bold text-xs">
                                                                        {req.employees?.name?.slice(0, 2)}
                                                                    </div>
                                                                )}
                                                                <div>
                                                                    <div className="font-extrabold text-slate-900">{req.employees?.nickname || req.employees?.name}</div>
                                                                    <div className="text-[10px] text-slate-400 font-bold tracking-wide uppercase">{req.employees?.position || 'Staff'}</div>
                                                                </div>
                                                            </div>
                                                        </td>

                                                        {/* Date */}
                                                        <td className="p-4 font-bold text-slate-700 text-xs">
                                                            {formatThaiLeaveDate(req.leave_date)}
                                                        </td>

                                                        {/* Leave Type */}
                                                        <td className="p-4">
                                                            <span className={`px-2.5 py-1.5 rounded-lg text-xs font-bold border ${currentType.color} inline-block`}>
                                                                {currentType.label}
                                                            </span>
                                                        </td>

                                                        {/* Reason */}
                                                        <td className="p-4 text-xs font-medium text-slate-600 italic max-w-[200px] truncate" title={req.reason}>
                                                            &ldquo;{req.reason || '-'}&rdquo;
                                                        </td>

                                                        {/* Replacement Employee */}
                                                        <td className="p-4">
                                                            {req.replacement_employee ? (
                                                                <div className="flex items-center gap-2">
                                                                    {req.replacement_employee.photo_url ? (
                                                                        <img src={req.replacement_employee.photo_url} alt="" className="w-6 h-6 rounded-lg object-cover border border-slate-200" />
                                                                    ) : (
                                                                        <div className="w-6 h-6 rounded-lg bg-slate-50 text-slate-650 flex items-center justify-center font-bold text-[9px] border">
                                                                            {req.replacement_employee.nickname?.slice(0, 2) || req.replacement_employee.name?.slice(0, 2)}
                                                                        </div>
                                                                    )}
                                                                    <span className="font-bold text-slate-800 text-xs">
                                                                        {req.replacement_employee.nickname || req.replacement_employee.name}
                                                                    </span>
                                                                </div>
                                                            ) : (
                                                                <span className="text-slate-400 text-xs font-semibold">-</span>
                                                            )}
                                                        </td>

                                                        {/* Status Badge */}
                                                        <td className="p-4 text-center">
                                                            <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase border ${
                                                                req.status === 'approved' 
                                                                    ? 'bg-emerald-50 text-emerald-700 border-emerald-250' 
                                                                    : req.status === 'rejected' 
                                                                        ? 'bg-rose-50 text-rose-700 border-rose-250' 
                                                                        : 'bg-amber-50 text-amber-700 border-amber-250 animate-pulse'
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
                                                                            className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px] rounded-lg transition-colors shadow-sm flex items-center gap-1"
                                                                        >
                                                                            <span>✓</span> อนุมัติ & ซิงค์
                                                                        </button>
                                                                        <button 
                                                                            onClick={() => handleLeaveAction(req, 'rejected')} 
                                                                            className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-[10px] rounded-lg transition-colors shadow-sm flex items-center gap-1"
                                                                        >
                                                                            <span>✕</span> ปฏิเสธคำขอ
                                                                        </button>
                                                                    </>
                                                                ) : (
                                                                    <button 
                                                                        onClick={() => handleLeaveAction(req, 'pending')}
                                                                        className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-650 border border-slate-200 font-bold text-[10px] rounded-lg transition-colors"
                                                                    >
                                                                        🔄 เปลี่ยนเป็นรออนุมัติ
                                                                    </button>
                                                                )}
                                                                <button 
                                                                    onClick={() => handleDeleteLeaveRequest(req)}
                                                                    className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 font-bold text-[10px] rounded-lg transition-colors flex items-center gap-1 shadow-sm"
                                                                    title="ลบใบลาหยุด"
                                                                >
                                                                    <span>🗑️</span> ลบใบลา
                                                                </button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                    {filteredLeaveRequests.length === 0 && (
                                        <div className="p-12 text-center text-slate-400 font-bold bg-slate-50/50">
                                            ไม่พบรายการคำขอลาหยุดในเงื่อนไขการกรองนี้
                                        </div>
                                    )}
                                </Card>
                            </div>
                        );
                    })()}

                    {/* Admin Leave Creation Modal */}
                    {showAdminLeaveModal && (
                        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={() => setShowAdminLeaveModal(false)}>
                            <div className="bg-white rounded-3xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                                {/* Modal Header */}
                                <div className="bg-gradient-to-r from-indigo-600 to-indigo-800 text-white p-6 rounded-t-3xl">
                                    <div className="flex items-center justify-between">
                                        <div>
                                            <h3 className="text-lg font-extrabold">➕ เพิ่มใบลาหยุด (Admin)</h3>
                                            <p className="text-indigo-200 text-xs mt-1 font-medium">สร้างใบลาให้พนักงานโดย Admin พร้อม Sync Roster อัตโนมัติ</p>
                                        </div>
                                        <button onClick={() => setShowAdminLeaveModal(false)} className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center hover:bg-white/30 transition-colors text-sm font-bold">✕</button>
                                    </div>
                                </div>

                                {/* Modal Body */}
                                <div className="p-6 space-y-5">
                                    {/* Employee Selection */}
                                    <div>
                                        <label className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1.5">👤 เลือกพนักงาน</label>
                                        <select
                                            value={adminLeaveForm.empId}
                                            onChange={e => setAdminLeaveForm(prev => ({ ...prev, empId: e.target.value, replacementId: "" }))}
                                            className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
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
                                            <label className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1.5">📅 เริ่มวันที่</label>
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
                                                className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1.5">📅 ถึงวันที่</label>
                                            <input
                                                type="date"
                                                value={adminLeaveForm.endDate}
                                                min={adminLeaveForm.startDate}
                                                onChange={e => setAdminLeaveForm(prev => ({ ...prev, endDate: e.target.value }))}
                                                className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition"
                                            />
                                        </div>
                                    </div>

                                    {/* Days Summary */}
                                    {adminLeaveForm.startDate && adminLeaveForm.endDate && (() => {
                                        const s = new Date(adminLeaveForm.startDate);
                                        const e = new Date(adminLeaveForm.endDate);
                                        const totalDays = Math.max(0, Math.floor((e - s) / (1000 * 60 * 60 * 24)) + 1);
                                        return (
                                            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                                                <span className="text-xs font-bold text-indigo-700">📊 จำนวนวันที่เลือก</span>
                                                <span className="text-lg font-extrabold text-indigo-700">{totalDays} วัน</span>
                                            </div>
                                        );
                                    })()}

                                    {/* Leave Type */}
                                    <div>
                                        <label className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1.5">📋 ประเภทการลา</label>
                                        <select
                                            value={adminLeaveForm.type}
                                            onChange={e => setAdminLeaveForm(prev => ({ ...prev, type: e.target.value }))}
                                            className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition cursor-pointer"
                                        >
                                            <option value="sick">😷 ลาป่วย (Sick Leave)</option>
                                            <option value="business">💼 ลากิจ (Business Leave)</option>
                                            <option value="vacation">🏖️ พักร้อน (Vacation)</option>
                                        </select>
                                    </div>

                                    {/* Reason */}
                                    <div>
                                        <label className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1.5">📝 เหตุผล</label>
                                        <textarea
                                            value={adminLeaveForm.reason}
                                            onChange={e => setAdminLeaveForm(prev => ({ ...prev, reason: e.target.value }))}
                                            rows={2}
                                            placeholder="ระบุเหตุผลการลา..."
                                            className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-medium text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition resize-none placeholder:text-slate-400"
                                        />
                                    </div>

                                    {/* Replacement Employee */}
                                    <div>
                                        <label className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1.5">👥 พนักงานทำงานแทน (ไม่บังคับ)</label>
                                        <select
                                            value={adminLeaveForm.replacementId}
                                            onChange={e => setAdminLeaveForm(prev => ({ ...prev, replacementId: e.target.value }))}
                                            className="w-full p-3 border border-slate-200 rounded-xl bg-slate-50 text-slate-900 font-bold text-sm outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400 transition cursor-pointer"
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
                                        <label className="block text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest mb-1.5">📌 สถานะใบลา</label>
                                        <div className="flex gap-2">
                                            {[
                                                { id: 'approved', label: '✅ อนุมัติทันที', desc: 'Sync ลง Roster อัตโนมัติ' },
                                                { id: 'pending', label: '⏳ รออนุมัติ', desc: 'ยังไม่ Sync Roster' },
                                            ].map(s => (
                                                <button
                                                    key={s.id}
                                                    type="button"
                                                    onClick={() => setAdminLeaveForm(prev => ({ ...prev, status: s.id }))}
                                                    className={`flex-1 p-3 rounded-xl text-xs font-bold border-2 transition-all ${
                                                        adminLeaveForm.status === s.id
                                                            ? s.id === 'approved'
                                                                ? 'bg-emerald-50 border-emerald-400 text-emerald-700 ring-2 ring-emerald-200'
                                                                : 'bg-amber-50 border-amber-400 text-amber-700 ring-2 ring-amber-200'
                                                            : 'bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100'
                                                    }`}
                                                >
                                                    <div>{s.label}</div>
                                                    <div className="text-[9px] mt-0.5 font-medium opacity-70">{s.desc}</div>
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
                                        className="flex-1 py-3 rounded-xl font-bold text-sm bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-200 transition-all"
                                    >
                                        ยกเลิก
                                    </button>
                                    <button
                                        type="button"
                                        onClick={handleAdminCreateLeave}
                                        disabled={adminLeaveLoading}
                                        className={`flex-1 py-3 rounded-xl font-extrabold text-sm transition-all shadow-md ${
                                            adminLeaveLoading
                                                ? 'bg-slate-300 text-slate-500 cursor-not-allowed'
                                                : 'bg-gradient-to-r from-indigo-600 to-indigo-700 text-white hover:from-indigo-700 hover:to-indigo-800 active:scale-[0.98] shadow-indigo-500/20'
                                        }`}
                                    >
                                        {adminLeaveLoading ? '⏳ กำลังบันทึก...' : '💾 บันทึกใบลา'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* --- HIRING (APPLICATIONS) --- */}
                    {activeTab === 'applications' && (
                        <div className="space-y-6">
                            <h3 className="font-extrabold text-slate-800">Job Applications</h3>
                            <Card className="p-0 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-extrabold text-xs uppercase">
                                        <tr><th className="p-4">Name</th><th className="p-4">Position</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.jobApplications.map(app => (
                                            <tr key={app.id} className="hover:bg-slate-50">
                                                <td className="p-4 font-black text-slate-900">{app.full_name}</td>
                                                <td className="p-4 font-bold text-slate-800">{app.position_applied}</td>
                                                <td className="p-4"><Badge color="slate">{app.status}</Badge></td>
                                                <td className="p-4 text-right">
                                                    <select value={app.status} onChange={(e) => handleUpdateApplicationStatus(app.id, e.target.value)} className="bg-slate-50 border rounded-lg text-xs p-1.5 font-bold outline-none">
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
                                        <h3 className="font-extrabold text-slate-800 text-lg mb-4 flex items-center gap-2">
                                            <span>📢</span> โพสต์ประกาศใหม่
                                        </h3>
                                        <form onSubmit={handleAddAnnouncement} className="space-y-4">
                                            {/* Type Selection */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">ประเภทประกาศ</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnouncementType("fixed")}
                                                        className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition-all duration-200 ${
                                                            announcementType === "fixed"
                                                                ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                                                                : "bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        📌 ปักหมุด (ถาวร)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnouncementType("temporary")}
                                                        className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition-all duration-200 ${
                                                            announcementType === "temporary"
                                                                ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                                                                : "bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        ⏰ ชั่วคราว (กำหนดวันหมดอายุ)
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Message Input */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">ข้อความประกาศ</label>
                                                <textarea
                                                    rows="3"
                                                    value={newAnnouncement}
                                                    onChange={e => setNewAnnouncement(e.target.value)}
                                                    placeholder="พิมพ์ข้อความประกาศหรือระเบียบการที่นี่..."
                                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-805 outline-none focus:ring-2 focus:ring-slate-300 transition-all placeholder:text-slate-400 placeholder:font-medium resize-none"
                                                />
                                            </div>

                                            {/* Expiration Settings (Only for temporary) */}
                                            {announcementType === "temporary" && (
                                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3 animate-in fade-in duration-200">
                                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">ตั้งเวลาหมดอายุ</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={expiresAt}
                                                        onChange={e => setExpiresAt(e.target.value)}
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2"
                                                    />
                                                    {/* Presets */}
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        <button type="button" onClick={() => applyPresetExpiresAt('1h')} className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            +1 ชม.
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('today')} className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            สิ้นสุดวันนี้ (23:59)
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('tomorrow')} className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            สิ้นสุดพรุ่งนี้ (23:59)
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('3d')} className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            +3 วัน
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('1w')} className="px-2.5 py-1.5 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            +1 สัปดาห์
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Priority Settings */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">ระดับความสำคัญ</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnouncementPriority(1)}
                                                        className={`flex-1 py-2 px-4 rounded-xl border text-xs font-bold transition-all duration-200 ${
                                                            announcementPriority === 1
                                                                ? "bg-slate-100 border-slate-300 text-slate-800 font-extrabold shadow-inner"
                                                                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        ปกติ (Normal)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setAnnouncementPriority(2)}
                                                        className={`flex-1 py-2 px-4 rounded-xl border text-xs font-bold transition-all duration-200 ${
                                                            announcementPriority === 2
                                                                ? "bg-rose-50 border-rose-250 text-rose-700 font-extrabold shadow-inner"
                                                                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        🚨 สำคัญ/ด่วน (High)
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Submit Button */}
                                            <button
                                                type="submit"
                                                className="w-full py-4 bg-slate-900 hover:bg-slate-850 active:scale-[0.99] text-white rounded-xl text-sm font-black shadow-lg shadow-slate-900/10 transition-all flex items-center justify-center gap-2"
                                            >
                                                <span>Publish</span> เผยแพร่ประกาศใช้งาน
                                            </button>
                                        </form>
                                    </Card>
                                </div>

                                {/* Live Preview Frame */}
                                <div>
                                    <Card className="p-6 h-full flex flex-col justify-between bg-slate-50/50 border-dashed border-slate-200">
                                        <div>
                                            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center gap-1.5">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                                Live Mobile Preview (ตัวอย่างบนจอมือถือ)
                                            </h4>
                                            <div className="bg-[#F2F2F2] rounded-[2.5rem] p-4 pt-8 pb-12 border-4 border-slate-300 shadow-inner relative max-w-sm mx-auto overflow-hidden">
                                                {/* Phone speaker mimic */}
                                                <div className="absolute top-3 left-1/2 -translate-x-1/2 w-16 h-4 bg-slate-300 rounded-full flex items-center justify-center">
                                                    <span className="w-8 h-1 bg-slate-400 rounded-full"></span>
                                                </div>

                                                {/* Weather Card Compact Mockup */}
                                                <div className="bg-white/80 border border-white/80 rounded-3xl p-3 shadow-sm mb-4 text-[9px] font-bold text-slate-500 flex items-center justify-between">
                                                    <div className="flex items-center gap-1.5">
                                                        <span className="text-xl">🌤️</span>
                                                        <span className="text-slate-805 text-xs font-black">32°C • แจ่มใส</span>
                                                    </div>
                                                    <span>In The Haus 🏡</span>
                                                </div>

                                                {/* Simulated Announcement Display */}
                                                <div className="space-y-3">
                                                    {announcementType === "fixed" ? (
                                                        <div className="w-full bg-white border border-white rounded-3xl p-3.5 shadow-sm flex items-start gap-2 relative overflow-hidden">
                                                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                                                            <span className="text-sm shrink-0">📌</span>
                                                            <div>
                                                                <div className="flex gap-1 mb-1">
                                                                    <span className="text-[8px] font-extrabold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 uppercase tracking-wider">Pinned</span>
                                                                    {announcementPriority === 2 && <span className="text-[8px] font-extrabold text-red-655 bg-red-50 px-1.5 py-0.5 rounded border border-red-100 uppercase tracking-wider animate-pulse">Urgent</span>}
                                                                </div>
                                                                <p className="text-[11px] font-bold text-neutral-800 leading-normal break-words">{newAnnouncement || "พิมพ์ข้อความในแบบฟอร์มเพื่อดูตัวอย่าง..."}</p>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className={`w-full ${announcementPriority === 2 ? 'bg-gradient-to-br from-orange-50 to-white border-orange-200' : 'bg-white border-white'} border rounded-3xl p-3.5 shadow-sm flex items-start gap-2 relative overflow-hidden`}>
                                                            <div className={`absolute top-0 left-0 w-1 h-full ${announcementPriority === 2 ? 'bg-orange-500' : 'bg-amber-500'}`} />
                                                            <span className="text-sm shrink-0">{announcementPriority === 2 ? '🚨' : '📢'}</span>
                                                            <div className="pr-4">
                                                                <div className="flex items-center gap-1 mb-1 flex-wrap">
                                                                    <span className={`text-[8px] font-extrabold ${announcementPriority === 2 ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-amber-600 bg-amber-50 border-amber-100'} px-1.5 py-0.5 rounded border uppercase tracking-wider`}>
                                                                        {announcementPriority === 2 ? 'Important' : 'News'}
                                                                    </span>
                                                                    <span className="text-[8px] font-bold text-neutral-400">⏰ {expiresAt ? "หมดใน " + format(new Date(expiresAt), "HH:mm") : "สิ้นสุดวันนี้"}</span>
                                                                </div>
                                                                <p className="text-[11px] font-semibold text-neutral-800 leading-normal break-words">{newAnnouncement || "พิมพ์ข้อความในแบบฟอร์มเพื่อดูตัวอย่าง..."}</p>
                                                            </div>
                                                            <span className="absolute top-2 right-2 text-[9px] text-slate-350">✕</span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                        <p className="text-[10px] text-slate-400 font-bold text-center mt-4">
                                            *ตัวอย่างเสมือนจริงบนสเกลของเครื่องจริงหน้างาน
                                        </p>
                                    </Card>
                                </div>
                            </div>

                            {/* Announcements List Manager */}
                            <Card className="p-0 overflow-hidden">
                                {/* Tab filters */}
                                <div className="flex border-b border-slate-100 p-2 bg-slate-50 gap-1 flex-wrap">
                                    {['active', 'expired', 'hidden', 'all'].map((f) => {
                                        const labelMap = { active: 'กำลังแสดงผล', expired: 'หมดอายุการใช้งาน', hidden: 'ปิดแสดงผล (Hidden)', all: 'ทั้งหมด' };
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
                                                className={`py-2 px-4 rounded-xl text-xs font-black transition-all ${
                                                    announcementFilter === f
                                                        ? 'bg-slate-900 text-white shadow-sm'
                                                        : 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-800'
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
                                        <thead className="bg-slate-50 text-slate-500 font-extrabold text-[10px] uppercase tracking-wider border-b border-slate-100">
                                            <tr>
                                                <th className="px-6 py-4">ข้อมูลประกาศ</th>
                                                <th className="px-6 py-4">ระดับ</th>
                                                <th className="px-6 py-4">ประเภท</th>
                                                <th className="px-6 py-4">วันหมดอายุ / สถานะเวลา</th>
                                                <th className="px-6 py-4">วันที่สร้าง</th>
                                                <th className="px-6 py-4 text-right">การจัดการ</th>
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
                                                        <tr key={a.id} className="hover:bg-slate-50/50">
                                                            <td className="px-6 py-4">
                                                                <div className="font-extrabold text-slate-800 max-w-sm truncate" title={a.message}>
                                                                    {a.message}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <Badge color={a.priority > 1 ? 'rose' : 'slate'}>
                                                                    {a.priority > 1 ? 'ด่วน 🚨' : 'ปกติ'}
                                                                </Badge>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <Badge color={isFixed ? 'blue' : 'amber'}>
                                                                    {isFixed ? '📌 Fixed' : '⏰ Temporary'}
                                                                </Badge>
                                                            </td>
                                                            <td className="px-6 py-4">
                                                                <div className="font-bold text-slate-805 text-xs">
                                                                    {!isFixed && format(new Date(a.expires_at), "dd MMM yyyy, HH:mm")}
                                                                </div>
                                                                <div className={`text-[10px] font-extrabold ${isExpired ? 'text-red-500' : isFixed ? 'text-blue-500' : 'text-emerald-600'} mt-0.5`}>
                                                                    {timeStatus}
                                                                </div>
                                                            </td>
                                                            <td className="px-6 py-4 font-bold text-xs text-slate-500">
                                                                {format(new Date(a.created_at), "dd/MM/yyyy HH:mm")}
                                                            </td>
                                                            <td className="px-6 py-4 text-right space-x-2">
                                                                <button
                                                                    onClick={() => handleToggleAnnouncement(a.id, a.is_active)}
                                                                    className={`px-2 py-1 rounded text-xs font-black border transition-all ${
                                                                        a.is_active
                                                                            ? "bg-slate-900/5 hover:bg-slate-900/10 border-slate-200 text-slate-650"
                                                                            : "bg-emerald-50 hover:bg-emerald-100 border-emerald-100 text-emerald-700"
                                                                    }`}
                                                                    title={a.is_active ? "คลิกเพื่อซ่อน" : "คลิกเพื่อเปิดใช้งาน"}
                                                                >
                                                                    {a.is_active ? 'แสดงผลอยู่' : 'ปิดการแสดงผล'}
                                                                </button>
                                                                <button
                                                                    onClick={() => handleEditAnnouncement(a)}
                                                                    className="px-2 py-1 bg-indigo-50 border border-indigo-100 text-indigo-700 hover:bg-indigo-100 text-xs font-black rounded transition-all"
                                                                >
                                                                    แก้ไข
                                                                </button>
                                                                <button
                                                                    onClick={() => handleDeleteAnnouncement(a.id)}
                                                                    className="p-1 hover:bg-rose-50 text-rose-500 hover:text-rose-700 rounded transition-all"
                                                                >
                                                                    🗑️
                                                                </button>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                        </tbody>
                                    </table>
                                    {data.announcements.length === 0 && (
                                        <div className="p-12 text-center text-slate-400 font-bold">ไม่มีข้อมูลประกาศบันทึกอยู่</div>
                                    )}
                                </div>
                            </Card>

                            {/* Edit Announcement Modal */}
                            {editingAnnouncement && (
                                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
                                    <Card className="w-full max-w-lg bg-white p-6 shadow-2xl rounded-3xl relative animate-in zoom-in-95 duration-150">
                                        <h3 className="text-lg font-extrabold text-slate-800 mb-4 flex items-center gap-1.5">
                                            ✏️ แก้ไขข้อมูลประกาศ
                                        </h3>
                                        
                                        <div className="space-y-4">
                                            {/* Type */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">ประเภทประกาศ</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAnnouncement(prev => ({ ...prev, type: "fixed" }))}
                                                        className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-bold transition-all duration-200 ${
                                                            editingAnnouncement.type === "fixed"
                                                                ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                                                                : "bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        📌 ปักหมุด (ถาวร)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAnnouncement(prev => ({ ...prev, type: "temporary" }))}
                                                        className={`flex-1 py-2.5 px-4 rounded-xl border text-xs font-bold transition-all duration-200 ${
                                                            editingAnnouncement.type === "temporary"
                                                                ? "bg-slate-900 text-white border-slate-950 shadow-sm"
                                                                : "bg-slate-50 border-slate-200 text-slate-650 hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        ⏰ ชั่วคราว (กำหนดวันหมดอายุ)
                                                    </button>
                                                </div>
                                            </div>

                                            {/* Message */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1.5">ข้อความประกาศ</label>
                                                <textarea
                                                    rows="3"
                                                    value={editingAnnouncement.message}
                                                    onChange={e => setEditingAnnouncement(prev => ({ ...prev, message: e.target.value }))}
                                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-805 outline-none focus:ring-2 focus:ring-slate-300 transition-all resize-none"
                                                />
                                            </div>

                                            {/* Expiration Settings (Only for temporary) */}
                                            {editingAnnouncement.type === "temporary" && (
                                                <div className="bg-slate-50 p-4 rounded-2xl border border-slate-100 space-y-3">
                                                    <label className="text-xs font-bold text-slate-500 uppercase tracking-wider block">ตั้งเวลาหมดอายุ</label>
                                                    <input
                                                        type="datetime-local"
                                                        value={editingAnnouncement.expires_at_formatted}
                                                        onChange={e => setEditingAnnouncement(prev => ({ ...prev, expires_at_formatted: e.target.value }))}
                                                        className="w-full p-3 bg-white border border-slate-200 rounded-xl text-sm font-bold text-slate-800 outline-none focus:ring-2"
                                                    />
                                                    {/* Presets for edit */}
                                                    <div className="flex flex-wrap gap-1.5 pt-1">
                                                        <button type="button" onClick={() => applyPresetExpiresAt('1h', true)} className="px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            +1 ชม.
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('today', true)} className="px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            สิ้นสุดวันนี้
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('tomorrow', true)} className="px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            สิ้นสุดพรุ่งนี้
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('3d', true)} className="px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            +3 วัน
                                                        </button>
                                                        <button type="button" onClick={() => applyPresetExpiresAt('1w', true)} className="px-2 py-1 bg-white border border-slate-200 hover:border-slate-300 text-[10px] font-bold text-slate-600 rounded-lg shadow-sm">
                                                            +1 สัปดาห์
                                                        </button>
                                                    </div>
                                                </div>
                                            )}

                                            {/* Priority Settings */}
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-2">ระดับความสำคัญ</label>
                                                <div className="flex gap-2">
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAnnouncement(prev => ({ ...prev, priority: 1 }))}
                                                        className={`flex-1 py-2 px-4 rounded-xl border text-xs font-bold transition-all duration-200 ${
                                                            Number(editingAnnouncement.priority) === 1
                                                                ? "bg-slate-100 border-slate-300 text-slate-800 font-extrabold"
                                                                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        ปกติ (Normal)
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditingAnnouncement(prev => ({ ...prev, priority: 2 }))}
                                                        className={`flex-1 py-2 px-4 rounded-xl border text-xs font-bold transition-all duration-200 ${
                                                            Number(editingAnnouncement.priority) === 2
                                                                ? "bg-rose-50 border-rose-250 text-rose-700 font-extrabold"
                                                                : "bg-slate-50 border-slate-200 text-slate-500 hover:bg-slate-100"
                                                        }`}
                                                    >
                                                        🚨 สำคัญ/ด่วน (High)
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="flex gap-3 mt-6">
                                            <button
                                                type="button"
                                                onClick={() => setEditingAnnouncement(null)}
                                                className="flex-1 py-3 border border-slate-200 text-slate-500 hover:bg-slate-50 rounded-xl text-sm font-bold transition-colors"
                                            >
                                                ยกเลิก
                                            </button>
                                            <button
                                                type="button"
                                                onClick={handleSaveEditAnnouncement}
                                                className="flex-1 py-3 bg-slate-900 hover:bg-slate-850 text-white rounded-xl text-sm font-black transition-colors"
                                            >
                                                บันทึกการแก้ไข
                                            </button>
                                        </div>
                                    </Card>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- PHONE ORDERS --- */}
                    {activeTab === 'orders' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-end">
                                <h2 className="text-xl font-extrabold text-slate-800">Phone Orders</h2>
                            </div>
                            <Card className="p-0 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-extrabold text-[10px] uppercase tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Created At</th>
                                            <th className="px-6 py-4">Customer</th>
                                            <th className="px-6 py-4">Items</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.phoneOrders.map(order => (
                                            <tr key={order.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 font-mono text-slate-900 font-extrabold text-xs">{formatDate(order.created_at)} {formatTime(order.created_at)}</td>
                                                <td className="px-6 py-4">
                                                    <div className="font-black text-slate-900">{order.customer_name || 'Anonymous'}</div>
                                                    <div className="text-xs text-slate-800 font-bold">{order.customer_phone || '-'}</div>
                                                </td>
                                                <td className="px-6 py-4 font-bold text-slate-850 italic">
                                                    {order.items_json?.map(i => `${i.name} x${i.qty}`).join(', ')}
                                                </td>
                                                <td className="px-6 py-4">
                                                    <Badge color={order.status === 'DONE' ? 'emerald' : order.status === 'CONFIRMED' ? 'blue' : 'amber'}>
                                                        {order.status}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right space-x-2">
                                                    {order.status === 'PENDING' && (
                                                        <button onClick={() => handleUpdateOrderStatus(order.id, 'CONFIRMED')} className="text-blue-600 font-black text-xs hover:bg-blue-50 px-2 py-1 rounded">Confirm</button>
                                                    )}
                                                    {order.status !== 'DONE' && (
                                                        <button onClick={() => handleUpdateOrderStatus(order.id, 'DONE')} className="text-emerald-600 font-black text-xs hover:bg-emerald-50 px-2 py-1 rounded">Done</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {data.phoneOrders.length === 0 && <div className="p-12 text-center text-slate-400">No orders recorded yet.</div>}
                            </Card>
                        </div>
                    )}

                    {/* --- TABLE BOOKINGS --- */}
                    {activeTab === 'reservations' && (
                        <div className="space-y-6">
                            <div className="flex justify-between items-end">
                                <h2 className="text-xl font-extrabold text-slate-800">Table Bookings</h2>
                            </div>
                            <Card className="p-0 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-extrabold text-[10px] uppercase tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Date/Time</th>
                                            <th className="px-6 py-4">Customer</th>
                                            <th className="px-6 py-4 text-center">Guests</th>
                                            <th className="px-6 py-4">Status</th>
                                            <th className="px-6 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.tableReservations.map(res => (
                                            <tr key={res.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4">
                                                    <div className="font-black text-slate-900">{formatDate(res.reservation_date)}</div>
                                                    <div className="font-mono text-xs text-slate-900 font-extrabold">{res.reservation_time || '-'}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-black text-slate-900">{res.customer_name || 'Anonymous'}</div>
                                                    <div className="text-xs text-slate-800 font-medium">{res.customer_phone || '-'}</div>
                                                </td>
                                                <td className="px-6 py-4 text-center font-black text-slate-900 text-lg">{res.guests}</td>
                                                <td className="px-6 py-4">
                                                    <Badge color={res.status === 'COMPLETED' ? 'emerald' : res.status === 'CONFIRMED' ? 'blue' : res.status === 'CANCELLED' ? 'rose' : 'amber'}>
                                                        {res.status}
                                                    </Badge>
                                                </td>
                                                <td className="px-6 py-4 text-right space-x-2">
                                                    {res.status === 'PENDING' && (
                                                        <button onClick={() => handleUpdateReservationStatus(res.id, 'CONFIRMED')} className="text-blue-600 font-black text-xs hover:bg-blue-50 px-2 py-1 rounded">Confirm</button>
                                                    )}
                                                    {res.status !== 'CANCELLED' && res.status !== 'COMPLETED' && (
                                                        <button onClick={() => handleUpdateReservationStatus(res.id, 'CANCELLED')} className="text-rose-500 font-black text-xs hover:bg-rose-50 px-2 py-1 rounded border border-rose-100">Cancel</button>
                                                    )}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {data.tableReservations.length === 0 && <div className="p-12 text-center text-slate-400">No bookings yet.</div>}
                            </Card>
                        </div>
                    )}

                    {/* --- STAFF INDIVIDUAL HISTORY --- */}
                    {activeTab === 'history' && (
                        <div className="space-y-6">
                            <Card className="flex gap-4 items-center border border-slate-100">
                                <span className="font-black text-slate-800">Select Staff:</span>
                                <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)} className="p-2.5 border rounded-xl font-bold bg-slate-50 outline-none">
                                    <option value="ALL">- Choose -</option>
                                    {data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                                </select>
                            </Card>
                            {selectedEmpId !== 'ALL' && (
                                <div className="space-y-6">
                                    <div className="grid grid-cols-3 gap-4">
                                        <Card className="py-4 text-center"><div className="text-2xl font-black text-slate-900">{data.individualStats.work_days}</div><div className="text-xs text-slate-700 uppercase font-extrabold mt-1">Work Days</div></Card>
                                        <Card className="py-4 text-center"><div className="text-2xl font-black text-amber-600">{data.individualStats.late}</div><div className="text-xs text-slate-700 uppercase font-extrabold mt-1">Late</div></Card>
                                        <Card className="py-4 text-center"><div className="text-2xl font-black text-rose-600">{data.individualStats.absent}</div><div className="text-xs text-slate-700 uppercase font-extrabold mt-1">Absent</div></Card>
                                    </div>
                                    <Card className="p-0 overflow-hidden">
                                        <table className="w-full text-sm text-left">
                                            <thead className="bg-slate-50 text-slate-500 font-extrabold text-xs uppercase"><tr><th className="p-4">Date</th><th className="p-4">Action</th><th className="p-4">Status</th></tr></thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {data.individualLogs.map(log => (
                                                    <tr key={log.id} className="hover:bg-slate-50">
                                                        <td className="p-4 font-mono text-slate-900 font-black">{formatDate(log.timestamp)} {formatTime(log.timestamp)}</td>
                                                        <td className="p-4"><Badge color={log.action_type === 'check_in' ? 'blue' : log.action_type === 'absent' ? 'rose' : 'slate'}>{log.action_type}</Badge></td>
                                                        <td className="p-4"><Badge color={getShiftStatus(log).color}>{getShiftStatus(log).label}</Badge></td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </Card>
                                </div>
                            )}
                        </div>
                    )}

                    {/* --- SHIFT CONFIGURATION (SETTINGS) --- */}
                    {activeTab === 'settings' && (
                        <div className="space-y-6">
                            <Card>
                                <h3 className="font-extrabold text-slate-800 mb-4">Shift Configuration</h3>
                                <div className="space-y-4">
                                    {data.shifts.map(s => (
                                        <div key={s.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-xl border border-slate-100">
                                            <div className="font-black text-slate-800 w-1/3">{s.name}</div>
                                            <div className="flex gap-2 items-center">
                                                <input type="time" value={s.start_time} onChange={e => handleUpdateShift(s.id, 'start_time', e.target.value)} className="p-2 border rounded-lg font-mono text-center font-bold bg-white text-slate-900" />
                                                <span className="text-slate-400 font-bold">➜</span>
                                                <input type="time" value={s.end_time} onChange={e => handleUpdateShift(s.id, 'end_time', e.target.value)} className="p-2 border rounded-lg font-mono text-center font-bold bg-white text-slate-900" />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </Card>
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
                                <h3 className="font-extrabold text-slate-800">Pending Swap Approvals</h3>
                                {data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').length === 0 ? <Card className="text-center text-slate-455 py-8 font-bold">No pending swap requests</Card> :
                                    data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').map(req => (
                                        <Card key={req.id} className="space-y-3 border border-slate-100">
                                            <div className="flex justify-between"><Badge color="blue">{req.type}</Badge><span className="text-xs font-black text-slate-900">{req.target_date}</span></div>
                                            <div className="flex items-center gap-2 text-sm text-slate-800 font-black"><span>{req.requester?.name}</span><span>➜</span><span>{req.peer?.name || 'Open Pool'}</span></div>
                                            <div className="text-xs text-slate-600 font-bold">&quot;{req.notes}&quot;</div>
                                            <div className="grid grid-cols-2 gap-2">
                                                <button onClick={() => handleSwapDecision(req.id, 'APPROVE')} className="bg-slate-850 hover:bg-slate-900 text-white py-2 rounded-lg text-xs font-bold shadow-sm">Approve</button>
                                                <button onClick={() => handleSwapDecision(req.id, 'REJECT')} className="bg-slate-100 hover:bg-slate-200 text-slate-700 py-2 rounded-lg text-xs font-bold">Reject</button>
                                            </div>
                                        </Card>
                                    ))}
                            </div>
                            <div className="space-y-4">
                                <h3 className="font-extrabold text-slate-800">Roster Monitor</h3>
                                <Card className="min-h-[200px] flex items-center justify-center text-slate-500 border border-slate-100 font-bold">
                                    Aggregator Visualization Here (Monitored Active Transactions)
                                </Card>
                            </div>
                        </div>
                    )}
                </main>

                {/* Global FAB */}
                <div className="fixed bottom-6 right-6 z-40">
                    <button className="w-14 h-14 bg-slate-900 hover:bg-slate-800 text-white rounded-full shadow-2xl flex items-center justify-center hover:scale-110 transition-transform">
                        <Icons.More size={24} />
                    </button>
                </div>
            </div>
        </div>
    );
}