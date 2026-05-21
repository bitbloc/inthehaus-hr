import { format, startOfWeek, addDays, isSameDay, parseISO } from 'date-fns';
import { th } from 'date-fns/locale';
import { getEffectiveDailyRoster } from '../../utils/roster_logic';

export default function TeamSchedule({ employees, schedules, overrides, shifts }) {
    const today = new Date();
    const startOfCurrentWeek = startOfWeek(today, { weekStartsOn: 1 }); // Monday start
    const weekDays = Array.from({ length: 7 }).map((_, i) => addDays(startOfCurrentWeek, i));

    // Get effective roster for each day of the week
    const weeklyRoster = weekDays.map(date => ({
        date,
        roster: getEffectiveDailyRoster(employees, schedules, overrides, shifts, date)
    }));

    return (
        <div className="space-y-6 animate-fade-in-up">
            <div className="bg-white rounded-3xl shadow-sm border border-slate-100 p-6">
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h3 className="font-bold text-lg text-slate-700">📅 ตารางงานทีม</h3>
                        <p className="text-xs text-slate-900 font-bold">
                            {format(startOfCurrentWeek, "d MMM", { locale: th })} - {format(addDays(startOfCurrentWeek, 6), "d MMM yyyy", { locale: th })}
                        </p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left border-collapse">
                        <thead>
                            <tr>
                                <th className="p-3 bg-slate-50 border-b border-slate-100 min-w-[150px] font-bold text-slate-950 sticky left-0 z-10">
                                    พนักงาน
                                </th>
                                {weekDays.map(day => (
                                    <th key={day.toString()} className={`p-3 bg-slate-50 border-b border-slate-100 min-w-[100px] text-center ${isSameDay(day, today) ? 'text-blue-600 bg-blue-50 font-bold' : 'text-slate-950'}`}>
                                        <div className="text-[10px] uppercase font-bold">{format(day, "EEE", { locale: th })}</div>
                                        <div className="text-lg font-black">{format(day, "d")}</div>
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {employees.map(emp => (
                                <tr key={emp.id} className="hover:bg-slate-50 transition">
                                    <td className="p-3 bg-white sticky left-0 z-10 border-r border-slate-100 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.05)]">
                                        <div className="font-bold text-slate-700">{emp.name}</div>
                                        <div className="text-[10px] text-slate-900 font-bold">{emp.position}</div>
                                    </td>
                                    {weekDays.map(day => {
                                        // Find this employee in this day's effective roster
                                        const dayData = weeklyRoster.find(d => isSameDay(d.date, day));
                                        const shift = dayData.roster.find(r => String(r.employee.id) === String(emp.id));

                                        return (
                                            <td key={day.toString()} className={`p-2 text-center border-l border-slate-50 ${isSameDay(day, today) ? 'bg-blue-50/30' : ''}`}>
                                                {shift ? (
                                                    <div className={`rounded-lg p-1.5 text-xs font-bold border ${getShiftColorClass(shift.shift_name)}`}>
                                                        <div className="truncate max-w-[80px] mx-auto">{shift.shift_name}</div>
                                                        <div className="text-[10px] font-mono font-bold mt-0.5">{shift.start_time.slice(0, 5)}-{shift.end_time.slice(0, 5)}</div>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-500 text-[10px] font-bold">-</span>
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
        return 'bg-sky-50 text-sky-950 border-sky-200';
    }
    
    if (name.includes('ควบ') || name.toLowerCase().includes('double')) {
        return 'bg-rose-50 text-rose-950 border-rose-200';
    }
    
    if (name.includes('ค่ำ') || name.includes('ดึก') || name.toLowerCase().includes('night') || name.toLowerCase().includes('evening')) {
        return 'bg-indigo-50 text-indigo-950 border-indigo-200';
    }
    
    if (name.includes('เช้า') || name.toLowerCase().includes('morning')) {
        return 'bg-amber-50 text-amber-950 border-amber-200';
    }
    
    return 'bg-yellow-50 text-yellow-950 border-yellow-200';
};
