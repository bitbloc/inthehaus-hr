"use client";
import { useEffect, useState, useRef } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import { resizeImage } from "../../utils/imageResizer"; // อย่าลืมไฟล์ utils ที่เคยสร้างไว้นะครับ
import Link from "next/link";

export default function CheckIn() {
  const [status, setStatus] = useState("กำลังระบุพิกัด...");
  const [profile, setProfile] = useState(null);
  const [photoUrl, setPhotoUrl] = useState(null); // เก็บ URL รูปที่อัปแล้ว
  const [isUploading, setIsUploading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false); // ✅ New state for submission
  const [lastAction, setLastAction] = useState(null);
  const [showId, setShowId] = useState(false);

  // --- Dev Mode State ---
  const [showDevModal, setShowDevModal] = useState(false);
  const [devUser, setDevUser] = useState("");
  const [devPass, setDevPass] = useState("");
  const [isDevMode, setIsDevMode] = useState(false);

  const fileInputRef = useRef(null);

  // --- พิกัดร้าน ---
  const SHOP_LAT = 17.390110564180162;
  const SHOP_LONG = 104.79292673153263;
  const ALLOWED_RADIUS_KM = 0.05;
  // ----------------

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
        if (!liff.isLoggedIn()) liff.login();
        else {
          const p = await liff.getProfile();
          setProfile(p);
          fetchUserStatus(p.userId);
          getLocation();
        }
      } catch (error) { setStatus("LIFF Error"); }
    };
    initLiff();
  }, []);

  // Re-run location check if dev mode is toggled
  useEffect(() => {
    if (isDevMode) {
      setStatus("🛠️ Developer Mode Active");
    } else {
      getLocation();
    }
  }, [isDevMode]);

  const fetchUserStatus = async (userId) => {
    const { data: emp } = await supabase.from('employees').select('id').eq('line_user_id', userId).single();
    if (!emp) return;
    const { data: log } = await supabase.from('attendance_logs').select('action_type').eq('employee_id', emp.id).order('timestamp', { ascending: false }).limit(1).single();
    setLastAction(log ? log.action_type : 'check_out');
  };

  const getLocation = () => {
    if (isDevMode) {
      setStatus("🛠️ Developer Mode Active");
      return;
    }
    if (navigator.geolocation) navigator.geolocation.getCurrentPosition(success, error);
    else setStatus("Browser ไม่รองรับ GPS");
  };

  const success = (position) => {
    if (isDevMode) {
      setStatus("🛠️ Developer Mode Active");
      return;
    }
    const dist = getDistanceFromLatLonInKm(position.coords.latitude, position.coords.longitude, SHOP_LAT, SHOP_LONG);
    if (dist <= ALLOWED_RADIUS_KM) setStatus(`✅ อยู่ในพื้นที่ร้าน (${dist.toFixed(3)} กม.)`);
    else setStatus(`❌ อยู่นอกพื้นที่ (${dist.toFixed(3)} กม.)`);
  };
  const error = () => {
    if (!isDevMode) setStatus("ไม่สามารถดึง GPS ได้");
  };


  const handleDevLogin = () => {
    if (devUser === "yuzu" && devPass === "1533") {
      setIsDevMode(true);
      setShowDevModal(false);
      alert("Developer Mode Activated! GPS Bypass enabled.");
      setStatus("🛠️ Developer Mode Active");
    } else {
      alert("Invalid Credentials");
    }
    setDevUser("");
    setDevPass("");
  };


  // --- 📸 ฟังก์ชันจัดการรูปภาพ (หัวใจสำคัญ) ---
  const handleFileChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    try {
      setIsUploading(true);

      // 1. ย่อรูป (Performance!)
      const resizedFile = await resizeImage(file, 600, 0.7);

      // 2. สร้างชื่อไฟล์
      const fileName = `${Date.now()}_${Math.random().toString(36).substring(2)}.jpg`;
      const filePath = `daily-checkin/${fileName}`; // เก็บใน Folder daily-checkin

      // 3. อัปโหลดขึ้น Supabase
      const { error: uploadError } = await supabase.storage.from('checkin-photos').upload(filePath, resizedFile);
      if (uploadError) throw uploadError;

      // 4. เอา URL มาเก็บไว้
      const { data: { publicUrl } } = supabase.storage.from('checkin-photos').getPublicUrl(filePath);
      setPhotoUrl(publicUrl);

    } catch (err) {
      alert("อัปโหลดรูปไม่สำเร็จ: " + err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const handleCheckIn = async (actionType) => {
    if (!profile) return;
    if (!photoUrl) return alert("กรุณาถ่ายรูปก่อนครับ!"); // กันเหนียว
    if (isSubmitting) return; // ✅ Prevent double click

    if (!confirm(actionType === 'check_in' ? "ยืนยันการ เข้างาน?" : "ยืนยันการ ออกงาน?")) return;

    setIsSubmitting(true); // ✅ Start loading

    try {
      // 1. บันทึกลง Database
      const { data: emp } = await supabase.from('employees').select('id, name, position').eq('line_user_id', profile.userId).single();
      if (!emp) throw new Error("ไม่พบข้อมูลพนักงาน");

      const { error } = await supabase.from('attendance_logs').insert({
        employee_id: emp.id,
        action_type: actionType,
        photo_url: photoUrl // ✅ บันทึก URL รูปลงไปด้วย
      });

      if (error) throw error;

      // 2. ส่งแจ้งเตือนเข้ากลุ่ม (พร้อมรูป)
      const now = new Date();
      const timeString = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;

      await fetch('/api/notify-realtime', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: emp.name,
          position: emp.position,
          action: actionType,
          time: timeString,
          locationStatus: status,
          photoUrl: photoUrl // ✅ ส่งรูปไปโชว์ในไลน์
        })
      });

      alert("บันทึกสำเร็จ!");
      liff.closeWindow();
    } catch (error) {
      alert("Error: " + error.message);
    } finally {
      setIsSubmitting(false); // ✅ Stop loading
    }
  };

  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; var dLat = deg2rad(lat2 - lat1); var dLon = deg2rad(lon2 - lon1);
    var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)); return R * c;
  }
  function deg2rad(deg) { return deg * (Math.PI / 180); }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 p-4 font-sans text-center relative">

      {/* Developer Bypass Button */}
      <button
        className="absolute top-4 right-4 text-rose-300 opacity-50 hover:opacity-100 hover:scale-110 transition-all"
        onClick={() => setShowDevModal(true)}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 14c1.49-1.28 3.6-2.3 3.6-4.52 0-2.3-1.55-4.23-3.6-4.23-1.5 0-2.9.96-3.6 2.37-1.1-2.43-4.66-2.37-4.66 0 1.28 1.1 3.24 3.6 4.52 0 0-3.6 2.06-3.6 5.86 0 2.25 2.1 4.23 3.6 4.23 2.1 0 3.6-1.92 3.6-4.23 0-2.8-3.6-5.86-3.6-5.86z" />
          { /* Simple Heart Shape */}
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" fill={isDevMode ? "currentColor" : "none"} />
        </svg>
      </button>

      {/* Dev Login Modal */}
      {showDevModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded-2xl shadow-xl w-80">
            <h3 className="font-bold text-lg mb-4 text-slate-700">Developer Access</h3>
            <input
              type="text"
              placeholder="User"
              className="w-full border p-2 rounded mb-2 text-slate-800"
              value={devUser}
              onChange={e => setDevUser(e.target.value)}
            />
            <input
              type="password"
              placeholder="Pass"
              className="w-full border p-2 rounded mb-4 text-slate-800"
              value={devPass}
              onChange={e => setDevPass(e.target.value)}
            />
            <div className="flex gap-2">
              <button
                onClick={handleDevLogin}
                className="flex-1 bg-emerald-500 text-white py-2 rounded font-bold hover:bg-emerald-600"
              >
                Login
              </button>
              <button
                onClick={() => setShowDevModal(false)}
                className="flex-1 bg-slate-200 text-slate-600 py-2 rounded font-bold hover:bg-slate-300"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}


      <div className="bg-white p-6 rounded-3xl shadow-xl w-full max-w-sm">

        <h1 className="text-xl font-bold mb-1 text-slate-800">In the haus</h1>
        {profile && <p className="mb-4 font-bold text-slate-500 text-sm">{profile.displayName}</p>}

        {/* Change status display logic slightly for Dev Mode */}
        <div className={`py-1 px-3 rounded-full mb-4 text-xs font-bold inline-block ${status.includes('✅') || status.includes('🛠️') ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
          {status}
        </div>

        {/* 1. ปุ่มถ่ายรูป (จะหายไปเมื่อถ่ายเสร็จ) */}
        {/* Allow photo taking if valid status OR Dev Mode */}
        {!photoUrl && (status.includes('✅') || isDevMode) && (
          <div className="mb-4">
            <input type="file" accept="image/*" capture="user" ref={fileInputRef} onChange={handleFileChange} className="hidden" />
            <button
              onClick={() => fileInputRef.current.click()}
              disabled={isUploading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-4 rounded-2xl shadow-lg font-bold flex items-center justify-center gap-2 transition-all active:scale-95"
            >
              {isUploading ? "⏳ กำลังอัปโหลด..." : "ถ่ายรูปยืนยัน'เข้า-ออก'งาน"}
            </button>
          </div>
        )}

        {/* 2. แสดงรูปที่ถ่าย + ปุ่มลงเวลา (จะโผล่มาเมื่อมีรูปแล้ว) */}
        {photoUrl && (
          <div className="animate-fade-in-up">
            <div className="relative w-full h-48 mb-4 rounded-2xl overflow-hidden border-2 border-slate-200">
              <img src={photoUrl} className="w-full h-full object-cover" alt="Checkin" />
              <button onClick={() => setPhotoUrl(null)} disabled={isSubmitting} className="absolute top-2 right-2 bg-white/80 p-1 rounded-full text-xs shadow disabled:opacity-50">❌ ถ่ายใหม่</button>
            </div>

            <div className="flex flex-col gap-3">
              {lastAction === 'check_out' && (
                <button
                  onClick={() => handleCheckIn('check_in')}
                  disabled={isSubmitting}
                  className="w-full bg-emerald-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-200 transition-all active:scale-95 disabled:bg-emerald-300 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "⏳ กำลังบันทึก..." : "🟢 ยืนยัน เข้างาน"}
                </button>
              )}
              {lastAction === 'check_in' && (
                <button
                  onClick={() => handleCheckIn('check_out')}
                  disabled={isSubmitting}
                  className="w-full bg-rose-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-rose-200 transition-all active:scale-95 disabled:bg-rose-300 disabled:cursor-not-allowed"
                >
                  {isSubmitting ? "⏳ กำลังบันทึก..." : "🔴 ยืนยัน ออกงาน"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Toggle ID */}
        <div className="mt-6 mb-2">
          <button onClick={() => setShowId(!showId)} className="text-[10px] text-slate-400 underline">{showId ? "Hide ID" : "Show ID"}</button>
          {showId && <div className="bg-slate-100 p-2 mt-1 rounded text-[10px] font-mono break-all select-all">{profile?.userId}</div>}
        </div>

        {/* เมนูลา */}
        <div className="border-t pt-4 mt-2">
          <Link href="/leave" className="text-slate-500 text-xs font-bold flex items-center justify-center gap-1 hover:text-slate-800">
            <span>📝</span> ขอลาหยุด (Leave Request)
          </Link>
        </div>

      </div>
    </div>
  );
}