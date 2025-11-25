"use client";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { format, parseISO, startOfMonth, endOfMonth } from "date-fns";
import { th } from "date-fns/locale";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from "recharts";

export default function AdminDashboard() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(format(new Date(), "yyyy-MM")); // ค่าเริ่มต้น: เดือนปัจจุบัน
  const [stats, setStats] = useState({ total: 0, late: 0, onTime: 0 });

  // ดึงข้อมูลเมื่อเลือกเดือนเปลี่ยน
  useEffect(() => {
    fetchData();
  }, [selectedMonth]);

  const fetchData = async () => {
    setLoading(true);
// เพิ่มฟังก์ชันนี้
  const handleSendReport = async () => {
    const confirm = window.confirm("ต้องการส่งรายงานสรุปเข้า LINE เดี๋ยวนี้เลยไหม?");
    if (!confirm) return;

    try {
        const res = await fetch('/api/notify', { method: 'POST' });
        if (res.ok) {
            alert("✅ ส่งรายงานเรียบร้อยแล้ว!");
        } else {
            alert("❌ ส่งไม่ผ่าน มีบางอย่างผิดพลาด");
        }
    } catch (e) {
        alert("Error: " + e.message);
    }
  };

  // ... useEffect & functions

    // คำนวณวันเริ่มต้นและสิ้นสุดของเดือนที่เลือก
    const startDate = startOfMonth(parseISO(selectedMonth + "-01")).toISOString();
    const endDate = endOfMonth(parseISO(selectedMonth + "-01")).toISOString();

    // ดึงข้อมูลจาก Supabase (Join ตาราง employees)
    const { data, error } = await supabase
      .from("attendance_logs")
      .select("*, employees(name, position)")
      .gte("timestamp", startDate)
      .lte("timestamp", endDate)
      .order("timestamp", { ascending: false });

    if (error) {
      console.error("Error:", error);
    } else {
      setLogs(data || []);
      calculateStats(data || []);
    }
    setLoading(false);
  };

  // คำนวณสถิติเพื่อทำกราฟ
  const calculateStats = (data) => {
    let lateCount = 0;
    data.forEach(log => {
        // สมมติว่าเข้างาน 08:00 (ถ้าจะแก้เวลาเข้างาน แก้เลข 8 ตรงนี้ครับ)
        const logTime = new Date(log.timestamp).getHours() * 60 + new Date(log.timestamp).getMinutes();
        const checkTime = 8 * 60; // 08:00 น.
        if (logTime > checkTime) lateCount++;
    });

    setStats({
        total: data.length,
        late: lateCount,
        onTime: data.length - lateCount
    });
  };

  // ข้อมูลสำหรับกราฟวงกลม
  const chartData = [
    { name: "เข้างานปกติ", value: stats.onTime, color: "#10B981" }, // สีเขียว
    { name: "มาสาย", value: stats.late, color: "#EF4444" },     // สีแดง
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <div className="max-w-5xl mx-auto">
        
        {/* Header Section */}
        <div className="flex flex-col md:flex-row justify-between items-center mb-8 bg-white p-6 rounded-2xl shadow-sm">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">In the haus Dashboard ☕️</h1>
            <p className="text-gray-500 text-sm">ภาพรวมการลงเวลาพนักงาน</p>
          </div>
          <div className="mt-4 md:mt-0 flex gap-2"> {/* เพิ่ม flex gap-2 ตรงนี้ */}
            
            {/* ปุ่มใหม่ ใส่ตรงนี้! */}
            <button 
                onClick={handleSendReport}
                className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-lg text-sm font-bold shadow transition"
            >
                📢 ส่งสรุปเข้า LINE
            </button>

            <div className="flex items-center"> {/* ห่อ input เดิมไว้ */}
                <label className="mr-2 text-gray-600 text-sm font-medium">เลือกเดือน:</label>
                <input 
                    type="month" 
                    value={selectedMonth}
                    onChange={(e) => setSelectedMonth(e.target.value)}
                    className="border border-gray-300 rounded-lg px-4 py-2 text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
            </div>
          </div>
        </div>

        {/* Stats Cards & Chart */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Card 1: สรุปตัวเลข */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border-l-4 border-blue-500 flex flex-col justify-center">
                <p className="text-gray-500">ลงเวลาทั้งหมด (ครั้ง)</p>
                <h2 className="text-4xl font-bold text-gray-800 mt-2">{stats.total}</h2>
                <div className="mt-4 flex gap-4 text-sm">
                    <span className="text-green-600">ปกติ: <b>{stats.onTime}</b></span>
                    <span className="text-red-500">สาย: <b>{stats.late}</b></span>
                </div>
            </div>

            {/* Card 2: กราฟวงกลม */}
            <div className="bg-white p-4 rounded-2xl shadow-sm md:col-span-2 flex items-center justify-center">
                <ResponsiveContainer width="100%" height={200}>
                    <PieChart>
                        <Pie 
                            data={chartData} 
                            innerRadius={60} 
                            outerRadius={80} 
                            paddingAngle={5} 
                            dataKey="value"
                        >
                            {chartData.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.color} />
                            ))}
                        </Pie>
                        <Tooltip />
                    </PieChart>
                </ResponsiveContainer>
                <div className="ml-4 text-sm">
                    {chartData.map((item) => (
                        <div key={item.name} className="flex items-center mb-2">
                            <div className="w-3 h-3 rounded-full mr-2" style={{backgroundColor: item.color}}></div>
                            <span>{item.name} ({item.value})</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>

        {/* Table Section */}
        <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-gray-100">
                <h3 className="font-bold text-gray-800">ประวัติการลงเวลา (History)</h3>
            </div>
            <div className="overflow-x-auto">
                <table className="w-full text-left text-sm text-gray-600">
                    <thead className="bg-gray-50 text-gray-700 font-semibold uppercase tracking-wider">
                        <tr>
                            <th className="px-6 py-4">วันที่ & เวลา</th>
                            <th className="px-6 py-4">พนักงาน</th>
                            <th className="px-6 py-4">ตำแหน่ง</th>
                            <th className="px-6 py-4">สถานะ</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                        {loading ? (
                            <tr><td colSpan="4" className="text-center py-8">กำลังโหลดข้อมูล...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan="4" className="text-center py-8 text-gray-400">ไม่พบข้อมูลในเดือนนี้</td></tr>
                        ) : (
                            logs.map((log) => {
                                const logDate = parseISO(log.timestamp);
                                const isLate = logDate.getHours() * 60 + logDate.getMinutes() > 8 * 60; // เช็คสายอีกรอบตอน render

                                return (
                                <tr key={log.id} className="hover:bg-gray-50 transition">
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{format(logDate, "dd MMM yyyy", { locale: th })}</div>
                                        <div className="text-xs text-gray-400">{format(logDate, "HH:mm:ss")} น.</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center">
                                            <div className="h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 font-bold mr-3">
                                                {log.employees?.name?.charAt(0) || "?"}
                                            </div>
                                            {log.employees?.name || "Unknown"}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">{log.employees?.position || "-"}</td>
                                    <td className="px-6 py-4">
                                        {isLate ? (
                                            <span className="bg-red-100 text-red-600 py-1 px-3 rounded-full text-xs font-semibold">มาสาย 🛑</span>
                                        ) : (
                                            <span className="bg-green-100 text-green-600 py-1 px-3 rounded-full text-xs font-semibold">ปกติ ✅</span>
                                        )}
                                    </td>
                                </tr>
                                )
                            })
                        )}
                    </tbody>
                </table>
            </div>
        </div>

      </div>
    </div>
  );
}