import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';

export const dynamic = 'force-dynamic'; // ห้าม Cache

export async function GET(request) {
  try {
    console.log("🧹 Starting photo cleanup task...");

    // 1. คำนวณวันที่ย้อนหลัง 15 วัน
    const fifteenDaysAgo = new Date();
    fifteenDaysAgo.setDate(fifteenDaysAgo.getDate() - 15);
    const cutoffISO = fifteenDaysAgo.toISOString();

    console.log(`📅 Looking for photos older than: ${cutoffISO}`);

    // 2. ค้นหา Logs ที่เก่ากว่า 15 วัน และมี photo_url
    // เราจะดึงมาทีละ 100 รายการเพื่อไม่ให้ระบบทำงานหนักเกินไปในรอบเดียว (Pagination แบบง่าย)
    const { data: oldLogs, error: fetchError } = await supabase
      .from('attendance_logs')
      .select('id, photo_url')
      .lt('timestamp', cutoffISO) // น้อยกว่า (เก่ากว่า) 15 วันที่แล้ว
      .not('photo_url', 'is', null) // ที่มี URL รูป
      .limit(100); // ลบทีละ 100 รูปต่อรอบ (ปลอดภัยกว่า)

    if (fetchError) throw fetchError;

    if (!oldLogs || oldLogs.length === 0) {
      console.log("✅ No old photos to clean up.");
      return NextResponse.json({ success: true, message: "No photos to clean", count: 0 });
    }

    console.log(`found ${oldLogs.length} photos to delete.`);

    // 3. เตรียมรายชื่อไฟล์ที่จะลบออกจาก Storage
    // photo_url จะเป็น full URL เราต้องตัดให้เหลือแค่ path ใน bucket
    // เช่น https://xyz.supabase.co/.../public/checkin-photos/emp123/photo.jpg
    // เราต้องการแค่ "emp123/photo.jpg"
    const bucketName = 'checkin-photos';
    const filesToDelete = oldLogs.map(log => {
        const urlParts = log.photo_url.split(`${bucketName}/`);
        return urlParts.length > 1 ? urlParts[1] : null;
    }).filter(path => path !== null); // กรองอันที่ null ออก (เผื่อ URL ผิดฟอร์แมต)

    if (filesToDelete.length === 0) {
         return NextResponse.json({ success: true, message: "Error extracting file paths", count: 0 });
    }

    // 4. สั่งลบไฟล์ออกจาก Supabase Storage
    const { data: deletedFiles, error: deleteError } = await supabase
      .storage
      .from(bucketName)
      .remove(filesToDelete);

    if (deleteError) throw deleteError;

    console.log(`🗑️ Successfully deleted ${deletedFiles.length} files from storage.`);

    // 5. (Optional แต่แนะนำ) อัปเดตใน Database ให้ photo_url เป็น NULL 
    // เพื่อให้รู้ว่ารูปนี้ถูกลบไปแล้ว และจะไม่ถูกดึงมาลบซ้ำอีก
    const logIdsToUpdate = oldLogs.map(log => log.id);
    const { error: updateError } = await supabase
        .from('attendance_logs')
        .update({ photo_url: null }) // เซ็ตเป็น NULL
        .in('id', logIdsToUpdate); // อัปเดตเฉพาะ ID ที่เราเพิ่งลบรูปไป

    if (updateError) console.error("⚠️ Failed to update DB logs after photo deletion:", updateError.message);


    return NextResponse.json({ 
        success: true, 
        message: `Cleaned up ${deletedFiles.length} old photos`, 
        deleted_count: deletedFiles.length 
    });

  } catch (error) {
    console.error("❌ Cleanup Error:", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}