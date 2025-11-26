"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";

export default function CheckIn() {
  const [status, setStatus] = useState("กำลังระบุตำแหน่ง...");
  const [profile, setProfile] = useState(null);
  const [debugMsg, setDebugMsg] = useState("");

  // --- ตั้งค่าพิกัดร้าน ---
  const SHOP_LAT = 17.400000; // แก้เป็นพิกัดจริง
  const SHOP_LONG = 104.700000; 
  const ALLOWED_RADIUS_KM = 0.05; 
  // --------------------

  useEffect(() => {
    const initLiff = async () => {
      try {
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
        if (!liff.isLoggedIn()) {
          liff.login();
        } else {
          const userProfile = await liff.getProfile();
          setProfile(userProfile);
          getLocation();
        }
      } catch (error) {
        setStatus("LIFF Error: " + error.message);
      }
    };
    initLiff();
  }, []);

  const getLocation = () => {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(success, error);
    } else {
      setStatus("Browser ไม่รองรับ GPS");
    }
  };

  const success = (position) => {
    const lat = position.coords.latitude;
    const long = position.coords.longitude;
    const dist = getDistanceFromLatLonInKm(lat, long, SHOP_LAT, SHOP_LONG);
    
    if (dist <= ALLOWED_RADIUS_KM) {
      setStatus(`✅ อยู่ในพื้นที่ร้าน (ห่าง ${dist.toFixed(3)} กม.)`);
    } else {
      setStatus(`❌ อยู่นอกพื้นที่ (ห่าง ${dist.toFixed(3)} กม.)`);
    }
  };

  const error = (err) => {
    setStatus("ไม่สามารถดึง GPS ได้");
  };

  const handleCheckIn = async (actionType) => { 
    if (!profile) return;
    
    // Check ก่อนว่าลงทะเบียนหรือยัง
    const { data: emp } = await supabase.from('employees').select('id, name').eq('line_user_id', profile.userId).single();
    if (!emp) {
        alert(`❌ คุณยังไม่ได้ลงทะเบียน!\nUser ID ของคุณคือ: ${profile.userId}\n(กรุณาส่งรหัสนี้ให้ Admin)`);
        return;
    }

    const { error: insertError } = await supabase.from('attendance_logs').insert({
        employee_id: emp.id,
        action_type: actionType,
    });

    if (!insertError) {
        // ยิงแจ้งเตือน (ถ้ามี)
        const now = new Date();
        const timeString = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        try { await fetch('/api/notify-realtime', { method: 'POST', body: JSON.stringify({ name: emp.name, action: actionType, time: timeString, locationStatus: status }) }); } catch (e) {}
        
        alert(`✅ บันทึกสำเร็จ!`);
        liff.closeWindow();
    } else {
        alert("บันทึกผิดพลาด");
    }
  };

  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; 
    var dLat = deg2rad(lat2-lat1);
    var dLon = deg2rad(lon2-lon1); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
  }
  function deg2rad(deg) { return deg * (Math.PI/180); }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 font-sans text-center">
      <div className="bg-white p-6 rounded-2xl shadow-xl w-full max-w-sm">
        
        {/* ✅✅✅ ส่วนแสดง ID แบบชัดเจนที่สุด (อยู่บนสุด) ✅✅✅ */}
        <div className="bg-red-50 border-2 border-red-500 p-3 rounded-xl mb-4 text-left">
            <p className="text-red-600 font-bold text-xs uppercase mb-1">🔥 YOUR USER ID (COPY THIS):</p>
            <p className="font-mono text-sm break-all select-all bg-white border border-red-200 p-2 rounded">
                {profile ? profile.userId : "Loading..."}
            </p>
        </div>
        {/* -------------------------------------------------- */}

        <h1 className="text-xl font-bold mb-2 text-gray-800">In the haus</h1>
        {profile && <img src={profile.pictureUrl} className="w-16 h-16 rounded-full mx-auto mb-2" />}
        <p className="mb-4 font-bold text-gray-700">{profile?.displayName}</p>

        <div className={`p-3 rounded-lg mb-4 text-sm font-semibold ${status.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {status}
        </div>
        
        {status.includes('✅') && (
            <div className="flex flex-col gap-3">
                <button onClick={() => handleCheckIn('check_in')} className="bg-green-600 text-white font-bold py-3 rounded-xl shadow-lg">🟢 เข้างาน</button>
                <button onClick={() => handleCheckIn('check_out')} className="bg-red-500 text-white font-bold py-3 rounded-xl shadow-lg">🔴 ออกงาน</button>
            </div>
        )}
      </div>
    </div>
  );
}