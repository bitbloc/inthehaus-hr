import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '../../lib/supabaseClient';

export default function Marketplace({ currentUser, initialRequests }) {
    const [requests, setRequests] = useState(initialRequests || []);
    const [isLoading, setIsLoading] = useState(false);

    // Real-time Subscription could go here
    useEffect(() => {
        // Simple fetch for now
        fetchRequests();
    }, []);

    const fetchRequests = async () => {
        const { data } = await supabase
            .from('shift_swap_requests')
            .select(`
                *,
                requester:employees!requester_id(name, position),
                shift:shifts!old_shift_id(name, start_time, end_time)
            `)
            .eq('status', 'PENDING_PEER')
            .is('target_peer_id', null) // Only Open Pool
            .order('target_date', { ascending: true });
        setRequests(data || []);
    };

    const handleAccept = async (reqId) => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/shift-swap/respond', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    request_id: reqId,
                    responder_id: currentUser.id,
                    action: 'ACCEPT'
                })
            });
            const data = await res.json();
            if (data.success) {
                alert("คุณได้รับกะงานแล้ว! รอหัวหน้าอนุมัติ");
                fetchRequests();
            } else {
                alert(data.error);
            }
        } catch (e) {
            alert('Error');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="font-bold text-slate-700 text-lg flex items-center gap-2">
                🌐 ตลาดแลกกะ
                <span className="bg-slate-200 text-slate-600 text-[10px] px-2 py-0.5 rounded-full">{requests.length}</span>
            </h3>

            {requests.length === 0 ? (
                <div className="bg-slate-50 p-8 rounded-3xl text-center border border-slate-100 border-dashed">
                    <p className="text-stone-400 font-bold mb-1">ไม่มีกะว่างให้แลก</p>
                    <p className="text-xs text-stone-300">พักผ่อนให้เต็มที่!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {requests.map(req => (
                        <div key={req.id} className="bg-white p-5 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition group">
                            <div className="flex justify-between items-start mb-3">
                                <div className="flex items-center gap-3">
                                    <div className="w-10 h-10 rounded-full bg-orange-100 flex items-center justify-center text-lg shadow-inner">
                                        👋
                                    </div>
                                    <div>
                                        <p className="font-bold text-slate-700">{req.requester?.name}</p>
                                        <p className="text-xs text-slate-400">ตำแหน่ง: {req.requester?.position || 'Staff'}</p>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <p className="font-bold text-slate-800 text-lg">{format(parseISO(req.target_date), "d MMM", { locale: th })}</p>
                                    <p className="text-xs text-red-500 font-bold uppercase">{format(parseISO(req.target_date), "EEEE", { locale: th })}</p>
                                </div>
                            </div>

                            <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 mb-4">
                                <div className="flex justify-between items-center mb-1">
                                    <span className="text-xs font-bold text-slate-500 uppercase">กะงาน</span>
                                    <span className="text-xs font-bold text-slate-700">{req.shift?.name}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-xs font-bold text-slate-500 uppercase">เวลา</span>
                                    <span className="text-xs font-mono text-slate-600">{req.shift?.start_time} - {req.shift?.end_time}</span>
                                </div>
                            </div>

                            {req.notes && (
                                <p className="text-xs text-slate-500 italic mb-4">"{req.notes}"</p>
                            )}

                            <button
                                onClick={() => handleAccept(req.id)}
                                disabled={isLoading || req.requester_id === currentUser.id}
                                className="w-full bg-slate-800 text-white font-bold py-3 rounded-xl hover:bg-slate-900 transition disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-slate-200"
                            >
                                {req.requester_id === currentUser.id ? 'คำขอของคุณ' : 'รับกะงาน'}
                            </button>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}
