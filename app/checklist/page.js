/* Hallmark · route: custom (bespoke) · structure: utilitarian operations checklist
 * paper: oklch(96% 0.006 80) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass
 */
"use client";
import React, { useEffect, useState, useRef } from "react";
import { format, parseISO } from "date-fns";
import { th } from "date-fns/locale";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import { resizeImage } from "../../utils/imageResizer";
import NavigationDock from "../_components/NavigationDock";
import {
  Check,
  Plus,
  X,
  Camera,
  RefreshCw,
  Search,
  DollarSign,
  FileText
} from "lucide-react";

const OPENING_PRESETS = [
  { id: "op_1", text: "เปิดไฟ สวิตช์ป้ายหน้าร้าน และแอร์ทุกตัว", category: "ความพร้อมหน้าร้าน" },
  { id: "op_2", text: "เปิดเครื่องชงกาแฟ (Espresso Machine) & ตรวจสอบแรงดัน/ระดับน้ำ", category: "บาร์กาแฟ" },
  { id: "op_3", text: "วอร์มเครื่องบดกาแฟ และทำ Espresso Calibration (Taste Profile)", category: "บาร์กาแฟ" },
  { id: "op_4", text: "เช็คสต็อกนมสด ไซรัป น้ำแข็ง และวัตถุดิบบาร์น้ำ", category: "สต็อก & เตรียมของ" },
  { id: "op_5", text: "เตรียมวัตถุดิบครัว ซอส ผักสด และเปิดเตาพร้อมใช้งาน", category: "ครัว & อาหาร" },
  { id: "op_6", text: "นับเงินทอนในลิ้นชัก POS และลงบันทึกยอดเงินเปิดร้าน", category: "ระบบเงิน & POS" },
  { id: "op_7", text: "กวาดและถูพื้น เช็ดทำความสะอาดโต๊ะเก้าอี้หน้าร้าน", category: "ความสะอาด" }
];

const CLOSING_PRESETS = [
  { id: "cl_1", text: "ปิดยอดขายในระบบ POS สรุปยอดเงินสดและเงินโอน", category: "ระบบเงิน & POS" },
  { id: "cl_2", text: "นับเงินสดปิดร้าน และจัดเก็บเข้าเซฟ/ซองปิดผนึก", category: "ระบบเงิน & POS" },
  { id: "cl_3", text: "Backflush ทำความสะอาดหัวชงกาแฟและล้างด้ามชง (Portafilter)", category: "บาร์กาแฟ" },
  { id: "cl_4", text: "ทำความสะอาดเครื่องบดกาแฟ และเก็บเมล็ดกาแฟในโหลสุญญากาศ", category: "บาร์กาแฟ" },
  { id: "cl_5", text: "ล้างและเก็บอุปกรณ์ครัว เช็ดเตา ทิ้งขยะครัวทั้งหมด", category: "ครัว & อาหาร" },
  { id: "cl_6", text: "เช็ด Station บาร์ ล้างซิงค์ กาง Fly Sheet ด้านข้างร้าน", category: "ความสะอาด" },
  { id: "cl_7", text: "ตรวจเช็คปิดแก๊ส ปิดแอร์ ปิดไฟ และล็อคประตูร้านให้เรียบร้อย", category: "ความปลอดภัย" }
];

