import { NextResponse } from 'next/server';
import { supabase } from '../../../lib/supabaseClient';

export const dynamic = 'force-dynamic';

const BUCKET = 'meeting-notes';
const SIGNED_URL_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * GET /api/meetings?userId=<LINE userId>
 * Returns meeting notes (with short-lived signed PDF URLs) for active employees only.
 */
export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        const userId = (searchParams.get('userId') || '').trim();

        if (!userId || !/^[A-Za-z0-9_-]+$/.test(userId)) {
            return NextResponse.json({ success: false, error: 'กรุณาเข้าสู่ระบบด้วย LINE' }, { status: 401 });
        }

        // 1. Authenticate employee (same approach as /api/checkins/punch)
        const { data: employee, error: empErr } = await supabase
            .from('employees')
            .select('id, is_active')
            .or(`line_user_id.eq.${userId},line_bot_id.eq.${userId}`)
            .maybeSingle();

        if (empErr || !employee) {
            return NextResponse.json({
                success: false,
                error: 'ไม่พบข้อมูลพนักงานในระบบ กรุณาติดต่อผู้จัดการเพื่อลงทะเบียน'
            }, { status: 403 });
        }

        if (employee.is_active === false) {
            return NextResponse.json({
                success: false,
                error: 'บัญชีของคุณอยู่ระหว่างรอการอนุมัติสิทธิ์จากผู้จัดการ'
            }, { status: 403 });
        }

        // 2. Fetch notes
        const { data: notes, error } = await supabase
            .from('meeting_notes')
            .select('id, title, meeting_date, summary, file_path, file_name, file_size, created_at')
            .order('meeting_date', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        // 3. Sign PDF URLs
        const paths = (notes || []).map((n) => n.file_path).filter(Boolean);
        let urlMap = {};
        if (paths.length > 0) {
            const { data: signed, error: signErr } = await supabase.storage
                .from(BUCKET)
                .createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);
            if (signErr) {
                console.warn('[meetings] createSignedUrls failed:', signErr);
            } else {
                urlMap = Object.fromEntries((signed || []).filter((s) => s.signedUrl).map((s) => [s.path, s.signedUrl]));
            }
        }

        const result = (notes || []).map(({ file_path, ...rest }) => ({
            ...rest,
            url: urlMap[file_path] || null
        }));

        return NextResponse.json({ success: true, notes: result });
    } catch (error) {
        console.error('[meetings] GET error:', error);
        return NextResponse.json({ success: false, error: error.message || 'เกิดข้อผิดพลาด' }, { status: 500 });
    }
}
