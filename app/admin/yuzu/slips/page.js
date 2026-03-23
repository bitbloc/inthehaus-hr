'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function SlipsAdmin() {
    const [slips, setSlips] = useState([]);
    const [loading, setLoading] = useState(true);
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    useEffect(() => {
        fetchSlips();
    }, [selectedDate]);

    async function fetchSlips() {
        setLoading(true);
        const { data, error } = await supabase
            .from('slip_transactions')
            .select('id, amount, slip_url, timestamp, is_deleted, employees(name, nickname)')
            .eq('is_deleted', false)
            .eq('date', selectedDate) // Filter by date column
            .order('timestamp', { ascending: false });
            
        if (!error && data) {
            setSlips(data);
        } else if (error) {
            console.error("Fetch error:", error);
        }
        setLoading(false);
    }

    async function handleDelete(id) {
        if (!confirm('ยืนยันการลบรายการนี้ใช่หรือไม่? (ยอดโอนนี้จะไม่แสดงในสรุป)')) return;
        
        const { error } = await supabase
            .from('slip_transactions')
            .update({ is_deleted: true })
            .eq('id', id);

        if (!error) {
            fetchSlips();
        } else {
            alert('เกิดข้อผิดพลาดในการลบ: ' + error.message);
        }
    }

    return (
        <div className="p-8 max-w-6xl mx-auto">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-6">
                <div>
                    <h1 className="text-4xl font-black flex items-center gap-3 tracking-tighter">
                        💸 SLIP MANAGEMENT
                    </h1>
                    <p className="text-gray-400 text-sm mt-1 uppercase tracking-widest font-bold">Yuzu Restaurant OS</p>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 bg-white p-2 rounded-2xl shadow-sm border border-gray-100">
                    <div className="flex items-center gap-2 pl-4">
                        <span className="text-xs font-bold uppercase text-gray-400 tracking-wider">เลือกวันที่:</span>
                        <input 
                            type="date" 
                            value={selectedDate}
                            onChange={(e) => setSelectedDate(e.target.value)}
                            className="bg-transparent font-bold text-gray-800 outline-none focus:ring-0 cursor-pointer"
                        />
                    </div>
                    
                    <a 
                        href={`/admin/yuzu/slips/report?date=${selectedDate}`} 
                        target="_blank"
                        className="bg-black text-white px-6 py-3 rounded-xl font-bold text-xs tracking-widest uppercase shadow-xl hover:bg-gray-800 transition-all flex items-center gap-2"
                    >
                        📥 PDF REPORT
                    </a>
                </div>
            </div>

            <div className="bg-white rounded-3xl shadow-2xl shadow-gray-200/50 border border-gray-100 overflow-hidden">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-50/50 border-b border-gray-100">
                            <th className="p-6 py-5 font-bold uppercase text-[10px] tracking-[0.2em] text-gray-400">Time</th>
                            <th className="p-6 py-5 font-bold uppercase text-[10px] tracking-[0.2em] text-gray-400">Staff</th>
                            <th className="p-6 py-5 font-bold uppercase text-[10px] tracking-[0.2em] text-gray-400">Amount (THB)</th>
                            <th className="p-6 py-5 font-bold uppercase text-[10px] tracking-[0.2em] text-gray-400">Evidence</th>
                            <th className="p-6 py-5 font-bold uppercase text-[10px] tracking-[0.2em] text-gray-400 text-center">Action</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="p-12 text-center text-gray-400 italic">กำลังดึงข้อมูลจากระบบ...</td>
                            </tr>
                        ) : slips.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-20 text-center">
                                    <p className="text-gray-300 font-bold uppercase tracking-widest mb-2 text-sm">No Transactions</p>
                                    <p className="text-gray-400 text-xs">ไม่พบข้อมูลสลิปในวันที่ {format(new Date(selectedDate), 'dd/MM/yyyy')}</p>
                                </td>
                            </tr>
                        ) : (
                            slips.map((slip) => (
                                <tr key={slip.id} className="hover:bg-gray-50/50 transition-colors group">
                                    <td className="p-6">
                                        <p className="font-bold text-gray-800">{format(new Date(slip.timestamp), 'HH:mm:ss')}</p>
                                        <p className="text-[10px] text-gray-400 uppercase font-mono">{format(new Date(slip.timestamp), 'dd MMM yyyy')}</p>
                                    </td>
                                    <td className="p-6 font-medium text-gray-600">
                                        {slip.employees?.nickname || slip.employees?.name || 'External'}
                                    </td>
                                    <td className="p-6">
                                        <span className="text-xl font-black tracking-tight text-gray-900">
                                            {Number(slip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}
                                        </span>
                                    </td>
                                    <td className="p-6">
                                        {slip.slip_url ? (
                                            <a href={slip.slip_url} target="_blank" rel="noreferrer" className="text-xs font-bold uppercase tracking-widest py-2 px-4 rounded-full bg-gray-100 text-gray-500 hover:bg-black hover:text-white transition-all">
                                                View Slip
                                            </a>
                                        ) : (
                                            <span className="text-gray-300">-</span>
                                        )}
                                    </td>
                                    <td className="p-6 text-center">
                                        <button 
                                            onClick={() => handleDelete(slip.id)}
                                            className="text-[10px] font-black uppercase tracking-widest text-red-300 hover:text-red-600 transition-colors"
                                        >
                                            Delete
                                        </button>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
