const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function syncEmployees() {
    const list = [
        { name: 'เปอร์', nickname: 'เปอร์', position: 'Bar&Floor', line_bot_id: 'U5982dc3642092f71f02c0a55c2d4a2fd' },
        { name: 'ริสา', nickname: 'ริสา', position: 'Bar&Floor', line_bot_id: 'Ua62b57e86ad7ddc6d28411eeeee62f89' },
        { name: 'Add', nickname: 'Add', position: 'Bar&Floor', line_bot_id: 'Ucfeceafe08fabcd85e516d55ca0302a5' }
    ];

    for (const emp of list) {
        // Try match by nickname or name
        const { data, error } = await supabase
            .from('employees')
            .select('id, name, nickname')
            .or(`nickname.eq.${emp.name},name.eq.${emp.name}`)
            .maybeSingle();
        
        if (data) {
            console.log(`Updating ${emp.name} (ID: ${data.id})`);
            const { error: updateError } = await supabase
                .from('employees')
                .update({ 
                    line_bot_id: emp.line_bot_id,
                    position: emp.position
                })
                .eq('id', data.id);
            if (updateError) console.error(`Error updating ${emp.name}:`, updateError);
        } else {
            console.log(`Employee ${emp.name} not found. Creating new record...`);
            const { error: insertError } = await supabase
                .from('employees')
                .insert({
                    name: emp.name,
                    nickname: emp.nickname,
                    position: emp.position,
                    line_bot_id: emp.line_bot_id,
                    is_active: true,
                    employment_status: 'Fulltime'
                });
            if (insertError) console.error(`Error inserting ${emp.name}:`, insertError);
        }
    }

    // Create yuzu_config table and initial data
    console.log("Setting up yuzu_config...");
    const { data: configCheck, error: configCheckError } = await supabase.from('yuzu_config').select('*').limit(1);
    if (configCheckError) {
        console.log("yuzu_config table might be missing or inaccessible via standard client. Proceeding with configuration seeding if possible.");
    }

    // Seed config
    const configs = [
        { key: 'father_uid', value: 'U77e56cb573085ba79d37b496c6abdb63' },
        { key: 'mother_uid', value: 'U8c53c87647799f798f208250be71ae1b' }
    ];

    for (const cfg of configs) {
        const { error: cfgError } = await supabase
            .from('yuzu_config')
            .upsert(cfg);
        if (cfgError) console.error(`Error setting config ${cfg.key}:`, cfgError.message);
        else console.log(`Config ${cfg.key} set.`);
    }
}

syncEmployees();
