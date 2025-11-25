"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { th } from "date-fns/locale";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | roster | employees | settings
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [schedules, setSchedules] = useState({}); // เก็บตารางงาน { empId: [day0, day1...] }
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [stats, setStats] = useState({ total: 0, late: 0, onTime: 0, absent: 0 });

  // Init
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
    // ดึงตารางงานทั้งหมด
    const { data } = await supabase.from("employee_schedules").select("*");
    const scheduleMap = {};
    // จัดกลุ่มตาม Employee ID
    data?.forEach(s => {
        if(!scheduleMap[s.employee_id]) scheduleMap[s.employee_id] = {};
        scheduleMap[s.employee_id][s.day_of_week] = s;
    });
    setSchedules(scheduleMap);
  };

  const fetchLogs = async () => {
    const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    
    // ดึง Log พร้อมข้อมูลกะที่ "ควรจะเป็น" ในวันนั้นๆ (ซับซ้อนนิดนึงแต่แม่นยำ)
    // เบื้องต้นดึง Log ธรรมดาก่อน แล้วค่อยไป Map กับ Schedule ใน Client side
    const { data } = await supabase
      .from("attendance_logs")
      .select("*, employees(name)")
      .gte("timestamp", startDate)
      .lte("timestamp", endDate)
      .order("timestamp", { ascending: false });

    setLogs(data || []);
    // Note: การคำนวณ Stats แบบละเอียดต้องใช้ Logic เยอะ ในที่นี้ขอโชว์ยอดคร่าวๆ ก่อน
    setStats({ total: data?.length || 0, late: 0, onTime: 0 }); 
  };

  // --- Actions ---
  const handleUpdateSchedule = async (empId, day, shiftId, isOff) => {
    // Upsert (มีให้อัปเดต ไม่มีให้สร้างใหม่)
    const payload = {
        employee_id: empId,
        day_of_week: day,
        shift_id: isOff ? null : shiftId,
        is_off: isOff
    };

    // ลบอันเก่าออกก่อน (วิธีบ้านๆ แต่ชัวร์) หรือใช้ upsert ถ้าตั้ง unique key ไว้
    const { error } = await supabase.from("employee_schedules").upsert(payload, { onConflict: 'employee_id, day_of_week' });
    
    if (error) alert("Error: " + error.message);
    else fetchSchedules(); // Refresh UI
  };

  const handleNotifyCheckIn = async () => {
     if(!confirm("ส่งรายงานคนเข้างาน (Check-in) เข้า LINE?")) return;
     await fetch('/api/notify', { method: 'POST' }); // API เดิม
     alert("ส่งเรียบร้อย");
  };

  const handleNotifyAbsence = async () => {
     if(!confirm("ส่งแจ้งเตือนคน 'ขาดงาน' เข้า LINE?")) return;
     const res = await fetch('/api/notify-absence', { method: 'POST' }); // API ใหม่
     const data = await res.json();
     alert(data.message || "ส่งเรียบร้อย");
  };

  // --- Helpers ---
  const days = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];

  return (
    <div className="min-h-screen bg-gray-50 font-sans p-6">
      <div className="max-w-6xl mx-auto bg-white min-h-[80vh] rounded-2xl shadow-sm overflow-hidden flex flex-col">
        
        {/* Navbar */}
        <div className="border-b px-6 py-4 flex flex-col md:flex-row justify-between items-center bg-white sticky top-0 z-10">
            <h1 className="text-xl font-bold text-gray-800 mb-2 md:mb-0">In the haus HR 🏠</h1>
            <div className="flex bg-gray-100 p-1 rounded-lg">
                {['dashboard', 'roster', 'employees'].map(t => (
                    <button key={t} onClick={() => setActiveTab(t)}
                        className={`px-4 py-2 rounded-md text-sm font-medium transition ${activeTab === t ? 'bg-white shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
                        {t === 'dashboard' ? 'ภาพรวม' : t === 'roster' ? '📅 จัดตารางงาน' : 'พนักงาน'}
                    </button>
                ))}
            </div>
        </div>

        {/* Content */}
        <div className="p-6 flex-1">
            
            {/* --- TAB: DASHBOARD --- */}
            {activeTab === 'dashboard' && (
                <div className="space-y-6">
                    <div className="flex gap-3 justify-end">
                        <button onClick={handleNotifyCheckIn} className="bg-green-100 text-green-700 px-4 py-2 rounded-lg font-bold hover:bg-green-200">✅ สรุปคนเข้างาน</button>
                        <button onClick={handleNotifyAbsence} className="bg-red-100 text-red-700 px-4 py-2 rounded-lg font-bold hover:bg-red-200">⚠️ ตามคนสาย/ขาด</button>
                    </div>

                    <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 text-center">
                        <h2 className="text-gray-600 mb-2">เข้างานเดือนนี้ (ครั้ง)</h2>
                        <div className="text-5xl font-bold text-blue-600">{stats.total}</div>
                    </div>

                    <h3 className="font-bold text-gray-700">ประวัติการลงเวลาล่าสุด</h3>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-500">
                                <tr>
                                    <th className="p-3">เวลา</th>
                                    <th className="p-3">ชื่อ</th>
                                    <th className="p-3">ประเภท</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y">
                                {logs.map(log => (
                                    <tr key={log.id}>
                                        <td className="p-3">{format(parseISO(log.timestamp), "d MMM HH:mm", { locale: th })}</td>
                                        <td className="p-3 font-medium">{log.employees?.name}</td>
                                        <td className="p-3">{log.action_type === 'check_in' ? '🟢 เข้างาน' : '🔴 ออกงาน'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* --- TAB: ROSTER (จัดตารางงาน) --- */}
            {activeTab === 'roster' && (
                <div>
                    <div className="mb-4 bg-yellow-50 p-4 rounded-lg text-yellow-800 text-sm border border-yellow-200">
                        💡 <b>วิธีใช้:</b> เลือกกะให้พนักงานแต่ละคนในแต่ละวัน ระบบจะบันทึกให้อัตโนมัติทันทีที่เลือก
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm border-collapse">
                            <thead>
                                <tr>
                                    <th className="p-3 text-left min-w-[150px] bg-gray-50 border">พนักงาน</th>
                                    {days.map(d => <th key={d} className="p-3 bg-gray-50 border text-center min-w-[100px]">{d}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-gray-50">
                                        <td className="p-3 border font-bold text-gray-700">{emp.name}</td>
                                        {days.map((d, dayIndex) => {
                                            const schedule = schedules[emp.id]?.[dayIndex]; // ข้อมูลตารางของวันนี้
                                            const currentShiftId = schedule?.is_off ? 'OFF' : (schedule?.shift_id || '');
                                            
                                            return (
                                                <td key={dayIndex} className="p-2 border text-center">
                                                    <select 
                                                        className={`w-full p-1 rounded border text-xs font-bold ${currentShiftId === 'OFF' ? 'bg-gray-100 text-gray-400' : 'bg-white text-blue-600'}`}
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

            {/* --- TAB: EMPLOYEES (เพิ่ม/ลบ คนเหมือนเดิม) --- */}
            {activeTab === 'employees' && (
                 <div className="text-center text-gray-500 py-10">
                    (ส่วนจัดการพนักงาน - ใช้โค้ดเดิมได้เลย หรือให้ผมเติมให้บอกได้ครับ เพื่อความกระชับขอละไว้)
                    <br/> *สามารถใช้หน้าเดิมจัดการเพิ่มชื่อพนักงานได้ครับ*
                 </div>
            )}

        </div>
      </div>
    </div>
  );
}