/* Brand v2 (Thai Twist Modern) · cream surface, plum header, one charcoal primary.
 * Type: SOV_monomon headings, IBM Plex Sans Thai body, DM Mono numbers. No icons or emoji.
 * Hallmark · pre-emit critique: P5 H5 E5 S5 R5 V5 */
"use client";
import { useEffect, useState, useRef } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { useRealtimeSync } from "../../lib/useRealtimeSync";
import { resizeImage } from "../../utils/imageResizer";
import Link from "next/link";
import { format, isSameDay, startOfWeek, addDays } from "date-fns";
import { th } from "date-fns/locale";
import { motion, AnimatePresence, MotionConfig } from "framer-motion";
import { clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import NavigationDock from "../_components/NavigationDock";

function cn(...inputs) {
  return twMerge(clsx(inputs));
}

import WeatherCard from "./components/WeatherCard";
import QRScannerModal from "./components/QRScannerModal";
import { sfx } from "../../utils/soundEffects";

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
  const [showQRScanner, setShowQRScanner] = useState(false);
  const [verifiedQrToken, setVerifiedQrToken] = useState(null);
  const [verifiedNfc, setVerifiedNfc] = useState(null); // { nfcToken, nfcStation }
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
  const [waterSipped, setWaterSipped] = useState(false);
  const [hasNewMeeting, setHasNewMeeting] = useState(false);

  // "ใหม่" marker on the meeting-notes link: newest note is later than the last
  // time this phone opened /meetings (never opened: posted in the last 7 days).
  useEffect(() => {
    if (!profile?.userId) return;
    let cancelled = false;
    fetch(`/api/meetings?userId=${encodeURIComponent(profile.userId)}&latest=1`, { cache: "no-store" })
      .then((r) => r.json())
      .then((json) => {
        if (cancelled || !json?.success || !json.latestAt) return;
        let lastSeen = null;
        try { lastSeen = window.localStorage.getItem("meetings_last_seen"); } catch {}
        const latest = new Date(json.latestAt).getTime();
        const isNew = lastSeen ? latest > new Date(lastSeen).getTime() : Date.now() - latest < 7 * 24 * 60 * 60 * 1000;
        setHasNewMeeting(isNew);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [profile?.userId]);

  // Dev Mode State (Disabled for plain security)
  const [devMode, setDevMode] = useState(false);
  const fileInputRef = useRef(null);
  const watchIdRef = useRef(null);

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

  // Load Acknowledged Announcements & Detect NFC Tag Parameters
  useEffect(() => {
    const saved = safeStorage.getItem("acknowledged_announcements");
    if (saved) {
      try { setDismissedIds(JSON.parse(saved)); } catch (e) {}
    }

    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);

        // Deep link from the LINE "new meeting note" card: liff.line.me/<id>?open=meetings
        const liffStateRaw = params.get('liff.state') || '';
        const openTarget = params.get('open') || new URLSearchParams(liffStateRaw.includes('?') ? liffStateRaw.split('?')[1] : liffStateRaw).get('open');
        if (openTarget === 'meetings') {
          window.location.replace('/meetings');
          return;
        }

        let nfcToken = params.get('nfc_token');
        let nfcStation = params.get('nfc_station') || 'BAR_PUNCH';

        // Also check inside liff.state if LINE redirected with encoded query
        const liffState = params.get('liff.state');
        if (!nfcToken && liffState) {
          const stateSearch = liffState.includes('?') ? liffState.split('?')[1] : liffState;
          const stateParams = new URLSearchParams(stateSearch);
          nfcToken = stateParams.get('nfc_token');
          nfcStation = stateParams.get('nfc_station') || nfcStation;
        }

        if (nfcToken) {
          const nfcPayload = { nfcToken, nfcStation };
          setVerifiedNfc(nfcPayload);
          safeStorage.setItem("active_nfc_session", JSON.stringify({ ...nfcPayload, ts: Date.now() }));
          setStatus(`พร้อมลงเวลา (NFC: ${nfcStation})`);
        } else {
          // Recover recent NFC tap across LIFF login redirect (valid for 5 minutes)
          const cachedNfc = safeStorage.getItem("active_nfc_session");
          if (cachedNfc) {
            const parsed = JSON.parse(cachedNfc);
            if (parsed?.nfcToken && (Date.now() - (parsed.ts || 0)) < 5 * 60 * 1000) {
              setVerifiedNfc({ nfcToken: parsed.nfcToken, nfcStation: parsed.nfcStation || 'BAR_PUNCH' });
              setStatus(`พร้อมลงเวลา (NFC: ${parsed.nfcStation || 'BAR_PUNCH'})`);
            }
          }
        }
      } catch (e) {
        console.warn("NFC param parse warning:", e);
      }
    }
  }, []);

  const onGeoSuccess = (position) => {
    const { latitude, longitude, accuracy } = position.coords;
    setUserPosition({ lat: latitude, lon: longitude, accuracy });

    const dist = getDistanceFromLatLonInKm(latitude, longitude, SHOP_LAT, SHOP_LONG);
    if (dist <= ALLOWED_RADIUS_KM) {
      if (!status.includes("Ready") && !status.includes("พร้อม")) setStatus("พร้อมลงเวลา (อยู่ในพื้นที่ร้าน)");
      // Clear watch to preserve mobile battery once locked securely within shop
      if (accuracy <= 35 && watchIdRef.current) {
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
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
        watchIdRef.current = navigator.geolocation.watchPosition(onGeoSuccess, onGeoError, { enableHighAccuracy: true });
      } else {
        setStatus("GPS Not Supported");
      }

      fetchAnnouncement();
      fetchRecents();
    };
    init();

    return () => {
      clearInterval(timer);
      if (watchIdRef.current) navigator.geolocation.clearWatch(watchIdRef.current);
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
    sfx.playTactileClick();
    sfx.triggerHaptic([20, 35]);

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
      alert("บัญชีของคุณอยู่ระหว่างรอการอนุมัติสิทธิ์จากผู้จัดการ");
      return;
    }

    if (isUploading || isSubmitting) return;
    const isHardwareVerified = Boolean(verifiedNfc?.nfcToken || verifiedQrToken);
    if (!devMode && !isHardwareVerified && !status.includes("Ready") && !status.includes("พร้อม")) {
      alert("คุณอยู่นอกพื้นที่ร้าน หรือสัญญาณ GPS ในอาคารยังไม่นิ่ง\n💡 สามารถแตะแผ่น NFC ที่เคาน์เตอร์บาร์ หรือกดปุ่ม 'ยืนยันพิกัดด้วย NFC หรือ QR' ด้านล่างเพื่อลงเวลาได้ทันที");
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
          ctx.fillText(`IN THE HAUS · ${actionLabel.toUpperCase()} · ${staffName || 'STAFF'}`, pad + dotRadius * 2 + 8, h - barH + Math.round(barH * 0.38));

          // Sub line: High-Precision Timestamp & Telemetry
          ctx.fillStyle = '#9ca3af'; // Rams Ink Muted
          ctx.font = `${Math.max(10, Math.round(barH * 0.165))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
          ctx.fillText(`TIMESTAMP: ${dateText} ICT · LOC: ${locText.toUpperCase()}`, pad, h - barH + Math.round(barH * 0.74));

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
          qrToken: verifiedQrToken || null,
          nfcToken: verifiedNfc?.nfcToken || null,
          nfcStation: verifiedNfc?.nfcStation || null,
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

      // Audio & Haptic celebration
      sfx.playSuccessChime();
      sfx.triggerHaptic([25, 50, 25]);

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
      setWaterSipped(false);
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
      const locText = verifiedNfc?.nfcStation
        ? `NFC STATION: ${verifiedNfc.nfcStation} (VERIFIED)`
        : verifiedQrToken
          ? 'POS QR TERMINAL (VERIFIED)'
          : (status.includes('Ready') || status.includes('พร้อม') ? 'IN THE HAUS HQ (VERIFIED)' : 'GPS VERIFIED');
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

  // --- Brand v2 display helpers (text only, no icons / emoji) ---
  const plain = (s) => String(s ?? '').replace(/[\p{Extended_Pictographic}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();
  const isReady = status.includes('Ready') || status.includes('พร้อม');
  const STATUS_TH = {
    'Checking...': 'กำลังตรวจสอบพิกัด…',
    'LIFF Error': 'เชื่อมต่อ LINE ไม่สำเร็จ',
    'GPS Not Supported': 'เครื่องนี้ไม่รองรับ GPS',
    'New User': 'ยังไม่ได้ลงทะเบียน',
    'Pending Approval': 'รอแอดมินอนุมัติ',
  };
  const LEAVE_TH = { sick: 'ลาป่วย', business: 'ลากิจ' };
  const leaveLabel = (type) => LEAVE_TH[type] || 'ลาพักร้อน';
  const MOODS = [
    { emoji: '🔥', label: 'ฟิต', note: 'มีพลังพร้อมลุย' },
    { emoji: '😊', label: 'ดี', note: 'อารมณ์ดี สดชื่น' },
    { emoji: '😐', label: 'เฉย', note: 'ปกติ เรื่อย ๆ' },
    { emoji: '😴', label: 'ง่วง', note: 'เหนื่อยหน่อย พักผ่อนนะ' },
    { emoji: '🤒', label: 'ป่วย', note: 'ดูแลสุขภาพด้วยนะ' },
  ];
  const moodLabel = (m) => MOODS.find((x) => x.emoji === m)?.label || '';
  const tap = { whileTap: { scale: 0.98 }, transition: { duration: 0.12, ease: 'easeOut' } };
  const fadeIn = { initial: { opacity: 0, y: 4 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.16, ease: 'easeOut' } };

  // Main action: one charcoal primary per screen, Thai first
  const isLate = !isOwner && shiftContext?.isLate && lastAction !== 'check_in';
  let mainButtonConfig = { label: 'เข้างาน', en: 'CHECK IN', sub: 'ถ่ายรูปยืนยันตัวตน', tone: 'primary' };
  if (lastAction === 'register') {
    mainButtonConfig = { label: 'ลงทะเบียน', en: 'REGISTER', sub: 'ขอสิทธิ์ใช้งาน', tone: 'primary' };
  } else if (lastAction === 'pending') {
    mainButtonConfig = { label: 'รออนุมัติ', en: 'PENDING', sub: 'แอดมินกำลังตรวจสอบ', tone: 'waiting' };
  } else if (lastAction === 'check_in') {
    mainButtonConfig = { label: 'ออกงาน', en: 'CHECK OUT', sub: 'พักผ่อนให้เต็มที่', tone: 'primary' };
  } else if (isLate) {
    mainButtonConfig = { label: 'เข้างาน', en: 'CHECK IN · LATE', sub: 'เลยเวลาเข้ากะแล้ว', tone: 'primary' };
  }
  const mainButtonClass = mainButtonConfig.tone === 'waiting'
    ? 'bg-paper-2 text-subtle border border-charcoal'
    : 'bg-charcoal text-cream hover:bg-charcoal-2 border border-charcoal';

  const displayStatus = isOwner
    ? (isReady ? 'เจ้าของร้าน · อยู่ในพื้นที่ร้าน' : 'เจ้าของร้าน · ไม่ต้องลงเวลา')
    : plain(STATUS_TH[status] || status);

  const sectionLabel = 'text-sm font-semibold text-neutral';
  const card = 'w-full bg-cream border border-rule';

  return (
    <MotionConfig reducedMotion="user">
    <div className="brand-v2 min-h-screen flex flex-col items-center relative overflow-x-clip pb-36">

      {/* 1. Header: plum bar, two cells */}
      <header className="w-full sticky top-0 z-20 bg-plum text-cream border-b border-plum-3">
        <div className="mx-auto max-w-sm px-4 flex items-stretch">
          <div className="flex-1 pr-4 py-2 flex items-center min-w-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/logo-inbaan-wordmark-cream-96.png" alt="ในบ้าน" width={80} height={44} className="h-11 w-auto shrink-0" />
          </div>
          <div className="border-l border-plum-3 px-4 py-3 flex items-center gap-3 min-w-0">
            {profile ? (
              <>
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(profile.userId);
                    alert("คัดลอก User ID แล้ว");
                  }}
                  className="min-h-12 flex flex-col items-end justify-center min-w-0 text-right group"
                  title="แตะเพื่อคัดลอก User ID"
                >
                  <span className="text-base font-semibold truncate max-w-[9rem]">{profile.displayName}</span>
                  <span className="text-sm text-on-plum-2 group-hover:text-cream truncate max-w-[9rem]">
                    {isOwner ? 'เจ้าของร้าน' : (employeeData?.position || (lastAction === 'pending' ? 'รออนุมัติ' : 'พนักงาน'))}
                  </span>
                </button>
                <div className="relative w-10 h-10 shrink-0">
                  {profile.pictureUrl && (
                    <img
                      src={profile.pictureUrl}
                      alt=""
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                        const fallback = e.currentTarget.parentElement?.querySelector('.avatar-header-fallback');
                        if (fallback) fallback.classList.remove('hidden');
                      }}
                      className="w-10 h-10 object-cover border border-plum-3"
                    />
                  )}
                  <div className={cn("avatar-header-fallback w-10 h-10 bg-plum-2 flex items-center justify-center font-num text-sm border border-plum-3 absolute inset-0", profile.pictureUrl && "hidden")}>
                    {(profile.displayName || "U").slice(0, 2).toUpperCase()}
                  </div>
                </div>
              </>
            ) : (
              <button
                type="button"
                onClick={handleLineLogin}
                className="min-h-12 px-4 bg-plum-2 hover:bg-plum-3 text-cream border border-plum-3 text-base font-semibold transition-colors duration-150"
              >
                เข้าสู่ระบบ LINE
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="w-full max-w-sm px-4 flex flex-col gap-4 mt-4 z-10">

        {/* 2. Today's shift */}
        <AnimatePresence>
          {shiftContext && (
            <motion.section {...fadeIn} className={cn(card, "flex items-stretch")}>
              <div className="flex-1 px-4 py-3">
                <p className={sectionLabel}>กะวันนี้</p>
                <p className="font-num text-xl text-charcoal">
                  {shiftContext.start.slice(0, 5)}–{shiftContext.end.slice(0, 5)}
                </p>
              </div>
              {isLate && (
                <div className="bg-plum text-cream px-4 flex flex-col justify-center items-center">
                  <span className="text-base font-semibold">สาย</span>
                  <span className="font-num text-xs text-on-plum-2">LATE</span>
                </div>
              )}
            </motion.section>
          )}
        </AnimatePresence>

        {/* 3. Clock + status */}
        <section className={card}>
          <div className="px-4 pt-5 pb-4 text-center">
            <p className="font-num text-[4.5rem] leading-none text-charcoal tabular-nums select-none">
              {currentTime ? format(currentTime, "HH:mm") : "--:--"}
            </p>
            <p className="text-base text-subtle mt-3">
              {currentTime ? format(currentTime, "EEEEที่ d MMMM yyyy", { locale: th }) : "กำลังโหลด…"}
            </p>
          </div>
          <div className="border-t border-rule px-4 py-3 flex items-baseline justify-between gap-3">
            <span className={cn(sectionLabel, "shrink-0")}>สถานะ</span>
            <span className={cn("text-base text-right", isReady || isOwner ? "text-charcoal font-semibold" : "text-plum font-semibold")}>
              {displayStatus}
            </span>
          </div>
          {!isOwner && lastAction !== 'check_in' && shiftContext && !isLate && (
            <p className="border-t border-rule px-4 py-3 text-base text-plum">มาก่อนเวลา เยี่ยมไปเลย</p>
          )}
        </section>

        {/* Main action */}
        {!status.includes('Checking') && (
          isOwner ? (
            /* Owner hub */
            <section className="flex flex-col gap-4">
              <motion.div {...fadeIn} className={card}>
                <div className="px-4 py-4">
                  <h2 className="font-head text-2xl text-charcoal">สวัสดีครับคุณ {employeeData?.nickname || employeeData?.name}</h2>
                  <p className="text-base text-subtle mt-2">
                    ตำแหน่งนี้ไม่ต้องลงเวลาเข้า-ออก และไม่ถูกนับขาดงาน เข้าเมนูบริหารร้านได้ทันที
                  </p>
                </div>
                <div className="grid grid-cols-2 border-t border-rule divide-x divide-rule">
                  <div className="px-4 py-3">
                    <p className={sectionLabel}>สิทธิ์</p>
                    <p className="text-base font-semibold">ผู้บริหาร</p>
                  </div>
                  <div className="px-4 py-3">
                    <p className={sectionLabel}>การลงเวลา</p>
                    <p className="text-base font-semibold">ไม่บังคับ</p>
                  </div>
                </div>
              </motion.div>

              <nav aria-label="เมนูเจ้าของร้าน" className="grid grid-cols-2 gap-px bg-rule border border-rule">
                {[
                  { href: '/admin', th: 'หลังบ้าน HR', en: 'ADMIN' },
                  { href: '/shifts', th: 'ตารางกะทีม', en: 'ROSTER' },
                  { href: '/admin/report/espresso', th: 'รายงานบาร์', en: 'ESPRESSO' },
                  { href: 'https://haustable.vercel.app/staff/stock', th: 'เช็คสต็อก', en: 'STOCK' },
                ].map((l) => (
                  <Link
                    key={l.href}
                    href={l.href}
                    className="bg-cream hover:bg-paper-2 min-h-[72px] px-4 py-3 flex flex-col justify-between transition-colors duration-150"
                  >
                    <span className="text-base font-semibold text-charcoal">{l.th}</span>
                    <span className="font-num text-xs text-neutral tracking-[0.08em]">{l.en}</span>
                  </Link>
                ))}
              </nav>

              <div className={card}>
                <button
                  type="button"
                  onClick={() => setShowOptionalPunch(!showOptionalPunch)}
                  aria-expanded={showOptionalPunch}
                  className="w-full min-h-12 px-4 flex items-center justify-between text-base text-charcoal hover:bg-paper-2 transition-colors duration-150"
                >
                  <span>ลงเวลาไว้ดูย้อนหลัง (ไม่บังคับ)</span>
                  <span className="text-sm text-neutral">{showOptionalPunch ? 'ซ่อน' : 'เปิด'}</span>
                </button>
                <AnimatePresence initial={false}>
                  {showOptionalPunch && (
                    <motion.div {...fadeIn} exit={{ opacity: 0 }} className="border-t border-rule p-4">
                      <motion.button
                        type="button"
                        {...tap}
                        onClick={handleStartCheckIn}
                        disabled={isSubmitting}
                        className={cn("w-full min-h-14 text-lg font-semibold disabled:opacity-50 transition-colors duration-150", mainButtonClass)}
                      >
                        {isSubmitting ? "กำลังบันทึก…" : mainButtonConfig.label}
                      </motion.button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>
          ) : (
            /* Staff check-in / check-out */
            <section className="flex flex-col gap-2">
              {(verifiedNfc || verifiedQrToken) && (
                <motion.div {...fadeIn} className={cn(card, "px-4 py-3 flex items-center justify-between gap-3")}>
                  <span className="text-base text-charcoal">
                    {verifiedNfc ? <>ยืนยันพิกัดด้วย NFC <span className="font-num">{verifiedNfc.nfcStation}</span></> : 'ยืนยันพิกัดด้วย QR จากจอ POS'}
                  </span>
                  <span className="text-sm font-semibold text-plum shrink-0">พร้อม</span>
                </motion.div>
              )}

              <motion.button
                type="button"
                {...tap}
                onClick={handleStartCheckIn}
                disabled={isSubmitting}
                className={cn("w-full min-h-[88px] px-4 py-4 flex flex-col items-center justify-center text-center select-none disabled:opacity-50 transition-colors duration-150", mainButtonClass)}
              >
                <span className="text-2xl font-semibold">
                  {isSubmitting ? "กำลังบันทึก…" : mainButtonConfig.label}
                </span>
                <span className="text-base opacity-80 mt-1">
                  {verifiedNfc ? 'แตะเพื่อถ่ายรูปลงเวลา' : mainButtonConfig.sub}
                </span>
                <span className="font-num text-xs tracking-[0.14em] opacity-70 mt-1">{mainButtonConfig.en}</span>
              </motion.button>

              {lastAction === 'check_in' && (
                <p className="border border-rule bg-cream px-4 py-3 text-sm text-subtle">
                  ออกไปธุระระหว่างวัน: กด <span className="font-semibold text-charcoal">ออกงาน</span> ก่อนออกจากร้าน แล้วกด <span className="font-semibold text-charcoal">เข้างาน</span> อีกครั้งเมื่อกลับ ระบบจะนับเวลาที่ออกไปให้ ไม่นับเป็นมาสาย
                </p>
              )}

              <button
                type="button"
                onClick={() => setShowQRScanner(true)}
                className="w-full min-h-12 px-4 py-3 bg-cream hover:bg-paper-2 border border-charcoal flex items-center justify-between gap-3 text-left transition-colors duration-150"
              >
                <span className="text-base text-charcoal">GPS ในร้านคลาดเคลื่อน? ยืนยันด้วย NFC หรือ QR</span>
                <span className="text-sm font-semibold text-plum shrink-0">เปิด</span>
              </button>
            </section>
          )
        )}

        {/* Bulletin & dashboard */}
        {(() => {
          const allAnnouncements = announcements.length > 0 ? announcements : (activeAnnouncement ? [activeAnnouncement] : []);
          const fixedAnnouncements = allAnnouncements.filter(a => a.expires_at === null);
          const temporaryAnnouncements = allAnnouncements.filter(a => a.expires_at !== null && !dismissedIds.includes(a.id));

          return (
            <>
              {/* Pinned announcements */}
              {fixedAnnouncements.map((a) => (
                <motion.article key={`fixed-${a.id}`} {...fadeIn} className={card}>
                  {a.priority > 1 && (
                    <div className="bg-plum text-cream px-4 py-2 text-sm font-semibold">ประกาศสำคัญ</div>
                  )}
                  <div className="px-4 py-3">
                    <p className={sectionLabel}>ปักหมุด</p>
                    <p className="text-base text-charcoal break-words mt-1">{a.message}</p>
                  </div>
                </motion.article>
              ))}

              {/* Temporary announcements */}
              <AnimatePresence>
                {temporaryAnnouncements.map((a) => {
                  let expLabel = '';
                  if (a.expires_at) {
                    const diffMs = new Date(a.expires_at) - new Date();
                    if (diffMs > 0) {
                      const diffHrs = Math.floor(diffMs / (1000 * 60 * 60));
                      const diffMins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
                      expLabel = diffHrs > 0 ? `หมดเวลาใน ${diffHrs} ชม.` : `หมดเวลาใน ${diffMins} นาที`;
                    } else {
                      expLabel = 'หมดเวลาแล้ว';
                    }
                  }
                  const isUrgent = a.priority > 1;

                  return (
                    <motion.article
                      key={`temp-${a.id}`}
                      {...fadeIn}
                      exit={{ opacity: 0, transition: { duration: 0.12 } }}
                      className={card}
                    >
                      {isUrgent && (
                        <div className="bg-plum text-cream px-4 py-2 text-sm font-semibold">ประกาศสำคัญ</div>
                      )}
                      <div className="px-4 py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <p className={sectionLabel}>ข่าวจากร้าน</p>
                          {expLabel && <p className="text-sm text-neutral">{expLabel}</p>}
                        </div>
                        <p className="text-base text-charcoal break-words mt-1">{a.message}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDismissAnnouncement(a.id)}
                        className="w-full min-h-12 border-t border-rule text-base font-semibold text-plum hover:bg-paper-2 transition-colors duration-150"
                      >
                        รับทราบ
                      </button>
                    </motion.article>
                  );
                })}
              </AnimatePresence>

              {/* Leaves */}
              {(approvedLeaves.length > 0 || myPendingLeaves.length > 0) && (
                <section className={card}>
                  <div className="px-4 py-3 border-b border-rule flex items-baseline justify-between gap-3">
                    <h3 className="text-base font-semibold text-charcoal">การลาหยุด</h3>
                    <span className="text-sm text-neutral">{format(currentTime || new Date(), "d MMMM yyyy", { locale: th })}</span>
                  </div>

                  {approvedLeaves.length > 0 ? (
                    <ul className="divide-y divide-rule">
                      {approvedLeaves.map((l) => {
                        const empName = l.employees?.nickname || l.employees?.name?.split(' ')[0] || 'พนักงาน';
                        const isTodayLeave = l.leave_date === format(new Date(), 'yyyy-MM-dd');
                        return (
                          <li key={l.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="flex items-center gap-3 min-w-0">
                              <div className="relative w-10 h-10 shrink-0">
                                {l.employees?.photo_url && (
                                  <img
                                    src={l.employees.photo_url}
                                    alt=""
                                    referrerPolicy="no-referrer"
                                    onError={(e) => {
                                      e.currentTarget.style.display = 'none';
                                      const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                                      if (fallback) fallback.classList.remove('hidden');
                                    }}
                                    className="w-10 h-10 object-cover border border-rule"
                                  />
                                )}
                                <div className={cn("avatar-fallback w-10 h-10 bg-paper-2 flex items-center justify-center font-num text-sm border border-rule absolute inset-0", l.employees?.photo_url && "hidden")}>
                                  {empName.slice(0, 2).toUpperCase()}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <p className="text-base font-semibold text-charcoal truncate">{empName}</p>
                                <p className="text-sm text-neutral truncate">{leaveLabel(l.leave_type)} · {l.reason || 'ธุระส่วนตัว'}</p>
                              </div>
                            </div>
                            {isTodayLeave ? (
                              <span className="shrink-0 bg-plum text-cream px-2 py-1 text-sm font-semibold">วันนี้</span>
                            ) : (
                              <span className="shrink-0 text-sm text-subtle">{format(new Date(l.leave_date), 'd MMM', { locale: th })}</span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  ) : (
                    <p className="px-4 py-3 text-base text-neutral">ช่วงนี้ไม่มีใครลาหยุด</p>
                  )}

                  {myPendingLeaves.length > 0 && (
                    <div className="px-4 py-3 border-t border-rule">
                      <p className={sectionLabel}>คำขอลาของคุณที่รออนุมัติ</p>
                      <ul className="mt-1">
                        {myPendingLeaves.slice(0, 2).map((l, idx) => (
                          <li key={idx} className="text-base text-plum">
                            {leaveLabel(l.leave_type)} วันที่ <span className="font-num">{format(new Date(l.leave_date), 'dd/MM')}</span>
                          </li>
                        ))}
                      </ul>
                      {myPendingLeaves.length > 2 && (
                        <p className="text-sm text-neutral mt-1">และอีก {myPendingLeaves.length - 2} รายการ</p>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* Weekly schedule */}
              {weeklySchedule.length > 0 && (
                <section className={card}>
                  <div className="px-4 py-3 border-b border-rule">
                    <h3 className="text-base font-semibold text-charcoal">ตารางงานสัปดาห์นี้</h3>
                  </div>
                  <div className="grid grid-cols-7 gap-px bg-rule">
                    {weeklySchedule.map((day, idx) => {
                      const dayInitialsMap = { Mon: 'จ', Tue: 'อ', Wed: 'พ', Thu: 'พฤ', Fri: 'ศ', Sat: 'ส', Sun: 'อา' };
                      const thaiInitial = dayInitialsMap[day.dayName] || day.dayName;
                      const timeDisplay = day.isLeave ? 'ลา' : day.isOff ? 'หยุด' : (day.shiftTime ? day.shiftTime.split('-')[0] : 'งาน');
                      const isSelected = selectedDaySchedule?.dateStr === day.dateStr;

                      return (
                        <button
                          type="button"
                          key={idx}
                          onClick={() => setSelectedDaySchedule(day)}
                          aria-pressed={isSelected}
                          className={cn(
                            "min-h-[76px] min-w-0 py-2 flex flex-col items-center justify-between text-center select-none transition-colors duration-150",
                            day.isToday ? "bg-charcoal text-cream" : "bg-cream text-charcoal hover:bg-paper-2",
                            isSelected && "ring-2 ring-inset ring-plum"
                          )}
                        >
                          <span className={cn("text-sm", day.isToday ? "text-cream" : "text-neutral")}>{thaiInitial}</span>
                          <span className="font-num text-base">{day.dateNum}</span>
                          <span className={cn(
                            "text-[13px] !leading-5 whitespace-nowrap",
                            !day.isLeave && !day.isOff && day.shiftTime && "font-num text-xs",
                            day.isToday ? "text-cream" : day.isLeave ? "text-plum font-semibold" : day.isOff ? "text-neutral" : "text-charcoal"
                          )}>
                            {timeDisplay}
                          </span>
                        </button>
                      );
                    })}
                  </div>

                  {selectedDaySchedule && (
                    <motion.div
                      key={selectedDaySchedule.dateStr}
                      {...fadeIn}
                      className="px-4 py-3 border-t border-rule flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-sm text-neutral">
                          {format(selectedDaySchedule.date, 'EEEE d MMMM', { locale: th })}{selectedDaySchedule.isToday && ' · วันนี้'}
                        </p>
                        <p className="text-base font-semibold text-charcoal">
                          {selectedDaySchedule.isLeave
                            ? leaveLabel(selectedDaySchedule.leaveType)
                            : selectedDaySchedule.isOff
                              ? 'วันหยุด'
                              : selectedDaySchedule.shiftName || 'กะงาน'}
                        </p>
                      </div>
                      {!selectedDaySchedule.isOff && !selectedDaySchedule.isLeave && selectedDaySchedule.shiftTime && (
                        <span className="font-num text-base text-charcoal shrink-0">{selectedDaySchedule.shiftTime}</span>
                      )}
                    </motion.div>
                  )}
                </section>
              )}
            </>
          );
        })()}

        {/* Links: one bordered group, rows split by 1px rules */}
        <nav aria-label="ลิงก์อื่น ๆ" className="w-full border border-charcoal divide-y divide-rule bg-cream">
          <Link
            href="/meetings"
            className="min-h-12 px-4 py-3 flex items-center justify-between gap-3 hover:bg-paper-2 transition-colors duration-150"
          >
            <span className="min-w-0">
              <span className="block text-base font-semibold text-charcoal">บันทึกการประชุม</span>
              <span className="block text-sm text-neutral">{hasNewMeeting ? "มีบันทึกใหม่ที่ยังไม่ได้อ่าน" : "อ่านสรุปการประชุมของทีม"}</span>
            </span>
            {hasNewMeeting ? (
              <span className="shrink-0 bg-plum text-cream px-2 py-1 text-sm font-semibold">ใหม่</span>
            ) : (
              <span className="font-num text-xs text-neutral tracking-[0.08em] shrink-0">PDF</span>
            )}
          </Link>
          <Link
            href="https://forms.gle/3LdW9zdjdTCpfpTe8"
            target="_blank"
            className="min-h-12 px-4 py-3 flex items-center justify-between gap-3 hover:bg-paper-2 transition-colors duration-150"
          >
            <span className="text-base text-charcoal">ขอเบิกเงินล่วงหน้า</span>
            <span className="font-num text-xs text-neutral tracking-[0.08em] shrink-0">GOOGLE FORM</span>
          </Link>
        </nav>

        {/* 4. Weather */}
        <AnimatePresence>
          {userPosition && (
            <WeatherCard
              latitude={userPosition.lat}
              longitude={userPosition.lon}
              locationName={isReady ? 'In The Haus' : 'นอกร้าน'}
            />
          )}
        </AnimatePresence>

        {/* Recent activity */}
        {recentCheckins.length > 0 && (
          <section className={card}>
            <div className="px-4 py-3 border-b border-rule flex items-baseline justify-between gap-3">
              <h3 className="text-base font-semibold text-charcoal">กิจกรรมล่าสุด</h3>
              <span className="font-num text-xs text-neutral tracking-[0.08em]">RECENT</span>
            </div>
            <ul className="divide-y divide-rule">
              <AnimatePresence initial={false}>
                {recentCheckins.slice(0, 3).map((log) => {
                  const namePart = log.employees?.nickname || log.employees?.name?.split(' ')[0] || 'พนักงาน';
                  const photo = log.employees?.photo_url || log.photo_url;
                  const mood = moodLabel(log.mood_status);
                  return (
                    <motion.li key={log.id} {...fadeIn} className="px-4 py-3 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative w-10 h-10 shrink-0">
                          {photo && (
                            <img
                              src={photo}
                              alt=""
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                e.currentTarget.style.display = 'none';
                                const fallback = e.currentTarget.parentElement?.querySelector('.avatar-fallback');
                                if (fallback) fallback.classList.remove('hidden');
                              }}
                              className="w-10 h-10 object-cover border border-rule"
                            />
                          )}
                          <div className={cn("avatar-fallback w-10 h-10 bg-paper-2 flex items-center justify-center font-num text-sm border border-rule absolute inset-0", photo && "hidden")}>
                            {namePart.slice(0, 2).toUpperCase()}
                          </div>
                        </div>
                        <div className="min-w-0">
                          <p className="text-base font-semibold text-charcoal truncate">{namePart}</p>
                          <p className="text-sm text-neutral truncate">
                            {log.action_type === 'check_in'
                              ? 'เข้างาน'
                              : (new Date(log.timestamp).getHours() < 6 ? 'ออกงาน (กะเมื่อวาน)' : 'ออกงาน')}
                            {mood && ` · ${mood}`}
                          </p>
                        </div>
                      </div>
                      <span className="font-num text-base text-charcoal shrink-0">{format(new Date(log.timestamp), "HH:mm")}</span>
                    </motion.li>
                  );
                })}
              </AnimatePresence>
            </ul>
          </section>
        )}
      </main>

      <footer className="w-full text-center py-6 mt-4 font-num text-xs tracking-[0.16em] text-neutral select-none">
        ONHAUS SYSTEM © {new Date().getFullYear()}
      </footer>

      {/* 5. Navigation dock */}
      <NavigationDock />

      {/* NFC / QR scanner */}
      <QRScannerModal
        isOpen={showQRScanner}
        onClose={() => setShowQRScanner(false)}
        onScanSuccess={(token) => {
          setVerifiedQrToken(token);
          setStatus("พร้อมลงเวลา (ยืนยันผ่าน QR ร้าน)");
        }}
        onNfcSuccess={({ nfcToken, nfcStation }) => {
          setVerifiedNfc({ nfcToken, nfcStation });
          safeStorage.setItem("active_nfc_session", JSON.stringify({ nfcToken, nfcStation, ts: Date.now() }));
          setStatus(`พร้อมลงเวลา (NFC: ${nfcStation})`);
        }}
      />

      <AnimatePresence>
        {/* Camera */}
        {showCamera && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.16 }}
            className="brand-v2 fixed inset-0 z-50 flex flex-col"
          >
            <div className="bg-plum text-cream border-b border-plum-3 flex items-stretch">
              <h3 className="flex-1 px-4 py-3 font-head text-2xl self-center">ถ่ายรูปยืนยัน</h3>
              <button
                type="button"
                onClick={() => setShowCamera(false)}
                className="min-w-16 min-h-14 px-4 border-l border-plum-3 text-base font-semibold hover:bg-plum-2 transition-colors duration-150"
              >
                ปิด
              </button>
            </div>

            <div className="flex-1 flex flex-col items-center justify-center p-4">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isUploading}
                className="w-full max-w-sm aspect-square bg-paper-2 hover:bg-paper-3 border border-charcoal flex flex-col items-center justify-center gap-2 transition-colors duration-150"
              >
                <span className="text-xl font-semibold text-charcoal">
                  {isUploading ? 'กำลังอัปโหลด…' : 'แตะเพื่อถ่ายรูป'}
                </span>
                <span className="font-num text-xs text-neutral tracking-[0.12em]">{isUploading ? 'UPLOADING' : 'TAP TO TAKE PHOTO'}</span>
              </button>
              <p className="mt-6 text-base text-subtle text-center max-w-xs">ถ่ายรูปตัวเองให้ชัด ภายในพื้นที่ร้าน</p>
              <input type="file" accept="image/*" capture="user" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            </div>
          </motion.div>
        )}

        {/* Punch confirmation */}
        {showPunchModal && punchFeedback && (
          <div className="brand-v2 !bg-transparent fixed inset-0 z-50 flex items-center justify-center p-4 select-none">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.16 }}
              className="absolute inset-0 bg-charcoal/50"
              onClick={() => {
                setShowPunchModal(false);
                setPunchFeedback(null);
              }}
            />
            <motion.div
              role="dialog"
              aria-modal="true"
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.98 }}
              transition={{ duration: 0.16, ease: 'easeOut' }}
              className="w-full max-w-sm bg-cream border border-charcoal relative z-10 max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="bg-plum text-cream px-4 py-4">
                <p className="font-num text-xs tracking-[0.14em] text-on-plum-2">
                  {punchFeedback.action === 'check_in' ? 'CHECK-IN CONFIRMED' : 'CHECK-OUT CONFIRMED'}
                </p>
                <h3 className="font-head text-2xl mt-1">
                  {punchFeedback.action === 'check_in' ? 'ลงเวลาเข้างานแล้ว' : 'ลงเวลาออกงานแล้ว'}
                </h3>
              </div>

              <div className="px-4 py-3 border-b border-rule flex items-center justify-between gap-3">
                <span className={sectionLabel}>สถานะ</span>
                <span className={cn(
                  "px-2 py-1 text-sm font-semibold text-right",
                  punchFeedback.action === 'check_in' && punchFeedback.statusCategory === 'LATE'
                    ? "bg-plum text-cream"
                    : "border border-charcoal text-charcoal"
                )}>
                  {plain(punchFeedback.statusLabel) || (punchFeedback.action === 'check_in' ? 'ตรงเวลา' : 'ออกงานเรียบร้อย')}
                </span>
              </div>

              <div className="grid grid-cols-2 divide-x divide-rule border-b border-rule">
                <div className="px-4 py-3">
                  <p className={sectionLabel}>เวลาบันทึก</p>
                  <p className="font-num text-2xl text-charcoal mt-1">
                    {punchFeedback.timeFormatted || format(new Date(), 'HH:mm')}
                  </p>
                </div>
                <div className="px-4 py-3 min-w-0">
                  <p className={sectionLabel}>{punchFeedback.action === 'check_in' ? 'กะการทำงาน' : 'รวมเวลาทำงาน'}</p>
                  <p className={cn("text-charcoal mt-1 truncate", punchFeedback.action === 'check_in' ? (punchFeedback.shiftInfo?.startTime ? "font-num text-lg" : "text-base font-semibold") : "font-num text-2xl")}>
                    {punchFeedback.action === 'check_in'
                      ? (punchFeedback.shiftInfo?.startTime ? `${punchFeedback.shiftInfo.startTime}–${punchFeedback.shiftInfo.endTime || ''}` : (punchFeedback.shiftInfo?.name || 'กะประจำ'))
                      : (punchFeedback.duration ? `${punchFeedback.duration.hours}:${String(punchFeedback.duration.minutes).padStart(2, '0')}` : 'เสร็จสิ้น')}
                  </p>
                  {punchFeedback.action !== 'check_in' && punchFeedback.duration && (
                    <p className="text-sm text-neutral">ชั่วโมง:นาที</p>
                  )}
                </div>
              </div>

              {punchFeedback.action === 'check_in' ? (
                <div className="px-4 py-3 border-b border-rule flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-base font-semibold text-charcoal">รับน้ำเย็นจากยูซุสักแก้ว</p>
                    <p className="text-sm text-neutral">
                      {waterSipped ? 'ชื่นใจ เติมพลังเต็มแล้ว ลุยเลย' : 'เติมความสดชื่นก่อนเริ่มกะ'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      sfx.playWaterDrop();
                      sfx.triggerHaptic([20, 40]);
                      setWaterSipped(true);
                    }}
                    disabled={waterSipped}
                    className="shrink-0 min-h-12 px-4 bg-plum hover:bg-plum-2 disabled:bg-paper-2 disabled:text-neutral text-cream text-base font-semibold transition-colors duration-150"
                  >
                    {waterSipped ? 'จิบแล้ว' : 'จิบเลย'}
                  </button>
                </div>
              ) : (
                <div className="px-4 py-3 border-b border-rule">
                  <p className="text-base font-semibold text-charcoal">ทำได้ดีมาก ขอบคุณสำหรับวันนี้นะครับ</p>
                  <p className="text-sm text-plum mt-1">ยูซุฝากบอก: พักผ่อนเยอะ ๆ แล้วเจอกันกะหน้า</p>
                </div>
              )}

              <div className="px-4 py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className={sectionLabel}>{selectedMood ? 'บันทึกความรู้สึกแล้ว' : 'ตอนนี้รู้สึกอย่างไร'}</span>
                  {selectedMood && (
                    <span className="text-sm text-plum truncate">{MOODS.find((m) => m.emoji === selectedMood)?.note}</span>
                  )}
                </div>
                <div className="grid grid-cols-5 gap-px bg-rule border border-rule mt-2">
                  {MOODS.map((m) => (
                    <button
                      type="button"
                      key={m.emoji}
                      onClick={() => handleMoodSelect(m.emoji)}
                      aria-pressed={selectedMood === m.emoji}
                      className={cn(
                        "min-h-12 text-base transition-colors duration-150",
                        selectedMood === m.emoji ? "bg-plum text-cream font-semibold" : "bg-cream text-charcoal hover:bg-paper-2"
                      )}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="px-4 pb-4">
                <motion.button
                  type="button"
                  {...tap}
                  onClick={() => {
                    setShowPunchModal(false);
                    setPunchFeedback(null);
                  }}
                  className="w-full min-h-14 bg-charcoal hover:bg-charcoal-2 text-cream text-lg font-semibold transition-colors duration-150"
                >
                  ตกลง
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
