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

    return (
        <div className="min-h-screen bg-gray-100 p-4 md:p-8 font-sans text-gray-800">
            <div className="max-w-4xl mx-auto flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
                <button 
                    onClick={() => window.history.back()}
                    className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                >
                    <ArrowLeft size={20} /> กลับไปหน้าก่อนหน้า
                </button>
                <button 
                    onClick={handleDownloadPDF}
                    disabled={loading || downloading}
                    className="flex items-center gap-2 bg-[#ff7b00] hover:bg-[#e66f00] text-white px-6 py-3 rounded-xl font-medium shadow-md transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {downloading ? (
                        <>กำลังประมวลผล PDF...</>
                    ) : (
                        <><Download size={20} /> ดาวน์โหลด PDF</>
                    )}
                </button>
            </div>

            {/* A4 Document Container */}
            <div className="max-w-[210mm] mx-auto bg-white shadow-2xl overflow-hidden">
                {/* PDF Content Area */}
                <div ref={reportRef} className="p-12 min-h-[297mm] bg-white relative">
                    
                    {/* Header */}
                    <div className="border-b-4 border-[#ff7b00] pb-8 mb-8 flex justify-between items-end">
                        <div>
                            <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">รายงานสรุปยอดโอน</h1>
                            <p className="text-xl text-gray-500 mt-2 font-medium">In The Haus</p>
                        </div>
                        <div className="text-right">
                            <p className="text-lg font-semibold text-gray-800">วันที่: {displayDate}</p>
                            <p className="text-gray-500 mt-1">เวลาอัปเดตบรรทัดล่าสุด: {format(addHours(new Date(), 7), 'HH:mm น.')}</p>
                        </div>
                    </div>

                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 gap-6 mb-10">
                        <div className="bg-orange-50 p-6 rounded-2xl border border-orange-100">
                            <div className="flex items-center gap-3 text-orange-600 mb-2">
                                <FileText size={24} />
                                <h3 className="font-semibold text-lg">จำนวนรายการโอน</h3>
                            </div>
                            <p className="text-4xl font-bold text-gray-900">{slips.length} <span className="text-xl text-gray-500 font-normal">รายการ</span></p>
                        </div>
                        <div className="bg-emerald-50 p-6 rounded-2xl border border-emerald-100">
                            <div className="flex items-center gap-3 text-emerald-600 mb-2">
                                <CheckCircle size={24} />
                                <h3 className="font-semibold text-lg">ยอดรวมสุทธิ</h3>
                            </div>
                            <p className="text-4xl font-bold text-emerald-600">{totalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})} <span className="text-xl text-gray-500 font-normal">บาท</span></p>
                        </div>
                    </div>

                    {/* Table */}
                    {loading ? (
                        <p className="text-center text-gray-500 py-10">กำลังโหลดข้อมูล...</p>
                    ) : slips.length === 0 ? (
                        <div className="text-center py-20 bg-gray-50 rounded-2xl border border-dashed border-gray-300">
                            <p className="text-gray-500 text-lg">ไม่พบข้อมูลการโอนเงินของวันนี้</p>
                        </div>
                    ) : (
                        <div className="overflow-hidden rounded-xl border border-gray-200">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-gray-100 text-gray-700">
                                        <th className="py-4 px-6 font-semibold border-b">ลำดับ</th>
                                        <th className="py-4 px-6 font-semibold border-b">เวลาที่โอน</th>
                                        <th className="py-4 px-6 font-semibold border-b">ผู้ทำรายการ</th>
                                        <th className="py-4 px-6 font-semibold border-b">เลขอ้างอิง (Ref)</th>
                                        <th className="py-4 px-6 font-semibold border-b text-right">จำนวนเงิน (บาท)</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {slips.map((slip, idx) => (
                                        <tr key={idx} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                                            <td className="py-4 px-6 text-gray-500">{idx + 1}</td>
                                            <td className="py-4 px-6 font-medium text-gray-800">
                                                {format(addHours(new Date(slip.timestamp), 7), 'HH:mm')}
                                            </td>
                                            <td className="py-4 px-6 text-gray-600">{slip.sender_name || '-'}</td>
                                            <td className="py-4 px-6 text-gray-500 text-sm font-mono">{slip.transaction_ref || '-'}</td>
                                            <td className="py-4 px-6 text-right font-semibold text-gray-900">
                                                {Number(slip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}
                                            </td>
                                        </tr>
                                    ))}
                                    {/* Total Row */}
                                    <tr className="bg-orange-50">
                                        <td colSpan="4" className="py-5 px-6 text-right font-bold text-gray-900">ยอดรวมทั้งหมด</td>
                                        <td className="py-5 px-6 text-right font-bold text-orange-600 text-lg border-t border-orange-200">
                                            {totalAmount.toLocaleString('th-TH', {minimumFractionDigits: 2})}
                                        </td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>
                    )}

                    {/* Footer */}
                    <div className="absolute bottom-12 left-12 right-12 text-center text-gray-400 text-sm border-t border-gray-200 pt-6">
                        <p>เอกสารสรุปยอดโอนสร้างโดยระบบอัตโนมัติ (Yuzu AI Assistant) - ร้าน In The Haus</p>
                    </div>
                </div>
            </div>
            
            {/* Download Hint for Mobile */}
            <p className="text-center text-gray-500 mt-8 text-sm md:hidden">
                กรุณากดปุ่ม "ดาวน์โหลด PDF" ด้านบนเพื่อจัดเก็บเป็นไฟล์
            </p>
        </div>
    );
}
