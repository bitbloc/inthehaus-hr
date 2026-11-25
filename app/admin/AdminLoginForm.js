"use client";

import React, { useState, useEffect } from "react";
import { supabase } from "../../lib/supabaseClient";

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
        if (lower.includes("email not confirmed")) return "อีเมลนี้ยังไม่ได้ยืนยัน กรุณาเข้าไปกดยืนยันใน Supabase Dashboard > Authentication > Users";
        if (lower.includes("otp_expired") || lower.includes("link is invalid") || lower.includes("has expired")) {
            return "ลิงก์ยืนยันในอีเมลหมดอายุแล้ว แนะนำให้เข้าไปกด 'Confirm user' ใน Supabase Dashboard ได้เลยทันที";
        }
        if (lower.includes("user already registered")) return "อีเมลนี้ถูกลงทะเบียนแล้ว กรุณาใช้แท็บเข้าสู่ระบบ";
        if (lower.includes("password should be at least")) return "รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร";
        if (lower.includes("signup requires a valid password")) return "กรุณากรอกรหัสผ่านที่ถูกต้อง";
        if (lower.includes("rate limit")) return "คุณพยายามเข้าสู่ระบบบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่";
        return msg;
    };

    useEffect(() => {
        if (typeof window !== "undefined" && window.location.hash) {
            const hash = window.location.hash.substring(1);
            const params = new URLSearchParams(hash);
            const errorDesc = params.get("error_description");
            const errorCode = params.get("error_code");
            if (errorDesc || errorCode) {
                setErrorMessage(formatError(decodeURIComponent(errorDesc || errorCode).replace(/\+/g, " ")));
                window.history.replaceState(null, "", window.location.pathname);
            }
        }
    }, []);

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
            const emailRedirectTo = typeof window !== "undefined" ? `${window.location.origin}/admin` : undefined;
            const { data, error } = await supabase.auth.signUp({
                email: email.trim(),
                password: password,
                options: {
                    emailRedirectTo,
                },
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
        <div className="brand-v2 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md bg-cream border border-charcoal">

                {/* Header */}
                <div className="bg-plum text-cream px-6 py-5 mb-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src="/logo-inbaan-wordmark-cream-96.png" alt="ในบ้าน" width={73} height={40} className="h-10 w-auto" />
                    <h1 className="font-head text-2xl mt-2">เข้าสู่หลังบ้าน</h1>
                    <p className="text-sm text-on-plum-2">สำหรับผู้จัดการร้าน</p>
                </div>
                <div className="px-6 pb-6 sm:px-8 sm:pb-8">

                {/* Mode Selector Tabs */}
                <div className="flex border border-rule mb-6 p-0.5 bg-cream text-xs font-num font-semibold">
                    <button
                        type="button"
                        onClick={() => { setMode("login"); setErrorMessage(""); setSuccessMessage(""); }}
                        className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer ${
 mode === "login"
 ? "bg-cream text-charcoal border border-rule"
 : "text-neutral hover:text-charcoal"
 }`}
                    >
                        เข้าสู่ระบบ
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode("signup"); setErrorMessage(""); setSuccessMessage(""); }}
                        className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer ${
 mode === "signup"
 ? "bg-cream text-charcoal border border-rule"
 : "text-neutral hover:text-charcoal"
 }`}
                    >
                        สมัครแอดมินแรก
                    </button>
                </div>

                {/* Error Banner */}
                {errorMessage && (
                    <div className="mb-4 p-3 bg-paper-2 border border-error flex items-start gap-2.5 text-xs font-num text-error">
                                                <span className="leading-relaxed">{errorMessage}</span>
                    </div>
                )}

                {/* Success Banner */}
                {successMessage && (
                    <div className="mb-4 p-3 bg-paper-2 border border-plum flex items-start gap-2.5 text-xs font-num text-plum">
                                                <span className="leading-relaxed">{successMessage}</span>
                    </div>
                )}

                {/* Form: LOGIN */}
                {mode === "login" && (
                    <form onSubmit={handleLogin} className="space-y-4">
                        <div>
                            <label className="text-xs font-num font-semibold text-neutral ml-1 flex items-center gap-1">
                                อีเมล
                            </label>
                            <input
                                type="email"
                                className="w-full p-3.5 bg-cream border border-rule mt-1 text-xs font-num font-semibold text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                                placeholder="admin@inthehaus.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                                autoFocus
                            />
                        </div>

                        <div>
                            <div className="flex justify-between items-center ml-1">
                                <label className="text-xs font-num font-semibold text-neutral flex items-center gap-1">
                                    รหัสผ่าน
                                </label>
                                <button
                                    type="button"
                                    onClick={() => { setMode("forgot"); setErrorMessage(""); setSuccessMessage(""); }}
                                    className="text-xs font-num font-semibold text-plum hover:underline cursor-pointer"
                                >
                                    ลืมรหัสผ่าน?
                                </button>
                            </div>
                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full p-3.5 pr-10 bg-cream border border-rule text-xs font-num font-semibold text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                                    placeholder="••••••••"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral hover:text-charcoal p-1 cursor-pointer"
                                >
                                    {showPassword ? "ซ่อน" : "แสดง"}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-charcoal text-cream border border-charcoal font-semibold text-base min-h-12 hover:bg-charcoal-2 transition-colors duration-150 cursor-pointer mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    
                                    <span>กำลังเข้าสู่ระบบ...</span>
                                </>
                            ) : (
                                <>
                                    เข้าสู่ระบบ
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* Form: SIGN UP */}
                {mode === "signup" && (
                    <form onSubmit={handleSignUp} className="space-y-4">
                        <div className="p-3 bg-paper-2 border border-plum text-xs font-num text-plum leading-relaxed">
                            <strong>สำหรับติดตั้งแอดมินคนแรก:</strong> กรอกอีเมลและรหัสผ่านที่ต้องการใช้เป็น Admin เพื่อสร้างผู้ดูแลคนแรกผ่าน Supabase Auth
                        </div>

                        <div>
                            <label className="text-xs font-num font-semibold text-neutral ml-1 flex items-center gap-1">
                                อีเมล
                            </label>
                            <input
                                type="email"
                                className="w-full p-3.5 bg-cream border border-rule mt-1 text-xs font-num font-semibold text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                                placeholder="your-email@inthehaus.com"
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                                required
                            />
                        </div>

                        <div>
                            <label className="text-xs font-num font-semibold text-neutral ml-1 flex items-center gap-1">
                                ตั้งรหัสผ่าน (อย่างน้อย 6 ตัวอักษร)
                            </label>
                            <div className="relative mt-1">
                                <input
                                    type={showPassword ? "text" : "password"}
                                    className="w-full p-3.5 pr-10 bg-cream border border-rule text-xs font-num font-semibold text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                                    placeholder="อย่างน้อย 6 ตัวอักษร"
                                    value={password}
                                    minLength={6}
                                    onChange={(e) => setPassword(e.target.value)}
                                    required
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowPassword(!showPassword)}
                                    className="absolute right-3 top-1/2 -translate-y-1/2 text-neutral hover:text-charcoal p-1 cursor-pointer"
                                >
                                    {showPassword ? "ซ่อน" : "แสดง"}
                                </button>
                            </div>
                        </div>

                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-3.5 bg-charcoal text-cream border border-charcoal font-num font-semibold hover:bg-charcoal-2 transition-colors duration-150 cursor-pointer mt-4 flex items-center justify-center gap-2 disabled:opacity-50"
                        >
                            {loading ? (
                                <>
                                    
                                    <span>กำลังสร้างบัญชี...</span>
                                </>
                            ) : (
                                <>
                                    ยืนยันการสร้างบัญชี Admin
                                </>
                            )}
                        </button>
                    </form>
                )}

                {/* Form: FORGOT PASSWORD */}
                {mode === "forgot" && (
                    <form onSubmit={handleResetPassword} className="space-y-4">
                        <div className="p-3 bg-paper-2 border border-plum text-xs font-num text-plum leading-relaxed">
                            ระบบจะส่งอีเมลพร้อมลิงก์สำหรับตั้งรหัสผ่านใหม่ไปยังอีเมลที่คุณระบุ
                        </div>

                        <div>
                            <label className="text-xs font-num font-semibold text-neutral ml-1 flex items-center gap-1">
                                อีเมล
                            </label>
                            <input
                                type="email"
                                className="w-full p-3.5 bg-cream border border-rule mt-1 text-xs font-num font-semibold text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
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
                                className="w-1/3 py-3 bg-cream text-charcoal border border-rule font-num font-semibold hover:border-charcoal text-xs cursor-pointer"
                            >
                                ย้อนกลับ
                            </button>
                            <button
                                type="submit"
                                disabled={loading}
                                className="w-2/3 py-3 bg-charcoal text-cream border border-charcoal font-semibold text-base min-h-12 hover:bg-charcoal-2 transition-colors duration-150 cursor-pointer text-xs flex items-center justify-center gap-2 disabled:opacity-50"
                            >
                                {loading ? "กำลังส่ง..." : "ส่งลิงก์รีเซ็ต"}
                            </button>
                        </div>
                    </form>
                )}

                </div>
            </div>
        </div>
    );
}

