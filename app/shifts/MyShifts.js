import { useState, useEffect } from 'react';
import { startOfMonth, endOfMonth, eachDayOfInterval, format, isSameDay, parseISO, isToday } from 'date-fns';
import SwapRequestModal from './SwapRequestModal';
import { getEffectiveDailyRoster } from '../../utils/roster_logic';

export default function MyShifts({ currentUser, employees, schedules, shifts, overrides, requests }) {
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [modalData, setModalData] = useState(null);

    // Generate Calendar Days for current month view
    // (Simplified: Just showing 2 weeks or current month)
    const days = eachDayOfInterval({
        start: startOfMonth(selectedDate),
        end: endOfMonth(selectedDate)
    });

    const handleSwapClick = (dateStr, shift) => {
        setModalData({ date: dateStr, shift });
        setIsModalOpen(true);
    };

    return (
        <div className="bg-white rounded-3xl shadow-sm border border-slate-100 overflow-hidden">
            <div className="p-6 border-b border-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-lg text-slate-700">📅 My Schedule</h3>
                <div className="text-xs font-bold text-slate-400 uppercase">{format(selectedDate, "MMMM yyyy")}</div>
            </div>

            <div className="divide-y divide-slate-50">
                {days.map(day => {
                    const dateStr = format(day, "yyyy-MM-dd");

                    // 1. Calculate Effective Roster for THIS user on THIS day
                    // We pass a single-item array [currentUser] to reuse the aggregator logic efficiently
                    const dailyRoster = getEffectiveDailyRoster([currentUser], schedules, overrides, shifts, day);
                    const myShift = dailyRoster.find(r => String(r.employee.id) === String(currentUser.id));

                    // 2. Check for Pending Requests on this day
                    const pendingReq = requests.find(r => r.target_date === dateStr && r.status !== 'REJECTED' && r.status !== 'CANCELLED');

                    const isWork = !!myShift;
                    const isPast = day < new Date().setHours(0, 0, 0, 0);

                    if (!isWork && !pendingReq) return null; // Hide off days or keep them? Let's show them for completeness/swapping into? 
                    // Better: Show all days or list style. Let's do list style of Work Days.
                    // If Off but has request, show request.
                    if (!isWork && !pendingReq) return null;

                    return (
                        <div key={dateStr} className={`p-4 flex items-center justify-between hover:bg-slate-50 transition ${isToday(day) ? 'bg-slate-50/50' : ''}`}>
                            <div className="flex items-center gap-4">
                                <div className={`text-center min-w-[50px] ${isToday(day) ? 'text-blue-600' : 'text-slate-500'}`}>
                                    <div className="text-xs font-bold uppercase">{format(day, "EEE")}</div>
                                    <div className="text-xl font-black">{format(day, "d")}</div>
                                </div>

                                <div>
                                    {isWork ? (
                                        <>
                                            <div className="font-bold text-slate-700 flex items-center gap-2">
                                                {myShift.shift_name}
                                                {myShift.source === 'OVERRIDE' && <span className="bg-purple-100 text-purple-600 text-[10px] px-1.5 py-0.5 rounded font-bold">SWAPPED</span>}
                                            </div>
                                            <div className="text-xs font-mono text-slate-400">
                                                {myShift.start_time.slice(0, 5)} - {myShift.end_time.slice(0, 5)}
                                            </div>
                                        </>
                                    ) : (
                                        <div className="text-slate-400 font-bold">OFF</div>
                                    )}

                                    {/* Status Indicator */}
                                    {pendingReq && (
                                        <div className="mt-1 flex items-center gap-1">
                                            <span className="w-2 h-2 rounded-full bg-orange-400 animate-pulse"></span>
                                            <span className="text-[10px] font-bold text-orange-500 uppercase">{pendingReq.status.replace('_', ' ')}</span>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Actions */}
                            {!isPast && isWork && !pendingReq && (
                                <button
                                    onClick={() => handleSwapClick(dateStr, myShift)}
                                    className="px-4 py-2 border border-slate-200 rounded-xl text-slate-500 text-xs font-bold hover:bg-slate-800 hover:text-white transition shadow-sm"
                                >
                                    Swap
                                </button>
                            )}
                        </div>
                    );
                })}
                {days.every(d => {
                    const dateStr = format(d, "yyyy-MM-dd");
                    const dailyRoster = getEffectiveDailyRoster([currentUser], schedules, overrides, shifts, d);
                    const myShift = dailyRoster.find(r => String(r.employee.id) === String(currentUser.id));
                    return !myShift;
                }) && (
                        <div className="p-8 text-center text-slate-400">No shifts scheduled this month.</div>
                    )}
            </div>

            {/* Reuse Modal */}
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
                />
            )}
        </div>
    );
}
