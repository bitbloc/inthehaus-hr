-- In The Haus: Slip System Upgrade V2 (Tech Startup Level)

-- 1. เพิ่มคอลัมน์เก็บรหัสอ้างอิงและชื่อผู้โอนที่ AI อ่านได้จากสลิป
ALTER TABLE public.slip_transactions 
ADD COLUMN IF NOT EXISTS transaction_ref TEXT,
ADD COLUMN IF NOT EXISTS sender_name TEXT;

-- 2. เพื่อป้องกันลูกเล่นหรือคนสแกนสลิปซ้ำ เราจะบังคับไม่ให้ transaction_ref ซ้ำกันเด็ดขาด (Duplicate Prevention)
-- หมายเหตุ: หากมี transaction_ref ที่ซ้ำกันอยู่ก่อนหน้า คำสั่งตายตัวอาจจะแจ้ง Error ได้
-- คำแนะนำ: แนะนำให้รันตอนยังไม่มีข้อมูลสลิปที่มี transaction_ref เดียวกันมากๆ 
ALTER TABLE public.slip_transactions 
ADD CONSTRAINT slip_transactions_transaction_ref_key UNIQUE (transaction_ref);

-- เสร็จสิ้นการอัปเกรดฐานข้อมูลสำหรับ V2
