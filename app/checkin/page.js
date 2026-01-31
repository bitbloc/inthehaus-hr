"use client";
import { useEffect, useState, useRef } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { resizeImage } from "../../utils/imageResizer";
import Link from "next/link";
import { format, isSameDay } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import NavigationDock from "../_components/NavigationDock";
import { getEffectiveDailyRoster } from "../../utils/roster_logic";

// --- Icons (Simulated Lucide for cleaner look) ---
const Icons = {
  Calendar: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="4" rx="2" ry="2" /><line x1="16" x2="16" y1="2" y2="6" /><line x1="8" x2="8" y1="2" y2="6" /><line x1="3" x2="21" y1="10" y2="10" /></svg>,
  Wallet: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="14" x="2" y="5" rx="2" ry="2" /><line x1="2" x2="22" y1="10" y2="10" /></svg>,
  Home: () => <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" /></svg>,
  Leave: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /><path d="M12 22v-6" /><path d="M15 19l-3 3-3-3" /><rect x="3" y="4" width="18" height="18" rx="2" /></svg>, // Calendar with arrow down/check? Let's use Plane/File
  Plane: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 22h20" /><path d="M13 6l-5 5 5 5" /><path d="M18 11l-10-10-5 5L13 16z" /></svg>, // Paper planeish
  Swap: () => <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3 4 7l4 4" /><path d="M4 7h16" /><path d="m16 21 4-4-4-4" /><path d="M20 17H4" /></svg>
};

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

import WeatherCard from "./components/WeatherCard";

