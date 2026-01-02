import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { th } from 'date-fns/locale';

export default function SwapRequestModal({ isOpen, onClose, currentUser, shiftDate, shiftData, employees, schedules, overrides }) {
    const [step, setStep] = useState(1);
    const [actionType, setActionType] = useState(null); // 'GIVE_AWAY' | 'TRADE'
    const [selectedPeer, setSelectedPeer] = useState(null);
    const [note, setNote] = useState('');
    const [isLoading, setIsLoading] = useState(false);

    if (!isOpen) return null;

    // --- Logic: Smart Peer Filtering ---
    // Filter out peers who:
    // 1. Are the current user
    // 2. Are already working that day (Check Template + Overrides)
    // 3. (Optional) Don't have matching Role/Position (Skipped for MVP)
    const validPeers = employees.filter(emp => {
        if (emp.id === currentUser.id) return false;

        // Restriction: Must be same position
        if (emp.position !== currentUser.position) return false;

        // Check Override First
        const override = overrides?.find(o => String(o.employee_id) === String(emp.id) && o.date === shiftDate);
        if (override) {
            return override.is_off; // If OFF, they are available.
        }

        // Check Template
        const dayOfWeek = new Date(shiftDate).getDay();
        const schedule = schedules[emp.id]?.[dayOfWeek];
        if (schedule && !schedule.is_off) {
            return false; // Scheduled to work
        }

        return true;
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
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="bg-slate-50 p-4 border-b border-slate-100 flex justify-between items-center">
                    <div>
                        <h3 className="font-bold text-slate-800 text-lg">จัดการกะงาน</h3>
                        <p className="text-xs text-slate-500">{format(new Date(shiftDate), "EEEE dd MMM", { locale: th })} • {shiftData.shift_name}</p>
                    </div>
                    <button onClick={onClose} className="bg-slate-200 text-slate-500 rounded-full w-8 h-8 font-bold">×</button>
                </div>

                <div className="p-6 overflow-y-auto">
                    {/* STEP 1: CONVERSATION - "What do you want to do?" */}
                    {step === 1 && (
                        <div className="space-y-4 animate-fade-in-up">
                            <h2 className="text-2xl font-bold text-slate-700 text-center">ต้องการทำอะไร?</h2>

                            <button
                                onClick={() => { setActionType('GIVE_AWAY'); setStep(2); }}
                                className="w-full bg-orange-50 hover:bg-orange-100 border border-orange-100 p-6 rounded-2xl flex items-center gap-4 transition group"
                            >
                                <div className="bg-white p-3 rounded-full text-2xl shadow-sm group-hover:scale-110 transition">👋</div>
                                <div className="text-left">
                                    <h4 className="font-bold text-orange-800">ยกกะให้คนอื่น</h4>
                                    <p className="text-xs text-orange-600/80">มอบกะนี้ให้เพื่อนร่วมงาน (หรือเข้าตลาดกลาง)</p>
                                </div>
                            </button>

                            <button
                                onClick={() => { setActionType('TRADE'); setStep(2); }}
                                className="w-full bg-blue-50 hover:bg-blue-100 border border-blue-100 p-6 rounded-2xl flex items-center gap-4 transition group"
                            >
                                <div className="bg-white p-3 rounded-full text-2xl shadow-sm group-hover:scale-110 transition">🔄</div>
                                <div className="text-left">
                                    <h4 className="font-bold text-blue-800">แลกกะ</h4>
                                    <p className="text-xs text-blue-600/80">สลับวันทำงานกับเพื่อน</p>
                                </div>
                            </button>
                        </div>
                    )}

                    {/* STEP 2: WHO? */}
                    {step === 2 && (
                        <div className="space-y-4 animate-fade-in-up">
                            <h2 className="text-xl font-bold text-slate-700 text-center">
                                {actionType === 'GIVE_AWAY' ? 'ยกให้ใคร?' : 'แลกกับใคร?'}
                            </h2>

                            {/* Option: Open Pool (Only for Give Away) */}
                            {actionType === 'GIVE_AWAY' && (
                                <button
                                    onClick={() => setSelectedPeer(null)}
                                    className={`w-full p-4 rounded-xl border flex items-center justify-between transition ${selectedPeer === null ? 'bg-slate-800 text-white border-slate-800 shadow-lg' : 'bg-white border-slate-200 hover:border-slate-400'}`}
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
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider sticky top-0 bg-white py-1">เพื่อนที่ว่าง</p>
                                {validPeers.map(peer => (
                                    <button
                                        key={peer.id}
                                        onClick={() => setSelectedPeer(peer)}
                                        className={`w-full p-3 rounded-xl border flex items-center gap-3 transition ${selectedPeer?.id === peer.id ? 'bg-slate-800 text-white border-slate-800 shadow-md' : 'bg-white border-slate-100 hover:bg-slate-50'}`}
                                    >
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${selectedPeer?.id === peer.id ? 'bg-white/20' : 'bg-slate-200 text-slate-500'}`}>
                                            {peer.name.charAt(0)}
                                        </div>
                                        <span className="font-bold text-sm">{peer.name}</span>
                                    </button>
                                ))}
                                {validPeers.length === 0 && <p className="text-center text-xs text-slate-400 py-4">ไม่มีเพื่อนว่างในวันนี้</p>}
                            </div>

                            <div className="pt-4 flex gap-3">
                                <button onClick={() => setStep(1)} className="px-4 py-2 text-slate-400 font-bold text-sm hover:text-slate-600">กลับ</button>
                                <button
                                    onClick={() => setStep(3)}
                                    disabled={actionType === 'TRADE' && !selectedPeer}
                                    className="flex-1 bg-slate-800 text-white rounded-xl font-bold py-3 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    ถัดไป
                                </button>
                            </div>
                        </div>
                    )}

                    {/* STEP 3: CONFIRM */}
                    {step === 3 && (
                        <div className="space-y-6 animate-fade-in-up">
                            <h2 className="text-xl font-bold text-slate-700 text-center">ยืนยันคำขอ</h2>

                            <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 space-y-3">
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">จาก</span>
                                    <span className="font-bold text-slate-700">{currentUser.name} (คุณ)</span>
                                </div>
                                <div className="flex justify-center text-slate-300 transform rotate-90 sm:rotate-0">➜</div>
                                <div className="flex justify-between items-center text-sm">
                                    <span className="text-slate-500">ถึง</span>
                                    <span className="font-bold text-slate-700">{selectedPeer ? selectedPeer.name : 'ตลาดกลาง (ทุกคน)'}</span>
                                </div>
                                <div className="border-t border-slate-200 pt-3 flex justify-between items-center text-sm">
                                    <span className="text-slate-500">การดำเนินการ</span>
                                    <span className={`font-bold px-2 py-0.5 rounded text-xs ${actionType === 'GIVE_AWAY' ? 'bg-orange-100 text-orange-700' : 'bg-blue-100 text-blue-700'}`}>
                                        {actionType === 'GIVE_AWAY' ? 'ยกให้' : 'แลกเปลี่ยน'}
                                    </span>
                                </div>
                            </div>

                            <div>
                                <label className="block text-xs font-bold text-slate-400 mb-1">หมายเหตุ (ไม่บังคับ)</label>
                                <textarea
                                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-sm outline-none focus:ring-2 focus:ring-slate-800"
                                    rows="2"
                                    placeholder="เช่น ไปหาหมอฟัน..."
                                    value={note}
                                    onChange={e => setNote(e.target.value)}
                                ></textarea>
                            </div>

                            <div className="flex gap-3">
                                <button onClick={() => setStep(2)} className="px-4 py-3 text-slate-400 font-bold text-sm hover:text-slate-600">กลับ</button>
                                <button
                                    onClick={handleSubmit}
                                    disabled={isLoading}
                                    className="flex-1 bg-slate-800 text-white rounded-xl font-bold py-3 shadow-lg hover:bg-slate-900 transition flex justify-center"
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
