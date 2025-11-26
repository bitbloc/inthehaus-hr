"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";

export default function CheckIn() {
  const [status, setStatus] = useState("กำลังระบุตำแหน่ง...");
  const [profile, setProfile] = useState(null);
  const [debugMsg, setDebugMsg] = useState("");

  // --- ตั้งค่าพิกัดร้าน ---
  const SHOP_LAT = 17.400000; // 🔴 อย่าลืมแก้พิกัดตรงนี้ให้เป็นร้านคุณนะครับ
  const SHOP_LONG = 104.700000; 
  const ALLOWED_RADIUS_KM = 0.05; // 50 เมตร
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
        setStatus("LIFF Error");
        setDebugMsg(error.message);
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
    setDebugMsg(err.message);
  };

  const handleCheckIn = async (actionType) => { 
    if (!profile) return;
    
    const confirmMsg = actionType === 'check_in' ? "ยืนยันการ เข้างาน?" : "ยืนยันการ ออกงาน?";
    if (!confirm(confirmMsg)) return;

    setStatus("กำลังบันทึก...");
    
    const { data: emp, error: searchError } = await supabase
      .from('employees')
      .select('id, name')
      .eq('line_user_id', profile.userId)
      .single();

    if (searchError || !emp) {
        alert("❌ ไม่พบชื่อคุณในระบบ! (กรุณาลงทะเบียนพนักงานก่อน)");
        setStatus("ไม่พบข้อมูลพนักงาน");
        return;
    }

    const { error: insertError } = await supabase.from('attendance_logs').insert({
        employee_id: emp.id,
        action_type: actionType,
    });

    if (!insertError) {
        // ยิงแจ้งเตือน Realtime
        const now = new Date();
        const timeString = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        try {
            await fetch('/api/notify-realtime', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: emp.name,
                    action: actionType,
                    time: timeString,
                    locationStatus: status
                })
            });
        } catch (e) { console.error("Notify Error", e); }

        alert(`✅ บันทึก ${actionType === 'check_in' ? 'เข้างาน' : 'ออกงาน'} สำเร็จ!`);
        liff.closeWindow();
    } else {
        alert("บันทึกผิดพลาด: " + insertError.message);
    }
  };

  function getDistanceFromLatLonInKm(lat1, lon1, lat2, lon2) {
    var R = 6371; 
    var dLat = deg2rad(lat2-lat1);
    var dLon = deg2rad(lon2-lon1); 
    var a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat1)) * Math.sin(dLon/2) * Math.sin(dLon/2); 
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
    return R * c; 
  }
  function deg2rad(deg) { return deg * (Math.PI/180); }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 font-sans text-center">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">In the haus</h1>
        <p className="text-gray-500 mb-6 text-sm">ระบบลงเวลาเข้างาน</p>
        
        {profile && (
            <img src={profile.pictureUrl} alt="Profile" className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-blue-100" />
        )}
        
        <p className="mb-2 text-lg font-medium text-gray-700">
            {profile ? profile.displayName : "Loading..."}
        </p>

        {/* ✅✅✅ ส่วนแสดง User ID สำหรับลงทะเบียน ✅✅✅ */}
        <div className="mb-4 bg-gray-100 p-2 rounded-lg text-xs text-gray-500 break-all font-mono select-all border border-gray-200">
            <span className="font-bold text-gray-400 block mb-1">YOUR ID:</span>
            {profile ? profile.userId : "กำลังดึงข้อมูล..."}
        </div>
        {/* ------------------------------------------------ */}

        <div className={`p-3 rounded-lg mb-6 text-sm font-semibold ${status.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {status}
        </div>
        
        {status.includes('✅') && (
            <div className="flex flex-col gap-3 w-full">
                <button 
                    onClick={() => handleCheckIn('check_in')}
                    className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center"
                >
                    🟢 เข้างาน (Check In)
                </button>
                <button 
                    onClick={() => handleCheckIn('check_out')}
                    className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-4 rounded-xl shadow-lg transition transform active:scale-95 flex items-center justify-center"
                >
                    🔴 ออกงาน (Check Out)
                </button>
            </div>
        )}

        {debugMsg && <p className="text-xs text-red-400 mt-4 break-words">{debugMsg}</p>}
      </div>
    </div>
  );
}