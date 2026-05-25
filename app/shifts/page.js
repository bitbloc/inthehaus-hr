"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import MyShifts from './MyShifts';
import Marketplace from './Marketplace';
import TeamSchedule from './TeamSchedule';
import NavigationDock from '../_components/NavigationDock';

export default function ShiftsPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [schedules, setSchedules] = useState({});
    const [overrides, setOverrides] = useState([]);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    const [poolRequests, setPoolRequests] = useState([]);

    const [activeTab, setActiveTab] = useState('my-shifts');

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        setLoading(true);
        // 1. Fetch Master Data
        const { data: empData } = await supabase.from('employees').select('*').eq('is_active', true);
        const { data: shiftData } = await supabase.from('shifts').select('*');
        const { data: schedData } = await supabase.from('employee_schedules').select('*');

        // 2. Fetch Transactional Data (roster_transactions & Requests & Leaves)
        const { data: ovData } = await supabase
            .from('roster_transactions')
            .select('*')
            .eq('status', 'PUBLISHED')
            .eq('slot_type', 'MAIN');

        const { data: reqData } = await supabase.from('shift_swap_requests').select(
            '*, requester:employees!requester_id(name, position), shift:shifts!old_shift_id(name, start_time, end_time)'
        );

        const { data: leaveData } = await supabase
            .from('leave_requests')
            .select(`
                *,
                employee:employees!employee_id(id, name, nickname, position),
                replacement_employee:employees!replacement_employee_id(id, name, nickname, position)
            `)
            .neq('status', 'rejected');

        // Process Schedules Map
        const schedMap = {};
        schedData?.forEach(s => {
            if (!schedMap[s.employee_id]) schedMap[s.employee_id] = {};
            schedMap[s.employee_id][s.day_of_week] = s;
        });

        setEmployees(empData || []);
        setShifts(shiftData || []);
        setSchedules(schedMap);
        setOverrides(ovData || []);
        setLeaveRequests(leaveData || []);
        setPoolRequests(reqData?.filter(r => r.status === 'PENDING_PEER' && !r.target_peer_id) || []);

        // Handle User (Demo: Select first one or specific ID)
        if (empData && empData.length > 0) {
            const storedId = localStorage.getItem('demo_user_id');
            const foundPrice = storedId ? empData.find(e => String(e.id) === String(storedId)) : empData[0];
            setCurrentUser(foundPrice || empData[0]);

            // Filter private requests
            const myId = foundPrice?.id || empData[0].id;
            setMyRequests(reqData?.filter(r => String(r.requester_id) === String(myId)) || []);
        }

        setLoading(false);
    };

    const handleUserSwitch = (e) => {
        const user = employees.find(emp => String(emp.id) === String(e.target.value));
        setCurrentUser(user);
        localStorage.setItem('demo_user_id', user.id);
        window.location.reload(); // Simple reload to refresh data context
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center font-sans">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                <div className="text-sm font-semibold text-slate-400 animate-pulse">กำลังโหลดข้อมูลตารางงาน...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-900 text-slate-100 pb-24 font-sans selection:bg-indigo-500/30">
            {/* Premium Header */}
            <div className="relative overflow-hidden bg-gradient-to-b from-indigo-950/80 via-slate-950/50 to-transparent px-6 pt-8 pb-6 border-b border-indigo-900/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-12 left-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <span className="text-[10px] tracking-widest uppercase font-extrabold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">In The Haus</span>
                        <h1 className="text-2xl font-black text-white tracking-tight mt-2.5">📅 ตารางเข้างาน</h1>
                        <p className="text-xs text-slate-400 mt-1 font-medium">จัดการและแลกกะงานของคุณ</p>
                    </div>
                    <div>
                        <select
                            className="text-xs font-bold border border-indigo-900/30 rounded-xl bg-slate-900/80 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition p-2.5 cursor-pointer"
                            value={currentUser?.id}
                            onChange={handleUserSwitch}
                        >
                            {employees.map(e => (
                                <option key={e.id} value={e.id} className="bg-slate-950 text-white">
                                    {e.name} {e.nickname ? `(${e.nickname})` : ''}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            <div className="p-6 max-w-md mx-auto space-y-6">
                {/* Navigation */}
                <div className="flex bg-slate-950/40 backdrop-blur-md border border-indigo-900/20 p-1.5 rounded-2xl mb-6">
                    <button
                        onClick={() => setActiveTab('my-shifts')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-300 flex items-center justify-center gap-1.5 ${
                            activeTab === 'my-shifts' 
                                ? 'bg-gradient-to-r from-indigo-500 to-indigo-650 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/20' 
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                        }`}
                    >
                        📅 ตารางของฉัน
                    </button>
                    <button
                        onClick={() => setActiveTab('market')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-300 flex items-center justify-center gap-1.5 ${
                            activeTab === 'market' 
                                ? 'bg-gradient-to-r from-indigo-500 to-indigo-650 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/20' 
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                        }`}
                    >
                        <span>🌐</span> ตลาดแลกกะ
                        {poolRequests.length > 0 && (
                            <span className="bg-rose-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-black animate-pulse">{poolRequests.length}</span>
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('team')}
                        className={`flex-1 py-3 rounded-xl text-xs font-black tracking-wide uppercase transition-all duration-300 flex items-center justify-center gap-1.5 ${
                            activeTab === 'team' 
                                ? 'bg-gradient-to-r from-indigo-500 to-indigo-650 text-white shadow-lg shadow-indigo-500/25 border border-indigo-400/20' 
                                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                        }`}
                    >
                        👥 ตารางทีม
                    </button>
                </div>

                {/* Content */}
                <div className="transition-all duration-300">
                    {activeTab === 'my-shifts' && (
                        <MyShifts
                            currentUser={currentUser}
                            shifts={shifts}
                            schedules={schedules}
                            overrides={overrides}
                            employees={employees}
                            requests={myRequests}
                            leaveRequests={leaveRequests}
                        />
                    )}

                    {activeTab === 'market' && (
                        <Marketplace
                            currentUser={currentUser}
                            initialRequests={poolRequests}
                        />
                    )}

                    {activeTab === 'team' && (
                        <TeamSchedule
                            employees={employees}
                            schedules={schedules}
                            overrides={overrides}
                            shifts={shifts}
                            leaveRequests={leaveRequests}
                        />
                    )}
                </div>
            </div>

            <div className="h-24"></div> {/* Spacer for Dock */}
            <NavigationDock />
        </div>
    );
}
