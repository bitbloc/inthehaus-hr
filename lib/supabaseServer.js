// Server-only Supabase helpers for API routes.
// Never import this file from a "use client" component.
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
import { supabase as anonClient } from './supabaseClient';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

/** Extract the bearer token from an Authorization header, or null. */
export function getBearerToken(request) {
    const header = request.headers.get('authorization') || '';
    const match = header.match(/^Bearer\s+(.+)$/i);
    return match ? match[1].trim() : null;
}

/** A Supabase client that acts as the signed-in user (RLS role = authenticated). */
export function createUserClient(accessToken) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        global: { headers: { Authorization: `Bearer ${accessToken}` } },
    });
}

/**
 * Require a signed-in admin (Supabase Auth session from /admin).
 * Usage:
 *   const auth = await requireAdmin(request);
 *   if (auth.response) return auth.response;
 *   const { user, db } = auth;   // db writes as that user
 *
 * Optional: set ADMIN_EMAILS="a@x.com,b@y.com" to restrict to specific accounts.
 */
export async function requireAdmin(request) {
    const token = getBearerToken(request);
    if (!token) return { response: unauthorized('ต้องเข้าสู่ระบบผู้ดูแลก่อน (missing token)') };

    const { data, error } = await anonClient.auth.getUser(token);
    const user = data?.user;
    if (error || !user) return { response: unauthorized('เซสชันหมดอายุหรือไม่ถูกต้อง กรุณาเข้าสู่ระบบใหม่') };

    const allow = (process.env.ADMIN_EMAILS || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    if (allow.length > 0 && !allow.includes((user.email || '').toLowerCase())) {
        return { response: NextResponse.json({ success: false, message: 'ไม่มีสิทธิ์ผู้ดูแล' }, { status: 403 }) };
    }

    return { user, db: createUserClient(token) };
}

let serviceClient = null;
let warnedNoServiceKey = false;

/**
 * Client for trusted server code with no user session (LINE webhook, crons).
 * Uses SUPABASE_SERVICE_ROLE_KEY when set (bypasses RLS). Until that env var is
 * configured it falls back to the anon client, so behaviour is unchanged today.
 */
export function getServiceClient() {
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) {
        if (!warnedNoServiceKey) {
            console.warn('[supabaseServer] SUPABASE_SERVICE_ROLE_KEY not set; server writes use the anon key.');
            warnedNoServiceKey = true;
        }
        return anonClient;
    }
    if (!serviceClient) {
        serviceClient = createClient(SUPABASE_URL, key, {
            auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
        });
    }
    return serviceClient;
}

function unauthorized(message) {
    return NextResponse.json({ success: false, message }, { status: 401 });
}
