const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Read the route.js file to extract appendBrandingToFlex
const routeFilePath = path.join(__dirname, '../app/api/webhook/route.js');
let routeCode = fs.readFileSync(routeFilePath, 'utf8');

// We want to extract appendBrandingToFlex from routeCode
const match = routeCode.match(/function appendBrandingToFlex[\s\S]*?return newMsg;\r?\n}/);
if (!match) {
    console.error("Could not find appendBrandingToFlex function in route.js");
    process.exit(1);
}
const appendBrandingToFlexCode = match[0];

// Let's create a temp test script to run it
const testCode = `
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env.local') });

import { format, addHours, startOfWeek, addDays, parseISO } from 'date-fns';
import { getEffectiveRoster } from '../utils/roster.js';
import { supabase } from '../lib/supabaseClient.js';

${appendBrandingToFlexCode}

// Load stcalendar handler
import { handleRosterCommand } from './temp_roster_handler_3.mjs';

async function run() {
    const mockClient = {
        replyMessage: async (token, message) => {
            console.log("Original Message:", JSON.stringify(message, null, 2));
            const branded = appendBrandingToFlex(message);
            console.log("\\nBranded Message:", JSON.stringify(branded, null, 2));
            return true;
        }
    };

    const mockEvent = {
        replyToken: 'test_token'
    };

    await handleRosterCommand(mockEvent, mockClient, 'stcalendar', 'stcalendar', 'test_user');
}

run().catch(console.error);
`;

// Read the rosterHandler file
const handlerFilePath = path.join(__dirname, '../app/api/webhook/handlers/rosterHandler.js');
let handlerCode = fs.readFileSync(handlerFilePath, 'utf8');
handlerCode = handlerCode.replace(/'\.\.\/\.\.\/\.\.\/\.\.\/utils\/roster'/g, "'../utils/roster.js'");
handlerCode = handlerCode.replace(/'\.\.\/\.\.\/\.\.\/\.\.\/utils\/memory'/g, "'../utils/memory.js'");
handlerCode = handlerCode.replace(/'\.\.\/\.\.\/\.\.\/\.\.\/lib\/supabaseClient'/g, "'../lib/supabaseClient.js'");

fs.writeFileSync(path.join(__dirname, 'temp_roster_handler_3.mjs'), handlerCode, 'utf8');
fs.writeFileSync(path.join(__dirname, 'temp_test_branding.mjs'), testCode, 'utf8');

console.log("Ready to execute temp_test_branding.mjs...");
