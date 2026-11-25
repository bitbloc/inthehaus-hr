"use client";
/* Brand v2 · staff meeting notes. Text only. Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
import { useEffect, useMemo, useState } from "react";
import liff from "@line/liff";
import Link from "next/link";
import { format } from "date-fns";
import { th } from "date-fns/locale";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import NavigationDock from "../_components/NavigationDock";

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
  // Notes posted after the last visit get a "ใหม่" mark (first visit: last 7 days)
  const [seenBefore, setSeenBefore] = useState(undefined);

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
      const list = json.notes || [];
      let lastSeen = null;
      try { lastSeen = window.localStorage.getItem("meetings_last_seen"); } catch {}
      setSeenBefore(lastSeen ? new Date(lastSeen).getTime() : Date.now() - 7 * 24 * 60 * 60 * 1000);
      const newest = list.reduce((max, n) => (n.created_at && n.created_at > max ? n.created_at : max), "");
      if (newest) {
        try { window.localStorage.setItem("meetings_last_seen", newest); } catch {}
      }
      setNotes(list);
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
    <MotionConfig reducedMotion="user">
    <div className="brand-v2 min-h-screen flex flex-col items-center pb-36">
      {/* Header: plum bar, back cell + title cell */}
      <header className="w-full sticky top-0 z-20 bg-plum text-cream border-b border-plum-3">
        <div className="mx-auto max-w-sm px-4 flex items-stretch">
          <Link
            href="/checkin"
            className="min-h-14 pr-4 flex items-center text-base text-on-plum-2 hover:text-cream transition-colors duration-150"
          >
            ← ลงเวลา
          </Link>
          <div className="flex-1 border-l border-plum-3 pl-4 py-2 flex items-center justify-end gap-3">
            <span className="font-num text-xs tracking-[0.12em] text-on-plum-2">MEETING NOTES</span>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-inbaan-wordmark-cream-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto shrink-0" />
          </div>
        </div>
      </header>

      <main className="w-full max-w-sm px-4 pt-6 flex flex-col gap-4">
        <div>
          <h1 className="font-head text-3xl leading-normal text-charcoal">บันทึกการประชุม</h1>
          <p className="text-base text-subtle mt-1">
            {profile?.displayName ? `สวัสดี ${profile.displayName} · ` : ""}สรุปการประชุมของทีม เปิดเป็น PDF
          </p>
        </div>

        {phase === "ready" && notes.length > 0 && (
          <div>
            <label htmlFor="meeting-search" className="block text-sm font-semibold text-neutral mb-1">ค้นหา</label>
            <input
              id="meeting-search"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="หัวข้อ สรุป หรือชื่อไฟล์"
              className="w-full min-h-12 px-4 bg-cream border border-charcoal text-base text-charcoal placeholder:text-neutral outline-none focus-visible:border-plum"
            />
          </div>
        )}

        {(phase === "init" || phase === "loading") && (
          <p role="status" className="border border-rule px-4 py-6 text-base text-neutral text-center">กำลังโหลดบันทึกการประชุม…</p>
        )}

        {phase === "login" && (
          <section className="border border-rule">
            <p className="px-4 py-4 text-base text-charcoal">เข้าสู่ระบบด้วย LINE ก่อน เพื่อดูบันทึกการประชุม</p>
            <div className="px-4 pb-4">
              <button
                type="button"
                onClick={handleLogin}
                className="w-full min-h-14 bg-charcoal hover:bg-charcoal-2 text-cream text-lg font-semibold transition-colors duration-150"
              >
                เข้าสู่ระบบ LINE
              </button>
            </div>
          </section>
        )}

        {phase === "error" && (
          <p role="alert" className="border border-error px-4 py-4 text-base text-error">{error}</p>
        )}

        {phase === "ready" && filtered.length === 0 && (
          <p className="border border-rule px-4 py-6 text-base text-neutral text-center">
            {notes.length === 0 ? "ยังไม่มีบันทึกการประชุม" : "ไม่พบบันทึกที่ค้นหา"}
          </p>
        )}

        {phase === "ready" && filtered.length > 0 && (
          <ul className="border border-rule divide-y divide-rule">
            <AnimatePresence initial={false}>
              {filtered.map((n) => (
                <motion.li
                  key={n.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.16, ease: "easeOut" }}
                >
                  <button
                    type="button"
                    onClick={() => openPdf(n.url)}
                    disabled={!n.url}
                    className="w-full text-left px-4 py-4 bg-cream hover:bg-paper-2 disabled:hover:bg-cream transition-colors duration-150 flex flex-col"
                  >
                    <span className="flex items-baseline justify-between gap-3">
                      <span className="text-sm text-neutral">{formatThaiDate(n.meeting_date)}</span>
                      {seenBefore !== undefined && n.created_at && new Date(n.created_at).getTime() > seenBefore && (
                        <span className="shrink-0 bg-plum text-cream px-2 text-sm font-semibold">ใหม่</span>
                      )}
                    </span>
                    <span className="text-lg font-semibold text-charcoal break-words">{n.title}</span>
                    {n.summary && (
                      <span className="text-base text-subtle mt-1 whitespace-pre-line break-words line-clamp-3">
                        {n.summary}
                      </span>
                    )}
                    <span className="mt-3 flex items-baseline justify-between gap-3">
                      <span className={`text-base font-semibold ${n.url ? "text-plum" : "text-neutral"}`}>
                        {n.url ? "เปิด PDF" : "ไฟล์ยังไม่พร้อม"}
                      </span>
                      {n.file_size ? <span className="font-num text-xs text-neutral">{formatSize(n.file_size)}</span> : null}
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        )}
      </main>

      <NavigationDock />
    </div>
    </MotionConfig>
  );
}
