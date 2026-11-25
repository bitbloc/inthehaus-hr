"use client";
import { initialOf } from "../../utils/initial";
import React, { useState, useEffect } from "react";

export default function StaffModal({ isOpen, onClose, onSave, initialData, isEditing }) {
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
                    ...(rateKey === 'daily_rate' || rateKey === 'morning' ? { daily_rate: parsedVal, morning: parsedVal, evening: parsedVal } : {})
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
        { id: "core", label: "ข้อมูลส่วนตัว และ LINE" },
        { id: "employment", label: "ตำแหน่ง" },
        { id: "compensation", label: "ค่าจ้าง" },
        { id: "compliance", label: "บัญชี และผู้ติดต่อฉุกเฉิน" },
    ];

    const currentWageType = formData.shift_rates?.wage_type || 'daily';

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-charcoal/50 flex items-center justify-center z-50 p-3 sm:p-4 overflow-y-auto">
            <div className="bg-cream border border-charcoal w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col my-auto">
                {/* Header */}
                <div className="px-6 py-4.5 border-b border-rule flex justify-between items-center bg-paper-2 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-charcoal text-cream flex items-center justify-center font-num font-semibold text-sm">
                            {formData.nickname || formData.name ? initialOf(formData.nickname, formData.name) : (isEditing ? 'E' : '+')}
                        </div>
                        <div>
                            <div className="flex items-center gap-2">
                                <h2 className="text-base font-semibold text-charcoal">
                                    {isEditing ? (formData.name || 'แก้ไขข้อมูลพนักงาน') : 'เพิ่มพนักงานใหม่'}
                                </h2>
                                {formData.nickname && (
                                    <span className="px-2 py-0.5 bg-plum/15 text-plum border border-plum/30 font-num text-xs font-semibold">
                                        {formData.nickname}
                                    </span>
                                )}
                            </div>
                            <p className="text-xs text-neutral mt-0.5">
                                กำหนดโปรไฟล์และโครงสร้างการคำนวณเงินเดือนสำหรับระบบ Payroll
                            </p>
                        </div>
                    </div>
                    <button 
                        type="button"
                        onClick={onClose} 
                        className="flex items-center justify-center border border-rule hover:border-charcoal hover:bg-cream text-charcoal text-sm transition-colors duration-150 cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                    >ปิด</button>
                </div>

                {/* Navigation Tabs */}
                <div className="flex px-6 border-b border-rule overflow-x-auto bg-paper-2 shrink-0 custom-scrollbar">
                    {tabs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                type="button"
                                onClick={() => setActiveTab(tab.id)}
                                className={`flex items-center gap-2 min-h-12 px-4 text-sm font-semibold transition-colors duration-150 border-b-2 whitespace-nowrap -mb-[1px] cursor-pointer ${
 isActive 
 ? 'border-charcoal text-charcoal bg-cream ' 
 : 'border-transparent text-neutral hover:text-charcoal hover:bg-paper-2'
 }`}
                            >
                                <span>{tab.label}</span>
                            </button>
                        );
                    })}
                </div>

                {/* Form Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-cream custom-scrollbar">
                    <form id="staffForm" onSubmit={handleSubmit} className="space-y-6">
                        
                        {/* --- TAB 1: CORE PERSONAL & LINE --- */}
                        {activeTab === 'core' && (
                            <div className="space-y-6">
                                {/* Active Toggle Banner */}
                                <div className="bg-cream p-4 border border-rule flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-3 h-3 ${formData.is_active ? 'bg-charcoal' : 'bg-neutral/50'}`}></div>
                                        <div>
                                            <span className="text-xs font-semibold text-charcoal block">
                                                สถานะบัญชีพนักงาน
                                            </span>
                                            <span className="text-xs text-neutral">
                                                {formData.is_active ? 'พนักงานยังคงปฏิบัติงานอยู่ในระบบ' : 'ปิดการใช้งาน / พ้นสภาพพนักงานแล้ว'}
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
                                        <div className="w-10 h-5 bg-neutral/20 border border-rule peer peer-focus:outline-none peer-checked:after:translate-x-5 after:content-[''] after:absolute after:top-[3px] after:left-[3px] after:bg-charcoal after: after:h-3.5 after:w-3.5 after:transition-colors duration-150 peer-checked:bg-charcoal/30 peer-checked:border-charcoal"></div>
                                        <span className="ml-3 text-sm font-semibold text-charcoal whitespace-nowrap">
                                            {formData.is_active ? 'ทำงานอยู่' : 'พ้นสภาพ'}
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
                                        label="ชื่อ - นามสกุล (อังกฤษ)" 
                                        name="name_en" 
                                        value={formData.name_en || ''} 
                                        onChange={handleChange} 
                                        placeholder="e.g. Somchai Jaidee" 
                                    />
                                    <FormInput 
                                        label="ชื่อเล่น *" 
                                        name="nickname" 
                                        value={formData.nickname || ''} 
                                        onChange={handleChange} 
                                        placeholder="เช่น แคสเปอร์, ปุ้ย" 
                                    />
                                </div>

                                {/* LINE Integrations Card */}
                                <div className="bg-paper-2 border border-rule p-4 space-y-4">
                                    <div className="flex items-center gap-2">
                                                                                <h4 className="text-xs font-semibold text-charcoal">
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
                                            <p className="text-xs text-neutral mt-1">
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
                                            <p className="text-xs text-neutral mt-1">
                                                * รหัส LINE สำหรับการแจ้งเตือนงานและพูดคุยกับ AI ประจำร้าน
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormInput 
                                        label="เบอร์โทรศัพท์" 
                                        name="phone" 
                                        value={formData.phone || ''} 
                                        onChange={handleChange} 
                                        type="tel" 
                                        placeholder="08x-xxx-xxxx" 
                                    />
                                    <FormInput 
                                        label="อีเมล" 
                                        name="email" 
                                        value={formData.email || ''} 
                                        onChange={handleChange} 
                                        type="email" 
                                        placeholder="staff@inthehaus.com" 
                                    />
                                    <FormInput 
                                        label="เลขบัตรประชาชน" 
                                        name="id_card" 
                                        value={formData.id_card || ''} 
                                        onChange={handleChange} 
                                        placeholder="1-xxxx-xxxxx-xx-x" 
                                        mono 
                                    />
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold text-neutral mb-1.5">
                                        ที่อยู่ตามทะเบียนบ้าน / ที่พักปัจจุบัน
                                    </label>
                                    <textarea 
                                        name="address" 
                                        value={formData.address || ''} 
                                        onChange={handleChange} 
                                        className="w-full p-2.5 border border-rule focus:border-charcoal outline-none bg-cream text-charcoal text-xs min-h-[70px] transition-colors duration-150" 
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
                                        label="สถานะการจ้างงาน *" 
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
                                    <div>
                                        <FormInput 
                                            label="ตำแหน่ง / หน้าที่ *" 
                                            name="position" 
                                            value={formData.position || ''} 
                                            onChange={handleChange} 
                                            required 
                                            placeholder="เช่น Bar & Floor, Cooking, Kitchen, Owner, Manager" 
                                        />
                                        {((formData.position || '').toLowerCase().includes('owner') || (formData.position || '').toLowerCase().includes('ceo')) && (
                                            <div className="mt-2 p-2.5 bg-paper-2 border border-plum flex items-start gap-2">
                                                <span className="text-sm shrink-0"></span>
                                                <span className="text-plum text-xs leading-tight">
                                                    <strong>ตำแหน่ง Owner / ผู้บริหาร:</strong> ได้รับการยกเว้นการบังคับลงเวลาเข้างาน, ไม่แสดงเตือนมาสาย และไม่ถูกแจ้งเตือนขาดงานใน LINE
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    <FormInput 
                                        label="ระดับตำแหน่ง" 
                                        name="job_level" 
                                        value={formData.job_level || ''} 
                                        onChange={handleChange} 
                                        placeholder="เช่น Junior, Senior, Supervisor, Head" 
                                    />
                                    <FormInput 
                                        label="วันที่เริ่มงาน" 
                                        name="start_date" 
                                        type="date" 
                                        value={formData.start_date || ''} 
                                        onChange={handleChange} 
                                    />
                                    <FormInput 
                                        label="วันสิ้นสุดทดลองงาน" 
                                        name="probation_date" 
                                        type="date" 
                                        value={formData.probation_date || ''} 
                                        onChange={handleChange} 
                                    />
                                </div>

                                <div className="bg-paper-2 p-4 border border-rule space-y-2">
                                    <h4 className="text-xs font-semibold text-charcoal flex items-center gap-2">
                                                                                ข้อแนะนำสำหรับการจัดสรรตารางงาน
                                    </h4>
                                    <p className="text-xs text-neutral leading-relaxed">
                                        ระบบจะใช้ข้อมูลตำแหน่งงานและประเภทการจ้างงานนี้เพื่อตรวจสอบความพร้อมในกะงาน, การแจ้งเตือนตารางงานผ่าน LINE, และการจับคู่เข้ากะใน Roster Template
                                    </p>
                                </div>
                            </div>
                        )}

                        {/* --- TAB 3: COMPENSATION & PAYROLL CONFIG --- */}
                        {activeTab === 'compensation' && (
                            <div className="space-y-6">
                                
                                {/* Step 1: Select Wage Type */}
                                <div>
                                    <label className="block text-xs font-semibold text-neutral mb-2">
                                        1. รูปแบบโครงสร้างค่าจ้างหลัก *
                                    </label>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                                        {[
                                            { 
                                                id: 'daily', 
                                                title: 'รายกะ / รายวัน', 
                                                desc: 'คิดค่าจ้างตามตารางเวลาที่จัดไว้ใน Roster (กะปกติ / กะควบ / OT)' 
                                            },
                                            { 
                                                id: 'monthly', 
                                                title: 'รายเดือนประจำ', 
                                                desc: 'เงินเดือนคงที่ประจำเดือน + ค่า OT และเบี้ยเลี้ยง' 
                                            },
                                            { 
                                                id: 'hourly', 
                                                title: 'รายชั่วโมง', 
                                                desc: 'คำนวณตามจำนวนชั่วโมงที่ลงเวลาจริง' 
                                            }
                                        ].map(model => {
                                            const isSelected = currentWageType === model.id;
                                            return (
                                                <button
                                                    key={model.id}
                                                    type="button"
                                                    onClick={() => handleWageTypeSelect(model.id)}
                                                    className={`p-3.5 text-left border transition-colors duration-150 cursor-pointer flex flex-col justify-between ${
 isSelected 
 ? 'border-charcoal bg-charcoal text-cream ' 
 : 'border-rule bg-cream hover:bg-paper-2 text-charcoal'
 }`}
                                                >
                                                    <div className="flex items-center justify-between mb-1">
                                                        <span className="font-num font-semibold text-xs">
                                                            {model.title}
                                                        </span>
                                                        {isSelected && <span className="text-sm font-semibold text-plum">เลือกแล้ว</span>}
                                                    </div>
                                                    <p className={`text-xs mt-1 leading-snug ${isSelected ? 'text-cream/80' : 'text-neutral'}`}>
                                                        {model.desc}
                                                    </p>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>

                                {/* Step 2: Rate Configurations based on Wage Type */}
                                <div className="bg-paper-2 p-5 border border-rule space-y-4">
                                    <h4 className="text-xs font-num font-semibold text-charcoal flex items-center justify-between">
                                        <span>2. กำหนดอัตราค่าแรง</span>
                                        <span className="text-xs text-plum font-num font-semibold">
                                            MODE: {currentWageType.toUpperCase()}
                                        </span>
                                    </h4>

                                    {/* Monthly Salary Input */}
                                    {currentWageType === 'monthly' && (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            <FormInput 
                                                label="ฐานเงินเดือนประจำ (บาท) *" 
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

                                    {/* Daily Shift Rates (Single Unified Shift Rate) */}
                                    {currentWageType === 'daily' && (
                                        <div className="space-y-4">
                                            <div className="p-3 bg-cream border border-rule">
                                                <p className="text-xs text-charcoal font-semibold">
                                                    ระบบจะคำนวณค่าแรงอัตโนมัติตามช่วงเวลาที่จัดไว้ในตาราง Roster:
                                                </p>
                                                <ul className="text-xs text-neutral mt-1 space-y-0.5 font-num list-disc list-inside">
                                                    <li>กะงานปกติใน Roster (6-10 ชม.) คำนวณตามค่าแรงกะปกติ</li>
                                                    <li>กะควบใน Roster (11+ ชม. เช่น 10:00-00:30) คำนวณตามค่าแรงกะควบ</li>
                                                    <li>กะสั้น/พาร์ทไทม์ใน Roster (≤5 ชม. เช่น 18:00-22:30) คำนวณตาม ชม. จริง</li>
                                                    <li>ทำงานเกินเวลาเลิกงานใน Roster คิดเป็นค่า OT รายชั่วโมงอัตโนมัติ</li>
                                                </ul>
                                            </div>

                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                                <FormInput 
                                                    label="ค่าแรง กะปกติ ฿/กะ *" 
                                                    name="rate_daily_rate" 
                                                    type="number" 
                                                    value={formData.shift_rates?.daily_rate ?? formData.shift_rates?.morning ?? 350} 
                                                    onChange={handleChange} 
                                                    placeholder="350" 
                                                    mono 
                                                    required
                                                />
                                                <FormInput 
                                                    label="ค่าแรง กะควบ (Double Shift 11+ ชม.) ฿/วัน" 
                                                    name="rate_double" 
                                                    type="number" 
                                                    value={formData.shift_rates?.double ?? 700} 
                                                    onChange={handleChange} 
                                                    placeholder="700" 
                                                    mono 
                                                />
                                            </div>
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-rule">
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
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                                    <div className="p-4 bg-cream border border-rule space-y-3">
                                        <h4 className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                                                                                        เงินเพิ่ม & สวัสดิการ
                                        </h4>
                                        <FormInput 
                                            label="ค่าตำแหน่ง / เบี้ยเลี้ยงคงที่รายเดือน" 
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
                                    <div className="p-4 bg-cream border border-rule space-y-3">
                                        <h4 className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                                                                                        รายการหักตามกฎหมาย
                                        </h4>
                                        
                                        <div className="pt-1 pb-2">
                                            <label className="flex items-center justify-between cursor-pointer">
                                                <div>
                                                    <span className="text-xs font-semibold text-charcoal block">
                                                        หักประกันสังคม (Social Security 5%)
                                                    </span>
                                                    <span className="text-xs text-neutral">
                                                        หัก 5% ของค่าจ้าง (สูงสุดไม่เกิน 750 บาท/เดือน)
                                                    </span>
                                                </div>
                                                <input 
                                                    type="checkbox" 
                                                    name="rate_social_security_enrolled" 
                                                    checked={!!formData.shift_rates?.social_security_enrolled} 
                                                    onChange={handleChange} 
                                                    className="w-4 h-4 border-rule accent-charcoal cursor-pointer" 
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
                                <div className="p-4 bg-cream border border-rule space-y-4">
                                    <div className="flex items-center gap-2">
                                                                                <h4 className="text-xs font-semibold text-charcoal">
                                            ข้อมูลบัญชีสำหรับการโอนเงินเดือน
                                        </h4>
                                    </div>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        <FormSelect 
                                            label="ธนาคาร" 
                                            name="bank_name" 
                                            value={formData.bank_name || 'KBANK'} 
                                            onChange={handleChange} 
                                            options={[
                                                { value: 'KBANK', label: 'ธนาคารกสิกรไทย' },
                                                { value: 'SCB', label: 'ธนาคารไทยพาณิชย์' },
                                                { value: 'BBL', label: 'ธนาคารกรุงเทพ' },
                                                { value: 'KTB', label: 'ธนาคารกรุงไทย' },
                                                { value: 'TTB', label: 'ธนาคารทหารไทยธนชาต' },
                                                { value: 'BAY', label: 'ธนาคารกรุงศรีอยุธยา' },
                                                { value: 'GSB', label: 'ธนาคารออมสิน' },
                                                { value: 'PROMPTPAY', label: 'พร้อมเพย์' }
                                            ]} 
                                        />
                                        <FormInput 
                                            label="เลขที่บัญชีธนาคาร" 
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
                                        label="เลขประจำตัวผู้เสียภาษี" 
                                        name="tax_id" 
                                        value={formData.tax_id || ''} 
                                        onChange={handleChange} 
                                        placeholder="เลขประจำตัวผู้เสียภาษี" 
                                        mono 
                                    />
                                    <FormInput 
                                        label="ผู้ติดต่อฉุกเฉิน & เบอร์โทร" 
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
                <div className="p-4.5 px-6 border-t border-rule flex justify-between items-center bg-cream shrink-0">
                    <div className="hidden sm:block text-sm text-neutral">
                        * โปรดตรวจสอบความถูกต้องของ LINE ID และอัตราค่าแรงก่อนบันทึก
                    </div>
                    <div className="flex gap-2 ml-auto">
                        <button 
                            type="button" 
                            onClick={onClose} 
                            className="min-h-12 px-4 font-semibold text-base text-charcoal hover:bg-paper-2 border border-transparent transition-colors duration-150 cursor-pointer"
                        >
                            ยกเลิก
                        </button>
                        <button 
                            type="submit" 
                            form="staffForm" 
                            className="min-h-12 px-6 font-semibold text-base whitespace-nowrap text-cream bg-charcoal border border-charcoal hover:bg-charcoal-2 transition-colors duration-150 cursor-pointer flex items-center gap-2"
                        >
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
        <label className="block text-xs font-num font-semibold text-neutral mb-1.5">{label}</label>
        <input {...props} className={`w-full p-2.5 border border-rule focus:border-charcoal outline-none bg-cream text-charcoal  text-xs transition-colors duration-150 ${mono ? 'font-num' : ''}`} />
    </div>
);

const FormSelect = ({ label, options, ...props }) => (
    <div>
        <label className="block text-xs font-num font-semibold text-neutral mb-1.5">{label}</label>
        <select {...props} className="w-full p-2.5 border border-rule focus:border-charcoal outline-none bg-cream text-charcoal text-xs transition-colors duration-150 cursor-pointer">
            {options.map(o => (
                typeof o === 'string' 
                    ? <option key={o} value={o}>{o}</option>
                    : <option key={o.value} value={o.value}>{o.label}</option>
            ))}
        </select>
    </div>
);
