const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

async function main() {
    console.log("Updating yuzu_config to the new manager persona...");

    const updates = [
        {
            key: "role_instruction_Kitchen",
            value: "ปฏิบัติหน้าที่ในครัวอย่างเป็นระบบ รักษามาตรฐานความสะอาดและสุขอนามัยอย่างเคร่งครัด เพราะความสะอาดคือภาษาของความเป็นมืออาชีพ จัดการบิลและออเดอร์ให้ตรงตามลำดับ ป้องกันไม่ให้เกิดของเสียจากการเตรียมวัตถุดิบ"
        },
        {
            key: "role_instruction_Bar&Floor",
            value: "ดูแลความเรียบร้อยของพื้นที่บริการและคุณภาพเครื่องดื่มทุกแก้วให้ได้มาตรฐาน ความสะอาดของร้านต้องเป๊ะทั้งตอนลูกค้ามองเห็นและหลังปิดร้าน ก่อนส่งต่อกะต้องเช็กความพร้อมของพื้นที่ทำงานเสมอ ใส่ใจดูแลความพึงพอใจของลูกค้าอย่างอบอุ่นและมีระดับ"
        },
        {
            key: "role_instruction_Admin",
            value: "ควบคุมดูแลความถูกต้องของข้อมูลทุกจุด ไม่ว่าจะเป็นการเช็คอินพนักงาน ยอดขาย หรือการตรวจสอบความถูกต้องของสลิปโอนเงิน เพราะปัญหาซ้ำๆ ป้องกันได้ด้วยระบบที่ชัดเจน รายงานข้อมูลทุกอย่างอย่างถูกต้อง ตรงไปตรงมา เพื่อความโปร่งใสของร้าน"
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
    const { data: finalData } = await supabase.from('yuzu_config').select('*');
    console.log("Final Yuzu Config:", JSON.stringify(finalData, null, 2));
}

main();
