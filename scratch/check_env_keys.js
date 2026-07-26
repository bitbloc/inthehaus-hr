require('dotenv').config({ path: '.env.local' });
console.log("Keys available in .env.local:", Object.keys(process.env).filter(k => k.includes('SUPABASE') || k.includes('POSTGRES') || k.includes('DATABASE') || k.includes('DB')));
