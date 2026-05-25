"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { format, addHours, startOfDay, endOfDay } from "date-fns";
import { th } from "date-fns/locale";

function EspressoPDFReportContent() {
    const searchParams = useSearchParams();
    const dateParam = searchParams.get('date');
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);

    const reportDate = dateParam || format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        const fetchData = async () => {
            // Fetch employees for mapping
            const { data: empData } = await supabase.from('employees').select('id, name, nickname, line_bot_id, line_user_id');
            if (empData) setEmployees(empData);

            // Fetch chat history for the specific date
            const start = startOfDay(new Date(reportDate)).toISOString();
            const end = endOfDay(new Date(reportDate)).toISOString();

            const { data: chatData, error } = await supabase
                .from('yuzu_chat_history')
                .select('id, created_at, user_id, role, content, message_type')
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: true });

            if (!error && chatData) {
                // Filter messages
                const rawReports = chatData.filter(m => m.message_type === 'espresso_report');
                const photos = chatData.filter(m => m.message_type === 'image_description' && m.content.includes('[ภาพประกอบช็อตกาแฟ]'));
                const analyses = chatData.filter(m => m.role === 'model' && m.content.includes('[Espresso Analysis]'));

                // Match reports with photos and analyses
                const matchedReports = rawReports.map(report => {
                    const reportTime = new Date(report.created_at);

                    // Find photos within 5 minutes of report from the same user
                    const matchingPhotos = photos.filter(p => {
                        const pTime = new Date(p.created_at);
                        const diffMin = Math.abs(pTime - reportTime) / 60000;
                        return p.user_id === report.user_id && diffMin <= 5;
                    });

                    const photoUrls = matchingPhotos.map(p => {
                        const match = p.content.match(/\[ภาพประกอบช็อตกาแฟ\] (https?:\/\/[^\s]+)/);
                        return match ? match[1] : null;
                    }).filter(Boolean);

                    // Find analysis within 2 minutes after report
                    const analysis = analyses.find(a => {
                        const aTime = new Date(a.created_at);
                        const diffMin = (aTime - reportTime) / 60000;
                        return diffMin >= 0 && diffMin <= 2;
                    });

                    const recommendation = analysis 
                        ? analysis.content.replace('[Espresso Analysis]', '').trim() 
                        : 'ไม่มีบทวิเคราะห์ช็อตกาแฟ';

                    return {
                        id: report.id,
                        timestamp: report.created_at,
                        userId: report.user_id,
                        rawText: report.content,
                        photos: photoUrls,
                        recommendation
                    };
                });

                setReports(matchedReports);
            }
            setLoading(false);
        };
        fetchData();
    }, [reportDate]);

    const getEmployeeDisplay = (userId) => {
        const emp = employees.find(e => 
            String(e.id) === String(userId) || 
            (userId && e.line_bot_id && e.line_bot_id.toLowerCase() === String(userId).toLowerCase()) ||
            (userId && e.line_user_id && e.line_user_id.toLowerCase() === String(userId).toLowerCase())
        );
        return emp ? (emp.nickname || emp.name) : "บาริสต้า (ไม่ทราบชื่อ)";
    };

    if (loading) return <div className="p-20 text-center font-bold tracking-widest text-slate-300">GENERATING ESPRESSO REPORT...</div>;

    return (
        <div className="min-h-screen bg-white text-black p-8 md:p-16 font-sans selection:bg-black selection:text-white">
            {/* Header */}
            <div className="flex justify-between items-center border-b-4 border-black pb-8 mb-12">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-14 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-3xl font-black tracking-tighter leading-none mb-1">IN THE HAUS</h1>
                        <p className="text-[10px] font-bold tracking-[0.3em] uppercase opacity-50">Espresso Calibration Report</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-black tracking-tighter">{format(new Date(reportDate), 'dd MMM yyyy', { locale: th })}</div>
                    <div className="text-[10px] font-bold tracking-widest uppercase opacity-40">Report Generated: {format(new Date(), 'HH:mm:ss')}</div>
                </div>
            </div>

            {/* Hero Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-16">
                <div className="border-l-8 border-black pl-6 py-2">
                    <p className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 mb-2">Total Extractions Logged</p>
                    <p className="text-5xl font-black tracking-tighter">{reports.length}</p>
                </div>
                <div className="border-l-8 border-black pl-6 py-2">
                    <p className="text-[10px] font-bold tracking-[0.4em] uppercase opacity-40 mb-2">Total Supporting Images</p>
                    <p className="text-5xl font-black tracking-tighter">
                        {reports.reduce((sum, r) => sum + r.photos.length, 0)}
                    </p>
                </div>
            </div>

            {/* Reports List */}
            {reports.length === 0 ? (
                <div className="py-20 text-center border-t-2 border-black border-dashed">
                    <p className="text-slate-300 font-bold uppercase tracking-widest mb-1">No Extractions Logged</p>
                    <p className="text-slate-400 text-xs">ไม่พบข้อมูลการสกัดกาแฟในวันที่เลือก</p>
                </div>
            ) : (
                <div className="space-y-12">
                    {reports.map((report, idx) => (
                        <div key={report.id} className="border-b border-slate-200 pb-12 last:border-0">
                            <div className="flex flex-col md:flex-row md:items-center justify-between pb-4 mb-6 border-b border-slate-100 gap-2">
                                <div className="flex items-center gap-3">
                                    <div className="bg-black text-white font-black px-2.5 py-1 text-xs tracking-tighter">
                                        SHOT #{idx + 1}
                                    </div>
                                    <span className="font-mono text-xs font-bold text-slate-400">
                                        {format(new Date(report.timestamp), 'HH:mm น.')}
                                    </span>
                                </div>
                                <div className="text-sm font-black uppercase tracking-tight text-slate-800">
                                    บาริสต้า: {getEmployeeDisplay(report.userId)}
                                </div>
                            </div>

                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                                {/* Left Side: Details & Photos */}
                                <div className="lg:col-span-7 space-y-6">
                                    <div className="bg-slate-50 p-6 rounded-2xl border border-slate-100">
                                        <h4 className="text-[10px] font-black tracking-widest uppercase opacity-40 mb-3">บันทึกพารามิเตอร์ (Raw Log)</h4>
                                        <p className="text-sm font-bold leading-relaxed whitespace-pre-wrap">{report.rawText}</p>
                                    </div>

                                    {report.photos.length > 0 && (
                                        <div className="space-y-3">
                                            <h4 className="text-[10px] font-black tracking-widest uppercase opacity-40">ภาพประกอบการชง (Calibration Photos)</h4>
                                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                                {report.photos.map((url, i) => (
                                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square bg-slate-50 border border-slate-100 rounded-xl overflow-hidden block hover:scale-102 transition-all relative">
                                                        <img src={url} alt={`Supporting photo ${i + 1}`} className="w-full h-full object-cover" />
                                                    </a>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Right Side: Analysis & Feedback */}
                                <div className="lg:col-span-5">
                                    <div className="border-l-4 border-black pl-6 py-1 h-full flex flex-col justify-between">
                                        <div>
                                            <h4 className="text-[10px] font-black tracking-widest uppercase opacity-40 mb-3">บทวิเคราะห์และคำแนะนำจาก Yuzu AI</h4>
                                            <p className="text-sm leading-relaxed text-slate-800 italic whitespace-pre-wrap">
                                                "{report.recommendation}"
                                            </p>
                                        </div>
                                        <div className="text-[9px] font-bold text-slate-400 mt-6 uppercase tracking-wider">
                                            Yuzu AI Assistant 🍊
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-slate-200">
                <div className="flex justify-between items-end">
                    <div className="max-w-sm">
                        <p className="text-[10px] font-bold tracking-[0.2em] uppercase mb-4 opacity-40">Verification & Archives</p>
                        <p className="text-[10px] leading-relaxed text-slate-400">
                            This document is an automated calibration report processed by Yuzu AI for In The Haus. 
                            Extraction data and feedback are analyzed using Gemini 3.5 Flash.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-xs font-black italic tracking-widest">YUZU x IN THE HAUS</p>
                        <p className="text-[10px] font-bold text-slate-300">© {new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    .no-print { display: none; }
                    body { 
                        padding: 0; 
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
            `}</style>

            <button 
                onClick={() => window.print()}
                className="fixed bottom-8 right-8 no-print bg-black text-white px-8 py-4 rounded-full font-bold text-xs tracking-widest uppercase shadow-2xl hover:scale-105 active:scale-95 transition-all"
            >
                Print to PDF
            </button>
        </div>
    );
}

export default function EspressoPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-300 uppercase">Loading Espresso Report Engine...</div>}>
            <EspressoPDFReportContent />
        </Suspense>
    );
}
