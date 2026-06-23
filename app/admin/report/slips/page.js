"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "../../../../lib/supabaseClient";
import { format, addHours, startOfDay, endOfDay } from "date-fns";
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

    if (loading) return <div className="p-20 text-center font-bold tracking-widest text-slate-300">GENERATING REPORT...</div>;

    return (
        <div className="min-h-screen bg-white text-black p-8 md:p-16 font-mono selection:bg-black selection:text-white">
            {/* Header */}
            <div className="flex justify-between items-center border-b-2 border-black pb-8 mb-12">
                <div className="flex items-center gap-4">
                    <img src="/logo.png" className="h-12 w-auto object-contain" alt="In The Haus Logo" onError={(e) => e.target.style.display = 'none'} />
                    <div>
                        <h1 className="text-2xl font-bold tracking-widest leading-none mb-1">IN THE HAUS</h1>
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-60">Transfer Slips Summary Report</p>
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-bold tracking-tight">{format(new Date(reportDate), 'dd MMM yyyy', { locale: th })}</div>
                    <div className="text-[9px] font-bold tracking-widest uppercase opacity-50">Report Generated: {format(new Date(), 'HH:mm:ss')}</div>
                </div>
            </div>

            {/* Hero Stats */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                <div className="border-2 border-black p-6 bg-white rounded-none">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-50 mb-2">Total Net Transfer</p>
                    <p className="text-3xl font-bold tracking-tight">฿{totalAmount.toLocaleString('th-TH', { minimumFractionDigits: 2 })}</p>
                </div>
                <div className="border-2 border-black p-6 bg-white rounded-none">
                    <p className="text-[9px] font-bold tracking-[0.2em] uppercase opacity-50 mb-2">Total Transactions</p>
                    <p className="text-3xl font-bold tracking-tight">{slips.length}</p>
                </div>
            </div>

            {/* Transaction List */}
            <div className="space-y-1">
                 <div className="grid grid-cols-12 gap-4 pb-3 border-b border-black text-[9px] font-bold tracking-widest uppercase opacity-60">
                    <div className="col-span-1">Time</div>
                    <div className="col-span-3">Sender (Customer)</div>
                    <div className="col-span-2">Staff (Uploader)</div>
                    <div className="col-span-1">Bank</div>
                    <div className="col-span-3">Ref Code</div>
                    <div className="col-span-2 text-right">Amount</div>
                </div>

                {slips.map((slip, i) => {
                    const { staffName, sender } = getSenderDisplay(slip);
                    return (
                        <div key={slip.id} className="grid grid-cols-12 gap-4 py-4 border-b border-black/10 hover:bg-slate-50 transition-colors items-center text-black text-xs">
                            <div className="col-span-1 font-bold text-black">
                                {format(new Date(slip.timestamp), 'HH:mm')}
                            </div>
                            <div className="col-span-3 font-bold">
                                {sender}
                            </div>
                             <div className="col-span-2 text-[10px] uppercase font-bold tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
                                {staffName}
                            </div>
                            <div className="col-span-1 text-[10px] uppercase">
                                {slip.bank_name || "-"}
                            </div>
                            <div className="col-span-3 text-[9px] break-all leading-tight">
                                {slip.transaction_ref || "-"}
                            </div>
                            <div className="col-span-2 text-right font-bold">
                                {Number(slip.amount).toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Footer */}
            <div className="mt-20 pt-8 border-t border-black/20">
                <div className="flex justify-between items-end">
                    <div className="max-w-sm">
                        <p className="text-[9px] font-bold tracking-[0.2em] uppercase mb-3 opacity-50">Verification</p>
                        <p className="text-[9px] leading-relaxed opacity-50">
                            This document is an automated summary of digital transfer slips processed by Yuzu AI for In The Haus. 
                            Values are extracted directly from bank-generated images.
                        </p>
                    </div>
                    <div className="text-right">
                        <p className="text-[10px] font-bold italic tracking-widest uppercase">YUZU x IN THE HAUS</p>
                        <p className="text-[9px] font-bold opacity-30">© {new Date().getFullYear()} All Rights Reserved</p>
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
                className="fixed bottom-8 right-8 no-print bg-black border border-black text-white px-8 py-4 rounded-none font-bold text-xs tracking-widest uppercase hover:bg-white hover:text-black transition-all cursor-pointer shadow-none"
            >
                Print to PDF
            </button>
        </div>
    );
}

export default function SlipPDFReport() {
    return (
        <Suspense fallback={<div className="p-20 text-center font-bold tracking-widest text-slate-300 uppercase">Loading Report Engine...</div>}>
            <SlipPDFReportContent />
        </Suspense>
    );
}
