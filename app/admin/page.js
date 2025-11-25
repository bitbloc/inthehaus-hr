"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { th } from "date-fns/locale";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminDashboard() {
  const [activeTab, setActiveTab] = useState("dashboard"); // dashboard | employees | settings
  const [loading, setLoading] = useState(false);
  
  // Data States
  const [logs, setLogs] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM"));
  const [stats, setStats] = useState({ total: 0, late: 0, onTime: 0 });

  // Form States (สำหรับเพิ่มพนักงาน)
  const [newEmp, setNewEmp] = useState({ name: "", position: "", line_user_id: "", shift_id: "" });

  // Init Data
  useEffect(() => {
    fetchShifts();
    fetchEmployees();
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard") fetchLogs();
  }, [selectedMonth, activeTab]);

  // --- API Functions ---
  const fetchShifts = async () => {
    const { data } = await supabase.from("shifts").select("*").order("id");
    setShifts(data || []);
    // Set default shift for form
    if (data && data.length > 0) setNewEmp(prev => ({ ...prev, shift_id: data[0].id }));
  };

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*, shifts(name, start_time)").order("id");
    setEmployees(data || []);
  };

  const fetchLogs = async () => {
    setLoading(true);
    const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();

    // Join 3 ตาราง: Logs -> Employees -> Shifts
    const { data } = await supabase
      .from("attendance_logs")
      .select("*, employees(name, position, shifts(name, start_time))")
      .gte("timestamp", startDate)
      .lte("timestamp", endDate)
      .order("timestamp", { ascending: false });

    setLogs(data || []);
    calculateStats(data || []);
    setLoading(false);
  };

  // --- Logic คำนวณสาย (ตามกะของแต่ละคน) ---
  const checkIsLate = (logTimestamp, shiftStartTime) => {
    if (!shiftStartTime) return false; // ถ้าไม่มีกะ ถือว่าไม่สาย
    
    const logDate = new Date(logTimestamp);
    const [shiftHour, shiftMin] = shiftStartTime.split(':').map(Number);
    
    // สร้าง Date object ของเวลาเข้างานเพื่อเปรียบเทียบ
    const shiftDate = new Date(logDate);
    shiftDate.setHours(shiftHour, shiftMin, 0, 0);

    return logDate > shiftDate;
  };

  const calculateStats = (data) => {
    let lateCount = 0;
    data.forEach(log => {
      const shiftStart = log.employees?.shifts?.start_time;
      if (checkIsLate(log.timestamp, shiftStart)) lateCount++;
    });
    setStats({
      total: data.length,
      late: lateCount,
      onTime: data.length - lateCount
    });
  };

  // --- Actions ---
  const handleAddEmployee = async (e) => {
    e.preventDefault();
    const { error } = await supabase.from("employees").insert([newEmp]);
    if (error) alert("Error: " + error.message);
    else {
      alert("✅ เพิ่มพนักงานเรียบร้อย");
      setNewEmp({ name: "", position: "", line_user_id: "", shift_id: shifts[0].id });
      fetchEmployees();
    }
  };

  const handleDeleteEmployee = async (id) => {
    if(!confirm("ลบพนักงานคนนี้?")) return;
    await supabase.from("employees").delete().eq("id", id);
    fetchEmployees();
  };

  const handleUpdateShift = async (id, field, value) => {
    const { error } = await supabase.from("shifts").update({ [field]: value }).eq("id", id);
    if (!error) fetchShifts();
  };

  const handleSendReport = async () => {
    if(!confirm("ส่งรายงานเข้า LINE?")) return;
    await fetch('/api/notify', { method: 'POST' });
    alert("ส่งคำสั่งเรียบร้อย");
  };

  // --- UI Components ---
  const chartData = [
    { name: "ปกติ", value: stats.onTime, color: "#10B981" }, 
    { name: "สาย", value: stats.late, color: "#EF4444" },     
  ];

  return (
    <div className="min-h-screen bg-gray-50 font-sans">
      {/* Navbar */}
      <div className="bg-white shadow px-6 py-4 mb-6 flex justify-between items-center sticky top-0 z-10">
        <h1 className="text-xl font-bold text-gray-800">In the haus HR ☕️</h1>
        <div className="flex space-x-2">
            {['dashboard', 'employees', 'settings'].map(tab => (
                <button 
                    key={tab}
                    onClick={() => setActiveTab(tab)}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition ${activeTab === tab ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                >
                    {tab === 'dashboard' ? '📊 ภาพรวม' : tab === 'employees' ? '👥 พนักงาน' : '⚙️ ตั้งค่ากะ'}
                </button>
            ))}
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        
        {/* --- TAB 1: DASHBOARD --- */}
        {activeTab === 'dashboard' && (
          <>
            <div className="flex justify-between items-center mb-6">
               <h2 className="text-lg font-bold">สรุปการลงเวลา</h2>
               <div className="flex gap-2">
                 <button onClick={handleSendReport} className="bg-green-500 text-white px-3 py-2 rounded text-sm">📢 ส่ง LINE</button>
                 <input type="month" value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="border rounded px-2" />
               </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                <div className="bg-white p-6 rounded-xl shadow-sm border-l-4 border-blue-500">
                    <p className="text-gray-500">รวม (ครั้ง)</p>
                    <h2 className="text-4xl font-bold mt-2">{stats.total}</h2>
                    <div className="text-sm mt-2"><span className="text-green-600">ปกติ {stats.onTime}</span> | <span className="text-red-500">สาย {stats.late}</span></div>
                </div>
                <div className="bg-white p-4 rounded-xl shadow-sm md:col-span-2 flex justify-center h-40">
                     <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={chartData} innerRadius={40} outerRadius={60} paddingAngle={5} dataKey="value">
                                {chartData.map((entry, index) => <Cell key={`cell-${index}`} fill={entry.color} />)}
                            </Pie>
                            <Tooltip />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <table className="w-full text-left text-sm">
                    <thead className="bg-gray-100 text-gray-700">
                        <tr>
                            <th className="px-6 py-3">เวลา</th>
                            <th className="px-6 py-3">พนักงาน</th>
                            <th className="px-6 py-3">กะงาน</th>
                            <th className="px-6 py-3">สถานะ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y">
                        {logs.map(log => {
                            const shiftStart = log.employees?.shifts?.start_time;
                            const isLate = checkIsLate(log.timestamp, shiftStart);
                            return (
                                <tr key={log.id}>
                                    <td className="px-6 py-3">
                                        <div>{format(parseISO(log.timestamp), "d MMM", { locale: th })}</div>
                                        <div className="text-xs text-gray-400">{format(parseISO(log.timestamp), "HH:mm")} น.</div>
                                    </td>
                                    <td className="px-6 py-3">{log.employees?.name}</td>
                                    <td className="px-6 py-3">
                                        <span className="bg-blue-50 text-blue-600 px-2 py-1 rounded text-xs">
                                            {log.employees?.shifts?.name} ({shiftStart})
                                        </span>
                                    </td>
                                    <td className="px-6 py-3">
                                        {isLate 
                                            ? <span className="text-red-600 font-bold bg-red-50 px-2 py-1 rounded text-xs">มาสาย 🛑</span> 
                                            : <span className="text-green-600 font-bold bg-green-50 px-2 py-1 rounded text-xs">ปกติ ✅</span>
                                        }
                                    </td>
                                </tr>
                            )
                        })}
                    </tbody>
                </table>
            </div>
          </>
        )}

        {/* --- TAB 2: EMPLOYEES --- */}
        {activeTab === 'employees' && (
            <div className="grid md:grid-cols-3 gap-6">
                {/* Form เพิ่มพนักงาน */}
                <div className="bg-white p-6 rounded-xl shadow-sm h-fit">
                    <h3 className="font-bold mb-4">เพิ่มพนักงานใหม่</h3>
                    <form onSubmit={handleAddEmployee} className="flex flex-col gap-3">
                        <input required placeholder="ชื่อ-นามสกุล" className="border p-2 rounded" 
                            value={newEmp.name} onChange={e => setNewEmp({...newEmp, name: e.target.value})} />
                        <input placeholder="ตำแหน่ง (เช่น Barista)" className="border p-2 rounded" 
                            value={newEmp.position} onChange={e => setNewEmp({...newEmp, position: e.target.value})} />
                        <input required placeholder="Line User ID (U...)" className="border p-2 rounded text-xs" 
                            value={newEmp.line_user_id} onChange={e => setNewEmp({...newEmp, line_user_id: e.target.value})} />
                        
                        <label className="text-xs text-gray-500">เลือกกะการทำงาน:</label>
                        <select className="border p-2 rounded" 
                            value={newEmp.shift_id} onChange={e => setNewEmp({...newEmp, shift_id: e.target.value})}>
                            {shifts.map(s => <option key={s.id} value={s.id}>{s.name} ({s.start_time}-{s.end_time})</option>)}
                        </select>

                        <button type="submit" className="bg-blue-600 text-white py-2 rounded hover:bg-blue-700">บันทึก</button>
                    </form>
                    <p className="text-xs text-gray-400 mt-4">*Line User ID ให้พนักงานดูจากหน้าจอมือถือตอนกดเข้า LIFF ครั้งแรก</p>
                </div>

                {/* List พนักงาน */}
                <div className="md:col-span-2 bg-white rounded-xl shadow-sm overflow-hidden">
                    <table className="w-full text-left text-sm">
                        <thead className="bg-gray-100">
                            <tr>
                                <th className="px-6 py-3">ชื่อ</th>
                                <th className="px-6 py-3">กะปัจจุบัน</th>
                                <th className="px-6 py-3">จัดการ</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y">
                            {employees.map(emp => (
                                <tr key={emp.id}>
                                    <td className="px-6 py-3">
                                        <div className="font-bold">{emp.name}</div>
                                        <div className="text-xs text-gray-500">{emp.position}</div>
                                    </td>
                                    <td className="px-6 py-3">
                                        {emp.shifts?.name} <span className="text-gray-400 text-xs">({emp.shifts?.start_time})</span>
                                    </td>
                                    <td className="px-6 py-3">
                                        <button onClick={() => handleDeleteEmployee(emp.id)} className="text-red-500 hover:text-red-700 text-xs border border-red-200 px-2 py-1 rounded">ลบออก</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {/* --- TAB 3: SETTINGS (SHIFTS) --- */}
        {activeTab === 'settings' && (
            <div className="bg-white p-6 rounded-xl shadow-sm max-w-2xl mx-auto">
                <h3 className="font-bold mb-6 text-lg border-b pb-2">ตั้งค่าเวลาเข้างาน (Shifts)</h3>
                <div className="space-y-6">
                    {shifts.map(shift => (
                        <div key={shift.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                            <div className="font-bold text-gray-700 w-1/3">{shift.name}</div>
                            <div className="flex gap-4 items-center">
                                <div>
                                    <label className="text-xs text-gray-500 block">เวลาเข้า</label>
                                    <input type="time" className="border p-2 rounded" 
                                        value={shift.start_time} 
                                        onChange={(e) => handleUpdateShift(shift.id, 'start_time', e.target.value)} 
                                    />
                                </div>
                                <div className="text-gray-400">-</div>
                                <div>
                                    <label className="text-xs text-gray-500 block">เวลาออก</label>
                                    <input type="time" className="border p-2 rounded" 
                                        value={shift.end_time} 
                                        onChange={(e) => handleUpdateShift(shift.id, 'end_time', e.target.value)} 
                                    />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
                <p className="mt-6 text-sm text-green-600 bg-green-50 p-3 rounded">
                    💡 <b>Tip:</b> ระบบจะบันทึกอัตโนมัติเมื่อคุณเปลี่ยนเวลา และจะมีผลทันทีกับการคำนวณ "มาสาย" ของพนักงานในกะนั้นๆ
                </p>
            </div>
        )}

      </div>
    </div>
  );
}