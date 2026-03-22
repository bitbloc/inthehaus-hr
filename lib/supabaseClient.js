import { createClient } from '@supabase/supabase-js'

// ดึงค่า URL และ Key จากไฟล์ .env.local ที่เราทำเมื่อกี้
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

export const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false },
    global: {
        fetch: (...args) => fetch(args[0], { ...args[1], cache: 'no-store' })
    }
})