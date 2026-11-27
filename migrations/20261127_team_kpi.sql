-- ==============================================================================
-- In The Haus HR: Team KPI survey (KPI ทีมรายเดือน)
-- Date: 2026-11-27
-- Applied to HR INTH Project (production) on 2026-11-27.
--
-- How it works
--   * One active survey (kpi_surveys). Its questions live in a JSON column, so the
--     owner edits them in /admin → "แบบวัดผล" without a code change.
--   * Every active staff member (not owner/CEO) answers once per Bangkok month.
--   * The check-in page asks for it before the check-in / check-out photo.
--     Staff may skip; the window is `skip_days` days from the first time they were
--     asked that month (kpi_progress.deadline_at). After it, check-in is refused
--     until the survey is done. Check-out is never refused.
--   * Answers (kpi_responses) can be written by the staff API but read only by
--     signed-in admins, so staff cannot see each other's answers.
--
-- Rollback: DROP TABLE public.kpi_responses, public.kpi_progress, public.kpi_surveys;
--   The check-in page and punch API fail open (no gate) when these tables are missing.
-- ==============================================================================

-- 1. Survey definition ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kpi_surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    intro TEXT,
    questions JSONB NOT NULL DEFAULT '[]'::jsonb,
    -- question: { id, section, type: 'scale'|'multi'|'text', text, required, options?, allowOther? }
    skip_days INT NOT NULL DEFAULT 3 CHECK (skip_days BETWEEN 0 AND 31),
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Per staff, per month: when they were first asked, skips, deadline ---------
CREATE TABLE IF NOT EXISTS public.kpi_progress (
    id BIGSERIAL PRIMARY KEY,
    survey_id UUID NOT NULL REFERENCES public.kpi_surveys(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    period TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),   -- Bangkok month 'YYYY-MM'
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deadline_at TIMESTAMPTZ NOT NULL,
    skip_count INT NOT NULL DEFAULT 0,
    last_skipped_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    extended_by TEXT,                 -- admin email when the deadline was extended
    UNIQUE (survey_id, employee_id, period)
);
CREATE INDEX IF NOT EXISTS idx_kpi_progress_period ON public.kpi_progress(period);

-- 3. Answers -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kpi_responses (
    id BIGSERIAL PRIMARY KEY,
    survey_id UUID NOT NULL REFERENCES public.kpi_surveys(id) ON DELETE CASCADE,
    employee_id BIGINT NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
    period TEXT NOT NULL CHECK (period ~ '^\d{4}-\d{2}$'),
    answers JSONB NOT NULL DEFAULT '{}'::jsonb,       -- { questionId: number | string | string[] }
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (survey_id, employee_id, period)
);
CREATE INDEX IF NOT EXISTS idx_kpi_responses_period ON public.kpi_responses(period);

-- 4. RLS -----------------------------------------------------------------------
ALTER TABLE public.kpi_surveys ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpi_responses ENABLE ROW LEVEL SECURITY;

