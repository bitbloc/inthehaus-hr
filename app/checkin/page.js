"use client";
import { useEffect, useState } from "react";
import liff from "@line/liff";
import { supabase } from "../../lib/supabaseClient";
import Link from "next/link"; // ✅ เพิ่ม import Link

export default function CheckIn() {
  const [status, setStatus] = useState("กำลังระบุตำแหน่ง...");
  const [profile, setProfile] = useState(null);
  const [debugMsg, setDebugMsg] = useState("");
  
  // State
  const [lastAction, setLastAction] = useState(null); 
  const [showId, setShowId] = useState(false);

  // --- ตั้งค่าพิกัดร้าน ---
  const SHOP_LAT = 17.390110564180162; 
  const SHOP_LONG = 104.79292673153263; 
  const ALLOWED_RADIUS_KM = 0.04; 
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
    const { data: emp } = await supabase.from('employees').select('id').eq('line_user_id', userId).single();
    if (!emp) return;

    const { data: log } = await supabase
        .from('attendance_logs')
        .select('action_type')
        .eq('employee_id', emp.id)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

    if (log) setLastAction(log.action_type);
    else setLastAction('check_out');
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
      setStatus(`✅ อยู่ในพื้นที่ร้าน (${dist.toFixed(3)} กม.)`);
    } else {
      setStatus(`❌ อยู่นอกพื้นที่ (${dist.toFixed(3)} กม.)`);
    }
  };

  const error = (err) => { setStatus("ไม่สามารถดึง GPS ได้"); };

  // คำนวณเวลา (เหมือนเดิม)
  const calculateTimeStatus = (actionType, shift) => {
      if (!shift) return "ไม่พบตารางเวร";
      const now = new Date();
      const currentMinutes = now.getHours() * 60 + now.getMinutes();
      if (actionType === 'check_in') {
          const [h, m] = shift.start_time.split(':').map(Number);
          const shiftStart = h * 60 + m;
          const diff = currentMinutes - shiftStart;
          if (diff > 0) return `สาย ${diff} นาที ⚠️`;
          else if (diff < -30) return `มาก่อนเวลา ${Math.abs(diff)} นาที 👍`;
          else return "ตรงเวลา ✨";
      } else { 
          const [h, m] = shift.end_time.split(':').map(Number);
          const shiftEnd = h * 60 + m;
          const diff = shiftEnd - currentMinutes;
          if (diff > 0) return `ออกก่อนเวลา ${diff} นาที ⚠️`;
          else return "เลิกงานปกติ 👋";
      }
  };

  const handleCheckIn = async (actionType) => { 
    if (!profile) return;
    const confirmMsg = actionType === 'check_in' ? "ยืนยันการ เข้างาน?" : "ยืนยันการ ออกงาน?";
    if (!confirm(confirmMsg)) return;

    const prevAction = lastAction;
    setLastAction(actionType); 
    setStatus("กำลังบันทึก...");
    
    const todayDay = new Date().getDay(); 
    const { data: emp, error: searchError } = await supabase
      .from('employees')
      .select('id, name, position, employee_schedules(day_of_week, shifts(start_time, end_time))')
      .eq('line_user_id', profile.userId)
      .eq('employee_schedules.day_of_week', todayDay)
      .single();

    if (searchError || !emp) {
        alert("❌ ไม่พบข้อมูล หรือ ไม่มีตารางงานวันนี้");
        setStatus("ข้อมูลผิดพลาด");
        setLastAction(prevAction);
        return;
    }

    const todaySchedule = emp.employee_schedules?.[0];
    const statusDetail = calculateTimeStatus(actionType, todaySchedule?.shifts);

    const { error: insertError } = await supabase.from('attendance_logs').insert({
        employee_id: emp.id,
        action_type: actionType,
    });

    if (!insertError) {
        const now = new Date();
        const timeString = `${now.getHours()}:${String(now.getMinutes()).padStart(2, '0')}`;
        try {
            await fetch('/api/notify-realtime', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name: emp.name,
                    position: emp.position,
                    action: actionType,
                    time: timeString,
                    locationStatus: status,
                    statusDetail: statusDetail
                })
            });
        } catch (e) { console.error("Notify Error", e); }

        alert(`✅ บันทึกสำเร็จ!\nสถานะ: ${statusDetail}`);
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
      <div className="bg-white p-8 rounded-3xl shadow-xl w-full max-w-sm transition-all duration-300 relative">
        
        <h1 className="text-2xl font-bold mb-1 text-gray-800 tracking-tight">In the haus</h1>
        <p className="text-gray-400 text-xs mb-6 uppercase tracking-widest">HR Check-in System</p>

        {profile && <img src={profile.pictureUrl} className="w-20 h-20 rounded-full mx-auto mb-3 shadow-md border-4 border-white" />}
        <p className="mb-1 font-bold text-gray-700 text-lg">{profile?.displayName}</p>

        <div className="mb-6">
            <button onClick={() => setShowId(!showId)} className="text-[10px] text-gray-400 hover:text-gray-600 underline">
                {showId ? "ซ่อน ID" : "แสดงรหัสพนักงาน"}
            </button>
            {showId && (
                <div className="bg-slate-100 p-2 mt-2 rounded border border-slate-200 text-left animate-pulse">
                    <p className="text-[10px] font-mono text-slate-600 break-all select-all">{profile ? profile.userId : "..."}</p>
                </div>
            )}
        </div>

        <div className={`py-2 px-4 rounded-full mb-6 text-xs font-bold inline-block shadow-sm ${status.includes('✅') ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-600'}`}>
            {status}
        </div>
        
        {status.includes('✅') && (
            <div className="flex flex-col gap-4 w-full">
                {lastAction === null && <p className="text-gray-400 text-sm">ตรวจสอบสถานะ...</p>}

                {lastAction === 'check_out' && (
                    <button onClick={() => handleCheckIn('check_in')} className="w-full bg-emerald-500 hover:bg-emerald-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-emerald-200 transition-all transform active:scale-95 flex items-center justify-center gap-2">
                        <span className="text-2xl">☀️</span>
                        <div className="text-left">
                            <div className="text-sm">สวัสดีตอนเช้า</div>
                            <div className="text-lg leading-none">ลงเวลาเข้างาน</div>
                        </div>
                    </button>
                )}

                {lastAction === 'check_in' && (
                    <button onClick={() => handleCheckIn('check_out')} className="w-full bg-rose-500 hover:bg-rose-600 text-white font-bold py-4 rounded-2xl shadow-lg shadow-rose-200 transition-all transform active:scale-95 flex items-center justify-center gap-2">
                        <span className="text-2xl">🌙</span>
                        <div className="text-left">
                            <div className="text-sm">เลิกงานแล้ว</div>
                            <div className="text-lg leading-none">ลงเวลาออกงาน</div>
                        </div>
                    </button>
                )}
            </div>
        )}

        {/* ✅ ปุ่มเมนูลางาน (เพิ่มใหม่ตรงนี้) */}
        <div className="mt-8 border-t pt-6">
            <Link href="/leave" className="block w-full py-3 rounded-xl border border-slate-200 text-slate-500 text-sm font-bold hover:bg-slate-50 hover:text-slate-700 transition flex items-center justify-center gap-2">
               <span>📝</span> ขอลาหยุด / แจ้งลา (Leave)
            </Link>
        </div>

      </div>
    </div>
  );
}