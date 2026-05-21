"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import NavigationDock from "../_components/NavigationDock";

export default function LeaveRequest() {
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({ date: "", type: "sick", reason: "" });
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [employee, setEmployee] = useState(null);

  const fetchEmployeeAndHistory = async (userId) => {
    // 1. ดึงข้อมูลพนักงาน
    const { data: emp } = await supabase.from('employees').select('*').eq('line_user_id', userId).single();
    if (emp) {
      setEmployee(emp);
      // 2. ดึงประวัติการลา
      const { data } = await supabase.from('leave_requests').select('*').eq('employee_id', emp.id).order('leave_date', { ascending: false });
      setHistory(data || []);
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
        } else {
          const p = await liff.getProfile();
          setProfile(p);
          fetchEmployeeAndHistory(p.userId);
        }
      } catch (e) { console.error(e); }
    };
    init();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employee) return alert("ไม่พบข้อมูลพนักงานในระบบ");

    setLoading(true);

    // 1. บันทึกลง Database
    const { data: insertedData, error } = await supabase.from('leave_requests').insert({
      employee_id: employee.id,
      leave_date: formData.date,
      leave_type: formData.type,
      reason: formData.reason
    }).select().single();

    if (!error) {
      // 2. ✅ ส่งแจ้งเตือนเข้ากลุ่ม LINE (สำคัญ!)
      try {
        // เตรียมข้อความประเภทการลา
        let typeLabel = "ลาป่วย 😷";
        if (formData.type === 'business') typeLabel = "ลากิจ 💼";
        if (formData.type === 'vacation') typeLabel = "พักร้อน 🏖️";

        await fetch('/api/notify-realtime', {
          method: 'POST',
          body: JSON.stringify({
            name: employee.name,
            position: employee.position, // ส่งตำแหน่งไปด้วย
            action: 'leave_request',     // บอกว่าเป็นใบลา
            time: formData.date,         // ใช้วันที่แทนเวลา
            locationStatus: typeLabel,   // เอาประเภทไปใส่ช่องพิกัด
            statusDetail: formData.reason, // เอาเหตุผลไปใส่ช่องสถานะ
            leaveId: insertedData?.id     // ส่ง ID การลาไปด้วยเพื่ออนุมัติ
          }),
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error("Notification Error:", err);
      }

      alert("✅ ส่งใบลาเรียบร้อยแล้ว!");
      setFormData({ date: "", type: "sick", reason: "" }); // ล้างฟอร์ม
      fetchEmployeeAndHistory(profile.userId); // โหลดประวัติใหม่
    } else {
      alert("เกิดข้อผิดพลาด: " + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <h1 className="text-2xl font-bold text-slate-800 mb-2">📝 ขอลาหยุด</h1>
      <p className="text-sm text-slate-500 mb-6">ส่งใบลาให้ผู้บริหารอนุมัติ</p>

      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm space-y-4 border border-slate-200">
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">วันที่ต้องการลา</label>
          <input type="date" required className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-slate-200"
            value={formData.date} onChange={e => setFormData({ ...formData, date: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">ประเภท</label>
          <select className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-slate-200"
            value={formData.type} onChange={e => setFormData({ ...formData, type: e.target.value })}>
            <option value="sick">😷 ลาป่วย (Sick Leave)</option>
            <option value="business">💼 ลากิจ (Business Leave)</option>
            <option value="vacation">🏖️ พักร้อน (Vacation)</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-bold text-slate-400 uppercase mb-1">เหตุผล</label>
          <textarea required className="w-full p-3 border rounded-xl bg-slate-50 outline-none focus:ring-2 focus:ring-slate-200" rows="2" placeholder="เช่น ไม่สบาย, ไปทำธุระ..."
            value={formData.reason} onChange={e => setFormData({ ...formData, reason: e.target.value })} />
        </div>
        <button disabled={loading} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700 transition shadow-lg">
          {loading ? "กำลังส่งข้อมูล..." : "ส่งใบลา"}
        </button>
      </form>

      <div className="mt-8">
        <h3 className="font-bold text-slate-700 mb-4 text-lg">ประวัติการลาล่าสุด</h3>
        <div className="space-y-3">
          {history.length === 0 && <p className="text-slate-400 text-center text-sm">ยังไม่มีประวัติการลา</p>}
          {history.map(h => (
            <div key={h.id} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center border border-slate-100">
              <div>
                <div className="font-bold text-slate-700">{h.leave_date}</div>
                <div className="text-xs text-slate-400 mt-1">
                  {h.leave_type === 'sick' ? '😷 ลาป่วย' : h.leave_type === 'business' ? '💼 ลากิจ' : '🏖️ พักร้อน'}
                  <span className="mx-1">•</span>
                  {h.reason}
                </div>
              </div>
              <span className={`px-3 py-1 rounded-lg text-xs font-bold ${h.status === 'approved' ? 'bg-green-100 text-green-700' :
                  h.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                }`}>
                {h.status.toUpperCase()}
              </span>
            </div>
          ))}
        </div>
      </div>
      <div className="h-24"></div> {/* Spacer for Dock */}
      <NavigationDock />
    </div>
  );
}