-- Surveys: everyone reads, admins write.
REVOKE ALL ON public.kpi_surveys FROM anon;   -- Supabase default privileges grant anon everything
GRANT SELECT ON public.kpi_surveys TO anon;
GRANT ALL ON public.kpi_surveys TO authenticated, service_role;
DROP POLICY IF EXISTS "kpi_surveys read" ON public.kpi_surveys;
CREATE POLICY "kpi_surveys read" ON public.kpi_surveys FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "kpi_surveys admin write" ON public.kpi_surveys;
CREATE POLICY "kpi_surveys admin write" ON public.kpi_surveys FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Progress: the staff API (anon key until SUPABASE_SERVICE_ROLE_KEY is set) reads and writes it.
REVOKE ALL ON public.kpi_progress FROM anon;
GRANT SELECT, INSERT, UPDATE ON public.kpi_progress TO anon;
GRANT USAGE ON SEQUENCE public.kpi_progress_id_seq TO anon;
GRANT ALL ON public.kpi_progress TO authenticated, service_role;
DROP POLICY IF EXISTS "kpi_progress staff api" ON public.kpi_progress;
CREATE POLICY "kpi_progress staff api" ON public.kpi_progress FOR ALL TO anon USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "kpi_progress admin" ON public.kpi_progress;
CREATE POLICY "kpi_progress admin" ON public.kpi_progress FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Responses: anon may only INSERT (no read back), admins read and delete.
REVOKE ALL ON public.kpi_responses FROM anon;
GRANT INSERT ON public.kpi_responses TO anon;
GRANT USAGE ON SEQUENCE public.kpi_responses_id_seq TO anon;
GRANT ALL ON public.kpi_responses TO authenticated, service_role;
DROP POLICY IF EXISTS "kpi_responses staff insert" ON public.kpi_responses;
CREATE POLICY "kpi_responses staff insert" ON public.kpi_responses FOR INSERT TO anon WITH CHECK (true);
DROP POLICY IF EXISTS "kpi_responses admin" ON public.kpi_responses;
CREATE POLICY "kpi_responses admin" ON public.kpi_responses FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- 5. First survey (draft wording; edit in /admin → แบบวัดผล) ---------------------
INSERT INTO public.kpi_surveys (title, intro, skip_days, questions)
SELECT
  'แบบวัดผลประจำเดือน',
  'ตอบตามจริง ใช้เวลาประมาณ 3 นาที เพื่อนในทีมไม่เห็นคำตอบของคุณ มีแค่เจ้าของร้านที่อ่าน',
  3,
  $json$[
    {"id":"q1","section":"ภาพรวมทีม","type":"scale","required":true,"text":"เดือนนี้ทีมช่วยกันทำงานดีแค่ไหน"},
    {"id":"q2","section":"ภาพรวมทีม","type":"scale","required":true,"text":"ตอนลูกค้าเยอะหรือมีงานด่วน ทีมช่วยกันรับมือได้ดีแค่ไหน"},
    {"id":"q3","section":"การสื่อสาร","type":"scale","required":true,"text":"ฉันได้รู้เรื่องที่ต้องรู้ครบและทันเวลา เช่น ของหมด เมนูเปลี่ยน หรือสลับกะ"},
    {"id":"q4","section":"การสื่อสาร","type":"scale","required":true,"text":"การส่งต่องานระหว่างกะเปิดกับกะปิดชัดเจน ไม่ต้องเดาเอง"},
    {"id":"q5","section":"การสื่อสาร","type":"scale","required":true,"text":"เวลาสั่งหรือขอให้ช่วยงาน คนในทีมพูดชัดและสุภาพ"},
    {"id":"q6","section":"การสื่อสาร","type":"scale","required":true,"text":"ฉันกล้าทักเพื่อนตรงๆ เวลามีอะไรไม่โอเค"},
    {"id":"q7","section":"การสื่อสาร","type":"scale","required":true,"text":"เวลามีปัญหา ทีมคุยกันเพื่อแก้ ไม่ใช่โทษกัน"},
    {"id":"q8","section":"ปัญหาที่เจอ","type":"multi","required":true,"allowOther":true,"text":"เดือนนี้เจอปัญหาการสื่อสารแบบไหนบ้าง (เลือกได้หลายข้อ)",
     "options":["ไม่มีใครบอกต่อเรื่องสำคัญ","สั่งงานไม่ชัด","น้ำเสียงหรือคำพูดแรง","ไม่คุยกันตรงๆ แต่ไปพูดลับหลัง","ข้อความใน LINE ตกหล่นหรือไม่มีคนอ่าน","ไม่เจอปัญหา"]},
    {"id":"q9","section":"ตัวเองและบรรยากาศ","type":"scale","required":true,"text":"ให้คะแนนการสื่อสารของตัวเองเดือนนี้"},
    {"id":"q10","section":"ตัวเองและบรรยากาศ","type":"scale","required":true,"text":"ร้านเป็นที่ทำงานที่ฉันทำงานได้สบายใจ"},
    {"id":"q11","section":"เขียนเอง","type":"text","required":true,"text":"เรื่องหนึ่งที่อยากให้ทีมปรับในเดือนหน้า"},
    {"id":"q12","section":"เขียนเอง","type":"text","required":false,"text":"อยากชมใครในทีม เพราะอะไร"}
  ]$json$::jsonb
WHERE NOT EXISTS (SELECT 1 FROM public.kpi_surveys);