export default function CheckIn() {
  // --- State ---
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("Checking...");
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [lastAction, setLastAction] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [employeeData, setEmployeeData] = useState(null);
  const [userPosition, setUserPosition] = useState(null); // { lat, lon }

  // Shift Context
  const [shiftContext, setShiftContext] = useState(null);

  // Interaction State
  const [showCamera, setShowCamera] = useState(false);
  const [showMoodSelector, setShowMoodSelector] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dev Mode State
  const [devMode, setDevMode] = useState(false);
  const fileInputRef = useRef(null);

  // --- Constants ---
  const SHOP_LAT = 17.390110564180162;
  const SHOP_LONG = 104.79292673153263;
  const ALLOWED_RADIUS_KM = 0.05;

  // --- Init ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    let watchId;

    const init = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
        if (!liff.isLoggedIn()) liff.login();
        else {
          const p = await liff.getProfile();
          setProfile(p);
          fetchUserStatus(p.userId);
          fetchMyShift(p.userId);
        }
      } catch (e) { setStatus("LIFF Error"); }

      if (navigator.geolocation) {
        watchId = navigator.geolocation.watchPosition(onGeoSuccess, onGeoError, { enableHighAccuracy: true });
      } else {
        setStatus("GPS Not Supported");
      }

      fetchAnnouncement();
      fetchRecents();
    };
    init();

    return () => {
      clearInterval(timer);
      if (watchId) navigator.geolocation.clearWatch(watchId);
    };
  }, []);

  // --- Fetchers ---
  const fetchAnnouncement = async () => {
    try {
      const res = await fetch('/api/announcements/active');
      const json = await res.json();
      if (json.announcement) setActiveAnnouncement(json.announcement);
    } catch (e) { console.error(e); }
  };

  const fetchRecents = async () => {
    try {
      const res = await fetch('/api/checkins/recent');
      const json = await res.json();
      if (json.recentCheckins) setRecentCheckins(json.recentCheckins);
    } catch (e) { console.error(e); }
  };

  const fetchUserStatus = async (userId) => {
    // Check user existence regardless of active status
    const { data: emp } = await supabase.from('employees').select('id, position, is_active').eq('line_user_id', userId).maybeSingle();

    if (!emp) {
      setStatus("New User");
      setLastAction("register"); // New state for registration
      return;
    }

    if (!emp.is_active) {
      setStatus("Pending Approval");
      setLastAction("pending"); // New state for pending
      return;
    }

    setEmployeeData(emp);

    const { data: log } = await supabase.from('attendance_logs').select('action_type, timestamp').eq('employee_id', emp.id).order('timestamp', { ascending: false }).limit(1).single();

    if (log) {
      const lastDate = new Date(log.timestamp);
      const today = new Date();
      const isToday = isSameDay(lastDate, today);

      if (log.action_type === 'check_in' && !isToday && today.getHours() >= 1) {
        alert("คุณลืมลงชื่อออกเมื่อวาน ระบบจะเริ่มนับวันใหม่ให้");
        setLastAction('check_out'); // UI shows Check In
      } else {
        setLastAction(log.action_type);
      }
    } else {
      setLastAction('check_out');
    }
  };

  const handleRegister = async () => {
    if (!profile) return;
    if (!confirm("Request access to In The Haus system?")) return;

    try {
      const { error } = await supabase.from('employees').insert({
        line_user_id: profile.userId,
        name: profile.displayName,
        nickname: profile.displayName,
        photo_url: profile.pictureUrl,
        is_active: false, // Pending approval
        employment_status: 'Probation' // Default
      });

      if (error) throw error;
      alert("Registration Sent! Please wait for admin approval.");
      fetchUserStatus(profile.userId); // Create loop to check status
    } catch (e) {
      alert("Error: " + e.message);
    }
  };

  // ... (existing code for fetchMyShift) ...

  const handleStartCheckIn = () => {
    if (lastAction === 'register') {
      handleRegister();
      return;
    }
    if (lastAction === 'pending') {
      alert("Your account is pending approval from admin.");
      return;
    }

    if (isUploading || isSubmitting) return;
    if (!devMode && !status.includes("Ready")) return alert("Please be at the location to check in.");
    setShowCamera(true);
    setTimeout(() => fileInputRef.current?.click(), 300);
  };

  // ... (existing code for onGeoSuccess, etc.) ...

  // Dynamic Button Colors and Logic
  let mainButtonConfig = { label: 'Check In', icon: '☀️', sub: 'Start your day', color: "bg-[#171717] text-white border-[#262626]" };

  if (lastAction === 'register') {
    mainButtonConfig = { label: 'Register', icon: '📝', sub: 'Request Access', color: "bg-blue-600 text-white border-blue-500" };
  } else if (lastAction === 'pending') {
    mainButtonConfig = { label: 'Pending', icon: '⏳', sub: 'Waiting Admin', color: "bg-amber-100 text-amber-700 border-amber-200" };
  } else if (lastAction === 'check_in') {
    mainButtonConfig = { label: 'Check Out', icon: '🌙', sub: 'Good rest!', color: "bg-white text-[#171717] border-white" };
  } else if (isLate) {
    mainButtonConfig = { label: 'Check In', icon: '☀️', sub: 'Star your day', color: "bg-amber-400 text-black border-amber-300" };
  }

  return (
    <div className="min-h-screen bg-[#F2F2F2] text-neutral-800 font-sans flex flex-col items-center relative overflow-hidden font-feature-settings-['ss01'] pb-32">

      {/* Background Gradient Blob (Nendo: Soft & Organic) */}
      <div className="absolute top-[-20%] left-[-10%] w-[150%] h-[80%] bg-gradient-to-b from-blue-100/40 via-purple-100/30 to-transparent rounded-[100%] blur-3xl pointer-events-none" />

      {/* 1. Header (Glassmorphism) */}
      <motion.div
        className="w-full px-6 py-4 flex justify-between items-center z-20 sticky top-0 bg-white/60 backdrop-blur-xl border-b border-white/20"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-xl bg-neutral-900 flex items-center justify-center text-white font-bold text-xs shadow-lg">IH</div>
          <span className="text-sm font-semibold tracking-tight text-neutral-800">In the haus</span>
          <button onClick={handleDevLogin} className="opacity-0 hover:opacity-100 transition-opacity text-xs">🛠️</button>
        </div>

        <div className="flex items-center gap-3">
          <Link href="https://forms.gle/3LdW9zdjdTCpfpTe8" target="_blank" className="text-[10px] font-medium text-neutral-400 hover:text-neutral-800 transition-colors mr-1">
            คำขอเบิกเงินล่วงหน้า
          </Link>
          {profile ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-xs font-bold text-neutral-800">{profile.displayName}</span>
                <span
                  onClick={() => {
                    navigator.clipboard.writeText(profile.userId);
                    alert("Copied User ID");
                  }}
                  className="text-[10px] text-neutral-500 font-medium cursor-pointer hover:text-blue-500 transition-colors"
                >
                  {employeeData?.position || (lastAction === 'pending' ? 'Pending' : 'Guest')}
                </span>
              </div>
              <img src={profile.pictureUrl} className="w-10 h-10 rounded-xl object-cover border-2 border-white shadow-sm" />
            </div>
          ) : (
            <button onClick={() => liff.login()} className="px-4 py-2 bg-[#06C755] text-white rounded-full text-xs font-bold shadow-sm">LINE Login</button>
          )}
        </div>
      </motion.div>

      {/* 2. Contextual Info (Next Shift) */}
      <AnimatePresence>
        {shiftContext && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 mx-6 w-full max-w-sm z-10"
          >
            <div className="flex items-center justify-between px-5 py-3 bg-white/60 backdrop-blur-md rounded-2xl border border-white/60 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-xl flex items-center justify-center text-lg", isLate ? "bg-amber-100 text-amber-600" : "bg-blue-50 text-blue-500")}>
                  {isLate ? '⚠️' : '📅'}
                </div>
                <div>
                  <h4 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">
                    {isLate ? "Running Late" : "Current Shift"}
                  </h4>
                  <p className="text-sm font-bold text-neutral-700">
                    {shiftContext.start.slice(0, 5)} - {shiftContext.end.slice(0, 5)}
                  </p>
                </div>
              </div>
              {isLate && (
                <span className="px-2 py-1 bg-amber-100 text-amber-700 text-[10px] font-bold rounded-md border border-amber-200">LATE</span>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>



      {/* 3. Hero Clock */}
      <div className="flex-1 flex flex-col items-center justify-center w-full z-10 -mt-10">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center mb-10"
        >
          {/* Dieter Rams Typography: Big, Tight, Clean */}
          <h2 className="text-[6rem] leading-none font-light tracking-tighter text-neutral-900">
            {format(currentTime, "HH:mm")}
          </h2>
          <p className="text-sm font-medium text-neutral-400 mt-2 tracking-widest uppercase">
            {format(currentTime, "EEEE, dd MMMM")}
          </p>

          <motion.div
            animate={{ scale: status.includes('Ready') ? [1, 1.05, 1] : 1 }}
            transition={{ repeat: Infinity, duration: 2 }}
            className={cn(
              "mt-8 inline-flex items-center gap-2 px-4 py-2 rounded-full text-[10px] font-bold tracking-wide transition-colors border backdrop-blur-sm",
              status.includes('Ready')
                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", status.includes('Ready') ? 'bg-emerald-500' : 'bg-rose-500')}></span>
            {status}
          </motion.div>
        </motion.div>

        {!status.includes('Checking') && (
          <motion.button
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleStartCheckIn}
            className="group relative flex items-center justify-center p-4 transition-all duration-500"
          >
            {/* Squircle Button */}
            <div className={cn(
              "relative z-10 w-48 h-48 rounded-[2.5rem] flex flex-col items-center justify-center transition-all duration-300 border-b-4",
              mainButtonConfig.color
            )}>
              <span className="text-4xl mb-2">{mainButtonConfig.icon}</span>
              <span className="text-xl font-bold tracking-tight">
                {mainButtonConfig.label}
              </span>
              <span className="text-[10px] opacity-60 mt-1 font-medium">
                {mainButtonConfig.sub}
              </span>
            </div>
          </motion.button>
        )}
      </div>

      {/* 4. Recent Checkins (Glass Cards) */}
      <div className="w-full max-w-sm px-6 z-10 mb-8">
        <AnimatePresence>
          {userPosition && (
            <WeatherCard
              latitude={userPosition.lat}
              longitude={userPosition.lon}
              locationName={status.includes('Ready') ? 'In The Haus' : 'Remote'}
            />
          )}
        </AnimatePresence>

        <h3 className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest mb-4 pl-2">Recent Activity</h3>
        <div className="flex flex-col gap-2">
          <AnimatePresence>
            {recentCheckins.slice(0, 3).map((log, i) => (
              <motion.div
                key={log.id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                className="flex items-center justify-between p-3 bg-white/40 backdrop-blur-md rounded-2xl border border-white/40 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <img src={log.employees?.photo_url || log.photo_url} className="w-10 h-10 rounded-full object-cover bg-slate-200 border border-white" />
                  <div>
                    <p className="text-xs font-bold text-neutral-800">{log.employees?.name?.split(' ')[0]}</p>
                    <p className="text-[10px] text-neutral-500 font-medium">{log.action_type === 'check_in' ? 'Checked In' : 'Checked Out'}</p>
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-xs font-bold text-neutral-700 font-mono">{format(new Date(log.timestamp), "HH:mm")}</span>
                  <span className="text-sm">{log.mood_status || ''}</span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* 5. Navigation Dock (The "Haus" Dock) */}
      <NavigationDock />

      {/* 2. Announcement (Z-Index Fix) */}
      <AnimatePresence>
        {activeAnnouncement && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="mx-6 w-full max-w-sm bg-white/80 backdrop-blur-md rounded-3xl p-5 shadow-lg border border-white/50 flex items-start gap-4 z-30 relative"
          >
            <div className={`mt-1.5 w-2 h-2 rounded-full ring-4 ${activeAnnouncement.priority > 1 ? 'bg-red-500 ring-red-100' : 'bg-primary ring-lime-100'}`}></div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Announcement</p>
              <p className="text-sm font-medium text-neutral-800 leading-relaxed">{activeAnnouncement.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Camera & Mood (Modals) */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#F2F2F2] flex flex-col items-center justify-center p-6"
          >
            <div className="absolute top-0 w-full p-6 flex justify-between items-center">
              <h3 className="text-xl font-bold text-neutral-800">Verify Location</h3>
              <button onClick={() => setShowCamera(false)} className="w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-sm">✕</button>
            </div>

            <div className="relative w-full max-w-sm aspect-square bg-white rounded-[2.5rem] border-4 border-white shadow-xl flex items-center justify-center overflow-hidden">
              {isUploading
                ? <div className="animate-spin w-12 h-12 border-4 border-neutral-100 border-t-neutral-800 rounded-full"></div>
                : <span className="text-6xl opacity-10">📸</span>
              }
            </div>

            <p className="mt-8 text-neutral-400 text-center text-sm font-medium">Please take a clear photo of yourself within the shop area.</p>
            <input type="file" accept="image/*" capture="user" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          </motion.div>
        )}

        {showMoodSelector && (
          <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center justify-end pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/20 backdrop-blur-sm pointer-events-auto"
              onClick={() => setShowMoodSelector(false)}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full bg-[#FAFAFA] rounded-t-[2.5rem] p-8 pb-12 shadow-2xl pointer-events-auto relative"
            >
              <div className="w-12 h-1 bg-neutral-200 rounded-full mx-auto mb-8"></div>
              <h3 className="text-xl font-bold text-neutral-800 text-center mb-8">How are you feeling?</h3>
              <div className="flex justify-center gap-4 flex-wrap">
                {['🔥', '😊', '😐', '😴', '🤒'].map((m) => (
                  <motion.button
                    key={m}
                    whileHover={{ scale: 1.2, rotate: 10 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleMoodSelect(m)}
                    className="w-16 h-16 text-3xl flex items-center justify-center rounded-2xl bg-white hover:bg-neutral-900 hover:text-white shadow-sm border border-neutral-100 transition-all font-emoji"
                  >
                    {m}
                  </motion.button>
                ))}
              </div>
              <button
                onClick={() => setShowMoodSelector(false)}
                className="w-full mt-8 text-neutral-400 text-xs font-bold tracking-widest uppercase hover:text-neutral-800 transition-colors"
              >
                Skip This
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}