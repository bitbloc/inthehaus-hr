const { createClient } = require('@supabase/supabase-js');
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../.env.local') });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://qmdhbnjjwogtnntjgrle.supabase.co';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    try {
        console.log("Starting DB update for roster transactions...");

        const updates = [
            // Add (ID: 12)
            { employee_id: 12, date: '2026-05-01', shift_id: 3, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // ควบกะ
            { employee_id: 12, date: '2026-05-02', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ (in 16:16, no out)
            { employee_id: 12, date: '2026-05-03', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-04', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-06', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-07', shift_id: 3, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // ควบกะ
            { employee_id: 12, date: '2026-05-08', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-09', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-10', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-11', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-13', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-14', shift_id: 3, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // ควบกะ
            { employee_id: 12, date: '2026-05-15', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-16', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-17', shift_id: 2, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะค่ำ
            { employee_id: 12, date: '2026-05-26', shift_id: 3, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // ควบกะ
            { employee_id: 12, date: '2026-05-27', shift_id: 1, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะเช้า (in 10:00, no out)

            // แคสเปอร์ (ID: 3)
            { employee_id: 3, date: '2026-05-08', shift_id: 1, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะเช้า ( worked on off day )
            { employee_id: 3, date: '2026-05-15', shift_id: 1, is_off: false, slot_type: 'MAIN', status: 'PUBLISHED' }, // กะเช้า ( worked on off day )

            // พี่ปุ้ย (ID: 5)
            { 
                employee_id: 5, 
                date: '2026-05-04', 
                shift_id: 1, 
                is_off: false, 
                slot_type: 'MAIN', 
                status: 'PUBLISHED',
                custom_start_time: '09:56:00',
                custom_end_time: '22:12:00' // Extension to cover her double checkout at 22:12
            }
        ];

        console.log(`Upserting ${updates.length} roster transactions...`);
        
        for (const update of updates) {
            const { data, error } = await supabase
                .from('roster_transactions')
                .upsert(update, { onConflict: 'employee_id, date, slot_type' });
            
            if (error) {
                console.error(`Failed to upsert for Emp: ${update.employee_id} Date: ${update.date}`, error);
            } else {
                console.log(`Successfully upserted for Emp: ${update.employee_id} Date: ${update.date}`);
            }
        }

        console.log("Database update completed!");

    } catch (e) {
        console.error(e);
    }
}

run();
