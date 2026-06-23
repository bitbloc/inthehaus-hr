"use client";
import { useState, useEffect } from "react";

export default function StaffModal({ isOpen, onClose, onSave, initialData, isEditing }) {
    if (!isOpen) return null;

    const [activeTab, setActiveTab] = useState("core");
    const [formData, setFormData] = useState({
        name: "", name_en: "", nickname: "",
        phone: "", email: "", line_user_id: "", line_bot_id: "",
        address: "", id_card: "",
        employment_status: "Probation", position: "", job_level: "",
        start_date: "", probation_date: "",
        base_salary: "", bank_account: "", bank_name: "",
        social_security_id: "", tax_id: "",
        shift_rates: { morning: 0, evening: 0, double: 0 },
        emergency_contact: "", skills: [], education_history: [],
        is_active: true
    });

    useEffect(() => {
        if (initialData) {
            setFormData({ ...formData, ...initialData });
        } else {
            // Reset if adding new
            setFormData({
                name: "", name_en: "", nickname: "",
                phone: "", email: "", line_user_id: "", line_bot_id: "",
                address: "", id_card: "",
                employment_status: "Probation", position: "", job_level: "",
                start_date: "", probation_date: "",
                base_salary: "", bank_account: "", bank_name: "",
                social_security_id: "", tax_id: "",
                shift_rates: { morning: 0, evening: 0, double: 0 },
                emergency_contact: "", skills: [], education_history: [],
                is_active: true
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        if (name.startsWith('rate_')) {
            const rateType = name.replace('rate_', '');
            setFormData(prev => ({
                ...prev,
                shift_rates: {
                    ...prev.shift_rates,
                    [rateType]: Number(value)
                }
            }));
        } else {
            setFormData(prev => ({ ...prev, [name]: value }));
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(formData);
    };

    const tabs = [
        { id: "core", label: "👤 Personal" },
        { id: "employment", label: "briefcase Employment" },
        { id: "compensation", label: "💰 Pay & Benefits" },
        { id: "talent", label: "🎓 Talent" },
        { id: "compliance", label: "🛡️ Compliance" },
    ];

    return (
        <div className="fixed inset-0 bg-rams-ink/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
            <div className="bg-rams-panel border border-rams-rule rounded-sm w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-none flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-rams-rule-light flex justify-between items-center bg-rams-bg/50">
                    <div>
                        <h2 className="text-lg font-mono font-bold text-rams-ink uppercase tracking-wider">{isEditing ? 'Edit Staff Profile' : 'Add New Staff'}</h2>
                        <p className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-widest mt-1">Manage detailed employee information</p>
                    </div>
                    <button onClick={onClose} className="w-8 h-8 flex items-center justify-center border border-rams-rule-light hover:border-rams-rule hover:bg-rams-bg text-rams-ink font-mono text-sm transition-all cursor-pointer">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex px-6 border-b border-rams-rule-light overflow-x-auto bg-rams-bg/25">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3.5 text-xs font-mono font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap -mb-[1px] cursor-pointer ${activeTab === tab.id ? 'border-rams-rule text-rams-ink bg-rams-panel' : 'border-transparent text-rams-ink-muted hover:text-rams-ink'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-rams-panel">
                    <form id="staffForm" onSubmit={handleSubmit} className="space-y-6">
                        {activeTab === 'core' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2 bg-rams-bg p-4 border border-rams-rule-light rounded-sm flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-2.5 h-2.5 rounded-sm ${formData.is_active ? 'bg-rams-green' : 'bg-rams-ink-muted/50'} border border-rams-rule`}></div>
                                        <span className="text-xs font-mono font-bold text-rams-ink uppercase tracking-wider">Account Status</span>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({ ...formData, is_active: e.target.checked })} className="sr-only peer" />
                                        <div className="w-9 h-5 bg-rams-ink-muted/20 border border-rams-rule-light rounded-sm peer peer-focus:outline-none peer-checked:after:translate-x-4 after:content-[''] after:absolute after:top-[4px] after:left-[4px] after:bg-rams-ink after:rounded-sm after:h-3 after:w-3 after:transition-all peer-checked:bg-rams-green/20 peer-checked:border-rams-rule"></div>
                                        <span className="ml-3 text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider">{formData.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
                                    </label>
                                </div>
                                <FormInput label="Full Name (TH)" name="name" value={formData.name} onChange={handleChange} required placeholder="นาย สมชาย ใจดี" />
                                <FormInput label="Full Name (EN)" name="name_en" value={formData.name_en} onChange={handleChange} placeholder="Mr. Somchai Jaidee" />
                                <FormInput label="Nickname" name="nickname" value={formData.nickname} onChange={handleChange} />
                                <FormInput label="LINE Check-in ID (LIFF)" name="line_user_id" value={formData.line_user_id || ''} onChange={handleChange} placeholder="U1234..." mono />
                                <FormInput label="LINE Bot ID (Yuzu)" name="line_bot_id" value={formData.line_bot_id || ''} onChange={handleChange} placeholder="U5678..." mono />

                                <FormInput label="Phone Number" name="phone" value={formData.phone} onChange={handleChange} type="tel" />
                                <FormInput label="Email" name="email" value={formData.email} onChange={handleChange} type="email" />
                                <FormInput label="ID Card Number" name="id_card" value={formData.id_card} onChange={handleChange} placeholder="1-xxxx-xxxxx-xx-x" mono />
                                <div className="md:col-span-2">
                                    <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1.5 uppercase tracking-wider">Address</label>
                                    <textarea name="address" value={formData.address} onChange={handleChange} className="w-full p-2.5 rounded-sm border border-rams-rule-light focus:border-rams-rule outline-none bg-rams-bg text-rams-ink font-sans text-xs min-h-[80px] transition-all" placeholder="Current address..." />
                                </div>
                            </div>
                        )}

                        {activeTab === 'employment' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormSelect label="Employment Status" name="employment_status" value={formData.employment_status} onChange={handleChange} options={['Probation', 'Fulltime', 'Contract', 'Resigned']} />
                                <FormInput label="Job Title / Position" name="position" value={formData.position} onChange={handleChange} required />
                                <FormInput label="Job Level" name="job_level" value={formData.job_level} onChange={handleChange} placeholder="Junior, Senior, Manager..." />
                                <FormInput label="Start Date" name="start_date" type="date" value={formData.start_date} onChange={handleChange} />
                                <FormInput label="Probation End Date" name="probation_date" type="date" value={formData.probation_date} onChange={handleChange} />
                            </div>
                        )}

                        {activeTab === 'compensation' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <div className="md:col-span-2 bg-rams-bg p-4 rounded-sm border border-rams-rule-light mb-2">
                                    <h3 className="text-xs font-mono font-bold text-rams-ink mb-3 uppercase tracking-wider">⚙️ Shift Daily Rates (Pay per Day)</h3>
                                    <div className="grid grid-cols-3 gap-4">
                                        <FormInput label="Morning (THB)" name="rate_morning" type="number" value={formData.shift_rates?.morning || ''} onChange={handleChange} placeholder="0" />
                                        <FormInput label="Evening (THB)" name="rate_evening" type="number" value={formData.shift_rates?.evening || ''} onChange={handleChange} placeholder="0" />
                                        <FormInput label="Double (THB)" name="rate_double" type="number" value={formData.shift_rates?.double || ''} onChange={handleChange} placeholder="0" />
                                    </div>
                                </div>

                                <FormInput label="Base Salary (THB) - Optional" name="base_salary" type="number" value={formData.base_salary} onChange={handleChange} />
                                <FormInput label="Bank Name" name="bank_name" value={formData.bank_name} onChange={handleChange} placeholder="KBank, SCB..." />
                                <FormInput label="Account Number" name="bank_account" value={formData.bank_account} onChange={handleChange} mono />
                                <FormInput label="Social Security ID" name="social_security_id" value={formData.social_security_id} onChange={handleChange} mono />
                                <FormInput label="Tax ID" name="tax_id" value={formData.tax_id} onChange={handleChange} mono />
                            </div>
                        )}

                        {activeTab === 'talent' && (
                            <div className="space-y-4">
                                <div className="bg-rams-bg p-4 rounded-sm border border-rams-rule-light text-rams-ink text-xs font-mono uppercase tracking-wide leading-relaxed">
                                    ⚠️ Talent Management (Skills & Education) implementation coming soon.
                                    <br />For now, please upload relevant documents to the system manually if needed.
                                </div>
                                <FormInput label="Key Skills (Comma separated)" name="skills" value={formData.skills} onChange={handleChange} placeholder="Java, React, Teamwork..." />
                            </div>
                        )}

                        {activeTab === 'compliance' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <FormInput label="Emergency Contact Name" name="emergency_contact" value={formData.emergency_contact} onChange={handleChange} />
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-rams-rule-light flex justify-end gap-3 bg-rams-bg">
                    <button type="button" onClick={onClose} className="px-5 py-2 rounded-sm font-mono font-bold text-xs uppercase tracking-wider text-rams-ink-muted hover:bg-rams-ink-muted/10 border border-transparent transition-all cursor-pointer">Cancel</button>
                    <button type="submit" form="staffForm" className="px-6 py-2 rounded-sm font-mono font-bold text-xs uppercase tracking-wider text-rams-panel bg-rams-orange border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[2px] active:shadow-none transition-all cursor-pointer">
                        {isEditing ? 'Update Profile' : 'Create Staff'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// Helper Components
const FormInput = ({ label, mono, ...props }) => (
    <div>
        <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1.5 uppercase tracking-wider">{label}</label>
        <input {...props} className={`w-full p-2.5 rounded-sm border border-rams-rule-light focus:border-rams-rule outline-none bg-rams-bg text-rams-ink font-sans text-xs transition-all ${mono ? 'font-mono' : ''}`} />
    </div>
);

const FormSelect = ({ label, options, ...props }) => (
    <div>
        <label className="block text-[10px] font-mono font-bold text-rams-ink-muted mb-1.5 uppercase tracking-wider">{label}</label>
        <select {...props} className="w-full p-2.5 rounded-sm border border-rams-rule-light focus:border-rams-rule outline-none bg-rams-bg text-rams-ink font-sans text-xs transition-all appearance-none cursor-pointer">
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    </div>
);
