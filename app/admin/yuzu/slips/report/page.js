"use client";

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format, addHours } from 'date-fns';
import { th } from 'date-fns/locale';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { ArrowLeft, Download, FileText, CheckCircle } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

export default function SlipPDFReport() {
    const [slips, setSlips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [downloading, setDownloading] = useState(false);
    const reportRef = useRef(null);
    const todayStr = format(addHours(new Date(), 7), 'yyyy-MM-dd');
    const displayDate = format(addHours(new Date(), 7), 'dd MMMM yyyy', { locale: th });

    useEffect(() => {
        const fetchSlips = async () => {
            const { data, error } = await supabase
                .from('slip_transactions')
                .select('amount, user_id, timestamp, slip_url, transaction_ref, sender_name')
                .eq('date', todayStr)
                .eq('is_deleted', false)
                .order('timestamp', { ascending: true });

            if (!error && data) {
                setSlips(data);
            }
            setLoading(false);
        };
        fetchSlips();
    }, [todayStr]);

    const handleDownloadPDF = async () => {
        if (!reportRef.current) return;
        setDownloading(true);
        try {
            // Apply a temporary scale/style fix if needed for html2canvas
            const canvas = await html2canvas(reportRef.current, {
                scale: 2, 
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            });
            const imgData = canvas.toDataURL('image/png');
            
            // A4 size: 210 x 297 mm
            const pdf = new jsPDF('p', 'mm', 'a4');
            const pdfWidth = pdf.internal.pageSize.getWidth();
            const pdfHeight = (canvas.height * pdfWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, pdfWidth, pdfHeight);
            pdf.save(`Slip_Report_InTheHaus_${todayStr}.pdf`);
        } catch (error) {
            console.error("PDF generation failed", error);
            alert("เกิดข้อผิดพลาดในการสร้าง PDF");
        } finally {
            setDownloading(false);
        }
    };

    const totalAmount = slips.reduce((sum, s) => sum + Number(s.amount), 0);
    const logoUrl = "https://uozcalculatecumdzmcjr.supabase.co/storage/v1/object/public/yuzu-assets/inthehaus-logo.png"; // Placeholder for the provided logo

    return (
        <div className="min-h-screen bg-[#f9f9f9] p-4 md:p-12 font-sans text-black">
            <div className="max-w-4xl mx-auto flex justify-between items-center mb-10">
                <button 
                    onClick={() => window.history.back()}
                    className="text-sm font-medium hover:underline flex items-center gap-1"
                >
                    <ArrowLeft size={16} /> กลับ
                </button>
                <div className="flex gap-4">
                    <button 
                        onClick={handleDownloadPDF}
                        disabled={loading || downloading}
                        className="bg-black text-white px-6 py-2 rounded-full font-bold text-sm flex items-center gap-2 hover:bg-gray-800 transition-all disabled:opacity-50"
                    >
                        {downloading ? "กำลังประมวลผล..." : <><Download size={18} /> DOWNLOAD PDF</>}
                    </button>
                </div>
            </div>

            {/* A4 Document Container - Refined for "Our Year" Mood */}
            <div className="max-w-[210mm] mx-auto bg-white shadow-sm border border-gray-100 overflow-hidden">
                <div ref={reportRef} className="p-16 min-h-[297mm] bg-white relative flex flex-col">
                    
                    {/* Brand Header */}
                    <div className="flex justify-between items-start mb-20">
                        <div className="w-48">
                            <img src={logoUrl} alt="In The Haus" className="w-full object-contain" />
                        </div>
                        <div className="text-right">
                            <h2 className="text-3xl font-serif italic text-gray-800">Our Day</h2>
                            <p className="text-sm text-gray-400 mt-1 uppercase tracking-widest">{displayDate}</p>
                        </div>
                    </div>

                    {/* Minimalist Narrative / Hero Stats */}
                    <div className="mb-20">
                        <p className="text-sm text-gray-500 max-w-lg mb-12 leading-relaxed">
                            รายงานสรุปยอดโอนรวมประจำวันของร้าน In The Haus ข้อมูลชุดนี้ครอบคลุมการทำรายการโอนเงินทั้งหมดที่ผ่านการตรวจสอบโดยระบบ Yuzu AI และพนักงานทีม Bar & Floor เพื่อความโปร่งใสและแม่นยำในการปิดยอดประจำวัน
                        </p>

                        <div className="space-y-12">
                            <div className="border-b border-gray-100 pb-8 flex justify-between items-end">
                                <h3 className="text-8xl font-black tracking-tighter">
                                    {slips.length < 10 ? `0${slips.length}` : slips.length}
                                </h3>
                                <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">Total Transactions</p>
                            </div>

                            <div className="border-b border-gray-100 pb-8 flex justify-between items-end">
                                <h3 className="text-7xl font-black tracking-tighter">
                                    +{totalAmount.toLocaleString('th-TH', {minimumFractionDigits: 0})}
                                </h3>
                                <p className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-2">Net Transfer Amount (THB)</p>
                            </div>
                        </div>
                    </div>

                    {/* Clean List Instead of Heavy Table */}
                    <div className="flex-grow">
                        <h4 className="text-xs font-bold uppercase tracking-[0.2em] text-gray-300 mb-8">Transaction Timeline</h4>
                        
                        {loading ? (
                            <p className="text-gray-400 italic">กำลังดึงข้อมูลจากระบบ...</p>
                        ) : slips.length === 0 ? (
                            <p className="text-gray-400 italic">ไม่มีข้อมูลการโอนเงินในวันนี้</p>
                        ) : (
                            <div className="space-y-6">
                                {slips.map((slip, idx) => (
                                    <div key={idx} className="flex justify-between items-start group">
                                        <div className="flex gap-8">
                                            <span className="text-gray-300 font-mono text-sm">{format(addHours(new Date(slip.timestamp), 7), 'HH:mm')}</span>
                                            <div>
                                                <p className="font-bold text-sm uppercase tracking-tight">{slip.sender_name || 'Staff'}</p>
                                                <p className="text-[10px] text-gray-400 font-mono mt-1">{slip.transaction_ref || 'External Receipt'}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <p className="text-lg font-black tracking-tight">{Number(slip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Subtle Footer */}
                    <div className="mt-20 pt-8 border-t border-gray-50 flex justify-between items-center text-[10px] text-gray-300 uppercase tracking-widest font-bold">
                        <div>Verified by Yuzu AI Assistant</div>
                        <div>Page 01 / 01</div>
                    </div>
                </div>
            </div>
            
            <div className="text-center mt-12 py-8 bg-black text-white/20 text-[10px] uppercase tracking-[0.5em] font-bold">
                In The Haus &bull; Restaurant OS &bull; 2026
            </div>
        </div>
    );
}
