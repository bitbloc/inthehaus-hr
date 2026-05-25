import { useState, useEffect } from 'react';
import { format, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { supabase } from '../../lib/supabaseClient';

export default function Marketplace({ currentUser, initialRequests }) {
    const [requests, setRequests] = useState(initialRequests || []);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
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
            alert('เกิดข้อผิดพลาดในการรับกะงาน');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-4">
            <h3 className="font-extrabold text-sm text-slate-300 tracking-wide uppercase flex items-center gap-2">
                🌐 ตลาดแลกกะ
                <span className="bg-indigo-500/15 text-indigo-400 text-[10px] px-2 py-0.5 rounded-full font-black border border-indigo-500/20">{requests.length}</span>
            </h3>

            {requests.length === 0 ? (
                <div className="bg-slate-950/20 border border-indigo-900/10 p-8 rounded-2xl text-center">
                    <p className="text-slate-500 text-xs font-semibold">ไม่มีกะว่างให้แลก</p>
                    <p className="text-[10px] text-slate-650 mt-1 font-semibold">พักผ่อนให้เต็มที่!</p>
                </div>
            ) : (
                <div className="grid grid-cols-1 gap-4">
                    {requests.map(req => (
                        <div key={req.id} className="bg-slate-950/30 border border-indigo-900/10 p-5 rounded-2xl hover:border-indigo-500/30 transition-all duration-300 flex flex-col justify-between shadow-md group">
                            <div>
                                <div className="flex justify-between items-start mb-3">
                                    <div className="flex items-center gap-3">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-lg shadow-inner">
                                            {req.type === 'GIVE_AWAY' ? '👋' : '🔄'}
                                        </div>
                                        <div>
                                            <p className="font-bold text-slate-200">{req.requester?.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold">ตำแหน่ง: {req.requester?.position || 'Staff'}</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <p className="font-black text-slate-200 text-lg">{format(parseISO(req.target_date), "d MMM", { locale: th })}</p>
                                        <p className="text-[10px] text-indigo-400 font-black uppercase tracking-wider">{format(parseISO(req.target_date), "EEEE", { locale: th })}</p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-2 mb-3">
                                    {req.type === 'GIVE_AWAY' ? (
                                        <span className="bg-amber-500/10 text-amber-400 border border-amber-500/25 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">ยกให้ (GIVE AWAY)</span>
                                    ) : (
                                        <span className="bg-indigo-500/10 text-indigo-400 border border-indigo-500/25 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider">แลกกะ (TRADE)</span>
                                    )}
                                </div>

                                <div className="bg-slate-900/80 p-3.5 rounded-xl border border-indigo-900/20 mb-4">
                                    <div className="flex justify-between items-center mb-1.5">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">กะงาน</span>
                                        <span className="text-xs font-bold text-slate-200">{req.shift?.name}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">เวลา</span>
                                        <span className="text-xs font-mono font-bold text-indigo-300">{req.shift?.start_time.slice(0, 5)} - {req.shift?.end_time.slice(0, 5)}</span>
                                    </div>
                                </div>

                                {req.notes && (
                                    <p className="text-xs text-slate-400 font-medium italic mb-4 pl-1 border-l-2 border-indigo-500/30">"{req.notes}"</p>
                                )}
                            </div>

                            <button
                                onClick={() => handleAccept(req.id)}
                                disabled={isLoading || req.requester_id === currentUser.id}
                                className={`w-full py-3.5 rounded-xl font-black text-xs transition-all shadow-lg active:scale-[0.98] ${
                                    req.requester_id === currentUser.id
                                        ? 'bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700/50 shadow-none'
                                        : 'bg-gradient-to-r from-indigo-500 to-indigo-650 text-white hover:from-indigo-600 hover:to-indigo-700 shadow-indigo-500/20'
                                }`}
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
