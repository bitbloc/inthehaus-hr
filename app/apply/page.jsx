/* Hallmark · route: /apply · structure: utilitarian job application console
 * paper: oklch(96% 0.006 80) · accent: oklch(62% 0.16 45) · display: Geist Mono · body: Geist Sans
 * axes: light / geometric-sans / warm · gates: all-pass
 */
"use client";
import React, { useState } from "react";
import Link from "next/link";
import { supabase } from "../../lib/supabaseClient";
import NavigationDock from "../_components/NavigationDock";

export default function JobApplicationPage() {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        full_name: "",
        nickname: "",
        email: "",
        phone: "",
        position_applied: "Barista",
        portfolio_url: "",
        cover_letter: "",
        experience_years: "1"
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const POSITIONS = [
        { id: "Barista", label: "BARISTA · บาริสต้า", desc: "สกัดเอสเปรสโซ ชงเครื่องดื่ม & คุมมาตรฐานบาร์" },
        { id: "Kitchen Staff", label: "KITCHEN · ผู้ช่วยครัว", desc: "เตรียมวัตถุดิบ ปรุงอาหารตาม SOP & จัดการออเดอร์" },
        { id: "Floor Service", label: "SERVICE · บริการหน้าร้าน", desc: "ต้อนรับ แนะนำเมนู แคชเชียร์ & สร้างรอยยิ้ม" },
        { id: "Store Manager", label: "MANAGER · ผู้จัดการ", desc: "บริหารทีม ตารางกะ & ควบคุมคุณภาพสาขา" }
    ];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNext = (e) => {
        e.preventDefault();
        setErrorMsg("");
        if (!formData.full_name.trim() || !formData.phone.trim()) {
            setErrorMsg("กรุณาระบุชื่อ-นามสกุล และเบอร์โทรศัพท์ติดต่อ");
            return;
        }
        setStep(2);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setErrorMsg("");

        try {
            const { error } = await supabase.from('job_applications').insert({
                full_name: formData.nickname ? `${formData.full_name} (${formData.nickname})` : formData.full_name,
                email: formData.email || null,
                phone: formData.phone,
                position_applied: formData.position_applied,
                metadata: {
                    nickname: formData.nickname,
                    portfolio: formData.portfolio_url,
                    cover_letter: formData.cover_letter,
                    experience_years: formData.experience_years,
                    submitted_at: new Date().toISOString()
                }
            });

            if (error) throw error;
            setIsSuccess(true);
        } catch (err) {
            console.error("Job application error:", err);
            setErrorMsg("ไม่สามารถส่งใบสมัครได้ กรุณาลองใหม่อีกครั้ง");
        } finally {
            setIsSubmitting(false);
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-rams-bg text-rams-ink safe-bottom-dock flex flex-col justify-center items-center px-4 py-12 font-sans">
                <div className="max-w-md w-full bg-rams-panel border border-rams-rule p-8 rounded-sm shadow-[0_2px_0_0_var(--color-rams-rule)] text-center">
                    <div className="w-12 h-12 bg-rams-green text-rams-panel rounded-full flex items-center justify-center mx-auto mb-4 font-mono font-bold text-lg">
                        ✓
                    </div>
                    <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-rams-ink-muted">
                        RECRUITMENT // IN THE HAUS
                    </span>
                    <h2 className="text-xl font-mono font-bold tracking-tight text-rams-ink mt-1 mb-2">
                        APPLICATION RECEIVED
                    </h2>
                    <p className="text-xs text-rams-ink-muted leading-relaxed mb-6">
                        ได้รับข้อมูลการสมัครงานตำแหน่ง <strong className="text-rams-ink">{formData.position_applied}</strong> ของ <strong className="text-rams-ink">{formData.full_name}</strong> เรียบร้อยแล้ว ทีมงานบริหารจะติดต่อกลับผ่านเบอร์โทรศัพท์ที่ระบุไว้ครับ
                    </p>
                    
                    <Link
                        href="/"
                        className="inline-block w-full py-3 bg-rams-orange text-rams-panel border border-rams-rule rounded-sm font-mono font-bold text-xs uppercase tracking-wider tactile-btn text-center"
                    >
                        RETURN TO PORTAL HUB →
                    </Link>
                </div>
                <NavigationDock />
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-rams-bg text-rams-ink safe-bottom-dock font-sans selection:bg-rams-orange selection:text-rams-panel">
            {/* Header */}
            <header className="border-b border-rams-rule-light bg-rams-panel px-6 py-5">
                <div className="max-w-3xl mx-auto flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="w-2.5 h-2.5 rounded-full bg-rams-orange animate-pulse"></span>
                            <span className="text-[10px] font-mono font-bold tracking-widest uppercase text-rams-ink-muted">
                                IN THE HAUS · TALENT RECRUITMENT
                            </span>
                        </div>
                        <h1 className="text-xl sm:text-2xl font-mono font-bold tracking-tight text-rams-ink mt-1">
                            CAREER OPPORTUNITIES
                        </h1>
                    </div>
                    
                    <Link 
                        href="/"
                        className="text-[10px] font-mono font-bold uppercase px-3 py-1.5 rounded-sm border border-rams-rule-light hover:border-rams-rule text-rams-ink-muted hover:text-rams-ink bg-rams-bg transition-colors"
                    >
                        ← BACK TO HUB
                    </Link>
                </div>
            </header>

            <main className="max-w-3xl mx-auto px-6 py-8">
                {/* Progress Bar */}
                <div className="bg-rams-panel border border-rams-rule-light rounded-sm p-4 mb-6">
                    <div className="flex items-center justify-between text-[10px] font-mono font-bold text-rams-ink-muted mb-2">
                        <span className={step === 1 ? "text-rams-orange" : "text-rams-ink"}>01. CANDIDATE PROFILE</span>
                        <span>———</span>
                        <span className={step === 2 ? "text-rams-orange" : "text-rams-ink-muted"}>02. POSITION & DETAILS</span>
                    </div>
                    <div className="w-full h-1.5 bg-rams-bg rounded-sm overflow-hidden border border-rams-rule-light">
                        <div 
                            className="h-full bg-rams-orange transition-all duration-300"
                            style={{ width: step === 1 ? "50%" : "100%" }}
                        />
                    </div>
                </div>

                {errorMsg && (
                    <div className="mb-6 p-3 bg-red-50 border border-rams-red text-rams-red text-xs font-mono rounded-sm flex items-center gap-2">
                        <span>⚠</span>
                        <span>{errorMsg}</span>
                    </div>
                )}

                {/* Form Card */}
                <div className="bg-rams-panel border border-rams-rule p-6 sm:p-8 rounded-sm shadow-[0_2px_0_0_var(--color-rams-rule-light)]">
                    {step === 1 ? (
                        <form onSubmit={handleNext} className="space-y-5">
                            <div>
                                <h2 className="font-mono font-bold text-base text-rams-ink">STEP 1: PERSONAL INFORMATION</h2>
                                <p className="text-xs text-rams-ink-muted mt-0.5">กรุณากรอกข้อมูลส่วนตัวสำหรับการติดต่อ</p>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1.5">
                                        ชื่อ - นามสกุล *
                                    </label>
                                    <input
                                        type="text"
                                        name="full_name"
                                        value={formData.full_name}
                                        onChange={handleChange}
                                        required
                                        placeholder="เช่น สมชาย ใจดี"
                                        className="w-full px-3.5 py-2.5 bg-rams-bg border border-rams-rule-light focus:border-rams-orange text-rams-ink text-sm rounded-sm outline-none transition-colors"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1.5">
                                        ชื่อเล่น
                                    </label>
                                    <input
                                        type="text"
                                        name="nickname"
                                        value={formData.nickname}
                                        onChange={handleChange}
                                        placeholder="เช่น ชาย"
                                        className="w-full px-3.5 py-2.5 bg-rams-bg border border-rams-rule-light focus:border-rams-orange text-rams-ink text-sm rounded-sm outline-none transition-colors"
                                    />
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1.5">
                                        เบอร์โทรศัพท์ติดต่อ *
                                    </label>
                                    <input
                                        type="tel"
                                        name="phone"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        required
                                        placeholder="08x-xxx-xxxx"
                                        className="w-full px-3.5 py-2.5 bg-rams-bg border border-rams-rule-light focus:border-rams-orange text-rams-ink text-sm rounded-sm outline-none transition-colors font-mono"
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1.5">
                                        อีเมล (Email)
                                    </label>
                                    <input
                                        type="email"
                                        name="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="you@example.com"
                                        className="w-full px-3.5 py-2.5 bg-rams-bg border border-rams-rule-light focus:border-rams-orange text-rams-ink text-sm rounded-sm outline-none transition-colors font-mono"
                                    />
                                </div>
                            </div>

                            <div className="pt-4 border-t border-rams-rule-light flex justify-end">
                                <button
                                    type="submit"
                                    className="w-full sm:w-auto px-6 py-3 bg-rams-orange text-rams-panel border border-rams-rule rounded-sm font-mono font-bold text-xs uppercase tracking-wider tactile-btn flex items-center justify-center gap-2"
                                >
                                    <span>CONTINUE TO STEP 2</span>
                                    <span>→</span>
                                </button>
                            </div>
                        </form>
                    ) : (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h2 className="font-mono font-bold text-base text-rams-ink">STEP 2: POSITION & EXPERIENCE</h2>
                                    <p className="text-xs text-rams-ink-muted mt-0.5">เลือกตำแหน่งงานและรายละเอียดเพิ่มเติม</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="text-[10px] font-mono font-bold text-rams-ink-muted hover:text-rams-ink uppercase"
                                >
                                    ← BACK
                                </button>
                            </div>

                            <div className="pt-2">
                                <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-2">
                                    เลือกตำแหน่งที่ต้องการสมัคร *
                                </label>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {POSITIONS.map(pos => {
                                        const isSelected = formData.position_applied === pos.id;
                                        return (
                                            <button
                                                key={pos.id}
                                                type="button"
                                                onClick={() => setFormData(prev => ({ ...prev, position_applied: pos.id }))}
                                                className={`p-3.5 rounded-sm border text-left transition-all ${
                                                    isSelected
                                                        ? "bg-rams-bg border-rams-orange ring-1 ring-rams-orange shadow-[0_2px_0_0_var(--color-rams-orange)]"
                                                        : "bg-rams-bg border-rams-rule-light hover:border-rams-rule"
                                                }`}
                                            >
                                                <div className="font-mono font-bold text-xs text-rams-ink flex items-center justify-between">
                                                    <span>{pos.label}</span>
                                                    {isSelected && <span className="text-rams-orange">✓</span>}
                                                </div>
                                                <p className="text-[11px] text-rams-ink-muted mt-1 leading-normal">
                                                    {pos.desc}
                                                </p>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1.5">
                                        ประสบการณ์ทำงานที่เกี่ยวข้อง
                                    </label>
                                    <select
                                        name="experience_years"
                                        value={formData.experience_years}
                                        onChange={handleChange}
                                        className="w-full px-3.5 py-2.5 bg-rams-bg border border-rams-rule-light focus:border-rams-orange text-rams-ink text-sm rounded-sm outline-none font-mono"
                                    >
                                        <option value="0">ยังไม่มีประสบการณ์ (พร้อมเรียนรู้)</option>
                                        <option value="1">1 ปี</option>
                                        <option value="2">2 ปี</option>
                                        <option value="3+">3 ปีขึ้นไป</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1.5">
                                        ลิงก์ Portfolio / Social Profile (ถ้ามี)
                                    </label>
                                    <input
                                        type="url"
                                        name="portfolio_url"
                                        value={formData.portfolio_url}
                                        onChange={handleChange}
                                        placeholder="https://..."
                                        className="w-full px-3.5 py-2.5 bg-rams-bg border border-rams-rule-light focus:border-rams-orange text-rams-ink text-sm rounded-sm outline-none transition-colors font-mono"
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1.5">
                                    แนะนำตัวเองสั้นๆ หรือเหตุผลที่อยากร่วมงานกับ In The Haus
                                </label>
                                <textarea
                                    name="cover_letter"
                                    value={formData.cover_letter}
                                    onChange={handleChange}
                                    rows={4}
                                    placeholder="บอกเล่าความสนใจ เป้าหมาย หรือสไตล์การทำงานของคุณ..."
                                    className="w-full px-3.5 py-2.5 bg-rams-bg border border-rams-rule-light focus:border-rams-orange text-rams-ink text-sm rounded-sm outline-none resize-none transition-colors"
                                />
                            </div>

                            <div className="pt-4 border-t border-rams-rule-light flex items-center justify-between">
                                <button
                                    type="button"
                                    onClick={() => setStep(1)}
                                    className="px-4 py-2.5 border border-rams-rule-light text-rams-ink-muted hover:text-rams-ink text-xs font-mono rounded-sm"
                                >
                                    ← BACK
                                </button>
                                <button
                                    type="submit"
                                    disabled={isSubmitting}
                                    className="px-6 py-3 bg-rams-orange text-rams-panel border border-rams-rule rounded-sm font-mono font-bold text-xs uppercase tracking-wider tactile-btn disabled:opacity-50 flex items-center gap-2"
                                >
                                    <span>{isSubmitting ? "SUBMITTING..." : "CONFIRM APPLICATION"}</span>
                                    <span>✓</span>
                                </button>
                            </div>
                        </form>
                    )}
                </div>
            </main>

            <NavigationDock />
        </div>
    );
}

