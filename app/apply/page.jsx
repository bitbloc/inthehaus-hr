"use client";
import { useState } from "react";
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase Client (assuming public env vars are set)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function JobApplicationPage() {
    const [step, setStep] = useState(1);
    const [formData, setFormData] = useState({
        full_name: "",
        email: "",
        phone: "",
        position_applied: "",
        portfolio_url: "",
        cover_letter: ""
    });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [isSuccess, setIsSuccess] = useState(false);

    const positions = ["Barista", "Waiter / Waitress", "Kitchen Staff", "Store Manager"];

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleNext = () => {
        if (step === 1 && (!formData.full_name || !formData.email || !formData.phone)) {
            alert("Please fill in all contact details.");
            return;
        }
        setStep(prev => prev + 1);
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);

        const { error } = await supabase.from('job_applications').insert({
            full_name: formData.full_name,
            email: formData.email,
            phone: formData.phone,
            position_applied: formData.position_applied,
            metadata: {
                portfolio: formData.portfolio_url,
                cover_letter: formData.cover_letter
            }
        });

        setIsSubmitting(false);
        if (!error) {
            setIsSuccess(true);
        } else {
            alert("Submission failed. Please try again.");
        }
    };

    if (isSuccess) {
        return (
            <div className="min-h-screen bg-[#F5F5F7] flex items-center justify-center p-6">
                <div className="bg-white p-12 rounded-3xl shadow-sm text-center max-w-md w-full animate-fade-in-up">
                    <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-6 text-4xl">
                        ✨
                    </div>
                    <h2 className="text-2xl font-bold text-slate-800 mb-2">Application Sent</h2>
                    <p className="text-slate-500 mb-8">Thank you for your interest in joining us. We will review your application and get back to you soon.</p>
                    <a href="/" className="inline-block px-8 py-3 bg-slate-800 text-white rounded-xl font-bold hover:bg-slate-900 transition">Back to Home</a>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#F5F5F7] text-slate-800 font-sans selection:bg-lime-200">
            <div className="max-w-2xl mx-auto min-h-screen flex flex-col justify-center p-6">

                {/* Header */}
                <div className="mb-12 text-center">
                    <h1 className="text-3xl font-bold tracking-tight mb-2">Join the Haus</h1>
                    <p className="text-slate-500">Become a part of our story.</p>
                </div>

                {/* Form Card */}
                <div className="bg-white rounded-3xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.05)] overflow-hidden transition-all duration-500">

                    {/* Progress Bar */}
                    <div className="h-1 bg-slate-50 w-full flex">
                        <div className={`h-full bg-lime-400 transition-all duration-500 ${step === 1 ? 'w-1/2' : 'w-full'}`}></div>
                    </div>

                    <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-8">

                        {/* Step 1: Who are you? */}
                        {step === 1 && (
                            <div className="space-y-6 animate-fade-in">
                                <h3 className="text-xl font-bold text-slate-700">Let's start with you.</h3>

                                <div className="space-y-4">
                                    <Input
                                        label="Full Name"
                                        name="full_name"
                                        value={formData.full_name}
                                        onChange={handleChange}
                                        placeholder="Your name"
                                        autoFocus
                                    />
                                    <Input
                                        label="Email Address"
                                        name="email"
                                        type="email"
                                        value={formData.email}
                                        onChange={handleChange}
                                        placeholder="you@example.com"
                                    />
                                    <Input
                                        label="Phone Number"
                                        name="phone"
                                        type="tel"
                                        value={formData.phone}
                                        onChange={handleChange}
                                        placeholder="08x-xxx-xxxx"
                                    />
                                </div>

                                <div className="pt-4">
                                    <button type="button" onClick={handleNext} className="w-full py-4 bg-slate-900 text-white rounded-xl font-bold hover:bg-black transition transform active:scale-[0.98]">
                                        Continue ➝
                                    </button>
                                </div>
                            </div>
                        )}

                        {/* Step 2: What brings you here? */}
                        {step === 2 && (
                            <div className="space-y-6 animate-fade-in">
                                <button type="button" onClick={() => setStep(1)} className="text-xs font-bold text-slate-400 hover:text-slate-600 mb-2">← Back</button>
                                <h3 className="text-xl font-bold text-slate-700">What are you looking for?</h3>

                                <div className="space-y-4">
                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Position</label>
                                        <div className="grid grid-cols-2 gap-3">
                                            {positions.map(pos => (
                                                <button
                                                    key={pos}
                                                    type="button"
                                                    onClick={() => setFormData({ ...formData, position_applied: pos })}
                                                    className={`p-4 rounded-xl text-sm font-bold border transition text-left ${formData.position_applied === pos ? 'border-lime-400 bg-lime-50 text-slate-800' : 'border-slate-100 bg-slate-50 text-slate-500 hover:bg-slate-100'}`}
                                                >
                                                    {pos}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <Input
                                        label="Portfolio / LinkedIn (Optional)"
                                        name="portfolio_url"
                                        value={formData.portfolio_url}
                                        onChange={handleChange}
                                        placeholder="https://..."
                                    />

                                    <div>
                                        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">Tell us about yourself</label>
                                        <textarea
                                            name="cover_letter"
                                            value={formData.cover_letter}
                                            onChange={handleChange}
                                            className="w-full p-4 rounded-xl border-none bg-slate-50 text-slate-800 focus:ring-2 focus:ring-lime-400 outline-none resize-none min-h-[100px]"
                                            placeholder="Why do you want to join us?"
                                        />
                                    </div>
                                </div>

                                <div className="pt-4">
                                    <button disabled={isSubmitting || !formData.position_applied} type="submit" className="w-full py-4 bg-lime-400 text-slate-900 rounded-xl font-bold hover:bg-lime-300 transition transform active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">
                                        {isSubmitting ? 'Sending...' : 'Submit Application'}
                                    </button>
                                </div>
                            </div>
                        )}

                    </form>
                </div>

                <p className="text-center text-xs text-slate-400 mt-8">© 2025 In the haus. All rights reserved.</p>
            </div>
        </div>
    );
}

const Input = ({ label, ...props }) => (
    <div>
        <label className="block text-xs font-bold text-slate-400 uppercase mb-2">{label}</label>
        <input
            {...props}
            className="w-full p-4 rounded-xl border-none bg-slate-50 text-slate-800 placeholder-slate-300 focus:ring-2 focus:ring-lime-400 outline-none transition"
        />
    </div>
);
