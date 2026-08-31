"use client";
import { useEffect, useState } from 'react';
import liff from '@line/liff';
import { supabase } from '../../lib/supabaseClient';
import { useRealtimeSync } from '../../lib/useRealtimeSync';
import MyShifts from './MyShifts';
import Marketplace from './Marketplace';
import TeamSchedule from './TeamSchedule';
import NavigationDock from '../_components/NavigationDock';
import { Sparkles, Calendar, ArrowRightLeft, Users, RefreshCw } from 'lucide-react';

export default function ShiftsPage() {
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSyncing, setIsSyncing] = useState(false);

    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [schedules, setSchedules] = useState({});
    const [overrides, setOverrides] = useState([]);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [myRequests, setMyRequests] = useState([]);
    const [poolRequests, setPoolRequests] = useState([]);

    const [activeTab, setActiveTab] = useState('my-shifts');

    const LIFF_ID = process.env.NEXT_PUBLIC_LIFF_ID;

    const fetchData = async (isInitial = false) => {
        if (isInitial) setLoading(true);
        else setIsSyncing(true);

        try {
            // 1. Fetch Master Data
            const { data: empData } = await supabase.from('employees').select('*').eq('is_active', true);
            const { data: shiftData } = await supabase.from('shifts').select('*');
            const { data: schedData } = await supabase.from('employee_schedules').select('*');

            // 2. Fetch Transactional Data (roster_transactions & Requests & Leaves)
            const { data: ovData } = await supabase
                .from('roster_transactions')
                .select('*, shifts(*)');

            const { data: reqData } = await supabase.from('shift_swap_requests').select(
                '*, requester:employees!requester_id(name, nickname, position), peer:employees!target_peer_id(name, nickname), shift:shifts!old_shift_id(name, start_time, end_time)'
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

            // Handle User Identity Resolution
            if (empData && empData.length > 0) {
                let resolvedEmp = currentUser;

                if (!resolvedEmp) {
                    // Try LIFF first
                    try {
                        if (typeof liff !== 'undefined' && liff.isLoggedIn && liff.isLoggedIn()) {
                            const prof = await liff.getProfile();
                            const matched = empData.find(e => 
                                (e.line_bot_id && e.line_bot_id === prof.userId) || 
                                (e.line_user_id && e.line_user_id === prof.userId)
                            );
                            if (matched) resolvedEmp = matched;
                        }
                    } catch (e) {
                        console.warn("LIFF Profile lookup skipped:", e);
                    }

                    // Fallback to localStorage or first employee
                    if (!resolvedEmp) {
                        const storedId = localStorage.getItem('demo_user_id');
                        resolvedEmp = storedId ? empData.find(e => String(e.id) === String(storedId)) : empData[0];
                    }
                }

                const finalUser = resolvedEmp || empData[0];
                setCurrentUser(finalUser);

                // Filter private requests
                setMyRequests(reqData?.filter(r => String(r.requester_id) === String(finalUser.id) || String(r.target_peer_id) === String(finalUser.id)) || []);
            }
        } catch (err) {
            console.error("Error fetching shifts data:", err);
        }

        setLoading(false);
        setIsSyncing(false);
    };

    // Initialize on Mount with LIFF
    useEffect(() => {
        const init = async () => {
            try {
                if (typeof liff !== 'undefined' && LIFF_ID) {
                    await liff.init({ liffId: LIFF_ID });
                }
            } catch (err) {
                console.warn("LIFF init warning:", err);
            }
            fetchData(true);
        };
        init();
    }, [LIFF_ID]);

    // Realtime Subscriptions for Instant Updates across staff and managers
    useRealtimeSync(['roster_transactions', 'shift_swap_requests', 'leave_requests'], (payload) => {
        console.log('[Shifts Realtime Sync]:', payload.table, payload.eventType);
        fetchData(false);
    });

    const handleUserSwitch = (e) => {
        const user = employees.find(emp => String(emp.id) === String(e.target.value));
        if (user) {
            setCurrentUser(user);
            localStorage.setItem('demo_user_id', user.id);
            setMyRequests(overrides?.filter(r => String(r.requester_id) === String(user.id) || String(r.target_peer_id) === String(user.id)) || []);
        }
    };

    if (loading) {
        return (
            <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center justify-center font-sans">
                <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-indigo-500 mb-4"></div>
                <div className="text-sm font-semibold text-slate-400 animate-pulse">กำลังโหลดข้อมูลตารางงาน Realtime...</div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 pb-28 font-sans selection:bg-indigo-500/30">
            {/* Premium Header */}
            <div className="relative overflow-hidden bg-gradient-to-b from-indigo-950/80 via-slate-950/50 to-transparent px-5 pt-7 pb-5 border-b border-indigo-900/20">
                <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none" />
                <div className="absolute top-12 left-10 w-32 h-32 bg-emerald-500/5 rounded-full blur-2xl pointer-events-none" />
                
                <div className="relative z-10 flex items-center justify-between">
                    <div>
                        <div className="inline-flex items-center gap-1.5 text-[10px] tracking-widest uppercase font-extrabold text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded-full border border-indigo-500/20">
                            <Sparkles className="w-3 h-3 text-indigo-400" />
                            In The Haus Live Roster
                        </div>
                        <h1 className="text-2xl font-black text-white tracking-tight mt-2">📅 ตารางเข้างาน</h1>
                        <p className="text-xs text-slate-400 mt-0.5 font-medium">จัดการและแลกกะงานแบบ Realtime</p>
                    </div>

                    <div className="flex items-center gap-2">
                        {isSyncing && (
                            <RefreshCw className="w-3.5 h-3.5 text-indigo-400 animate-spin" />
                        )}
                        <select
                            className="text-xs font-bold border border-indigo-900/40 rounded-2xl bg-slate-900/90 text-white outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500/50 transition p-2.5 cursor-pointer shadow-lg"
                            value={currentUser?.id || ''}
                            onChange={handleUserSwitch}
                        >
                            {employees.map(e => (
                                <option key={e.id} value={e.id} className="bg-slate-950 text-white">
                                    {e.nickname ? `${e.nickname} (${e.name})` : e.name}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Tab Switcher */}
                <div className="flex bg-slate-900/80 p-1.5 rounded-2xl border border-indigo-900/30 mt-5 max-w-md mx-auto shadow-inner">
                    <button
                        onClick={() => setActiveTab('my-shifts')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all ${
                            activeTab === 'my-shifts'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Calendar className="w-3.5 h-3.5" />
                        <span>กะของฉัน</span>
                    </button>
                    <button
                        onClick={() => setActiveTab('marketplace')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all relative ${
                            activeTab === 'marketplace'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <ArrowRightLeft className="w-3.5 h-3.5" />
                        <span>ตลาดแลกกะ</span>
                        {poolRequests.length > 0 && (
                            <span className="w-2 h-2 rounded-full bg-pink-500 animate-pulse" />
                        )}
                    </button>
                    <button
                        onClick={() => setActiveTab('team')}
                        className={`flex-1 py-2.5 rounded-xl font-extrabold text-xs flex items-center justify-center gap-1.5 transition-all ${
                            activeTab === 'team'
                                ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-600/30'
                                : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        <Users className="w-3.5 h-3.5" />
                        <span>ตารางทีม</span>
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="p-4 max-w-3xl mx-auto space-y-6">
                {activeTab === 'my-shifts' && (
                    <MyShifts
                        currentUser={currentUser}
                        employees={employees}
                        schedules={schedules}
                        shifts={shifts}
                        overrides={overrides}
                        requests={myRequests}
                        leaveRequests={leaveRequests}
                    />
                )}

                {activeTab === 'marketplace' && (
                    <Marketplace
                        currentUser={currentUser}
                        shifts={shifts}
                        poolRequests={poolRequests}
                        myRequests={myRequests}
                        onRefresh={() => fetchData(false)}
                    />
                )}

                {activeTab === 'team' && (
                    <TeamSchedule
                        employees={employees}
                        schedules={schedules}
                        shifts={shifts}
                        overrides={overrides}
                        leaveRequests={leaveRequests}
                    />
                )}
            </div>

            <NavigationDock />
        </div>
    );
}
