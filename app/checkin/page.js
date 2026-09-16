/* Hallmark · route: custom (bespoke) · structure: modular control grid · idea: "tactile push button & physical LED indicators"
 * paper: oklch(96% 0.006 80) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass · studied: no · pre-emit critique: P5 H5 E5 S5 R5 V5
 */
"use client";
import { useEffect, useState, useRef } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import { resizeImage } from "../../utils/imageResizer";
import Link from "next/link";
import { format, isSameDay, startOfWeek, addDays } from "date-fns";
import { th } from "date-fns/locale";
import { motion, AnimatePresence } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import NavigationDock from "../_components/NavigationDock";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

import WeatherCard from "./components/WeatherCard";

// --- Clean Technical SVG Icons (Dieter Rams Precision Icons) ---
const SunIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
  </svg>
);

const MoonIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />
  </svg>
);

const ClockIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const RegisterIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
    <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
  </svg>
);

const CameraIcon = ({ className = "w-10 h-10 stroke-current text-rams-ink mb-2" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

const ConsoleIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="2" y="3" width="20" height="14" rx="1" />
    <line x1="8" y1="21" x2="16" y2="21" />
    <line x1="12" y1="17" x2="12" y2="21" />
  </svg>
);

const RosterIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="1" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const CoffeeIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M18 8h1a4 4 0 0 1 0 8h-1" />
    <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z" />
    <line x1="6" y1="1" x2="6" y2="4" />
    <line x1="10" y1="1" x2="10" y2="4" />
    <line x1="14" y1="1" x2="14" y2="4" />
  </svg>
);

