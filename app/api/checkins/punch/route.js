import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';
import { verifyShopToken } from '../shop-token/route';
import { format, addHours } from 'date-fns';

// Shop Coordinates (In The Haus Nakhon Phanom)
const SHOP_LAT = 17.39009845004315;
const SHOP_LONG = 104.7929558480443;
const ALLOWED_RADIUS_KM = 0.08; // 80 meters

/**
 * Haversine formula for server-side distance validation
 */
function calculateDistanceInKm(lat1, lon1, lat2, lon2) {
  const R = 6371; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const {
      userId,
      latitude,
      longitude,
      accuracy,
      qrToken,
      photoBase64,
      moodStatus,
      deviceInfo,
      actionType: requestedAction
    } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: "Missing user identity" }, { status: 400 });
    }

    // 1. Authenticate Employee
    const { data: employee, error: empErr } = await supabase
      .from('employees')
      .select('*')
      .or(`line_user_id.eq.${userId},line_bot_id.eq.${userId}`)
      .maybeSingle();

    if (empErr || !employee) {
      return NextResponse.json({
        success: false,
        error: "ไม่พบข้อมูลพนักงานในระบบ กรุณาติดต่อผู้จัดการเพื่อลงทะเบียนเข้าสู่ระบบ In The Haus"
      }, { status: 404 });
    }

    if (employee.is_active === false) {
      return NextResponse.json({
        success: false,
        error: "บัญชีของคุณอยู่ระหว่างรอการอนุมัติสิทธิ์การใช้งานจากผู้จัดการ"
      }, { status: 403 });
    }

    // 2. Validate Proof of Presence (Multi-Factor: QR Token OR Geofence)
    let verificationMethod = 'GPS';
    let isLocationValid = false;

    if (qrToken && verifyShopToken(qrToken)) {
      verificationMethod = 'QR_CODE';
      isLocationValid = true;
    } else if (latitude !== undefined && longitude !== undefined && latitude !== null && longitude !== null) {
      const distanceKm = calculateDistanceInKm(latitude, longitude, SHOP_LAT, SHOP_LONG);
      
      // Allow slight GPS drift if accuracy is wider
      const maxAllowed = accuracy && accuracy > 50 ? ALLOWED_RADIUS_KM + 0.04 : ALLOWED_RADIUS_KM;
      
      if (distanceKm <= maxAllowed) {
        isLocationValid = true;
        verificationMethod = 'GPS';
      } else {
        return NextResponse.json({
          success: false,
          error: `คุณอยู่ห่างจากร้าน In The Haus เกินกำหนด (${(distanceKm * 1000).toFixed(0)} เมตร) กรุณาอยู่ที่ร้านหรือสแกน Dynamic QR Code หน้าร้าน`,
          distanceMeters: Math.round(distanceKm * 1000)
        }, { status: 400 });
      }
    } else {
      return NextResponse.json({
        success: false,
        error: "ไม่สามารถระบุตำแหน่งพิกัดได้ กรุณาเปิด GPS หรือสแกน QR Code ประจำร้าน"
      }, { status: 400 });
    }

    // 3. Determine Action (Smart Check-in / Check-out & Overnight Resolution)
    // IMPORTANT: attendance_logs has (id, employee_id, action_type, timestamp) - NO created_at column!
    const { data: lastLog, error: lastLogErr } = await supabase
      .from('attendance_logs')
      .select('id, action_type, timestamp')
      .eq('employee_id', employee.id)
      .order('timestamp', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastLogErr) {
      console.warn("attendance_logs lastLog query warning:", lastLogErr);
    }

    const serverNow = new Date();
    const serverTimestamp = serverNow.toISOString();

    let action = 'check_in';
    let duration = null;

    if (lastLog) {
      const lastTime = new Date(lastLog.timestamp);
      const diffMs = serverNow - lastTime;
      const diffHours = diffMs / (1000 * 60 * 60);

      if (lastLog.action_type === 'check_in') {
        // If last punch was check_in within 18 hours, this is check_out
        if (diffHours <= 18) {
          action = 'check_out';
          const totalMinutes = Math.floor(diffMs / (1000 * 60));
          const hours = Math.floor(totalMinutes / 60);
          const minutes = totalMinutes % 60;
          duration = { hours, minutes, totalMinutes };
        } else {
          // More than 18 hours -> New day check_in (auto-reset)
          action = 'check_in';
        }
      } else {
        // Last punch was check_out -> New check_in
        action = 'check_in';
      }
    }

    // If client explicitly requested an action, respect it if valid
    if (requestedAction === 'check_in' || requestedAction === 'check_out') {
      action = requestedAction;
      // If client requests check_out but duration wasn't computed from lastLog, calculate it if lastLog is check_in
      if (action === 'check_out' && !duration && lastLog && lastLog.action_type === 'check_in') {
        const lastTime = new Date(lastLog.timestamp);
        const diffMs = Math.max(0, serverNow - lastTime);
        const totalMinutes = Math.floor(diffMs / (1000 * 60));
        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;
        duration = { hours, minutes, totalMinutes };
      }
    }

    // 4. Calculate Punctuality & Shift Context (ICT / Bangkok Time: UTC+7)
    const bangkokNow = addHours(serverNow, 7);
    const todayDateStr = format(bangkokNow, 'yyyy-MM-dd');
    const dayOfWeek = bangkokNow.getUTCDay(); // 0=Sun, 1=Mon, ..., 6=Sat
    const dayIndex = (dayOfWeek + 6) % 7; // 0=Mon, ..., 6=Sun
    const punchHours = bangkokNow.getUTCHours();
    const punchMins = bangkokNow.getUTCMinutes();
    const punchMinutes = punchHours * 60 + punchMins;
    const timeFormatted = `${String(punchHours).padStart(2, '0')}:${String(punchMins).padStart(2, '0')}`;

    const empPos = (employee.position || '').toLowerCase();
    const isOwner = empPos.includes('owner') || empPos.includes('ceo');

    let shiftInfo = null;
    let statusCategory = 'ON_TIME'; // 'ON_TIME' | 'LATE' | 'OFF_DAY' | 'NO_SHIFT' | 'CHECKED_OUT'
    let statusLabel = 'เข้างานตรงเวลา (ปกติ ✅)';
    let isLate = false;
    let lateMinutes = 0;

    if (action === 'check_in') {
      if (isOwner) {
        statusCategory = 'ON_TIME';
        statusLabel = 'เข้างานสำเร็จ (👑 ผู้บริหาร)';
        shiftInfo = { name: '👑 ผู้บริหาร', startTime: null, endTime: null, isOff: false, isOwner: true };
      } else {
        // 1. Check Roster Transactions (highest priority)
        const { data: tx } = await supabase
          .from('roster_transactions')
          .select('*, shifts(*)')
          .eq('employee_id', employee.id)
          .eq('date', todayDateStr)
          .maybeSingle();

        let shiftStartTime = null;
        let shiftEndTime = null;
        let shiftName = null;
        let isOff = false;

        if (tx) {
          isOff = tx.is_off;
          shiftStartTime = tx.custom_start_time || tx.shifts?.start_time;
          shiftEndTime = tx.custom_end_time || tx.shifts?.end_time;
          shiftName = tx.shifts?.name || (isOff ? 'วันหยุด (OFF)' : 'กะงาน');
        } else {
          // 2. Check Overrides
          const { data: override } = await supabase
            .from('roster_overrides')
            .select('*')
            .eq('employee_id', employee.id)
            .eq('date', todayDateStr)
            .maybeSingle();

          if (override) {
            isOff = override.is_off;
            shiftStartTime = override.custom_start_time;
            shiftEndTime = override.custom_end_time;
            shiftName = 'กะพิเศษ (Override)';
          } else {
            // 3. Check Weekly Schedule
            const { data: weekly } = await supabase
              .from('employee_schedules')
              .select('shift_id, is_off, shifts(*)')
              .eq('employee_id', employee.id)
              .eq('day_of_week', dayIndex)
              .maybeSingle();

            if (weekly) {
              isOff = weekly.is_off;
              shiftStartTime = weekly.shifts?.start_time;
              shiftEndTime = weekly.shifts?.end_time;
              shiftName = weekly.shifts?.name || 'กะประจำ';
            }
          }
        }

        if (isOff) {
          statusCategory = 'OFF_DAY';
          statusLabel = 'เข้างานวันหยุด (ทำงานกะพิเศษ 🌟)';
          shiftInfo = { name: 'วันหยุด (OFF)', startTime: null, endTime: null, isOff: true };
        } else if (shiftStartTime) {
          const [sh, sm] = shiftStartTime.split(':').map(Number);
          const shiftStartMins = sh * 60 + sm;
          const diff = punchMinutes - shiftStartMins;

          shiftInfo = {
            name: shiftName,
            startTime: shiftStartTime.slice(0, 5),
            endTime: shiftEndTime ? shiftEndTime.slice(0, 5) : null,
            isOff: false
          };

          if (diff > 15) {
            statusCategory = 'LATE';
            isLate = true;
            lateMinutes = diff;
            statusLabel = `เข้างานสาย (+${diff} นาที ⚠️)`;
          } else {
            statusCategory = 'ON_TIME';
            isLate = false;
            lateMinutes = 0;
            statusLabel = 'เข้างานตรงเวลา (ปกติ ✅)';
          }
        } else {
          statusCategory = 'NO_SHIFT';
          statusLabel = 'เข้างานสำเร็จ (นอกตารางกะ)';
          shiftInfo = null;
        }
      }
    } else {
      // Check-out
      statusCategory = 'CHECKED_OUT';
      if (duration) {
        statusLabel = `ออกงานเรียบร้อย (${duration.hours} ชม. ${duration.minutes} น. 🌙)`;
      } else {
        statusLabel = 'ลงเวลาออกงานสำเร็จ 🌙';
      }
    }

    // 5. Upload Photo to Supabase Storage (if provided)
    let photoUrl = null;
    if (photoBase64 && typeof photoBase64 === 'string') {
      try {
        const rawBase64 = photoBase64.includes(',') ? photoBase64.split(',')[1] : photoBase64;
        const buffer = Buffer.from(rawBase64, 'base64');
        const fileName = `${employee.id}_${action}_${Date.now()}.jpg`;

        const { error: uploadErr } = await supabase.storage
          .from('checkin-photos')
          .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });

        if (!uploadErr) {
          const { data: { publicUrl } } = supabase.storage.from('checkin-photos').getPublicUrl(fileName);
          photoUrl = publicUrl;
        } else {
          // Fallback to yuzu-images bucket
          const { error: fallbackErr } = await supabase.storage
            .from('yuzu-images')
            .upload(fileName, buffer, { contentType: 'image/jpeg', upsert: true });
          if (!fallbackErr) {
            const { data: { publicUrl } } = supabase.storage.from('yuzu-images').getPublicUrl(fileName);
            photoUrl = publicUrl;
          }
        }
      } catch (uploadException) {
        console.warn("Checkin photo upload warning:", uploadException);
      }
    }

    // 6. Insert Log with Server-Authority Timestamp into attendance_logs
    const insertPayload = {
      employee_id: employee.id,
      action_type: action,
      timestamp: serverTimestamp,
      photo_url: photoUrl,
      location: latitude && longitude ? `(${longitude},${latitude})` : null,
      verification_method: verificationMethod,
      accuracy_meters: accuracy || null,
      mood_status: moodStatus || null,
      device_info: deviceInfo || null
    };

    const { data: insertedLog, error: insertErr } = await supabase
      .from('attendance_logs')
      .insert(insertPayload)
      .select()
      .single();

    if (insertErr) {
      console.error("Attendance log insert error:", insertErr);
      throw insertErr;
    }

    return NextResponse.json({
      success: true,
      action,
      timestamp: serverTimestamp,
      verificationMethod,
      duration,
      punchResult: {
        action,
        statusCategory, // 'ON_TIME' | 'LATE' | 'OFF_DAY' | 'NO_SHIFT' | 'CHECKED_OUT'
        statusLabel,
        isLate,
        lateMinutes,
        timeFormatted,
        dateFormatted: todayDateStr,
        shiftInfo,
        duration
      },
      employee: {
        id: employee.id,
        name: employee.name,
        nickname: employee.nickname,
        position: employee.position,
        photo_url: employee.photo_url
      },
      logId: insertedLog?.id
    });

  } catch (error) {
    console.error("Punch API Error:", error);
    return NextResponse.json({
      success: false,
      error: error.message || "เกิดข้อผิดพลาดในการลงเวลา กรุณาลองใหม่อีกครั้ง"
    }, { status: 500 });
  }
}
