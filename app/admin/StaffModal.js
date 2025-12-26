"use client";
import { useState, useEffect } from "react";

export default function StaffModal({ isOpen, onClose, onSave, initialData, isEditing }) {
    if (!isOpen) return null;

    const [activeTab, setActiveTab] = useState("core");
    const [formData, setFormData] = useState({
        name: "", name_en: "", nickname: "",
        phone: "", email: "", line_user_id: "",
        address: "", id_card: "",
        employment_status: "Probation", job_title: "", job_level: "",
        start_date: "", probation_date: "",
        base_salary: "", bank_account: "", bank_name: "",
        social_security_id: "", tax_id: "",
        emergency_contact: "", skills: [], education_history: []
    });

    useEffect(() => {
        if (initialData) {
            setFormData({ ...formData, ...initialData });
        } else {
            // Reset if adding new
            setFormData({
                name: "", name_en: "", nickname: "",
                phone: "", email: "", line_user_id: "",
                address: "", id_card: "",
                employment_status: "Probation", job_title: "", job_level: "",
                start_date: "", probation_date: "",
                base_salary: "", bank_account: "", bank_name: "",
                social_security_id: "", tax_id: "",
                emergency_contact: "", skills: [], education_history: []
            });
        }
    }, [initialData, isOpen]);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
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
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-3xl w-full max-w-4xl max-h-[90vh] overflow-hidden shadow-2xl flex flex-col">
                {/* Header */}
                <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{isEditing ? 'Edit Staff Profile' : 'Add New Staff'}</h2>
                        <p className="text-xs text-slate-500">Manage detailed employee information</p>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-full text-slate-400 font-bold transition">✕</button>
                </div>

                {/* Tabs */}
                <div className="flex px-6 border-b border-slate-100 overflow-x-auto">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-3 text-xs font-bold uppercase tracking-wider transition-all border-b-2 whitespace-nowrap ${activeTab === tab.id ? 'border-slate-800 text-slate-800' : 'border-transparent text-slate-400 hover:text-slate-600'}`}
                        >
                            {tab.label.replace(/ [a-z]/, (m) => m.toUpperCase())} {/* Hacky capitalize icon label if needed, or just use label directly */}
                            {tab.label}
                        </button>
                    ))}
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 bg-slate-50/30">
                    <form id="staffForm" onSubmit={handleSubmit} className="space-y-6">
                        {activeTab === 'core' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                                <FormInput label="Full Name (TH)" name="name" value={formData.name} onChange={handleChange} required placeholder="นาย สมชาย ใจดี" />
                                <FormInput label="Full Name (EN)" name="name_en" value={formData.name_en} onChange={handleChange} placeholder="Mr. Somchai Jaidee" />
                                <FormInput label="Nickname" name="nickname" value={formData.nickname} onChange={handleChange} />
                                <FormInput label="Line User ID" name="line_user_id" value={formData.line_user_id} onChange={handleChange} required placeholder="U1234..." mono />
                                <FormInput label="Phone Number" name="phone" value={formData.phone} onChange={handleChange} type="tel" />
                                <FormInput label="Email" name="email" value={formData.email} onChange={handleChange} type="email" />
                                <FormInput label="ID Card Number" name="id_card" value={formData.id_card} onChange={handleChange} placeholder="1-xxxx-xxxxx-xx-x" mono />
                                <div className="md:col-span-2">
                                    <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">Address</label>
                                    <textarea name="address" value={formData.address} onChange={handleChange} className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-800 outline-none bg-white min-h-[80px]" placeholder="Current address..." />
                                </div>
                            </div>
                        )}

                        {activeTab === 'employment' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                                <FormSelect label="Employment Status" name="employment_status" value={formData.employment_status} onChange={handleChange} options={['Probation', 'Fulltime', 'Contract', 'Resigned']} />
                                <FormInput label="Job Title / Position" name="position" value={formData.position} onChange={handleChange} required />
                                <FormInput label="Job Level" name="job_level" value={formData.job_level} onChange={handleChange} placeholder="Junior, Senior, Manager..." />
                                <FormInput label="Start Date" name="start_date" type="date" value={formData.start_date} onChange={handleChange} />
                                <FormInput label="Probation End Date" name="probation_date" type="date" value={formData.probation_date} onChange={handleChange} />
                            </div>
                        )}

                        {activeTab === 'compensation' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                                <FormInput label="Base Salary (THB)" name="base_salary" type="number" value={formData.base_salary} onChange={handleChange} />
                                <FormInput label="Bank Name" name="bank_name" value={formData.bank_name} onChange={handleChange} placeholder="KBank, SCB..." />
                                <FormInput label="Account Number" name="bank_account" value={formData.bank_account} onChange={handleChange} mono />
                                <FormInput label="Social Security ID" name="social_security_id" value={formData.social_security_id} onChange={handleChange} mono />
                                <FormInput label="Tax ID" name="tax_id" value={formData.tax_id} onChange={handleChange} mono />
                            </div>
                        )}

                        {activeTab === 'talent' && (
                            <div className="space-y-4 animate-fade-in">
                                <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 text-blue-800 text-sm">
                                    🚧 Talent Management (Skills & Education) implementation coming soon.
                                    <br />For now, please upload relevant documents to the system manually if needed.
                                </div>
                                <FormInput label="Key Skills (Comma separated)" name="skills" value={formData.skills} onChange={handleChange} placeholder="Java, React, Teamwork..." />
                            </div>
                        )}

                        {activeTab === 'compliance' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-fade-in">
                                <FormInput label="Emergency Contact Name" name="emergency_contact" value={formData.emergency_contact} onChange={handleChange} />
                                {/* Add more compliance fields here */}
                            </div>
                        )}
                    </form>
                </div>

                {/* Footer */}
                <div className="p-6 border-t border-slate-100 flex justify-end gap-3 bg-slate-50/50">
                    <button type="button" onClick={onClose} className="px-6 py-3 rounded-xl font-bold text-slate-500 hover:bg-slate-200 transition">Cancel</button>
                    <button type="submit" form="staffForm" className="px-8 py-3 rounded-xl font-bold text-white bg-slate-800 hover:bg-slate-900 shadow-lg transition transform active:scale-95">
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
        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">{label}</label>
        <input {...props} className={`w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-800 outline-none bg-white transition ${mono ? 'font-mono' : ''}`} />
    </div>
);

const FormSelect = ({ label, options, ...props }) => (
    <div>
        <label className="block text-xs font-bold text-slate-500 mb-1 uppercase">{label}</label>
        <select {...props} className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-slate-800 outline-none bg-white transition appearance-none">
            {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
    </div>
);
