const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Updating yuzu_config to the 'Stern but Fair' persona...");

    const updates = [
        {
            key: "role_instruction_Kitchen",
            value: "ควบคุมมาตรฐานในครัวอย่างเข้มงวด ตั้งแต่ความสะอาดของจานชามไปจนถึงวัตถุดิบและ garnish ทุกจานที่ออกต้องรสชาตินิ่ง ปริมาณได้รูป และจัดแต่งจานเป๊ะตามมาตรฐาน คัดทิ้งส่วนที่เหี่ยว/ช้ำทันที ห้ามปล่อยของเสียเพราะเตรียมไม่ดี ทุกชิ้นต้องพร้อมเสิร์ฟจริงไม่ใช่แค่ถ่ายรูปสวย หากรสชาติหรือหน้าตาอาหารไม่ได้มาตรฐาน ห้ามออกจากครัวเด็ดขาด"
        },
        {
            key: "role_instruction_Bar&Floor",
            value: "ควบคุมมาตรฐานเครื่องดื่มทุกแก้วและการบริการหน้าร้านให้เป๊ะตลอดเวลา บาร์กาแฟต้องสะอาดเป็นระเบียบ ช็อตเอสเพรสโซ่ต้องอยู่ในระดับมาตรฐานทอง (Dose/Yield/Time) ทุกแก้วที่เสิร์ฟต้องสะอาดและ garnish สดใหม่ จัดการพื้นที่บริการให้พร้อมต้อนรับลูกค้าตั้งแต่เปิดจนปิดกะ ทุกโต๊ะและทางเดินต้องสะอาดเรียบร้อยก่อนลูกค้าเข้ามา ไม่ปล่อยผ่านงานค้างและปัญหาพื้นฐาน"
        },
        {
            key: "role_instruction_Admin",
            value: "จัดการข้อมูลและระบบเอกสารของร้านด้วยความโปร่งใสและเป๊ะทุกตัวเลข ตรวจสอบเวลาเช็คอิน-เช็คเอาท์และยอดขายอย่างสม่ำเสมอ ตรวจสลิปโอนเงินอย่างละเอียดเพื่อป้องกันการทุจริตและการลงบันทึกซ้ำซ้อน ไม่ปล่อยให้มีงานค้างหรือการทำงานข้ามระบบ รายงานปัญหาตามความเป็นจริงทันทีเพื่อร่วมกันแก้ไขระบบ"
        }
    ];

    for (const item of updates) {
        const { data, error } = await supabase
            .from('yuzu_config')
            .update({ value: item.value, updated_at: new Date().toISOString() })
            .eq('key', item.key);

        if (error) {
            console.error(`Error updating key ${item.key}:`, error);
        } else {
            console.log(`Successfully updated key: ${item.key}`);
        }
    }

    // Verify
    const { data: finalData } = await supabase.from('yuzu_config').select('key,value');
    console.log("Final Yuzu Config:", JSON.stringify(finalData, null, 2));
}

main();
