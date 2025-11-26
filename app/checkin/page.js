"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";

export default function CheckIn() {
  const [status, setStatus] = useState("กำลังระบุตำแหน่ง...");
  const [profile, setProfile] = useState(null);
  const [debugMsg, setDebugMsg] = useState("");
  
  // State 1: เก็บสถานะปุ่ม (เข้า หรือ ออก)
  const [lastAction, setLastAction] = useState(null); 
  // State 2: เก็บสถานะการโชว์ ID (ซ่อน/แสดง)
  const [showId, setShowId] = useState(false);

  // --- ตั้งค่าพิกัดร้าน ---
  const SHOP_LAT = 17.400000; // 🔴 แก้พิกัดร้านตรงนี้
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
          
          // เช็คสถานะล่าสุดทันที (เข้าหรือออก)
          fetchUserStatus(userProfile.userId); 
          getLocation();
        }
      } catch (error) {
        setStatus("LIFF Error");
        setDebugMsg(error.message);
      }
    };
    initLiff();
  }, []);

  const fetchUserStatus = async (userId) => {
    // 1. หา ID พนักงาน
    const { data: emp } = await supabase.from('employees').select('id').eq('line_user_id', userId).single();
    if (!emp) return;

    // 2. ดู Log ล่าสุด
    const { data: log } = await supabase
        .from('attendance_logs')
        .select('action_type')
        .eq('employee_id', emp.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    if (log) {
        setLastAction(log.action_type);
    } else {
        setLastAction('check_out'); // ยังไม่เคยลงเวลา = พร้อมเข้างาน
    }
  };

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

    const prevAction = lastAction;
    setLastAction(actionType); 
    setStatus("กำลังบันทึก...");
    
    const { data: emp, error: searchError } = await supabase
      .from('employees')
      .select('id, name')
      .eq('line_user_id', profile.userId)
      .single();

    if (searchError || !emp) {
        alert("❌ ไม่พบชื่อคุณในระบบ! (กรุณาลงทะเบียนพนักงานก่อน)");
        setStatus("ไม่พบข้อมูลพนักงาน");
        setLastAction(prevAction);
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
        setLastAction(prevAction); 
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
      <div className="bg-white p-8 rounded-2xl shadow-xl w-full max-w-sm">
        
        <h1 className="text-xl font-bold mb-2 text-gray-800">In the haus</h1>
        {profile && <img src={profile.pictureUrl} className="w-16 h-16 rounded-full mx-auto mb-2" />}
        <p className="mb-2 font-bold text-gray-700">{profile?.displayName}</p>

        {/* ✅✅✅ ปุ่มเปิด/ปิด ID (กลับมาแล้ว) ✅✅✅ */}
        <div className="mb-6">
            <button 
                onClick={() => setShowId(!showId)}
                className="text-xs text-blue-500 hover:text-blue-700 underline mb-2 cursor-pointer"
            >
                {showId ? "ซ่อน ID" : "แสดง ID สำหรับลงทะเบียน"}
            </button>

            {showId && (
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 text-left animate-fade-in-down">
                    <p className="text-[10px] text-gray-400 font-bold uppercase mb-1">Your Line User ID:</p>
                    <p className="text-xs font-mono text-slate-700 break-all select-all">
                        {profile ? profile.userId : "กำลังโหลด..."}
                    </p>
                </div>
            )}
        </div>
        {/* ------------------------------------------- */}

        <div className={`p-3 rounded-lg mb-6 text-sm font-semibold ${status.includes('✅') ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-600'}`}>
            {status}
        </div>
        
        {/* ✅ Logic ปุ่มกดแบบ Smart: โชว์ทีละปุ่ม */}
        {status.includes('✅') && (
            <div className="flex flex-col gap-3 w-full">
                
                {lastAction === null && <p className="text-gray-400 animate-pulse">กำลังตรวจสอบสถานะ...</p>}

                {lastAction === 'check_out' && (
                    <button 
                        onClick={() => handleCheckIn('check_in')}
                        className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-5 rounded-xl shadow-lg transition transform active:scale-95 flex flex-col items-center justify-center"
                    >
                        <span className="text-xl">🟢 เข้างาน</span>
                        <span className="text-xs opacity-80">(Check In)</span>
                    </button>
                )}

                {lastAction === 'check_in' && (
                    <button 
                        onClick={() => handleCheckIn('check_out')}
                        className="w-full bg-red-500 hover:bg-red-600 text-white font-bold py-5 rounded-xl shadow-lg transition transform active:scale-95 flex flex-col items-center justify-center"
                    >
                        <span className="text-xl">🔴 ออกงาน</span>
                        <span className="text-xs opacity-80">(Check Out)</span>
                    </button>
                )}
            </div>
        )}

        {debugMsg && <p className="text-xs text-red-400 mt-4 break-words">{debugMsg}</p>}
      </div>
    </div>
  );
}