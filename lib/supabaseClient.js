import { createClient } from '@supabase/supabase-js'

// ดึงค่า URL และ Key จากไฟล์ .env.local ที่เราทำเมื่อกี้
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

// สร้างตัวเชื่อมต่อ (Client) และส่งออกไปให้หน้าอื่นใช้
export const supabase = createClient(supabaseUrl, supabaseKey)