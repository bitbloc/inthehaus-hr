"use client";
import { useEffect, useState, useMemo, useReducer } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth, differenceInMinutes } from "date-fns";
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

// --- Reducer for Cleaner State ---
const initialState = {
    logs: [],
    employees: [],
    shifts: [],
    schedules: {},
    leaveRequests: [],
    jobApplications: [],
    swapRequests: [],
    rosterOverrides: [],
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
    const [activeTab, setActiveTab] = useState("dashboard");
    const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
    const [data, dispatch] = useReducer(dataReducer, initialState);

    // UI Local State
    const [showStaffModal, setShowStaffModal] = useState(false);
    const [editingStaff, setEditingStaff] = useState(null);
    const [selectedEmpId, setSelectedEmpId] = useState("ALL");
    const [expandedPayrollRow, setExpandedPayrollRow] = useState(null);
    const [showDeductModal, setShowDeductModal] = useState(false);
    const [deductForm, setDeductForm] = useState({ empId: "", amount: "", isPercent: false, reason: "" });
    const [newAnnouncement, setNewAnnouncement] = useState("");

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
        const { data: res } = await supabase.from(table).select("*").order("id");
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
        if (activeTab === 'dashboard') fetchLogs();
        if (activeTab === 'payroll') { fetchLogs(); fetchData('payroll_deductions', 'deductions'); fetchData('roster_overrides', 'rosterOverrides'); }
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
    }, [activeTab, selectedMonth]);

    useEffect(() => {
        if (activeTab === 'history' && selectedEmpId !== 'ALL') fetchIndividualLogs();
    }, [selectedEmpId]);

    // --- Payroll Memoization ---
    const payrollData = useMemo(() => {
        if (!data.employees.length) return [];
        return calculatePayroll(
            data.employees, data.logs, data.schedules, data.shifts,
            data.payrollConfig, data.deductions, selectedMonth, data.rosterOverrides
        );
    }, [data.employees, data.logs, data.schedules, data.shifts, data.payrollConfig, data.deductions, selectedMonth, data.rosterOverrides]);

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
        const { error } = await supabase.from("employees").update({ is_active: false }).eq("id", id);
        if (!error) fetchEmployees(); else alert(error.message);
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
            // Notify (Optional)
            try { await fetch('/api/notify-leave-status', { method: 'POST', body: JSON.stringify({ name: req.employees?.name, date: req.leave_date, type: req.leave_type, reason: req.reason, status: newStatus }), headers: { 'Content-Type': 'application/json' } }); } catch (e) { }
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

    // Excel
    const handleExportExcel = () => {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(payrollData.map(p => ({
            Name: p.emp.name, WorkDays: p.workDays, Salary: p.totalSalary, OT_Pay: p.totalOTPay, Deduct: p.totalDeduct, Net: p.netSalary
        })));
        XLSX.utils.book_append_sheet(wb, ws, "Payroll");
        XLSX.writeFile(wb, `Payroll_${selectedMonth}.xlsx`);
    };

    // --- Helpers ---
    const getShiftStatus = (log) => {
        const date = new Date(log.timestamp);
        const schedule = data.schedules[log.employee_id]?.[date.getDay()];
        if (!schedule?.shifts) return { label: '-', color: 'slate' };
        if (log.action_type === 'absent') return { label: 'Absent', color: 'rose' };

        const [sh, sm] = schedule.shifts.start_time.split(':');
        const shiftStart = new Date(date); shiftStart.setHours(sh, sm, 0, 0);

        if (log.action_type === 'check_in') {
            const diff = differenceInMinutes(date, shiftStart);
            return diff > 15 ? { label: `Late +${diff}m`, color: 'amber' } : { label: 'On Time', color: 'emerald' };
        }
        return { label: 'Out', color: 'slate' };
    };

    return (
        <div className="min-h-screen bg-[#F8F9FA] text-slate-800 font-sans pb-20 selection:bg-slate-200">
            {/* Header */}
            <header className="sticky top-0 z-50 bg-[#F8F9FA]/80 backdrop-blur-md border-b border-slate-200/50">
                <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row justify-between items-center gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-900 rounded-xl flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-slate-200">H</div>
                        <div>
                            <h1 className="text-xl font-bold tracking-tight text-slate-800">Programmer Haus</h1>
                            <p className="text-[10px] uppercase tracking-widest text-slate-400 font-semibold">Restaurant OS</p>
                        </div>
                    </div>
                    <div className="group relative bg-white px-4 py-2 rounded-xl border border-slate-200 flex items-center gap-2 shadow-sm hover:shadow-md transition-all">
                        <Icons.Calendar size={14} className="text-slate-400" />
                        <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-transparent font-bold text-slate-700 outline-none text-sm cursor-pointer" />
                    </div>
                </div>

                {/* Navigation */}
                <div className="max-w-7xl mx-auto px-4 md:px-6 pb-2 overflow-x-auto no-scrollbar">
                    <div className="flex gap-2 min-w-max p-1">
                        {[
                            { id: 'dashboard', label: 'Overview', icon: Icons.Sun },
                            { id: 'shift_manage', label: 'Shifts', icon: Icons.Swap },
                            { id: 'payroll', label: 'Payroll', icon: Icons.Money },
                            { id: 'roster', label: 'Roster', icon: Icons.Clock },
                            { id: 'employees', label: 'Staff', icon: Icons.Staff },
                            { id: 'requests', label: 'Requests', icon: Icons.Bell },
                            { id: 'applications', label: 'Hiring', icon: Icons.Job },
                            { id: 'announcements', label: 'News', icon: Icons.Alert },
                            { id: 'history', label: 'History', icon: Icons.File },
                            { id: 'settings', label: 'Settings', icon: Icons.Settings },
                        ].map(tab => (
                            <TabButton key={tab.id} active={activeTab === tab.id} onClick={() => setActiveTab(tab.id)} label={tab.label} icon={tab.icon} />
                        ))}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto p-4 md:p-6 animate-fade-in-up">

                {/* --- DASHBOARD --- */}
                {activeTab === 'dashboard' && (
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        <div className="lg:col-span-2 space-y-6">
                            <Card className="flex flex-wrap gap-4 items-center justify-between bg-gradient-to-br from-white to-slate-50">
                                <div>
                                    <h2 className="text-lg font-bold text-slate-700 flex items-center gap-2">
                                        Today's Operations
                                        <Badge color="emerald" className="animate-pulse">Live</Badge>
                                    </h2>
                                    <p className="text-xs text-slate-400 font-medium mt-1">Manage daily shifts and attendance</p>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={() => handleNotify('/api/notify')} className="px-4 py-2 bg-emerald-50 text-emerald-700 text-xs font-bold rounded-xl border border-emerald-100 hover:bg-emerald-100">Summary</button>
                                    <button onClick={() => setShowManualModal(true)} className="px-4 py-2 bg-blue-50 text-blue-700 text-xs font-bold rounded-xl border border-blue-100 hover:bg-blue-100">+ Manual</button>
                                    <button onClick={handleFinalizeDay} className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl shadow hover:bg-slate-900">🏁 Cut-off</button>
                                </div>
                            </Card>

                            {/* Manual Entry Modal */}
                            {showManualModal && (
                                <div className="fixed inset-0 z-[60] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4">
                                    <Card className="w-full max-w-sm space-y-4 animate-in fade-in zoom-in-95 duration-200">
                                        <div className="flex justify-between items-center">
                                            <h3 className="font-bold text-slate-700">Manual Attendance</h3>
                                            <button onClick={() => setShowManualModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                                        </div>

                                        <div className="space-y-3">
                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase">Employee</label>
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
                                                    <label className="text-xs font-bold text-slate-400 uppercase">Date</label>
                                                    <input
                                                        type="date"
                                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                                                        value={manualForm.date}
                                                        onChange={e => setManualForm({ ...manualForm, date: e.target.value })}
                                                    />
                                                </div>
                                                <div>
                                                    <label className="text-xs font-bold text-slate-400 uppercase">Time</label>
                                                    <input
                                                        type="time"
                                                        className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold text-slate-700 outline-none"
                                                        value={manualForm.time}
                                                        onChange={e => setManualForm({ ...manualForm, time: e.target.value })}
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <label className="text-xs font-bold text-slate-400 uppercase">Action Type</label>
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

                            <Card className="p-0 overflow-hidden">
                                <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                                    <h3 className="font-bold text-slate-700">Real-time Activity</h3>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-slate-50/50 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                                            <tr>
                                                <th className="px-6 py-4">Time</th>
                                                <th className="px-6 py-4">Photo</th>
                                                <th className="px-6 py-4">Staff</th>
                                                <th className="px-6 py-4">Action</th>
                                                <th className="px-6 py-4">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50">
                                            {data.logs.slice(0, 10).map(log => {
                                                const status = getShiftStatus(log);
                                                return (
                                                    <tr key={log.id} className="hover:bg-slate-50/50 transition-colors">
                                                        <td className="px-6 py-4 font-mono text-slate-500 text-xs">{formatTime(log.timestamp)}</td>
                                                        <td className="px-6 py-4">
                                                            {log.photo_url ? (
                                                                <a href={log.photo_url} target="_blank" rel="noopener noreferrer">
                                                                    <img src={log.photo_url} alt="log" className="w-10 h-10 rounded-lg object-cover border border-slate-100 shadow-sm hover:scale-150 transition-transform" />
                                                                </a>
                                                            ) : <span className="text-slate-300">-</span>}
                                                        </td>
                                                        <td className="px-6 py-4 font-bold text-slate-700 flex items-center gap-3">
                                                            <div className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-xs text-slate-500 font-bold border border-slate-200">
                                                                {log.employees?.name?.charAt(0)}
                                                            </div>
                                                            {log.employees?.name}
                                                        </td>
                                                        <td className="px-6 py-4">
                                                            <Badge color={log.action_type === 'check_in' ? 'blue' : log.action_type === 'absent' ? 'rose' : 'slate'}>
                                                                {log.action_type === 'check_in' ? 'Check In' : log.action_type === 'check_out' ? 'Check Out' : 'Absent'}
                                                            </Badge>
                                                        </td>
                                                        <td className="px-6 py-4"><Badge color={status.color}>{status.label}</Badge></td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </Card>
                        </div>
                        {/* Side Stats */}
                        <div className="space-y-6">
                            <Card className="bg-slate-900 text-white border-none">
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-2">Total Staff Active</p>
                                <div className="text-4xl font-light">{data.employees.length}</div>
                            </Card>
                            <Card>
                                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest mb-4">Pending Requests</p>
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-bold text-slate-700">Leave Requests</div>
                                        <Badge color="orange">{data.leaveRequests.filter(r => r.status === 'pending').length}</Badge>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <div className="text-sm font-bold text-slate-700">Shift Swaps</div>
                                        <Badge color="blue">{data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').length}</Badge>
                                    </div>
                                </div>
                            </Card>
                        </div>
                    </div>
                )}

                {/* --- PAYROLL --- */}
                {activeTab === 'payroll' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-end">
                            <div>
                                <h2 className="text-2xl font-bold text-slate-800">Payroll</h2>
                                <p className="text-slate-500 text-sm">Salary calculation period: {selectedMonth}</p>
                            </div>
                            <div className="flex gap-2">
                                <button onClick={() => setShowDeductModal(true)} className="text-xs font-bold text-rose-600 bg-rose-50 px-4 py-2 rounded-xl border border-rose-100 hover:bg-rose-100">- Deduct</button>
                                <button onClick={handleExportExcel} className="text-xs font-bold text-emerald-600 bg-emerald-50 px-4 py-2 rounded-xl border border-emerald-100 hover:bg-emerald-100">Export Excel</button>
                            </div>
                        </div>

                        <Card className="p-0 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
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
                                <tbody className="divide-y divide-slate-50">
                                    {payrollData.map((row) => (
                                        <div key={row.emp.id} style={{ display: 'contents' }}>
                                            <tr onClick={() => setExpandedPayrollRow(expandedPayrollRow === row.emp.id ? null : row.emp.id)} className={`cursor-pointer transition-colors hover:bg-slate-50 ${expandedPayrollRow === row.emp.id ? 'bg-slate-50' : ''}`}>
                                                <td className="px-6 py-4 text-center text-slate-400 text-xs">{expandedPayrollRow === row.emp.id ? '▼' : '▶'}</td>
                                                <td className="px-6 py-4 font-bold text-slate-700 flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-slate-200 text-slate-500 flex items-center justify-center text-xs">{row.emp.name.charAt(0)}</div>
                                                    <div>{row.emp.name}<div className="text-[10px] font-normal text-slate-400">{row.emp.position}</div></div>
                                                </td>
                                                <td className="px-6 py-4 text-center font-bold text-slate-600">{row.workDays}</td>
                                                <td className="px-6 py-4 text-right font-mono text-slate-500">{row.totalSalary.toLocaleString()}</td>
                                                <td className="px-6 py-4 text-right font-mono text-blue-500">{row.totalOTPay.toLocaleString()}</td>
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
                                                                <span className="font-mono">Wage: {row.totalSalary} | OT: {row.totalOTPay} ({row.totalOTHours}h)</span>
                                                            </div>
                                                            <table className="w-full text-xs text-left">
                                                                <thead className="border-b border-slate-100 bg-white text-slate-400"><tr><th className="p-3">Date</th><th className="p-3">Shift</th><th className="p-3 text-center">Time</th><th className="p-3 text-right">Wage</th><th className="p-3 text-right">OT</th><th className="p-3">Status</th></tr></thead>
                                                                <tbody className="divide-y divide-slate-50">
                                                                    {row.dailyDetails.map((day, idx) => (
                                                                        <tr key={idx}>
                                                                            <td className="p-3 font-mono text-slate-500">{formatDate(day.date, "dd MMM")}</td>
                                                                            <td className="p-3 font-bold text-slate-700">{day.shift}</td>
                                                                            <td className="p-3 text-center font-mono text-slate-500">{day.in} - {day.out}</td>
                                                                            <td className="p-3 text-right font-mono">{day.wage > 0 ? day.wage : '-'}</td>
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
                                        </div>
                                    ))}
                                </tbody>
                            </table>
                            {showDeductModal && (<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"><div className="bg-white p-6 rounded-2xl w-full max-w-sm"><h3 className="font-bold mb-4">Add Deduction</h3><div className="space-y-2"><select className="w-full p-2 border rounded" onChange={e => setDeductForm({ ...deductForm, empId: e.target.value })}><option value="">Select Staff</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select><input type="number" placeholder="Amount" className="w-full p-2 border rounded" onChange={e => setDeductForm({ ...deductForm, amount: e.target.value })} /><input type="text" placeholder="Reason" className="w-full p-2 border rounded" onChange={e => setDeductForm({ ...deductForm, reason: e.target.value })} /><div className="flex gap-2"><button onClick={handleAddDeduction} className="bg-slate-800 text-white flex-1 py-2 rounded">Save</button><button onClick={() => setShowDeductModal(false)} className="bg-slate-100 flex-1 py-2 rounded">Cancel</button></div></div></div></div>)}
                        </Card>
                    </div>
                )}

                {/* --- ROSTER --- */}
                {activeTab === 'roster' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center bg-white p-4 rounded-3xl shadow-sm border border-slate-100">
                            <div className="font-bold text-slate-700">Weekly Schedule</div>
                            <button onClick={handleNotifySchedule} className="bg-slate-800 text-white px-4 py-2 rounded-xl text-xs font-bold">Publish to LINE</button>
                        </div>
                        <Card className="p-0 overflow-hidden">
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm border-collapse">
                                    <thead><tr><th className="p-4 text-left bg-slate-50 font-bold text-slate-500 text-xs">Staff</th>{["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map(d => <th key={d} className="p-4 bg-slate-50 text-center text-slate-500 text-xs">{d}</th>)}</tr></thead>
                                    <tbody>
                                        {data.employees.map(emp => (
                                            <tr key={emp.id} className="border-b border-slate-50 hover:bg-slate-50/50">
                                                <td className="p-4 font-bold text-slate-700 bg-white sticky left-0 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">{emp.name}</td>
                                                {[0, 1, 2, 3, 4, 5, 6].map(i => {
                                                    const s = data.schedules[emp.id]?.[i];
                                                    return (
                                                        <td key={i} className="p-2 text-center min-w-[120px]">
                                                            <select
                                                                className={`w-full p-2 rounded-lg text-xs font-bold outline-none cursor-pointer transition appearance-none text-center border ${s?.is_off
                                                                    ? 'bg-slate-100 text-slate-400 border-slate-200'
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

                {/* --- STAFF MANAGEMENT --- */}
                {activeTab === 'employees' && (
                    <div className="space-y-6">
                        <div className="flex justify-between items-center"><h3 className="font-bold text-lg text-slate-700">Staff Management</h3><button onClick={() => { setEditingStaff(null); setShowStaffModal(true) }} className="bg-slate-800 text-white px-5 py-2.5 rounded-xl font-bold hover:bg-slate-900 shadow-lg">+ Add Staff</button></div>
                        <Card className="p-0 overflow-hidden">
                            <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-400 font-bold text-xs uppercase"><tr><th className="p-4">Name</th><th className="p-4">Position</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr></thead>
                                <tbody className="divide-y divide-slate-50">{data.employees.map(emp => (<tr key={emp.id} className="hover:bg-slate-50"><td className="p-4 font-bold text-slate-700">{emp.name}</td><td className="p-4 text-slate-500">{emp.position}</td><td className="p-4"><Badge color={emp.employment_status === 'Fulltime' ? 'emerald' : 'slate'}>{emp.employment_status || '-'}</Badge></td><td className="p-4 text-right flex justify-end gap-2"><button onClick={() => { setEditingStaff(emp); setShowStaffModal(true) }} className="text-blue-500 font-bold text-xs hover:bg-blue-50 px-2 py-1 rounded">Edit</button><LongPressButton onLongPress={() => handleDeleteEmployee(emp.id)} /></td></tr>))}</tbody></table>
                        </Card>
                        <StaffModal isOpen={showStaffModal} onClose={() => setShowStaffModal(false)} onSave={() => fetchEmployees()} initialData={editingStaff} isEditing={!!editingStaff} />
                    </div>
                )}

                {/* --- REQUESTS --- */}
                {activeTab === 'requests' && (
                    <div className="space-y-6">
                        <h3 className="font-bold text-slate-700">Leave Requests</h3>
                        <Card className="p-0 overflow-hidden">
                            <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-400 font-bold text-xs uppercase"><tr><th className="p-4">Name</th><th className="p-4">Date</th><th className="p-4">Type</th><th className="p-4">Reason</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr></thead>
                                <tbody className="divide-y divide-slate-50">{data.leaveRequests.map(req => (<tr key={req.id}><td className="p-4 font-bold">{req.employees?.name}</td><td className="p-4 font-mono text-slate-500">{formatDate(req.leave_date)}</td><td className="p-4"><Badge color="blue">{req.leave_type}</Badge></td><td className="p-4 text-slate-500">{req.reason}</td><td className="p-4"><Badge color={req.status === 'approved' ? 'emerald' : req.status === 'rejected' ? 'rose' : 'amber'}>{req.status}</Badge></td><td className="p-4 text-right gap-2 flex justify-end"><button onClick={() => handleLeaveAction(req, 'approved')} className="text-emerald-600 font-bold text-xs">✓</button><button onClick={() => handleLeaveAction(req, 'rejected')} className="text-rose-600 font-bold text-xs">✕</button></td></tr>))}</tbody></table>
                            {data.leaveRequests.length === 0 && <div className="p-8 text-center text-slate-400">No requests</div>}
                        </Card>
                    </div>
                )}

                {/* --- HIRING --- */}
                {activeTab === 'applications' && (
                    <div className="space-y-6">
                        <h3 className="font-bold text-slate-700">Job Applications</h3>
                        <Card className="p-0 overflow-hidden">
                            <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-400 font-bold text-xs uppercase"><tr><th className="p-4">Name</th><th className="p-4">Position</th><th className="p-4">Status</th><th className="p-4 text-right">Action</th></tr></thead>
                                <tbody className="divide-y divide-slate-50">{data.jobApplications.map(app => (<tr key={app.id}><td className="p-4 font-bold">{app.full_name}</td><td className="p-4">{app.position_applied}</td><td className="p-4"><Badge color="slate">{app.status}</Badge></td><td className="p-4 text-right"><select value={app.status} onChange={(e) => handleUpdateApplicationStatus(app.id, e.target.value)} className="bg-slate-50 border rounded text-xs p-1"><option>Pending</option><option>Hired</option><option>Rejected</option></select></td></tr>))}</tbody></table>
                        </Card>
                    </div>
                )}

                {/* --- NEWS --- */}
                {activeTab === 'announcements' && (
                    <div className="space-y-6">
                        <Card>
                            <h3 className="font-bold text-slate-700 mb-4">Post Announcement</h3>
                            <form onSubmit={handleAddAnnouncement} className="flex gap-4"><input className="flex-1 p-3 rounded-xl border border-slate-200 bg-slate-50" placeholder="Message..." value={newAnnouncement} onChange={e => setNewAnnouncement(e.target.value)} /><select name="priority" className="p-3 rounded-xl border bg-slate-50"><option value="1">Normal</option><option value="2">High</option></select><button type="submit" className="bg-slate-800 text-white px-6 rounded-xl font-bold">Post</button></form>
                        </Card>
                        <div className="space-y-4">
                            {data.announcements.map(a => (<Card key={a.id} className="flex justify-between items-center"><div className="flex gap-4 items-center">{a.priority > 1 && <Badge color="rose">High</Badge>}<span className="font-bold text-slate-700">{a.message}</span></div><div className="flex gap-2"><button onClick={() => handleToggleAnnouncement(a.id, a.is_active)} className="text-xs font-bold text-blue-500">{a.is_active ? 'Active' : 'Hidden'}</button><button onClick={() => handleDeleteAnnouncement(a.id)} className="text-rose-500">🗑️</button></div></Card>))}
                        </div>
                    </div>
                )}

                {/* --- HISTORY --- */}
                {activeTab === 'history' && (
                    <div className="space-y-6">
                        <Card className="flex gap-4 items-center">
                            <span className="font-bold text-slate-700">Select Staff:</span>
                            <select value={selectedEmpId} onChange={e => setSelectedEmpId(e.target.value)} className="p-2 border rounded-lg"><option value="ALL">- Choose -</option>{data.employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}</select>
                        </Card>
                        {selectedEmpId !== 'ALL' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-3 gap-4">
                                    <Card className="py-4 text-center"><div className="text-2xl font-bold text-slate-700">{data.individualStats.work_days}</div><div className="text-xs text-slate-400 uppercase font-bold">Work Days</div></Card>
                                    <Card className="py-4 text-center"><div className="text-2xl font-bold text-amber-500">{data.individualStats.late}</div><div className="text-xs text-slate-400 uppercase font-bold">Late</div></Card>
                                    <Card className="py-4 text-center"><div className="text-2xl font-bold text-rose-500">{data.individualStats.absent}</div><div className="text-xs text-slate-400 uppercase font-bold">Absent</div></Card>
                                </div>
                                <Card className="p-0 overflow-hidden">
                                    <table className="w-full text-sm text-left"><thead className="bg-slate-50 text-slate-400 font-bold text-xs uppercase"><tr><th className="p-4">Date</th><th className="p-4">Action</th><th className="p-4">Status</th></tr></thead>
                                        <tbody className="divide-y divide-slate-50">{data.individualLogs.map(log => (<tr key={log.id}><td className="p-4 font-mono text-slate-500">{formatDate(log.timestamp)} {formatTime(log.timestamp)}</td><td className="p-4"><Badge color={log.action_type === 'check_in' ? 'blue' : log.action_type === 'absent' ? 'rose' : 'slate'}>{log.action_type}</Badge></td><td className="p-4"><Badge color={getShiftStatus(log).color}>{getShiftStatus(log).label}</Badge></td></tr>))}</tbody></table>
                                </Card>
                            </div>
                        )}
                    </div>
                )}

                {/* --- SETTINGS --- */}
                {activeTab === 'settings' && (
                    <div className="space-y-6">
                        <Card>
                            <h3 className="font-bold text-slate-700 mb-4">Shift Configuration</h3>
                            <div className="space-y-4">
                                {data.shifts.map(s => (
                                    <div key={s.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
                                        <div className="font-bold text-slate-700 w-1/3">{s.name}</div>
                                        <div className="flex gap-2 items-center">
                                            <input type="time" value={s.start_time} onChange={e => handleUpdateShift(s.id, 'start_time', e.target.value)} className="p-2 border rounded-lg font-mono text-center" />
                                            <span className="text-slate-400">➜</span>
                                            <input type="time" value={s.end_time} onChange={e => handleUpdateShift(s.id, 'end_time', e.target.value)} className="p-2 border rounded-lg font-mono text-center" />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>
                    </div>
                )}

                {/* --- SHIFT SWAP & REQUESTS --- */}
                {activeTab === 'shift_manage' && (
                    <div className="grid md:grid-cols-2 gap-6">
                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-700">Approvals</h3>
                            {data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').length === 0 ? <Card className="text-center text-slate-400 py-8">No pending requests</Card> :
                                data.swapRequests.filter(r => r.status === 'PENDING_MANAGER').map(req => (
                                    <Card key={req.id} className="space-y-3">
                                        <div className="flex justify-between"><Badge color="blue">{req.type}</Badge><span className="text-xs font-bold text-slate-400">{req.target_date}</span></div>
                                        <div className="flex items-center gap-2 text-sm text-slate-600 font-bold"><span>{req.requester?.name}</span><span>➜</span><span>{req.peer?.name || 'Open Pool'}</span></div>
                                        <div className="text-xs text-slate-500">"{req.notes}"</div>
                                        <div className="grid grid-cols-2 gap-2"><button onClick={() => handleSwapDecision(req.id, 'APPROVE')} className="bg-slate-800 text-white py-2 rounded-lg text-xs font-bold">Approve</button><button onClick={() => handleSwapDecision(req.id, 'REJECT')} className="bg-slate-100 text-slate-600 py-2 rounded-lg text-xs font-bold">Reject</button></div>
                                    </Card>
                                ))}
                        </div>
                        <div className="space-y-4">
                            <h3 className="font-bold text-slate-700">Roster Monitor</h3>
                            <Card className="min-h-[200px] flex items-center justify-center text-slate-400">Aggregator Visualization Here</Card>
                        </div>
                    </div>
                )}

            </main>

            {/* Global FAB */}
            <div className="fixed bottom-6 right-6 z-40">
                <button className="w-14 h-14 bg-slate-900 text-white rounded-full shadow-2xl shadow-slate-400 flex items-center justify-center hover:scale-110 transition-transform">
                    <Icons.More size={24} />
                </button>
            </div>
        </div>
    );
}