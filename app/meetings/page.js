"use client";
import { useEffect, useMemo, useState } from "react";
import liff from "@line/liff";
import Link from "next/link";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import NavigationDock from "../_components/NavigationDock";

const FileIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
    <polyline points="14 2 14 8 20 8" />
    <line x1="8" y1="13" x2="16" y2="13" />
    <line x1="8" y1="17" x2="13" y2="17" />
  </svg>
);

const BackIcon = ({ className = "w-4 h-4 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="15 18 9 12 15 6" />
  </svg>
);

const formatSize = (bytes) => {
  if (!bytes) return "";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatThaiDate = (dateStr) => {
  try {
    const d = new Date(`${dateStr}T00:00:00`);
    return `${format(d, "d MMM", { locale: th })} ${d.getFullYear() + 543}`;
  } catch {
    return dateStr;
  }
};

export default function MeetingNotesPage() {
  const [profile, setProfile] = useState(null);
  const [phase, setPhase] = useState("init"); // init | login | loading | ready | error
  const [error, setError] = useState("");
  const [notes, setNotes] = useState([]);
  const [query, setQuery] = useState("");

  const loadNotes = async (userId) => {
    setPhase("loading");
    try {
      const res = await fetch(`/api/meetings?userId=${encodeURIComponent(userId)}`, { cache: "no-store" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.error || "ไม่สามารถโหลดบันทึกการประชุมได้");
        setPhase("error");
        return;
      }
      setNotes(json.notes || []);
      setPhase("ready");
    } catch (e) {
      setError("เชื่อมต่อเซิร์ฟเวอร์ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
      setPhase("error");
    }
  };

  useEffect(() => {
    const init = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID || "2008567449-W868y8RY" });
        if (!liff.isLoggedIn()) {
          if (liff.isInClient?.()) {
            liff.login();
            return;
          }
          setPhase("login");
          return;
        }
        let p = null;
        try {
          p = await liff.getProfile();
        } catch {
          const idToken = liff.getDecodedIDToken?.();
          if (idToken) p = { userId: idToken.sub, displayName: idToken.name || "LINE Staff" };
        }
        if (p?.userId) {
          setProfile(p);
          loadNotes(p.userId);
        } else {
          setPhase("login");
        }
      } catch (e) {
        console.error("LIFF init error:", e);
        setError("ไม่สามารถเริ่มต้นระบบ LINE ได้ กรุณาเปิดผ่านแอป LINE");
        setPhase("error");
      }
    };
    init();
  }, []);

  const handleLogin = () => {
    try {
      liff.login();
    } catch (e) {
      console.error(e);
    }
  };

  const openPdf = (url) => {
    if (!url) return;
    try {
      if (liff.isInClient?.()) {
        // LINE's in-app webview can't always render PDFs inline; open in the system browser.
        liff.openWindow({ url, external: true });
        return;
      }
    } catch {
      // fall through
    }
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return notes;
    return notes.filter((n) =>
      [n.title, n.summary, n.file_name].some((v) => (v || "").toLowerCase().includes(q))
    );
  }, [notes, query]);

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink font-sans flex flex-col items-center pb-32">
      {/* Header */}
      <div className="w-full px-6 py-4 flex justify-between items-center sticky top-0 z-20 bg-rams-panel border-b border-rams-rule-light">
        <Link
          href="/checkin"
          className="flex items-center gap-1 text-[10px] font-mono font-bold text-rams-ink-muted hover:text-rams-ink uppercase tracking-wider transition-colors"
        >
          <BackIcon />
          เข้า-ออกงาน
        </Link>
        <span className="text-[10px] font-mono font-bold text-rams-ink uppercase tracking-wider">Meeting Notes</span>
      </div>

      <div className="w-full max-w-sm px-6 pt-6 space-y-4">
        <div>
          <h1 className="text-lg font-bold text-rams-ink">บันทึกการประชุม</h1>
          <p className="text-xs text-rams-ink-muted mt-1">
            {profile?.displayName ? `สวัสดี ${profile.displayName} · ` : ""}เอกสารสรุปการประชุมของทีม (PDF)
          </p>
        </div>

        {phase === "ready" && notes.length > 0 && (
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาหัวข้อการประชุม..."
            className="w-full px-3 py-2.5 bg-rams-panel border border-rams-rule-light focus:border-rams-rule rounded-sm text-sm outline-none"
          />
        )}

        {(phase === "init" || phase === "loading") && (
          <div className="space-y-2">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-20 bg-rams-panel border border-rams-rule-light rounded-sm animate-pulse" />
            ))}
          </div>
        )}

        {phase === "login" && (
          <div className="p-5 bg-rams-panel border border-rams-rule-light rounded-sm text-center space-y-3">
            <p className="text-sm text-rams-ink">กรุณาเข้าสู่ระบบด้วย LINE เพื่อดูบันทึกการประชุม</p>
            <button
              onClick={handleLogin}
              className="px-4 py-2.5 bg-rams-ink text-rams-panel rounded-sm text-xs font-mono font-bold uppercase tracking-wider active:translate-y-[1px] transition-transform"
            >
              เข้าสู่ระบบด้วย LINE
            </button>
          </div>
        )}

        {phase === "error" && (
          <div className="p-4 bg-rams-panel border border-rams-red/50 rounded-sm text-sm text-rams-ink">
            {error}
          </div>
        )}

        {phase === "ready" && filtered.length === 0 && (
          <div className="p-6 bg-rams-panel border border-rams-rule-light rounded-sm text-center text-sm text-rams-ink-muted">
            {notes.length === 0 ? "ยังไม่มีบันทึกการประชุม" : "ไม่พบบันทึกที่ค้นหา"}
          </div>
        )}

        {phase === "ready" && (
          <div className="flex flex-col gap-2">
            <AnimatePresence>
              {filtered.map((n, i) => (
                <motion.button
                  key={n.id}
                  type="button"
                  onClick={() => openPdf(n.url)}
                  disabled={!n.url}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i, 8) * 0.03 }}
                  className="w-full text-left p-4 bg-rams-panel hover:bg-rams-bg border border-rams-rule-light hover:border-rams-rule rounded-sm flex items-start gap-3 transition-colors active:translate-y-[1px] disabled:opacity-60 group"
                >
                  <div className="w-9 h-9 shrink-0 rounded-sm bg-rams-bg border border-rams-rule-light flex items-center justify-center text-rams-ink group-hover:text-rams-orange transition-colors">
                    <FileIcon className="w-4 h-4 stroke-current" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider">
                      {formatThaiDate(n.meeting_date)}
                    </div>
                    <div className="text-sm font-bold text-rams-ink mt-0.5 break-words">{n.title}</div>
                    {n.summary && (
                      <p className="text-xs text-rams-ink-muted mt-1 leading-relaxed whitespace-pre-line break-words line-clamp-3">
                        {n.summary}
                      </p>
                    )}
                    <div className="text-[10px] font-mono text-rams-ink-muted mt-2">
                      {n.url ? "แตะเพื่อเปิด PDF" : "ไฟล์ไม่พร้อมใช้งาน"}
                      {n.file_size ? ` · ${formatSize(n.file_size)}` : ""}
                    </div>
                  </div>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>

      <NavigationDock />
    </div>
  );
}
