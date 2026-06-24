const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

// Read the rosterHandler file
const filePath = path.join(__dirname, '../app/api/webhook/handlers/rosterHandler.js');
let code = fs.readFileSync(filePath, 'utf8');

// Replace relative extensionless imports (handles both single and double quotes)
code = code.replace(/'\.\.\/\.\.\/\.\.\/\.\.\/utils\/roster'/g, "'../utils/roster.js'");
code = code.replace(/'\.\.\/\.\.\/\.\.\/\.\.\/utils\/memory'/g, "'../utils/memory.js'");
code = code.replace(/'\.\.\/\.\.\/\.\.\/\.\.\/lib\/supabaseClient'/g, "'../lib/supabaseClient.js'");

code = code.replace(/"\.\.\/\.\.\/\.\.\/\.\.\/utils\/roster"/g, "'../utils/roster.js'");
code = code.replace(/"\.\.\/\.\.\/\.\.\/\.\.\/utils\/memory"/g, "'../utils/memory.js'");
code = code.replace(/"\.\.\/\.\.\/\.\.\/\.\.\/lib\/supabaseClient"/g, "'../lib/supabaseClient.js'");

const tempFilePath = path.join(__dirname, 'temp_roster_handler_2.mjs');
fs.writeFileSync(tempFilePath, code, 'utf8');

async function test() {
    try {
        console.log("Importing from temporary module...");
        const { handleRosterCommand } = await import('./temp_roster_handler_2.mjs');
        
        const mockClient = {
            replyMessage: async (token, message) => {
                console.log("SUCCESS! Reply Token:", token);
                console.log("Message Structure:", JSON.stringify(message, null, 2));
                return true;
            }
        };

        const mockEvent = {
            replyToken: 'test_token'
        };

        console.log("Calling handleRosterCommand for stcalendar...");
        console.time('Command Duration');
        await handleRosterCommand(mockEvent, mockClient, 'stcalendar', 'stcalendar', 'test_user');
        console.timeEnd('Command Duration');

    } catch (e) {
        console.error("CRITICAL ERROR IN RUNTIME:", e);
    } finally {
        // Clean up temp file
        try {
            fs.unlinkSync(tempFilePath);
        } catch (_) {}
    }
}

test();
