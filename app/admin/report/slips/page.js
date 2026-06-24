"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { format } from "date-fns";
import { th } from "date-fns/locale";

function SlipPDFReportContent() {
    const searchParams = useSearchParams();
    const dateParam = searchParams.get('date');
    const [slips, setSlips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [employees, setEmployees] = useState([]);

    const reportDate = dateParam || format(new Date(), 'yyyy-MM-dd');

    useEffect(() => {
        const fetchData = async () => {
            // Fetch employees for mapping (include both IDs)
            const { data: empData } = await supabase.from('employees').select('id, name, nickname, line_bot_id, line_user_id');
            if (empData) setEmployees(empData);

            // Fetch slips for specific date
            const { data, error } = await supabase
                .from('slip_transactions')
                .select('id, amount, timestamp, sender_name, user_id, transaction_ref, bank_name')
                .eq('is_deleted', false)
                .eq('date', reportDate)
                .order('timestamp', { ascending: true });

            if (!error && data) setSlips(data);
            setLoading(false);
        };
        fetchData();
    }, [reportDate]);

    const totalAmount = slips.reduce((sum, slip) => sum + Number(slip.amount), 0);

    const getSenderDisplay = (slip) => {
        const emp = employees.find(e => 
            String(e.id) === String(slip.user_id) || 
            (slip.user_id && e.line_bot_id && e.line_bot_id.toLowerCase() === String(slip.user_id).toLowerCase()) ||
            (slip.user_id && e.line_user_id && e.line_user_id.toLowerCase() === String(slip.user_id).toLowerCase())
        );
        
        // Truncate long IDs for cleaner PDF
        const formatId = (id) => id ? (id.length > 8 ? `${id.substring(0, 4)}...${id.substring(id.length - 4)}` : id) : "";
        
        const staffName = emp ? (emp.nickname || emp.name) : (slip.user_id ? `Staff: ${formatId(slip.user_id)}` : "ไม่ระบุพนักงาน");
        const sender = slip.sender_name || "ไม่ทราบชื่อผู้โอน";
        return { staffName, sender };
    };

    if (loading) return <div className="p-20 text-center font-bold tracking-widest font-mono text-neutral-400">GENERATING REPORT...</div>;

    return (
        <div className="min-h-screen bg-[#fafaf9] text-neutral-900 p-8 md:p-16 font-mono selection:bg-neutral-900 selection:text-white">
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-neutral-900 pb-8 mb-12">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-12 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-xl font-bold tracking-widest leading-none mb-1">IN THE HAUS</h1>
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-500">Transfer Slips Summary Report</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-xl font-bold tracking-tight text-neutral-800">{format(new Date(reportDate), 'dd MMM yyyy', { locale: th })}</div>
                    <div className="text-[8px] font-bold tracking-widest uppercase text-neutral-400 mt-1">Generated: {format(new Date(), 'HH:mm:ss')}</div>
                </div>
            </div>

            {/* Hero Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                <div className="border border-neutral-300 bg-white p-6 rounded-2xl flex flex-col justify-between">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Total Net Transfer</p>
                    <p className="text-3xl font-bold tracking-tight text-neutral-900">฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border border-neutral-300 bg-white p-6 rounded-2xl flex flex-col justify-between">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase text-neutral-400 mb-2">Total Transactions</p>
                    <p className="text-3xl font-bold tracking-tight text-neutral-900">{slips.length} <span className="text-xs font-normal text-neutral-400">Slips</span></p>
                </div>
            </div>

            {/* Transaction List */}
            <div className="border border-neutral-200 bg-white rounded-3xl p-6 md:p-8 space-y-4">
                 <div className="grid grid-cols-12 gap-4 pb-3 border-b border-neutral-200 text-[9px] font-bold tracking-widest uppercase text-neutral-400">
                    <div className="col-span-1">Time</div>
                    <div className="col-span-3">Sender (Customer)</div>
                    <div className="col-span-2">Staff (Uploader)</div>
                    <div className="col-span-1">Bank</div>
                    <div className="col-span-3">Ref Code</div>
                    <div className="col-span-2 text-right">Amount</div>
                </div>

                <div className="divide-y divide-neutral-100">
                    {slips.map((slip, i) => {
                        const { staffName, sender } = getSenderDisplay(slip);
                        return (
                            <div key={slip.id} className="grid grid-cols-12 gap-4 py-4 hover:bg-neutral-50 transition-colors items-center text-neutral-800 text-xs">
                                <div className="col-span-1 font-bold text-neutral-900">
                                    {format(new Date(slip.timestamp), 'HH:mm')}
                                </div>
                                <div className="col-span-3 font-bold text-neutral-800">
                                    {sender}
                                </div>
                                 <div className="col-span-2 text-[10px] uppercase font-bold tracking-tight text-neutral-500 whitespace-nowrap overflow-hidden text-ellipsis">
                                    {staffName}
                                </div>
                                <div className="col-span-1 text-[10px] uppercase text-neutral-500 font-medium">
                                    {slip.bank_name || "-"}
                                </div>
                                <div className="col-span-3 text-[9px] font-mono break-all leading-tight text-neutral-500">
                                    {slip.transaction_ref || "-"}
                                </div>
                                <div className="col-span-2 text-right font-bold text-neutral-950">
                                    {Number(slip.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>

            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-neutral-200">
                <div className="flex justify-between items-end flex-wrap gap-4">
                    <div className="max-w-sm">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-2 text-neutral-400">Verification & Archives</p>
                        <p className="text-[9px] leading-relaxed text-neutral-400">
                            This document is an automated summary of digital transfer slips processed by Yuzu AI for In The Haus. 
                            Values are extracted directly from bank-generated images.
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

export default function SlipPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-400 uppercase font-mono">Loading Report Engine...</div>}>
            <SlipPDFReportContent />
        </Suspense>
    );
}
