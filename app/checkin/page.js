"use client";
import { useEffect, useState, useRef } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { resizeImage } from "../../utils/imageResizer";
import Link from "next/link";
import { format, isSameDay, startOfWeek, addDays } from "date-fns";
import { th } from "date-fns/locale";
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
  const [announcements, setAnnouncements] = useState([]);
  const [approvedLeaves, setApprovedLeaves] = useState([]);
  const [myPendingLeaves, setMyPendingLeaves] = useState([]);
  const [weeklySchedule, setWeeklySchedule] = useState([]);
  const [selectedDaySchedule, setSelectedDaySchedule] = useState(null);
  const [dismissedIds, setDismissedIds] = useState([]);
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
  const [showWrapUp, setShowWrapUp] = useState(false);
  const [wrapUpData, setWrapUpData] = useState(null);
  const [lastCheckInTime, setLastCheckInTime] = useState(null);

  // Dev Mode State
  const [devMode, setDevMode] = useState(false);
  const fileInputRef = useRef(null);

  // --- Constants ---
  const SHOP_LAT = 17.39009845004315;
  const SHOP_LONG = 104.7929558480443;
  const ALLOWED_RADIUS_KM = 0.05;

  // Load Acknowledged Announcements
  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("acknowledged_announcements");
      if (saved) setDismissedIds(JSON.parse(saved));
    }
  }, []);

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
      if (json.announcements) setAnnouncements(json.announcements);
      if (json.announcement) setActiveAnnouncement(json.announcement);
    } catch (e) { console.error(e); }
  };

  const handleDismissAnnouncement = (id) => {
    const updated = [...dismissedIds, id];
    setDismissedIds(updated);
    localStorage.setItem("acknowledged_announcements", JSON.stringify(updated));
  };

  const fetchDashboardData = async (empId) => {
    try {
      const todayStr = format(new Date(), 'yyyy-MM-dd');
      
      // 1. Fetch Approved Leaves (Today and Upcoming)
      const { data: leaves } = await supabase
        .from('leave_requests')
        .select('id, leave_date, leave_type, reason, employees!employee_id(name, nickname, photo_url)')
        .eq('status', 'approved')
        .gte('leave_date', todayStr)
        .order('leave_date', { ascending: true })
        .limit(5);
      setApprovedLeaves(leaves || []);

      // 2. Fetch My Pending Leaves
      const { data: myPending } = await supabase
        .from('leave_requests')
        .select('leave_date, leave_type, status')
        .eq('employee_id', empId)
        .eq('status', 'pending')
        .order('leave_date', { ascending: true });
      setMyPendingLeaves(myPending || []);

      // 3. Fetch Weekly Schedule Data
      const mon = startOfWeek(new Date(), { weekStartsOn: 1 });
      const sun = addDays(mon, 6);
      const monStr = format(mon, 'yyyy-MM-dd');
      const sunStr = format(sun, 'yyyy-MM-dd');

      // Fetch transactions (both draft and published)
      const { data: txs } = await supabase
        .from('roster_transactions')
        .select('date, shift_id, is_off, custom_start_time, custom_end_time, shifts(*)')
        .eq('employee_id', empId)
        .gte('date', monStr)
        .lte('date', sunStr);

      // Fetch overrides
      const { data: overrides } = await supabase
        .from('roster_overrides')
        .select('date, shift_id, is_off, custom_start_time, custom_end_time')
        .eq('employee_id', empId)
        .gte('date', monStr)
        .lte('date', sunStr);

      // Fetch templates
      const { data: templates } = await supabase
        .from('employee_schedules')
        .select('day_of_week, is_off, shift_id, shifts(*)')
        .eq('employee_id', empId);

      // Fetch leaves for this week to show in weekly schedule
      const { data: weekLeaves } = await supabase
        .from('leave_requests')
        .select('leave_date, leave_type, status')
        .eq('employee_id', empId)
        .eq('status', 'approved')
        .gte('leave_date', monStr)
        .lte('leave_date', sunStr);

      // Map template schedules
      const templateMap = {};
      templates?.forEach(t => {
        templateMap[t.day_of_week] = t;
      });

      // Map week leaves
      const leaveMap = new Map();
      weekLeaves?.forEach(l => {
        leaveMap.set(l.leave_date, l);
      });

      // Fetch all shifts
      const { data: allShifts } = await supabase.from('shifts').select('*');

      // Compute weekly roster
      const calculatedWeekly = [];
      for (let i = 0; i < 7; i++) {
        const day = addDays(mon, i);
        const dateStr = format(day, 'yyyy-MM-dd');
        const dayOfWeekIndex = (day.getDay() + 6) % 7; // 0 = Mon, 6 = Sun

        let shiftName = '';
        let shiftTime = '';
        let isOff = false;
        let isLeave = leaveMap.has(dateStr);
        let leaveType = leaveMap.get(dateStr)?.leave_type || '';

        const tx = txs?.find(t => t.date === dateStr);
        const ov = overrides?.find(o => o.date === dateStr);
        const tmpl = templateMap[dayOfWeekIndex];

        if (tx) {
          if (tx.is_off) {
            isOff = true;
          } else {
            const sDef = tx.shifts || allShifts?.find(s => s.id === tx.shift_id);
            shiftName = sDef ? sDef.name : 'กะงาน';
            shiftTime = `${(tx.custom_start_time || sDef?.start_time || '').slice(0, 5)}-${(tx.custom_end_time || sDef?.end_time || '').slice(0, 5)}`;
          }
        } else if (ov) {
          if (ov.is_off) {
            isOff = true;
          } else {
            const sDef = allShifts?.find(s => s.id === ov.shift_id);
            shiftName = sDef ? sDef.name + ' (Sub)' : 'กะพิเศษ';
            shiftTime = `${(ov.custom_start_time || sDef?.start_time || '').slice(0, 5)}-${(ov.custom_end_time || sDef?.end_time || '').slice(0, 5)}`;
          }
        } else if (tmpl) {
          if (tmpl.is_off || !tmpl.shift_id) {
            isOff = true;
          } else {
            const sDef = tmpl.shifts || allShifts?.find(s => s.id === tmpl.shift_id);
            shiftName = sDef ? sDef.name : 'กะงาน';
            shiftTime = `${(sDef?.start_time || '').slice(0, 5)}-${(sDef?.end_time || '').slice(0, 5)}`;
          }
        } else {
          isOff = true;
        }

        calculatedWeekly.push({
          date: day,
          dateStr,
          dayName: format(day, 'EEE'),
          dateNum: format(day, 'd'),
          isToday: isSameDay(day, new Date()),
          isOff: isOff && !isLeave,
          isLeave,
          leaveType,
          shiftName,
          shiftTime
        });
      }
      setWeeklySchedule(calculatedWeekly);
      const todaySched = calculatedWeekly.find(day => day.isToday);
      if (todaySched) {
        setSelectedDaySchedule(todaySched);
      } else if (calculatedWeekly.length > 0) {
        setSelectedDaySchedule(calculatedWeekly[0]);
      }

    } catch (e) {
      console.error("Error fetching dashboard data:", e);
    }
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
    fetchDashboardData(emp.id);

    const { data: log } = await supabase.from('attendance_logs').select('action_type, timestamp').eq('employee_id', emp.id).order('timestamp', { ascending: false }).limit(1).maybeSingle();

    if (log) {
      const lastDate = new Date(log.timestamp);
      const today = new Date();
      const isToday = isSameDay(lastDate, today);

      if (log.action_type === 'check_in') {
        setLastCheckInTime(lastDate);
      } else {
        setLastCheckInTime(null);
      }

      if (log.action_type === 'check_in' && !isToday && today.getHours() >= 2) {
        alert("คุณลืมลงชื่อออกเมื่อวาน ระบบจะเริ่มนับวันใหม่ให้");
        setLastAction('check_out'); // UI shows Check In
      } else {
        setLastAction(log.action_type);
      }
    } else {
      setLastAction('check_out');
      setLastCheckInTime(null);
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

      // 1. Check Roster Transactions (highest priority, including DRAFT/PUBLISHED)
      const { data: tx } = await supabase.from('roster_transactions')
        .select('*, shifts(*)')
        .eq('employee_id', emp.id)
        .eq('date', dateStr)
        .maybeSingle();

      if (tx) {
        if (tx.is_off) {
          setShiftContext(null);
          return;
        }

        const sDef = tx.shifts;
        const startVal = tx.custom_start_time || sDef?.start_time;
        const endVal = tx.custom_end_time || sDef?.end_time;

        if (startVal && endVal) {
          setShiftContext({
            start: startVal,
            end: endVal,
            getType: 'Roster',
            isLate: checkIsLate(startVal)
          });
          return;
        }
      }

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
      const { data: weekly } = await supabase.from('employee_schedules')
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

      const { data: weeklySchedule } = await supabase.from('employee_schedules')
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
      const resized = await resizeImage(file, 600); // Optimized for speed
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
      
      // Calculate Wrap Up Data if checking out
      if (action === 'check_out' && lastCheckInTime) {
        const diffMs = new Date() - lastCheckInTime;
        const durationHours = Math.floor(diffMs / (1000 * 60 * 60));
        const durationMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        setWrapUpData({ hours: durationHours, minutes: durationMinutes });
      } else {
        setWrapUpData(null);
      }

      fetchUserStatus(profile.userId);

      setShowMoodSelector(true); // Ask for mood on both check-in and check-out
    } catch (err) {
      alert("Error: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleMoodSelect = async (mood) => {
    try {
      const { data: latestLog } = await supabase.from('attendance_logs')
        .select('id, action_type')
        .eq('employee_id', employeeData.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (latestLog) {
        await supabase.from('attendance_logs').update({ mood_status: mood }).eq('id', latestLog.id);
        fetchRecents();
        
        if (latestLog.action_type === 'check_out') {
           setWrapUpData(prev => ({ ...prev, mood }));
        }
      }
    } catch (e) { console.error(e); }
    setShowMoodSelector(false);
    
    // Check if it was a checkout, show wrap up
    if (wrapUpData) {
      setShowWrapUp(true);
    }
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
        className="w-full px-6 py-4 flex justify-between items-center z-20 sticky top-0 bg-white/60 backdrop-blur-xl border-b border-white/20 relative"
        initial={{ y: -20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="flex items-center z-10">
          <button onClick={handleDevLogin} className="text-neutral-300 hover:text-neutral-900 transition-colors text-xs">🛠️</button>
        </div>

        {/* Center: Logo */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10 pointer-events-none">
           <img src="/logo.png" alt="In The Haus" className="h-10 object-contain drop-shadow-sm" />
        </div>

        <div className="flex items-center gap-3 z-10">
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



      {/* 3. Hero Clock & Main Action */}
      <div className="flex-1 flex flex-col items-center justify-start w-full z-10 mt-4">
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="text-center mb-6 w-full max-w-sm px-6"
        >
          {/* Dieter Rams Typography: Big, Tight, Clean */}
          <h2 className="text-[5.5rem] leading-none font-light tracking-tighter text-neutral-900 font-bold">
            {currentTime ? format(currentTime, "HH:mm") : "--:--"}
          </h2>
          <p className="text-xs font-semibold text-neutral-450 mt-1 tracking-widest uppercase">
            {currentTime ? format(currentTime, "EEEEที่ d MMMM yyyy", { locale: th }) : "Loading..."}
          </p>

          <motion.div
            animate={{ scale: status.includes('Ready') ? [1, 1.03, 1] : 1 }}
            transition={{ repeat: Infinity, duration: 2 }}
            className={cn(
              "mt-4 inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[10px] font-bold tracking-wide transition-colors border backdrop-blur-sm",
              status.includes('Ready')
                ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                : 'bg-rose-500/10 text-rose-500 border-rose-500/20'
            )}
          >
            <span className={cn("w-1.5 h-1.5 rounded-full animate-pulse", status.includes('Ready') ? 'bg-emerald-500' : 'bg-rose-500')}></span>
            {status}
          </motion.div>
          
          {/* Gamification: Early Bird Badge */}
          {lastAction !== 'check_in' && shiftContext && !isLate && (
            <div className="mt-3 flex justify-center">
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-3.5 py-1.5 bg-gradient-to-r from-orange-100 to-amber-100 text-amber-700 rounded-full text-[10px] font-bold flex items-center gap-1.5 shadow-sm border border-amber-200"
              >
                🔥 มาเช้าจัง เยี่ยมไปเลย!
              </motion.div>
            </div>
          )}
        </motion.div>

        {/* Check-In / Check-Out Button (moved here, directly under GPS status) */}
        {!status.includes('Checking') && (
          <motion.button
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleStartCheckIn}
            className="w-full max-w-sm px-6 mb-6 z-30 transition-all duration-300"
          >
            <div className={cn(
              "w-full py-4 rounded-[2rem] flex flex-col items-center justify-center transition-all duration-300 border-b-4 shadow-sm",
              mainButtonConfig.color
            )}>
              <span className="text-3xl mb-1">{mainButtonConfig.icon}</span>
              <span className="text-lg font-black tracking-tight">
                {mainButtonConfig.label}
              </span>
              <span className="text-[9px] opacity-70 mt-0.5 font-bold uppercase tracking-wider">
                {mainButtonConfig.sub}
              </span>
            </div>
          </motion.button>
        )}

        {/* Daily Bulletin & Dashboard */}
        {(() => {
          const allAnnouncements = announcements.length > 0 ? announcements : (activeAnnouncement ? [activeAnnouncement] : []);
          const fixedAnnouncements = allAnnouncements.filter(a => a.expires_at === null);
          const temporaryAnnouncements = allAnnouncements.filter(a => a.expires_at !== null && !dismissedIds.includes(a.id));

          return (
            <div className="w-full max-w-sm px-6 mb-6 z-30 flex flex-col gap-4">
              {/* Fixed Announcements */}
              <AnimatePresence>
                {fixedAnnouncements.map((a) => (
                  <motion.div
                    key={`fixed-${a.id}`}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full bg-white/80 backdrop-blur-md rounded-3xl p-4 shadow-sm border border-white/60 flex items-start gap-3.5 relative overflow-hidden"
                  >
                    <div className="absolute top-0 left-0 w-1 h-full bg-blue-500" />
                    <div className="text-lg shrink-0 mt-0.5 select-none">📌</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-[9px] font-extrabold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100 uppercase tracking-widest">Pinned</span>
                        {a.priority > 1 && (
                          <span className="text-[9px] font-extrabold text-red-655 bg-red-50 px-2 py-0.5 rounded-md border border-red-100 uppercase tracking-widest animate-pulse">Urgent</span>
                        )}
                      </div>
                      <p className="text-xs font-bold text-neutral-800 leading-relaxed break-words">{a.message}</p>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>

              {/* Temporary Announcements */}
              <AnimatePresence>
                {temporaryAnnouncements.map((a) => {
                  let expLabel = '';
                  if (a.expires_at) {
                    const diffMs = new Date(a.expires_at) - new Date();
                    if (diffMs > 0) {
                      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                      if (diffHrs > 0) {
                        expLabel = `หมดเวลาใน ${diffHrs} ชม.`;
                      } else {
                        expLabel = `หมดเวลาใน ${diffMins} นาที`;
                      }
                    } else {
                      expLabel = 'หมดเวลาแล้ว';
                    }
                  }
                  const isUrgent = a.priority > 1;
                  const accentColor = isUrgent ? 'bg-orange-500' : 'bg-amber-500';
                  const cardBg = isUrgent 
                    ? 'bg-gradient-to-br from-orange-50/90 to-white/90 border-orange-200/50 shadow-orange-100/10'
                    : 'bg-white/80 border-white/60';

                  return (
                    <motion.div
                      key={`temp-${a.id}`}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0, padding: 0 }}
                      className={`w-full ${cardBg} backdrop-blur-md rounded-3xl p-4 shadow-sm border flex items-start gap-3.5 relative overflow-hidden transition-all duration-200`}
                    >
                      <div className={`absolute top-0 left-0 w-1 h-full ${accentColor}`} />
                      <div className="text-lg shrink-0 mt-0.5 select-none">{isUrgent ? '🚨' : '📢'}</div>
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`text-[9px] font-extrabold ${isUrgent ? 'text-orange-600 bg-orange-50 border-orange-100' : 'text-amber-600 bg-amber-50 border-amber-100'} px-2 py-0.5 rounded-md border uppercase tracking-widest`}>
                            {isUrgent ? 'Important' : 'News'}
                          </span>
                          {expLabel && (
                            <span className="text-[9px] font-bold text-neutral-400 flex items-center gap-0.5">
                              ⏰ {expLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-neutral-800 leading-relaxed break-words">{a.message}</p>
                        <button
                          onClick={() => handleDismissAnnouncement(a.id)}
                          className="mt-2 py-1 px-3 bg-neutral-900/5 hover:bg-neutral-900/10 active:scale-95 text-[10px] font-extrabold text-neutral-600 rounded-lg transition-all"
                        >
                          รับทราบ
                        </button>
                      </div>
                      <button 
                        onClick={() => handleDismissAnnouncement(a.id)}
                        className="absolute top-3.5 right-3.5 w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 hover:text-neutral-700 hover:bg-neutral-900/5 transition-all text-xs font-bold"
                      >
                        ✕
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Approved Leaves & My Pending Requests */}
              {(approvedLeaves.length > 0 || myPendingLeaves.length > 0) && (
                <div className="w-full bg-white/70 backdrop-blur-md rounded-3xl border border-white/60 p-4 shadow-[0_4px_24px_0_rgba(0,0,0,0.02)] flex flex-col gap-3">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-100/80">
                    <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest">ข้อมูลการลาหยุด</span>
                    <span className="text-[9px] font-bold text-slate-400">{format(currentTime || new Date(), "dd MMMM yyyy", { locale: th })}</span>
                  </div>

                  {/* Approved Leaves List (Sleek Avatar Cards) */}
                  <div className="flex flex-col gap-2">
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider mb-1">รายชื่อลางานล่าสุด</p>
                    {approvedLeaves.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {approvedLeaves.map((l) => {
                          const empName = l.employees?.nickname || l.employees?.name?.split(' ')[0] || 'Staff';
                          const typeLabel = l.leave_type === 'sick' ? 'ลาป่วย 😷' : l.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️';
                          const badgeColor = l.leave_type === 'sick' 
                            ? 'bg-rose-50 border-rose-100 text-rose-600' 
                            : l.leave_type === 'business' 
                              ? 'bg-amber-50 border-amber-100 text-amber-600' 
                              : 'bg-sky-50 border-sky-100 text-sky-600';
                          
                          const isTodayLeave = l.leave_date === format(new Date(), 'yyyy-MM-dd');
                          const dateObj = new Date(l.leave_date);
                          const dateStrFormatted = format(dateObj, 'd MMM', { locale: th });

                          return (
                            <div key={l.id} className="flex items-center justify-between p-2 bg-slate-50/40 rounded-2xl border border-slate-100/30">
                              <div className="flex items-center gap-2.5 min-w-0">
                                {/* Employee Avatar with Fallback */}
                                <div className="relative w-8 h-8 shrink-0">
                                  {l.employees?.photo_url ? (
                                    <>
                                      <img 
                                        src={l.employees.photo_url} 
                                        alt={empName} 
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                                          if (fallback) fallback.classList.remove('hidden');
                                        }}
                                        className="w-8 h-8 rounded-full object-cover border border-white shadow-sm" 
                                      />
                                      <div className="avatar-fallback hidden w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-slate-100 flex items-center justify-center text-[10px] font-extrabold text-indigo-500 border border-white shadow-sm absolute inset-0">
                                        {empName.slice(0, 2).toUpperCase()}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-100 to-slate-100 flex items-center justify-center text-[10px] font-extrabold text-indigo-500 border border-white shadow-sm">
                                      {empName.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0 ml-1">
                                  <span className="text-xs font-black text-slate-800 truncate leading-none mb-0.5">{empName}</span>
                                  <span className="text-[9px] font-bold text-slate-400 truncate leading-none">{l.reason || 'ทำธุระส่วนตัว'}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[9px] font-extrabold px-2 py-0.5 rounded-md border ${badgeColor}`}>
                                  {typeLabel}
                                </span>
                                <span className={cn(
                                  "text-[9px] font-extrabold px-1.5 py-0.5 rounded-md border",
                                  isTodayLeave 
                                    ? "bg-rose-500 border-rose-600 text-white animate-pulse" 
                                    : "bg-slate-100 border-slate-200 text-slate-500"
                                )}>
                                  {isTodayLeave ? 'วันนี้' : dateStrFormatted}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-slate-400 font-semibold italic text-[11px] block mt-0.5">ช่วงนี้ไม่มีคนลาหยุด ☀️</span>
                    )}
                  </div>

                  {/* My Pending Leaves */}
                  {myPendingLeaves.length > 0 && (
                    <div className="flex items-start gap-2.5 min-w-0 pt-2 border-t border-slate-100/50">
                      <span className="text-sm shrink-0">⏳</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">คำขอลาของคุณที่ค้างอยู่</p>
                        <div className="flex flex-col gap-1 mt-1">
                          {myPendingLeaves.slice(0, 2).map((l, idx) => {
                            const dateFormatted = format(new Date(l.leave_date), 'dd/MM');
                            const typeLabel = l.leave_type === 'sick' ? 'ลาป่วย' : l.leave_type === 'business' ? 'ลากิจ' : 'ลาพักร้อน';
                            return (
                              <div key={idx} className="flex items-center gap-1.5 text-[10px] font-bold text-amber-600">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0"></span>
                                <span>{typeLabel} วันที่ {dateFormatted} (รออนุมัติ)</span>
                              </div>
                            );
                          })}
                          {myPendingLeaves.length > 2 && (
                            <span className="text-[9px] font-bold text-slate-400 pl-3">และรายการอื่นอีก {myPendingLeaves.length - 2} รายการ</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Weekly Schedule Row */}
              {weeklySchedule.length > 0 && (
                <div className="w-full bg-white/70 backdrop-blur-md rounded-3xl border border-white/60 p-4 shadow-[0_4px_24px_0_rgba(0,0,0,0.02)] flex flex-col gap-2.5">
                  <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest pb-1 border-b border-slate-100/80">ตารางงานสัปดาห์นี้</span>
                  <div className="grid grid-cols-7 gap-1">
                    {weeklySchedule.map((day, idx) => {
                      const dayInitialsMap = { Mon: 'จ', Tue: 'อ', Wed: 'พ', Thu: 'พฤ', Fri: 'ศ', Sat: 'ส', Sun: 'อา' };
                      const thaiInitial = dayInitialsMap[day.dayName] || day.dayName;

                      let timeDisplay = '';
                      let statusBg = 'bg-slate-50 border-slate-100 text-slate-600';
                      
                      if (day.isLeave) {
                        timeDisplay = 'ลา';
                        statusBg = 'bg-rose-50 border-rose-100/60 text-rose-500';
                      } else if (day.isOff) {
                        timeDisplay = 'หยุด';
                        statusBg = 'bg-slate-100 border-slate-200/50 text-slate-400';
                      } else {
                        timeDisplay = day.shiftTime ? day.shiftTime.split('-')[0] : 'งาน';
                        statusBg = 'bg-indigo-50 border-indigo-100/60 text-indigo-650';
                      }

                      const isSelected = selectedDaySchedule?.dateStr === day.dateStr;

                      return (
                        <div 
                          key={idx}
                          onClick={() => setSelectedDaySchedule(day)}
                          className={cn(
                            "flex flex-col items-center p-1 rounded-xl border text-center transition-all duration-200 min-w-0 cursor-pointer hover:scale-[1.03] active:scale-[0.97]",
                            day.isToday 
                              ? "bg-slate-900 border-slate-950 text-white shadow-md" 
                              : isSelected
                                ? "bg-indigo-50 border-indigo-400 text-indigo-750 shadow-sm"
                                : statusBg
                          )}
                        >
                          <span className={cn("text-[9px] font-bold", day.isToday ? "text-slate-300" : "text-slate-400")}>
                            {thaiInitial}
                          </span>
                          <span className="text-xs font-black tracking-tight mt-0.5">
                            {day.dateNum}
                          </span>
                          <span className={cn(
                            "text-[7.5px] font-extrabold mt-1 px-0.5 py-0.5 rounded-md text-center tracking-tighter whitespace-nowrap", 
                            day.isToday 
                              ? (day.isLeave ? "bg-rose-500 text-white" : day.isOff ? "bg-slate-800 text-slate-400" : "bg-indigo-500 text-white")
                              : (day.isLeave ? "bg-rose-100 text-rose-600" : day.isOff ? "bg-slate-200 text-slate-400" : "bg-indigo-100 text-indigo-600")
                          )}>
                            {timeDisplay}
                          </span>
                        </div>
                      );
                    })}
                  </div>

                  {/* Selected Day Shift Detail */}
                  {selectedDaySchedule && (
                    <motion.div 
                      key={selectedDaySchedule.dateStr}
                      initial={{ opacity: 0, y: 5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-2 p-3 bg-slate-50/70 backdrop-blur-sm rounded-2xl border border-slate-100/50 flex items-center justify-between transition-all duration-300"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm border shrink-0",
                          selectedDaySchedule.isLeave 
                            ? "bg-rose-50 text-rose-500 border-rose-100" 
                            : selectedDaySchedule.isOff 
                              ? "bg-slate-100 text-slate-400 border-slate-200/50" 
                              : "bg-indigo-50 text-indigo-500 border-indigo-100/60"
                        )}>
                          {selectedDaySchedule.isLeave 
                            ? (selectedDaySchedule.leaveType === 'sick' ? '🤢' : selectedDaySchedule.leaveType === 'business' ? '💼' : '🏖️') 
                            : selectedDaySchedule.isOff 
                              ? '😴' 
                              : (((selectedDaySchedule.shiftName || '').includes('ค่ำ') || (selectedDaySchedule.shiftName || '').includes('เย็น') || (selectedDaySchedule.shiftTime || '').startsWith('18') || (selectedDaySchedule.shiftTime || '').startsWith('17') || (selectedDaySchedule.shiftTime || '').startsWith('16')) ? '🌙' : '☀️')}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest leading-none mb-1.5 truncate">
                            {format(selectedDaySchedule.date, 'EEEE d MMMM yyyy', { locale: th })} {selectedDaySchedule.isToday && '(วันนี้)'}
                          </h5>
                          <p className="text-xs font-black text-slate-800 leading-none truncate">
                            {selectedDaySchedule.isLeave 
                              ? `ลากุน (${selectedDaySchedule.leaveType === 'sick' ? 'ลาป่วย 😷' : selectedDaySchedule.leaveType === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'})` 
                              : selectedDaySchedule.isOff 
                                ? 'วันหยุด (OFF)' 
                                : selectedDaySchedule.shiftName || 'กะงาน'}
                          </p>
                        </div>
                      </div>
                      
                      {!selectedDaySchedule.isOff && !selectedDaySchedule.isLeave && selectedDaySchedule.shiftTime && (
                        <div className="text-right shrink-0 ml-3">
                          <span className="text-[11px] font-black text-indigo-650 bg-indigo-100/60 border border-indigo-200/50 px-2.5 py-1.5 rounded-lg whitespace-nowrap">
                            {selectedDaySchedule.shiftTime}
                          </span>
                        </div>
                      )}
                    </motion.div>
                  )}
                </div>
              )}
            </div>
          );
        })()}

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
            {recentCheckins.slice(0, 3).map((log, i) => {
              const namePart = log.employees?.nickname || log.employees?.name?.split(' ')[0] || 'Staff';
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between p-3 bg-white/40 backdrop-blur-md rounded-2xl border border-white/40 shadow-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-10 h-10 shrink-0">
                      <img 
                        src={log.employees?.photo_url || log.photo_url} 
                        alt=""
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                          if (fallback) fallback.classList.remove('hidden');
                        }}
                        className="w-10 h-10 rounded-full object-cover bg-slate-200 border border-white" 
                      />
                      <div className="avatar-fallback hidden w-10 h-10 rounded-full bg-gradient-to-br from-indigo-100 to-slate-100 flex items-center justify-center text-xs font-extrabold text-indigo-500 border border-white shadow-sm absolute inset-0">
                        {namePart.slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-neutral-800 truncate">{namePart}</p>
                      <p className="text-[10px] text-neutral-500 font-medium truncate">{log.action_type === 'check_in' ? 'Checked In' : 'Checked Out'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-3">
                    <span className="text-xs font-bold text-neutral-700 font-mono">{format(new Date(log.timestamp), "HH:mm")}</span>
                    <span className="text-sm">{log.mood_status || ''}</span>
                  </div>
                </motion.div>
              );
            })}
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
              onClick={() => {
                setShowMoodSelector(false);
                if (wrapUpData) setShowWrapUp(true);
              }}
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
                onClick={() => {
                  setShowMoodSelector(false);
                  if (wrapUpData) setShowWrapUp(true);
                }}
                className="w-full mt-8 text-neutral-400 text-xs font-bold tracking-widest uppercase hover:text-neutral-800 transition-colors"
              >
                Skip This
              </button>
            </motion.div>
          </div>
        )}

        {showWrapUp && wrapUpData && (
          <div className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center justify-end pointer-events-none">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm pointer-events-auto"
              onClick={() => {
                setShowWrapUp(false);
                setWrapUpData(null);
              }}
            />
            <motion.div
              initial={{ y: "100%" }} animate={{ y: 0 }} exit={{ y: "100%" }}
              transition={{ type: "spring", damping: 25, stiffness: 200 }}
              className="w-full bg-[#FAFAFA] rounded-t-[2.5rem] p-8 pb-12 shadow-2xl pointer-events-auto relative overflow-hidden"
            >
              <div className="absolute top-0 right-0 p-4 text-6xl opacity-5">🐾</div>
              <div className="w-12 h-1 bg-neutral-200 rounded-full mx-auto mb-6"></div>
              
              <div className="text-center mb-6">
                <span className="inline-block p-4 bg-orange-100 text-orange-500 rounded-full text-4xl mb-4">🏆</span>
                <h3 className="text-2xl font-black text-neutral-800 mb-2">เลิกงานแล้ว!</h3>
                <p className="text-neutral-500 text-sm">
                  กะที่ผ่านมาคุณทำงานไป <strong className="text-neutral-800">{wrapUpData.hours} ชั่วโมง {wrapUpData.minutes} นาที</strong>
                </p>
              </div>

              <div className="bg-white border border-neutral-100 rounded-2xl p-5 shadow-sm mb-6 relative">
                <p className="text-sm font-medium text-neutral-700 leading-relaxed">
                  "ทำได้ดีมาก! ขอบคุณสำหรับความทุ่มเทในวันนี้นะ 🐾"
                </p>
                {(wrapUpData.mood === '😴' || wrapUpData.mood === '🤒') && (
                  <div className="mt-3 pt-3 border-t border-neutral-100">
                    <p className="text-xs text-orange-600 font-bold">
                      💡 Yuzu says: พักผ่อนเยอะๆ นะ ดื่มน้ำอุ่นๆ ด้วยล่ะ!
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => {
                  setShowWrapUp(false);
                  setWrapUpData(null);
                }}
                className="w-full py-4 bg-neutral-900 text-white rounded-2xl text-sm font-bold shadow-md hover:bg-neutral-800 transition-colors"
              >
                ปิดหน้าต่าง
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}