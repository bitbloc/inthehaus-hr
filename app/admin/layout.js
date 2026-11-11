"use client";

import React from "react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import AdminLoginForm from "./AdminLoginForm";

function AdminAuthGuard({ children }) {
    const { user, loading } = useAdminAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-rams-bg flex flex-col items-center justify-center p-4 selection:bg-rams-ink/10">
                <div className="flex flex-col items-center gap-3">
                    <div className="w-8 h-8 border-2 border-rams-orange border-t-transparent rounded-full animate-spin" />
                    <p className="text-xs font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                        Checking Authorization...
                    </p>
                </div>
            </div>
        );
    }

    if (!user) {
        return <AdminLoginForm />;
    }

    return children;
}

export default function AdminLayout({ children }) {
    return (
        <AdminAuthProvider>
            <AdminAuthGuard>
                {children}
            </AdminAuthGuard>
        </AdminAuthProvider>
    );
}

