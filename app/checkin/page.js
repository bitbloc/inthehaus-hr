"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";

export default function CheckIn() {
  const [status, setStatus] = useState("กำลังระบุตำแหน่ง...");
  const [profile, setProfile] = useState(null);
  const [debugMsg, setDebugMsg] = useState(""); // เอาไว้ดู Error

  // -------------------------------------------------------
  // 🔴 1. แก้พิกัดร้านตรงนี้ (ไปดูวิธีหาพิกัดด้านล่าง)
  const SHOP_LAT = 17.390110564180162; 
  const SHOP_LONG = 104.79292673153263;
  const ALLOWED_RADIUS_KM = 0.05; // 0.05 กม. = 50 เมตร
  // -------------------------------------------------------

  useEffect(() => {
    const initLiff = async () => {
      try {
        // เริ่มต้น LIFF
        await liff.init({ liffId: process.env.NEXT_PUBLIC_LIFF_ID });
        
        if (!liff.isLoggedIn()) {
          liff.login();
        } else {
          const userProfile = await liff.getProfile();
          setProfile(userProfile);
          getLocation(); // ดึง User Profile เสร็จแล้วค่อยขอ GPS
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
      // ขอพิกัด GPS
      navigator.geolocation.getCurrentPosition(success, error);
    } else {
      setStatus("Browser ไม่รองรับ GPS");
    }
  };

  const success = (position) => {
    const lat = position.coords.latitude;
    const long = position.coords.longitude;
    
    // คำนวณระยะทาง
    const dist = getDistanceFromLatLonInKm(lat, long, SHOP_LAT, SHOP_LONG);
    
    // เช็คว่าอยู่ในระยะไหม?
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

  // ฟังก์ชันกดปุ่มบันทึก
  const handleCheckIn = async () => {
    if (!profile) return;
    setStatus("กำลังบันทึก...");
    
    // 1. หา ID พนักงานจาก Line User ID ในฐานข้อมูล
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

    // 2. บันทึกลงตาราง Log
    const { error: insertError } = await supabase.from('attendance_logs').insert({
        employee_id: emp.id,
        action_type: 'check_in',
        // สามารถเพิ่ม field location ตรงนี้ถ้าต้องการเก็บพิกัดจริง
    });

    if (!insertError) {
        alert(`✅ บันทึกเวลาสำเร็จ! สวัสดีคุณ ${emp.name}`);
        liff.closeWindow(); // ปิดหน้าต่างให้อัตโนมัติ
    } else {
        alert("บันทึกผิดพลาด: " + insertError.message);
    }
  };

  // --- สูตรคำนวณระยะทาง (Haversine Formula) ---
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

  // --- ส่วนแสดงผลหน้าจอ (UI) ---
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-50 p-4 font-sans text-center">
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-2 text-gray-800">In the haus</h1>
        <p className="text-gray-500 mb-6 text-sm">ระบบลงเวลาเข้างาน</p>
        
        {/* รูปโปรไฟล์ LINE */}
        {profile && (
            <img src={profile.pictureUrl} alt="Profile" className="w-20 h-20 rounded-full mx-auto mb-4 border-4 border-blue-100" />
        )}
        
        <p className="mb-2 text-lg font-medium text-gray-700">
            {profile ? profile.displayName : "Loading..."}
        </p>
        <p className="mb-4 text-xs text-gray-400 bg-gray-100 p-2 rounded select-all">
    {profile ? profile.userId : ""}
</p>
        {/* สถานะ GPS */}
        <div className={`p-3 rounded-lg mb-6 text-sm font-semibold ${status.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {status}
        </div>
        
        {/* ปุ่มกด (จะโชว์เฉพาะตอนอยู่ในพื้นที่) */}
        {status.includes('✅') && (
            <button 
                onClick={handleCheckIn}
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-4 rounded-xl shadow-lg transition transform active:scale-95"
            >
                📍 กดลงเวลาเข้างาน
            </button>
        )}

        {/* Debug Area (เอาไว้ดู Error ถ้ามี) */}
        {debugMsg && <p className="text-xs text-red-400 mt-4 break-words">{debugMsg}</p>}
      </div>
    </div>
  );
}