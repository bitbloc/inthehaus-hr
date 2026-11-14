"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "../../lib/supabaseClient";

const AdminAuthContext = createContext({
    user: null,
    session: null,
    loading: true,
    signOut: async () => {},
});

export function AdminAuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [session, setSession] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let isMounted = true;

        // 1. Get initial session
        supabase.auth.getSession().then(({ data: { session } }) => {
            if (isMounted) {
                setSession(session);
                setUser(session?.user ?? null);
                setLoading(false);
            }
        }).catch((err) => {
            console.error("[AdminAuth] getSession error:", err);
            if (isMounted) setLoading(false);
        });

        // 2. Listen to auth changes (sign in, sign out, token refresh)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            if (isMounted) {
                setSession(session);
                setUser(session?.user ?? null);
                setLoading(false);
            }
        });

        return () => {
            isMounted = false;
            subscription?.unsubscribe();
        };
    }, []);

    const signOut = async () => {
        try {
            await supabase.auth.signOut();
        } catch (err) {
            console.error("[AdminAuth] signOut error:", err);
        } finally {
            setUser(null);
            setSession(null);
            // Clear any legacy sessionStorage if present
            if (typeof window !== "undefined") {
                try {
                    sessionStorage.removeItem("adminAuth");
                } catch {
                    // ignore storage restriction
                }
            }
        }
    };

    return (
        <AdminAuthContext.Provider value={{ user, session, loading, signOut }}>
            {children}
        </AdminAuthContext.Provider>
    );
}

export function useAdminAuth() {
    const context = useContext(AdminAuthContext);
    if (!context) {
        throw new Error("useAdminAuth must be used within an AdminAuthProvider");
    }
    return context;
}

