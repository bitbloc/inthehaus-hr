"use client";

import { supabase } from './supabaseClient';

/**
 * fetch() for admin-only API routes: attaches the admin's Supabase access token
 * as `Authorization: Bearer <token>` so the route can verify the session.
 */
export async function adminFetch(input, init = {}) {
    const { data } = await supabase.auth.getSession();
    const token = data?.session?.access_token;
    const headers = new Headers(init.headers || {});
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return fetch(input, { ...init, headers });
}
