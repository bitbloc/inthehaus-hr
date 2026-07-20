import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { generateStCalendarFlex } from '../app/api/webhook/handlers/rosterHandler.js';
import { parseISO } from 'date-fns';

async function test() {
    console.log("Generating calendar for 2026-07-20...");
    const flex = await generateStCalendarFlex(parseISO('2026-07-20'));
    if (!flex) {
        console.error("FAIL: flex message is null!");
        process.exit(1);
    }
    console.log("SUCCESS! Generated altText:", flex.altText);
    console.log("Generated bubbles count:", flex.contents.type === 'carousel' ? flex.contents.contents.length : 1);
    process.exit(0);
}

test().catch(err => {
    console.error("FAIL with error:", err);
    process.exit(1);
});
