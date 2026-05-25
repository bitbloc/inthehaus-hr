"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import NavigationDock from "../_components/NavigationDock";

export default function LeaveRequest() {
  const [profile, setProfile] = useState(null);
  const [formData, setFormData] = useState({
    startDate: "",
    endDate: "",
    type: "sick",
    reason: "",
    replacementId: ""
  });
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [employees, setEmployees] = useState([]); // List of active employees for replacement dropdown
  const [employee, setEmployee] = useState(null);

  const fetchEmployeeAndHistory = async (userId) => {
    // 1. Fetch employee data
    const { data: emp } = await supabase
      .from('employees')
      .select('*')
      .eq('line_user_id', userId)
      .single();

    if (emp) {
      setEmployee(emp);
      // 2. Fetch leave requests history, including replacement employee nickname and name
      const { data } = await supabase
        .from('leave_requests')
        .select('*, replacement_employee:employees!replacement_employee_id(name, nickname)')
        .eq('employee_id', emp.id)
        .order('leave_date', { ascending: false });
      setHistory(data || []);

      // 3. Fetch all other active employees for the replacement dropdown
      const { data: allEmps } = await supabase
        .from('employees')
        .select('id, name, nickname, position')
        .eq('is_active', true)
        .order('name');
      
      if (allEmps) {
        setEmployees(allEmps.filter(e => e.id !== emp.id));
      }
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
      } catch (e) {
        console.error(e);
      }
    };
    init();
  }, []);

  const getDatesInRange = (startStr, endStr) => {
    if (!startStr || !endStr) return [];
    const dates = [];
    let current = new Date(startStr);
    const end = new Date(endStr);
    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, '0');
      const d = String(current.getDate()).padStart(2, '0');
      dates.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const selectedDates = getDatesInRange(formData.startDate, formData.endDate);
  const totalDays = selectedDates.length;
  const isRangeTooLong = totalDays > 3;

  const checkConsecutiveDaysRange = (newDates) => {
    // Get existing active leave dates (approved or pending)
    const activeDates = history
      .filter(h => h.status !== 'rejected')
      .map(h => h.leave_date);
    
    // Merge new dates
    newDates.forEach(d => {
      if (!activeDates.includes(d)) {
        activeDates.push(d);
      }
    });
    
    const formatDateLocal = (dateObj) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, '0');
      const d = String(dateObj.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    };
    
    // For each date in the new range, count its consecutive chain
    for (const dateStr of newDates) {
      let consecutiveCount = 1;
      const parts = dateStr.split('-');
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      
      // Go backward
      let prevDate = new Date(year, month, day);
      while (true) {
        prevDate.setDate(prevDate.getDate() - 1);
        const formatted = formatDateLocal(prevDate);
        if (activeDates.includes(formatted)) {
          consecutiveCount++;
        } else {
          break;
        }
      }
      
      // Go forward
      let nextDate = new Date(year, month, day);
      while (true) {
        nextDate.setDate(nextDate.getDate() + 1);
        const formatted = formatDateLocal(nextDate);
        if (activeDates.includes(formatted)) {
          consecutiveCount++;
        } else {
          break;
        }
      }
      
      if (consecutiveCount > 3) {
        return consecutiveCount;
      }
    }
    return 0;
  };

  const handleStartDateChange = (e) => {
    const startVal = e.target.value;
    setFormData(prev => {
      const updated = { ...prev, startDate: startVal };
      // If end date is empty or before start date, set it to start date
      if (!prev.endDate || prev.endDate < startVal) {
        updated.endDate = startVal;
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employee) return alert("ไม่พบข้อมูลพนักงานในระบบ");
    if (!formData.startDate || !formData.endDate) return alert("กรุณาระบุวันที่ลาให้ครบถ้วน");
    if (isRangeTooLong) return alert("❌ ขอลาหยุดติดต่อกันได้ไม่เกิน 3 วันค่ะ");
    if (!formData.replacementId) return alert("กรุณาระบุคนที่จะมาทำงานแทนค่ะ");

    // ตรวจสอบความต่อเนื่องของวันลาสะสมรวมกับที่เคยลา
    const maxConsecutive = checkConsecutiveDaysRange(selectedDates);
    if (maxConsecutive > 3) {
      return alert(`❌ การลาติดต่อกันสะสมรวมแล้วเท่ากับ ${maxConsecutive} วัน ซึ่งเกิน 3 วัน\nกรุณาติดต่อผู้จัดการโดยตรงค่ะ`);
    }

    setLoading(true);

    // 1. บันทึกข้อมูลลง Database ทีละวัน (Batch insert)
    const replacementEmp = employees.find(e => String(e.id) === String(formData.replacementId));
    const replacementName = replacementEmp ? (replacementEmp.nickname || replacementEmp.name) : "-";

    const rowsToInsert = selectedDates.map(date => ({
      employee_id: employee.id,
      leave_date: date,
      leave_type: formData.type,
      reason: formData.reason,
      replacement_employee_id: parseInt(formData.replacementId, 10)
    }));

    const { data: insertedData, error } = await supabase
      .from('leave_requests')
      .insert(rowsToInsert)
      .select();

    if (!error && insertedData && insertedData.length > 0) {
      // 2. ส่งแจ้งเตือนเข้ากลุ่ม LINE
      try {
        let typeLabel = "ลาป่วย 😷";
        if (formData.type === 'business') typeLabel = "ลากิจ 💼";
        if (formData.type === 'vacation') typeLabel = "พักร้อน 🏖️";

        // สร้างข้อความสรุปช่วงเวลา
        const dateRangeStr = totalDays === 1 
          ? formData.startDate 
          : `${formData.startDate} ถึง ${formData.endDate}`;

        const leaveIds = insertedData.map(item => item.id).join(',');

        await fetch('/api/notify-realtime', {
          method: 'POST',
          body: JSON.stringify({
            name: employee.name,
            position: employee.position,
            action: 'leave_request',
            time: `${dateRangeStr} (${totalDays} วัน)`,
            locationStatus: typeLabel,
            statusDetail: `${formData.reason} | 👤 คนแทน: ${replacementName}`,
            leaveId: leaveIds // ส่งเป็นคอมมาลิสต์
          }),
          headers: { 'Content-Type': 'application/json' }
        });
      } catch (err) {
        console.error("Notification Error:", err);
      }

      alert("✅ ส่งใบลาเรียบร้อยแล้ว!");
      // ล้างฟอร์ม
      setFormData({ startDate: "", endDate: "", type: "sick", reason: "", replacementId: "" });
      fetchEmployeeAndHistory(profile.userId);
    } else {
      alert("เกิดข้อผิดพลาด: " + (error?.message || "ไม่สามารถบันทึกข้อมูลได้"));
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 pb-24 font-sans selection:bg-indigo-500/30">
      {/* Premium Header */}
      <div className="relative overflow-hidden bg-gradient-to-b from-indigo-950/80 via-slate-950/50 to-transparent px-6 pt-8 pb-6 border-b border-indigo-900/20">
        <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-12 left-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex items-center justify-between">
          <div>
            <span className="text-[10px] tracking-widest uppercase font-extrabold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">In The Haus</span>
            <h1 className="text-2xl font-black text-white tracking-tight mt-2.5">📝 ยื่นขอลาหยุด</h1>
            <p className="text-xs text-slate-400 mt-1 font-medium">ส่งใบขออนุมัติพร้อมระบุผู้ปฏิบัติหน้าที่แทน</p>
          </div>
          {profile?.pictureUrl && (
            <img src={profile.pictureUrl} alt="profile" className="w-12 h-12 rounded-2xl border-2 border-indigo-500/30 shadow-lg object-cover" />
          )}
        </div>
      </div>

      <div className="p-6 max-w-md mx-auto space-y-6">
        {/* Form Card */}
        <form onSubmit={handleSubmit} className="bg-slate-950/40 backdrop-blur-md border border-indigo-900/30 p-6 rounded-[2rem] shadow-2xl shadow-indigo-950/20 space-y-5">
          {/* Date Picker (Range) */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 ml-1">เริ่มวันที่</label>
              <input 
                type="date" 
                required 
                className="w-full p-3.5 border border-indigo-900/30 rounded-2xl bg-slate-900/80 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition font-medium text-sm"
                value={formData.startDate} 
                onChange={handleStartDateChange} 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 ml-1">ถึงวันที่</label>
              <input 
                type="date" 
                required 
                min={formData.startDate}
                className="w-full p-3.5 border border-indigo-900/30 rounded-2xl bg-slate-900/80 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition font-medium text-sm"
                value={formData.endDate} 
                onChange={e => setFormData({ ...formData, endDate: e.target.value })} 
              />
            </div>
          </div>

          {/* Range & Consecutive validation Display */}
          {formData.startDate && formData.endDate && (
            <div className={`p-3.5 rounded-2xl border text-xs font-bold flex items-center justify-between transition-all ${
              isRangeTooLong 
                ? 'bg-rose-500/10 border-rose-500/30 text-rose-400' 
                : 'bg-indigo-500/10 border-indigo-500/20 text-indigo-300'
            }`}>
              <div className="flex items-center gap-2">
                <span className="text-base">{isRangeTooLong ? "❌" : "📅"}</span>
                <span>ระยะเวลาที่เลือก: {totalDays} วัน</span>
              </div>
              {isRangeTooLong && (
                <span className="font-extrabold text-[10px] uppercase bg-rose-500/20 px-2 py-0.5 rounded-md border border-rose-500/30">ยาวเกินกำหนด</span>
              )}
            </div>
          )}

          {/* Leave Type */}
          <div>
            <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 ml-1">ประเภทการลา</label>
            <select 
              className="w-full p-3.5 border border-indigo-900/30 rounded-2xl bg-slate-900/80 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition font-semibold text-sm cursor-pointer"
              value={formData.type} 
              onChange={e => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="sick">😷 ลาป่วย (Sick Leave)</option>
              <option value="business">💼 ลากิจ (Business Leave)</option>
              <option value="vacation">🏖️ พักร้อน (Vacation)</option>
            </select>
          </div>

          {/* Replacement Staff Selector */}
          <div>
            <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 ml-1">👤 พนักงานปฏิบัติหน้าที่แทน</label>
            <select 
              required
              className="w-full p-3.5 border border-indigo-900/30 rounded-2xl bg-slate-900/80 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition font-semibold text-sm cursor-pointer"
              value={formData.replacementId} 
              onChange={e => setFormData({ ...formData, replacementId: e.target.value })}
            >
              <option value="">-- เลือกผู้ปฏิบัติหน้าที่แทน --</option>
              {employees.map(emp => (
                <option key={emp.id} value={emp.id}>
                  {emp.name} {emp.nickname ? `(${emp.nickname})` : ""} - {emp.position || "ทั่วไป"}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-slate-500 mt-1.5 ml-1 font-medium">จำเป็นต้องระบุเพื่อนร่วมงานที่จะเข้าเวรแทนเพื่อการจัดการตารางงานที่ถูกต้อง</p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1.5 ml-1">เหตุผลการลา</label>
            <textarea 
              required 
              className="w-full p-3.5 border border-indigo-900/30 rounded-2xl bg-slate-900/80 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition font-medium text-sm placeholder:text-slate-650" 
              rows="3" 
              placeholder="เช่น ไม่สบายเป็นไข้หวัด, ทำธุระสำคัญที่ต่างจังหวัด..."
              value={formData.reason} 
              onChange={e => setFormData({ ...formData, reason: e.target.value })} 
            />
          </div>

          {/* Submit Button */}
          <button 
            type="submit"
            disabled={loading || isRangeTooLong} 
            className={`w-full py-4 rounded-2xl font-black text-sm transition-all shadow-lg active:scale-[0.98] ${
              loading || isRangeTooLong
                ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50 shadow-none'
                : 'bg-gradient-to-r from-indigo-500 to-indigo-650 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-indigo-500/20'
            }`}
          >
            {loading ? "กำลังส่งใบลา..." : "ส่งใบลาหยุด"}
          </button>
        </form>

        {/* History section */}
        <div className="space-y-4">
          <h3 className="font-extrabold text-slate-300 text-sm tracking-wide uppercase pl-1">ประวัติการลาล่าสุด</h3>
          
          <div className="space-y-3">
            {history.length === 0 && (
              <div className="bg-slate-950/20 border border-slate-800/40 p-8 rounded-2xl text-center">
                <p className="text-slate-500 text-xs font-semibold">ยังไม่มีประวัติการขอลาหยุด</p>
              </div>
            )}
            
            {history.map(h => (
              <div key={h.id} className="bg-slate-950/30 border border-indigo-900/10 p-4.5 rounded-2xl flex justify-between items-center shadow-md">
                <div className="space-y-1.5">
                  <div className="font-black text-sm text-white">{h.leave_date}</div>
                  <div className="text-xs text-slate-400 font-semibold space-y-1">
                    <div>
                      {h.leave_type === 'sick' ? '😷 ลาป่วย' : h.leave_type === 'business' ? '💼 ลากิจ' : '🏖️ พักร้อน'}
                      <span className="text-slate-600 mx-1.5">•</span>
                      <span className="text-slate-300 font-medium">"{h.reason}"</span>
                    </div>
                    {h.replacement_employee && (
                      <div className="text-[10px] text-indigo-400 flex items-center gap-1 font-bold">
                        <span>👤 คนแทน:</span>
                        <span className="bg-indigo-950/50 border border-indigo-900/30 px-1.5 py-0.5 rounded-md">
                          {h.replacement_employee.name} {h.replacement_employee.nickname ? `(${h.replacement_employee.nickname})` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
                
                <span className={`px-2.5 py-1.5 rounded-xl text-[10px] font-black tracking-wide uppercase border ${
                  h.status === 'approved' 
                    ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20' 
                    : h.status === 'rejected' 
                      ? 'bg-rose-500/15 text-rose-400 border-rose-500/20' 
                      : 'bg-amber-500/15 text-amber-400 border-amber-500/20'
                }`}>
                  {h.status === 'approved' ? 'อนุมัติ' : h.status === 'rejected' ? 'ปฏิเสธ' : 'รออนุมัติ'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <NavigationDock />
    </div>
  );
}