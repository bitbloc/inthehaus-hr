"use client";
import { useEffect, useState, useRef } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { resizeImage } from "../../utils/imageResizer";
import { format } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

export default function CheckIn() {
  // --- State ---
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("Checking...");
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [lastAction, setLastAction] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Interaction State
  const [showCamera, setShowCamera] = useState(false);
  const [showMoodSelector, setShowMoodSelector] = useState(false);
  const [photoUrl, setPhotoUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Dev Mode State
  const [devMode, setDevMode] = useState(false);
  const [showDevLogin, setShowDevLogin] = useState(false);

  const fileInputRef = useRef(null);

  // --- Constants ---
  const SHOP_LAT = 17.390110564180162;
  const SHOP_LONG = 104.79292673153263;
  const ALLOWED_RADIUS_KM = 0.05;

  // --- Init ---
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    const init = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
        if (!liff.isLoggedIn()) liff.login();
        else {
          const p = await liff.getProfile();
          setProfile(p);
          fetchUserStatus(p.userId);
        }
      } catch (e) { setStatus("LIFF Error"); }

      if (navigator.geolocation) navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError);
      else setStatus("GPS Not Supported");

      fetchAnnouncement();
      fetchRecents();
    };
    init();
    return () => clearInterval(timer);
  }, []);

  // --- Fetchers & Helpers ---
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
    const { data: emp } = await supabase.from('employees').select('id').eq('line_user_id', userId).single();
    if (!emp) return;
    const { data: log } = await supabase.from('attendance_logs').select('action_type').eq('employee_id', emp.id).order('timestamp', { ascending: false }).limit(1).single();
    setLastAction(log ? log.action_type : 'check_out');
  };

  // --- Dev Mode Logic ---
  const handleDevLogin = () => {
    const user = prompt("Username:");
    const pass = prompt("Password:");
    if (user === "yuzu" && pass === "1533") {
      setDevMode(true);
      setStatus("❤️ Developer Mode");
      alert("Developer Mode Active: GPS Bypassed");
    } else {
      alert("Invalid credentials");
    }
  };

  // --- GPS ---
  const onGeoSuccess = (position) => {
    const dist = getDistanceFromLatLonInKm(position.coords.latitude, position.coords.longitude, SHOP_LAT, SHOP_LONG);
    if (dist <= ALLOWED_RADIUS_KM) setStatus("📍 Ready");
    else setStatus(`❌ Range (${dist.toFixed(3)}km)`);
  };
  const onGeoError = () => setStatus("❌ GPS Error");

  // --- Actions ---
  const handleStartCheckIn = () => {
    if (!devMode && !status.includes("Ready")) return alert("Please be at the location to check in.");
    setShowCamera(true);
    setTimeout(() => fileInputRef.current?.click(), 300);
  };

  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) { setShowCamera(false); return; }
    try {
      setIsUploading(true);
      const resizedFile = await resizeImage(file, 600, 0.7);
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`;
      const filePath = `daily-checkin/${fileName}`;
      const { error } = await supabase.storage.from('checkin-photos').upload(filePath, resizedFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('checkin-photos').getPublicUrl(filePath);
      submitCheckIn(publicUrl);
    } catch (err) { alert("Upload Failed: " + err.message); setShowCamera(false); }
    finally { setIsUploading(false); }
  };

  const submitCheckIn = async (url) => {
    if (!profile) return;
    setIsSubmitting(true);
    const actionType = lastAction === 'check_in' ? 'check_out' : 'check_in';

    try {
      const { data: emp } = await supabase.from('employees').select('id, name, position').eq('line_user_id', profile.userId).single();
      if (!emp) throw new Error("Employee not found");

      const tempLog = {
        id: 'temp-' + Date.now(),
        timestamp: new Date().toISOString(),
        action_type: actionType,
        employees: { name: emp.name, photo_url: profile.pictureUrl, position: emp.position },
        photo_url: url,
        mood_status: null
      };

      const pos = emp.position?.toLowerCase() || '';
      if (!pos.includes('owner') && !pos.includes('develop')) {
        setRecentCheckins(prev => [tempLog, ...prev]);
      }

      const { data: inserted, error } = await supabase.from('attendance_logs').insert({
        employee_id: emp.id,
        action_type: actionType,
        photo_url: url
      }).select().single();

      if (error) throw error;

      setLastAction(actionType);
      setShowCamera(false);
      setShowMoodSelector(true);
      notifyLine(emp, actionType, url, null);

    } catch (err) {
      alert(err.message);
      fetchRecents();
      setShowCamera(false);
    } finally { setIsSubmitting(false); }
  };

  const handleMoodSelect = async (mood) => {
    setShowMoodSelector(false);
    setRecentCheckins(prev => {
      const newArr = [...prev];
      if (newArr.length > 0 && newArr[0].employees.name === profile.displayName) {
        newArr[0].mood_status = mood;
      }
      return newArr;
    });

    const { data: emp } = await supabase.from('employees').select('id').eq('line_user_id', profile.userId).single();
    if (emp) {
      const { data: log } = await supabase.from('attendance_logs').select('id').eq('employee_id', emp.id).order('timestamp', { ascending: false }).limit(1).single();
      if (log) {
        await supabase.from('attendance_logs').update({ mood_status: mood }).eq('id', log.id);
      }
    }
  };

  const notifyLine = async (emp, action, url, mood) => {
    try { fetch('/api/notify-realtime', { method: 'POST', body: JSON.stringify({ name: emp.name, position: emp.position, action, time: format(new Date(), "HH:mm"), locationStatus: "Verified", photoUrl: url, mood }) }); } catch { }
  };

  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; var dLat = (lat2 - lat1) * (Math.PI / 180); var dLon = (lon2 - lon1) * (Math.PI / 180);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans flex flex-col items-center relative overflow-hidden font-feature-settings-['ss01']">

      {/* 1. Header with Dev Icon */}
      <motion.div
        className="w-full p-6 flex justify-between items-center z-10"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight text-foreground">In the haus</h1>
          {/* Dev Bypass Trigger */}
          <button onClick={handleDevLogin} className="opacity-20 hover:opacity-100 transition-opacity">
            ❤️
          </button>
        </div>
        {profile && <img src={profile.pictureUrl} className="w-10 h-10 rounded-full border border-slate-200 shadow-sm" />}
      </motion.div>

      {/* 2. Announcement */}
      <AnimatePresence>
        {activeAnnouncement && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="mx-6 w-full max-w-sm bg-card/80 backdrop-blur-md rounded-3xl p-5 soft-shadow border border-white/50 flex items-start gap-4 z-10"
          >
            <div className={`mt-1.5 w-2 h-2 rounded-full ring-4 ${activeAnnouncement.priority > 1 ? 'bg-red-500 ring-red-100' : 'bg-primary ring-lime-100'}`}></div>
            <div>
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5">Announcement</p>
              <p className="text-sm font-medium text-foreground leading-relaxed">{activeAnnouncement.message}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. Hero */}
      <div className="flex-1 flex flex-col items-center justify-center w-full z-10 pb-20">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center mb-12"
        >
          <h2 className="text-8xl font-light tracking-tighter text-foreground">{format(currentTime, "HH:mm")}</h2>
          <p className="text-base font-medium text-muted-foreground mt-2">{format(currentTime, "EEEE, dd MMMM")}</p>
          <motion.div
            animate={{ scale: status.includes('Ready') ? [1, 1.05, 1] : 1 }}
            transition={{ repeat: Infinity, duration: 2 }}
            className={cn("mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-bold tracking-wide transition-colors", status.includes('Ready') ? 'bg-lime-100 text-lime-700' : 'bg-rose-50 text-rose-500')}
          >
            <span className={cn("w-2 h-2 rounded-full", status.includes('Ready') ? 'bg-primary' : 'bg-rose-500')}></span>
            {status}
          </motion.div>
        </motion.div>

        {!status.includes('Checking') && (
          <motion.button
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleStartCheckIn}
            className={cn(
              "w-48 h-48 rounded-[3rem] flex flex-col items-center justify-center soft-shadow-lg group relative border transition-all duration-300",
              lastAction !== 'check_in' ? 'bg-card border-white text-lime-700 hover:scale-105' : 'bg-card border-white text-rose-500 hover:scale-105'
            )}
          >
            <motion.div
              className={cn("absolute inset-0 rounded-[3rem] opacity-0 group-hover:opacity-100 transition-opacity duration-500", lastAction !== 'check_in' ? 'bg-lime-50/50' : 'bg-rose-50/50')}
            />

            {/* Icon */}
            <div className="mb-3 relative z-10">
              {lastAction !== 'check_in' ? (
                // Office / Entrance Icon
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16">
                  <path d="M3 21h18" /><path d="M5 21V7l8-4 8 4v14" /><path d="M12 11v4" />
                </svg>
              ) : (
                // Home / Exit Icon
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-16 h-16">
                  <path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /><polyline points="9 22 9 12 15 12 15 22" />
                </svg>
              )}
            </div>

            {/* Thai Text */}
            <span className="text-2xl font-bold tracking-tight relative z-10 font-sans">
              {lastAction !== 'check_in' ? 'เข้างาน' : 'ออกงาน'}
            </span>
          </motion.button>
        )}
      </div>

      {/* 4. Floating Capsules */}
      <div className="w-full absolute bottom-12 z-0 pointer-events-none">
        <div className="absolute inset-0 bg-gradient-to-t from-background via-background/90 to-transparent h-32 -top-32 z-10"></div>

        <div className="flex gap-4 px-8 min-w-max relative z-0 opacity-80">
          <AnimatePresence>
            {recentCheckins.map((log, i) => (
              <motion.div
                key={log.id}
                layout
                initial={{ opacity: 0, x: -20, scale: 0.8 }}
                animate={{
                  opacity: 1, x: 0, scale: 1,
                  y: [0, -5, 0],
                  transition: { y: { repeat: Infinity, duration: 4, delay: i * 0.2, ease: "easeInOut" } }
                }}
                className="flex items-center gap-3 bg-white/80 backdrop-blur-sm border border-white/50 rounded-full pl-1.5 pr-5 py-1.5 soft-shadow"
              >
                <img src={log.employees?.photo_url || log.photo_url} className="w-9 h-9 rounded-full object-cover bg-slate-50 border border-slate-100" />
                <div className="flex flex-col">
                  <span className="text-[11px] font-bold text-foreground">{log.employees?.name?.split(' ')[0]}</span>
                  <span className="text-[10px] text-muted-foreground font-medium">{format(new Date(log.timestamp), "HH:mm")} <span className="ml-1">{log.mood_status}</span></span>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>

      {/* 5. Camera */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#FAFAFA] flex flex-col items-center justify-center p-8"
          >
            <div className="text-center mb-8">
              <h3 className="text-2xl font-bold text-[#27272A] mb-2">Smile! 📸</h3>
              <p className="text-slate-400">Taking a photo to verify location</p>
            </div>

            <div className="relative w-64 h-64 bg-white rounded-[2rem] border border-slate-100 shadow-[0_20px_40px_rgba(0,0,0,0.05)] flex items-center justify-center overflow-hidden">
              {isUploading
                ? <div className="animate-spin w-8 h-8 border-4 border-slate-100 border-t-[#10B981] rounded-full"></div>
                : <span className="text-6xl grayscale opacity-20">📷</span>
              }
            </div>

            <button onClick={() => setShowCamera(false)} className="mt-12 text-slate-400 text-sm font-bold tracking-wide hover:text-[#27272A] transition-colors">CANCEL</button>
            <input type="file" accept="image/*" capture="user" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          </motion.div>
        )}
      </AnimatePresence>

      {/* 6. Post-Checkin Mood */}
      <AnimatePresence>
        {showMoodSelector && (
          <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center justify-end pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/5 pointer-events-auto"
              onClick={() => setShowMoodSelector(false)}
            />

            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full bg-white rounded-t-[2.5rem] p-8 pb-12 shadow-[0_-20px_60px_rgba(0,0,0,0.1)] pointer-events-auto relative"
            >
              <div className="w-12 h-1 bg-muted rounded-full mx-auto mb-8"></div>
              <h3 className="text-xl font-bold text-foreground text-center mb-8">How are you feeling?</h3>
              <div className="flex justify-center gap-4 flex-wrap">
                {['🔥', '😊', '😐', '😴', '🤒'].map((m) => (
                  <motion.button
                    key={m}
                    whileHover={{ scale: 1.2, rotate: 10 }}
                    whileTap={{ scale: 0.9 }}
                    onClick={() => handleMoodSelect(m)}
                    className="w-16 h-16 text-3xl flex items-center justify-center rounded-2xl bg-muted hover:bg-primary hover:text-black soft-shadow transition-colors"
                  >
                    {m}
                  </motion.button>
                ))}
              </div>
              <button onClick={() => setShowMoodSelector(false)} className="w-full mt-8 text-slate-300 text-xs font-bold tracking-widest uppercase hover:text-slate-500">Skip</button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}