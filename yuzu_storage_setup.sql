-- 1. สร้าง Bucket ชื่อ yuzu-images
INSERT INTO storage.buckets (id, name, public) 
VALUES ('yuzu-images', 'yuzu-images', true)
ON CONFLICT (id) DO NOTHING;

-- 2. ตั้งค่า Policy ให้ทุกคนสามารถ "ดูรูป" ได้ (Public Read)
CREATE POLICY "Public Access" 
ON storage.objects FOR SELECT 
USING ( bucket_id = 'yuzu-images' );

-- 3. ตั้งค่า Policy ให้สามารถ "อัปโหลดรูป" ได้ (Public Insert)
-- หมายเหตุ: ในระบบจริงควรจำกัดสิทธิ์ เพื่อความปลอดภัย
CREATE POLICY "Public Upload" 
ON storage.objects FOR INSERT 
WITH CHECK ( bucket_id = 'yuzu-images' );

-- 4. ตั้งค่า Policy ให้สามารถ "อัปเดตรูป" ได้ (Public Update)
CREATE POLICY "Public Update" 
ON storage.objects FOR UPDATE 
USING ( bucket_id = 'yuzu-images' );
