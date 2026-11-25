"use client";
import React, { useEffect, useRef, useState } from "react";
import { format } from "date-fns";
import { FileText, Upload, Trash2, Pencil, ExternalLink, X } from "lucide-react";
import { supabase } from "../../../lib/supabaseClient";
import { useAdminAuth } from "../AdminAuthContext";
import { adminFetch } from "../../../lib/adminFetch";

const BUCKET = "meeting-notes";
const MAX_BYTES = 20 * 1024 * 1024;

const emptyForm = () => ({ title: "", meeting_date: format(new Date(), "yyyy-MM-dd"), summary: "" });

const buildPath = (dateStr) => {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${(dateStr || format(new Date(), "yyyy-MM-dd")).slice(0, 7)}/${Date.now()}-${rand}.pdf`;
};

export default function MeetingNotesManager() {
  const { user } = useAdminAuth();
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm());
  const [file, setFile] = useState(null);
  const [editing, setEditing] = useState(null); // note being edited
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null); // { type, text }
  const [notifyTeam, setNotifyTeam] = useState(true); // push a LINE card to the staff groups on new uploads
  const fileInputRef = useRef(null);

  const fetchNotes = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("meeting_notes")
      .select("*")
      .order("meeting_date", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) {
      setMessage({ type: "error", text: `โหลดข้อมูลไม่สำเร็จ: ${error.message} (ได้รัน migration 20261125_meeting_notes.sql แล้วหรือยัง?)` });
    } else {
      setNotes(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchNotes();
  }, []);

  const resetForm = () => {
    setForm(emptyForm());
    setFile(null);
    setEditing(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const onPickFile = (e) => {
    const f = e.target.files?.[0] || null;
    if (f && f.type !== "application/pdf" && !f.name.toLowerCase().endsWith(".pdf")) {
      setMessage({ type: "error", text: "รองรับเฉพาะไฟล์ PDF เท่านั้น" });
      e.target.value = "";
      return;
    }
    if (f && f.size > MAX_BYTES) {
      setMessage({ type: "error", text: "ไฟล์ใหญ่เกิน 20 MB" });
      e.target.value = "";
      return;
    }
    setFile(f);
    if (f && !form.title) {
      setForm((prev) => ({ ...prev, title: f.name.replace(/\.pdf$/i, "") }));
    }
  };

  const uploadFile = async (f, dateStr) => {
    const path = buildPath(dateStr);
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, f, { contentType: "application/pdf", upsert: false });
    if (error) throw error;
    return path;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setMessage({ type: "error", text: "กรุณาระบุหัวข้อการประชุม" });
      return;
    }
    if (!editing && !file) {
      setMessage({ type: "error", text: "กรุณาเลือกไฟล์ PDF" });
      return;
    }

    setSaving(true);
    setMessage(null);
    try {
      const base = {
        title: form.title.trim(),
        meeting_date: form.meeting_date,
        summary: form.summary.trim() || null,
        updated_at: new Date().toISOString()
      };

      if (editing) {
        let fileFields = {};
        if (file) {
          const path = await uploadFile(file, form.meeting_date);
          fileFields = { file_path: path, file_name: file.name, file_size: file.size };
        }
        const { error } = await supabase.from("meeting_notes").update({ ...base, ...fileFields }).eq("id", editing.id);
        if (error) throw error;
        if (file && editing.file_path) {
          await supabase.storage.from(BUCKET).remove([editing.file_path]);
        }
        setMessage({ type: "success", text: "บันทึกการแก้ไขแล้ว" });
      } else {
        const path = await uploadFile(file, form.meeting_date);
        const { data: inserted, error } = await supabase.from("meeting_notes").insert({
          ...base,
          file_path: path,
          file_name: file.name,
          file_size: file.size,
          created_by: user?.email || null
        }).select("id").single();
        if (error) {
          await supabase.storage.from(BUCKET).remove([path]);
          throw error;
        }
        let notifyText = "";
        if (notifyTeam && inserted?.id) {
          try {
            const res = await adminFetch("/api/notify-meeting", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ noteId: inserted.id })
            });
            const json = await res.json().catch(() => ({}));
            notifyText = res.ok ? " · แจ้งทีมใน LINE แล้ว" : ` · แจ้ง LINE ไม่สำเร็จ (${json.error || res.status})`;
          } catch {
            notifyText = " · แจ้ง LINE ไม่สำเร็จ";
          }
        }
        setMessage({ type: "success", text: `อัปโหลดบันทึกการประชุมแล้ว พนักงานเห็นได้ทันที${notifyText}` });
      }
      resetForm();
      fetchNotes();
    } catch (err) {
      setMessage({ type: "error", text: `ไม่สำเร็จ: ${err.message || err}` });
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (note) => {
    setEditing(note);
    setForm({ title: note.title || "", meeting_date: note.meeting_date, summary: note.summary || "" });
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    setMessage(null);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleDelete = async (note) => {
    if (!window.confirm(`ลบ "${note.title}" ใช่หรือไม่? ไฟล์ PDF จะถูกลบถาวร`)) return;
    const { error } = await supabase.from("meeting_notes").delete().eq("id", note.id);
    if (error) {
      setMessage({ type: "error", text: `ลบไม่สำเร็จ: ${error.message}` });
      return;
    }
    if (note.file_path) await supabase.storage.from(BUCKET).remove([note.file_path]);
    if (editing?.id === note.id) resetForm();
    setMessage({ type: "success", text: "ลบแล้ว" });
    fetchNotes();
  };

  const openFile = async (note) => {
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(note.file_path, 60 * 10);
    if (error || !data?.signedUrl) {
      setMessage({ type: "error", text: `เปิดไฟล์ไม่สำเร็จ: ${error?.message || "ไม่พบไฟล์"}` });
      return;
    }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  };

  const inputCls =
    "w-full px-3 py-2 bg-rams-bg border border-rams-rule-light focus:border-rams-rule rounded-sm text-sm text-rams-ink outline-none";
  const labelCls = "text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted block mb-1";

  return (
    <div className="space-y-6">
      <div className="bg-rams-panel border-2 border-rams-rule rounded-sm p-5 shadow-[0_2px_0_0_var(--color-rams-rule)]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-full bg-rams-orange" />
          <span className="text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
            STAFF DOCUMENTS · MEETING NOTES
          </span>
        </div>
        <h2 className="text-lg font-mono font-bold text-rams-ink mt-1">บันทึกการประชุม (PDF)</h2>
        <p className="text-xs text-rams-ink-muted mt-1 leading-relaxed">
          อัปโหลดไฟล์ PDF สรุปการประชุม พนักงานจะเปิดอ่านได้จากหน้าเข้า-ออกงาน (เมนู &quot;บันทึกการประชุม&quot;) ผ่าน LINE
        </p>
      </div>

      {message && (
        <div
          className={`p-3 rounded-sm border font-mono text-xs font-bold flex items-center justify-between ${
            message.type === "success"
              ? "bg-rams-green/10 border-rams-green text-rams-green"
              : "bg-rams-red/10 border-rams-red text-rams-red"
          }`}
        >
          <span>{message.text}</span>
          <button onClick={() => setMessage(null)} className="ml-4 cursor-pointer" aria-label="ปิด">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="bg-rams-panel border border-rams-rule-light rounded-sm p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-mono font-bold text-rams-ink uppercase">
            {editing ? "แก้ไขบันทึกการประชุม" : "อัปโหลดบันทึกใหม่"}
          </h3>
          {editing && (
            <button type="button" onClick={resetForm} className="text-xs font-mono text-rams-ink-muted hover:text-rams-ink cursor-pointer">
              ยกเลิกการแก้ไข
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-2">
            <label className={labelCls}>หัวข้อการประชุม</label>
            <input
              className={inputCls}
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="เช่น ประชุมทีมประจำเดือน พ.ย."
              maxLength={200}
            />
          </div>
          <div>
            <label className={labelCls}>วันที่ประชุม</label>
            <input
              type="date"
              className={inputCls}
              value={form.meeting_date}
              onChange={(e) => setForm({ ...form, meeting_date: e.target.value })}
            />
          </div>
        </div>

        <div>
          <label className={labelCls}>สรุปสั้น ๆ (ไม่บังคับ)</label>
          <textarea
            className={`${inputCls} min-h-[72px]`}
            value={form.summary}
            onChange={(e) => setForm({ ...form, summary: e.target.value })}
            placeholder="ประเด็นสำคัญที่พนักงานควรรู้"
            maxLength={1000}
          />
        </div>

        <div>
          <label className={labelCls}>
            ไฟล์ PDF {editing ? "(เลือกเฉพาะเมื่อต้องการแทนที่ไฟล์เดิม)" : ""}
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            onChange={onPickFile}
            className="block w-full text-xs text-rams-ink file:mr-3 file:px-3 file:py-2 file:border file:border-rams-rule file:rounded-sm file:bg-rams-bg file:text-xs file:font-mono file:font-bold file:cursor-pointer"
          />
          {editing && !file && (
            <p className="text-[11px] text-rams-ink-muted mt-1">ไฟล์ปัจจุบัน: {editing.file_name || editing.file_path}</p>
          )}
        </div>

        {!editing && (
          <label className="flex items-start gap-2 text-sm text-rams-ink cursor-pointer select-none">
            <input
              type="checkbox"
              checked={notifyTeam}
              onChange={(e) => setNotifyTeam(e.target.checked)}
              className="mt-1 w-4 h-4 accent-rams-ink"
            />
            <span>
              แจ้งทีมในกลุ่ม LINE ว่ามีบันทึกการประชุมใหม่
              <span className="block text-[11px] text-rams-ink-muted">ส่งการ์ดพร้อมปุ่มเปิดบันทึก เข้ากลุ่มพนักงานทั้ง 2 กลุ่ม</span>
            </span>
          </label>
        )}

        <button
          type="submit"
          disabled={saving}
          className="px-4 py-2.5 bg-rams-ink text-rams-panel border border-rams-rule rounded-sm text-xs font-mono font-bold uppercase flex items-center gap-2 cursor-pointer hover:bg-neutral-800 disabled:opacity-50"
        >
          <Upload className="w-3.5 h-3.5" />
          {saving ? "กำลังบันทึก..." : editing ? "บันทึกการแก้ไข" : "อัปโหลด"}
        </button>
      </form>

      <div className="bg-rams-panel border border-rams-rule-light rounded-sm">
        <div className="px-5 py-3 border-b border-rams-rule-light text-[10px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
          ทั้งหมด {notes.length} รายการ
        </div>
        {loading ? (
          <div className="p-5 text-xs text-rams-ink-muted">กำลังโหลด...</div>
        ) : notes.length === 0 ? (
          <div className="p-5 text-xs text-rams-ink-muted">ยังไม่มีบันทึกการประชุม</div>
        ) : (
          <ul className="divide-y divide-rams-rule-light">
            {notes.map((n) => (
              <li key={n.id} className="px-5 py-3 flex items-start gap-3">
                <FileText className="w-4 h-4 text-rams-ink mt-0.5 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-[10px] font-mono font-bold text-rams-ink-muted">{n.meeting_date}</div>
                  <div className="text-sm font-bold text-rams-ink break-words">{n.title}</div>
                  {n.summary && <p className="text-xs text-rams-ink-muted mt-0.5 line-clamp-2">{n.summary}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => openFile(n)} title="เปิด PDF" className="p-2 border border-rams-rule-light rounded-sm hover:bg-rams-bg cursor-pointer">
                    <ExternalLink className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => startEdit(n)} title="แก้ไข" className="p-2 border border-rams-rule-light rounded-sm hover:bg-rams-bg cursor-pointer">
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDelete(n)} title="ลบ" className="p-2 border border-rams-rule-light rounded-sm hover:bg-rams-red/10 text-rams-red cursor-pointer">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
