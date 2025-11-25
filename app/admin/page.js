"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { th } from "date-fns/locale";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | roster | employees
  
  // Data States
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState({}); 
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [stats, setStats] = useState({ total: 0 });
  const [newEmp, setNewEmp] = useState({ name: "", position: "", line_user_id: "" });

  useEffect(() => {
    fetchShifts();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard") fetchLogs();
    if (activeTab === "roster") fetchSchedules();
  }, [activeTab, selectedMonth]);

  // --- API Fetching ---
  const fetchShifts = async () => {
    const { data } = await supabase.from("shifts").select("*").order("id");
    setShifts(data || []);
  };
  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*").order("id");
    setEmployees(data || []);
  };
  const fetchSchedules = async () => {
    const { data } = await supabase.from("employee_schedules").select("*");
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
    const { data } = await supabase
      .from("attendance_logs")
      .select("*, employees(name)")
      .gte("timestamp", startDate)
      .lte("timestamp", endDate)
      .order("timestamp", { ascending: false });
    setLogs(data || []);
    setStats({ total: data?.length || 0 }); 
  };

  // --- Actions ---
  const handleUpdateSchedule = async (empId, day, shiftId, isOff) => {
    const payload = {
        employee_id: empId,
        day_of_week: day,
        shift_id: isOff ? null : shiftId,
        is_off: isOff
    };
    const { error } = await supabase.from("employee_schedules").upsert(payload, { onConflict: 'employee_id, day_of_week' });
    if (error) alert("Error: " + error.message);
    else fetchSchedules();
  };

  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmp.name || !newEmp.line_user_id) {
        alert("กรุณากรอกข้อมูลให้ครบ"); return;
    }
    const { error } = await supabase.from("employees").insert([newEmp]);
    if (error) alert("บันทึกไม่ผ่าน: " + error.message);
    else {
        alert("✅ เพิ่มพนักงานเรียบร้อย!");
        setNewEmp({ name: "", position: "", line_user_id: "" });
        fetchEmployees();
    }
  };

  const handleDeleteEmployee = async (id, name) => {
    if (!confirm(`ต้องการลบพนักงาน "${name}" ใช่ไหม?`)) return;
    const { error } = await supabase.from("employees").delete().eq("id", id);
    if (error) alert("ลบไม่ผ่าน: " + error.message);
    else fetchEmployees();
  };

  // --- Notifications ---
  const handleNotifyCheckIn = async () => {
     if(!confirm("ส่งรายงานคนเข้างาน (Check-in) เข้า LINE?")) return;
     await fetch('/api/notify', { method: 'POST' });
     alert("ส่งคำสั่งเรียบร้อย");
  };
  const handleNotifyAbsence = async () => {
     if(!confirm("ส่งแจ้งเตือนคน 'ขาดงาน' เข้า LINE?")) return;
     const res = await fetch('/api/notify-absence', { method: 'POST' });
     const data = await res.json();
     alert(data.message || "ส่งเรียบร้อย");
  };
  const handleRemindShift = async (shiftName) => {
     if(!confirm(`ต้องการส่งแจ้งเตือนเรียก "${shiftName}" เข้างาน?`)) return;
     await fetch('/api/remind-shift', { 
        method: 'POST',
        body: JSON.stringify({ shiftName }),
        headers: { 'Content-Type': 'application/json' }
     });
     alert("ส่งแจ้งเตือนเรียบร้อย!");
  };

  const days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

  return (
    <div className="min-h-screen bg-gray-50 font-sans p-4 md:p-6">
      <div className="max-w-6xl mx-auto bg-white min-h-[85vh] rounded-2xl shadow-lg overflow-hidden flex flex-col border border-gray-100">
        
        {/* Navbar */}
        <div className="border-b px-6 py-4 flex flex-col md:flex-row justify-between items-center bg-white sticky top-0 z-10">
            <h1 className="text-xl font-bold text-gray-800 mb-2 md:mb-0">In the haus HR 🏠</h1>
            <div className="flex bg-gray-100 p-1 rounded-lg shadow-inner">
                {['dashboard', 'roster', 'employees'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition duration-200 ${activeTab === t ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t === 'dashboard' ? '📊 ภาพรวม' : t === 'roster' ? '📅 ตารางงาน' : '👥 พนักงาน'}
                    </button>
                ))}
            </div>
        </div>

        {/* Content Area */}
        <div className="p-6 flex-1 bg-white">
            
            {/* --- TAB 1: DASHBOARD --- */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    {/* Header Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center">
                            <span className="text-sm text-gray-500 mr-2">เลือกเดือน:</span>
                            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border rounded px-2 py-1 text-sm bg-gray-50" />
                        </div>
                    </div>

                    {/* Notification Center */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-sm font-bold text-gray-500 mb-4 uppercase flex items-center gap-2">
                            🔔 ศูนย์ควบคุมการแจ้งเตือน (LINE)
                        </h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            <button onClick={() => handleRemindShift("กะเช้า ☀️")} 
                                className="bg-orange-50 text-orange-700 px-3 py-3 rounded-lg font-bold hover:bg-orange-100 text-sm border border-orange-200 transition flex flex-col items-center gap-1">
                                <span className="text-xl">☀️</span> เรียกกะเช้า
                            </button>
                            <button onClick={() => handleRemindShift("กะค่ำ 🌙")} 
                                className="bg-indigo-50 text-indigo-700 px-3 py-3 rounded-lg font-bold hover:bg-indigo-100 text-sm border border-indigo-200 transition flex flex-col items-center gap-1">
                                <span className="text-xl">🌙</span> เรียกกะค่ำ
                            </button>
                            <button onClick={handleNotifyCheckIn} 
                                className="bg-green-50 text-green-700 px-3 py-3 rounded-lg font-bold hover:bg-green-100 text-sm border border-green-200 transition flex flex-col items-center gap-1">
                                <span className="text-xl">✅</span> สรุปคนมา
                            </button>
                            <button onClick={handleNotifyAbsence} 
                                className="bg-red-50 text-red-700 px-3 py-3 rounded-lg font-bold hover:bg-red-100 text-sm border border-red-200 transition flex flex-col items-center gap-1">
                                <span className="text-xl">⚠️</span> ตามคนขาด
                            </button>
                        </div>
                    </div>

                    {/* Stats */}
                    <div className="bg-gradient-to-r from-blue-500 to-blue-600 p-6 rounded-xl shadow-lg text-white text-center">
                        <h2 className="text-blue-100 mb-2 text-sm uppercase tracking-wide">เข้างานเดือนนี้ (ครั้ง)</h2>
                        <div className="text-6xl font-bold">{stats.total}</div>
                    </div>

                    {/* Table */}
                    <div>
                        <h3 className="font-bold text-gray-700 mb-4 border-l-4 border-blue-500 pl-3">ประวัติการลงเวลาล่าสุด</h3>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                                    <tr>
                                        <th className="p-3">เวลา</th>
                                        <th className="p-3">ชื่อ</th>
                                        <th className="p-3">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {logs.map(log => (
                                        <tr key={log.id} className="hover:bg-gray-50 transition">
                                            <td className="p-3">{format(parseISO(log.timestamp), "d MMM HH:mm", { locale: th })}</td>
                                            <td className="p-3 font-medium">{log.employees?.name}</td>
                                            <td className="p-3">{log.action_type === 'check_in' ? <span className="text-green-600 font-bold">🟢 เข้างาน</span> : <span className="text-red-500 font-bold">🔴 ออกงาน</span>}</td>
                                        </tr>
                                    ))}
                                    {logs.length === 0 && <tr><td colSpan="3" className="p-8 text-center text-gray-400">ยังไม่มีข้อมูลเดือนนี้</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- TAB 2: ROSTER --- */}
            {activeTab === 'roster' && (
                <div>
                    <div className="mb-4 bg-yellow-50 p-4 rounded-lg text-yellow-800 text-sm border border-yellow-200 flex items-start">
                        <span className="mr-2 text-xl">💡</span>
                        <div><b>วิธีจัดตารางงาน:</b> เลือกกะให้พนักงานในแต่ละวัน ระบบจะบันทึกให้อัตโนมัติทันที <br/>(ถ้าวันไหนหยุด ให้เลือก "❌ หยุด")</div>
                    </div>
                    <div className="overflow-x-auto rounded-lg border shadow-sm">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-3 text-left min-w-[150px] bg-gray-100 border-b text-gray-600">พนักงาน</th>
                                    {days.map(d => <th key={d} className="p-3 bg-gray-50 border text-center min-w-[100px] font-semibold text-gray-700">{d}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="p-3 border font-bold text-gray-700 bg-white">{emp.name}</td>
                                        {days.map((d, dayIndex) => {
                                            const schedule = schedules[emp.id]?.[dayIndex]; 
                                            const currentShiftId = schedule?.is_off ? 'OFF' : (schedule?.shift_id || '');
                                            return (
                                                <td key={dayIndex} className="p-2 border text-center bg-white">
                                                    <select 
                                                        className={`w-full p-1.5 rounded border text-xs font-bold outline-none ${currentShiftId === 'OFF' ? 'bg-gray-100 text-gray-400' : 'bg-white text-blue-600 border-blue-200'}`}
                                                        value={currentShiftId}
                                                        onChange={(e) => {
                                                            const val = e.target.value;
                                                            handleUpdateSchedule(emp.id, dayIndex, val === 'OFF' ? null : val, val === 'OFF');
                                                        }}
                                                    >
                                                        <option value="" disabled className="text-gray-300">--เลือก--</option>
                                                        {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                        <option value="OFF" className="text-red-500">❌ หยุด</option>
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

            {/* --- TAB 3: EMPLOYEES --- */}
            {activeTab === 'employees' && (
                <div className="grid md:grid-cols-3 gap-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border h-fit sticky top-20">
                        <h3 className="font-bold mb-4 text-lg text-gray-800 border-b pb-2">➕ เพิ่มพนักงานใหม่</h3>
                        <form onSubmit={handleAddEmployee} className="flex flex-col gap-4">
                            <input required placeholder="ชื่อ-นามสกุล" className="w-full border p-2 rounded outline-none" 
                                value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                            <input placeholder="ตำแหน่ง" className="w-full border p-2 rounded outline-none" 
                                value={newEmp.position} onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
                            <input required placeholder="Line User ID (U...)" className="w-full border p-2 rounded text-xs font-mono bg-gray-50 outline-none" 
                                value={newEmp.line_user_id} onChange={e => setNewEmp({...newEmp, line_user_id: e.target.value})} />
                            <button type="submit" className="bg-blue-600 text-white py-2.5 rounded-lg font-bold hover:bg-blue-700 transition shadow-md mt-2">บันทึก</button>
                        </form>
                    </div>
                    <div className="md:col-span-2">
                        <h3 className="font-bold mb-4 text-lg text-gray-800">รายชื่อพนักงานทั้งหมด ({employees.length})</h3>
                        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                                    <tr>
                                        <th className="px-6 py-3">ชื่อ</th>
                                        <th className="px-6 py-3">Line ID</th>
                                        <th className="px-6 py-3 text-right">จัดการ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y">
                                    {employees.map(emp => (
                                        <tr key={emp.id} className="hover:bg-gray-50 group">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-800 text-base">{emp.name}</div>
                                                <div className="text-xs text-gray-500">{emp.position}</div>
                                            </td>
                                            <td className="px-6 py-4 font-mono text-xs text-gray-500 truncate max-w-[100px]">{emp.line_user_id}</td>
                                            <td className="px-6 py-4 text-right">
                                                <button onClick={() => handleDeleteEmployee(emp.id, emp.name)} 
                                                    className="text-red-500 hover:text-red-700 bg-red-50 px-3 py-1.5 rounded text-xs font-bold border border-transparent hover:border-red-200 transition">ลบ</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
      </div>
    </div>
  );
}