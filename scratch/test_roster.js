require('dotenv').config({ path: '.env.local' });
const { getEffectiveRoster } = require('../utils/roster.js');

async function main() {
    const targetDate = new Date('2026-05-22');
    console.log("Testing getEffectiveRoster for 2026-05-22...");
    try {
        const roster = await getEffectiveRoster(targetDate);
        console.log("Roster length:", roster.length);
        roster.forEach(r => {
            console.log(`Emp: ${r.nickname || r.name} | Off: ${r.is_off} | Shift: ${r.shift?.name} | SlotType: ${r.slot_type}`);
        });
    } catch (e) {
        console.error("Error running getEffectiveRoster:", e);
    }
}

main();
