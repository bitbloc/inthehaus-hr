require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

// We cannot run ALTER TABLE from REST API using Anon Key.
// I will print out the SQL commands that the admin must copy-paste into the Supabase SQL editor.

const sql = `
-- COPY AND PASTE THIS INTO SUPABASE SQL EDITOR --

ALTER TABLE public.employees ADD COLUMN line_bot_id text;
UPDATE public.employees SET line_bot_id = line_user_id WHERE line_bot_id IS NULL;

-- END OF SQL --
`;

console.log(sql);
