"use client";
import { useEffect, useState, useRef } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { resizeImage } from "../../utils/imageResizer";
import Link from "next/link";
import { format } from "date-fns";

export default function CheckIn() {
  // --- State ---
  const [profile, setProfile] = useState(null);
  const [status, setStatus] = useState("Checking GPS...");
  const [activeAnnouncement, setActiveAnnouncement] = useState(null);
  const [recentCheckins, setRecentCheckins] = useState([]);
  const [lastAction, setLastAction] = useState(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Interaction State
  const [showCamera, setShowCamera] = useState(false);
  const [showMoodSelector, setShowMoodSelector] = useState(false); // Post-Checkin State
  const [photoUrl, setPhotoUrl] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showMoodOverlay, setShowMoodOverlay] = useState(false);
  const [currentLogId, setCurrentLogId] = useState(null);
  const [countdown, setCountdown] = useState(5);

  const fileInputRef = useRef(null);

  // --- Constants ---
  const SHOP_LAT = 17.390110564180162;
  const SHOP_LONG = 104.79292673153263;
  const ALLOWED_RADIUS_KM = 0.05;

  // --- Init ---
  useEffect(() => {
    const init = async () => {
      // 1. LIFF
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
        if (!liff.isLoggedIn()) liff.login();
        else {
          const p = await liff.getProfile();
          setProfile(p);
          fetchUserStatus(p.userId);
        }
      } catch (e) {
        setStatus("LIFF Error");
      }

      // 2. GPS
      if (navigator.geolocation) navigator.geolocation.getCurrentPosition(onGeoSuccess, onGeoError);
      else setStatus("GPS Not Supported");

      // 3. Data Fetch
      fetchAnnouncement();
      fetchRecents();
    };
    init();
  }, []);

  // --- Fetchers ---
  const fetchAnnouncement = async () => {
    try {
      const res = await fetch('/api/announcements/active');
      const json = await res.json();
      if (json.announcement) setActiveAnnouncement(json.announcement);
    } catch (e) { console.error("Announcement Error:", e); }
  };

  const fetchRecents = async () => {
    try {
      const res = await fetch('/api/checkins/recent');
      const json = await res.json();
      if (json.recentCheckins) setRecentCheckins(json.recentCheckins);
    } catch (e) { console.error("Recent Error:", e); }
  };

  const fetchUserStatus = async (userId) => {
    const { data: emp } = await supabase.from('employees').select('id').eq('line_user_id', userId).single();
    if (!emp) return;
    const { data: log } = await supabase.from('attendance_logs').select('action_type').eq('employee_id', emp.id).order('timestamp', { ascending: false }).limit(1).single();
    setLastAction(log ? log.action_type : 'check_out');
  };

  // --- GPS Logic ---
  const onGeoSuccess = (position) => {
    const dist = getDistanceFromLatLonInKm(position.coords.latitude, position.coords.longitude, SHOP_LAT, SHOP_LONG);
    if (dist <= ALLOWED_RADIUS_KM) setStatus("📍 Ready to Check-in");
    else setStatus(`❌ Out of Range (${dist.toFixed(3)}km)`);
  };
  const onGeoError = () => setStatus("❌ GPS Error");

  // --- Action: Upload Photo ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      setIsUploading(true);
      const resizedFile = await resizeImage(file, 600, 0.7);
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`;
      const filePath = `daily-checkin/${fileName}`;
      const { error } = await supabase.storage.from('checkin-photos').upload(filePath, resizedFile);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('checkin-photos').getPublicUrl(filePath);
      setPhotoUrl(publicUrl);
    } catch (err) { alert("Upload Failed: " + err.message); }
    finally { setIsUploading(false); }
  };

  // --- Action: Check-in (Step 1) ---
  const handleCheckIn = async (actionType) => {
    if (!profile || !photoUrl) return alert("Photo required!");
    if (!status.includes("Ready")) return alert("Please be at the location.");
    if (isSubmitting) return;

    if (!confirm(actionType === 'check_in' ? "Confirm Check-in?" : "Confirm Check-out?")) return;

    setIsSubmitting(true);

    try {
      // 1. Get Employee
      const { data: emp } = await supabase.from('employees').select('id, name, position').eq('line_user_id', profile.userId).single();
      if (!emp) throw new Error("Employee not found");

      // 2. Optimistic Update
      const tempLog = {
        id: 'temp-' + Date.now(),
        timestamp: new Date().toISOString(),
        action_type: actionType,
        employees: { name: emp.name, photo_url: profile.pictureUrl },
        photo_url: photoUrl,
        mood_status: null
      };
      setRecentCheckins(prev => [tempLog, ...prev]);

      // 3. Insert to DB
      const { data: newLog, error } = await supabase.from('attendance_logs').insert({
        employee_id: emp.id,
        action_type: actionType,
        photo_url: photoUrl
      }).select().single();

      if (error) throw error;

      // 4. Update State & Trigger Overlay
      setCurrentLogId(newLog.id);
      setShowMoodOverlay(true);
      setCountdown(5); // Start 5s countdown
      setLastAction(actionType);

      // Notify Line (Async) - Don't await to block UI
      notifyLine(emp, actionType, photoUrl);

    } catch (err) {
      alert("Error: " + err.message);
      fetchRecents(); // Revert optimistic logic on error
    } finally {
      setIsSubmitting(false);
      setPhotoUrl(null); // Reset photo
    }
  };

  // --- Action: Select Mood (Step 2) ---
  const handleMoodSelect = async (mood) => {
    if (!currentLogId) return;

    // Optimistic Update locally
    setRecentCheckins(prev => prev.map(item =>
      (item.id === currentLogId || item.id.startsWith('temp')) ? { ...item, mood_status: mood } : item
    ));

    setShowMoodOverlay(false);

    // Update DB
    await supabase.from('attendance_logs').update({ mood_status: mood }).eq('id', currentLogId);
  };

  // --- Helpers ---
  const notifyLine = async (emp, action, url) => {
    try {
      await fetch('/api/notify-realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: emp.name, position: emp.position, action, time: format(new Date(), "HH:mm"), locationStatus: "Verified", photoUrl: url
        })
      });
    } catch (e) { console.error("Notify failed", e); }
  };

  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; var dLat = (lat2 - lat1) * (Math.PI / 180); var dLon = (lon2 - lon1) * (Math.PI / 180);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
  }

  // --- Countdown Logic ---
  useEffect(() => {
    if (showMoodOverlay && countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (showMoodOverlay && countdown === 0) {
      setShowMoodOverlay(false); // Auto close
    }
  }, [showMoodOverlay, countdown]);


  // --- Render ---
  return (
    <div className="min-h-screen bg-[#1A1A1A] text-[#E0E0E0] font-sans pb-10">

      {/* 1. Header */}
      <div className="p-6 flex justify-between items-center bg-[#242424] border-b border-[#333]">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-white">In the haus</h1>
          <p className="text-xs text-[#888]">{status}</p>
        </div>
        {profile && <img src={profile.pictureUrl} className="w-10 h-10 rounded-full border-2 border-[#39FF14]" />}
      </div>

      {/* 2. Announcement */}
      {activeAnnouncement && (
        <div className="mx-4 mt-6 p-5 bg-[#2D2D2D] border-l-4 border-orange-500 rounded-r-xl shadow-lg animate-fade-in-up">
          <h3 className="text-orange-500 text-xs font-bold uppercase tracking-wider mb-1">Daily Announcement</h3>
          <p className="text-white font-medium">{activeAnnouncement.message}</p>
        </div>
      )}

      {/* 3. Main Action Area */}
      <div className="p-6 flex flex-col items-center">

        {/* Photo Preview or Placeholder */}
        <div
          onClick={() => !photoUrl && fileInputRef.current.click()}
          className={`w-full max-w-sm aspect-video rounded-3xl overflow-hidden border-2 flex items-center justify-center relative transition-all active:scale-95 cursor-pointer 
            ${photoUrl ? 'border-[#39FF14]' : 'border-dashed border-[#444] bg-[#242424] hover:bg-[#2A2A2A]'}`}
        >
          {photoUrl ? (
            <>
              <img src={photoUrl} className="w-full h-full object-cover" />
              <button
                onClick={(e) => { e.stopPropagation(); setPhotoUrl(null); }}
                className="absolute top-3 right-3 bg-black/50 text-white p-2 rounded-full text-xs backdrop-blur-md"
              >
                Retake ❌
              </button>
            </>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <span className="text-4xl">📸</span>
              <span className="text-sm font-bold text-[#888]">Tap to Snap</span>
            </div>
          )}
          <input type="file" accept="image/*" capture="user" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
        </div>

        {/* Action Button */}
        {photoUrl && (
          <div className="w-full max-w-sm mt-6 grid grid-cols-2 gap-4 animate-fade-in-up">
            {lastAction !== 'check_in' && (
              <button
                onClick={() => handleCheckIn('check_in')}
                disabled={isSubmitting}
                className="col-span-2 bg-[#39FF14] text-black font-extrabold py-5 rounded-2xl shadow-[0_0_20px_rgba(57,255,20,0.3)] hover:shadow-[0_0_30px_rgba(57,255,20,0.5)] transition-all active:scale-95 text-lg"
              >
                {isSubmitting ? "Processing..." : "CHECK IN"}
              </button>
            )}
            {lastAction === 'check_in' && (
              <button
                onClick={() => handleCheckIn('check_out')}
                disabled={isSubmitting}
                className="col-span-2 bg-[#FF3939] text-white font-extrabold py-5 rounded-2xl shadow-[0_0_20px_rgba(255,57,57,0.3)] hover:shadow-[0_0_30px_rgba(255,57,57,0.5)] transition-all active:scale-95 text-lg"
              >
                {isSubmitting ? "Processing..." : "CHECK OUT"}
              </button>
            )}
          </div>
        )}
      </div>

      {/* 4. Recent Check-ins (Square Grid) */}
      <div className="px-6 mt-2">
        <h3 className="text-xs font-bold text-[#666] uppercase mb-4 tracking-widest">Recent Activity</h3>
        <div className="grid grid-cols-3 gap-3">
          {recentCheckins.map((log) => (
            <div key={log.id} className="bg-[#2D2D2D] rounded-xl overflow-hidden shadow-sm flex flex-col animate-fade-in-up">
              <div className="relative aspect-square">
                <img src={log.photo_url} className="w-full h-full object-cover" />
                {log.mood_status && (
                  <div className="absolute bottom-1 right-1 bg-black/60 backdrop-blur px-2 py-0.5 rounded-lg text-xs">
                    {log.mood_status}
                  </div>
                )}
              </div>
              <div className="p-2 border-t border-[#333]">
                <p className="text-[10px] font-bold text-[#E0E0E0] truncate">{log.employees?.name}</p>
                <p className="text-[9px] text-[#888] font-mono">{format(new Date(log.timestamp), "HH:mm")}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 5. Mood Overlay (Success) */}
      {showMoodOverlay && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md z-50 flex flex-col items-center justify-center p-8 animate-fade-in text-center">
          <div className="mb-8">
            <div className="w-20 h-20 bg-[#39FF14] rounded-full flex items-center justify-center text-4xl mb-4 mx-auto shadow-[0_0_30px_#39FF14]">
              ✓
            </div>
            <h2 className="text-2xl font-bold text-white">Recorded!</h2>
            <p className="text-[#888] text-sm mt-1">Closing in {countdown}s</p>
          </div>

          <p className="mb-6 text-lg font-medium text-[#E0E0E0]">How are you feeling?</p>

          <div className="flex gap-4">
            <button onClick={() => handleMoodSelect('🔥')} className="text-4xl p-4 bg-[#2D2D2D] rounded-2xl hover:bg-[#333] hover:scale-110 transition active:scale-95">🔥</button>
            <button onClick={() => handleMoodSelect('😊')} className="text-4xl p-4 bg-[#2D2D2D] rounded-2xl hover:bg-[#333] hover:scale-110 transition active:scale-95">😊</button>
            <button onClick={() => handleMoodSelect('😴')} className="text-4xl p-4 bg-[#2D2D2D] rounded-2xl hover:bg-[#333] hover:scale-110 transition active:scale-95">😴</button>
            <button onClick={() => handleMoodSelect('🤒')} className="text-4xl p-4 bg-[#2D2D2D] rounded-2xl hover:bg-[#333] hover:scale-110 transition active:scale-95">🤒</button>
          </div>

          <button onClick={() => setShowMoodOverlay(false)} className="mt-12 text-[#666] underline text-sm">Skip</button>
        </div>
      )}

      {/* Footer / Leave Link */}
      <div className="text-center mt-10">
        <Link href="/leave" className="text-[#666] text-xs font-bold hover:text-[#39FF14] transition">
          📝 Request Leave
        </Link>
      </div>

    </div>
  );
}