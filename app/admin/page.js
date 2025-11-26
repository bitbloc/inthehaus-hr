"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { th } from "date-fns/locale";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard");
  
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState({});
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [stats, setStats] = useState({ total: 0 });
  
  const [newEmp, setNewEmp] = useState({ name: "", position: "", line_user_id: "" });
  const [selectedEmpId, setSelectedEmpId] = useState("ALL");
  const [individualLogs, setIndividualLogs] = useState([]);
  const [individualStats, setIndividualStats] = useState({ present: 0, late: 0, check_out: 0 });

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

  const fetchShifts = async () => { const { data } = await supabase.from("shifts").select("*").order("id"); setShifts(data || []); };
  const fetchEmployees = async () => { const { data } = await supabase.from("employees").select("*").order("id"); setEmployees(data || []); };
  
  const fetchSchedules = async () => {
    const { data } = await supabase.from("employee_schedules").select("*, shifts(name, start_time, end_time)");
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

  const fetchIndividualLogs = async () => {
    const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const { data } = await supabase
      .from("attendance_logs")
      .select("*, employees(name)")
      .eq("employee_id", selectedEmpId)
      .gte("timestamp", startDate)
      .lte("timestamp", endDate)
      .order("timestamp", { ascending: false });

    setIndividualLogs(data || []);
    
    let lateCount = 0, checkOutCount = 0, checkInCount = 0;
    data?.forEach(log => {
        if (log.action_type === 'check_out') checkOutCount++;
        else checkInCount++;
    });
    setIndividualStats({ present: checkInCount, late: lateCount, check_out: checkOutCount });
  };

  const handleUpdateShift = async (id, field, value) => { await supabase.from("shifts").update({ [field]: value }).eq("id", id); fetchShifts(); };
  const handleUpdateSchedule = async (empId, day, shiftId, isOff) => {
    const payload = { employee_id: empId, day_of_week: day, shift_id: isOff ? null : shiftId, is_off: isOff };
    await supabase.from("employee_schedules").upsert(payload, { onConflict: 'employee_id, day_of_week' });
    fetchSchedules();
  };
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("employees").insert([newEmp]);
    if (!error) { alert("✅ เพิ่มเรียบร้อย"); setNewEmp({ name: "", position: "", line_user_id: "" }); fetchEmployees(); }
  };
  const handleDeleteEmployee = async (id) => { if(confirm("ลบ?")) { await supabase.from("employees").delete().eq("id", id); fetchEmployees(); } };
  
  const handleNotify = async (api) => { if(confirm("ยืนยันส่ง?")) await fetch(api, { method: 'POST' }); };
  
  // ✅ อัปเดตฟังก์ชันเรียกกะ ให้รับ type (check_in / check_out)
  const handleRemindShift = async (shiftName, type) => {
     const actionText = type === 'check_out' ? 'ออกงาน' : 'เข้างาน';
     if(!confirm(`ต้องการเรียก "${shiftName}" ${actionText}?`)) return;
     
     await fetch('/api/remind-shift', { 
        method: 'POST',
        body: JSON.stringify({ shiftName, type }), // ส่ง type ไปด้วย
        headers: { 'Content-Type': 'application/json' }
     });
     alert("ส่งแจ้งเตือนเรียบร้อย!");
  };
  
  const handleNotifySchedule = async () => {
     if(!confirm("ประกาศตารางงาน?")) return;
     try { await fetch('/api/notify-schedule', { method: 'POST' }); alert("✅ เรียบร้อย!"); } catch(e) {}
  };

  const getShiftInfoForLog = (log) => {
      if (!log || !schedules[log.employee_id]) return null;
      const date = new Date(log.timestamp);
      const dayOfWeek = date.getDay(); 
      return schedules[log.employee_id][dayOfWeek]; 
  };

  const days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

  return (
    <div className="min-h-screen bg-gray-50 font-sans p-4 md:p-6">
      <div className="max-w-6xl mx-auto bg-white min-h-[90vh] rounded-2xl shadow-lg flex flex-col border border-gray-100">
        
        <div className="border-b px-6 py-4 flex flex-col md:flex-row justify-between items-center bg-white sticky top-0 z-20 shadow-sm">
            <h1 className="text-xl font-bold text-gray-800 mb-2 md:mb-0">In the haus HR 🏠</h1>
            <div className="flex bg-gray-100 p-1 rounded-lg shadow-inner overflow-x-auto">
                {['dashboard', 'history', 'roster', 'employees', 'settings'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)} className={`px-3 py-2 rounded-md text-sm font-medium transition whitespace-nowrap ${activeTab === t ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t === 'dashboard' ? '📊 ภาพรวม' : t === 'history' ? '👤 ประวัติ' : t === 'roster' ? '📅 ตารางงาน' : t === 'employees' ? '👥 พนักงาน' : '⚙️ กะงาน'}
                    </button>
                ))}
            </div>
        </div>

        <div className="p-6 flex-1 bg-white">
            
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    <div className="flex justify-between items-center bg-gray-50 p-3 rounded-lg border">
                        <div className="flex items-center gap-2">
                             <span className="text-sm font-bold text-gray-500">📅 เดือน:</span>
                             <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-transparent font-bold outline-none text-sm" />
                        </div>
                    </div>
                    
                    <div className="bg-white p-4 rounded-xl shadow-sm border">
                        <h3 className="text-xs font-bold text-gray-400 mb-3 uppercase">🔔 Control Panel</h3>
                        <div className="flex flex-wrap gap-3">
                            {/* ✅ วนลูปสร้างปุ่ม เข้า/ออก สำหรับทุกกะ */}
                            {shifts.map(s => (
                                <div key={s.id} className="flex flex-col gap-1 bg-gray-50 p-2 rounded border">
                                    <span className="text-xs font-bold text-center text-gray-500 mb-1">{s.name}</span>
                                    <div className="flex gap-1">
                                        <button onClick={() => handleRemindShift(s.name, 'check_in')} className="bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold text-xs hover:bg-blue-200">☀️ เข้า</button>
                                        <button onClick={() => handleRemindShift(s.name, 'check_out')} className="bg-gray-200 text-gray-700 px-2 py-1 rounded font-bold text-xs hover:bg-gray-300">🌙 ออก</button>
                                    </div>
                                </div>
                            ))}
                            
                            <div className="w-px bg-gray-200 mx-2"></div> {/* เส้นคั่น */}

                            <button onClick={() => handleNotify('/api/notify')} className="bg-green-50 text-green-700 px-3 py-2 rounded font-bold text-xs border border-green-200 h-fit self-center">✅ สรุปคนมา</button>
                            <button onClick={() => handleNotify('/api/notify-absence')} className="bg-red-50 text-red-700 px-3 py-2 rounded font-bold text-xs border border-red-200 h-fit self-center">⚠️ ตามคนขาด</button>
                        </div>
                    </div>

                    <div>
                        <h3 className="font-bold text-gray-700 mb-3 pl-3 border-l-4 border-blue-500">Log ล่าสุด</h3>
                        <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 text-gray-600 uppercase text-xs">
                                    <tr><th className="p-3">เวลา</th><th className="p-3">ชื่อ</th><th className="p-3">สถานะ</th><th className="p-3 text-blue-600">กะของวันนี้</th></tr>
                                </thead>
                                <tbody className="divide-y">
                                    {logs.slice(0, 20).map(log => {
                                        const schedule = getShiftInfoForLog(log);
                                        return (
                                            <tr key={log.id} className="hover:bg-gray-50">
                                                <td className="p-3 border-r font-mono text-gray-600">{format(parseISO(log.timestamp), "d MMM HH:mm", { locale: th })}</td>
                                                <td className="p-3 font-bold text-gray-700">{log.employees?.name}</td>
                                                <td className="p-3">
                                                    {log.action_type === 'check_in' ? <span className="bg-green-100 text-green-700 px-2 py-1 rounded text-xs font-bold">เข้างาน 🟢</span> : <span className="bg-red-100 text-red-700 px-2 py-1 rounded text-xs font-bold">ออกงาน 🔴</span>}
                                                </td>
                                                <td className="p-3 text-xs">
                                                    {schedule?.shifts ? (
                                                        <div><div className="font-bold text-blue-600">{schedule.shifts.name}</div><div className="text-gray-400">{schedule.shifts.start_time} - {schedule.shifts.end_time}</div></div>
                                                    ) : <span className="text-gray-300">- ไม่ระบุ -</span>}
                                                </td>
                                            </tr>
                                        )
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {activeTab === 'history' && (
                <div className="space-y-4">
                    <div className="flex gap-4 bg-gray-50 p-4 rounded-xl border">
                        <select className="w-full p-2 rounded border" value={selectedEmpId} onChange={(e) => setSelectedEmpId(e.target.value)}>
                            <option value="ALL">-- เลือกพนักงาน --</option>
                            {employees.map(emp => <option key={emp.id} value={emp.id}>{emp.name}</option>)}
                        </select>
                    </div>
                    {selectedEmpId !== "ALL" && (
                         <div className="overflow-x-auto rounded-lg border">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-gray-100 text-xs uppercase"><tr><th className="p-3">วันที่</th><th className="p-3">เวลา</th><th className="p-3">Action</th></tr></thead>
                                <tbody className="divide-y">
                                    {individualLogs.map(log => (
                                        <tr key={log.id} className="bg-white">
                                            <td className="p-3">{format(parseISO(log.timestamp), "d MMM", { locale: th })}</td>
                                            <td className="p-3">{format(parseISO(log.timestamp), "HH:mm")}</td>
                                            <td className="p-3">{log.action_type === 'check_in' ? '🟢 เข้า' : '🔴 ออก'}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </div>
            )}

             {activeTab === 'roster' && (
                <div>
                     <div className="flex justify-between items-center mb-4 bg-yellow-50 p-4 rounded-lg border border-yellow-200">
                        <div className="text-yellow-800 text-sm"><b>📅 จัดตารางงาน:</b> เลือกกะให้พนักงานแต่ละวัน</div>
                        <button onClick={handleNotifySchedule} className="bg-blue-600 text-white px-4 py-2 rounded font-bold text-xs shadow">📢 ประกาศ Line</button>
                    </div>
                    <div className="overflow-x-auto rounded-lg border shadow-sm">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr><th className="p-3 text-left min-w-[150px] bg-gray-100 border-b">พนักงาน</th>{days.map(d => <th key={d} className="p-3 bg-gray-50 border text-center min-w-[100px]">{d}</th>)}</tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="p-3 border font-bold bg-white">{emp.name}</td>
                                        {days.map((d, dayIndex) => {
                                            const schedule = schedules[emp.id]?.[dayIndex]; 
                                            const currentShiftId = schedule?.is_off ? 'OFF' : (schedule?.shift_id || '');
                                            return (
                                                <td key={dayIndex} className="p-2 border text-center bg-white">
                                                    <select className="w-full p-1 rounded border text-xs outline-none" value={currentShiftId} onChange={(e) => handleUpdateSchedule(emp.id, dayIndex, e.target.value === 'OFF' ? null : e.target.value, e.target.value === 'OFF')}>
                                                        <option value="" disabled>--</option>
                                                        {shifts.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                                                        <option value="OFF" className="text-red-500">❌</option>
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
            
            {activeTab === 'employees' && (
                <div className="grid md:grid-cols-3 gap-8">
                    <div className="bg-white p-6 rounded-xl border h-fit">
                        <h3 className="font-bold mb-4">➕ เพิ่มพนักงาน</h3>
                        <form onSubmit={handleAddEmployee} className="flex flex-col gap-4">
                            <input required placeholder="ชื่อ" className="border p-2 rounded" value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                            <input placeholder="ตำแหน่ง" className="border p-2 rounded" value={newEmp.position} onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
                            <input required placeholder="Line User ID" className="border p-2 rounded text-xs" value={newEmp.line_user_id} onChange={e => setNewEmp({...newEmp, line_user_id: e.target.value})} />
                            <button className="bg-blue-600 text-white py-2 rounded font-bold">บันทึก</button>
                        </form>
                    </div>
                    <div className="md:col-span-2 bg-white rounded-xl border">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 uppercase text-xs"><tr><th className="p-3">ชื่อ</th><th className="p-3">ID</th><th className="p-3">จัดการ</th></tr></thead>
                            <tbody className="divide-y">{employees.map(e => <tr key={e.id}><td className="p-3">{e.name}</td><td className="p-3 text-xs font-mono">{e.line_user_id}</td><td className="p-3"><button onClick={()=>handleDeleteEmployee(e.id)} className="text-red-500">ลบ</button></td></tr>)}</tbody>
                        </table>
                    </div>
                </div>
            )}

             {activeTab === 'settings' && (
                <div className="max-w-xl mx-auto space-y-4">
                    <h3 className="font-bold">⚙️ ตั้งค่าเวลากะงาน</h3>
                    {shifts.map(s => (
                        <div key={s.id} className="flex items-center justify-between p-4 bg-white border rounded shadow-sm">
                            <div className="font-bold">{s.name}</div>
                            <div className="flex gap-2">
                                <input type="time" className="border p-1 rounded" value={s.start_time} onChange={e => handleUpdateShift(s.id, 'start_time', e.target.value)} />
                                <span>-</span>
                                <input type="time" className="border p-1 rounded" value={s.end_time} onChange={e => handleUpdateShift(s.id, 'end_time', e.target.value)} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
      </div>
    </div>
  );
}