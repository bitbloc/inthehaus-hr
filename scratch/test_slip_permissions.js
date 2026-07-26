require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function testPermissionCheck(userPos, configKeyVal) {
    let allowedPositions = ['Bar & Floor', 'Owner', 'CEO', 'Manager'];
    if (configKeyVal) {
        try {
            if (configKeyVal.trim().startsWith('[')) {
                allowedPositions = JSON.parse(configKeyVal);
            } else {
                allowedPositions = configKeyVal.split(',').map(s => s.trim()).filter(Boolean);
            }
        } catch (e) {
            allowedPositions = configKeyVal.split(',').map(s => s.trim()).filter(Boolean);
        }
    }

    const empPosClean = userPos ? userPos.toLowerCase().replace(/\s/g, '') : '';
    const isAuthorized = allowedPositions.some(p => {
        const pClean = p.toLowerCase().replace(/\s/g, '');
        return empPosClean.includes(pClean) || pClean.includes(empPosClean);
    });

    let formattedAllowed = 'Bar & Floor และ Owner';
    if (allowedPositions.length === 1) {
        formattedAllowed = allowedPositions[0];
    } else if (allowedPositions.length > 1) {
        formattedAllowed = `${allowedPositions.slice(0, -1).join(', ')} และ ${allowedPositions[allowedPositions.length - 1]}`;
    }

    return { isAuthorized, formattedAllowed };
}

async function main() {
    console.log("--- Testing Slip Permission Logic ---");
    
    // Case 1: Default config, user position = "Bar & Floor"
    let res = await testPermissionCheck("Bar & Floor", null);
    console.log("Test 1 (Bar & Floor, default config):", res);

    // Case 2: Default config, user position = "Cooking"
    res = await testPermissionCheck("Cooking", null);
    console.log("Test 2 (Cooking, default config):", res);

    // Case 3: Custom config "Bar & Floor, Owner, Cooking", user position = "Cooking"
    res = await testPermissionCheck("Cooking", "Bar & Floor, Owner, Cooking");
    console.log("Test 3 (Cooking, custom config with Cooking):", res);

    // Case 4: Custom config "Bar & Floor", user position = "Owner"
    res = await testPermissionCheck("Owner", "Bar & Floor");
    console.log("Test 4 (Owner, custom config Bar & Floor only):", res);
}

main();
