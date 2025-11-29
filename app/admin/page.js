"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth, differenceInMinutes } from "date-fns";
import { th } from "date-fns/locale";
import * as XLSX from 'xlsx';

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // --- Data States ---
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [leaveRequests, setLeaveRequests] = useState([]);
  
  // --- Payroll States ---
  const [payrollConfig, setPayrollConfig] = useState({ ot_rate: 60, double_shift_rate: 1000 });
  const [deductions, setDeductions] = useState([]);
  const [showDeductModal, setShowDeductModal] = useState(false);
  const [deductForm, setDeductForm] = useState({ empId: "", amount: "", isPercent: false, reason: "" });

  // --- Employee Management States ---
  const [newEmp, setNewEmp] = useState({ name: "", position: "", line_user_id: "" });
  const [editingEmpId, setEditingEmpId] = useState(null);
  const [editFormData, setEditFormData] = useState({ name: "", position: "" });

  // --- History States ---
  const [selectedEmpId, setSelectedEmpId] = useState("ALL");
  const [individualLogs, setIndividualLogs] = useState([]);
  const [individualStats, setIndividualStats] = useState({ work_days: 0, late: 0, absent: 0 });

  // --- Init ---
  useEffect(() => {
    fetchShifts();
    fetchEmployees();
    fetchSchedules(); 
    fetchLeaveRequests(); 
    fetchPayrollConfig();
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard") fetchLogs();
    if (activeTab === "requests") fetchLeaveRequests();
    if (activeTab === "roster") fetchSchedules(); 
    if (activeTab === "history" && selectedEmpId !== "ALL") fetchIndividualLogs();
    if (activeTab === "payroll") fetchDeductions();
  }, [activeTab, selectedMonth, selectedEmpId]);

  // --- API Fetching ---
  const fetchShifts = async () => { const { data } = await supabase.from("shifts").select("*").order("id"); setShifts(data || []); };
  const fetchEmployees = async () => { const { data } = await supabase.from("employees").select("*").order("id"); setEmployees(data || []); };
  
  const fetchSchedules = async () => {
    const { data } = await supabase.from("employee_schedules").select("*, shifts(id, name, start_time, end_time)");
    const scheduleMap = {};
    data?.forEach(s => {
        if(!scheduleMap[s.employee_id]) scheduleMap[s.employee_id] = {};
        scheduleMap[s.employee_id][s.day_of_week] = s;
    });
    setSchedules(scheduleMap);
  };
  
  const fetchLogs = async () => {
    const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const { data } = await supabase.from("attendance_logs").select("*, employees(name)").gte("timestamp", startDate).lte("timestamp", endDate).order("timestamp", { ascending: false });
    setLogs(data || []);
  };

  const fetchLeaveRequests = async () => {
      const { data } = await supabase.from('leave_requests').select('*, employees(name)').order('created_at', { ascending: false });
      setLeaveRequests(data || []);
  };

  const fetchPayrollConfig = async () => {
      const { data } = await supabase.from('payroll_config').select('*');
      const config = { ot_rate: 60, double_shift_rate: 1000 };
      data?.forEach(item => config[item.key] = item.value);
      setPayrollConfig(config);
  };
  const fetchDeductions = async () => {
      const { data } = await supabase.from('payroll_deductions').select('*').eq('month', selectedMonth);
      setDeductions(data || []);
  };

  const fetchIndividualLogs = async () => {
    const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const { data } = await supabase.from("attendance_logs").select("*, employees(name)").eq("employee_id", selectedEmpId).gte("timestamp", startDate).lte("timestamp", endDate).order("timestamp", { ascending: false });
    
    setIndividualLogs(data || []);
    
    // Stats Calculation
    let lateCount = 0;
    let absentCount = 0;
    const workDaysSet = new Set(); 

    data?.forEach(log => {
        if (log.action_type === 'absent') {
            absentCount++;
        } else if (log.action_type === 'check_in') {
            workDaysSet.add(log.timestamp.split('T')[0]); 
            const logDate = new Date(log.timestamp);
            const schedule = schedules[selectedEmpId]?.[logDate.getDay()];
            if (schedule?.shifts) {
                const [h, m] = schedule.shifts.start_time.split(':');
                const start = new Date(logDate); start.setHours(h, m, 0);
                if (differenceInMinutes(logDate, start) > 0) lateCount++;
            }
        }
    });

    setIndividualStats({ work_days: workDaysSet.size, late: lateCount, absent: absentCount });
  };

  // --- Logic: Payroll Calculation ---
  const calculatePayroll = () => {
      return employees.map(emp => {
          let totalSalary = 0;
          let totalOTHours = 0;
          let totalOTPay = 0;
          let shiftCount = 0;
          
          // 1. ดึง Log ของคนนี้
          const empLogs = logs.filter(l => l.employee_id === emp.id && l.action_type === 'check_in');
          
          empLogs.forEach(inLog => {
              const dateStr = inLog.timestamp.split('T')[0];
              const outLog = logs.find(l => l.employee_id === emp.id && l.action_type === 'check_out' && l.timestamp.startsWith(dateStr));
              
              const logDate = new Date(inLog.timestamp);
              const dayOfWeek = logDate.getDay();
              const schedule = schedules[emp.id]?.[dayOfWeek];
              
              if (schedule?.shifts) {
                  const shift = schedule.shifts;
                  // เช็คค่าแรงต่อกะ (ถ้าไม่มีใช้ 500)
                  let dailyWage = shift.salary || 500;
                  
                  // เช็คควบกะ
                  if (shift.name.includes("ควบ") || shift.name.includes("Double")) {
                      dailyWage = payrollConfig.double_shift_rate;
                  }
                  
                  totalSalary += parseFloat(dailyWage);
                  shiftCount++;

                  // คำนวณ OT
                  if (outLog) {
                      const outTime = new Date(outLog.timestamp);
                      const [eh, em] = shift.end_time.split(':').map(Number);
                      const shiftEnd = new Date(outTime); shiftEnd.setHours(eh, em, 0);
                      
                      const diffMinutes = differenceInMinutes(outTime, shiftEnd);
                      if (diffMinutes > 0) {
                          const otHours = Math.ceil(diffMinutes / 60); // ปัดเศษนาทีเป็นชั่วโมง
                          totalOTHours += otHours;
                          totalOTPay += otHours * payrollConfig.ot_rate;
                      }
                  }
              }
          });

          // 2. คำนวณหักเงิน
          const empDeductions = deductions.filter(d => d.employee_id === emp.id);
          let totalDeduct = 0;
          empDeductions.forEach(d => {
              if (d.is_percentage) totalDeduct += (totalSalary + totalOTPay) * (d.amount / 100);
              else totalDeduct += parseFloat(d.amount);
          });

          return {
              emp,
              shiftCount,
              totalSalary,
              totalOTHours,
              totalOTPay,
              totalDeduct,
              netSalary: (totalSalary + totalOTPay) - totalDeduct
          };
      });
  };

  const payrollData = calculatePayroll();

  // --- Action Functions ---
  const handleUpdateShift = async (id, f, v) => { await supabase.from("shifts").update({ [f]: v }).eq("id", id); fetchShifts(); };
  const handleUpdateSchedule = async (e, d, s, o) => { await supabase.from("employee_schedules").upsert({ employee_id: e, day_of_week: d, shift_id: o ? null : s, is_off: o }, { onConflict: 'employee_id, day_of_week' }); fetchSchedules(); };
  
  // Employee Actions
  const handleAddEmployee = async (e) => { e.preventDefault(); const { error } = await supabase.from("employees").insert([newEmp]); if (!error) { alert("เพิ่มพนักงานเรียบร้อย ✅"); setNewEmp({ name: "", position: "", line_user_id: "" }); fetchEmployees(); } };
  const handleDeleteEmployee = async (id) => { if(confirm("ต้องการลบพนักงานคนนี้?")) { await supabase.from("employees").delete().eq("id", id); fetchEmployees(); } };
  const startEditEmployee = (emp) => { setEditingEmpId(emp.id); setEditFormData({ name: emp.name, position: emp.position }); };
  const cancelEditEmployee = () => { setEditingEmpId(null); setEditFormData({ name: "", position: "" }); };
  const saveEditEmployee = async (id) => { const { error } = await supabase.from("employees").update(editFormData).eq("id", id); if (!error) { alert("✅ แก้ไขเรียบร้อย"); setEditingEmpId(null); fetchEmployees(); } };

  // Notifications
  const handleNotify = async (api) => { if(confirm("ยืนยันส่ง?")) await fetch(api, { method: 'POST' }); };
  const handleRemindShift = async (n, t) => { if(confirm(`ส่งแจ้งเตือนเรียก "${n}" ${t === 'check_in' ? 'เข้างาน' : 'ออกงาน'}?`)) await fetch('/api/remind-shift', { method: 'POST', body: JSON.stringify({ shiftName: n, type: t }), headers: {'Content-Type': 'application/json'}}); };
  const handleNotifySchedule = async () => { if(confirm("ประกาศตารางงานเข้ากลุ่ม?")) try { await fetch('/api/notify-schedule', { method: 'POST' }); alert("✅ เรียบร้อย"); } catch(e) {} };
  
  // Finalize Day (ตัดยอดขาดงาน)
  const handleFinalizeDay = async () => {
      if(!confirm("⚠️ ยืนยันการตัดยอดสิ้นวัน?\nระบบจะบันทึก 'ขาดงาน' ให้คนที่ยังไม่ลงเวลาวันนี้ทั้งหมด")) return;
      const res = await fetch('/api/finalize-day', { method: 'POST' });
      const data = await res.json();
      if(data.success) { alert(`✅ บันทึกขาดงานเรียบร้อย: ${data.marked_count} คน`); fetchLogs(); }
      else alert(data.message || "Error");
  };

  // Leave Requests
  const handleLeaveAction = async (req, newStatus) => {
      if(!confirm(`ยืนยันเปลี่ยนสถานะเป็น "${newStatus}" ?`)) return;
      const { error } = await supabase.from('leave_requests').update({ status: newStatus }).eq('id', req.id);
      if(!error) { 
          try {
              await fetch('/api/notify-leave-status', {
                  method: 'POST',
                  body: JSON.stringify({ name: req.employees?.name, date: req.leave_date, type: req.leave_type, reason: req.reason, status: newStatus }),
                  headers: { 'Content-Type': 'application/json' }
              });
          } catch(e) {}
          alert("✅ บันทึกและแจ้งเตือนเรียบร้อย"); 
          fetchLeaveRequests(); 
      }
  };

  // Payroll Actions
  const handleSavePayrollConfig = async () => { await supabase.from('payroll_config').upsert([{ key: 'ot_rate', value: payrollConfig.ot_rate }, { key: 'double_shift_rate', value: payrollConfig.double_shift_rate }]); alert("✅ บันทึกการตั้งค่าแล้ว"); };
  const handleUpdateShiftSalary = async (shiftId, salary) => { await supabase.from('shifts').update({ salary }).eq('id', shiftId); fetchShifts(); };
  const handleAddDeduction = async () => { if(!deductForm.empId || !deductForm.amount) return alert("กรอกข้อมูลให้ครบ"); const { error } = await supabase.from('payroll_deductions').insert({ employee_id: deductForm.empId, month: selectedMonth, amount: deductForm.amount, is_percentage: deductForm.isPercent, reason: deductForm.reason }); if (!error) { alert("บันทึกรายการหักแล้ว"); setShowDeductModal(false); fetchDeductions(); } };
  const handleDeleteDeduction = async (id) => { if(confirm("ลบรายการนี้?")) { await supabase.from('payroll_deductions').delete().eq('id', id); fetchDeductions(); } };

  // Export Excel
  const handleExportExcel = () => { if (selectedEmpId === "ALL" || individualLogs.length === 0) { alert("No data"); return; } const dataToExport = individualLogs.map(log => { const schedule = getShiftInfo(log); const { status, diff } = analyzeLogRaw(log, schedule); return { "Date": format(parseISO(log.timestamp), "dd/MM/yyyy"), "Time": format(parseISO(log.timestamp), "HH:mm:ss"), "Action": log.action_type, "Shift": schedule?.shifts?.name || '-', "Status": status, "Diff(min)": diff || 0 }; }); const worksheet = XLSX.utils.json_to_sheet(dataToExport); const workbook = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(workbook, worksheet, "Log"); XLSX.writeFile(workbook, `HR_Log.xlsx`); };

  // Helper Logic
  const getShiftInfo = (log) => {
      if (!log || !schedules[log.employee_id]) return null;
      return schedules[log.employee_id][new Date(log.timestamp).getDay()]; 
  };

  const analyzeLogRaw = (log, schedule) => {
      if (log.action_type === 'absent') return { status: 'Absent', diff: 0, color: 'text-white bg-rose-500 font-bold px-3 py-1 rounded-full' };
      if (!schedule?.shifts) return { status: '-', diff: 0, color: '' };
      
      const d = new Date(log.timestamp);
      const [sh, sm] = schedule.shifts.start_time.split(':');
      const [eh, em] = schedule.shifts.end_time.split(':');
      const start = new Date(d); start.setHours(sh, sm, 0);
      const end = new Date(d); end.setHours(eh, em, 0);

      if (log.action_type === 'check_in') {
          const diff = differenceInMinutes(d, start);
          return diff > 0 ? { status: 'Late', diff: diff, color: 'text-orange-700 bg-orange-100 font-bold' } : { status: 'OnTime', diff: diff, color: 'text-emerald-700 bg-emerald-100 font-bold' };
      } else {
          const diff = differenceInMinutes(end, d);
          return diff > 0 ? { status: 'EarlyOut', diff: diff, color: 'text-rose-700 bg-rose-100 font-bold' } : { status: 'Normal', diff: diff, color: 'text-slate-600 bg-slate-100' };
      }
  };

  const analyzeLog = (log, schedule) => {
      const { status, diff, color } = analyzeLogRaw(log, schedule);
      return { status: `${status} ${diff !== 0 ? Math.abs(diff) + 'm' : ''}`, color };
  };

  const days = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

  return (
    <div className="min-h-screen bg-slate-50 font-sans text-slate-800">
      <div className="max-w-7xl mx-auto p-4 md:p-8">
        
        {/* Header */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 gap-4">
            <div>
                <h1 className="text-3xl font-bold tracking-tight text-slate-800">In the haus <span className="text-slate-400 font-light">Dashboard</span></h1>
                <p className="text-sm text-slate-500 mt-1">HR Management System</p>
            </div>
            <div className="flex bg-white p-1.5 rounded-2xl shadow-sm border border-slate-200 overflow-x-auto max-w-full">
                {['dashboard', 'payroll', 'requests', 'history', 'roster', 'employees', 'settings'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ease-in-out whitespace-nowrap ${activeTab === t ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                        {t === 'dashboard' ? 'Overview' : t === 'payroll' ? '💰 Payroll' : t === 'requests' ? 'Requests' : t === 'history' ? 'History' : t === 'roster' ? 'Roster' : t === 'employees' ? 'Staff' : 'Settings'}
                    </button>
                ))}
            </div>
        </div>

        {/* --- TAB 1: DASHBOARD --- */}
        {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-fade-in-up">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100 flex items-center justify-between">
                        <div>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Month</p>
                            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="text-lg font-bold text-slate-700 bg-transparent outline-none cursor-pointer" />
                        </div>
                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-xl">📅</div>
                    </div>
                    <div className="md:col-span-2 bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-3">Daily Operations</p>
                        <div className="flex flex-wrap gap-2 items-center">
                            {shifts.map(s => (
                                <div key={s.id} className="flex bg-slate-50 rounded-xl overflow-hidden border border-slate-200">
                                    <button onClick={() => handleRemindShift(s.name, 'check_in')} className="px-3 py-2 text-xs font-bold text-slate-600 hover:bg-blue-100 hover:text-blue-700 transition">☀️ {s.name}</button>
                                    <div className="w-px bg-slate-200"></div>
                                    <button onClick={() => handleRemindShift(s.name, 'check_out')} className="px-3 py-2 text-xs font-bold text-slate-400 hover:bg-rose-100 hover:text-rose-700 transition">🌙</button>
                                </div>
                            ))}
                            <div className="w-px h-8 bg-slate-200 mx-2"></div>
                            <button onClick={() => handleNotify('/api/notify')} className="px-4 py-2 bg-emerald-50 text-emerald-700 rounded-xl text-xs font-bold hover:bg-emerald-100 transition border border-emerald-100">Summary</button>
                            <button onClick={() => handleNotify('/api/notify-absence')} className="px-4 py-2 bg-amber-50 text-amber-700 rounded-xl text-xs font-bold hover:bg-amber-100 transition border border-amber-100">Follow Up</button>
                            {/* Finalize Day Button */}
                            <button onClick={handleFinalizeDay} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition shadow ml-auto">🏁 Cut-off (End Day)</button>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-50"><h3 className="font-bold text-lg text-slate-700">Real-time Activity</h3></div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-400 uppercase text-xs font-bold"><tr><th className="px-6 py-4">Time</th><th className="px-6 py-4">Photo</th><th className="px-6 py-4">Name</th><th className="px-6 py-4">Action</th><th className="px-6 py-4">Detail</th></tr></thead>
                            <tbody className="divide-y divide-slate-50">
                                {logs.map(log => {
                                    const schedule = getShiftInfo(log);
                                    const { status, color } = analyzeLog(log, schedule);
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-slate-500">{format(parseISO(log.timestamp), "HH:mm")} <span className="text-xs text-slate-300 ml-1">{format(parseISO(log.timestamp), "dd/MM")}</span></td>
                                            <td className="px-6 py-4">
                                                {log.photo_url ? (
                                                    <a href={log.photo_url} target="_blank" className="block w-10 h-10 rounded-full overflow-hidden border border-slate-200 hover:scale-110 transition">
                                                        <img src={log.photo_url} className="w-full h-full object-cover" />
                                                    </a>
                                                ) : <span className="text-xs text-slate-300">-</span>}
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-700">{log.employees?.name}</td>
                                            <td className="px-6 py-4">
                                                {log.action_type === 'check_in' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-700">● In</span>}
                                                {log.action_type === 'check_out' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-700">● Out</span>}
                                                {log.action_type === 'absent' && <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-600">🚫 Absent</span>}
                                            </td>
                                            <td className="px-6 py-4"><span className={`px-2 py-1 rounded-md text-xs ${color}`}>{status}</span></td>
                                        </tr>
                                    )
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        )}

        {/* --- TAB 2: PAYROLL --- */}
        {activeTab === 'payroll' && (
            <div className="space-y-6 animate-fade-in-up">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h3 className="font-bold text-slate-700 mb-4">⚙️ Rates Config</h3>
                        <div className="space-y-3">
                            <div><label className="text-xs font-bold text-slate-400">OT Rate (Baht/Hr)</label><input type="number" className="w-full p-2 border rounded-lg" value={payrollConfig.ot_rate} onChange={e => setPayrollConfig({...payrollConfig, ot_rate: e.target.value})} /></div>
                            <div><label className="text-xs font-bold text-slate-400">Double Shift Rate (Baht/Day)</label><input type="number" className="w-full p-2 border rounded-lg" value={payrollConfig.double_shift_rate} onChange={e => setPayrollConfig({...payrollConfig, double_shift_rate: e.target.value})} /></div>
                            <button onClick={handleSavePayrollConfig} className="w-full bg-slate-800 text-white py-2 rounded-lg font-bold text-xs">Save Rates</button>
                        </div>
                    </div>
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 md:col-span-2">
                        <h3 className="font-bold text-slate-700 mb-4">⚙️ Shift Salary (Baht/Shift)</h3>
                        <div className="flex flex-wrap gap-4">
                            {shifts.map(s => (
                                <div key={s.id} className="flex-1 bg-slate-50 p-3 rounded-xl border border-slate-200">
                                    <div className="font-bold text-slate-700 mb-2">{s.name}</div>
                                    <input type="number" className="w-full p-2 border rounded-lg text-center font-bold text-green-600" 
                                        value={s.salary || 500} 
                                        onChange={(e) => handleUpdateShiftSalary(s.id, e.target.value)} 
                                        placeholder="500"
                                    />
                                    <div className="text-[10px] text-center text-slate-400 mt-1">บาท/กะ</div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                        <h3 className="font-bold text-lg text-slate-700">💰 Monthly Salary Summary ({selectedMonth})</h3>
                        <div className="flex gap-2">
                            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border p-2 rounded-lg text-sm font-bold" />
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-500 uppercase text-xs font-bold">
                                <tr>
                                    <th className="px-6 py-4">Employee</th>
                                    <th className="px-6 py-4 text-center">Shifts</th>
                                    <th className="px-6 py-4 text-right">Wage</th>
                                    <th className="px-6 py-4 text-right">OT(Hr)</th>
                                    <th className="px-6 py-4 text-right">OT Pay</th>
                                    <th className="px-6 py-4 text-right text-red-500">Deduct</th>
                                    <th className="px-6 py-4 text-right text-green-600 font-bold text-base">Net</th>
                                    <th className="px-6 py-4 text-center">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {payrollData.map((data, index) => (
                                    <tr key={index} className="hover:bg-slate-50">
                                        <td className="px-6 py-4 font-bold text-slate-700">{data.emp.name}</td>
                                        <td className="px-6 py-4 text-center">{data.shiftCount}</td>
                                        <td className="px-6 py-4 text-right">{data.totalSalary.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right font-mono text-slate-500">{data.totalOTHours}</td>
                                        <td className="px-6 py-4 text-right">{data.totalOTPay.toLocaleString()}</td>
                                        <td className="px-6 py-4 text-right text-red-500 font-bold">
                                            {data.totalDeduct > 0 ? `-${data.totalDeduct.toLocaleString()}` : '-'}
                                        </td>
                                        <td className="px-6 py-4 text-right text-green-600 font-bold text-base border-l">
                                            {data.netSalary.toLocaleString()} ฿
                                        </td>
                                        <td className="px-6 py-4 text-center">
                                            <button 
                                                onClick={() => { setShowDeductModal(true); setDeductForm({...deductForm, empId: data.emp.id}); }}
                                                className="bg-red-50 text-red-600 px-3 py-1 rounded-lg text-xs font-bold hover:bg-red-100 transition"
                                            >
                                                - Deduct
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {deductions.length > 0 && (
                    <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                        <h3 className="font-bold text-slate-700 mb-4 text-sm">Deductions List</h3>
                        <div className="space-y-2">
                            {deductions.map(d => {
                                const empName = employees.find(e => e.id === d.employee_id)?.name;
                                return (
                                    <div key={d.id} className="flex justify-between items-center bg-slate-50 p-3 rounded-lg border border-slate-200">
                                        <div className="flex gap-3">
                                            <span className="font-bold text-slate-700">{empName}</span>
                                            <span className="text-slate-500">Note: {d.reason}</span>
                                        </div>
                                        <div className="flex gap-4 items-center">
                                            <span className="font-bold text-red-500">
                                                -{d.amount} {d.is_percentage ? '%' : 'THB'}
                                            </span>
                                            <button onClick={() => handleDeleteDeduction(d.id)} className="text-xs text-slate-400 hover:text-red-500">❌</button>
                                        </div>
                                    </div>
                                )
                            })}
                        </div>
                    </div>
                )}

                {showDeductModal && (
                    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl">
                            <h3 className="font-bold text-lg mb-4 text-red-600">Deduction / Penalty</h3>
                            <div className="space-y-3">
                                <div>
                                    <label className="text-xs font-bold">Amount</label>
                                    <input type="number" className="w-full p-2 border rounded" autoFocus 
                                        value={deductForm.amount} onChange={e => setDeductForm({...deductForm, amount: e.target.value})} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <input type="checkbox" checked={deductForm.isPercent} onChange={e => setDeductForm({...deductForm, isPercent: e.target.checked})} />
                                    <label className="text-sm">Percentage (%)</label>
                                </div>
                                <div>
                                    <label className="text-xs font-bold">Reason</label>
                                    <input type="text" className="w-full p-2 border rounded" placeholder="e.g. Late"
                                        value={deductForm.reason} onChange={e => setDeductForm({...deductForm, reason: e.target.value})} />
                                </div>
                                <div className="flex gap-2 pt-2">
                                    <button onClick={handleAddDeduction} className="flex-1 bg-red-600 text-white py-2 rounded-lg font-bold">Save</button>
                                    <button onClick={() => setShowDeductModal(false)} className="flex-1 bg-gray-200 text-gray-700 py-2 rounded-lg">Cancel</button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        )}

        {/* --- 3. REQUESTS TAB --- */}
        {activeTab === 'requests' && (
            <div className="space-y-6 animate-fade-in-up">
                <h3 className="font-bold text-lg text-slate-700">Leave Requests</h3>
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-400 uppercase text-xs font-bold">
                            <tr><th className="px-6 py-4">Name</th><th className="px-6 py-4">Date</th><th className="px-6 py-4">Type</th><th className="px-6 py-4">Reason</th><th className="px-6 py-4">Status</th><th className="px-6 py-4 text-right">Action</th></tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {leaveRequests.map(req => (
                                <tr key={req.id} className="hover:bg-slate-50">
                                    <td className="px-6 py-4 font-bold text-slate-700">{req.employees?.name}</td>
                                    <td className="px-6 py-4 font-mono">{req.leave_date}</td>
                                    <td className="px-6 py-4">
                                        {req.leave_type === 'sick' ? '😷 ป่วย' : req.leave_type === 'business' ? '💼 กิจ' : '🏖️ พักร้อน'}
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">{req.reason}</td>
                                    <td className="px-6 py-4">
                                        <span className={`px-2 py-1 rounded text-xs font-bold ${
                                            req.status === 'approved' ? 'bg-green-100 text-green-700' :
                                            req.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                                        }`}>{req.status.toUpperCase()}</span>
                                    </td>
                                    <td className="px-6 py-4 text-right gap-2 flex justify-end">
                                        {req.status === 'pending' && (
                                            <>
                                                <button onClick={() => handleLeaveAction(req, 'approved')} className="bg-emerald-500 text-white px-3 py-1.5 rounded-lg text-xs font-bold hover:bg-emerald-600 transition">Approve</button>
                                                <button onClick={() => handleLeaveAction(req, 'rejected')} className="bg-rose-50 text-rose-600 px-3 py-1.5 rounded-lg text-xs font-bold border border-rose-200 hover:bg-rose-100 transition">Reject</button>
                                            </>
                                        )}
                                    </td>
                                </tr>
                            ))}
                            {leaveRequests.length === 0 && <tr><td colSpan="6" className="p-8 text-center text-slate-400">ไม่มีคำขอลาใหม่</td></tr>}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* --- 4. HISTORY TAB --- */}
        {activeTab === 'history' && (
            <div className="space-y-6 animate-fade-in-up">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <div className="flex flex-col md:flex-row justify-between items-end gap-4">
                        <div className="flex-1 w-full">
                            <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Select Employee</label>
                            <div className="flex gap-4">
                                <select className="w-full md:w-1/3 p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-slate-800 outline-none transition" value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)}>
                                    <option value="ALL">-- Choose --</option>
                                    {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                                </select>
                                <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="p-3 rounded-xl border border-slate-200 bg-slate-50 font-bold text-slate-700 outline-none" />
                            </div>
                        </div>
                        {selectedEmpId !== "ALL" && (
                            <button onClick={handleExportExcel} className="bg-green-600 text-white px-6 py-3 rounded-xl font-bold shadow hover:bg-green-700 transition flex items-center gap-2">
                                📥 Export Excel
                            </button>
                        )}
                    </div>
                </div>

                {selectedEmpId !== "ALL" && (
                    <>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase">Work Days</p>
                                <p className="text-3xl font-bold text-slate-800 mt-2">{individualStats.work_days} <span className="text-sm font-normal text-slate-400">days</span></p>
                            </div>
                            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase">Late</p>
                                <p className="text-3xl font-bold text-orange-500 mt-2">{individualStats.late} <span className="text-sm font-normal text-slate-400">times</span></p>
                            </div>
                            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-100">
                                <p className="text-xs font-bold text-slate-400 uppercase">Absent</p>
                                <p className="text-3xl font-bold text-rose-500 mt-2">{individualStats.absent} <span className="text-sm font-normal text-slate-400">times</span></p>
                            </div>
                        </div>

                        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-400 uppercase text-xs font-bold"><tr><th className="px-6 py-4">Date</th><th className="px-6 py-4">Time</th><th className="px-6 py-4">Action</th><th className="px-6 py-4">Note</th></tr></thead>
                                <tbody className="divide-y divide-slate-50">
                                    {individualLogs.map(log => {
                                        const schedule = getShiftInfo(log);
                                        const { status, color } = analyzeLog(log, schedule);
                                        return (
                                            <tr key={log.id} className="hover:bg-slate-50">
                                                <td className="px-6 py-4 font-bold text-slate-700">{format(parseISO(log.timestamp), "dd MMM yyyy", { locale: th })}</td>
                                                <td className="px-6 py-4 font-mono text-slate-500">{format(parseISO(log.timestamp), "HH:mm")}</td>
                                                <td className="px-6 py-4">
                                                    {log.action_type === 'check_in' && '🟢 In'}
                                                    {log.action_type === 'check_out' && '🔴 Out'}
                                                    {log.action_type === 'absent' && '🚫 Absent'}
                                                </td>
                                                <td className="px-6 py-4"><span className={`px-2 py-1 rounded text-xs ${color}`}>{status}</span></td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        )}

        {/* --- 5. ROSTER TAB --- */}
        {activeTab === 'roster' && (
            <div className="space-y-6 animate-fade-in-up">
                <div className="flex justify-between items-center bg-amber-50 p-4 rounded-2xl border border-amber-100">
                    <div className="text-amber-800 text-sm font-bold flex items-center gap-2">📅 Weekly Schedule <span className="font-normal opacity-70">(Auto-saved)</span></div>
                    <button onClick={handleNotifySchedule} className="bg-amber-600 text-white px-4 py-2 rounded-xl font-bold text-xs shadow hover:bg-amber-700 transition">Publish to LINE</button>
                </div>
                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden overflow-x-auto">
                    <table className="w-full text-sm border-collapse">
                        <thead>
                            <tr><th className="p-4 text-left min-w-[150px] bg-slate-50 border-b border-slate-100 text-slate-500 uppercase text-xs font-bold">Staff</th>{days.map(d => <th key={d} className="p-4 bg-slate-50 border-b border-slate-100 text-center min-w-[100px] text-slate-500 text-xs font-bold">{d}</th>)}</tr>
                        </thead>
                        <tbody>
                            {employees.map(emp => (
                                <tr key={emp.id} className="hover:bg-slate-50 transition">
                                    <td className="p-4 border-b border-slate-50 font-bold text-slate-700 bg-white sticky left-0">{emp.name}</td>
                                    {days.map((_, i) => {
                                        const s = schedules[emp.id]?.[i];
                                        return (
                                            <td key={i} className="p-2 border-b border-slate-50 text-center border-l border-slate-50">
                                                <select className={`w-full p-2 rounded-lg text-xs font-bold outline-none cursor-pointer transition ${s?.is_off ? 'bg-slate-100 text-slate-400' : 'bg-blue-50 text-blue-600 hover:bg-blue-100'}`}
                                                    value={s?.is_off ? 'OFF' : (s?.shift_id || '')} onChange={(e) => handleUpdateSchedule(emp.id, i, e.target.value === 'OFF' ? null : e.target.value, e.target.value === 'OFF')}>
                                                    <option value="" disabled>-</option>
                                                    {shifts.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}
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
            </div>
        )}

        {/* --- 6. EMPLOYEES TAB --- */}
        {activeTab === 'employees' && (
            <div className="grid md:grid-cols-3 gap-8 animate-fade-in-up">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-fit">
                    <h3 className="font-bold text-lg text-slate-700 mb-4">Add Employee</h3>
                    <form onSubmit={handleAddEmployee} className="flex flex-col gap-4">
                        <input required placeholder="Full Name" className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-slate-800 outline-none transition" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                        <input placeholder="Position" className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-slate-800 outline-none transition" value={newEmp.position} onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
                        <input required placeholder="Line User ID (U...)" className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-slate-800 outline-none font-mono text-xs transition" value={newEmp.line_user_id} onChange={e => setNewEmp({...newEmp, line_user_id: e.target.value})} />
                        <button className="w-full py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-700 transition shadow-lg">Save Employee</button>
                    </form>
                </div>
                <div className="md:col-span-2 bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <table className="w-full text-sm text-left">
                        <thead className="bg-slate-50 text-slate-400 uppercase text-xs font-bold"><tr><th className="px-6 py-4">Name</th><th className="px-6 py-4">Position</th><th className="px-6 py-4">Line ID</th><th className="px-6 py-4 text-right">Action</th></tr></thead>
                        <tbody className="divide-y divide-slate-50">
                            {employees.map(emp => (
                                <tr key={emp.id} className="hover:bg-slate-50 transition">
                                    {editingEmpId === emp.id ? (
                                        <>
                                            <td className="px-6 py-4"><input className="border p-1 rounded w-full text-sm" value={editFormData.name} onChange={e => setEditFormData({...editFormData, name: e.target.value})} /></td>
                                            <td className="px-6 py-4"><input className="border p-1 rounded w-full text-sm" value={editFormData.position} onChange={e => setEditFormData({...editFormData, position: e.target.value})} /></td>
                                            <td className="px-6 py-4 font-mono text-xs text-slate-400">{emp.line_user_id}</td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button onClick={() => saveEditEmployee(emp.id)} className="bg-emerald-100 text-emerald-700 px-2 py-1 rounded text-xs font-bold">Save</button>
                                                <button onClick={cancelEditEmployee} className="bg-gray-100 text-gray-500 px-2 py-1 rounded text-xs">Cancel</button>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-6 py-4"><div className="font-bold text-slate-700">{emp.name}</div></td>
                                            <td className="px-6 py-4 text-xs text-slate-500">{emp.position}</td>
                                            <td className="px-6 py-4 font-mono text-xs text-slate-400 truncate max-w-[100px]">{emp.line_user_id}</td>
                                            <td className="px-6 py-4 text-right flex justify-end gap-2">
                                                <button onClick={() => startEditEmployee(emp)} className="text-blue-500 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg text-xs font-bold transition">Edit</button>
                                                <button onClick={() => handleDeleteEmployee(emp.id)} className="text-rose-500 hover:text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg text-xs font-bold transition">Delete</button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* --- 7. SETTINGS TAB --- */}
        {activeTab === 'settings' && (
            <div className="max-w-xl mx-auto space-y-4 animate-fade-in-up">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="font-bold text-lg text-slate-700 mb-6 flex items-center gap-2">⚙️ Shift Settings</h3>
                    <div className="space-y-4">
                        {shifts.map(shift => (
                            <div key={shift.id} className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition">
                                <div className="font-bold text-slate-700 w-full sm:w-1/3 mb-2 sm:mb-0">{shift.name}</div>
                                <div className="flex gap-2 items-center w-full sm:w-2/3">
                                    <div className="flex flex-col flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase mb-1">In</label>
                                        <input type="time" className="w-full p-2 rounded-xl border border-slate-200 text-center font-mono focus:ring-2 focus:ring-blue-500 outline-none" value={shift.start_time} onChange={e => handleUpdateShift(shift.id, 'start_time', e.target.value)} />
                                    </div>
                                    <span className="text-slate-400 mt-4">➜</span>
                                    <div className="flex flex-col flex-1">
                                        <label className="text-[10px] text-slate-400 font-bold uppercase mb-1">Out</label>
                                        <input type="time" className="w-full p-2 rounded-xl border border-slate-200 text-center font-mono focus:ring-2 focus:ring-blue-500 outline-none" value={shift.end_time} onChange={e => handleUpdateShift(shift.id, 'end_time', e.target.value)} />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    {/* ✅✅✅ ส่วนเพิ่มใหม่: ตั้งเวลาแจ้งเตือน ✅✅✅ */}
                    <div className="mt-8 border-t pt-6">
                        <h4 className="font-bold text-md text-slate-700 mb-4 flex items-center gap-2">🔔 Notification Times</h4>
                        <div className="space-y-4">
                            {shifts.map(shift => (
                                <div key={shift.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100">
                                    <div className="font-bold text-slate-700 text-sm w-1/3 flex flex-col">
                                        <span>{shift.name}</span>
                                        {(!shift.notify_time_in || !shift.notify_time_out) && 
                                            <span className="text-[10px] text-slate-400 font-normal">(แจ้งเตือน: ปิด)</span>
                                        }
                                    </div>
                                    <div className="flex gap-4 w-2/3">
                                        <div className="flex-1">
                                            <label className="text-[10px] text-slate-400 font-bold uppercase mb-1">Check-In Alert</label>
                                            <input type="time" className="w-full p-2 rounded-xl border border-slate-200 text-center font-bold text-orange-500 bg-white focus:ring-2 focus:ring-orange-200" 
                                                value={shift.notify_time_in || ''} 
                                                onChange={(e) => handleUpdateShift(shift.id, 'notify_time_in', e.target.value)} 
                                            />
                                        </div>
                                        <div className="flex-1">
                                            <label className="text-[10px] text-slate-400 font-bold uppercase mb-1">Check-Out Alert</label>
                                            <input type="time" className="w-full p-2 rounded-xl border border-slate-200 text-center font-bold text-rose-500 bg-white focus:ring-2 focus:ring-rose-200" 
                                                value={shift.notify_time_out || ''} 
                                                onChange={(e) => handleUpdateShift(shift.id, 'notify_time_out', e.target.value)} 
                                            />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}