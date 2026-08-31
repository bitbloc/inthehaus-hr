"use client";
import React, { useState, useEffect } from "react";
import { 
    User, Briefcase, DollarSign, Shield, X, Check, AlertCircle, 
    Smartphone, CreditCard, Sparkles, Building2, HelpCircle, Calculator 
} from "lucide-react";

export default function StaffModal({ isOpen, onClose, onSave, initialData, isEditing }) {
    if (!isOpen) return null;

    const [activeTab, setActiveTab] = useState("core");
    const [formData, setFormData] = useState({
        name: "", 
        name_en: "", 
        nickname: "",
        phone: "", 
        email: "", 
        line_user_id: "", 
        line_bot_id: "",
        address: "", 
        id_card: "",
        employment_status: "Fulltime", 
        position: "", 
        job_level: "Staff",
        start_date: "", 
        probation_date: "",
        base_salary: "", 
        bank_account: "", 
        bank_name: "KBANK",
        social_security_id: "", 
        tax_id: "",
        shift_rates: { 
            wage_type: "daily",
            morning: 350, 
            evening: 400, 
            double: 800,
            hourly_rate: 50,
            ot_rate: 75,
            monthly_allowance: 0,
            diligence_allowance: 1000,
            social_security_enrolled: false,
            withholding_tax_pct: 0
        },
        emergency_contact: "", 
        skills: [], 
        education_history: [],
        is_active: true
    });

    useEffect(() => {
        if (initialData) {
            const rawRates = initialData.shift_rates || {};
            const inferredWageType = rawRates.wage_type || (
                initialData.employment_status === 'Fulltime' && initialData.base_salary > 0 
                    ? 'monthly' 
                    : (rawRates.morning || rawRates.evening ? 'daily' : 'hourly')
            );

            setFormData({
                ...initialData,
                shift_rates: {
                    wage_type: inferredWageType,
                    morning: rawRates.morning ?? 350,
                    mid: rawRates.mid ?? 380,
                    evening: rawRates.evening ?? 400,
                    night: rawRates.night ?? 500,
                    double: rawRates.double ?? 800,
                    rush_4h: rawRates.rush_4h ?? 220,
                    hourly_rate: rawRates.hourly_rate ?? 50,
                    ot_rate: rawRates.ot_rate ?? 75,
                    monthly_allowance: rawRates.monthly_allowance ?? 0,
                    diligence_allowance: rawRates.diligence_allowance ?? 0,
                    social_security_enrolled: rawRates.social_security_enrolled ?? (initialData.employment_status === 'Fulltime'),
                    withholding_tax_pct: rawRates.withholding_tax_pct ?? 0,
                    ...rawRates
                }
            });
        } else {
            // Reset for new staff
            setFormData({
                name: "", 
                name_en: "", 
                nickname: "",
                phone: "", 
                email: "", 
                line_user_id: "", 
                line_bot_id: "",
                address: "", 
                id_card: "",
                employment_status: "Fulltime", 
                position: "Bar & Floor", 
                job_level: "Staff",
                start_date: new Date().toISOString().split('T')[0], 
                probation_date: "",
                base_salary: "", 
                bank_account: "", 
                bank_name: "KBANK",
                social_security_id: "", 
                tax_id: "",
                shift_rates: { 
                    wage_type: "daily",
                    morning: 350, 
                    mid: 380,
                    evening: 400, 
                    night: 500,
                    double: 800,
                    rush_4h: 220,
                    hourly_rate: 50,
                    ot_rate: 75,
                    monthly_allowance: 0,
                    diligence_allowance: 1000,
                    social_security_enrolled: true,
                    withholding_tax_pct: 0
                },
                emergency_contact: "", 
                skills: [], 
                education_history: [],
                is_active: true
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        if (name.startsWith('rate_')) {
            const rateKey = name.replace('rate_', '');
            const parsedVal = type === 'checkbox' ? checked : (type === 'number' ? (value === '' ? '' : Number(value)) : value);
            setFormData(prev => ({
                ...prev,
                shift_rates: {
                    ...prev.shift_rates,
                    [rateKey]: parsedVal,
                    ...(rateKey === 'morning' ? { daily_rate: parsedVal } : {})
                }
            }));
        } else if (name === 'wage_type') {
            setFormData(prev => ({
                ...prev,
                shift_rates: {
                    ...prev.shift_rates,
                    wage_type: value
                }
            }));
        } else {
            setFormData(prev => ({ 
                ...prev, 
                [name]: type === 'checkbox' ? checked : value 
            }));
        }
    };

    const handleWageTypeSelect = (type) => {
        setFormData(prev => ({
            ...prev,
            shift_rates: {
                ...prev.shift_rates,
                wage_type: type
            }
        }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const tabs = [
        { id: "core", label: "ข้อมูลส่วนตัว & LINE", icon: User },
        { id: "employment", label: "ตำแหน่ง & การจ้างงาน", icon: Briefcase },
        { id: "compensation", label: "โครงสร้างค่าจ้าง & Payroll", icon: DollarSign },
        { id: "compliance", label: "บัญชี & ผู้ติดต่อฉุกเฉิน", icon: Shield },
    ];

    const currentWageType = formData.shift_rates?.wage_type || 'daily';

    return (
        <div className="fixed inset-0 bg-rams-ink/40 backdrop-blur-xs flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto selection:bg-rams-ink/10">
            <div className="bg-rams-panel border border-rams-rule rounded-sm w-full max-w-4xl max-h-[92vh] overflow-hidden shadow-2xl flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
                {/* Header */}
                <div className="px-6 py-4.5 border-b border-rams-rule-light flex justify-between items-center bg-rams-bg/60 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-sm bg-rams-ink text-rams-panel flex items-center justify-center font-mono font-bold text-sm">
                            {formData.nickname ? formData.nickname.charAt(0).toUpperCase() : (isEditing ? 'E' : '+')}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-mono font-bold text-rams-ink uppercase tracking-wider">
                                    {isEditing ? (formData.name || 'แก้ไขข้อมูลพนักงาน') : 'เพิ่มพนักงานใหม่ (Add Staff)'}
                                </h2>
                                {formData.nickname && (
                                    <span className="px-2 py-0.5 rounded-sm bg-rams-orange/15 text-rams-orange border border-rams-orange/30 font-mono text-[10px] font-bold">
                                        {formData.nickname}
                                    </span>
                                )}
                            </div>
                            <p className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-widest mt-0.5">
                                กำหนดโปรไฟล์และโครงสร้างการคำนวณเงินเดือนสำหรับระบบ Payroll
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={onClose} 
                        className="w-8 h-8 flex items-center justify-center border border-rams-rule-light hover:border-rams-rule hover:bg-rams-bg text-rams-ink rounded-sm font-mono text-sm transition-all cursor-pointer"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex px-6 border-b border-rams-rule-light overflow-x-auto bg-rams-bg/30 shrink-0 custom-scrollbar">
                    {tabs.map(tab => {
                        const Icon = tab.icon;
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 px-4 py-3 text-xs font-mono font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap -mb-[1px] cursor-pointer ${
                                    isActive 
                                        ? 'border-rams-ink text-rams-ink bg-rams-panel shadow-[0_-2px_0_0_inset_var(--color-rams-ink)]' 
                                        : 'border-transparent text-rams-ink-muted hover:text-rams-ink hover:bg-rams-bg/50'
                                }`}
                            >
                                <Icon size={14} className={isActive ? 'text-rams-orange' : 'text-rams-ink-muted'} />
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-rams-panel custom-scrollbar">
                    <form id="staffForm" onSubmit={handleSubmit} className="space-y-6">
                        
                        {/* --- TAB 1: CORE PERSONAL & LINE --- */}
                        {activeTab === 'core' && (
                            <div className="space-y-6">
                                {/* Active Toggle Banner */}
                                <div className="bg-rams-bg p-4 border border-rams-rule-light rounded-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 rounded-full ${formData.is_active ? 'bg-rams-green' : 'bg-rams-ink-muted/50'} ring-4 ring-rams-bg`}></div>
                                        <div>
                                            <span className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider block">
                                                สถานะบัญชีพนักงาน (Account Status)
                                            </span>
                                            <span className="text-[10px] text-rams-ink-muted">
                                                {formData.is_active ? 'พนักงานยังคงปฏิบัติงานอยู่ในระบบ' : 'ปิดการใช้งาน / พ้นสภาพพนักงานแล้ว (Inactive)'}
                                            </span>
                                        </div>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            name="is_active"
                                            checked={formData.is_active} 
                                            onChange={e => setFormData({ ...formData, is_active: e.target.checked })} 
                                            className="sr-only peer" 
                                        />
                                        <div className="w-10 h-5 bg-rams-ink-muted/20 border border-rams-rule-light rounded-sm peer peer-focus:outline-none peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-rams-ink after:rounded-xs after:h-3.5 after:w-3.5 after:transition-all peer-checked:bg-rams-green/30 peer-checked:border-rams-green"></div>
                                        <span className="ml-3 text-[10px] font-mono font-bold text-rams-ink uppercase tracking-wider">
                                            {formData.is_active ? 'ACTIVE' : 'INACTIVE'}
                                        </span>
                                    </label>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormInput 
                                        label="ชื่อ - นามสกุล (ภาษาไทย) *" 
                                        name="name" 
                                        value={formData.name} 
                                        onChange={handleChange} 
                                        required 
                                        placeholder="เช่น สมชาย ใจดี" 
                                    />
                                    <FormInput 
                                        label="ชื่อ - นามสกุล (English)" 
                                        name="name_en" 
                                        value={formData.name_en || ''} 
                                        onChange={handleChange} 
                                        placeholder="e.g. Somchai Jaidee" 
                                    />
                                    <FormInput 
                                        label="ชื่อเล่น (Nickname) *" 
                                        name="nickname" 
                                        value={formData.nickname || ''} 
                                        onChange={handleChange} 
                                        placeholder="เช่น แคสเปอร์, ปุ้ย" 
                                    />
                                </div>

                                {/* LINE Integrations Card */}
                                <div className="bg-rams-bg/50 border border-rams-rule-light p-4 rounded-sm space-y-4">
                                    <div className="flex items-center gap-2">
                                        <Smartphone size={15} className="text-rams-orange" />
                                        <h4 className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider">
                                            การเชื่อมต่อระบบ LINE (LIFF Check-in & Yuzu Bot)
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <div>
                                            <FormInput 
                                                label="LINE Check-in User ID (LIFF) *" 
                                                name="line_user_id" 
                                                value={formData.line_user_id || ''} 
                                                onChange={handleChange} 
                                                required 
                                                placeholder="U1234567890abcdef..." 
                                                mono 
                                            />
                                            <p className="text-[9px] text-rams-ink-muted mt-1 font-mono">
                                                * รหัสประจำตัว LINE ที่พนักงานใช้ลงเวลาผ่าน LIFF หน้าเว็บ
                                            </p>
                                        </div>
                                        <div>
                                            <FormInput 
                                                label="LINE Bot ID (Yuzu AI Agent)" 
                                                name="line_bot_id" 
                                                value={formData.line_bot_id || ''} 
                                                onChange={handleChange} 
                                                placeholder="U9876543210fedcba..." 
                                                mono 
                                            />
                                            <p className="text-[9px] text-rams-ink-muted mt-1 font-mono">
                                                * รหัส LINE สำหรับการแจ้งเตือนงานและพูดคุยกับ AI ประจำร้าน
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormInput 
                                        label="เบอร์โทรศัพท์ (Phone)" 
                                        name="phone" 
                                        value={formData.phone || ''} 
                                        onChange={handleChange} 
                                        type="tel" 
                                        placeholder="08x-xxx-xxxx" 
                                    />
                                    <FormInput 
                                        label="อีเมล (Email)" 
                                        name="email" 
                                        value={formData.email || ''} 
                                        onChange={handleChange} 
                                        type="email" 
                                        placeholder="staff@inthehaus.com" 
                                    />
                                    <FormInput 
                                        label="เลขบัตรประชาชน (ID Card)" 
                                        name="id_card" 
                                        value={formData.id_card || ''} 
                                        onChange={handleChange} 
                                        placeholder="1-xxxx-xxxxx-xx-x" 
                                        mono 
                                    />
                                </div>

                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1.5 uppercase tracking-wider">
                                        ที่อยู่ตามทะเบียนบ้าน / ที่พักปัจจุบัน (Address)
                                    </label>
                                    <textarea 
                                        name="address" 
                                        value={formData.address || ''} 
                                        onChange={handleChange} 
                                        className="w-full p-2.5 rounded-sm border border-rams-rule-light focus:border-rams-rule outline-none bg-rams-bg text-rams-ink font-sans text-xs min-h-[70px] transition-all" 
                                        placeholder="ระบุที่อยู่..." 
                                    />
                                </div>
                            </div>
                        )}

                        {/* --- TAB 2: EMPLOYMENT & POSITION --- */}
                        {activeTab === 'employment' && (
                            <div className="space-y-6">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormSelect 
                                        label="สถานะการจ้างงาน (Employment Status) *" 
                                        name="employment_status" 
                                        value={formData.employment_status || 'Fulltime'} 
                                        onChange={handleChange} 
                                        options={[
                                            { value: 'Fulltime', label: 'Full-time (พนักงานประจำ)' },
                                            { value: 'Probation', label: 'Probation (ช่วงทดลองงาน)' },
                                            { value: 'Contract', label: 'Contract (พนักงานสัญญาจ้าง/พาร์ทไทม์)' },
                                            { value: 'Suspended', label: 'Suspended (พักงานชั่วคราว)' },
                                            { value: 'Vacation', label: 'Vacation (ลาพักร้อนยาว)' },
                                            { value: 'Resigned', label: 'Resigned (ลาออกแล้ว)' }
                                        ]} 
                                    />
                                    <FormInput 
                                        label="ตำแหน่ง / หน้าที่ (Position / Role) *" 
                                        name="position" 
                                        value={formData.position || ''} 
                                        onChange={handleChange} 
                                        required 
                                        placeholder="เช่น Bar & Floor, Cooking, Kitchen, Manager" 
                                    />
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormInput 
                                        label="ระดับตำแหน่ง (Job Level)" 
                                        name="job_level" 
                                        value={formData.job_level || ''} 
                                        onChange={handleChange} 
                                        placeholder="เช่น Junior, Senior, Supervisor, Head" 
                                    />
                                    <FormInput 
                                        label="วันที่เริ่มงาน (Start Date)" 
                                        name="start_date" 
                                        type="date" 
                                        value={formData.start_date || ''} 
                                        onChange={handleChange} 
                                    />
                                    <FormInput 
                                        label="วันสิ้นสุดทดลองงาน (Probation End)" 
                                        name="probation_date" 
                                        type="date" 
                                        value={formData.probation_date || ''} 
                                        onChange={handleChange} 
                                    />
                                </div>

                                <div className="bg-rams-bg/60 p-4 rounded-sm border border-rams-rule-light space-y-2">
                                    <h4 className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider flex items-center gap-2">
                                        <AlertCircle size={14} className="text-rams-orange" />
                                        ข้อแนะนำสำหรับการจัดสรรตารางงาน (Roster Scheduling)
                                    </h4>
                                    <p className="text-[11px] text-rams-ink-muted leading-relaxed">
                                        ระบบจะใช้ข้อมูลตำแหน่งงานและประเภทการจ้างงานนี้เพื่อตรวจสอบความพร้อมในกะงาน (Team Schedule), การแจ้งเตือนตารางงานผ่าน LINE, และการจับคู่เข้ากะใน Roster Template
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* --- TAB 3: COMPENSATION & PAYROLL CONFIG --- */}
                        {activeTab === 'compensation' && (
                            <div className="space-y-6">
                                
                                {/* Step 1: Select Wage Type */}
                                <div>
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-2 uppercase tracking-wider">
                                        1. รูปแบบโครงสร้างค่าจ้างหลัก (Wage Model) *
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {[
                                            { 
                                                id: 'daily', 
                                                title: 'รายกะ / รายวัน (Daily Shift)', 
                                                desc: 'คิดค่าจ้างตามกะที่ทำงานจริง (กะเช้า / กะค่ำ / กะควบ)' 
                                            },
                                            { 
                                                id: 'monthly', 
                                                title: 'รายเดือนประจำ (Monthly Salary)', 
                                                desc: 'เงินเดือนคงที่ประจำเดือน + ค่า OT และเบี้ยเลี้ยง' 
                                            },
                                            { 
                                                id: 'hourly', 
                                                title: 'รายชั่วโมง (Hourly Rate)', 
                                                desc: 'คำนวณตามจำนวนชั่วโมงที่ลงเวลาจริง' 
                                            }
                                        ].map(model => {
                                            const isSelected = currentWageType === model.id;
                                            return (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => handleWageTypeSelect(model.id)}
                                                    className={`p-3.5 rounded-sm text-left border transition-all cursor-pointer flex flex-col justify-between ${
                                                        isSelected 
                                                            ? 'border-rams-ink bg-rams-ink text-rams-panel shadow-[0_2px_0_0_var(--color-rams-rule)]' 
                                                            : 'border-rams-rule-light bg-rams-bg/50 hover:bg-rams-bg text-rams-ink'
                                                    }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-mono font-bold text-xs uppercase tracking-wider">
                                                            {model.title}
                                                        </span>
                                                        {isSelected && <Check size={14} className="text-rams-orange" />}
                                                    </div>
                                                    <p className={`text-[10px] mt-1 leading-snug ${isSelected ? 'text-rams-panel/80' : 'text-rams-ink-muted'}`}>
                                                        {model.desc}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Step 2: Rate Configurations based on Wage Type */}
                                <div className="bg-rams-bg/70 p-5 rounded-sm border border-rams-rule-light space-y-4">
                                    <h4 className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider flex items-center justify-between">
                                        <span>2. กำหนดอัตราค่าแรง (Pay Rates Configuration)</span>
                                        <span className="text-[10px] text-rams-orange font-mono font-bold">
                                            MODE: {currentWageType.toUpperCase()}
                                        </span>
                                    </h4>

                                    {/* Monthly Salary Input */}
                                    {currentWageType === 'monthly' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-100">
                                            <FormInput 
                                                label="ฐานเงินเดือนประจำ (Base Monthly Salary - THB) *" 
                                                name="base_salary" 
                                                type="number" 
                                                value={formData.base_salary || ''} 
                                                onChange={handleChange} 
                                                placeholder="เช่น 25000" 
                                                mono 
                                                required 
                                            />
                                            <FormInput 
                                                label="อัตราค่าล่วงเวลา OT (บาท / ชม.)" 
                                                name="rate_ot_rate" 
                                                type="number" 
                                                value={formData.shift_rates?.ot_rate ?? 75} 
                                                onChange={handleChange} 
                                                placeholder="75" 
                                                mono 
                                            />
                                        </div>
                                    )}

                                    {/* Daily Shift Rates */}
                                    {currentWageType === 'daily' && (
                                        <div className="space-y-4 animate-in fade-in duration-100">
                                            <div className="p-3 bg-rams-bg border border-rams-rule-light rounded-sm">
                                                <p className="text-[11px] text-rams-ink font-bold font-mono">
                                                    📅 ระบบจะคำนวณค่าแรงอัตโนมัติตามช่วงเวลาที่จัดไว้ในตาราง Roster:
                                                </p>
                                                <ul className="text-[10px] text-rams-ink-muted mt-1 space-y-0.5 font-mono list-disc list-inside">
                                                    <li>กะงานปกติใน Roster (6-10 ชม.) ➜ คำนวณตามค่าแรงกะปกติ</li>
                                                    <li>กะควบใน Roster (11+ ชม. เช่น 10:00-00:30) ➜ คำนวณตามค่าแรงกะควบ</li>
                                                    <li>กะสั้น/พาร์ทไทม์ใน Roster (≤5 ชม. เช่น 18:00-22:30) ➜ คำนวณตาม ชม. จริง</li>
                                                    <li>ทำงานเกินเวลาเลิกงานใน Roster ➜ คิดเป็นค่า OT รายชั่วโมงอัตโนมัติ</li>
                                                </ul>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                                                <FormInput 
                                                    label="ค่าแรง กะปกติ (Standard Shift) ฿/กะ *" 
                                                    name="rate_morning" 
                                                    type="number" 
                                                    value={formData.shift_rates?.morning ?? 350} 
                                                    onChange={handleChange} 
                                                    placeholder="350" 
                                                    mono 
                                                />
                                                <FormInput 
                                                    label="ค่าแรง กะค่ำ/ปิดร้าน (Evening Shift) ฿/กะ" 
                                                    name="rate_evening" 
                                                    type="number" 
                                                    value={formData.shift_rates?.evening ?? 400} 
                                                    onChange={handleChange} 
                                                    placeholder="400" 
                                                    mono 
                                                />
                                                <FormInput 
                                                    label="ค่าแรง กะควบ (Double Shift 11+ ชม.) ฿/วัน" 
                                                    name="rate_double" 
                                                    type="number" 
                                                    value={formData.shift_rates?.double ?? 800} 
                                                    onChange={handleChange} 
                                                    placeholder="800" 
                                                    mono 
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-rams-rule-light">
                                                <FormInput 
                                                    label="อัตรา OT ล่วงเวลาเกินตาราง Roster (บาท / ชม.)" 
                                                    name="rate_ot_rate" 
                                                    type="number" 
                                                    value={formData.shift_rates?.ot_rate ?? 75} 
                                                    onChange={handleChange} 
                                                    placeholder="75" 
                                                    mono 
                                                />
                                                <FormInput 
                                                    label="อัตราค่าจ้างรายชั่วโมง (กรณีจัดกะสั้นเศษ ชม. ใน Roster)" 
                                                    name="rate_hourly_rate" 
                                                    type="number" 
                                                    value={formData.shift_rates?.hourly_rate ?? 50} 
                                                    onChange={handleChange} 
                                                    placeholder="50" 
                                                    mono 
                                                />
                                            </div>
                                        </div>
                                    )}

                                    {/* Hourly Rate */}
                                    {currentWageType === 'hourly' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in duration-100">
                                            <FormInput 
                                                label="ค่าจ้างปกติ (บาท / ชั่วโมง) *" 
                                                name="rate_hourly_rate" 
                                                type="number" 
                                                value={formData.shift_rates?.hourly_rate ?? ''} 
                                                onChange={handleChange} 
                                                placeholder="60" 
                                                mono 
                                                required 
                                            />
                                            <FormInput 
                                                label="อัตรา OT (บาท / ชั่วโมง)" 
                                                name="rate_ot_rate" 
                                                type="number" 
                                                value={formData.shift_rates?.ot_rate ?? ''} 
                                                onChange={handleChange} 
                                                placeholder="90" 
                                                mono 
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Step 3: Allowances & Statutory Deductions */}
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {/* Allowances Box */}
                                    <div className="p-4 bg-rams-bg border border-rams-rule-light rounded-sm space-y-3">
                                        <h4 className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider flex items-center gap-1.5">
                                            <Sparkles size={14} className="text-rams-green" />
                                            เงินเพิ่ม & สวัสดิการ (Allowances)
                                        </h4>
                                        <FormInput 
                                            label="ค่าตำแหน่ง / เบี้ยเลี้ยงคงที่รายเดือน (THB)" 
                                            name="rate_monthly_allowance" 
                                            type="number" 
                                            value={formData.shift_rates?.monthly_allowance ?? 0} 
                                            onChange={handleChange} 
                                            placeholder="0" 
                                            mono 
                                        />
                                        <FormInput 
                                            label="เบี้ยขยันประจำเดือน (THB - จ่ายเมื่อไม่ขาด/สาย)" 
                                            name="rate_diligence_allowance" 
                                            type="number" 
                                            value={formData.shift_rates?.diligence_allowance ?? 0} 
                                            onChange={handleChange} 
                                            placeholder="1000" 
                                            mono 
                                        />
                                    </div>

                                    {/* Statutory Deductions Box */}
                                    <div className="p-4 bg-rams-bg border border-rams-rule-light rounded-sm space-y-3">
                                        <h4 className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider flex items-center gap-1.5">
                                            <Shield size={14} className="text-rams-red" />
                                            รายการหักตามกฎหมาย (Statutory Deductions)
                                        </h4>
                                        
                                        <div className="pt-1 pb-2">
                                            <label className="flex items-center justify-between cursor-pointer">
                                                <div>
                                                    <span className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider block">
                                                        หักประกันสังคม (Social Security 5%)
                                                    </span>
                                                    <span className="text-[10px] text-rams-ink-muted">
                                                        หัก 5% ของค่าจ้าง (สูงสุดไม่เกิน 750 บาท/เดือน)
                                                    </span>
                                                </div>
                                                <input 
                                                    type="checkbox" 
                                                    name="rate_social_security_enrolled" 
                                                    checked={!!formData.shift_rates?.social_security_enrolled} 
                                                    onChange={handleChange} 
                                                    className="w-4 h-4 rounded-xs border-rams-rule-light accent-rams-ink cursor-pointer" 
                                                />
                                            </label>
                                        </div>

                                        <FormInput 
                                            label="ภาษีหัก ณ ที่จ่าย % (Withholding Tax %)" 
                                            name="rate_withholding_tax_pct" 
                                            type="number" 
                                            value={formData.shift_rates?.withholding_tax_pct ?? 0} 
                                            onChange={handleChange} 
                                            placeholder="0 หรือ 3" 
                                            mono 
                                        />
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* --- TAB 4: COMPLIANCE & BANK DETAILS --- */}
                        {activeTab === 'compliance' && (
                            <div className="space-y-6">
                                <div className="p-4 bg-rams-bg border border-rams-rule-light rounded-sm space-y-4">
                                    <div className="flex items-center gap-2">
                                        <CreditCard size={16} className="text-rams-orange" />
                                        <h4 className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider">
                                            ข้อมูลบัญชีสำหรับการโอนเงินเดือน (Payout Bank Details)
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormSelect 
                                            label="ธนาคาร (Bank Name)" 
                                            name="bank_name" 
                                            value={formData.bank_name || 'KBANK'} 
                                            onChange={handleChange} 
                                            options={[
                                                { value: 'KBANK', label: 'ธนาคารกสิกรไทย (KBANK)' },
                                                { value: 'SCB', label: 'ธนาคารไทยพาณิชย์ (SCB)' },
                                                { value: 'BBL', label: 'ธนาคารกรุงเทพ (BBL)' },
                                                { value: 'KTB', label: 'ธนาคารกรุงไทย (KTB)' },
                                                { value: 'TTB', label: 'ธนาคารทหารไทยธนชาต (TTB)' },
                                                { value: 'BAY', label: 'ธนาคารกรุงศรีอยุธยา (BAY)' },
                                                { value: 'GSB', label: 'ธนาคารออมสิน (GSB)' },
                                                { value: 'PROMPTPAY', label: 'พร้อมเพย์ (PromptPay)' }
                                            ]} 
                                        />
                                        <FormInput 
                                            label="เลขที่บัญชีธนาคาร (Bank Account Number)" 
                                            name="bank_account" 
                                            value={formData.bank_account || ''} 
                                            onChange={handleChange} 
                                            placeholder="xxx-x-xxxxx-x" 
                                            mono 
                                        />
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <FormInput 
                                        label="เลขประจำตัวผู้เสียภาษี (Tax ID)" 
                                        name="tax_id" 
                                        value={formData.tax_id || ''} 
                                        onChange={handleChange} 
                                        placeholder="เลขประจำตัวผู้เสียภาษี" 
                                        mono 
                                    />
                                    <FormInput 
                                        label="ผู้ติดต่อฉุกเฉิน & เบอร์โทร (Emergency Contact)" 
                                        name="emergency_contact" 
                                        value={formData.emergency_contact || ''} 
                                        onChange={handleChange} 
                                        placeholder="ชื่อและเบอร์โทรญาติสนิท" 
                                    />
                                </div>
                            </div>
                        )}

                    </form>
                </div>

                {/* Footer Buttons */}
                <div className="p-4.5 px-6 border-t border-rams-rule-light flex justify-between items-center bg-rams-bg shrink-0">
                    <div className="text-[10px] font-mono text-rams-ink-muted">
                        * โปรดตรวจสอบความถูกต้องของ LINE ID และอัตราค่าแรงก่อนบันทึก
                    </div>
                    <div className="flex gap-2">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="px-4 py-2 rounded-sm font-mono font-bold text-xs uppercase tracking-wider text-rams-ink-muted hover:bg-rams-ink-muted/10 border border-transparent transition-all cursor-pointer"
                        >
                            ยกเลิก (Cancel)
                        </button>
                        <button 
                            type="submit" 
                            form="staffForm" 
                            className="px-6 py-2 rounded-sm font-mono font-bold text-xs uppercase tracking-wider text-rams-panel bg-rams-orange border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[2px] active:shadow-none transition-all cursor-pointer flex items-center gap-2"
                        >
                            <Check size={14} />
                            <span>{isEditing ? 'บันทึกการแก้ไข' : 'สร้างโปรไฟล์พนักงาน'}</span>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Helper Form Elements
const FormInput = ({ label, mono, ...props }) => (
    <div>
        <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1.5 uppercase tracking-wider">{label}</label>
        <input {...props} className={`w-full p-2.5 rounded-sm border border-rams-rule-light focus:border-rams-rule outline-none bg-rams-bg text-rams-ink font-sans text-xs transition-all ${mono ? 'font-mono' : ''}`} />
    </div>
);

const FormSelect = ({ label, options, ...props }) => (
    <div>
        <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1.5 uppercase tracking-wider">{label}</label>
        <select {...props} className="w-full p-2.5 rounded-sm border border-rams-rule-light focus:border-rams-rule outline-none bg-rams-bg text-rams-ink font-sans text-xs transition-all cursor-pointer">
            {options.map(o => (
                typeof o === 'string' 
                    ? <option key={o} value={o}>{o}</option>
                    : <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    </div>
);
