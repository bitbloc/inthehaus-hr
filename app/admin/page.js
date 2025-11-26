"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { th } from "date-fns/locale";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | history | roster | employees | settings
  
  // Data States
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState({}); 
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [stats, setStats] = useState({ total: 0 });
  const [newEmp, setNewEmp] = useState({ name: "", position: "", line_user_id: "" });

  // State สำหรับ Tab ประวัติรายคน
  const [selectedEmpId, setSelectedEmpId] = useState("ALL");
  const [individualLogs, setIndividualLogs] = useState([]);
  const [individualStats, setIndividualStats] = useState({ present: 0, late: 0, check_out: 0 });

  useEffect(() => {
    fetchShifts();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard") fetchLogs();
    if (activeTab === "roster") fetchSchedules();
    if (activeTab === "history" && selectedEmpId !== "ALL") fetchIndividualLogs();
  }, [activeTab, selectedMonth, selectedEmpId]);

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
  
  // Fetch ภาพรวม
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

  // Fetch รายบุคคล
  const fetchIndividualLogs = async () => {
    const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    
    const { data } = await supabase
      .from("attendance_logs")
      .select("*, employees(name, shifts(name, start_time))")
      .eq("employee_id", selectedEmpId)
      .gte("timestamp", startDate)
      .lte("timestamp", endDate)
      .order("timestamp", { ascending: false });

    setIndividualLogs(data || []);
    
    // คำนวณสถิติ
    let lateCount = 0;
    let checkOutCount = 0;
    let checkInCount = 0;

    data?.forEach(log => {
        if (log.action_type === 'check_out') checkOutCount++;
        if (log.action_type === 'check_in') {
            checkInCount++;
            const logTime = new Date(log.timestamp);
            const shiftStart = log.employees?.shifts?.start_time || "08:00";
            const [sHour, sMin] = shiftStart.split(':').map(Number);
            if (logTime.getHours() * 60 + logTime.getMinutes() > sHour * 60 + sMin) {
                lateCount++;
            }
        }
    });

    setIndividualStats({ present: checkInCount, late: lateCount, check_out: checkOutCount });
  };

  // --- Actions ---
  const handleUpdateShift = async (id, field, value) => {
    const { error } = await supabase.from("shifts").update({ [field]: value }).eq("id", id);
    if (!error) fetchShifts();
  };
  const handleUpdateSchedule = async (empId, day, shiftId, isOff) => {
    const payload = { employee_id: empId, day_of_week: day, shift_id: isOff ? null : shiftId, is_off: isOff };
    const { error } = await supabase.from("employee_schedules").upsert(payload, { onConflict: 'employee_id, day_of_week' });
    if (!error) fetchSchedules();
  };
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    if (!newEmp.name || !newEmp.line_user_id) { alert("ข้อมูลไม่ครบ"); return; }
    const { error } = await supabase.from("employees").insert([newEmp]);
    if (!error) { alert("✅ เพิ่มเรียบร้อย"); setNewEmp({ name: "", position: "", line_user_id: "" }); fetchEmployees(); }
  };
  const handleDeleteEmployee = async (id) => {
    if (confirm("ลบพนักงาน?")) { await supabase.from("employees").delete().eq("id", id); fetchEmployees(); }
  };
  
  // Notification Buttons
  const handleNotifyCheckIn = async () => { if(confirm("ส่งสรุปคนมา?")) await fetch('/api/notify', { method: 'POST' }); };
  const handleNotifyAbsence = async () => { if(confirm("ตามคนขาด?")) await fetch('/api/notify-absence', { method: 'POST' }); };
  const handleRemindShift = async (shiftName) => { if(confirm(`เรียก ${shiftName}?`)) await fetch('/api/remind-shift', { method: 'POST', body: JSON.stringify({ shiftName }) }); };
  
  // (New) ปุ่มประกาศตารางงาน
  const handleNotifySchedule = async () => {
     if(!confirm("ต้องการประกาศตารางงานสัปดาห์นี้เข้า LINE กลุ่ม?")) return;
     try {
       await fetch('/api/notify-schedule', { method: 'POST' });
       alert("✅ ประกาศตารางงานเรียบร้อย!");
     } catch(e) { alert("เกิดข้อผิดพลาดในการส่ง: " + e.message); }
  };

  const days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

  return (
    <div className="min-h-screen bg-gray-50 font-sans p-4 md:p-6">
      <div className="max-w-6xl mx-auto bg-white min-h-[90vh] rounded-2xl shadow-lg overflow-hidden flex flex-col border border-gray-100">
        
        {/* Navbar */}
        <div className="border-b px-6 py-4 flex flex-col md:flex-row justify-between items-center bg-white sticky top-0 z-20 shadow-sm">
            <h1 className="text-xl font-bold text-gray-800 mb-2 md:mb-0">In the haus HR 🏠</h1>
            <div className="flex bg-gray-100 p-1 rounded-lg shadow-inner overflow-x-auto max-w-full">
                {['dashboard', 'history', 'roster', 'employees', 'settings'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                        className={`px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${activeTab === t ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t === 'dashboard' ? '📊 ภาพรวม' : t === 'history' ? '👤 ประวัติ' : t === 'roster' ? '📅 ตารางงาน' : t === 'employees' ? '👥 พนักงาน' : '⚙️ กะงาน'}
                    </button>
                ))}
            </div>
        </div>

        {/* Content Area */}
        <div className="p-6 flex-1 bg-white">
            
            {/* --- TAB 1: DASHBOARD (ภาพรวมทุกคน) --- */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div className="flex items-center bg-gray-50 p-2 rounded-lg border">
                            <span className="text-sm text-gray-500 mr-2">📅 เดือน:</span>
                            <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-transparent text-sm font-bold text-gray-700 outline-none" />
                        </div>
                    </div>
                    
                    {/* Control Panel */}
                    <div className="bg-white p-5 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase tracking-wider flex items-center gap-1">🔔 แผงควบคุมการแจ้งเตือน</h3>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                            {shifts.map(s => (
                                <button key={s.id} onClick={() => handleRemindShift(s.name)} 
                                    className="bg-blue-50 text-blue-700 px-2 py-3 rounded-lg font-bold hover:bg-blue-100 text-xs border border-blue-200 transition flex items-center justify-center gap-1">
                                    📢 เรียก {s.name}
                                </button>
                            ))}
                            <button onClick={handleNotifyCheckIn} className="bg-green-50 text-green-700 px-2 py-3 rounded-lg font-bold hover:bg-green-100 text-xs border border-green-200 transition flex items-center justify-center gap-1">✅ สรุปคนมา</button>
                            <button onClick={handleNotifyAbsence} className="bg-red-50 text-red-700 px-2 py-3 rounded-lg font-bold hover:bg-red-100 text-xs border border-red-200 transition flex items-center justify-center gap-1">⚠️ ตามคนขาด</button>
                        </div>
                    </div>

                    {/* Latest Logs Table */}
                    <div>
                        <h3 className="font-bold text-gray-700 mb-4 pl-3 border-l-4 border-blue-500">Log ล่าสุด (รวมทุกคน)</h3>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                                    <tr><th className="p-3">เวลา</th><th className="p-3">ชื่อ</th><th className="p-3">สถานะ</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {logs.slice(0, 10).map(log => ( 
                                        <tr key={log.id} className="hover:bg-gray-50">
                                            <td className="p-3">{format(parseISO(log.timestamp), "d MMM HH:mm", { locale: th })}</td>
                                            <td className="p-3 font-medium">{log.employees?.name}</td>
                                            <td className="p-3">{log.action_type === 'check_in' ? <span className="text-green-600 font-bold">🟢 เข้า</span> : <span className="text-red-500 font-bold">🔴 ออก</span>}</td>
                                        </tr>
                                    ))}
                                    {logs.length === 0 && <tr><td colSpan="3" className="p-6 text-center text-gray-400">ยังไม่มีข้อมูลวันนี้</td></tr>}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- TAB 2: HISTORY (ประวัติรายคน) --- */}
            {activeTab === 'history' && (
                <div className="space-y-6">
                    {/* Filter Bar */}
                    <div className="flex flex-col md:flex-row gap-4 bg-gray-50 p-4 rounded-xl border">
                        <div className="flex-1">
                            <label className="block text-xs font-bold text-gray-500 uppercase mb-1">เลือกพนักงาน</label>
                            <select 
                                className="w-full p-2 rounded border bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                value={selectedEmpId}
                                onChange={(e) => setSelectedEmpId(e.target.value)}
                            >
                                <option value="ALL">-- เลือกพนักงาน --</option>
                                {employees.map(emp => (
                                    <option key={emp.id} value={emp.id}>{emp.name} ({emp.position})</option>
                                ))}
                            </select>
                        </div>
                        <div>
                             <label className="block text-xs font-bold text-gray-500 uppercase mb-1">เดือน</label>
                             <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="p-2 rounded border bg-white" />
                        </div>
                    </div>

                    {selectedEmpId === "ALL" ? (
                        <div className="text-center py-20 text-gray-400 bg-gray-50 rounded-xl border border-dashed">
                            👆 กรุณาเลือกรายชื่อพนักงานด้านบน เพื่อดูประวัติการทำงาน
                        </div>
                    ) : (
                        <>
                            {/* Stats Summary */}
                            <div className="grid grid-cols-3 gap-4">
                                <div className="bg-green-50 p-4 rounded-xl border border-green-100 text-center">
                                    <div className="text-xs text-green-600 font-bold uppercase">เข้างาน (ครั้ง)</div>
                                    <div className="text-2xl font-bold text-green-700">{individualStats.present}</div>
                                </div>
                                <div className="bg-red-50 p-4 rounded-xl border border-red-100 text-center">
                                    <div className="text-xs text-red-600 font-bold uppercase">มาสาย (ครั้ง)</div>
                                    <div className="text-2xl font-bold text-red-700">{individualStats.late}</div>
                                </div>
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-center">
                                    <div className="text-xs text-blue-600 font-bold uppercase">ออกงาน (ครั้ง)</div>
                                    <div className="text-2xl font-bold text-blue-700">{individualStats.check_out}</div>
                                </div>
                            </div>

                            {/* Detailed Table */}
                            <div>
                                <h3 className="font-bold text-gray-700 mb-3">บันทึกเวลาอย่างละเอียด</h3>
                                <div className="overflow-x-auto rounded-lg border shadow-sm">
                                    <table className="w-full text-sm text-left">
                                        <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                                            <tr>
                                                <th className="p-3">วันที่</th>
                                                <th className="p-3">เวลา</th>
                                                <th className="p-3">การกระทำ</th>
                                                <th className="p-3">กะงาน</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y">
                                            {individualLogs.length === 0 ? (
                                                <tr><td colSpan="4" className="p-6 text-center text-gray-400">ไม่พบข้อมูลในเดือนนี้</td></tr>
                                            ) : (
                                                individualLogs.map(log => {
                                                    const isLate = log.action_type === 'check_in' && (() => {
                                                        const logTime = new Date(log.timestamp);
                                                        const shiftStart = log.employees?.shifts?.start_time || "08:00";
                                                        const [h, m] = shiftStart.split(':').map(Number);
                                                        return logTime.getHours() * 60 + logTime.getMinutes() > h * 60 + m;
                                                    })();

                                                    return (
                                                        <tr key={log.id} className="bg-white hover:bg-gray-50">
                                                            <td className="p-3 font-medium text-gray-700 border-r">{format(parseISO(log.timestamp), "d MMM yyyy", { locale: th })}</td>
                                                            <td className="p-3 font-mono text-blue-600">{format(parseISO(log.timestamp), "HH:mm:ss")}</td>
                                                            <td className="p-3">
                                                                {log.action_type === 'check_in' ? (
                                                                    <span className={`px-2 py-1 rounded text-xs font-bold ${isLate ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                                                                        {isLate ? 'เข้างาน (สาย)' : 'เข้างาน (ปกติ)'}
                                                                    </span>
                                                                ) : (
                                                                    <span className="px-2 py-1 rounded text-xs font-bold bg-gray-100 text-gray-600">ออกงาน</span>
                                                                )}
                                                            </td>
                                                            <td className="p-3 text-gray-500 text-xs">
                                                                {log.employees?.shifts?.name} ({log.employees?.shifts?.start_time})
                                                            </td>
                                                        </tr>
                                                    )
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            )}

            {/* --- TAB 3: ROSTER (ตารางงานรวม + ปุ่มประกาศ LINE) --- */}
            {activeTab === 'roster' && (
                <div>
                    <div className="flex flex-col md:flex-row justify-between items-center mb-4 bg-yellow-50 p-4 rounded-lg border border-yellow-200 gap-4">
                        <div className="text-yellow-800 text-sm flex items-start">
                            <span className="text-xl mr-2">📅</span>
                            <div>
                                <b>จัดการตารางงาน:</b> เลือกกะให้พนักงานในแต่ละวัน (ระบบบันทึกอัตโนมัติ)
                            </div>
                        </div>
                        <button 
                            onClick={handleNotifySchedule}
                            className="bg-blue-600 text-white px-5 py-2.5 rounded-lg font-bold text-sm shadow hover:bg-blue-700 transition flex items-center gap-2 whitespace-nowrap"
                        >
                            📢 ประกาศตารางงานเข้า Line
                        </button>
                    </div>
                    
                    <div className="overflow-x-auto rounded-lg border shadow-sm">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-3 text-left min-w-[150px] bg-gray-100 border-b text-gray-600">พนักงาน</th>
                                    {days.map(d => <th key={d} className="p-3 bg-gray-50 border text-center min-w-[100px] text-gray-700">{d}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="p-3 border font-bold bg-white text-gray-700">{emp.name}</td>
                                        {days.map((d, dayIndex) => {
                                            const schedule = schedules[emp.id]?.[dayIndex]; 
                                            const currentShiftId = schedule?.is_off ? 'OFF' : (schedule?.shift_id || '');
                                            return (
                                                <td key={dayIndex} className="p-2 border text-center bg-white">
                                                    <select 
                                                        className={`w-full p-1 rounded border text-xs font-bold outline-none cursor-pointer ${currentShiftId === 'OFF' ? 'bg-gray-100 text-gray-400' : 'bg-white text-blue-600 border-blue-200'}`}
                                                        value={currentShiftId}
                                                        onChange={(e) => handleUpdateSchedule(emp.id, dayIndex, e.target.value === 'OFF' ? null : e.target.value, e.target.value === 'OFF')}
                                                    >
                                                        <option value="" disabled>--เลือก--</option>
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

            {/* --- TAB 4: EMPLOYEES --- */}
            {activeTab === 'employees' && (
                <div className="grid md:grid-cols-3 gap-8">
                    <div className="bg-white p-6 rounded-xl shadow-sm border h-fit sticky top-20">
                        <h3 className="font-bold mb-4 border-b pb-2">➕ เพิ่มพนักงาน</h3>
                        <form onSubmit={handleAddEmployee} className="flex flex-col gap-4">
                            <input required placeholder="ชื่อ-นามสกุล" className="border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                            <input placeholder="ตำแหน่ง" className="border p-2 rounded outline-none focus:ring-2 focus:ring-blue-500" value={newEmp.position} onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
                            <input required placeholder="Line User ID (U...)" className="border p-2 rounded text-xs font-mono outline-none focus:ring-2 focus:ring-blue-500" value={newEmp.line_user_id} onChange={e => setNewEmp({...newEmp, line_user_id: e.target.value})} />
                            <button type="submit" className="bg-blue-600 text-white py-2 rounded font-bold hover:bg-blue-700 shadow mt-2">บันทึก</button>
                        </form>
                    </div>
                    <div className="md:col-span-2">
                        <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
                            <table className="w-full text-left text-sm">
                                <thead className="bg-gray-50 text-gray-500 uppercase text-xs">
                                    <tr><th className="px-6 py-3">ชื่อ</th><th className="px-6 py-3">Line ID</th><th className="px-6 py-3 text-right">จัดการ</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {employees.map(emp => (
                                        <tr key={emp.id} className="hover:bg-gray-50">
                                            <td className="px-6 py-4 font-bold">{emp.name} <div className="text-xs text-gray-400 font-normal">{emp.position}</div></td>
                                            <td className="px-6 py-4 font-mono text-xs text-gray-500 truncate max-w-[100px]">{emp.line_user_id}</td>
                                            <td className="px-6 py-4 text-right"><button onClick={() => handleDeleteEmployee(emp.id)} className="text-red-500 border border-transparent hover:border-red-200 hover:bg-red-50 px-3 py-1 rounded text-xs transition">ลบ</button></td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* --- TAB 5: SETTINGS --- */}
            {activeTab === 'settings' && (
                <div className="max-w-2xl mx-auto">
                    <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                        <h3 className="font-bold text-lg mb-6 flex items-center gap-2">⚙️ ตั้งค่าเวลาเข้า-ออกงาน</h3>
                        <div className="space-y-6">
                            {shifts.map(shift => (
                                <div key={shift.id} className="flex flex-col sm:flex-row items-center justify-between p-4 bg-gray-50 rounded-lg border hover:border-blue-200 transition">
                                    <div className="font-bold text-gray-700 w-full sm:w-1/3 mb-2 sm:mb-0 text-lg">{shift.name}</div>
                                    <div className="flex gap-4 items-center w-full sm:w-2/3">
                                        <div className="flex-1">
                                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">เวลาเข้า</label>
                                            <input type="time" className="border border-gray-300 p-2 rounded w-full text-center font-mono bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={shift.start_time} onChange={(e) => handleUpdateShift(shift.id, 'start_time', e.target.value)} />
                                        </div>
                                        <div className="text-gray-400 font-bold mt-4">➜</div>
                                        <div className="flex-1">
                                            <label className="text-[10px] text-gray-400 font-bold uppercase block mb-1">เวลาออก</label>
                                            <input type="time" className="border border-gray-300 p-2 rounded w-full text-center font-mono bg-white focus:ring-2 focus:ring-blue-500 outline-none" value={shift.end_time} onChange={(e) => handleUpdateShift(shift.id, 'end_time', e.target.value)} />
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

        </div>
      </div>
    </div>
  );
}