"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";

export default function LeaveRequest() {
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({ date: "", type: "sick", reason: "" });
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    const init = async () => {
      await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
      if (!liff.isLoggedIn()) liff.login();
      else {
        const p = await liff.getProfile();
        setProfile(p);
        fetchHistory(p.userId);
      }
    };
    init();
  }, []);

  const fetchHistory = async (userId) => {
    const { data: emp } = await supabase.from('employees').select('id').eq('line_user_id', userId).single();
    if(emp) {
        const { data } = await supabase.from('leave_requests').select('*').eq('employee_id', emp.id).order('leave_date', { ascending: false });
        setHistory(data || []);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if(!profile) return;
    setLoading(true);

    const { data: emp } = await supabase.from('employees').select('id, name').eq('line_user_id', profile.userId).single();
    
    if(!emp) { alert("ไม่พบข้อมูลพนักงาน"); setLoading(false); return; }

    const { error } = await supabase.from('leave_requests').insert({
        employee_id: emp.id,
        leave_date: formData.date,
        leave_type: formData.type,
        reason: formData.reason
    });

    if(!error) {
        alert("ส่งคำขอเรียบร้อย ✅ รอการอนุมัติ");
        // แจ้งเตือนเข้ากลุ่ม LINE (ใช้ API เดิม แต่ประยุกต์)
        await fetch('/api/notify-realtime', {
            method: 'POST',
            body: JSON.stringify({ 
                name: emp.name, 
                action: 'leave_request', // action พิเศษ
                time: formData.date, 
                locationStatus: formData.type === 'sick' ? 'ลาป่วย 😷' : 'ลากิจ 💼',
                statusDetail: formData.reason,
                position: 'Request'
            }),
            headers: {'Content-Type': 'application/json'}
        });
        
        setFormData({ date: "", type: "sick", reason: "" });
        fetchHistory(profile.userId);
    } else {
        alert("Error: " + error.message);
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 p-6 font-sans">
      <h1 className="text-2xl font-bold text-slate-800 mb-6">📝 ขอลาหยุด</h1>
      
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-2xl shadow-sm space-y-4">
        <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">วันที่ต้องการลา</label>
            <input type="date" required className="w-full p-3 border rounded-xl bg-slate-50" 
                value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} />
        </div>
        <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">ประเภท</label>
            <select className="w-full p-3 border rounded-xl bg-slate-50"
                value={formData.type} onChange={e => setFormData({...formData, type: e.target.value})}>
                <option value="sick">😷 ลาป่วย</option>
                <option value="business">💼 ลากิจ</option>
                <option value="vacation">🏖️ พักร้อน</option>
            </select>
        </div>
        <div>
            <label className="block text-xs font-bold text-slate-400 uppercase mb-1">เหตุผล</label>
            <textarea required className="w-full p-3 border rounded-xl bg-slate-50" rows="2"
                value={formData.reason} onChange={e => setFormData({...formData, reason: e.target.value})} />
        </div>
        <button disabled={loading} className="w-full bg-slate-800 text-white py-3 rounded-xl font-bold hover:bg-slate-700">
            {loading ? "กำลังส่ง..." : "ส่งคำขอ"}
        </button>
      </form>

      <div className="mt-8">
        <h3 className="font-bold text-slate-700 mb-4">ประวัติการลา</h3>
        <div className="space-y-3">
            {history.map(h => (
                <div key={h.id} className="bg-white p-4 rounded-xl shadow-sm flex justify-between items-center">
                    <div>
                        <div className="font-bold text-slate-700">{h.leave_date}</div>
                        <div className="text-xs text-slate-400">{h.leave_type === 'sick' ? 'ลาป่วย' : 'ลากิจ'} - {h.reason}</div>
                    </div>
                    <span className={`px-2 py-1 rounded text-xs font-bold ${
                        h.status === 'approved' ? 'bg-green-100 text-green-700' : 
                        h.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'
                    }`}>
                        {h.status === 'approved' ? 'อนุมัติ' : h.status === 'rejected' ? 'ไม่อนุมัติ' : 'รอตรวจสอบ'}
                    </span>
                </div>
            ))}
        </div>
      </div>
    </div>
  );
}