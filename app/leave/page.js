/* Hallmark · route: custom (bespoke) · structure: utilitarian leave console
 * paper: oklch(96% 0.006 80) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass
 */
"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
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
  const [employees, setEmployees] = useState([]);
  const [employee, setEmployee] = useState(null);
  const [toast, setToast] = useState(null); // { type: 'success' | 'error', text: '' }

  const showToast = (text, type = "success") => {
    setToast({ text, type });
    setTimeout(() => setToast(null), 5000);
  };

  const fetchEmployeeAndHistory = async (userId, userProfile = null) => {
    const { data: emp } = await supabase
      .from("employees")
      .select("*")
      .or(`line_user_id.eq.${userId},line_bot_id.eq.${userId}`)
      .maybeSingle();

    if (emp) {
      // Auto-sync / refresh LINE photo_url if user has a newer picture or stale URL
      const activePictureUrl = userProfile?.pictureUrl || profile?.pictureUrl;
      if (activePictureUrl && activePictureUrl !== emp.photo_url) {
        emp.photo_url = activePictureUrl;
        supabase.from("employees").update({ photo_url: activePictureUrl }).eq("id", emp.id).then();
      }

      setEmployee(emp);
      const { data } = await supabase
        .from("leave_requests")
        .select("*, replacement_employee:employees!replacement_employee_id(name, nickname)")
        .eq("employee_id", emp.id)
        .order("leave_date", { ascending: false });
      setHistory(data || []);

      const { data: allEmps } = await supabase
        .from("employees")
        .select("id, name, nickname, position")
        .eq("is_active", true)
        .order("name");

      if (allEmps) {
        setEmployees(allEmps.filter((e) => e.id !== emp.id));
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
          fetchEmployeeAndHistory(p.userId, p);
        }
      } catch (e) {
        console.error(e);
      }
    };
    init();
  }, []);

  useRealtimeSync(["leave_requests", "employees"], () => {
    if (profile?.userId) {
      fetchEmployeeAndHistory(profile.userId);
    }
  });

  const getDatesInRange = (startStr, endStr) => {
    if (!startStr || !endStr) return [];
    const dates = [];
    let current = new Date(startStr);
    const end = new Date(endStr);
    while (current <= end) {
      const y = current.getFullYear();
      const m = String(current.getMonth() + 1).padStart(2, "0");
      const d = String(current.getDate()).padStart(2, "0");
      dates.push(`${y}-${m}-${d}`);
      current.setDate(current.getDate() + 1);
    }
    return dates;
  };

  const selectedDates = getDatesInRange(formData.startDate, formData.endDate);
  const totalDays = selectedDates.length;
  const isRangeTooLong = totalDays > 3;

  const checkConsecutiveDaysRange = (newDates) => {
    const activeDates = history
      .filter((h) => h.status !== "rejected")
      .map((h) => h.leave_date);

    newDates.forEach((d) => {
      if (!activeDates.includes(d)) {
        activeDates.push(d);
      }
    });

    const formatDateLocal = (dateObj) => {
      const y = dateObj.getFullYear();
      const m = String(dateObj.getMonth() + 1).padStart(2, "0");
      const d = String(dateObj.getDate()).padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    for (const dateStr of newDates) {
      let consecutiveCount = 1;
      const parts = dateStr.split("-");
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);

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
    setFormData((prev) => {
      const updated = { ...prev, startDate: startVal };
      if (!prev.endDate || prev.endDate < startVal) {
        updated.endDate = startVal;
      }
      return updated;
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!employee) return showToast("ไม่พบข้อมูลพนักงานในระบบ", "error");
    if (!formData.startDate || !formData.endDate) return showToast("กรุณาระบุวันที่ลาให้ครบถ้วน", "error");
    if (isRangeTooLong) return showToast("ขอลาหยุดติดต่อกันได้ไม่เกิน 3 วัน", "error");
    if (!formData.replacementId) return showToast("กรุณาระบุคนที่จะมาทำงานแทน", "error");

    const maxConsecutive = checkConsecutiveDaysRange(selectedDates);
    if (maxConsecutive > 3) {
      return showToast(`การลาติดต่อกันสะสมรวมเท่ากับ ${maxConsecutive} วัน ซึ่งเกิน 3 วัน (กรุณาติดต่อผู้จัดการ)`, "error");
    }

    setLoading(true);

    const replacementEmp = employees.find((e) => String(e.id) === String(formData.replacementId));
    const replacementName = replacementEmp ? replacementEmp.nickname || replacementEmp.name : "-";

    const rowsToInsert = selectedDates.map((date) => ({
      employee_id: employee.id,
      leave_date: date,
      leave_type: formData.type,
      reason: formData.reason,
      replacement_employee_id: parseInt(formData.replacementId, 10)
    }));

    const { data: insertedData, error } = await supabase
      .from("leave_requests")
      .insert(rowsToInsert)
      .select();

    if (!error && insertedData && insertedData.length > 0) {
      try {
        let typeLabel = "ลาป่วย";
        if (formData.type === "business") typeLabel = "ลากิจ";
        if (formData.type === "vacation") typeLabel = "พักร้อน";

        const dateRangeStr =
          totalDays === 1 ? formData.startDate : `${formData.startDate} ถึง ${formData.endDate}`;
        const leaveIds = insertedData.map((item) => item.id).join(",");

        await fetch("/api/notify-realtime", {
          method: "POST",
          body: JSON.stringify({
            name: employee.name,
            position: employee.position,
            action: "leave_request",
            time: `${dateRangeStr} (${totalDays} วัน)`,
            locationStatus: typeLabel,
            statusDetail: `${formData.reason} | คนแทน: ${replacementName}`,
            leaveId: leaveIds
          }),
          headers: { "Content-Type": "application/json" }
        });
      } catch (err) {
        console.error("Notification Error:", err);
      }

      showToast("ส่งใบลาเรียบร้อยแล้ว รอการอนุมัติจากผู้จัดการ", "success");
      setFormData({ startDate: "", endDate: "", type: "sick", reason: "", replacementId: "" });
      fetchEmployeeAndHistory(profile.userId);
    } else {
      showToast("เกิดข้อผิดพลาด: " + (error?.message || "ไม่สามารถบันทึกข้อมูลได้"), "error");
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink safe-bottom-dock">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-sm px-4">
          <div
            className={`p-3.5 rounded-sm border text-xs font-mono font-bold flex items-center justify-between shadow-[0_4px_12px_rgba(0,0,0,0.1)] ${
              toast.type === "error"
                ? "bg-rams-red text-rams-panel border-rams-red"
                : "bg-rams-green text-rams-panel border-rams-green"
            }`}
          >
            <span>{toast.text}</span>
            <button onClick={() => setToast(null)} className="ml-2 font-bold opacity-80 hover:opacity-100">
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Header */}
      <header className="border-b border-rams-rule-light bg-rams-panel px-6 py-5">
        <div className="max-w-xl mx-auto flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rams-orange"></span>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-rams-ink-muted">
                IN THE HAUS · LEAVE DESK
              </span>
            </div>
            <h1 className="text-xl font-mono font-bold tracking-tight text-rams-ink mt-1">
              ยื่นขอลาหยุด (LEAVE REQUEST)
            </h1>
            <p className="text-[11px] font-mono text-rams-ink-muted mt-0.5">
              {employee ? `${employee.nickname || employee.name} (${employee.position})` : "ระบุข้อมูลและผู้ปฏิบัติหน้าที่แทน"}
            </p>
          </div>

          {profile?.pictureUrl ? (
            <div className="relative w-10 h-10 shrink-0">
              <img
                src={profile.pictureUrl}
                alt="profile"
                referrerPolicy="no-referrer"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                  const fallback = e.currentTarget.parentElement?.querySelector('.avatar-header-fallback');
                  if (fallback) fallback.classList.remove('hidden');
                }}
                className="w-10 h-10 rounded-sm border border-rams-rule object-cover"
              />
              <div className="avatar-header-fallback hidden w-10 h-10 rounded-sm bg-rams-ink text-rams-panel flex items-center justify-center text-xs font-mono font-extrabold border border-rams-rule absolute inset-0">
                {(employee?.nickname || employee?.name || profile?.displayName || "U").slice(0, 2).toUpperCase()}
              </div>
            </div>
          ) : (
            <div className="w-10 h-10 rounded-sm bg-rams-ink text-rams-panel flex items-center justify-center text-xs font-mono font-extrabold border border-rams-rule shrink-0">
              {(employee?.nickname || employee?.name || profile?.displayName || "U").slice(0, 2).toUpperCase()}
            </div>
          )}
        </div>
      </header>

      {/* Form & History Container */}
      <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-6">
        {/* Form Card */}
        <form onSubmit={handleSubmit} className="bg-rams-panel border border-rams-rule p-5 sm:p-6 rounded-sm space-y-4 shadow-none">
          <div className="flex items-center justify-between border-b border-rams-rule-light pb-3">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink">
              FORM DETAILS · รายละเอียดการลา
            </span>
            <span className="text-[9px] font-mono text-rams-ink-muted">
              MAX 3 CONSECUTIVE DAYS
            </span>
          </div>

          {/* Date Picker Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-rams-ink mb-1">
                เริ่มวันที่ (START DATE)
              </label>
              <input
                type="date"
                required
                className="w-full p-2.5 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-orange"
                value={formData.startDate}
                onChange={handleStartDateChange}
              />
            </div>
            <div>
              <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-rams-ink mb-1">
                ถึงวันที่ (END DATE)
              </label>
              <input
                type="date"
                required
                min={formData.startDate}
                className="w-full p-2.5 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-orange"
                value={formData.endDate}
                onChange={(e) => setFormData({ ...formData, endDate: e.target.value })}
              />
            </div>
          </div>

          {/* Range Validation Chip */}
          {formData.startDate && formData.endDate && (
            <div
              className={`p-2.5 rounded-sm border text-[11px] font-mono font-bold flex items-center justify-between ${
                isRangeTooLong
                  ? "bg-rams-red/10 border-rams-red/30 text-rams-red"
                  : "bg-rams-bg border-rams-rule-light text-rams-ink"
              }`}
            >
              <span>ระยะเวลาที่เลือก: {totalDays} วัน</span>
              {isRangeTooLong ? (
                <span className="text-[9px] bg-rams-red text-rams-panel px-2 py-0.5 rounded-sm uppercase tracking-wider">
                  EXCEEDS LIMIT (MAX 3)
                </span>
              ) : (
                <span className="text-[9px] text-rams-green uppercase tracking-wider">✓ VALID RANGE</span>
              )}
            </div>
          )}

          {/* Leave Type */}
          <div>
            <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-rams-ink mb-1">
              ประเภทการลา (LEAVE CATEGORY)
            </label>
            <select
              className="w-full p-2.5 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-orange cursor-pointer"
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
            >
              <option value="sick">ลาป่วย (SICK LEAVE)</option>
              <option value="business">ลากิจ (BUSINESS LEAVE)</option>
              <option value="vacation">พักร้อน (VACATION)</option>
            </select>
          </div>

          {/* Replacement Staff Selector */}
          <div>
            <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-rams-ink mb-1">
              ผู้ปฏิบัติหน้าที่แทน (REPLACEMENT STAFF)
            </label>
            <select
              required
              className="w-full p-2.5 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-orange cursor-pointer"
              value={formData.replacementId}
              onChange={(e) => setFormData({ ...formData, replacementId: e.target.value })}
            >
              <option value="">-- เลือกเพื่อนร่วมงานที่เข้าแทน --</option>
              {employees.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nickname ? `${emp.nickname} (${emp.name})` : emp.name} · {emp.position || "Staff"}
                </option>
              ))}
            </select>
            <p className="text-[10px] font-mono text-rams-ink-muted mt-1">
              * ต้องระบุผู้แทนเพื่อจัดตารางเวรให้ร้านดำเนินงานได้ต่อเนื่อง
            </p>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-[10px] font-mono font-bold uppercase tracking-wider text-rams-ink mb-1">
              เหตุผลการลา (REASON / DETAILS)
            </label>
            <textarea
              required
              rows="2"
              placeholder="ระบุเหตุผล เช่น มีไข้หวัดพบแพทย์, ติดธุระครอบครัว..."
              className="w-full p-2.5 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-sans text-rams-ink outline-none focus:border-rams-orange placeholder:text-rams-ink-muted"
              value={formData.reason}
              onChange={(e) => setFormData({ ...formData, reason: e.target.value })}
            />
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || isRangeTooLong}
            className={`w-full py-3 rounded-sm font-mono font-bold text-xs uppercase tracking-wider transition-all tactile-btn ${
              loading || isRangeTooLong
                ? "bg-rams-bg text-rams-ink-muted border border-rams-rule-light cursor-not-allowed shadow-none"
                : "bg-rams-orange text-rams-panel border border-rams-rule hover:bg-rams-orange-active cursor-pointer"
            }`}
          >
            {loading ? "PROCESSING..." : "SUBMIT LEAVE REQUEST →"}
          </button>
        </form>

        {/* History Section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
              LEAVE HISTORY ({history.length})
            </span>
          </div>

          {history.length === 0 ? (
            <div className="bg-rams-panel border border-rams-rule-light p-6 rounded-sm text-center">
              <p className="text-xs font-mono text-rams-ink-muted uppercase">ยังไม่มีประวัติการขอลาหยุด</p>
            </div>
          ) : (
            history.map((h) => (
              <div
                key={h.id}
                className="bg-rams-panel border border-rams-rule-light p-4 rounded-sm flex justify-between items-start gap-3 shadow-none hover:border-rams-rule transition-colors"
              >
                <div className="space-y-1">
                  <div className="font-mono font-bold text-xs text-rams-ink flex items-center gap-2">
                    <span>{h.leave_date}</span>
                    <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-sm bg-rams-bg border border-rams-rule-light text-rams-ink-muted uppercase">
                      {h.leave_type === "sick" ? "SICK" : h.leave_type === "business" ? "BUSINESS" : "VACATION"}
                    </span>
                  </div>
                  <p className="text-xs font-sans text-rams-ink">"{h.reason}"</p>
                  {h.replacement_employee && (
                    <div className="text-[10px] font-mono text-rams-ink-muted flex items-center gap-1 mt-1">
                      <span>คนแทน:</span>
                      <span className="font-bold text-rams-ink">
                        {h.replacement_employee.nickname || h.replacement_employee.name}
                      </span>
                    </div>
                  )}
                </div>

                <span
                  className={`text-[9px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-sm border ${
                    h.status === "approved"
                      ? "bg-rams-green/10 text-rams-green border-rams-green/30"
                      : h.status === "rejected"
                      ? "bg-rams-red/10 text-rams-red border-rams-red/30"
                      : "bg-rams-amber/10 text-rams-amber border-rams-amber/30"
                  }`}
                >
                  {h.status === "approved" ? "APPROVED" : h.status === "rejected" ? "REJECTED" : "PENDING"}
                </span>
              </div>
            ))
          )}
        </div>
      </main>

      <NavigationDock />
    </div>
  );
}