"use client";

import React from "react";
import { AdminAuthProvider, useAdminAuth } from "./AdminAuthContext";
import AdminLoginForm from "./AdminLoginForm";

function AdminAuthGuard({ children }) {
    const { user, loading } = useAdminAuth();

    if (loading) {
        return (
            <div className="min-h-screen bg-cream flex flex-col items-center justify-center p-4">
                <div className="flex flex-col items-center gap-3">
                    <p className="text-xs font-num font-semibold text-neutral">กำลังตรวจสิทธิ์…</p>
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

