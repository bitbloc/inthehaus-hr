"use client";

import React, { useEffect, useState, useMemo, useRef } from "react";
import { format, parseISO, isValid } from "date-fns";
import { th } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import { resizeImage } from "../../utils/imageResizer";
import NavigationDock from "../_components/NavigationDock";
import {
  CheckCircle2,
  AlertTriangle,
  Camera,
  User,
  Clock,
  DollarSign,
  AlertCircle,
  RefreshCw,
  FileText,
  Calendar,
  Check,
  CheckSquare,
  Sparkles,
  ChevronRight,
  Search,
  Plus,
  X,
  UploadCloud,
  Send
} from "lucide-react";

// --- Preset Checklist Templates for In The Haus ---
const OPENING_PRESETS = [
  { id: "op_1", text: "เปิดไฟ สวิตช์ป้ายหน้าร้าน และแอร์ทุกตัว", category: "ความพร้อมหน้าร้าน" },
  { id: "op_2", text: "เปิดเครื่องชงกาแฟ (Espresso Machine) & ตรวจสอบแรงดัน/ระดับน้ำ", category: "บาร์กาแฟ" },
  { id: "op_3", text: "วอร์มเครื่องบดกาแฟ และทำ Espresso Calibration (Taste Profile)", category: "บาร์กาแฟ" },
  { id: "op_4", text: "เช็คสต็อกนมสด ไซรัป น้ำแข็ง และวัตถุดิบบาร์น้ำ", category: "สต็อก & เตรียมของ" },
  { id: "op_5", text: "เตรียมวัตถุดิบครัว ซอส ผักสด และเปิดเตาพร้อมใช้งาน", category: "ครัว & อาหาร" },
  { id: "op_6", text: "นับเงินทอนในลิ้นชัก POS และลงบันทึกยอดเงินเปิดร้าน", category: "ระบบเงิน & POS" },
  { id: "op_7", text: "กวาดและถูพื้น เช็ดทำความสะอาดโต๊ะเก้าอี้หน้าร้าน", category: "ความสะอาด" },
];

const CLOSING_PRESETS = [
  { id: "cl_1", text: "ปิดยอดขายในระบบ POS สรุปยอดเงินสดและเงินโอน", category: "ระบบเงิน & POS" },
  { id: "cl_2", text: "นับเงินสดปิดร้าน และจัดเก็บเข้าเซฟ/ซองปิดผนึก", category: "ระบบเงิน & POS" },
  { id: "cl_3", text: "Backflush ทำความสะอาดหัวชงกาแฟและล้างด้ามชง (Portafilter)", category: "บาร์กาแฟ" },
  { id: "cl_4", text: "ทำความสะอาดเครื่องบดกาแฟ และเก็บเมล็ดกาแฟในโหลสุญญากาศ", category: "บาร์กาแฟ" },
  { id: "cl_5", text: "ล้างและเก็บอุปกรณ์ครัว เช็ดเตา ทิ้งขยะครัวทั้งหมด", category: "ครัว & อาหาร" },
  { id: "cl_6", text: "เช็ด Station บาร์ ล้างซิงค์ กาง Fly Sheet ด้านข้างร้าน", category: "ความสะอาด" },
  { id: "cl_7", text: "ตรวจเช็คปิดแก๊ส ปิดแอร์ ปิดไฟ และล็อคประตูร้านให้เรียบร้อย", category: "ความปลอดภัย" },
];

