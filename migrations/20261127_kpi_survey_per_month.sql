-- ==============================================================================
-- In The Haus HR: question set per month (แบบวัดผลประจำเดือน)
-- Date: 2026-11-27
--
--   * kpi_surveys.for_period = 'YYYY-MM' → used only in that Bangkok month.
--     NULL → the default set, used in any month that has no set of its own.
--   * Adds the December 2026 set (problem solving + the shop's future).
--     It is inserted with is_active = false because the code deployed before
--     this change picks the newest active row regardless of month. Turn it on
--     (is_active = true) once the code that reads for_period is live.
-- ==============================================================================

ALTER TABLE public.kpi_surveys
    ADD COLUMN IF NOT EXISTS for_period TEXT CHECK (for_period IS NULL OR for_period ~ '^\d{4}-\d{2}$');

CREATE UNIQUE INDEX IF NOT EXISTS uq_kpi_surveys_active_period
    ON public.kpi_surveys(for_period) WHERE is_active AND for_period IS NOT NULL;

INSERT INTO public.kpi_surveys (title, intro, skip_days, is_active, for_period, questions)
SELECT
  'แบบวัดผลเดือนธันวาคม: การแก้ปัญหาและอนาคตของร้าน',
  'เดือนนี้อยากฟังเรื่องการแก้ปัญหาในร้าน และมุมมองของคุณต่ออนาคตของร้าน ใช้เวลาประมาณ 4 นาที เพื่อนในทีมไม่เห็นคำตอบของคุณ มีแค่เจ้าของร้านที่อ่าน',
  3,
  false,
  '2026-12',
  $json$[
    {"id":"d1","section":"การแก้ปัญหา","type":"scale","required":true,"text":"เวลามีปัญหาในร้าน ทีมแก้ได้เร็วแค่ไหน"},
    {"id":"d2","section":"การแก้ปัญหา","type":"scale","required":true,"text":"ปัญหาที่แก้ไปแล้ว ไม่กลับมาเกิดซ้ำอีก"},
    {"id":"d3","section":"การแก้ปัญหา","type":"scale","required":true,"text":"ฉันรู้ว่าเจอปัญหาแบบไหน ต้องบอกใคร หรือต้องทำอะไรก่อน"},
    {"id":"d4","section":"การแก้ปัญหา","type":"scale","required":true,"text":"ฉันกล้าแก้ปัญหาเล็กๆ เองได้ โดยไม่ต้องรอถาม"},
    {"id":"d5","section":"การแก้ปัญหา","type":"scale","required":true,"text":"เวลามีคนเสนอวิธีแก้ปัญหา ทีมรับฟังและลองทำจริง"},
    {"id":"d6","section":"ปัญหาที่เจอ","type":"multi","required":true,"allowOther":true,"text":"เดือนนี้ปัญหาไหนทำให้ทำงานยากที่สุด (เลือกได้หลายข้อ)",
     "options":["ของหมดหรือสต็อกไม่พอ","เครื่องมือหรืออุปกรณ์เสีย","คนไม่พอช่วงลูกค้าเยอะ","ออเดอร์ผิดหรือช้า","ลูกค้าไม่พอใจ","ความสะอาดและความเรียบร้อย","ไม่เจอปัญหาใหญ่"]},
    {"id":"d7","section":"ปัญหาที่เจอ","type":"text","required":true,"text":"มีปัญหาไหนที่ยังแก้ไม่จบ แล้วคิดว่าควรแก้อย่างไร"},
    {"id":"d8","section":"อนาคตของร้าน","type":"scale","required":true,"text":"ฉันมั่นใจว่าปีหน้าร้านจะดีขึ้นกว่าปีนี้"},
    {"id":"d9","section":"อนาคตของร้าน","type":"scale","required":true,"text":"ฉันรู้ว่าร้านอยากไปทางไหน และเป้าหมายของร้านคืออะไร"},
    {"id":"d10","section":"อนาคตของร้าน","type":"scale","required":true,"text":"ฉันเห็นตัวเองทำงานที่ร้านนี้ต่อไปอีก 1 ปี"},
    {"id":"d11","section":"อนาคตของร้าน","type":"multi","required":true,"allowOther":true,"text":"ปีหน้าอยากให้ร้านเน้นเรื่องไหน (เลือกได้หลายข้อ)",
     "options":["เมนูใหม่หรือปรับเมนู","บริการลูกค้า","ความเร็วในการทำออเดอร์","บรรยากาศและการตกแต่งร้าน","กิจกรรมและโปรโมชัน","ฝึกทักษะพนักงาน","สวัสดิการและการดูแลพนักงาน"]},
    {"id":"d12","section":"อนาคตของร้าน","type":"text","required":true,"text":"ถ้าได้เป็นเจ้าของร้าน 1 วัน จะเปลี่ยนอะไรเป็นอย่างแรก"},
    {"id":"d13","section":"อนาคตของร้าน","type":"text","required":false,"text":"อยากเรียนรู้หรือรับผิดชอบเรื่องอะไรเพิ่มในปีหน้า"}
  ]$json$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_surveys WHERE for_period = '2026-12');
