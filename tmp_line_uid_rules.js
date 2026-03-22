/**
 * Concept: Why are there two LINE UIDs?
 * 
 * LINE uses "Provider-specific User IDs" if the channels (Bot and LIFF/Login) are not under the same "Provider" in the LINE Developer Console.
 * 
 * Scenario A: Both under same Provider
 * -> UID = U... (same everywhere)
 * 
 * Scenario B: Under DIFFERENT Providers
 * -> Bot Channel = U471...
 * -> Login Channel = U598...
 * 
 * IF they are under different providers, we cannot use a single `line_user_id` column to match them.
 * 
 * Fix Approach:
 * If we can't merge Providers in LINE Console, we must:
 * 1. Let the `employees` table store `line_user_id` (for Check-in/LIFF).
 * 2. Add a new column `bot_user_id` (for the Webhook/Yuzu).
 * OR
 * Provide an easy way to link them.
 * 
 */