export default function ChecklistPage() {
  const [profile, setProfile] = useState(null);
  const [activeTab, setActiveTab] = useState("form"); // 'form' | 'logs'
  const [shiftType, setShiftType] = useState("OPENING"); // 'OPENING' | 'CLOSING'
  const [tasks, setTasks] = useState(OPENING_PRESETS.map(t => ({ ...t, checked: false })));
  const [cashAmount, setCashAmount] = useState("");
  const [notes, setNotes] = useState("");
  const [photos, setPhotos] = useState([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errorMsg, setErrorMsg] = useState("");

  // History State
  const [logs, setLogs] = useState([]);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [searchFilter, setSearchFilter] = useState("");
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const fileInputRef = useRef(null);
  const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

  // Initialize LIFF
  useEffect(() => {
    const init = async () => {
      try {
        await liff.init({ liffId: LIFF_ID });
        if (liff.isLoggedIn()) {
          const p = await liff.getProfile();
          setProfile(p);
        } else {
          setProfile({ displayName: "พนักงาน (Dev Mode)" });
        }
      } catch (err) {
        console.warn("LIFF Init error:", err);
        setProfile({ displayName: "พนักงาน" });
      }
    };
    init();
    fetchLogs();
  }, [LIFF_ID]);

  // Handle Shift Type Toggle
  useEffect(() => {
    const presets = shiftType === "OPENING" ? OPENING_PRESETS : CLOSING_PRESETS;
    setTasks(presets.map(t => ({ ...t, checked: false })));
  }, [shiftType]);

  // Fetch Checklist History from Supabase
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

  // Realtime Subscription
  useRealtimeSync(["daily_checklist_logs"], (payload) => {
    if (payload.eventType === "INSERT") {
      setLogs(prev => [payload.new, ...prev]);
    } else if (payload.eventType === "UPDATE") {
      setLogs(prev => prev.map(l => l.id === payload.new.id ? payload.new : l));
    } else if (payload.eventType === "DELETE") {
      setLogs(prev => prev.filter(l => l.id === payload.old.id));
    }
  });

  const toggleTask = (id) => {
    setTasks(prev => prev.map(t => t.id === id ? { ...t, checked: !t.checked } : t));
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
        
        // Upload to Supabase Storage bucket 'yuzu-images' or 'checklist-photos'
        const byteCharacters = atob(resizedBase64.split(',')[1]);
        const byteNumbers = new Array(byteCharacters.length);
        for (let j = 0; j < byteCharacters.length; j++) {
          byteNumbers[j] = byteCharacters.charCodeAt(j);
        }
        const byteArray = new Uint8Array(byteNumbers);
        const blob = new Blob([byteArray], { type: 'image/jpeg' });

        const fileName = `checklist_${shiftType.toLowerCase()}_${Date.now()}_${i}.jpg`;
        const { error: uploadErr } = await supabase.storage
          .from('yuzu-images')
          .upload(fileName, blob, { contentType: 'image/jpeg', upsert: true });

        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('yuzu-images').getPublicUrl(fileName);
          uploadedUrls.push(publicUrl);
        } else {
          // Fallback to base64 if storage policy blocked
          uploadedUrls.push(resizedBase64);
        }
      }
      setPhotos(prev => [...prev, ...uploadedUrls]);
    } catch (err) {
      console.error("Photo upload error:", err);
      setErrorMsg("ไม่สามารถอัปโหลดรูปภาพได้ กรุณาลองใหม่อีกครั้ง");
    }
    setIsUploading(false);
  };

  const completedCount = tasks.filter(t => t.checked).length;
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

      // 1. Insert into Supabase Table
      const { error: insertErr } = await supabase
        .from("daily_checklist_logs")
        .insert(payload);

      if (insertErr) {
        console.warn("Supabase insert warning:", insertErr);
      }

      // 2. Notify LINE Group via API
      try {
        await fetch("/api/notify-checklist", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            shiftName: shiftType === "OPENING" ? "ตรวจความพร้อมก่อนเปิดร้าน (Opening)" : "ตรวจความสะอาด & ปิดร้าน (Closing)",
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

  const filteredLogs = logs.filter(l => {
    if (!searchFilter.trim()) return true;
    const q = searchFilter.toLowerCase();
    return l.employee_name?.toLowerCase().includes(q) ||
           l.shift_type?.toLowerCase().includes(q) ||
           l.date?.includes(q);
  });

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 font-sans pb-28 selection:bg-indigo-500/30">
      {/* Header */}
      <div className="relative overflow-hidden bg-gradient-to-b from-indigo-950/80 via-slate-950/50 to-transparent px-5 pt-7 pb-5 border-b border-indigo-900/20">
        <div className="flex items-center justify-between">
          <div>
            <div className="inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase font-extrabold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
              <Sparkles className="w-3 h-3 text-indigo-400" />
              In The Haus Operations
            </div>
            <h1 className="text-2xl font-black text-white tracking-tight mt-2">📋 รายการตรวจเช็กร้าน</h1>
            <p className="text-xs text-slate-400 font-medium mt-0.5">
              {profile?.displayName ? `ผู้ตรวจ: ${profile.displayName}` : "ระบบตรวจสอบเปิด/ปิดร้านประจำวัน"}
            </p>
          </div>

          <div className="flex bg-slate-900/80 p-1 rounded-2xl border border-indigo-900/30 shadow-inner">
            <button
              onClick={() => setActiveTab("form")}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "form" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
              }`}
            >
              ตรวจเช็ค
            </button>
            <button
              onClick={() => { setActiveTab("logs"); fetchLogs(); }}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
                activeTab === "logs" ? "bg-indigo-600 text-white shadow-md shadow-indigo-600/30" : "text-slate-400 hover:text-white"
              }`}
            >
              ประวัติ
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="p-4 max-w-xl mx-auto space-y-4">
        {activeTab === "form" ? (
          submitSuccess ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="bg-slate-900/70 border border-emerald-500/30 rounded-3xl p-8 text-center space-y-4 shadow-2xl"
            >
              <div className="w-20 h-20 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto border border-emerald-500/30">
                <CheckCircle2 className="w-10 h-10 text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)]" />
              </div>
              <h2 className="text-xl font-black text-white">บันทึก Checklist เรียบร้อย!</h2>
              <p className="text-xs text-slate-400 leading-relaxed max-w-xs mx-auto">
                รายงานการตรวจ {shiftType === "OPENING" ? "กะเปิดร้าน" : "กะปิดร้าน"} ถูกบันทึกเข้าฐานข้อมูล Realtime และส่งแจ้งเตือนเข้ากลุ่ม LINE แล้วครับ
              </p>
              <div className="pt-2 flex gap-3 justify-center">
                <button
                  onClick={() => {
                    setSubmitSuccess(false);
                    setTasks(shiftType === "OPENING" ? OPENING_PRESETS.map(t => ({ ...t, checked: false })) : CLOSING_PRESETS.map(t => ({ ...t, checked: false })));
                    setPhotos([]);
                    setCashAmount("");
                    setNotes("");
                  }}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs px-5 py-3 rounded-2xl shadow-lg shadow-indigo-600/30 transition"
                >
                  ทำรายการใหม่
                </button>
                <button
                  onClick={() => setActiveTab("logs")}
                  className="bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs px-5 py-3 rounded-2xl border border-slate-700 transition"
                >
                  ดูประวัติ
                </button>
              </div>
            </motion.div>
          ) : (
            <div className="space-y-4">
              {/* Shift Selector */}
              <div className="grid grid-cols-2 gap-2 p-1.5 bg-slate-900/80 rounded-2xl border border-indigo-900/30 shadow-inner">
                <button
                  onClick={() => setShiftType("OPENING")}
                  className={`py-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${
                    shiftType === "OPENING"
                      ? "bg-gradient-to-r from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/25"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>☀️ กะเปิดร้าน (Opening)</span>
                </button>
                <button
                  onClick={() => setShiftType("CLOSING")}
                  className={`py-3 rounded-xl font-extrabold text-xs flex items-center justify-center gap-2 transition-all ${
                    shiftType === "CLOSING"
                      ? "bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-lg shadow-indigo-600/25"
                      : "text-slate-400 hover:text-white"
                  }`}
                >
                  <span>🌙 กะปิดร้าน (Closing)</span>
                </button>
              </div>

              {/* Progress Tracker */}
              <div className="bg-slate-900/60 backdrop-blur-md border border-indigo-900/30 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">ความคืบหน้าการตรวจ</div>
                  <div className="text-lg font-black text-white mt-0.5">
                    {completedCount} / {tasks.length} รายการ
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-28 bg-slate-800 h-2.5 rounded-full overflow-hidden border border-slate-700">
                    <div
                      className={`h-full transition-all duration-500 ${
                        isAllChecked ? "bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.5)]" : "bg-indigo-500"
                      }`}
                      style={{ width: `${(completedCount / tasks.length) * 100}%` }}
                    />
                  </div>
                  <span className="text-xs font-mono font-black text-indigo-400">
                    {Math.round((completedCount / tasks.length) * 100)}%
                  </span>
                </div>
              </div>

              {/* Tasks List */}
              <div className="space-y-2">
                {tasks.map((task, idx) => (
                  <motion.div
                    key={task.id}
                    whileTap={{ scale: 0.98 }}
                    onClick={() => toggleTask(task.id)}
                    className={`p-3.5 rounded-2xl border cursor-pointer transition-all flex items-start gap-3.5 ${
                      task.checked
                        ? "bg-emerald-500/10 border-emerald-500/30 shadow-md shadow-emerald-500/5"
                        : "bg-slate-900/60 border-indigo-900/20 hover:border-indigo-900/50"
                    }`}
                  >
                    <div
                      className={`w-6 h-6 rounded-xl flex items-center justify-center shrink-0 mt-0.5 transition-all ${
                        task.checked
                          ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30"
                          : "border-2 border-slate-700 bg-slate-800"
                      }`}
                    >
                      {task.checked && <Check className="w-4 h-4 stroke-[3]" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">
                        {task.category}
                      </span>
                      <p className={`text-xs font-bold leading-relaxed mt-0.5 ${task.checked ? "text-slate-200" : "text-slate-300"}`}>
                        {task.text}
                      </p>
                    </div>
                  </motion.div>
                ))}
              </div>

              {/* Cash Input */}
              <div className="bg-slate-900/60 border border-indigo-900/30 rounded-2xl p-4 space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-400" />
                  <span>{shiftType === "OPENING" ? "ระบุยอดเงินทอนในลิ้นชัก (บาท)" : "ระบุยอดเงินสดปิดร้าน (บาท)"}</span>
                </label>
                <input
                  type="number"
                  placeholder="เช่น 2000 หรือ 5480"
                  value={cashAmount}
                  onChange={(e) => setCashAmount(e.target.value)}
                  className="w-full bg-slate-950 border border-indigo-900/30 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-3 text-sm font-bold text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              {/* Photos Capture */}
              <div className="bg-slate-900/60 border border-indigo-900/30 rounded-2xl p-4 space-y-3">
                <div className="flex justify-between items-center">
                  <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Camera className="w-4 h-4 text-indigo-400" />
                    <span>ถ่ายรูป Station บาร์ / หน้าร้าน / ลิ้นชักเงิน</span>
                  </label>
                  <span className="text-[10px] font-bold text-slate-500">
                    {photos.length} รูป
                  </span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {photos.map((img, i) => (
                    <div key={i} className="relative w-16 h-16 rounded-xl overflow-hidden border border-indigo-900/40">
                      <img src={img} alt="preview" className="w-full h-full object-cover" />
                      <button
                        onClick={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                        className="absolute top-0.5 right-0.5 bg-black/70 p-1 rounded-full text-white hover:bg-red-500 transition"
                      >
                        <X className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  ))}

                  <button
                    onClick={() => fileInputRef.current?.click()}
                    disabled={isUploading}
                    className="w-16 h-16 rounded-xl border border-dashed border-indigo-500/40 bg-indigo-500/5 hover:bg-indigo-500/10 flex flex-col items-center justify-center gap-1 text-indigo-400 transition"
                  >
                    {isUploading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
                    <span className="text-[9px] font-bold">เพิ่มรูป</span>
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
              <div className="bg-slate-900/60 border border-indigo-900/30 rounded-2xl p-4 space-y-2">
                <label className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span>หมายเหตุเพิ่มเติม / ส่งต่อกะถัดไป</span>
                </label>
                <textarea
                  rows={2}
                  placeholder="เช่น นมสดเหลือ 2 แกลลอน, ปั๊มน้ำล้างจานเสียงดัง..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-indigo-900/30 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl p-3 text-xs text-white placeholder-slate-600 outline-none transition"
                />
              </div>

              {errorMsg && (
                <div className="p-3.5 rounded-2xl bg-red-500/10 border border-red-500/30 text-red-400 text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                onClick={handleSubmit}
                disabled={isSubmitting || completedCount === 0}
                className="w-full bg-gradient-to-r from-indigo-600 via-indigo-500 to-emerald-500 hover:from-indigo-500 hover:to-emerald-400 text-white font-black py-4 rounded-2xl shadow-xl shadow-indigo-600/25 flex items-center justify-center gap-2 transition-all active:scale-[0.99] disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSubmitting ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                <span className="text-sm tracking-wide">
                  {isSubmitting ? "กำลังบันทึก..." : `บันทึกส่งรายงาน (${completedCount}/${tasks.length})`}
                </span>
              </button>
            </div>
          )
        ) : (
          /* Logs View */
          <div className="space-y-3">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="ค้นหาตามชื่อผู้ตรวจ, กะ, หรือวันที่..."
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                className="w-full bg-slate-900 border border-indigo-900/30 focus:border-indigo-500 rounded-2xl pl-10 pr-4 py-2.5 text-xs text-white placeholder-slate-500 outline-none"
              />
            </div>

            {loadingLogs ? (
              <div className="py-20 text-center space-y-3">
                <RefreshCw className="w-7 h-7 animate-spin text-indigo-400 mx-auto" />
                <p className="text-xs text-slate-400 font-medium">กำลังโหลดประวัติ Realtime...</p>
              </div>
            ) : filteredLogs.length > 0 ? (
              filteredLogs.map(log => (
                <div key={log.id} className="bg-slate-900/70 border border-indigo-900/30 rounded-2xl p-4 space-y-3 shadow-lg">
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-black px-2.5 py-0.5 rounded-full border ${
                          log.shift_type === 'OPENING' 
                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/25'
                            : 'bg-purple-500/10 text-purple-400 border-purple-500/25'
                        }`}>
                          {log.shift_type === 'OPENING' ? '☀️ กะเปิดร้าน' : '🌙 กะปิดร้าน'}
                        </span>
                        <span className="text-xs font-bold text-slate-200">
                          {log.employee_name}
                        </span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1.5">
                        <Clock className="w-3 h-3 text-indigo-400" />
                        <span>{format(parseISO(log.created_at || log.date), "dd MMM yyyy, HH:mm น.", { locale: th })}</span>
                      </div>
                    </div>

                    {log.cash_amount && (
                      <div className="text-right">
                        <div className="text-[10px] text-slate-400">ยอดเงิน</div>
                        <div className="text-xs font-bold font-mono text-emerald-400">
                          ฿{Number(log.cash_amount).toLocaleString()}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Tasks Summary */}
                  {Array.isArray(log.tasks) && log.tasks.length > 0 && (
                    <div className="bg-slate-950/60 p-2.5 rounded-xl border border-indigo-900/20 text-xs text-slate-300">
                      <div className="text-[10px] font-bold text-slate-400 mb-1">
                        ผ่าน {log.tasks.filter(t => t.checked).length} / {log.tasks.length} รายการ
                      </div>
                    </div>
                  )}

                  {/* Photos */}
                  {Array.isArray(log.photos) && log.photos.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pt-1 pb-1">
                      {log.photos.map((p, idx) => (
                        <img
                          key={idx}
                          src={p}
                          alt="log-photo"
                          onClick={() => setSelectedPhoto(p)}
                          className="w-14 h-14 object-cover rounded-xl border border-indigo-900/30 cursor-pointer hover:opacity-80 transition"
                        />
                      ))}
                    </div>
                  )}

                  {log.notes && (
                    <div className="text-[11px] text-slate-400 bg-slate-950/40 p-2.5 rounded-xl border border-indigo-900/10 italic">
                      "{log.notes}"
                    </div>
                  )}
                </div>
              ))
            ) : (
              <div className="py-16 text-center bg-slate-900/30 rounded-2xl border border-indigo-900/20">
                <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                <p className="text-xs text-slate-400">ยังไม่มีบันทึก Checklist ในระบบ</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Lightbox for Photos */}
      <AnimatePresence>
        {selectedPhoto && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setSelectedPhoto(null)}
            className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4"
          >
            <div className="relative max-w-xl max-h-[85vh] rounded-2xl overflow-hidden border border-white/20">
              <img src={selectedPhoto} alt="Full" className="w-full h-full object-contain" />
              <button
                onClick={() => setSelectedPhoto(null)}
                className="absolute top-3 right-3 bg-black/70 p-2 rounded-full text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <NavigationDock />
    </div>
  );
}