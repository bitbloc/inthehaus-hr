"use client";
import { useEffect, useState, useMemo, useReducer } from "react";
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
    const [showStaffModal, setShowStaffModal] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [selectedEmpId, setSelectedEmpId] = useState("ALL");
    const [expandedPayrollRow, setExpandedPayrollRow] = useState(null);
    const [showDeductModal, setShowDeductModal] = useState(false);
    const [deductForm, setDeductForm] = useState({ empId: "", amount: "", isPercent: false, reason: "" });
    const [newAnnouncement, setNewAnnouncement] = useState("");
    const [showAllLogs, setShowAllLogs] = useState(false);

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
            query = supabase.from(table).select("*, employees(name, position)");
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
                const { error: overrideError } = await supabase.from('roster_overrides').upsert({
                    employee_id: req.employee_id,
                    date: req.leave_date,
                    is_off: true
                });
                if (overrideError) {
                    console.error("Failed to create roster override:", overrideError);
                }
            }
            try {
                const notifyRes = await fetch('/api/notify-leave-status', {
                    method: 'POST',
                    body: JSON.stringify({
                        name: req.employees?.name,
                        date: req.leave_date,
                        type: req.leave_type,
                        reason: req.reason,
                        status: newStatus
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

    // Announcement Action
    const handleAddAnnouncement = async (e) => {
        e.preventDefault();
        const priority = e.target.priority.value || 1;
        const { error } = await supabase.from('announcements').insert({ message: newAnnouncement, is_active: true, priority });
        if (!error) { setNewAnnouncement(""); fetchData('announcements', 'announcements'); }
    };
    const handleToggleAnnouncement = async (id, status) => {
        await supabase.from('announcements').update({ is_active: !status }).eq('id', id);
        fetchData('announcements', 'announcements');
    };
    const handleDeleteAnnouncement = async (id) => {
        if (confirm("Delete?")) { await supabase.from('announcements').delete().eq('id', id); fetchData('announcements', 'announcements'); }
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
                                                                <p className="mt-1 font-medium text-slate-600 font-semibold">เหตุผล: "{req.reason || '-'}"</p>
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
                                                                <p className="mt-1 font-medium text-slate-600 font-semibold">โน้ต: "{req.notes || '-'}"</p>
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
                    {activeTab === 'requests' && (
                        <div className="space-y-6">
                            <h3 className="font-extrabold text-slate-800">Leave Requests</h3>
                            <Card className="p-0 overflow-hidden">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 text-slate-500 font-extrabold text-xs uppercase">
                                        <tr><th className="p-4">Name</th><th className="p-4">Date</th><th className="p-4">Type</th><th className="p-4">Reason</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {data.leaveRequests.map(req => (
                                            <tr key={req.id} className="hover:bg-slate-50">
                                                <td className="p-4 font-black text-slate-900">{req.employees?.name}</td>
                                                <td className="p-4 font-mono text-slate-900 font-black">{formatDate(req.leave_date)}</td>
                                                <td className="p-4"><Badge color="blue">{req.leave_type}</Badge></td>
                                                <td className="p-4 text-slate-800 font-semibold">{req.reason}</td>
                                                <td className="p-4"><Badge color={req.status === 'approved' ? 'emerald' : req.status === 'rejected' ? 'rose' : 'amber'}>{req.status}</Badge></td>
                                                <td className="p-4 text-right gap-2 flex justify-end">
                                                    {req.status === 'pending' ? (
                                                        <>
                                                            <button onClick={() => handleLeaveAction(req, 'approved')} className="text-emerald-600 font-bold text-xs bg-emerald-50 px-2 py-1 rounded border border-emerald-100">✓ Approved</button>
                                                            <button onClick={() => handleLeaveAction(req, 'rejected')} className="text-rose-600 font-bold text-xs bg-rose-50 px-2 py-1 rounded border border-rose-100">✕ Reject</button>
                                                        </>
                                                    ) : <span className="text-slate-400 font-bold">-</span>}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {data.leaveRequests.length === 0 && <div className="p-8 text-center text-slate-400">No requests</div>}
                            </Card>
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
                            <Card>
                                <h3 className="font-extrabold text-slate-800 mb-4">Post Announcement</h3>
                                <form onSubmit={handleAddAnnouncement} className="flex gap-4">
                                    <input className="flex-1 p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-800 font-bold" placeholder="Message..." value={newAnnouncement} onChange={e => setNewAnnouncement(e.target.value)} />
                                    <select name="priority" className="p-3 rounded-xl border bg-slate-50 font-bold outline-none"><option value="1">Normal</option><option value="2">High</option></select>
                                    <button type="submit" className="bg-slate-850 text-white px-6 rounded-xl font-extrabold shadow hover:bg-slate-900">Post</button>
                                </form>
                            </Card>
                            <div className="space-y-4">
                                {data.announcements.map(a => (
                                    <Card key={a.id} className="flex justify-between items-center">
                                        <div className="flex gap-4 items-center">
                                            {a.priority > 1 && <Badge color="rose">High</Badge>}
                                            <span className="font-black text-slate-900">{a.message}</span>
                                        </div>
                                        <div className="flex gap-2">
                                            <button onClick={() => handleToggleAnnouncement(a.id, a.is_active)} className="text-xs font-black text-blue-600">{a.is_active ? 'Active' : 'Hidden'}</button>
                                            <button onClick={() => handleDeleteAnnouncement(a.id)} className="text-rose-500 hover:text-rose-700">🗑️</button>
                                        </div>
                                    </Card>
                                ))}
                            </div>
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
                                            <div className="text-xs text-slate-600 font-bold">"{req.notes}"</div>
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