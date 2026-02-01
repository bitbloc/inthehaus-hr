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
// --- Icons (Simulated Lucide for cleaner look) ---
// Removed unused Icons object

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
  const [currentTime, setCurrentTime] = useState(null);
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
    setCurrentTime(new Date()); // Init on client
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

    const { data: log } = await supabase.from('attendance_logs').select('action_type, timestamp').eq('employee_id', emp.id).order('timestamp', { ascending: false }).limit(1).maybeSingle();

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

  const fetchMyShift = async (userId) => {
    try {
      const { data: emp } = await supabase.from('employees').select('id').eq('line_user_id', userId).maybeSingle();
      if (!emp) return;

      const today = new Date();
      const dateStr = format(today, 'yyyy-MM-dd');
      const dayOfWeek = today.getDay(); // 0 is Sunday, which matches our schedule logic usually (or 1=Mon?)
      // Let's assume 0=Sunday, 1=Monday. roster_weekly_schedules usually uses 0-6.

      // 2. Check Overrides
      const { data: override } = await supabase.from('roster_overrides')
        .select('*')
        .eq('employee_id', emp.id)
        .eq('date', dateStr)
        .maybeSingle();

      if (override) {
        if (override.is_off) {
          setShiftContext(null);
          return;
        }

        // Fetch shift name just in case
        // const { data: shift } = await supabase.from('shifts').select('name').eq('id', override.shift_id).single();

        setShiftContext({
          start: override.custom_start_time,
          end: override.custom_end_time,
          getType: 'Override',
          isLate: checkIsLate(override.custom_start_time)
        });
        return;
      }

      // 3. Check Weekly Schedule
      const { data: weekly } = await supabase.from('roster_weekly_schedules')
        .select('shift_id, is_off')
        .eq('employee_id', emp.id)
        .eq('day_of_week', dayOfWeek === 0 ? 6 : dayOfWeek - 1) // Adjust if DB uses 0=Mon. Standard JS 0=Sun. 
        // NOTE: Usually projects stick to JS or SQL. Postgres ISODOW 1-7 (1=Mon). 
        // Let's assume 0=Monday for now based on TeamSchedule `startOfWeek(today, { weekStartsOn: 1 })`.
        // `weekDays` in TeamSchedule are 0..6 indices from Monday.
        // So JS Day 1 (Mon) -> DB 0. JS Day 0 (Sun) -> DB 6.
        .maybeSingle();

      // Correction: TeamSchedule:
      // const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfCurrentWeek, i));
      // keys off map index.
      // let's try direct map:
      // If DB `day_of_week` is 0=Mon, 1=Tue...
      // JS `getDay()`: 0=Sun, 1=Mon...
      // MAPPING: (dayOfWeek + 6) % 7 
      // Mon(1) -> 0. Sun(0) -> 6.

      const dayIndex = (dayOfWeek + 6) % 7;

      const { data: weeklySchedule } = await supabase.from('roster_weekly_schedules')
        .select('shift_id, is_off')
        .eq('employee_id', emp.id)
        .eq('day_of_week', dayIndex)
        .maybeSingle();

      if (weeklySchedule && !weeklySchedule.is_off && weeklySchedule.shift_id) {
        const { data: shift } = await supabase.from('shifts').select('*').eq('id', weeklySchedule.shift_id).maybeSingle();
        if (shift) {
          setShiftContext({
            start: shift.start_time,
            end: shift.end_time,
            getType: 'Template',
            isLate: checkIsLate(shift.start_time)
          });
        }
      } else {
        setShiftContext(null);
      }
    } catch (e) {
      console.error("Shift Fetch Error:", e);
    }
  };

  const checkIsLate = (startTime) => {
    const now = new Date();
    const [h, m] = startTime.split(':').map(Number);
    const shiftStart = new Date();
    shiftStart.setHours(h, m, 0, 0);
    return now > shiftStart;
  };

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
    // Removed auto-click to fix mobile browser security blocking
  };

  const onGeoSuccess = (position) => {
    const { latitude, longitude } = position.coords;
    setUserPosition({ lat: latitude, lon: longitude });

    const dist = getDistanceFromLatLonInKm(latitude, longitude, SHOP_LAT, SHOP_LONG);
    if (dist <= ALLOWED_RADIUS_KM) {
      if (!status.includes("Ready")) setStatus("Ready to Check In");
    } else {
      if (!devMode) setStatus(`Too far (${dist.toFixed(2)}km)`);
    }
  };

  const onGeoError = (error) => {
    console.error("Geo Error:", error);
    // if(!devMode) setStatus("GPS Error");
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      const resized = await resizeImage(file, 800);
      const fileName = `${profile.userId}_${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage.from('checkin-photos').upload(fileName, resized);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('checkin-photos').getPublicUrl(fileName);

      const action = lastAction === 'check_in' ? 'check_out' : 'check_in';

      const { error: insertError } = await supabase.from('attendance_logs').insert({
        employee_id: employeeData.id,
        action_type: action,
        timestamp: new Date().toISOString(),
        photo_url: publicUrl,
        location: userPosition ? `(${userPosition.lon},${userPosition.lat})` : null
      });

      if (insertError) throw insertError;

      setShowCamera(false);
      fetchRecents();
      fetchUserStatus(profile.userId);

      if (action === 'check_in') {
        setShowMoodSelector(true);
      } else {
        alert("Checked Out!");
      }
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleMoodSelect = async (mood) => {
    try {
      const { data: latestLog } = await supabase.from('attendance_logs')
        .select('id')
        .eq('employee_id', employeeData.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (latestLog) {
        await supabase.from('attendance_logs').update({ mood_status: mood }).eq('id', latestLog.id);
        fetchRecents();
      }
    } catch (e) { console.error(e); }
    setShowMoodSelector(false);
  };

  const handleDevLogin = () => {
    // Toggle dev mode
    const pwd = prompt("Dev Password");
    if (pwd === "1533") {
      setDevMode(!devMode);
      setStatus("Ready (Dev)");
      // alert("Dev Mode: " + (!devMode));
    }
  };

  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371;
    var dLat = deg2rad(lat2 - lat1);
    var dLon = deg2rad(lon2 - lon1);
    var a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) *
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }

  function deg2rad(deg) {
    return deg * (Math.PI / 180);
  }

  // Dynamic Button Colors and Logic
  const isLate = shiftContext?.isLate && lastAction !== 'check_in';
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
          <button onClick={handleDevLogin} className="text-neutral-300 hover:text-neutral-900 transition-colors text-xs">🛠️</button>
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
            {currentTime ? format(currentTime, "HH:mm") : "--:--"}
          </h2>
          <p className="text-sm font-medium text-neutral-400 mt-2 tracking-widest uppercase">
            {currentTime ? format(currentTime, "EEEE, dd MMMM") : "Loading..."}
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

        {/* Moved Announcement Card */}
        <AnimatePresence>
          {activeAnnouncement && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="mb-8 mx-6 w-full max-w-sm bg-white/80 backdrop-blur-md rounded-3xl p-5 shadow-lg border border-white/50 flex items-start gap-4 z-30 relative"
            >
              <div className={`mt-1.5 w-2 h-2 rounded-full ring-4 ${activeAnnouncement.priority > 1 ? 'bg-red-500 ring-red-100' : 'bg-primary ring-lime-100'}`}></div>
              <div>
                <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Announcement</p>
                <p className="text-sm font-medium text-neutral-800 leading-relaxed">{activeAnnouncement.message}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

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

            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-full max-w-sm aspect-square bg-white rounded-[2.5rem] border-4 border-white shadow-xl flex flex-col items-center justify-center overflow-hidden active:scale-95 transition-transform cursor-pointer"
            >
              {isUploading
                ? <div className="animate-spin w-12 h-12 border-4 border-neutral-100 border-t-neutral-800 rounded-full"></div>
                : <>
                  <span className="text-6xl mb-4">📸</span>
                  <span className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Tap to Take Photo</span>
                </>
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