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

    useEffect(() => {
        fetchSlips();
    }, []);

    async function fetchSlips() {
        setLoading(true);
        const { data, error } = await supabase
            .from('slip_transactions')
            .select('id, amount, slip_url, timestamp, is_deleted, employees(name, nickname)')
            .eq('is_deleted', false)
            .order('timestamp', { ascending: false })
            .limit(100);
            
        if (!error && data) {
            setSlips(data);
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
            <div className="flex justify-between items-center mb-6">
                <h1 className="text-3xl font-bold flex items-center gap-2">
                    💸 จัดการสลิปโอนเงิน (Yuzu Slips)
                </h1>
                <a 
                    href="/admin/yuzu/slips/report" 
                    target="_blank"
                    className="bg-orange-600 text-white px-4 py-2 rounded-lg font-medium shadow-md hover:bg-orange-700 transition"
                >
                    📥 ดาวน์โหลด PDF สรุปวันนี้
                </a>
            </div>

            <div className="bg-white rounded-xl shadow-lg border overflow-hidden mt-4">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="bg-gray-100 border-b">
                            <th className="p-4 py-3 font-semibold text-gray-700">วันที่ / เวลา</th>
                            <th className="p-4 py-3 font-semibold text-gray-700">พนักงาน</th>
                            <th className="p-4 py-3 font-semibold text-gray-700">ยอดเงิน (บาท)</th>
                            <th className="p-4 py-3 font-semibold text-gray-700">ภาพสลิป</th>
                            <th className="p-4 py-3 font-semibold text-gray-700 text-center">จัดการ</th>
                        </tr>
                    </thead>
                    <tbody>
                        {loading ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-gray-500">กำลังโหลดข้อมูล...</td>
                            </tr>
                        ) : slips.length === 0 ? (
                            <tr>
                                <td colSpan="5" className="p-8 text-center text-gray-500">ยังไม่มีข้อมูลสลิปที่ถูกบันทึก</td>
                            </tr>
                        ) : (
                            slips.map((slip) => (
                                <tr key={slip.id} className="border-b hover:bg-gray-50">
                                    <td className="p-4">
                                        {format(new Date(slip.timestamp), 'dd/MM/yyyy HH:mm:ss')}
                                    </td>
                                    <td className="p-4">
                                        {slip.employees?.nickname || slip.employees?.name || 'ไม่ระบุ'}
                                    </td>
                                    <td className="p-4 font-bold text-green-600">
                                        {Number(slip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}
                                    </td>
                                    <td className="p-4">
                                        {slip.slip_url ? (
                                            <a href={slip.slip_url} target="_blank" rel="noreferrer" className="text-blue-500 hover:underline flex items-center gap-1">
                                                <span>ดูภาพ</span>
                                            </a>
                                        ) : (
                                            <span className="text-gray-400">-</span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center">
                                        <button 
                                            onClick={() => handleDelete(slip.id)}
                                            className="text-red-500 hover:text-red-700 font-medium px-3 py-1 bg-red-50 rounded hover:bg-red-100 transition"
                                        >
                                            ลบ
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
