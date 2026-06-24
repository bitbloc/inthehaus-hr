"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { format, startOfMonth, endOfMonth, parseISO } from "date-fns";
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

            // Fetch chat history for the ENTIRE MONTH of the selected date
            const dateObj = new Date(reportDate);
            const start = startOfMonth(dateObj).toISOString();
            const end = endOfMonth(dateObj).toISOString();

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

    if (loading) return <div className="p-20 text-center font-bold font-mono tracking-widest text-slate-400">GENERATING ESPRESSO REPORT...</div>;

    // Group reports by date
    const reportsByDay = reports.reduce((groups, report) => {
        const dateStr = format(new Date(report.timestamp), 'yyyy-MM-dd');
        if (!groups[dateStr]) groups[dateStr] = [];
        groups[dateStr].push(report);
        return groups;
    }, {});

    // Sort dates in descending order (newest first)
    const sortedDates = Object.keys(reportsByDay).sort((a, b) => new Date(b) - new Date(a));

    const totalImages = reports.reduce((sum, r) => sum + r.photos.length, 0);
    const selectedMonthName = format(new Date(reportDate), 'MMMM yyyy', { locale: th });

    return (
        <div className="min-h-screen bg-[#fafaf9] text-neutral-900 p-8 md:p-16 font-mono selection:bg-neutral-900 selection:text-white">
            {/* Header / Brand Area */}
            <div className="flex justify-between items-center border-b-2 border-neutral-900 pb-8 mb-12">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-12 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-xl font-bold tracking-widest leading-none mb-1">IN THE HAUS</h1>
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-500">Espresso Calibration Report (Monthly)</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xl font-bold tracking-tight text-neutral-800 uppercase">{selectedMonthName}</div>
                    <div className="text-[8px] font-bold tracking-widest uppercase text-neutral-400 mt-1">Generated: {format(new Date(), 'dd/MM/yyyy HH:mm')}</div>
                </div>
            </div>

            {/* Aggregated Stats (Dieter Rams Bento style cards) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                <div className="border border-neutral-300 bg-white p-6 rounded-2xl flex flex-col justify-between">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Selected Month</p>
                    <p className="text-2xl font-bold tracking-tight capitalize text-neutral-900">{format(new Date(reportDate), 'LLLL yyyy', { locale: th })}</p>
                </div>
                <div className="border border-neutral-300 bg-white p-6 rounded-2xl flex flex-col justify-between">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Total Extractions Logged</p>
                    <p className="text-3xl font-bold tracking-tight text-neutral-900">{reports.length} <span className="text-xs font-normal text-neutral-400">Shots</span></p>
                </div>
                <div className="border border-neutral-300 bg-white p-6 rounded-2xl flex flex-col justify-between">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Total Calibration Images</p>
                    <p className="text-3xl font-bold tracking-tight text-neutral-900">{totalImages} <span className="text-xs font-normal text-neutral-400">Files</span></p>
                </div>
            </div>

            {/* Monthly Logs List (Grouped by Date) */}
            {sortedDates.length === 0 ? (
                <div className="py-20 text-center border border-neutral-300 border-dashed rounded-2xl bg-white">
                    <p className="text-neutral-300 font-bold uppercase tracking-widest mb-1">No Extractions Logged</p>
                    <p className="text-neutral-400 text-xs">ไม่พบข้อมูลการสกัดกาแฟในเดือนนี้</p>
                </div>
            ) : (
                <div className="space-y-16">
                    {sortedDates.map((dateStr) => {
                        const dayLogs = reportsByDay[dateStr];
                        const dateFormatted = format(new Date(dateStr), 'EEEEที่ d MMMM yyyy', { locale: th });
                        
                        return (
                            <div key={dateStr} className="border border-neutral-200 bg-white rounded-3xl p-6 md:p-8 space-y-6">
                                {/* Date Heading Banner */}
                                <div className="border-b border-neutral-200 pb-4 flex justify-between items-baseline flex-wrap gap-2">
                                    <h3 className="text-sm font-bold uppercase tracking-wider text-neutral-800">
                                        📅 {dateFormatted}
                                    </h3>
                                    <span className="text-[9px] font-bold tracking-widest text-neutral-400 uppercase">
                                        {dayLogs.length} LOGS
                                    </span>
                                </div>

                                {/* Shot Lists of the Day */}
                                <div className="divide-y divide-neutral-100">
                                    {dayLogs.map((report, idx) => (
                                        <div key={report.id} className="py-6 first:pt-0 last:pb-0 space-y-4">
                                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                                <div className="flex items-center gap-3">
                                                    <span className="bg-neutral-900 text-white font-bold px-2 py-0.5 text-[9px] tracking-widest rounded-md">
                                                        SHOT #{idx + 1}
                                                    </span>
                                                    <span className="font-mono text-[10px] font-bold text-neutral-400">
                                                        {format(new Date(report.timestamp), 'HH:mm น.')}
                                                    </span>
                                                </div>
                                                <div className="text-[10px] font-bold uppercase tracking-widest text-neutral-600">
                                                    บาริสต้า: {getEmployeeDisplay(report.userId)}
                                                </div>
                                            </div>

                                            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                                                {/* Left Column: Raw parameters and photos */}
                                                <div className="lg:col-span-7 space-y-4">
                                                    <div className="bg-[#fafaf9] p-4 border border-neutral-200 rounded-xl">
                                                        <h4 className="text-[9px] font-bold tracking-widest uppercase text-neutral-400 mb-2">บันทึกพารามิเตอร์ (Raw Log)</h4>
                                                        <p className="text-xs leading-relaxed whitespace-pre-wrap font-semibold text-neutral-800">{report.rawText}</p>
                                                    </div>

                                                    {report.photos.length > 0 && (
                                                        <div className="space-y-2">
                                                            <h4 className="text-[9px] font-bold tracking-widest uppercase text-neutral-400">ภาพประกอบการชง (Calibration Photos)</h4>
                                                            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                                                                {report.photos.map((url, i) => (
                                                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="aspect-square bg-[#fafaf9] border border-neutral-200 overflow-hidden block hover:opacity-85 transition-all relative rounded-lg">
                                                                        <img src={url} alt={`Calibration Supporting ${i + 1}`} className="w-full h-full object-cover" />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Right Column: AI Analysis */}
                                                <div className="lg:col-span-5">
                                                    <div className="border border-neutral-200 p-5 bg-[#fafaf9] h-full flex flex-col justify-between rounded-xl">
                                                        <div>
                                                            <h4 className="text-[9px] font-bold tracking-widest uppercase text-neutral-400 mb-2">บทวิเคราะห์จาก Yuzu AI</h4>
                                                            <p className="text-xs leading-relaxed text-neutral-800 italic whitespace-pre-wrap">
                                                                "{report.recommendation}"
                                                            </p>
                                                        </div>
                                                        <div className="text-[8px] font-bold text-neutral-400 mt-4 uppercase tracking-widest">
                                                            Yuzu AI Assistant 🍊
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Footer Copyright */}
            <div className="mt-20 pt-8 border-t border-neutral-200">
                <div className="flex justify-between items-end flex-wrap gap-4">
                    <div className="max-w-sm">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-2 text-neutral-400">Verification & Archives</p>
                        <p className="text-[9px] leading-relaxed text-neutral-400">
                            This document is an aggregated monthly calibration report processed by Yuzu AI for In The Haus. 
                            Extraction data and feedback are analyzed using Gemini 3.5 Flash.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold italic tracking-widest uppercase text-neutral-700">YUZU x IN THE HAUS</p>
                        <p className="text-[9px] font-bold text-neutral-400 mt-1">ONHAUS SYSTEM © {new Date().getFullYear()} All Rights Reserved</p>
                    </div>
                </div>
            </div>

            <style jsx global>{`
                @media print {
                    .no-print { display: none !important; }
                    body { 
                        padding: 0 !important; 
                        margin: 0 !important;
                        background: white !important;
                        -webkit-print-color-adjust: exact !important;
                        print-color-adjust: exact !important;
                    }
                }
            `}</style>

            <button 
                onClick={() => window.print()}
                className="fixed bottom-8 right-8 no-print bg-neutral-900 border border-neutral-900 text-white px-8 py-4 rounded-xl font-bold text-xs tracking-widest uppercase hover:bg-white hover:text-neutral-900 transition-all cursor-pointer shadow-md z-50"
            >
                Print to PDF
            </button>
        </div>
    );
}

export default function EspressoPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-400 uppercase font-mono">Loading Espresso Report Engine...</div>}>
            <EspressoPDFReportContent />
        </Suspense>
    );
}
