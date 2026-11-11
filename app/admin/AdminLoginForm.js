"use client";

import React, { useState } from "react";
import { supabase } from "../../lib/supabaseClient";
import { Lock, Mail, Key, Eye, EyeOff, ShieldCheck, UserPlus, LogIn, AlertCircle, CheckCircle2, HelpCircle } from "lucide-react";

export default function AdminLoginForm() {
    const [mode, setMode] = useState("login"); // "login" | "signup" | "forgot"
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [showPassword, setShowPassword] = useState(false);
    const [loading, setLoading] = useState(false);
    const [errorMessage, setErrorMessage] = useState("");
    const [successMessage, setSuccessMessage] = useState("");

    const formatError = (msg) => {
        if (!msg) return "เกิดข้อผิดพลาดในการเข้าสู่ระบบ";
        const lower = msg.toLowerCase();
        if (lower.includes("invalid login credentials")) return "อีเมลหรือรหัสผ่านไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง";
        if (lower.includes("email not confirmed")) return "อีเมลนี้ยังไม่ได้ยืนยัน กรุณาตรวจสอบกล่องข้อความหรือปิด Require Email Confirmation ใน Supabase Dashboard";
        if (lower.includes("user already registered")) return "อีเมลนี้ถูกลงทะเบียนแล้ว กรุณาใช้แท็บเข้าสู่ระบบ";
        if (lower.includes("password should be at least")) return "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร";
        if (lower.includes("signup requires a valid password")) return "กรุณากรอกรหัสผ่านที่ถูกต้อง";
        if (lower.includes("rate limit")) return "คุณพยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
        return msg;
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");
        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.trim(),
                password: password,
            });

            if (error) throw error;
            // On success, onAuthStateChange in AdminAuthContext will automatically trigger re-render
        } catch (err) {
            setErrorMessage(formatError(err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleSignUp = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");
        setLoading(true);

        try {
            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password: password,
            });

            if (error) throw error;

            if (data.session) {
                setSuccessMessage("สร้างบัญชีผู้ดูแลระบบสำเร็จและเข้าสู่ระบบเรียบร้อยแล้ว!");
            } else if (data.user) {
                setSuccessMessage("สร้างบัญชีสำเร็จ! หาก Supabase เปิด Require Email Confirmation กรุณาตรวจสอบอีเมลเพื่อกดยืนยัน หรือเข้า Supabase Dashboard > Authentication > Users เพื่อ Auto Confirm");
            }
        } catch (err) {
            setErrorMessage(formatError(err.message));
        } finally {
            setLoading(false);
        }
    };

    const handleResetPassword = async (e) => {
        e.preventDefault();
        setErrorMessage("");
        setSuccessMessage("");
        setLoading(true);

        try {
            const redirectTo = typeof window !== "undefined" ? `${window.location.origin}/admin` : undefined;
            const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
                redirectTo,
            });

            if (error) throw error;
            setSuccessMessage("ส่งลิงก์ตั้งรหัสผ่านใหม่ไปยังอีเมลของคุณแล้ว กรุณาตรวจสอบกล่องข้อความ");
        } catch (err) {
            setErrorMessage(formatError(err.message));
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-rams-bg flex items-center justify-center p-4 selection:bg-rams-ink/10">
            <div className="w-full max-w-md bg-rams-panel border border-rams-rule rounded-sm p-6 sm:p-8 shadow-[0_4px_0_0_var(--color-rams-rule)]">
                
                {/* Header */}
                <div className="text-center mb-6">
                    <div className="w-12 h-12 bg-rams-yellow border border-rams-rule rounded-sm mx-auto flex items-center justify-center mb-3 shadow-[0_2px_0_0_var(--color-rams-rule)]">
                        <Lock className="w-6 h-6 text-rams-ink" />
                    </div>
                    <h1 className="text-xl font-mono font-bold tracking-wider text-rams-ink uppercase">
                        Admin Portal
                    </h1>
                    <p className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-widest mt-1">
                        In The Haus HR & Operations • Supabase Auth
                    </p>
                </div>

                {/* Mode Selector Tabs */}
                <div className="flex border border-rams-rule-light rounded-sm mb-6 p-0.5 bg-rams-bg text-xs font-mono font-bold">
                    <button
                        type="button"
                        onClick={() => { setMode("login"); setErrorMessage(""); setSuccessMessage(""); }}
                        className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-all rounded-sm cursor-pointer ${
                            mode === "login"
                                ? "bg-rams-panel text-rams-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-rams-rule-light"
                                : "text-rams-ink-muted hover:text-rams-ink"
                        }`}
                    >
                        <LogIn size={13} /> เข้าสู่ระบบ
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode("signup"); setErrorMessage(""); setSuccessMessage(""); }}
                        className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-all rounded-sm cursor-pointer ${
                            mode === "signup"
                                ? "bg-rams-panel text-rams-ink shadow-[0_1px_2px_rgba(0,0,0,0.05)] border border-rams-rule-light"
                                : "text-rams-ink-muted hover:text-rams-ink"
                        }`}
                    >
                        <UserPlus size={13} /> สมัครแอดมินแรก
                    </button>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="mb-4 p-3 bg-red-50 border border-red-300 rounded-sm flex items-start gap-2.5 text-xs font-mono text-red-700">
                        <AlertCircle size={15} className="shrink-0 mt-0.5 text-red-600" />
                        <span className="leading-relaxed">{errorMessage}</span>
                    </div>
                )}

                {/* Success Banner */}
                {successMessage && (
                    <div className="mb-4 p-3 bg-emerald-50 border border-emerald-300 rounded-sm flex items-start gap-2.5 text-xs font-mono text-emerald-800">
                        <CheckCircle2 size={15} className="shrink-0 mt-0.5 text-emerald-600" />
                        <span className="leading-relaxed">{successMessage}</span>
                    </div>
                )}

                {/* Form: LOGIN */}
                {mode === "login" && (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest ml-1 flex items-center gap-1">
                                <Mail size={11} /> Admin Email
                            </label>
                            <input
                                type="email"
                                className="w-full p-3.5 bg-rams-bg border border-rams-rule-light rounded-sm mt-1 text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-rule transition-all"
                                placeholder="admin@inthehaus.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest flex items-center gap-1">
                                    <Key size={11} /> Password
                                </label>
                                <button
                                    type="button"
                                    onClick={() => { setMode("forgot"); setErrorMessage(""); setSuccessMessage(""); }}
                                    className="text-[9px] font-mono font-bold text-rams-orange hover:underline cursor-pointer"
                                >
                                    ลืมรหัสผ่าน?
                                </button>
                            </div>
                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full p-3.5 pr-10 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-rule transition-all"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-rams-ink-muted hover:text-rams-ink p-1 cursor-pointer"
                                >
                                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-rams-orange text-rams-panel border border-rams-rule rounded-sm font-mono font-bold uppercase tracking-wider hover:bg-rams-orange-active shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-rams-panel border-t-transparent rounded-full animate-spin" />
                                    <span>กำลังเข้าสู่ระบบ...</span>
                                </>
                            ) : (
                                <>
                                    <ShieldCheck size={16} /> เข้าสู่ระบบ Admin Dashboard
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* Form: SIGN UP */}
                {mode === "signup" && (
                    <form onSubmit={handleSignUp} className="space-y-4">
                        <div className="p-3 bg-amber-50 border border-amber-200 rounded-sm text-[10px] font-mono text-amber-900 leading-relaxed">
                            💡 <strong>สำหรับติดตั้งแอดมินคนแรก:</strong> กรอกอีเมลและรหัสผ่านที่ต้องการใช้เป็น Admin เพื่อสร้างผู้ดูแลคนแรกผ่าน Supabase Auth
                        </div>

                        <div>
                            <label className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest ml-1 flex items-center gap-1">
                                <Mail size={11} /> Admin Email
                            </label>
                            <input
                                type="email"
                                className="w-full p-3.5 bg-rams-bg border border-rams-rule-light rounded-sm mt-1 text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-rule transition-all"
                                placeholder="your-email@inthehaus.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest ml-1 flex items-center gap-1">
                                <Key size={11} /> Create Password (อย่างน้อย 6 ตัวอักษร)
                            </label>
                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full p-3.5 pr-10 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-rule transition-all"
                                    placeholder="อย่างน้อย 6 ตัวอักษร"
                                    value={password}
                                    minLength={6}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-rams-ink-muted hover:text-rams-ink p-1 cursor-pointer"
                                >
                                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-rams-ink text-rams-panel border border-rams-rule rounded-sm font-mono font-bold uppercase tracking-wider hover:bg-black shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    <div className="w-3.5 h-3.5 border-2 border-rams-panel border-t-transparent rounded-full animate-spin" />
                                    <span>กำลังสร้างบัญชี...</span>
                                </>
                            ) : (
                                <>
                                    <UserPlus size={16} /> ยืนยันการสร้างบัญชี Admin
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* Form: FORGOT PASSWORD */}
                {mode === "forgot" && (
                    <form onSubmit={handleResetPassword} className="space-y-4">
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-sm text-[10px] font-mono text-blue-900 leading-relaxed">
                            ระบบจะส่งอีเมลพร้อมลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยังอีเมลที่คุณระบุ
                        </div>

                        <div>
                            <label className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest ml-1 flex items-center gap-1">
                                <Mail size={11} /> Admin Email
                            </label>
                            <input
                                type="email"
                                className="w-full p-3.5 bg-rams-bg border border-rams-rule-light rounded-sm mt-1 text-xs font-mono font-bold text-rams-ink outline-none focus:border-rams-rule transition-all"
                                placeholder="admin@inthehaus.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <div className="flex gap-2 mt-4">
                            <button
                                type="button"
                                onClick={() => { setMode("login"); setErrorMessage(""); setSuccessMessage(""); }}
                                className="w-1/3 py-3 bg-rams-bg text-rams-ink border border-rams-rule-light rounded-sm font-mono font-bold uppercase tracking-wider hover:border-rams-rule text-xs cursor-pointer"
                            >
                                ย้อนกลับ
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-2/3 py-3 bg-rams-orange text-rams-panel border border-rams-rule rounded-sm font-mono font-bold uppercase tracking-wider hover:bg-rams-orange-active shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[2px] active:shadow-none transition-all cursor-pointer text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ต"}
                            </button>
                        </div>
                    </form>
                )}

                {/* Security Footer */}
                <div className="mt-8 pt-4 border-t border-rams-rule-light text-center">
                    <div className="flex items-center justify-center gap-1.5 text-[9px] font-mono text-rams-ink-muted uppercase tracking-wider">
                        <ShieldCheck size={12} className="text-emerald-600" />
                        <span>Secured with Supabase Auth & JWT</span>
                    </div>
                </div>

            </div>
        </div>
    );
}

