import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { getEffectiveDailyRoster } from '../../utils/roster_logic';

export default function TeamSchedule({ employees, schedules, overrides, shifts, leaveRequests = [] }) {
    const today = new Date();
    const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfCurrentWeek, i));

    // Get effective roster for each day of the week
    const weeklyRoster = weekDays.map(date => ({
        date,
        roster: getEffectiveDailyRoster(employees, schedules, overrides, shifts, date)
    }));

    // Sort employees by position rank (Owner -> Cooking -> Bar & Floor -> Others)
    const getPositionOrder = (position) => {
        const pos = (position || '').toLowerCase().trim();
        if (pos.includes('owner')) return 1;
        if (pos.includes('cook') || pos.includes('kitchen')) return 2;
        if (pos.includes('bar') || pos.includes('floor')) return 3;
        return 4;
    };

    const sortedEmployees = [...employees].sort((a, b) => {
        const orderA = getPositionOrder(a.position);
        const orderB = getPositionOrder(b.position);
        if (orderA !== orderB) return orderA - orderB;
        return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'th');
    });

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="bg-slate-955/40 backdrop-blur-md border border-indigo-900/30 rounded-[2rem] shadow-2xl shadow-indigo-950/20 p-6 overflow-hidden">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-extrabold text-sm text-slate-300 tracking-wide uppercase">📅 ตารางงานทีม</h3>
                        <p className="text-xs text-indigo-400 font-bold mt-1">
                            {format(startOfCurrentWeek, "d MMM", { locale: th })} - {format(addDays(startOfCurrentWeek, 6), "d MMM yyyy", { locale: th })}
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 bg-slate-900/60 border-b border-indigo-950/50 min-w-[140px] font-bold text-slate-300 sticky left-0 z-10">
                                    พนักงาน
                                </th>
                                {weekDays.map(day => (
                                    <th key={day.toString()} className={`p-3 bg-slate-900/60 border-b border-indigo-950/50 min-w-[105px] text-center ${isSameDay(day, today) ? 'text-indigo-400 bg-indigo-950/20 font-black' : 'text-slate-400'}`}>
                                        <div className="text-[10px] uppercase font-bold">{format(day, "EEE", { locale: th })}</div>
                                        <div className="text-lg font-black">{format(day, "d")}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-indigo-950/20">
                            {sortedEmployees.map(emp => (
                                <tr key={emp.id} className="hover:bg-slate-900/10 transition">
                                    <td className="p-3 bg-slate-955/90 sticky left-0 z-10 border-r border-indigo-950/30 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.3)] bg-slate-950">
                                        <div className="font-bold text-slate-200">{emp.name}</div>
                                        <div className="text-[10px] text-slate-400 font-bold">{emp.position}</div>
                                    </td>
                                    {weekDays.map(day => {
                                        const dayStr = format(day, "yyyy-MM-dd");
                                        const dayData = weeklyRoster.find(d => isSameDay(d.date, day));
                                        const shift = dayData.roster.find(r => String(r.employee.id) === String(emp.id));

                                        // Lookup leaves for this employee on this day
                                        const empLeave = leaveRequests.find(l => String(l.employee_id) === String(emp.id) && l.leave_date === dayStr);

                                        return (
                                            <td key={day.toString()} className={`p-2 text-center border-l border-indigo-950/20 ${isSameDay(day, today) ? 'bg-indigo-950/10' : ''}`}>
                                                {empLeave && empLeave.status === 'approved' ? (
                                                    // Approved leave: Show leave badge and replacement colleague name
                                                    <div className="rounded-lg p-1.5 text-[10px] font-bold border border-emerald-500/25 bg-emerald-500/10 text-emerald-400">
                                                        <div>{empLeave.leave_type === 'sick' ? 'ลาป่วย 😷' : empLeave.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'}</div>
                                                        {empLeave.replacement_employee && (
                                                            <div className="text-[9px] text-indigo-300 mt-1 font-medium leading-tight">
                                                                คนแทน: {empLeave.replacement_employee.nickname || empLeave.replacement_employee.name}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : shift ? (
                                                    // Scheduled to work
                                                    <div className={`rounded-lg p-1.5 text-xs font-bold border ${getShiftColorClass(shift.shift_name)}`}>
                                                        <div className="truncate max-w-[80px] mx-auto">{shift.shift_name}</div>
                                                        <div className="text-[10px] font-mono font-bold mt-0.5">{(shift.start_time || '').slice(0, 5)}-{(shift.end_time || '').slice(0, 5)}</div>
                                                        {empLeave && empLeave.status === 'pending' && (
                                                            <div className="text-[9px] text-amber-400 mt-1 font-black bg-amber-500/10 py-0.5 rounded border border-amber-500/20">
                                                                ขอลา {empLeave.leave_type === 'sick' ? '😷' : empLeave.leave_type === 'business' ? '💼' : '🏖️'}
                                                            </div>
                                                        )}
                                                    </div>
                                                ) : (
                                                    // Off day with no approved leave
                                                    <span className="text-slate-600 text-[10px] font-bold">-</span>
                                                )}
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const getShiftColorClass = (shiftName) => {
    const name = (shiftName || '').toLowerCase();
    
    if (name.includes('custom')) {
        return 'bg-sky-500/10 text-sky-400 border-sky-500/25';
    }
    
    if (name.includes('ควบ') || name.toLowerCase().includes('double')) {
        return 'bg-rose-500/10 text-rose-400 border-rose-500/25';
    }
    
    if (name.includes('ค่ำ') || name.includes('ดึก') || name.toLowerCase().includes('night') || name.toLowerCase().includes('evening')) {
        return 'bg-indigo-500/10 text-indigo-400 border-indigo-500/25';
    }
    
    if (name.includes('เช้า') || name.toLowerCase().includes('morning')) {
        return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
    }
    
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25';
};