const AuditIcon = ({ className = "w-5 h-5 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
    <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
    <line x1="12" y1="22.08" x2="12" y2="12" />
  </svg>
);

const PinIcon = ({ className = "w-4 h-4 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="17" x2="12" y2="22" />
    <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z" />
  </svg>
);

const MegaphoneIcon = ({ className = "w-4 h-4 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="m3 11 18-5v12L3 14v-3z" />
    <path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" />
  </svg>
);

const CheckIcon = ({ className = "w-4 h-4 stroke-current" }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

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
  const [showOptionalPunch, setShowOptionalPunch] = useState(false);

  // Punch Result Feedback Modal
  const [punchFeedback, setPunchFeedback] = useState(null);
  const [showPunchModal, setShowPunchModal] = useState(false);
  const [selectedMood, setSelectedMood] = useState(null);

  // Dev Mode State (Disabled for plain security)
  const [devMode, setDevMode] = useState(false);
  const fileInputRef = useRef(null);

  // --- Constants ---
  const OFFICIAL_LIFF_URL = "https://liff.line.me/2008567449-W868y8RY";
  const SHOP_LAT = 17.39009845004315;
  const SHOP_LONG = 104.7929558480443;
  const ALLOWED_RADIUS_KM = 0.08; // 80 meters (harmonized with server)

  // Safe storage helper for Tracking Prevention / Safari iframe compatibility
  const safeStorage = {
    getItem: (key) => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          return window.localStorage.getItem(key);
        }
      } catch (e) {
        console.warn("Storage access restricted:", e);
      }
      return null;
    },
    setItem: (key, value) => {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(key, value);
        }
      } catch (e) {
        console.warn("Storage write restricted:", e);
      }
    }
  };

  // Load Acknowledged Announcements
  useEffect(() => {
    const saved = safeStorage.getItem("acknowledged_announcements");
    if (saved) {
      try { setDismissedIds(JSON.parse(saved)); } catch (e) {}
    }
  }, []);

  const onGeoSuccess = (position) => {
    const { latitude, longitude, accuracy } = position.coords;
    setUserPosition({ lat: latitude, lon: longitude, accuracy });

    const dist = getDistanceFromLatLonInKm(latitude, longitude, SHOP_LAT, SHOP_LONG);
    if (dist <= ALLOWED_RADIUS_KM) {
      if (!status.includes("Ready") && !status.includes("พร้อม")) setStatus("พร้อมลงเวลา (อยู่ในพื้นที่ร้าน)");
    } else {
      const distMeters = Math.round(dist * 1000);
      if (!devMode) setStatus(`อยู่นอกพื้นที่ร้าน (${distMeters} ม.)`);
    }
  };

  const onGeoError = (error) => {
    console.warn("Geo Location warning:", error);
    if (!status.includes("พร้อม") && !status.includes("Ready")) {
      setStatus("สัญญาณ GPS ไม่ชัดเจน กรุณารอสักครู่");
    }
  };

  const handleLineLogin = async () => {
    try {
      if (typeof liff === 'undefined') {
        alert("กำลังเริ่มต้นระบบ LINE กรุณารอสักครู่...");
        return;
      }
      if (!liff.isLoggedIn()) {
        liff.login();
      } else {
        let p = null;
        try {
          p = await liff.getProfile();
        } catch (e) {
          const idToken = liff.getDecodedIDToken?.();
          if (idToken) {
            p = {
              userId: idToken.sub,
              displayName: idToken.name || "LINE Staff",
              pictureUrl: idToken.picture || null
            };
          }
        }
        if (p && p.userId) {
          setProfile(p);
          fetchUserStatus(p.userId, p);
          fetchMyShift(p.userId);
        } else {
          liff.login();
        }
      }
    } catch (err) {
      console.error("Manual LINE Login Error:", err);
      window.location.href = OFFICIAL_LIFF_URL;
    }
  };

  // --- Init ---
  useEffect(() => {
    setCurrentTime(new Date()); // Init on client
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    let watchId;

    const init = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID || "2008567449-W868y8RY" });

        if (liff.isLoggedIn()) {
          let p = null;
          try {
            p = await liff.getProfile();
          } catch (profileErr) {
            console.warn("getProfile failed, using decoded ID token fallback:", profileErr);
            const idToken = liff.getDecodedIDToken?.();
            if (idToken) {
              p = {
                userId: idToken.sub,
                displayName: idToken.name || "LINE Staff",
                pictureUrl: idToken.picture || null
              };
            }
          }

          if (p && p.userId) {
            setProfile(p);
            fetchUserStatus(p.userId, p);
            fetchMyShift(p.userId);
          }
        } else {
          // If opened inside LINE client, prompt authorization smoothly
          if (liff.isInClient?.()) {
            liff.login();
            return;
          }

          // If opened in external browser: check if callback or already visited
          const search = typeof window !== 'undefined' ? (window.location.search || "") : "";
          const isCallbackOrLiff = search.includes("code=") || search.includes("state=") || search.includes("liff");

          // Only redirect once to official LIFF if accessed directly without LIFF context
          if (!isCallbackOrLiff) {
            const alreadyRedirected = safeStorage.getItem("liff_initial_bounce");
            if (!alreadyRedirected) {
              safeStorage.setItem("liff_initial_bounce", "1");
              window.location.replace(OFFICIAL_LIFF_URL);
              return;
            }
          }
        }
      } catch (e) {
        console.error("LIFF Init Error:", e);
        setStatus("LIFF Error");
      }

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

  // --- Realtime Synchronization ---
  useRealtimeSync(['attendance_logs', 'roster_transactions', 'leave_requests', 'announcements'], () => {
    if (profile?.userId) {
      fetchUserStatus(profile.userId);
      fetchMyShift(profile.userId);
    }
    fetchAnnouncement();
    fetchRecents();
  });

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
    safeStorage.setItem("acknowledged_announcements", JSON.stringify(updated));
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

  const fetchUserStatus = async (userId, userProfile = null) => {
    // Check user existence regardless of active status (support both line_user_id and line_bot_id)
    const { data: emp } = await supabase
      .from('employees')
      .select('id, name, nickname, position, is_active, photo_url')
      .or(`line_user_id.eq.${userId},line_bot_id.eq.${userId}`)
      .maybeSingle();

    if (!emp) {
      setStatus("New User");
      setLastAction("register"); // New state for registration
      return;
    }

    // Auto-sync / refresh LINE photo_url if user has a newer picture or stale URL
    const activePictureUrl = userProfile?.pictureUrl || profile?.pictureUrl;
    if (activePictureUrl && activePictureUrl !== emp.photo_url) {
      emp.photo_url = activePictureUrl;
      supabase.from('employees').update({ photo_url: activePictureUrl }).eq('id', emp.id).then();
    }

    if (!emp.is_active) {
      setStatus("Pending Approval");
      setLastAction("pending"); // New state for pending
      return;
    }

    setEmployeeData(emp);
    fetchDashboardData(emp.id);

    const isEmpOwner = (emp.position || '').toLowerCase().includes('owner') || (emp.position || '').toLowerCase().includes('ceo');

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
        if (!isEmpOwner) {
          alert("คุณลืมลงชื่อออกเมื่อวาน ระบบจะเริ่มนับวันใหม่ให้");
        }
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
      const { data: emp } = await supabase
        .from('employees')
        .select('id, position')
        .or(`line_user_id.eq.${userId},line_bot_id.eq.${userId}`)
        .maybeSingle();
      if (!emp) return;

      const pos = (emp.position || '').toLowerCase();
      if (pos.includes('owner') || pos.includes('ceo')) {
        setShiftContext(null);
        return;
      }

      const today = new Date();
      const dateStr = format(today, 'yyyy-MM-dd');
      const dayOfWeek = today.getDay();
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
    if (!profile?.userId) {
      if (typeof liff !== 'undefined' && !liff.isLoggedIn?.()) {
        handleLineLogin();
      } else {
        alert("กำลังเชื่อมต่อบัญชี LINE กรุณารอสักครู่ หรือกดปุ่ม LINE Login ด้านบน");
      }
      return;
    }

    if (lastAction === 'register') {
      handleRegister();
      return;
    }
    if (lastAction === 'pending') {
      alert("Your account is pending approval from admin.");
      return;
    }

    if (isUploading || isSubmitting) return;
    if (!devMode && !status.includes("Ready") && !status.includes("พร้อม")) {
      alert("คุณอยู่นอกพื้นที่ร้าน หรือระบบกำลังจับสัญญาณ GPS กรุณาอยู่ภายในพื้นที่ร้าน In The Haus ก่อนลงเวลา");
      return;
    }
    setShowCamera(true);
  };

  // --- Dynamic Dieter Rams Style Technical Watermark Canvas Helper ---
  const fileToBase64 = (file) => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = (err) => reject(err);
      reader.readAsDataURL(file);
    });
  };

  const createWatermarkedPhoto = async (file, staffName, dateText, locText, actionLabel = 'CHECK-IN') => {
    return new Promise((resolve, reject) => {
      let objectUrl = null;
      try {
        if (typeof window !== 'undefined' && window.URL && window.URL.createObjectURL) {
          objectUrl = URL.createObjectURL(file);
        }
      } catch (e) {
        console.warn("createObjectURL failed:", e);
      }

      const img = new Image();

      let timeoutTimer = setTimeout(() => {
        cleanup();
        reject(new Error("การประมวลผลรูปภาพใช้เวลานานเกินกำหนด กรุณาลองใหม่อีกครั้ง"));
      }, 10000);

      const cleanup = () => {
        if (timeoutTimer) {
          clearTimeout(timeoutTimer);
          timeoutTimer = null;
        }
        if (objectUrl) {
          try {
            URL.revokeObjectURL(objectUrl);
          } catch (e) {}
        }
      };

      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          const maxW = 1080;
          const maxH = 1080;
          let w = img.naturalWidth || img.width || 800;
          let h = img.naturalHeight || img.height || 800;

          if (w > maxW || h > maxH) {
            if (w > h) {
              h = Math.round((h * maxW) / w);
              w = maxW;
            } else {
              w = Math.round((w * maxH) / h);
              h = maxH;
            }
          }
          canvas.width = w;
          canvas.height = h;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            cleanup();
            reject(new Error("Canvas 2D context not available"));
            return;
          }

          ctx.drawImage(img, 0, 0, w, h);

          // Matte Dark Technical Telemetry HUD Bar
          const barH = Math.max(76, Math.round(h * 0.115));
          const pad = Math.max(16, Math.round(w * 0.035));
          
          // Background HUD panel
          ctx.fillStyle = 'rgba(18, 18, 18, 0.92)';
          ctx.fillRect(0, h - barH, w, barH);

          // Accent hairline rule at top of HUD (Rams Signal Orange)
          ctx.fillStyle = '#ea580c';
          ctx.fillRect(0, h - barH, w, 2.5);

          // Orange Indicator Dot
          const dotRadius = Math.max(3.5, Math.round(barH * 0.065));
          ctx.beginPath();
          ctx.arc(pad + dotRadius, h - barH + Math.round(barH * 0.33), dotRadius, 0, Math.PI * 2);
          ctx.fill();

          // Header line: System, Action & Staff Identifier
          ctx.fillStyle = '#FFFFFF';
          ctx.font = `bold ${Math.max(13, Math.round(barH * 0.22))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
          ctx.fillText(`IN THE HAUS // ${actionLabel.toUpperCase()} · ${staffName || 'STAFF'}`, pad + dotRadius * 2 + 8, h - barH + Math.round(barH * 0.38));

          // Sub line: High-Precision Timestamp & Telemetry
          ctx.fillStyle = '#9ca3af'; // Rams Ink Muted
          ctx.font = `${Math.max(10, Math.round(barH * 0.165))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
          ctx.fillText(`TIMESTAMP: ${dateText} ICT | LOC: ${locText.toUpperCase()}`, pad, h - barH + Math.round(barH * 0.74));

          cleanup();
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        } catch (canvasErr) {
          cleanup();
          reject(canvasErr);
        }
      };

      img.onerror = (err) => {
        cleanup();
        reject(new Error("Image decoding failed"));
      };

      if (objectUrl) {
        img.src = objectUrl;
      } else {
        const reader = new FileReader();
        reader.onload = (e) => {
          img.src = e.target.result;
        };
        reader.onerror = (e) => reject(new Error("FileReader failed"));
        reader.readAsDataURL(file);
      }
    });
  };

  const executePunch = async ({ photoBase64 = null }) => {
    if (!profile?.userId) {
      alert("ไม่พบข้อมูลผู้ใช้ LINE กรุณาเข้าสู่ระบบ LINE ก่อนลงเวลา");
      setIsUploading(false);
      setIsSubmitting(false);
      return;
    }
    if (isSubmitting) return;

    setIsSubmitting(true);
    setIsUploading(true);

    try {
      const intendedAction = lastAction === 'check_in' ? 'check_out' : 'check_in';
      const staffName = employeeData?.nickname ? `${employeeData.name} (${employeeData.nickname})` : (employeeData?.name || profile.displayName);
      const res = await fetch('/api/checkins/punch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: profile.userId,
          actionType: intendedAction,
          latitude: userPosition?.lat,
          longitude: userPosition?.lon,
          accuracy: userPosition?.accuracy,
          photoBase64: photoBase64 || null,
          deviceInfo: {
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
            platform: typeof navigator !== 'undefined' ? navigator.platform : ''
          }
        })
      });

      const json = await res.json();

      if (!json.success) {
        alert(json.error || "เกิดข้อผิดพลาดในการลงเวลา");
        return;
      }

      setShowCamera(false);

      const actualAction = json.action || intendedAction;
      setLastAction(actualAction);
      if (actualAction === 'check_in') {
        setLastCheckInTime(new Date(json.timestamp));
      } else {
        setLastCheckInTime(null);
      }

      // Show Punch Confirmation / Attendance Status Modal
      setPunchFeedback({
        ...(json.punchResult || {}),
        logId: json.logId,
        action: actualAction,
        timestamp: json.timestamp,
        duration: json.duration,
        employee: json.employee || employeeData
      });
      setSelectedMood(null);
      setShowPunchModal(true);

      fetchRecents();
      fetchUserStatus(profile.userId);

    } catch (err) {
      console.error("Punch error:", err);
      alert("ไม่สามารถเชื่อมต่อระบบลงเวลาได้ กรุณาตรวจสอบสัญญาณเน็ต");
    } finally {
      setIsUploading(false);
      setIsSubmitting(false);
    }
  };

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file || isUploading || isSubmitting) return;

    try {
      setIsUploading(true);
      const nowStr = format(new Date(), 'yyyy-MM-dd HH:mm:ss');
      const locText = status.includes('Ready') || status.includes('พร้อม') ? 'IN THE HAUS HQ (VERIFIED)' : 'GPS VERIFIED';
      const staffName = employeeData?.nickname ? `${employeeData.name} (${employeeData.nickname})` : (employeeData?.name || profile?.displayName);
      const actionName = lastAction === 'check_in' ? 'CHECK-OUT' : 'CHECK-IN';

      let watermarkedBase64 = null;
      try {
        watermarkedBase64 = await createWatermarkedPhoto(file, staffName, nowStr, locText, actionName);
      } catch (procErr) {
        console.warn("Watermarking failed, falling back to resizeImage:", procErr);
        try {
          const resizedFile = await resizeImage(file, 800, 0.8);
          watermarkedBase64 = await fileToBase64(resizedFile);
        } catch (resizeErr) {
          console.warn("Resize failed, falling back to direct base64:", resizeErr);
          watermarkedBase64 = await fileToBase64(file);
        }
      }

      await executePunch({ photoBase64: watermarkedBase64 });
    } catch (err) {
      console.error("Photo processing error:", err);
      alert("ไม่สามารถประมวลผลรูปถ่ายได้ กรุณาลองใหม่อีกครั้ง (" + (err?.message || "ระบบกำลังแก้ไข") + ")");
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setIsUploading(false);
    }
  };


  const handleMoodSelect = async (mood) => {
    setSelectedMood(mood);
    try {
      const targetLogId = punchFeedback?.logId;
      if (targetLogId) {
        await supabase.from('attendance_logs').update({ mood_status: mood }).eq('id', targetLogId);
      } else if (employeeData?.id) {
        const { data: latestLog } = await supabase.from('attendance_logs')
          .select('id, action_type')
          .eq('employee_id', employeeData.id)
          .order('timestamp', { ascending: false })
          .limit(1)
          .maybeSingle();

        if (latestLog) {
          await supabase.from('attendance_logs').update({ mood_status: mood }).eq('id', latestLog.id);
        }
      }
      fetchRecents();
    } catch (e) {
      console.error("Mood select error:", e);
    }
  };

  const handleDevLogin = () => {
    // Plaintext dev password removed for security
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

  const isOwner = Boolean(employeeData && ((employeeData.position || '').toLowerCase().includes('owner') || (employeeData.position || '').toLowerCase().includes('ceo')));

  // Dynamic Button Colors and Logic
  const isLate = !isOwner && shiftContext?.isLate && lastAction !== 'check_in';
  let mainButtonConfig = { 
    label: 'Check In', 
    icon: <SunIcon className="w-7 h-7 stroke-current mb-1" />, 
    sub: 'Start your day', 
    color: "bg-rams-orange text-rams-panel border border-rams-rule active:bg-rams-orange-active shadow-[0_3px_0_0_var(--color-rams-rule)]" 
  };

  if (lastAction === 'register') {
    mainButtonConfig = { 
      label: 'Register', 
      icon: <RegisterIcon className="w-7 h-7 stroke-current mb-1" />, 
      sub: 'Request Access', 
      color: "bg-rams-orange text-rams-panel border border-rams-rule active:bg-rams-orange-active shadow-[0_3px_0_0_var(--color-rams-rule)]" 
    };
  } else if (lastAction === 'pending') {
    mainButtonConfig = { 
      label: 'Pending', 
      icon: <ClockIcon className="w-7 h-7 stroke-current mb-1" />, 
      sub: 'Waiting Admin', 
      color: "bg-rams-amber text-rams-ink border border-rams-rule shadow-[0_3px_0_0_var(--color-rams-rule)]" 
    };
  } else if (lastAction === 'check_in') {
    mainButtonConfig = { 
      label: 'Check Out', 
      icon: <MoonIcon className="w-7 h-7 stroke-current mb-1" />, 
      sub: 'Good rest!', 
      color: "bg-rams-ink text-rams-panel border border-rams-rule shadow-[0_3px_0_0_var(--color-rams-rule)]" 
    };
  } else if (isLate) {
    mainButtonConfig = { 
      label: 'Check In', 
      icon: <ClockIcon className="w-7 h-7 stroke-current mb-1" />, 
      sub: 'Start your day (Late)', 
      color: "bg-rams-red text-rams-panel border border-rams-rule active:bg-rams-red/90 shadow-[0_3px_0_0_var(--color-rams-rule)]" 
    };
  }

  const displayStatus = isOwner 
    ? (status.includes('Ready') || status.includes('พร้อม') ? '👑 OWNER · พร้อมใช้งาน (HQ)' : '👑 OWNER · ยกเว้นการลงเวลา (EXEMPT)') 
    : status;

  return (
    <div className="min-h-screen bg-rams-bg text-rams-ink font-sans flex flex-col items-center relative overflow-x-clip font-feature-settings-['ss01'] pb-32">

      {/* 1. Header (Dieter Rams Utilitarian Solid Bar) */}
      <motion.div
        className="w-full px-6 py-4 flex justify-between items-center z-20 sticky top-0 bg-rams-panel border-b border-rams-rule-light relative"
        initial={{ y: -10, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
      >
        <div className="flex items-center z-10">
          <button onClick={handleDevLogin} className="text-rams-ink-muted hover:text-rams-ink transition-colors text-xs" aria-label="Dev settings">🛠️</button>
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
                  className={cn(
                    "text-[9px] font-mono cursor-pointer transition-colors",
                    isOwner ? "text-rams-amber font-extrabold" : "text-rams-ink-muted hover:text-rams-orange"
                  )}
                >
                  {isOwner ? `👑 ${employeeData?.position || 'Owner'}` : (employeeData?.position || (lastAction === 'pending' ? 'Pending' : 'Guest'))}
                </span>
              </div>
              {profile.pictureUrl ? (
                <div className="relative w-10 h-10 shrink-0">
                  <img 
                    src={profile.pictureUrl} 
                    alt={profile.displayName || ""}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                      const fallback = e.currentTarget.parentElement?.querySelector('.avatar-header-fallback');
                      if (fallback) fallback.classList.remove('hidden');
                    }}
                    className="w-10 h-10 rounded-sm object-cover border border-rams-rule-light" 
                  />
                  <div className="avatar-header-fallback hidden w-10 h-10 rounded-sm bg-rams-panel flex items-center justify-center text-xs font-mono font-extrabold text-rams-ink border border-rams-rule-light absolute inset-0">
                    {(profile.displayName || "U").slice(0, 2).toUpperCase()}
                  </div>
                </div>
              ) : (
                <div className="w-10 h-10 rounded-sm bg-rams-panel flex items-center justify-center text-xs font-mono font-extrabold text-rams-ink border border-rams-rule-light">
                  {(profile.displayName || "U").slice(0, 2).toUpperCase()}
                </div>
              )}
            </div>
          ) : (
            <button 
              onClick={handleLineLogin} 
              className="px-3.5 py-1.5 bg-[#06C755] hover:bg-[#05b34c] text-white rounded-sm text-xs font-mono font-bold border border-rams-rule active:translate-y-[1px] tactile-btn-sm shadow-sm transition-[transform,background-color]"
            >
              LINE Login
            </button>
          )}
        </div>
      </motion.div>

      {/* 2. Contextual Info (Next Shift - Rams Panel) */}
      <AnimatePresence>
        {shiftContext && (
          <motion.div
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 w-full max-w-sm px-6 z-10"
          >
            <div className="flex items-center justify-between px-4 py-3 bg-rams-panel border border-rams-rule-light rounded-sm shadow-none">
              <div className="flex items-center gap-3">
                <div className={cn("w-9 h-9 rounded-sm border border-rams-rule-light flex items-center justify-center text-sm bg-rams-bg")}>
                  {isLate ? <ClockIcon className="w-5 h-5 text-rams-red" /> : <SunIcon className="w-5 h-5 text-rams-orange" />}
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
                <span className="px-2 py-0.5 bg-rams-red text-rams-panel text-[9px] font-mono font-bold rounded-sm border border-rams-rule-light">LATE</span>
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
          className="text-center mb-5 w-full max-w-sm px-6"
        >
          {/* Stark Digital Flip/LCD Style Bezel (Dieter Rams Braun Clock) */}
          <div className="border-2 border-rams-rule bg-rams-panel p-5 rounded-sm text-center shadow-[inset_0_2px_4px_rgba(0,0,0,0.02)] w-full mb-3">
            <h2 className="text-[4.5rem] md:text-[5.5rem] leading-none font-mono font-bold text-rams-ink tracking-tight select-none">
              {currentTime ? format(currentTime, "HH:mm") : "--:--"}
            </h2>
            <p className="text-[10px] font-mono font-bold text-rams-ink-muted mt-2 tracking-widest uppercase">
              {currentTime ? format(currentTime, "EEEEที่ d MMMM yyyy", { locale: th }) : "Loading..."}
            </p>
          </div>

          <motion.div
            className={cn(
              "inline-flex items-center gap-2 px-3 py-1 rounded-sm text-[10px] font-mono font-bold tracking-wider uppercase border border-rams-rule-light bg-rams-panel",
              isOwner ? "border-rams-amber/40 text-rams-ink bg-rams-amber/10" : ""
            )}
          >
            <span className={cn(
              "w-2 h-2 rounded-full border border-rams-rule-light shrink-0", 
              isOwner ? 'bg-rams-amber animate-pulse' : (status.includes('Ready') || status.includes('พร้อม') ? 'bg-rams-green animate-pulse' : 'bg-rams-red')
            )}></span>
            {displayStatus}
          </motion.div>
          
          {/* Gamification: Early Bird Badge */}
          {!isOwner && lastAction !== 'check_in' && shiftContext && !isLate && (
            <div className="mt-3 flex justify-center">
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="px-3 py-1 bg-rams-orange/10 text-rams-orange border border-rams-rule-light rounded-sm text-[10px] font-mono font-bold flex items-center gap-1.5"
              >
                <span>🔥</span>
                <span>มาเช้าจัง เยี่ยมไปเลย!</span>
              </motion.div>
            </div>
          )}
        </motion.div>

        {/* Check-In / Check-Out Section */}
        {!status.includes('Checking') && (
          <>
            {isOwner ? (
              /* Executive Command Hub for Owner */
              <div className="w-full max-w-sm px-6 mb-6 z-30 space-y-3.5">
                {/* Executive Status Card */}
                <motion.div
                  initial={{ opacity: 0, y: 5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-rams-panel border-2 border-rams-rule p-4 rounded-sm shadow-[0_2px_0_0_var(--color-rams-rule)] relative overflow-hidden"
                >
                  <div className="flex items-center justify-between mb-2.5">
                    <span className="px-2 py-0.5 bg-rams-amber/15 text-rams-ink border border-rams-amber/40 rounded-sm text-[10px] font-mono font-bold tracking-wider uppercase flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-rams-amber"></span>
                      <span>OWNER / MANAGEMENT</span>
                    </span>
                    <span className="text-[9px] font-mono font-bold text-rams-green bg-rams-green/10 border border-rams-green/30 px-2 py-0.5 rounded-sm">
                      EXEMPT ✓
                    </span>
                  </div>

                  <h3 className="text-sm font-mono font-bold text-rams-ink mb-1">
                    สวัสดีครับคุณ {employeeData?.nickname || employeeData?.name}
                  </h3>
                  <p className="text-[11px] font-sans text-rams-ink-muted leading-relaxed">
                    ตำแหน่งของคุณได้รับการยกเว้นการลงเวลาเข้า-ออกงานและไม่ถูกนับขาดงาน สามารถเข้าใช้งานเมนูบริหารจัดการร้านได้ทันที
                  </p>

                  <div className="mt-3 pt-3 border-t border-rams-rule-light grid grid-cols-2 divide-x divide-rams-rule-light text-center">
                    <div className="pr-2">
                      <span className="text-[8px] font-mono font-bold text-rams-ink-muted uppercase block">สิทธิ์การใช้งาน</span>
                      <span className="text-xs font-mono font-bold text-rams-ink mt-0.5 block">ผู้บริหารระดับสูง</span>
                    </div>
                    <div className="pl-2">
                      <span className="text-[8px] font-mono font-bold text-rams-ink-muted uppercase block">การลงเวลา</span>
                      <span className="text-xs font-mono font-bold text-rams-green mt-0.5 block">ทางเลือก (Optional)</span>
                    </div>
                  </div>
                </motion.div>

                {/* Executive Quick Portals Grid */}
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/admin"
                    className="p-3 bg-rams-panel hover:bg-rams-bg border border-rams-rule rounded-sm flex flex-col justify-between transition-[transform,background-color,border-color,color] duration-150 ease-out active:translate-y-[1px] shadow-sm tactile-btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rams-ink group"
                  >
                    <div className="text-rams-ink group-hover:text-rams-orange transition-colors mb-2">
                      <ConsoleIcon className="w-5 h-5 stroke-current" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-rams-ink group-hover:text-rams-orange transition-colors">
                        Admin Console
                      </div>
                      <div className="text-[9px] font-mono text-rams-ink-muted mt-0.5">
                        ระบบ HR & หลังบ้าน
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/shifts"
                    className="p-3 bg-rams-panel hover:bg-rams-bg border border-rams-rule rounded-sm flex flex-col justify-between transition-[transform,background-color,border-color,color] duration-150 ease-out active:translate-y-[1px] shadow-sm tactile-btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rams-ink group"
                  >
                    <div className="text-rams-ink group-hover:text-rams-orange transition-colors mb-2">
                      <RosterIcon className="w-5 h-5 stroke-current" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-rams-ink group-hover:text-rams-orange transition-colors">
                        Master Roster
                      </div>
                      <div className="text-[9px] font-mono text-rams-ink-muted mt-0.5">
                        ตารางกะ & เวรทีมงาน
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/admin/report/espresso"
                    className="p-3 bg-rams-panel hover:bg-rams-bg border border-rams-rule rounded-sm flex flex-col justify-between transition-[transform,background-color,border-color,color] duration-150 ease-out active:translate-y-[1px] shadow-sm tactile-btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rams-ink group"
                  >
                    <div className="text-rams-ink group-hover:text-rams-orange transition-colors mb-2">
                      <CoffeeIcon className="w-5 h-5 stroke-current" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-rams-ink group-hover:text-rams-orange transition-colors">
                        Espresso Report
                      </div>
                      <div className="text-[9px] font-mono text-rams-ink-muted mt-0.5">
                        รายงานบาร์ & สกัดช็อต
                      </div>
                    </div>
                  </Link>

                  <Link
                    href="/stock/audit"
                    className="p-3 bg-rams-panel hover:bg-rams-bg border border-rams-rule rounded-sm flex flex-col justify-between transition-[transform,background-color,border-color,color] duration-150 ease-out active:translate-y-[1px] shadow-sm tactile-btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rams-ink group"
                  >
                    <div className="text-rams-ink group-hover:text-rams-orange transition-colors mb-2">
                      <AuditIcon className="w-5 h-5 stroke-current" />
                    </div>
                    <div>
                      <div className="text-xs font-mono font-bold text-rams-ink group-hover:text-rams-orange transition-colors">
                        Stock Audit
                      </div>
                      <div className="text-[9px] font-mono text-rams-ink-muted mt-0.5">
                        เช็คสต็อกวัตถุดิบ
                      </div>
                    </div>
                  </Link>
                </div>

                {/* Optional Voluntary Punch Accordion */}
                <div className="pt-1">
                  <button
                    onClick={() => setShowOptionalPunch(!showOptionalPunch)}
                    className="w-full py-2 px-3 bg-rams-panel hover:bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-between text-[10px] font-mono font-bold text-rams-ink-muted hover:text-rams-ink transition-[transform,background-color,color] duration-150 ease-out active:translate-y-[1px] tactile-btn-sm focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rams-ink"
                  >
                    <span className="flex items-center gap-1.5">
                      <CameraIcon className="w-3.5 h-3.5 stroke-current" />
                      <span>บันทึกเวลาประวัติ (ทางเลือก)</span>
                    </span>
                    <span>{showOptionalPunch ? '▲ ซ่อน' : '▼ เปิด'}</span>
                  </button>

                  <AnimatePresence>
                    {showOptionalPunch && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.15, ease: "easeOut" }}
                        className="pt-2 space-y-2 overflow-hidden"
                      >
                        <button
                          onClick={handleStartCheckIn}
                          disabled={isSubmitting}
                          className="w-full active:translate-y-[2px] transition-[transform,opacity] duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rams-ink"
                        >
                          <div className={cn(
                            "w-full py-3 rounded-sm flex items-center justify-center gap-2 border-2 border-rams-rule text-center select-none cursor-pointer tactile-btn",
                            mainButtonConfig.color
                          )}>
                            <span className="scale-90">{mainButtonConfig.icon}</span>
                            <span className="text-xs font-mono font-bold uppercase tracking-wider">
                              {isSubmitting ? "Processing..." : `${mainButtonConfig.label} (ทางเลือก)`}
                            </span>
                          </div>
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            ) : (
              /* Standard Staff Check-in / Check-out Button */
              <div className="w-full max-w-sm px-6 mb-6 z-30 space-y-3">
                <button
                  onClick={handleStartCheckIn}
                  disabled={isSubmitting}
                  className="w-full active:translate-y-[2px] transition-[transform,opacity] duration-150 disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rams-ink group"
                >
                  <div className={cn(
                    "w-full py-5 rounded-sm flex flex-col items-center justify-center border-2 border-rams-rule text-center select-none cursor-pointer tactile-btn",
                    mainButtonConfig.color
                  )}>
                    <span className="mb-1">{mainButtonConfig.icon}</span>
                    <span className="text-xl font-mono font-bold uppercase tracking-wider">
                      {isSubmitting ? "Processing..." : mainButtonConfig.label}
                    </span>
                    <span className="text-[10px] font-mono opacity-85 mt-1 font-bold uppercase tracking-widest">
                      {mainButtonConfig.sub}
                    </span>
                  </div>
                </button>
              </div>
            )}
          </>
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
                    className="w-full bg-rams-panel border border-rams-rule-light p-4 shadow-none flex items-start gap-3.5 rounded-sm"
                  >
                    <PinIcon className="w-4 h-4 stroke-current text-rams-ink shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="text-[9px] font-mono font-extrabold text-rams-ink border border-rams-rule-light bg-rams-bg px-2 py-0.5 rounded-sm uppercase tracking-widest">Pinned</span>
                        {a.priority > 1 && (
                          <span className="text-[9px] font-mono font-extrabold text-rams-panel border border-rams-rule-light bg-rams-red px-2 py-0.5 rounded-sm uppercase tracking-widest animate-pulse">Urgent</span>
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

                  return (
                    <motion.div
                      key={`temp-${a.id}`}
                      initial={{ opacity: 0, scale: 0.98 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.98, height: 0, marginBottom: 0, padding: 0 }}
                      className="w-full bg-rams-panel border border-rams-rule-light p-4 shadow-none flex items-start gap-3.5 rounded-sm transition-[transform,opacity] duration-150 ease-out relative"
                    >
                      <MegaphoneIcon className={cn("w-4 h-4 stroke-current shrink-0 mt-0.5", isUrgent ? "text-rams-red" : "text-rams-orange")} />
                      <div className="flex-1 min-w-0 pr-6">
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          <span className={`text-[9px] font-mono font-extrabold border border-rams-rule-light ${isUrgent ? 'bg-rams-red/10 text-rams-red' : 'bg-rams-orange/10 text-rams-orange'} px-2 py-0.5 rounded-sm uppercase tracking-widest`}>
                            {isUrgent ? 'Important' : 'News'}
                          </span>
                          {expLabel && (
                            <span className="text-[9px] font-mono font-bold text-rams-ink-muted flex items-center gap-1">
                              <ClockIcon className="w-3 h-3 stroke-current" />
                              {expLabel}
                            </span>
                          )}
                        </div>
                        <p className="text-xs font-semibold text-rams-ink leading-relaxed break-words">{a.message}</p>
                        <button
                          onClick={() => handleDismissAnnouncement(a.id)}
                          className="mt-2 py-1 px-3 bg-rams-bg hover:bg-rams-panel active:translate-y-[1px] text-[10px] font-mono font-extrabold text-rams-ink border border-rams-rule-light rounded-sm transition-[background-color,transform] duration-150 ease-out tactile-btn-sm"
                        >
                          รับทราบ
                        </button>
                      </div>
                      <button 
                        onClick={() => handleDismissAnnouncement(a.id)}
                        className="absolute top-3.5 right-3.5 w-6 h-6 rounded-sm flex items-center justify-center text-rams-ink-muted hover:text-rams-ink hover:bg-rams-bg border border-rams-rule-light transition-colors duration-150 text-xs font-bold"
                        aria-label="Dismiss announcement"
                      >
                        ✕
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>

              {/* Approved Leaves & My Pending Requests */}
              {(approvedLeaves.length > 0 || myPendingLeaves.length > 0) && (
                <div className="w-full bg-rams-panel border border-rams-rule-light p-4 shadow-none flex flex-col gap-3 rounded-sm">
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
                                        referrerPolicy="no-referrer"
                                        onError={(e) => {
                                          e.currentTarget.style.display = 'none';
                                          const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                                          if (fallback) fallback.classList.remove('hidden');
                                        }}
                                        className="w-8 h-8 rounded-sm object-cover border border-rams-rule-light shadow-none" 
                                      />
                                      <div className="avatar-fallback hidden w-8 h-8 rounded-sm bg-rams-panel flex items-center justify-center text-[10px] font-mono font-extrabold text-rams-ink border border-rams-rule-light absolute inset-0">
                                        {empName.slice(0, 2).toUpperCase()}
                                      </div>
                                    </>
                                  ) : (
                                    <div className="w-8 h-8 rounded-sm bg-rams-panel flex items-center justify-center text-[10px] font-mono font-extrabold text-rams-ink border border-rams-rule-light">
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
                <div className="w-full bg-rams-panel border border-rams-rule-light p-4 shadow-none flex flex-col gap-2.5 rounded-sm">
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
                        statusBg = 'bg-rams-bg border-rams-rule-light text-rams-ink-muted/55';
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
                            "relative flex flex-col items-center p-1 rounded-sm border text-center transition-[background-color,border-color,transform] duration-150 min-w-0 cursor-pointer active:translate-y-[1px] select-none z-10 overflow-hidden",
                            day.isToday 
                              ? "bg-rams-ink border-rams-rule text-rams-panel shadow-none" 
                              : isSelected
                                ? "border-rams-rule text-rams-ink shadow-none bg-rams-bg"
                                : cn("border-rams-rule-light", statusBg.split(" ").filter(c => !c.startsWith("border-")).join(" "))
                          )}
                        >
                          {isSelected && !day.isToday && (
                            <motion.div
                              layoutId="activeScheduleDayBubble"
                              className="absolute inset-0 bg-rams-bg border border-rams-rule rounded-sm -z-10"
                              transition={{ duration: 0.15, ease: "easeOut" }}
                            />
                          )}
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
                      className="mt-2 p-3 bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "w-10 h-10 rounded-sm flex items-center justify-center text-lg border border-rams-rule-light shrink-0 bg-rams-panel",
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
                          <span className="text-[11px] font-mono font-bold text-rams-ink bg-rams-panel border border-rams-rule-light px-2.5 py-1 rounded-sm whitespace-nowrap">
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
                  className="flex items-center justify-between p-3 bg-rams-panel border border-rams-rule-light rounded-sm shadow-none"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-10 h-10 shrink-0">
                      <img 
                        src={log.employees?.photo_url || log.photo_url} 
                        alt=""
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = 'none';
                          const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                          if (fallback) fallback.classList.remove('hidden');
                        }}
                        className="w-10 h-10 rounded-sm object-cover bg-rams-panel border border-rams-rule-light" 
                      />
                      <div className="avatar-fallback hidden w-10 h-10 rounded-sm bg-rams-bg flex items-center justify-center text-xs font-mono font-extrabold text-rams-ink border border-rams-rule-light absolute inset-0">
                        {namePart.slice(0, 2).toUpperCase()}
                      </div>
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-rams-ink truncate">{namePart}</p>
                      <p className="text-[10px] font-mono text-rams-ink-muted truncate">
                        {log.action_type === 'check_in' 
                          ? 'Checked In' 
                          : (new Date(log.timestamp).getHours() < 6 ? 'Checked Out (กะเมื่อวาน 🌙)' : 'Checked Out')}
                      </p>
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

      {/* Brand Footer */}
      <footer className="w-full text-center py-6 mt-4 text-[9px] font-mono tracking-[0.2em] text-rams-ink-muted uppercase select-none z-10">
        ONHAUS SYSTEM © {new Date().getFullYear()}
      </footer>

      {/* 5. Navigation Dock (The "Haus" Dock) */}
      <NavigationDock />





      {/* Camera & Mood (Modals in Dieter Rams Style) */}
      <AnimatePresence>
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-rams-bg flex flex-col items-center justify-center p-6"
          >
            <div className="absolute top-0 w-full p-6 flex justify-between items-center border-b border-rams-rule-light bg-rams-panel">
              <h3 className="text-lg font-mono font-bold text-rams-ink uppercase tracking-wider">Verify Location</h3>
              <button 
                onClick={() => setShowCamera(false)} 
                className="w-10 h-10 bg-rams-bg border border-rams-rule-light rounded-sm flex items-center justify-center font-bold active:translate-y-[1px] tactile-btn-sm"
                aria-label="Close camera"
              >
                ✕
              </button>
            </div>

            <div
              onClick={() => fileInputRef.current?.click()}
              className="relative w-full max-w-sm aspect-square bg-rams-panel rounded-sm border-2 border-dashed border-rams-rule hover:border-rams-orange flex flex-col items-center justify-center overflow-hidden active:translate-y-[2px] transition-[transform,border-color] duration-150 cursor-pointer"
            >
              {isUploading
                ? <div className="animate-spin w-12 h-12 border-4 border-rams-rule-light border-t-rams-orange rounded-full"></div>
                : <>
                  <CameraIcon className="w-14 h-14 stroke-current text-rams-ink mb-3" />
                  <span className="text-xs font-mono font-bold text-rams-ink-muted uppercase tracking-widest">Tap to Take Photo</span>
                </>
              }
            </div>

            <p className="mt-8 text-rams-ink-muted text-center text-xs font-mono font-bold uppercase tracking-wider leading-relaxed max-w-xs">Please take a clear photo of yourself within the shop area.</p>
            <input type="file" accept="image/*" capture="user" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
          </motion.div>
        )}

        {/* Punch Confirmation & Attendance Status Modal */}
        {showPunchModal && punchFeedback && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/40 backdrop-blur-sm"
              onClick={() => {
                setShowPunchModal(false);
                setPunchFeedback(null);
              }}
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 10 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 10 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full max-w-sm bg-rams-panel border-2 border-rams-rule rounded-sm p-6 shadow-2xl relative overflow-hidden z-10 space-y-4"
            >
              {/* Rams Decorative Status Top Bar */}
              <div className={cn(
                "h-1.5 w-full absolute top-0 inset-x-0",
                punchFeedback.action === 'check_in' 
                  ? (punchFeedback.isLate ? "bg-rams-amber" : "bg-rams-green")
                  : "bg-rams-ink"
              )} />

              {/* Status Header */}
              <div className="text-center pt-2">
                <div className={cn(
                  "w-14 h-14 rounded-sm mx-auto flex items-center justify-center mb-2.5 border shadow-sm",
                  punchFeedback.action === 'check_in'
                    ? (punchFeedback.isLate ? "bg-rams-amber/10 border-rams-amber/30 text-rams-amber" : "bg-rams-green/10 border-rams-green/30 text-rams-green")
                    : "bg-rams-ink text-rams-panel border-rams-rule"
                )}>
                  {punchFeedback.action === 'check_in' 
                    ? (punchFeedback.isLate ? <ClockIcon className="w-8 h-8 stroke-current" /> : <SunIcon className="w-8 h-8 stroke-current" />) 
                    : <MoonIcon className="w-8 h-8 stroke-current" />}
                </div>

                <span className="text-[10px] font-mono font-bold tracking-widest text-rams-ink-muted uppercase block">
                  {punchFeedback.action === 'check_in' ? 'CHECK-IN CONFIRMED' : 'CHECK-OUT CONFIRMED'}
                </span>

                <h3 className="text-lg font-mono font-extrabold text-rams-ink mt-0.5">
                  {punchFeedback.action === 'check_in' ? 'ลงเวลาเข้างานสำเร็จ!' : 'ลงเวลาออกงานสำเร็จ!'}
                </h3>
              </div>

              {/* Attendance Status Badge Card */}
              <div className="p-3.5 bg-rams-bg rounded-sm border border-rams-rule-light space-y-2.5">
                <div className="flex items-center justify-between pb-2 border-b border-rams-rule-light">
                  <span className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase">สถานะการลงเวลา</span>
                  <span className={cn(
                    "px-2 py-0.5 rounded-sm text-[10px] font-mono font-bold tracking-wide border",
                    punchFeedback.action === 'check_in'
                      ? (punchFeedback.statusCategory === 'LATE'
                          ? "bg-rams-red/10 text-rams-red border-rams-red/30 animate-pulse"
                          : punchFeedback.statusCategory === 'OFF_DAY'
                            ? "bg-rams-ink/10 text-rams-ink border-rams-rule-light"
                            : "bg-rams-green/10 text-rams-green border-rams-green/30")
                      : "bg-rams-panel text-rams-ink border-rams-rule-light"
                  )}>
                    {punchFeedback.statusLabel || (punchFeedback.action === 'check_in' ? 'ตรงเวลา (ปกติ ✓)' : 'ออกงานเรียบร้อย ✓')}
                  </span>
                </div>

                {/* Details Grid */}
                <div className="grid grid-cols-2 divide-x divide-rams-rule-light text-center">
                  <div className="pr-2">
                    <span className="text-[9px] font-mono text-rams-ink-muted block">เวลาบันทึก</span>
                    <span className="text-xs font-mono font-bold text-rams-ink mt-0.5 block">
                      {punchFeedback.timeFormatted ? `${punchFeedback.timeFormatted} น.` : format(new Date(), 'HH:mm น.')}
                    </span>
                  </div>

                  <div className="pl-2">
                    <span className="text-[9px] font-mono text-rams-ink-muted block">
                      {punchFeedback.action === 'check_in' ? 'กะการทำงาน' : 'รวมเวลาทำงาน'}
                    </span>
                    <span className="text-xs font-mono font-bold text-rams-ink mt-0.5 block truncate">
                      {punchFeedback.action === 'check_in'
                        ? (punchFeedback.shiftInfo?.startTime ? `${punchFeedback.shiftInfo.startTime} - ${punchFeedback.shiftInfo.endTime || ''}` : (punchFeedback.shiftInfo?.name || 'กะประจำ'))
                        : (punchFeedback.duration ? `${punchFeedback.duration.hours} ชม. ${punchFeedback.duration.minutes} น.` : 'เสร็จสิ้น')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Mood Selector Section */}
              <div className="space-y-2 pt-0.5">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase">
                    {selectedMood ? 'บันทึกอารมณ์แล้ว:' : 'รู้สึกอย่างไรตอนนี้?'}
                  </span>
                  {selectedMood && (
                    <span className="text-[10px] font-mono font-bold text-rams-orange truncate ml-2">
                      {selectedMood === '🔥' && 'มีพลังพร้อมลุย!'}
                      {selectedMood === '😊' && 'อารมณ์ดี สดชื่น!'}
                      {selectedMood === '😐' && 'ปกติ เรื่อยๆ'}
                      {selectedMood === '😴' && 'เหนื่อยหน่อย พักผ่อนนะ'}
                      {selectedMood === '🤒' && 'ไม่ค่อยสบาย ดูแลสุขภาพด้วยนะ'}
                    </span>
                  )}
                </div>

                <div className="grid grid-cols-5 gap-1.5">
                  {[
                    { emoji: '🔥', label: 'ฟิต' },
                    { emoji: '😊', label: 'ดี' },
                    { emoji: '😐', label: 'เฉย' },
                    { emoji: '😴', label: 'ง่วง' },
                    { emoji: '🤒', label: 'ป่วย' }
                  ].map((m) => (
                    <button
                      key={m.emoji}
                      onClick={() => handleMoodSelect(m.emoji)}
                      className={cn(
                        "py-2 rounded-sm border flex flex-col items-center justify-center transition-[transform,background-color,border-color] duration-150 active:translate-y-[1px] tactile-btn-sm cursor-pointer",
                        selectedMood === m.emoji
                          ? "bg-rams-orange text-white border-rams-rule shadow-sm"
                          : "bg-rams-bg hover:bg-rams-panel border-rams-rule-light text-rams-ink"
                      )}
                    >
                      <span className="text-lg font-emoji mb-0.5">{m.emoji}</span>
                      <span className="text-[8px] font-mono font-bold opacity-85">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Close / Acknowledge Button */}
              <button
                onClick={() => {
                  setShowPunchModal(false);
                  setPunchFeedback(null);
                }}
                className="w-full py-3 bg-rams-ink hover:bg-neutral-800 text-rams-panel rounded-sm text-xs font-mono font-bold border border-rams-rule transition-[transform,background-color] duration-150 active:translate-y-[1px] tactile-btn shadow-sm cursor-pointer"
              >
                ตกลง / เรียบร้อย ✓
              </button>
            </motion.div>
          </div>
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
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full bg-rams-panel border-t-2 border-rams-rule p-8 pb-12 pointer-events-auto relative rounded-t-sm"
            >
              <div className="w-12 h-1.5 bg-rams-rule rounded-full mx-auto mb-8"></div>
              <h3 className="text-lg font-mono font-bold text-rams-ink text-center mb-8 uppercase tracking-wider">How are you feeling?</h3>
              <div className="flex justify-center gap-4 flex-wrap">
                {['🔥', '😊', '😐', '😴', '🤒'].map((m) => (
                  <button
                    key={m}
                    onClick={() => handleMoodSelect(m)}
                    className="w-16 h-16 text-3xl flex items-center justify-center rounded-sm bg-rams-bg border-2 border-rams-rule hover:bg-rams-ink hover:text-rams-panel active:translate-y-[2px] transition-[transform,background-color,color] duration-150 tactile-btn font-emoji"
                  >
                    {m}
                  </button>
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
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
              className="w-full bg-rams-panel border-t-2 border-rams-rule p-8 pb-12 pointer-events-auto relative overflow-hidden rounded-t-sm"
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

              <div className="bg-rams-bg border border-rams-rule-light p-5 mb-6 relative rounded-sm">
                <p className="text-sm font-bold text-rams-ink leading-relaxed">
                  &ldquo;ทำได้ดีมาก! ขอบคุณสำหรับความทุ่มเทในวันนี้นะ 🐾&rdquo;
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
                className="w-full py-4 bg-rams-ink text-rams-panel rounded-sm text-sm font-mono font-bold border border-rams-rule hover:bg-neutral-800 active:translate-y-[2px] transition-[transform,background-color] duration-150 tactile-btn"
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