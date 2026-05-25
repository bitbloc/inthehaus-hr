import { useState } from 'react';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isToday } from 'date-fns';
import { th } from 'date-fns/locale';
import SwapRequestModal from './SwapRequestModal';
import { getEffectiveDailyRoster } from '../../utils/roster_logic';

export default function MyShifts({ currentUser, employees, schedules, shifts, overrides, requests, leaveRequests = [] }) {
    const [selectedDate] = useState(new Date());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);

    const days = eachDayOfInterval({
        start: startOfMonth(selectedDate),
        end: endOfMonth(selectedDate)
    });

    const handleSwapClick = (dateStr, shift) => {
        setModalData({ date: dateStr, shift });
        setIsModalOpen(true);
    };

    return (
        <div className="bg-slate-950/40 backdrop-blur-md border border-indigo-900/30 rounded-[2rem] shadow-2xl shadow-indigo-950/20 overflow-hidden">
            <div className="p-6 border-b border-indigo-950/50 flex justify-between items-center">
                <h3 className="font-extrabold text-sm text-slate-300 tracking-wide uppercase">📅 ตารางของฉัน</h3>
                <div className="text-xs font-black tracking-widest uppercase text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                    {format(selectedDate, "MMMM yyyy", { locale: th })}
                </div>
            </div>

            <div className="divide-y divide-indigo-950/30">
                {days.map(day => {
                    const dateStr = format(day, "yyyy-MM-dd");

                    // 1. Calculate Effective Roster for THIS user on THIS day
                    const dailyRoster = getEffectiveDailyRoster([currentUser], schedules, overrides, shifts, day);
                    const myShift = dailyRoster.find(r => String(r.employee.id) === String(currentUser.id));

                    // 2. Check for Pending Swap Requests on this day
                    const pendingReq = requests.find(r => r.target_date === dateStr && r.status !== 'REJECTED' && r.status !== 'CANCELLED');

                    // 3. Check for Leave Requests on this day
                    const myLeave = leaveRequests.find(l => String(l.employee_id) === String(currentUser.id) && l.leave_date === dateStr);

                    const isWork = !!myShift;
                    const isPast = day < new Date().setHours(0, 0, 0, 0);
                    const hasLeave = !!myLeave;

                    // Hide day if not working, no swap request, and no leave request
                    if (!isWork && !pendingReq && !hasLeave) return null;

                    // Create Leave Badge element
                    let leaveBadge = null;
                    if (hasLeave) {
                        const typeEmojiLabel = myLeave.leave_type === 'sick' ? 'ลาป่วย 😷' : myLeave.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️';
                        const statusLabel = myLeave.status === 'approved' ? 'อนุมัติแล้ว' : 'รออนุมัติ';
                        const statusColor = myLeave.status === 'approved' 
                            ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25' 
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/25';
                        
                        leaveBadge = (
                            <div className="mt-1.5 flex flex-col gap-1.5">
                                <div className={`inline-flex items-center gap-1.5 text-[10px] font-black px-2.5 py-0.5 rounded-full border ${statusColor} w-max`}>
                                    <span>{typeEmojiLabel} ({statusLabel})</span>
                                </div>
                                {myLeave.replacement_employee && (
                                    <div className="text-[10px] text-indigo-400 flex items-center gap-1 font-bold">
                                        <span>👤 คนแทน:</span>
                                        <span className="bg-indigo-950/50 border border-indigo-900/30 px-1.5 py-0.5 rounded-md text-slate-300">
                                            {myLeave.replacement_employee.name} {myLeave.replacement_employee.nickname ? `(${myLeave.replacement_employee.nickname})` : ""}
                                        </span>
                                    </div>
                                )}
                            </div>
                        );
                    }

                    return (
                        <div key={dateStr} className={`p-4 flex items-center justify-between hover:bg-slate-900/20 transition-all ${isToday(day) ? 'bg-indigo-950/20 border-y border-indigo-500/20' : ''}`}>
                            <div className="flex items-center gap-4">
                                <div className={`text-center min-w-[50px] ${isToday(day) ? 'text-indigo-400' : 'text-slate-300'}`}>
                                    <div className="text-[10px] font-bold uppercase">{format(day, "EEE", { locale: th })}</div>
                                    <div className="text-xl font-black">{format(day, "d")}</div>
                                </div>

                                <div>
                                    {isWork ? (
                                        <>
                                            <div className="font-extrabold text-sm text-slate-200 flex items-center gap-2">
                                                {myShift.shift_name}
                                                {myShift.source === 'OVERRIDE' && (
                                                    <span className="bg-purple-500/25 text-purple-400 text-[9px] px-2 py-0.5 rounded-full font-black border border-purple-500/25">สลับกะ</span>
                                                )}
                                            </div>
                                            <div className="text-xs font-mono font-bold text-slate-400 mt-0.5">
                                                {(myShift.start_time || '').slice(0, 5)} - {(myShift.end_time || '').slice(0, 5)}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-sm font-extrabold text-slate-500">
                                            {hasLeave && myLeave.status === 'approved' ? 'หยุด (ลาหยุด)' : 'หยุด'}
                                        </div>
                                    )}

                                    {/* Leave Badge */}
                                    {leaveBadge}

                                    {/* Swap Request Status Indicator */}
                                    {pendingReq && (
                                        <div className="mt-1.5 flex items-center gap-1.5">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
                                            <span className="text-[10px] font-black text-amber-400 uppercase tracking-wider">
                                                ขอสลับ: {pendingReq.status === 'PENDING_PEER' ? 'รอเพื่อนตกลง' : 'รอผู้จัดการอนุมัติ'}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            {!isPast && isWork && !pendingReq && !hasLeave && (
                                <button
                                    onClick={() => handleSwapClick(dateStr, myShift)}
                                    className="px-4 py-2 border border-indigo-900/50 rounded-xl text-indigo-400 text-xs font-black hover:bg-indigo-500 hover:text-white transition-all shadow-sm active:scale-95"
                                >
                                    แลกเปลี่ยน
                                </button>
                            )}
                        </div>
                    );
                })}
                {days.every(d => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const dailyRoster = getEffectiveDailyRoster([currentUser], schedules, overrides, shifts, d);
                    const myShift = dailyRoster.find(r => String(r.employee.id) === String(currentUser.id));
                    const myLeave = leaveRequests.find(l => String(l.employee_id) === String(currentUser.id) && l.leave_date === dateStr);
                    return !myShift && !myLeave;
                }) && (
                    <div className="p-8 text-center text-slate-500 font-bold text-xs">
                        ไม่มีกะงานหรือวันลาในเดือนนี้
                    </div>
                )}
            </div>

            {/* Swap Request Modal */}
            {isModalOpen && modalData && (
                <SwapRequestModal
                    isOpen={isModalOpen}
                    onClose={() => { setIsModalOpen(false); setModalData(null); }}
                    currentUser={currentUser}
                    shiftDate={modalData.date}
                    shiftData={modalData.shift}
                    employees={employees}
                    schedules={schedules}
                    overrides={overrides}
                    shifts={shifts}
                />
            )}
        </div>
    );
}
