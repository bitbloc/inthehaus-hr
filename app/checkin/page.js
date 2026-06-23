/* Hallmark · route: custom (bespoke) · structure: modular control grid · idea: "tactile push button & physical LED indicators"
 * paper: oklch(93% 0.005 60) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass · studied: no · pre-emit critique: P5 H5 E5 S5 R5 V5
 */
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
  let mainButtonConfig = { label: 'Check In', icon: '☀️', sub: 'Start your day', color: "bg-rams-orange text-rams-panel border-rams-rule active:bg-rams-orange-active shadow-[0_4px_0_0_var(--color-rams-rule)]" };

  if (lastAction === 'register') {
    mainButtonConfig = { label: 'Register', icon: '📝', sub: 'Request Access', color: "bg-rams-orange text-rams-panel border-rams-rule active:bg-rams-orange-active shadow-[0_4px_0_0_var(--color-rams-rule)]" };
  } else if (lastAction === 'pending') {
    mainButtonConfig = { label: 'Pending', icon: '⏳', sub: 'Waiting Admin', color: "bg-rams-amber text-rams-ink border-rams-rule shadow-[0_4px_0_0_var(--color-rams-rule)]" };
  } else if (lastAction === 'check_in') {
    mainButtonConfig = { label: 'Check Out', icon: '🌙', sub: 'Good rest!', color: "bg-rams-ink text-rams-panel border-rams-rule shadow-[0_4px_0_0_var(--color-rams-rule)]" };
  } else if (isLate) {
    mainButtonConfig = { label: 'Check In', icon: '☀️', sub: 'Start your day', color: "bg-rams-red text-rams-panel border-rams-rule active:bg-red-700 shadow-[0_4px_0_0_var(--color-rams-rule)]" };
  }

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink font-sans flex flex-col items-center relative overflow-hidden font-feature-settings-['ss01'] pb-32">

      {/* 1. Header (Dieter Rams Utilitarian Solid Bar) */}
      <motion.div
        className="w-full px-6 py-4 flex justify-between items-center z-20 sticky top-0 bg-rams-panel border-b-2 border-rams-rule relative"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="flex items-center z-10">
          <button onClick={handleDevLogin} className="text-rams-ink-muted hover:text-rams-ink transition-colors text-xs">🛠️</button>
        </div>

        {/* Center: Logo */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-10 pointer-events-none">
           <img src="/logo.png" alt="In The Haus" className="h-9 object-contain grayscale brightness-90 contrast-125" />
        </div>

        <div className="flex items-center gap-3 z-10">
          <Link href="https://forms.gle/3LdW9zdjdTCpfpTe8" target="_blank" className="text-[10px] font-mono font-bold text-rams-ink-muted hover:text-rams-ink border border-rams-rule-light bg-rams-bg px-2.5 py-1 transition-colors mr-1 rounded-sm">
            คำขอเบิกเงินล่วงหน้า
          </Link>
          {profile ? (
            <div className="flex items-center gap-3">
              <div className="flex flex-col items-end">
                <span className="text-xs font-mono font-bold text-rams-ink">{profile.displayName}</span>
                <span
                  onClick={() => {
                    navigator.clipboard.writeText(profile.userId);
                    alert("Copied User ID");
                  }}
                  className="text-[9px] font-mono text-rams-ink-muted cursor-pointer hover:text-rams-orange transition-colors"
                >
                  {employeeData?.position || (lastAction === 'pending' ? 'Pending' : 'Guest')}
                </span>
              </div>
              <img src={profile.pictureUrl} className="w-10 h-10 rounded-sm object-cover border-2 border-rams-rule" />
            </div>
          ) : (
            <button onClick={() => liff.login()} className="px-4 py-2 bg-[#06C755] text-white rounded-sm text-xs font-mono font-bold border border-black shadow-sm">LINE Login</button>
          )}
        </div>
      </motion.div>

      {/* 2. Contextual Info (Next Shift - Rams Panel) */}
      <AnimatePresence>
        {shiftContext && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 mx-6 w-full max-w-sm z-10"
          >
            <div className="flex items-center justify-between px-5 py-3 bg-rams-panel border-2 border-rams-rule rounded-sm shadow-none">
              <div className="flex items-center gap-3">
                <div className={cn("w-10 h-10 rounded-sm border border-rams-rule flex items-center justify-center text-lg bg-rams-bg")}>
                  {isLate ? '⚠️' : '📅'}
                </div>
                <div>
                  <h4 className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest leading-tight">
                    {isLate ? "Running Late" : "Current Shift"}
                  </h4>
                  <p className="text-sm font-mono font-bold text-rams-ink">
                    {shiftContext.start.slice(0, 5)} - {shiftContext.end.slice(0, 5)}
                  </p>
                </div>
              </div>
              {isLate && (
                <span className="px-2 py-0.5 bg-rams-red text-rams-panel text-[9px] font-mono font-bold rounded-sm border border-rams-rule">LATE</span>
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
          {/* Stark Digital Flip/LCD Style Bezel */}
          <div className="border-2 border-rams-rule bg-rams-panel p-5 rounded-sm text-center shadow-none w-full mb-4">
            <h2 className="text-[4.5rem] md:text-[5.5rem] leading-none font-mono font-bold text-rams-ink tracking-tight select-none">
              {currentTime ? format(currentTime, "HH:mm") : "--:--"}
            </h2>
            <p className="text-[10px] font-mono font-bold text-rams-ink-muted mt-2 tracking-widest uppercase">
              {currentTime ? format(currentTime, "EEEEที่ d MMMM yyyy", { locale: th }) : "Loading..."}
            </p>
          </div>

          <motion.div
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1 rounded-sm text-[10px] font-mono font-bold tracking-wider uppercase border-2 border-rams-rule bg-rams-panel"
            )}
          >
            <span className={cn("w-2.5 h-2.5 rounded-full border border-rams-rule shadow-inner animate-pulse shrink-0", status.includes('Ready') ? 'bg-rams-green' : 'bg-rams-red')}></span>
            {status}
          </motion.div>
          
          {/* Gamification: Early Bird Badge */}
          {lastAction !== 'check_in' && shiftContext && !isLate && (
            <div className="mt-3 flex justify-center">
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-3.5 py-1.5 bg-rams-orange/10 text-rams-orange border border-rams-rule rounded-sm text-[10px] font-mono font-bold flex items-center gap-1.5"
              >
                🔥 มาเช้าจัง เยี่ยมไปเลย!
              </motion.div>
            </div>
          )}
        </motion.div>

        {/* Check-In / Check-Out Button (moved here, directly under GPS status) */}
        {!status.includes('Checking') && (
          <motion.button
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            onClick={handleStartCheckIn}
            className="w-full max-w-sm px-6 mb-6 z-30 transition-all active:translate-y-[4px] active:scale-[0.98]"
          >
            <div className={cn(
              "w-full py-4 rounded-sm flex flex-col items-center justify-center border-2 border-rams-rule transition-all text-center select-none cursor-pointer",
              mainButtonConfig.color
            )}>
              <span className="text-3xl mb-1">{mainButtonConfig.icon}</span>
              <span className="text-lg font-mono font-bold uppercase tracking-wider">
                {mainButtonConfig.label}
              </span>
              <span className="text-[10px] font-mono opacity-80 mt-0.5 font-bold uppercase tracking-widest">
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
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full bg-rams-panel border-2 border-rams-rule p-4 shadow-none flex items-start gap-3.5 relative overflow-hidden rounded-sm"
                  >
                    <div className="absolute top-0 left-0 w-1.5 h-full bg-rams-orange" />
                    <div className="text-lg shrink-0 mt-0.5 select-none">📌</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[9px] font-mono font-extrabold text-rams-ink border border-rams-rule bg-rams-bg px-2 py-0.5 rounded-sm uppercase tracking-widest">Pinned</span>
                        {a.priority > 1 && (
                          <span className="text-[9px] font-mono font-extrabold text-rams-panel border border-rams-rule bg-rams-red px-2 py-0.5 rounded-sm uppercase tracking-widest animate-pulse">Urgent</span>
                        )}
                      </div>
                      <p className="text-xs font-semibold text-rams-ink leading-relaxed break-words">{a.message}</p>
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
                  const accentColor = isUrgent ? 'bg-rams-red' : 'bg-rams-orange';

                  return (
                    <motion.div
                      key={`temp-${a.id}`}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98, height: 0, marginBottom: 0, padding: 0 }}
                      className="w-full bg-rams-panel border-2 border-rams-rule p-4 shadow-none flex items-start gap-3.5 relative overflow-hidden rounded-sm transition-all"
                    >
                      <div className={`absolute top-0 left-0 w-1.5 h-full ${accentColor}`} />
                      <div className="text-lg shrink-0 mt-0.5 select-none">{isUrgent ? '🚨' : '📢'}</div>
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className={`text-[9px] font-mono font-extrabold text-rams-ink border border-rams-rule ${isUrgent ? 'bg-rams-red/10 text-rams-red' : 'bg-rams-orange/10 text-rams-orange'} px-2 py-0.5 rounded-sm uppercase tracking-widest`}>
                            {isUrgent ? 'Important' : 'News'}
                          </span>
                          {expLabel && (
                            <span className="text-[9px] font-mono font-bold text-rams-ink-muted flex items-center gap-0.5">
                              ⏰ {expLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-rams-ink leading-relaxed break-words">{a.message}</p>
                        <button
                          onClick={() => handleDismissAnnouncement(a.id)}
                          className="mt-2 py-1 px-3 bg-rams-bg hover:bg-rams-bg/85 active:translate-y-[1px] text-[10px] font-mono font-extrabold text-rams-ink border border-rams-rule rounded-sm transition-all"
                        >
                          รับทราบ
                        </button>
                      </div>
                      <button 
                        onClick={() => handleDismissAnnouncement(a.id)}
                        className="absolute top-3.5 right-3.5 w-6 h-6 rounded-sm flex items-center justify-center text-rams-ink-muted hover:text-rams-ink hover:bg-rams-bg border border-rams-rule-light transition-all text-xs font-bold"
                      >
                        ✕
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Approved Leaves & My Pending Requests */}
              {(approvedLeaves.length > 0 || myPendingLeaves.length > 0) && (
                <div className="w-full bg-rams-panel border-2 border-rams-rule p-4 shadow-none flex flex-col gap-3 rounded-sm">
                  <div className="flex items-center justify-between pb-2 border-b border-rams-rule-light">
                    <span className="text-[9px] font-mono font-extrabold text-rams-ink-muted uppercase tracking-widest">ข้อมูลการลาหยุด</span>
                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted">{format(currentTime || new Date(), "dd MMMM yyyy", { locale: th })}</span>
                  </div>

                  {/* Approved Leaves List (Sleek Avatar Cards) */}
                  <div className="flex flex-col gap-2">
                    <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1">รายชื่อลางานล่าสุด</p>
                    {approvedLeaves.length > 0 ? (
                      <div className="flex flex-col gap-2">
                        {approvedLeaves.map((l) => {
                          const empName = l.employees?.nickname || l.employees?.name?.split(' ')[0] || 'Staff';
                          const typeLabel = l.leave_type === 'sick' ? 'ลาป่วย 😷' : l.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️';
                          const badgeColor = l.leave_type === 'sick' 
                            ? 'bg-rams-red/10 text-rams-red' 
                            : l.leave_type === 'business' 
                              ? 'bg-rams-amber/10 text-rams-amber' 
                              : 'bg-rams-orange/10 text-rams-orange';
                          
                          const isTodayLeave = l.leave_date === format(new Date(), 'yyyy-MM-dd');
                          const dateObj = new Date(l.leave_date);
                          const dateStrFormatted = format(dateObj, 'd MMM', { locale: th });

                          return (
                            <div key={l.id} className="flex items-center justify-between p-2 bg-rams-bg rounded-sm border border-rams-rule-light">
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
                                        className="w-8 h-8 rounded-sm object-cover border border-rams-rule shadow-none" 
                                      />
                                      <div className="avatar-fallback hidden w-8 h-8 rounded-sm bg-rams-panel flex items-center justify-center text-[10px] font-mono font-extrabold text-rams-ink border border-rams-rule absolute inset-0">
                                        {empName.slice(0, 2).toUpperCase()}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-8 h-8 rounded-sm bg-rams-panel flex items-center justify-center text-[10px] font-mono font-extrabold text-rams-ink border border-rams-rule">
                                      {empName.slice(0, 2).toUpperCase()}
                                    </div>
                                  )}
                                </div>
                                <div className="flex flex-col min-w-0 ml-1">
                                  <span className="text-xs font-bold text-rams-ink truncate leading-none mb-1">{empName}</span>
                                  <span className="text-[9px] font-mono text-rams-ink-muted truncate leading-none">{l.reason || 'ทำธุระส่วนตัว'}</span>
                                </div>
                              </div>

                              <div className="flex items-center gap-1.5 shrink-0">
                                <span className={`text-[9px] font-mono font-extrabold px-2 py-0.5 rounded-sm border border-rams-rule-light ${badgeColor}`}>
                                  {typeLabel}
                                </span>
                                <span className={cn(
                                  "text-[9px] font-mono font-extrabold px-1.5 py-0.5 rounded-sm border border-rams-rule-light",
                                  isTodayLeave 
                                    ? "bg-rams-red text-rams-panel animate-pulse" 
                                    : "bg-rams-panel text-rams-ink-muted"
                                )}>
                                  {isTodayLeave ? 'วันนี้' : dateStrFormatted}
                                </span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <span className="text-rams-ink-muted font-mono font-bold italic text-[10px] block mt-0.5">ช่วงนี้ไม่มีคนลาหยุด ☀️</span>
                    )}
                  </div>

                  {/* My Pending Leaves */}
                  {myPendingLeaves.length > 0 && (
                    <div className="flex items-start gap-2.5 min-w-0 pt-2 border-t border-rams-rule-light">
                      <span className="text-sm shrink-0">⏳</span>
                      <div className="flex-1 min-w-0">
                        <p className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider">คำขอลาของคุณที่ค้างอยู่</p>
                        <div className="flex flex-col gap-1 mt-1">
                          {myPendingLeaves.slice(0, 2).map((l, idx) => {
                            const dateFormatted = format(new Date(l.leave_date), 'dd/MM');
                            const typeLabel = l.leave_type === 'sick' ? 'ลาป่วย' : l.leave_type === 'business' ? 'ลากิจ' : 'ลาพักร้อน';
                            return (
                              <div key={idx} className="flex items-center gap-1.5 text-[10px] font-mono font-bold text-rams-orange">
                                <span className="w-1.5 h-1.5 rounded-full bg-rams-orange animate-pulse shrink-0"></span>
                                <span>{typeLabel} วันที่ {dateFormatted} (รออนุมัติ)</span>
                              </div>
                            );
                          })}
                          {myPendingLeaves.length > 2 && (
                            <span className="text-[9px] font-mono font-bold text-rams-ink-muted pl-3">และรายการอื่นอีก {myPendingLeaves.length - 2} รายการ</span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Weekly Schedule Row */}
              {weeklySchedule.length > 0 && (
                <div className="w-full bg-rams-panel border-2 border-rams-rule p-4 shadow-none flex flex-col gap-2.5 rounded-sm">
                  <span className="text-[9px] font-mono font-extrabold text-rams-ink-muted uppercase tracking-widest pb-1 border-b border-rams-rule-light">ตารางงานสัปดาห์นี้</span>
                  <div className="grid grid-cols-7 gap-1">
                    {weeklySchedule.map((day, idx) => {
                      const dayInitialsMap = { Mon: 'จ', Tue: 'อ', Wed: 'พ', Thu: 'พฤ', Fri: 'ศ', Sat: 'ส', Sun: 'อา' };
                      const thaiInitial = dayInitialsMap[day.dayName] || day.dayName;

                      let timeDisplay = '';
                      let statusBg = 'bg-rams-bg border-rams-rule-light text-rams-ink-muted';
                      
                      if (day.isLeave) {
                        timeDisplay = 'ลา';
                        statusBg = 'bg-rams-red/10 border-rams-red/30 text-rams-red';
                      } else if (day.isOff) {
                        timeDisplay = 'หยุด';
                        statusBg = 'bg-rams-bg border-rams-rule-light text-rams-ink-muted/50';
                      } else {
                        timeDisplay = day.shiftTime ? day.shiftTime.split('-')[0] : 'งาน';
                        statusBg = 'bg-rams-orange/10 border-rams-orange/30 text-rams-orange';
                      }

                      const isSelected = selectedDaySchedule?.dateStr === day.dateStr;

                      return (
                        <div 
                          key={idx}
                          onClick={() => setSelectedDaySchedule(day)}
                          className={cn(
                            "flex flex-col items-center p-1 rounded-sm border text-center transition-all min-w-0 cursor-pointer active:translate-y-[1px]",
                            day.isToday 
                              ? "bg-rams-ink border-rams-rule text-rams-panel shadow-none" 
                              : isSelected
                                ? "bg-rams-bg border-rams-rule text-rams-ink shadow-none"
                                : statusBg
                          )}
                        >
                          <span className={cn("text-[9px] font-mono font-bold", day.isToday ? "text-rams-panel/75" : "text-rams-ink-muted")}>
                            {thaiInitial}
                          </span>
                          <span className="text-xs font-mono font-black tracking-tight mt-0.5">
                            {day.dateNum}
                          </span>
                          <span className={cn(
                            "text-[8px] font-mono font-extrabold mt-1 px-1 py-0.5 rounded-sm text-center tracking-tighter whitespace-nowrap border border-rams-rule-light", 
                            day.isToday 
                              ? (day.isLeave ? "bg-rams-red text-rams-panel border-rams-rule" : day.isOff ? "bg-rams-bg text-rams-ink-muted" : "bg-rams-orange text-rams-panel border-rams-rule")
                              : (day.isLeave ? "bg-rams-red/10 text-rams-red" : day.isOff ? "bg-rams-bg text-rams-ink-muted/55" : "bg-rams-orange/10 text-rams-orange")
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
                      className="mt-2 p-3 bg-rams-bg border border-rams-rule rounded-sm flex items-center justify-between transition-all duration-200"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-10 h-10 rounded-sm flex items-center justify-center text-lg border border-rams-rule shrink-0 bg-rams-panel",
                          selectedDaySchedule.isLeave 
                            ? "bg-rams-red/10 text-rams-red border-rams-red/30" 
                            : selectedDaySchedule.isOff 
                              ? "bg-rams-panel text-rams-ink-muted/50 border-rams-rule-light" 
                              : "bg-rams-orange/10 text-rams-orange border-rams-orange/30"
                        )}>
                          {selectedDaySchedule.isLeave 
                            ? (selectedDaySchedule.leaveType === 'sick' ? '🤢' : selectedDaySchedule.leaveType === 'business' ? '💼' : '🏖️') 
                            : selectedDaySchedule.isOff 
                              ? '😴' 
                              : (((selectedDaySchedule.shiftName || '').includes('ค่ำ') || (selectedDaySchedule.shiftName || '').includes('เย็น') || (selectedDaySchedule.shiftTime || '').startsWith('18') || (selectedDaySchedule.shiftTime || '').startsWith('17') || (selectedDaySchedule.shiftTime || '').startsWith('16')) ? '🌙' : '☀️')}
                        </div>
                        <div className="min-w-0">
                          <h5 className="text-[9px] font-mono font-extrabold text-rams-ink-muted uppercase tracking-widest leading-none mb-1.5 truncate">
                            {format(selectedDaySchedule.date, 'EEEE d MMMM yyyy', { locale: th })} {selectedDaySchedule.isToday && '(วันนี้)'}
                          </h5>
                          <p className="text-xs font-mono font-bold text-rams-ink leading-none truncate">
                            {selectedDaySchedule.isLeave 
                              ? `ลางาน (${selectedDaySchedule.leaveType === 'sick' ? 'ลาป่วย 😷' : selectedDaySchedule.leaveType === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'})` 
                              : selectedDaySchedule.isOff 
                                ? 'วันหยุด (OFF)' 
                                : selectedDaySchedule.shiftName || 'กะงาน'}
                          </p>
                        </div>
                      </div>
                      
                      {!selectedDaySchedule.isOff && !selectedDaySchedule.isLeave && selectedDaySchedule.shiftTime && (
                        <div className="text-right shrink-0 ml-3">
                          <span className="text-[11px] font-mono font-bold text-rams-ink bg-rams-panel border border-rams-rule px-2.5 py-1 rounded-sm whitespace-nowrap">
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

      {/* 4. Recent Checkins (Dieter Rams Panels) */}
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

        <h3 className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-4 pl-2">Recent Activity</h3>
        <div className="flex flex-col gap-2">
          <AnimatePresence>
            {recentCheckins.slice(0, 3).map((log, i) => {
              const namePart = log.employees?.nickname || log.employees?.name?.split(' ')[0] || 'Staff';
              return (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="flex items-center justify-between p-3 bg-rams-panel border-2 border-rams-rule rounded-sm shadow-none"
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
                        className="w-10 h-10 rounded-sm object-cover bg-rams-panel border border-rams-rule" 
                      />
                      <div className="avatar-fallback hidden w-10 h-10 rounded-sm bg-rams-bg flex items-center justify-center text-xs font-mono font-extrabold text-rams-ink border border-rams-rule absolute inset-0">
                        {namePart.slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-rams-ink truncate">{namePart}</p>
                      <p className="text-[10px] font-mono text-rams-ink-muted truncate">{log.action_type === 'check_in' ? 'Checked In' : 'Checked Out'}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end shrink-0 ml-3">
                    <span className="text-xs font-mono font-bold text-rams-ink">{format(new Date(log.timestamp), "HH:mm")}</span>
                    <span className="text-sm font-emoji">{log.mood_status || ''}</span>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* 5. Navigation Dock (The "Haus" Dock) */}
      <NavigationDock />



      {/* Camera & Mood (Modals in Dieter Rams Style) */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-rams-bg flex flex-col items-center justify-center p-6"
          >
            <div className="absolute top-0 w-full p-6 flex justify-between items-center border-b-2 border-rams-rule bg-rams-panel">
              <h3 className="text-lg font-mono font-bold text-rams-ink uppercase tracking-wider">Verify Location</h3>
              <button onClick={() => setShowCamera(false)} className="w-10 h-10 bg-rams-bg border-2 border-rams-rule rounded-sm flex items-center justify-center font-bold active:translate-y-[1px]">✕</button>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-full max-w-sm aspect-square bg-rams-panel rounded-sm border-2 border-rams-rule flex flex-col items-center justify-center overflow-hidden active:translate-y-[2px] transition-transform cursor-pointer"
            >
              {isUploading
                ? <div className="animate-spin w-12 h-12 border-4 border-rams-rule-light border-t-rams-rule rounded-full"></div>
                : <>
                  <span className="text-6xl mb-4 select-none">📸</span>
                  <span className="text-xs font-mono font-bold text-rams-ink-muted uppercase tracking-widest">Tap to Take Photo</span>
                </>
              }
            </div>

            <p className="mt-8 text-rams-ink-muted text-center text-xs font-mono font-bold uppercase tracking-wider leading-relaxed max-w-xs">Please take a clear photo of yourself within the shop area.</p>
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
              className="w-full bg-rams-panel border-t-4 border-rams-rule p-8 pb-12 pointer-events-auto relative rounded-t-sm"
            >
              <div className="w-12 h-1.5 bg-rams-rule rounded-full mx-auto mb-8"></div>
              <h3 className="text-lg font-mono font-bold text-rams-ink text-center mb-8 uppercase tracking-wider">How are you feeling?</h3>
              <div className="flex justify-center gap-4 flex-wrap">
                {['🔥', '😊', '😐', '😴', '🤒'].map((m) => (
                  <motion.button
                    key={m}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => handleMoodSelect(m)}
                    className="w-16 h-16 text-3xl flex items-center justify-center rounded-sm bg-rams-bg border-2 border-rams-rule hover:bg-rams-ink hover:text-rams-panel transition-all font-emoji"
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
                className="w-full mt-8 text-rams-ink-muted text-xs font-mono font-bold tracking-widest uppercase hover:text-rams-ink transition-colors"
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
              className="w-full bg-rams-panel border-t-4 border-rams-rule p-8 pb-12 pointer-events-auto relative overflow-hidden rounded-t-sm"
            >
              <div className="absolute top-0 right-0 p-4 text-6xl opacity-5">🐾</div>
              <div className="w-12 h-1.5 bg-rams-rule rounded-full mx-auto mb-6"></div>
              
              <div className="text-center mb-6">
                <span className="inline-block p-4 bg-rams-orange/10 text-rams-orange border border-rams-rule rounded-sm text-4xl mb-4">🏆</span>
                <h3 className="text-xl font-mono font-bold text-rams-ink mb-2 uppercase tracking-wide">เลิกงานแล้ว!</h3>
                <p className="text-rams-ink-muted text-sm font-mono">
                  กะที่ผ่านมาคุณทำงานไป <strong className="text-rams-ink font-bold">{wrapUpData.hours} ชั่วโมง {wrapUpData.minutes} นาที</strong>
                </p>
              </div>

              <div className="bg-rams-bg border-2 border-rams-rule p-5 mb-6 relative rounded-sm">
                <p className="text-sm font-bold text-rams-ink leading-relaxed">
                  "ทำได้ดีมาก! ขอบคุณสำหรับความทุ่มเทในวันนี้นะ 🐾"
                </p>
                {(wrapUpData.mood === '😴' || wrapUpData.mood === '🤒') && (
                  <div className="mt-3 pt-3 border-t border-rams-rule-light">
                    <p className="text-xs text-rams-orange font-mono font-bold">
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
                className="w-full py-4 bg-rams-ink text-rams-panel rounded-sm text-sm font-mono font-bold border-2 border-rams-rule hover:bg-neutral-800 active:translate-y-[2px] transition-all"
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