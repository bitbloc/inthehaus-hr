import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

export default function SwapRequestModal({ isOpen, onClose, currentUser, shiftDate, shiftData, employees, schedules, overrides, shifts }) {
    const [step, setStep] = useState(1);
    const [actionType, setActionType] = useState(null); // 'GIVE_AWAY' | 'TRADE'
    const [selectedPeer, setSelectedPeer] = useState(null);
    const [note, setNote] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    // --- Logic: Smart Peer Filtering ---
    // Refined Rules:
    // 1. Same Position Only
    // 2. Double Shift (ควบ) <-> Double Shift Only
    // 3. Single Shift (Morning/Evening) <-> Single Shift Only
    // 4. Must be working on that day (to trade) - Wait, for 'GIVE_AWAY' they should NOT be working?
    //    Actually, 'TRADE' means swapping shifts. 'GIVE_AWAY' means giving to someone who is OFF.
    //    The user prompt said "Swap date... Morning/Evening can mix... Double must swap with Double".
    //    This implies we are talking about TRADING shifts on the SAME day? Or swapping dates?
    //    "ระบบกะ Shift สามารถแลกกะในตำแหน่งเดียวกันได้ ... เลือกเอาว่าจะสลับวันไหน ... แต่ ควบกะต้องสลับกับแค่ควบกะ"
    //    Likely means: If I hold a Double Shift, I can only trade with someone holding a Double Shift.

    // Let's deduce "Is Double" from shift name
    const isDouble = (name) => name && (name.includes('ควบ') || name.toLowerCase().includes('double'));
    const userIsDouble = isDouble(shiftData.shift_name);

    const validPeers = employees.filter(emp => {
        if (emp.id === currentUser.id) return false;
        if (emp.position !== currentUser.position) return false;

        // Determine Peer's Shift
        let isPeerOff = true;
        let peerShiftDef = null;
        let peerShiftName = null;

        // 1. Check Override
        const override = overrides?.find(o => String(o.employee_id) === String(emp.id) && o.date === shiftDate);
        if (override) {
            if (!override.is_off) {
                isPeerOff = false;
                peerShiftDef = shifts?.find(sh => String(sh.id) === String(override.shift_id));
                peerShiftName = peerShiftDef?.name;
            }
        } else {
            // 2. Check Template
            const dayOfWeek = new Date(shiftDate).getDay();
            const schedule = schedules[emp.id]?.[dayOfWeek];
            if (schedule && !schedule.is_off) {
                isPeerOff = false;
                peerShiftDef = shifts?.find(sh => String(sh.id) === String(schedule.shift_id));
                peerShiftName = peerShiftDef?.name;
            }
        }

        // Logic based on Action Type
        if (actionType === 'GIVE_AWAY') {
            // A. Basic: Give to someone who is OFF
            if (isPeerOff) return true;

            // B. Advanced: Give to someone Working Single (Merge to Double)
            // Rule: Their shift must NOT overlap with mine, and they must NOT already be Double.
            const peerIsDouble = isDouble(peerShiftName);
            if (peerIsDouble) return false; // Prevent triple shift

            if (shiftData.start_time && shiftData.end_time && peerShiftDef) {
                const s1 = shiftData.start_time;
                const e1 = shiftData.end_time;
                const s2 = peerShiftDef.start_time;
                const e2 = peerShiftDef.end_time;

                // Overlap Check (String comparison works for HH:mm:ss)
                // Overlap if (Start1 < End2) and (Start2 < End1)
                if (s1 < e2 && s2 < e1) return false; // Overlap -> Conflict

                return true; // No Overlap -> Can Merge
            }
            return false;
        }

        if (actionType === 'TRADE') {
            if (isPeerOff) return false; // Trade requires swapping working days

            const peerIsDouble = isDouble(peerShiftName);
            if (userIsDouble) return peerIsDouble; // Double <-> Double
            return !peerIsDouble; // Single <-> Single
        }

        return false;
    });

    const handleSubmit = async () => {
        setIsLoading(true);
        try {
            const res = await fetch('/api/shift-swap/create', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    requester_id: currentUser.id,
                    target_date: shiftDate,
                    old_shift_id: shiftData.shift_id,
                    type: actionType,
                    target_peer_id: selectedPeer?.id || null, // Null for Pool
                    notes: note
                })
            });
            const data = await res.json();
            if (data.success) {
                alert('ส่งคำขอเรียบร้อยแล้ว!');
                onClose();
            } else {
                alert(data.error);
            }
        } catch (e) {
            alert('เกิดข้อผิดพลาดในการส่งคำขอ');
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-slate-900 w-full max-w-md rounded-[2rem] border border-indigo-900/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-950/60 p-5 border-b border-indigo-950 flex justify-between items-center">
                    <div>
                        <h3 className="font-extrabold text-slate-200 text-lg">จัดการกะงาน</h3>
                        <p className="text-xs text-indigo-400 font-bold mt-1">
                            {format(new Date(shiftDate), "EEEE dd MMM", { locale: th })} • {shiftData.shift_name}
                        </p>
                    </div>
                    <button onClick={onClose} className="bg-slate-800 text-slate-300 hover:text-white rounded-full w-8 h-8 font-bold flex items-center justify-center border border-indigo-900/20">×</button>
                </div>

                <div className="p-6 overflow-y-auto space-y-4">
                    {/* STEP 1: CONVERSATION - "What do you want to do?" */}
                    {step === 1 && (
                        <div className="space-y-4 animate-fade-in-up">
                            <h2 className="text-xl font-black text-slate-200 text-center mb-6">ต้องการทำอะไร?</h2>

                            <button
                                onClick={() => { setActionType('GIVE_AWAY'); setStep(2); }}
                                className="w-full bg-slate-950/40 hover:bg-indigo-950/30 border border-indigo-900/20 hover:border-indigo-500/30 p-6 rounded-2xl flex items-center gap-4 transition-all group text-left"
                            >
                                <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-full text-2xl shadow-sm group-hover:scale-110 transition">👋</div>
                                <div>
                                    <h4 className="font-bold text-slate-200">ยกกะให้คนอื่น</h4>
                                    <p className="text-xs text-slate-400 mt-1">มอบกะนี้ให้เพื่อนร่วมงาน (หรือเข้าตลาดกลาง)</p>
                                </div>
                            </button>

                            <button
                                onClick={() => { setActionType('TRADE'); setStep(2); }}
                                className="w-full bg-slate-950/40 hover:bg-indigo-950/30 border border-indigo-900/20 hover:border-indigo-500/30 p-6 rounded-2xl flex items-center gap-4 transition-all group text-left"
                            >
                                <div className="bg-indigo-500/10 border border-indigo-500/20 p-3 rounded-full text-2xl shadow-sm group-hover:scale-110 transition">🔄</div>
                                <div>
                                    <h4 className="font-bold text-slate-200">แลกกะ</h4>
                                    <p className="text-xs text-slate-400 mt-1">สลับวันทำงานกับเพื่อน</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* STEP 2: WHO? */}
                    {step === 2 && (
                        <div className="space-y-4 animate-fade-in-up">
                            <h2 className="text-lg font-black text-slate-200 text-center">
                                {actionType === 'GIVE_AWAY' ? 'ยกให้ใคร?' : 'แลกกับใคร?'}
                            </h2>

                            {/* Option: Open Pool (Only for Give Away) */}
                            {actionType === 'GIVE_AWAY' && (
                                <button
                                    onClick={() => setSelectedPeer(null)}
                                    className={`w-full p-4 rounded-xl border flex items-center justify-between transition-all ${
                                        selectedPeer === null 
                                            ? 'bg-gradient-to-r from-indigo-500 to-indigo-650 text-white border-indigo-400/20 shadow-lg' 
                                            : 'bg-slate-950/40 border-indigo-900/20 text-slate-300 hover:border-indigo-500/30'
                                    }`}
                                >
                                    <div className="flex items-center gap-3">
                                        <span className="text-xl">🌐</span>
                                        <div className="text-left">
                                            <div className="font-bold text-sm">ตลาดกลาง (Open Pool)</div>
                                            <div className="text-[10px] opacity-80">ประกาศให้ทุกคนทราบ</div>
                                        </div>
                                    </div>
                                    {selectedPeer === null && <span>✓</span>}
                                </button>
                            )}

                            {/* Peer List */}
                            <div className="max-h-60 overflow-y-auto space-y-2 pr-1">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest sticky top-0 bg-slate-900 py-2">เพื่อนที่ว่าง</p>
                                {validPeers.map(peer => (
                                    <button
                                        key={peer.id}
                                        onClick={() => setSelectedPeer(peer)}
                                        className={`w-full p-3.5 rounded-xl border flex items-center gap-3 transition-all ${
                                            selectedPeer?.id === peer.id 
                                                ? 'bg-gradient-to-r from-indigo-500 to-indigo-650 text-white border-indigo-400/20 shadow-md' 
                                                : 'bg-slate-950/40 border-indigo-900/20 text-slate-300 hover:border-indigo-500/30'
                                        }`}
                                    >
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                                            selectedPeer?.id === peer.id 
                                                ? 'bg-white/20' 
                                                : 'bg-indigo-500/10 border border-indigo-500/20 text-indigo-400'
                                        }`}>
                                            {peer.name.charAt(0)}
                                        </div>
                                        <span className="font-bold text-sm">{peer.name} {peer.nickname ? `(${peer.nickname})` : ''}</span>
                                    </button>
                                ))}
                                {validPeers.length === 0 && <p className="text-center text-xs text-slate-500 font-bold py-6 bg-slate-950/20 rounded-xl border border-indigo-900/10">ไม่มีเพื่อนว่างในวันนี้</p>}
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button onClick={() => setStep(1)} className="px-4 py-2 text-slate-400 font-bold text-sm hover:text-white">กลับ</button>
                                <button
                                    onClick={() => setStep(3)}
                                    disabled={actionType === 'TRADE' && !selectedPeer}
                                    className="flex-1 bg-gradient-to-r from-indigo-500 to-indigo-650 text-white rounded-xl font-black py-3 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg"
                                >
                                    ถัดไป
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: CONFIRM */}
                    {step === 3 && (
                        <div className="space-y-5 animate-fade-in-up">
                            <h2 className="text-lg font-black text-slate-200 text-center">ยืนยันคำขอ</h2>

                            <div className="bg-slate-950/40 p-5 rounded-2xl border border-indigo-900/20 space-y-4">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-medium">จาก</span>
                                    <span className="font-bold text-slate-200">{currentUser.name} (คุณ)</span>
                                </div>
                                <div className="flex justify-center text-slate-500 transform rotate-90 sm:rotate-0">➜</div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-medium">ถึง</span>
                                    <span className="font-bold text-slate-200">{selectedPeer ? selectedPeer.name : 'ตลาดกลาง (ทุกคน)'}</span>
                                </div>
                                <div className="border-t border-indigo-950/50 pt-3.5 flex justify-between items-center text-sm">
                                    <span className="text-slate-400 font-medium">การดำเนินการ</span>
                                    <span className={`font-black px-2.5 py-0.5 rounded-full text-[10px] border ${
                                        actionType === 'GIVE_AWAY' 
                                            ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' 
                                            : 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20'
                                    }`}>
                                        {actionType === 'GIVE_AWAY' ? 'ยกให้' : 'แลกเปลี่ยน'}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">หมายเหตุ (ไม่บังคับ)</label>
                                <textarea
                                    className="w-full p-3.5 border border-indigo-900/30 rounded-2xl bg-slate-950/40 text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition font-medium text-sm placeholder:text-slate-650"
                                    rows="2"
                                    placeholder="เช่น ไปหาหมอฟัน..."
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                ></textarea>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setStep(2)} className="px-4 py-3 text-slate-400 font-bold text-sm hover:text-white">กลับ</button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isLoading}
                                    className="flex-1 bg-gradient-to-r from-indigo-500 to-indigo-650 text-white rounded-xl font-black py-3.5 shadow-lg shadow-indigo-500/20 hover:from-indigo-600 hover:to-indigo-700 transition flex justify-center"
                                >
                                    {isLoading ? 'กำลังส่ง...' : 'ยืนยันคำขอ'}
                                </button>
                            </div>
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
