"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth, differenceInMinutes } from "date-fns";
import { th } from "date-fns/locale";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  
  // --- Data States ---
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  
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
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard") fetchLogs();
    if (activeTab === "roster") fetchSchedules(); 
    if (activeTab === "history" && selectedEmpId !== "ALL") fetchIndividualLogs();
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

  // Helper Logic
  const getShiftInfo = (log) => {
      if (!log || !schedules[log.employee_id]) return null;
      return schedules[log.employee_id][new Date(log.timestamp).getDay()]; 
  };

  const analyzeLog = (log, schedule) => {
      if (log.action_type === 'absent') return { status: '❌ ขาดงาน', color: 'text-white bg-rose-500 font-bold px-3 py-1 rounded-full' };
      
      if (!schedule?.shifts) return { status: '', color: '' };
      const d = new Date(log.timestamp);
      const [sh, sm] = schedule.shifts.start_time.split(':');
      const [eh, em] = schedule.shifts.end_time.split(':');
      const start = new Date(d); start.setHours(sh, sm, 0);
      const end = new Date(d); end.setHours(eh, em, 0);

      if (log.action_type === 'check_in') {
          const diff = differenceInMinutes(d, start);
          return diff > 0 ? { status: `สาย ${diff} น.`, color: 'text-orange-700 bg-orange-100 font-bold' } : { status: `ตรงเวลา`, color: 'text-emerald-700 bg-emerald-100 font-bold' };
      } else {
          const diff = differenceInMinutes(end, d);
          return diff > 0 ? { status: `ออกก่อน ${diff} น.`, color: 'text-rose-700 bg-rose-100 font-bold' } : { status: `ปกติ`, color: 'text-slate-600 bg-slate-100' };
      }
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
                {['dashboard', 'history', 'roster', 'employees', 'settings'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                        className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ease-in-out whitespace-nowrap ${activeTab === t ? 'bg-slate-800 text-white shadow-md' : 'text-slate-500 hover:bg-slate-50'}`}>
                        {t === 'dashboard' ? 'Overview' : t === 'history' ? 'History' : t === 'roster' ? 'Roster' : t === 'employees' ? 'Staff' : 'Settings'}
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
                            <button onClick={handleFinalizeDay} className="px-4 py-2 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-slate-900 transition shadow ml-auto">🏁 ตัดยอด (สิ้นวัน)</button>
                        </div>
                    </div>
                </div>

                <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
                    <div className="p-6 border-b border-slate-50"><h3 className="font-bold text-lg text-slate-700">Real-time Activity</h3></div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-slate-50 text-slate-400 uppercase text-xs font-bold"><tr><th className="px-6 py-4">Time</th><th className="px-6 py-4">Name</th><th className="px-6 py-4">Action</th><th className="px-6 py-4">Detail</th></tr></thead>
                            <tbody className="divide-y divide-slate-50">
                                {logs.map(log => {
                                    const schedule = getShiftInfo(log);
                                    const { status, color } = analyzeLog(log, schedule);
                                    return (
                                        <tr key={log.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4 font-mono text-slate-500">{format(parseISO(log.timestamp), "HH:mm")} <span className="text-xs text-slate-300 ml-1">{format(parseISO(log.timestamp), "dd/MM")}</span></td>
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

        {/* --- TAB 2: HISTORY --- */}
        {activeTab === 'history' && (
            <div className="space-y-6 animate-fade-in-up">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
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

        {/* --- TAB 3: ROSTER --- */}
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

        {/* --- TAB 4: EMPLOYEES (Editable) --- */}
        {activeTab === 'employees' && (
            <div className="grid md:grid-cols-3 gap-8 animate-fade-in-up">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100 h-fit">
                    <h3 className="font-bold text-lg text-slate-700 mb-4">Add Employee</h3>
                    <form onSubmit={handleAddEmployee} className="flex flex-col gap-4">
                        <input required placeholder="Full Name" className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-slate-800 outline-none transition" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                        <input placeholder="Position" className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-slate-800 outline-none transition" value={newEmp.position} onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
                        <input required placeholder="Line User ID" className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 focus:ring-2 focus:ring-slate-800 outline-none font-mono text-xs transition" value={newEmp.line_user_id} onChange={e => setNewEmp({...newEmp, line_user_id: e.target.value})} />
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

        {/* --- TAB 5: SETTINGS --- */}
        {activeTab === 'settings' && (
            <div className="max-w-xl mx-auto space-y-4 animate-fade-in-up">
                <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-100">
                    <h3 className="font-bold text-lg text-slate-700 mb-6">Shift Settings</h3>
                    <div className="space-y-4">
                        {shifts.map(shift => (
                            <div key={shift.id} className="flex flex-col sm:flex-row items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:border-blue-200 transition">
                                <div className="font-bold text-slate-700 w-full sm:w-1/3 mb-2 sm:mb-0">{shift.name}</div>
                                <div className="flex gap-2 items-center w-full sm:w-2/3">
                                    <input type="time" className="w-full p-2 rounded-xl border border-slate-200 text-center font-mono focus:ring-2 focus:ring-blue-500 outline-none" value={shift.start_time} onChange={e => handleUpdateShift(shift.id, 'start_time', e.target.value)} />
                                    <span className="text-slate-400">➜</span>
                                    <input type="time" className="w-full p-2 rounded-xl border border-slate-200 text-center font-mono focus:ring-2 focus:ring-blue-500 outline-none" value={shift.end_time} onChange={e => handleUpdateShift(shift.id, 'end_time', e.target.value)} />
                                </div>
                            </div>
                        ))}
                    </div>
                    <div className="mt-6 p-4 bg-emerald-50 rounded-2xl flex gap-3 text-emerald-800 text-sm">
                        <span className="text-xl">💡</span>
                        <div>Changes are saved automatically.</div>
                    </div>
                </div>
            </div>
        )}

      </div>
    </div>
  );
}