export default function ChecklistPage() {
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState("form"); // 'form' | 'logs'
  const [shiftType, setShiftType] = useState("OPENING"); // 'OPENING' | 'CLOSING'
  const [tasks, setTasks] = useState(OPENING_PRESETS.map((t) => ({ ...t, checked: false })));
  const [cashAmount, setCashAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const fileInputRef = useRef(null);
  const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

  useEffect(() => {
    const init = async () => {
      try {
        if (typeof liff !== "undefined" && LIFF_ID) {
          await liff.init({ liffId: LIFF_ID });
          if (liff.isLoggedIn()) {
            const p = await liff.getProfile();
            setProfile(p);
          } else {
            setProfile({ displayName: "พนักงาน In The Haus" });
          }
        }
      } catch (err) {
        console.warn("LIFF Init error:", err);
        setProfile({ displayName: "พนักงาน In The Haus" });
      }
    };
    init();
    fetchLogs();
  }, [LIFF_ID]);

  useEffect(() => {
    const presets = shiftType === "OPENING" ? OPENING_PRESETS : CLOSING_PRESETS;
    setTasks(presets.map((t) => ({ ...t, checked: false })));
  }, [shiftType]);

  const fetchLogs = async () => {
    setLoadingLogs(true);
    try {
      const { data: dbLogs, error } = await supabase
        .from("daily_checklist_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);

      if (!error && dbLogs) {
        setLogs(dbLogs);
      }
    } catch (e) {
      console.error("Fetch checklist logs error:", e);
    }
    setLoadingLogs(false);
  };

  useRealtimeSync(["daily_checklist_logs"], (payload) => {
    if (payload.eventType === "INSERT") {
      setLogs((prev) => [payload.new, ...prev]);
    } else if (payload.eventType === "UPDATE") {
      setLogs((prev) => prev.map((l) => (l.id === payload.new.id ? payload.new : l)));
    } else if (payload.eventType === "DELETE") {
      setLogs((prev) => prev.filter((l) => l.id !== payload.old.id));
    }
  });

  const toggleTask = (id) => {
    setTasks((prev) => prev.map((t) => (t.id === id ? { ...t, checked: !t.checked } : t)));
  };

  const handlePhotoUpload = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    setErrorMsg("");

    try {
      const uploadedUrls = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const resizedBase64 = await resizeImage(file, 1000, 1000, 0.8);

        const byteCharacters = atob(resizedBase64.split(",")[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
          byteNumbers[j] = byteCharacters.charCodeAt(j);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: "image/jpeg" });

        const fileName = `checklist_${shiftType.toLowerCase()}_${Date.now()}_${i}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from("yuzu-images")
          .upload(fileName, blob, { contentType: "image/jpeg", upsert: true });

        if (!uploadErr) {
          const {
            data: { publicUrl }
          } = supabase.storage.from("yuzu-images").getPublicUrl(fileName);
          uploadedUrls.push(publicUrl);
        } else {
          uploadedUrls.push(resizedBase64);
        }
      }
      setPhotos((prev) => [...prev, ...uploadedUrls]);
    } catch (err) {
      console.error("Photo upload error:", err);
      setErrorMsg("ไม่สามารถอัปโหลดรูปภาพได้ กรุณาลองใหม่อีกครั้ง");
    }
    setIsUploading(false);
  };

  const completedCount = tasks.filter((t) => t.checked).length;
  const isAllChecked = completedCount === tasks.length;

  const handleSubmit = async () => {
    if (tasks.length === 0) return;
    setIsSubmitting(true);
    setErrorMsg("");

    try {
      const staffName = profile?.displayName || "พนักงาน In The Haus";
      const payload = {
        date: format(new Date(), "yyyy-MM-dd"),
        shift_type: shiftType,
        employee_name: staffName,
        tasks: tasks,
        cash_amount: cashAmount ? parseFloat(cashAmount) : null,
        photos: photos,
        notes: notes || null
      };

      const { error: insertErr } = await supabase.from("daily_checklist_logs").insert(payload);

      if (insertErr) {
        console.warn("Supabase insert warning:", insertErr);
      }

      try {
        await fetch("/api/notify-checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shiftName:
              shiftType === "OPENING"
                ? "ตรวจความพร้อมก่อนเปิดร้าน (Opening)"
                : "ตรวจความสะอาด & ปิดร้าน (Closing)",
            statusDetail: `ผ่านการตรวจ ${completedCount}/${tasks.length} รายการ`,
            staffName: staffName,
            cashAmount: cashAmount || null,
            timestamp: new Date().toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })
          })
        });
      } catch (notifyErr) {
        console.warn("Notification error:", notifyErr);
      }

      setSubmitSuccess(true);
      fetchLogs();
    } catch (err) {
      console.error("Checklist submit error:", err);
      setErrorMsg("เกิดข้อผิดพลาดในการบันทึกข้อมูล กรุณาลองใหม่");
    }
    setIsSubmitting(false);
  };

  const filteredLogs = logs.filter((l) => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return (
      l.employee_name?.toLowerCase().includes(q) ||
      l.shift_type?.toLowerCase().includes(q) ||
      l.date?.includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink safe-bottom-dock">
      {/* Header */}
      <header className="border-b border-rams-rule-light bg-rams-panel px-5 py-5">
        <div className="max-w-xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rams-orange"></span>
              <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-rams-ink-muted">
                IN THE HAUS · DAILY CHECKLIST
              </span>
            </div>
            <h1 className="text-xl font-mono font-bold tracking-tight text-rams-ink mt-1">
              เช็กลิสต์เปิด-ปิดร้าน (CHECKLIST)
            </h1>
            <p className="text-[11px] font-mono text-rams-ink-muted mt-0.5">
              {profile?.displayName ? `ผู้ตรวจ: ${profile.displayName}` : "บันทึกและส่งรายงานตรวจร้านแบบเรียลไทม์"}
            </p>
          </div>

          <div className="flex bg-rams-bg p-1 rounded-sm border border-rams-rule-light font-mono">
            <button
              onClick={() => setActiveTab("form")}
              className={`px-3 py-1.5 rounded-sm text-xs font-bold transition-all tactile-btn-sm ${
                activeTab === "form"
                  ? "bg-rams-ink text-rams-panel border border-rams-ink"
                  : "text-rams-ink-muted hover:text-rams-ink"
              }`}
            >
              INSPECTION (ตรวจ)
            </button>
            <button
              onClick={() => {
                setActiveTab("logs");
                fetchLogs();
              }}
              className={`px-3 py-1.5 rounded-sm text-xs font-bold transition-all tactile-btn-sm ${
                activeTab === "logs"
                  ? "bg-rams-ink text-rams-panel border border-rams-ink"
                  : "text-rams-ink-muted hover:text-rams-ink"
              }`}
            >
              LOGS (ประวัติ)
            </button>
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-xl mx-auto p-4 sm:p-6 space-y-5">
        {activeTab === "form" ? (
          submitSuccess ? (
            <div className="bg-rams-panel border border-rams-rule p-8 rounded-sm text-center space-y-4 shadow-none font-mono">
              <div className="w-12 h-12 bg-rams-green/10 border border-rams-green text-rams-green rounded-full flex items-center justify-center mx-auto text-xl font-bold">
                ✓
              </div>
              <h2 className="text-base font-bold text-rams-ink uppercase tracking-wider">
                CHECKLIST REPORT SAVED
              </h2>
              <p className="text-xs font-sans text-rams-ink-muted leading-relaxed max-w-sm mx-auto">
                รายงานการตรวจ {shiftType === "OPENING" ? "กะเปิดร้าน" : "กะปิดร้าน"} ถูกบันทึกและส่งแจ้งเตือนเข้ากลุ่ม LINE เรียบร้อยแล้วครับ
              </p>
              <div className="pt-3 flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setSubmitSuccess(false);
                    setTasks(
                      shiftType === "OPENING"
                        ? OPENING_PRESETS.map((t) => ({ ...t, checked: false }))
                        : CLOSING_PRESETS.map((t) => ({ ...t, checked: false }))
                    );
                    setPhotos([]);
                    setCashAmount("");
                    setNotes("");
                  }}
                  className="bg-rams-orange hover:bg-rams-orange-active text-rams-panel border border-rams-rule font-bold text-xs px-4 py-2 rounded-sm transition-all tactile-btn"
                >
                  NEW INSPECTION (ทำรายการใหม่)
                </button>
                <button
                  onClick={() => setActiveTab("logs")}
                  className="bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule-light font-bold text-xs px-4 py-2 rounded-sm transition-all"
                >
                  VIEW LOGS (ดูประวัติ)
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-4 font-mono">
              {/* Shift Selector */}
              <div className="grid grid-cols-2 gap-2 bg-rams-panel p-2 rounded-sm border border-rams-rule">
                <button
                  onClick={() => setShiftType("OPENING")}
                  className={`py-2.5 px-3 rounded-sm font-bold text-xs flex items-center justify-center gap-2 transition-all tactile-btn-sm ${
                    shiftType === "OPENING"
                      ? "bg-rams-orange text-rams-panel border border-rams-orange font-bold"
                      : "bg-rams-bg text-rams-ink-muted border border-rams-rule-light hover:text-rams-ink"
                  }`}
                >
                  <span>☀️ OPENING (เปิดร้าน)</span>
                </button>
                <button
                  onClick={() => setShiftType("CLOSING")}
                  className={`py-2.5 px-3 rounded-sm font-bold text-xs flex items-center justify-center gap-2 transition-all tactile-btn-sm ${
                    shiftType === "CLOSING"
                      ? "bg-rams-ink text-rams-panel border border-rams-ink font-bold"
                      : "bg-rams-bg text-rams-ink-muted border border-rams-rule-light hover:text-rams-ink"
                  }`}
                >
                  <span>🌙 CLOSING (ปิดร้าน)</span>
                </button>
              </div>

              {/* Progress Tracker */}
              <div className="bg-rams-panel border border-rams-rule-light p-4 rounded-sm flex items-center justify-between">
                <div>
                  <div className="text-[10px] font-bold text-rams-ink-muted uppercase tracking-wider">
                    COMPLETED TASKS · ความคืบหน้า
                  </div>
                  <div className="text-base font-bold text-rams-ink mt-0.5">
                    {completedCount} / {tasks.length} รายการ
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="w-24 bg-rams-bg h-2 rounded-sm overflow-hidden border border-rams-rule-light">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isAllChecked ? "bg-rams-green" : "bg-rams-orange"
                      }`}
                      style={{ width: `${(completedCount / tasks.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-bold text-rams-ink">
                    {Math.round((completedCount / tasks.length) * 100)}%
                  </span>
                </div>
              </div>

              {/* Task Items */}
              <div className="space-y-2">
                {tasks.map((task) => (
                  <div
                    key={task.id}
                    onClick={() => toggleTask(task.id)}
                    className={`p-3.5 rounded-sm border cursor-pointer transition-all flex items-start gap-3 select-none ${
                      task.checked
                        ? "bg-rams-panel border-rams-orange/60"
                        : "bg-rams-panel border-rams-rule-light hover:border-rams-rule"
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-sm flex items-center justify-center shrink-0 mt-0.5 border transition-all ${
                        task.checked
                          ? "bg-rams-orange text-rams-panel border-rams-orange"
                          : "border-rams-rule bg-rams-bg"
                      }`}
                    >
                      {task.checked && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                    </div>

                    <div className="flex-1 min-w-0">
                      <span className="text-[9px] font-bold uppercase tracking-widest text-rams-ink-muted block">
                        {task.category}
                      </span>
                      <p
                        className={`text-xs font-sans mt-0.5 leading-relaxed ${
                          task.checked ? "text-rams-ink font-bold" : "text-rams-ink"
                        }`}
                      >
                        {task.text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Cash Input */}
              <div className="bg-rams-panel border border-rams-rule-light p-4 rounded-sm space-y-2">
                <label className="text-xs font-bold text-rams-ink flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-rams-orange" />
                  <span>
                    {shiftType === "OPENING"
                      ? "ยอดเงินทอนในลิ้นชัก POS (บาท)"
                      : "ยอดเงินสดปิดร้านและนำส่งเซฟ (บาท)"}
                  </span>
                </label>
                <input
                  type="number"
                  placeholder="เช่น 2000 หรือ 5480"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full bg-rams-bg border border-rams-rule-light focus:border-rams-orange rounded-sm px-3.5 py-2.5 text-xs font-mono font-bold text-rams-ink outline-none transition"
                />
              </div>

              {/* Photos Capture */}
              <div className="bg-rams-panel border border-rams-rule-light p-4 rounded-sm space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-rams-ink flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-rams-orange" />
                    <span>รูปถ่าย Station บาร์ / หน้าร้าน / ลิ้นชักเงิน ({photos.length})</span>
                  </label>
                </div>

                <div className="flex flex-wrap gap-2">
                  {photos.map((img, i) => (
                    <div
                      key={i}
                      className="relative w-16 h-16 rounded-sm overflow-hidden border border-rams-rule"
                    >
                      <img src={img} alt="preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setPhotos((prev) => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 bg-rams-ink text-rams-panel p-0.5 rounded-sm hover:bg-rams-red"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-16 h-16 rounded-sm border border-dashed border-rams-rule bg-rams-bg hover:bg-rams-panel flex flex-col items-center justify-center gap-1 text-rams-ink-muted hover:text-rams-ink transition cursor-pointer"
                  >
                    {isUploading ? (
                      <RefreshCw className="w-4 h-4 animate-spin text-rams-orange" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    <span className="text-[8px] font-bold uppercase">ADD PHOTO</span>
                  </button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  capture="environment"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </div>

              {/* Notes */}
              <div className="bg-rams-panel border border-rams-rule-light p-4 rounded-sm space-y-2">
                <label className="text-xs font-bold text-rams-ink flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-rams-ink-muted" />
                  <span>หมายเหตุเพิ่มเติม / ส่งต่อกะถัดไป</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="เช่น นมสดเหลือ 2 แกลลอน, ปั๊มน้ำล้างจานทำงานปกติ..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-rams-bg border border-rams-rule-light focus:border-rams-orange rounded-sm p-2.5 text-xs font-sans text-rams-ink outline-none transition"
                />
              </div>

              {errorMsg && (
                <div className="p-3 rounded-sm bg-rams-red/10 border border-rams-red text-rams-red text-xs font-bold">
                  {errorMsg}
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || completedCount === 0}
                className="w-full bg-rams-orange hover:bg-rams-orange-active text-rams-panel border border-rams-rule font-bold text-xs uppercase tracking-wider py-3.5 rounded-sm transition-all tactile-btn disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {isSubmitting
                  ? "PROCESSING..."
                  : `SUBMIT INSPECTION REPORT (${completedCount}/${tasks.length}) →`}
              </button>
            </div>
          )
        ) : (
          /* Logs View */
          <div className="space-y-3 font-mono">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-rams-ink-muted absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาตามชื่อผู้ตรวจ, กะ หรือวันที่..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-rams-panel border border-rams-rule-light focus:border-rams-orange rounded-sm pl-9 pr-3 py-2 text-xs text-rams-ink outline-none"
              />
            </div>

            {loadingLogs ? (
              <div className="py-16 text-center space-y-2">
                <RefreshCw className="w-6 h-6 animate-spin text-rams-orange mx-auto" />
                <p className="text-xs text-rams-ink-muted">LOADING LOGS...</p>
              </div>
            ) : filteredLogs.length > 0 ? (
              filteredLogs.map((log) => (
                <div
                  key={log.id}
                  className="bg-rams-panel border border-rams-rule-light p-4 rounded-sm space-y-2.5 shadow-none"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded-sm border uppercase ${
                            log.shift_type === "OPENING"
                              ? "bg-rams-orange/10 text-rams-orange border-rams-orange/30"
                              : "bg-rams-ink/10 text-rams-ink border-rams-ink/20"
                          }`}
                        >
                          {log.shift_type === "OPENING" ? "OPENING" : "CLOSING"}
                        </span>
                        <span className="text-xs font-bold text-rams-ink font-sans">
                          {log.employee_name}
                        </span>
                      </div>
                      <div className="text-[10px] text-rams-ink-muted mt-1">
                        {format(parseISO(log.created_at || log.date), "dd MMM yyyy, HH:mm น.", {
                          locale: th
                        })}
                      </div>
                    </div>

                    {log.cash_amount && (
                      <div className="text-right">
                        <div className="text-[9px] text-rams-ink-muted uppercase">CASH COUNT</div>
                        <div className="text-xs font-bold text-rams-ink">
                          ฿{Number(log.cash_amount).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {Array.isArray(log.tasks) && log.tasks.length > 0 && (
                    <div className="bg-rams-bg p-2 rounded-sm border border-rams-rule-light text-[11px] text-rams-ink">
                      ผ่านการตรวจ {log.tasks.filter((t) => t.checked).length} / {log.tasks.length} รายการ
                    </div>
                  )}

                  {Array.isArray(log.photos) && log.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pt-1 pb-1">
                      {log.photos.map((p, idx) => (
                        <img
                          key={idx}
                          src={p}
                          alt="log-photo"
                          onClick={() => setSelectedPhoto(p)}
                          className="w-12 h-12 object-cover rounded-sm border border-rams-rule-light cursor-pointer hover:border-rams-orange transition"
                        />
                      ))}
                    </div>
                  )}

                  {log.notes && (
                    <div className="text-[11px] font-sans text-rams-ink-muted bg-rams-bg p-2 rounded-sm border border-rams-rule-light italic">
                      "{log.notes}"
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-12 text-center bg-rams-panel rounded-sm border border-rams-rule-light">
                <p className="text-xs text-rams-ink-muted uppercase">ยังไม่มีบันทึก Checklist ในระบบ</p>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Lightbox for Photos */}
      {selectedPhoto && (
        <div
          onClick={() => setSelectedPhoto(null)}
          className="fixed inset-0 bg-rams-ink/80 z-50 flex items-center justify-center p-4"
        >
          <div className="relative max-w-xl max-h-[85vh] rounded-sm overflow-hidden border border-rams-rule bg-rams-panel p-2">
            <img src={selectedPhoto} alt="Full view" className="w-full h-full object-contain max-h-[80vh]" />
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-4 right-4 bg-rams-panel border border-rams-rule p-1.5 rounded-sm text-rams-ink font-bold text-xs"
            >
              ✕ CLOSE
            </button>
          </div>
        </div>
      )}

      <NavigationDock />
    </div>
  );
}