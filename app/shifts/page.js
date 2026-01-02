"use client";
import { useEffect, useState } from 'react';
import { supabase } from '../../lib/supabaseClient';
import MyShifts from './MyShifts';
import Marketplace from './Marketplace';

export default function ShiftsPage() {
    // Ideally this comes from Auth Context, but for this prototype matching Admin logic
    // we might need a "Selector" or assume a logged in user. 
    // For demo purposes, I'll default to the first employee found or a Selector.
    const [currentUser, setCurrentUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [schedules, setSchedules] = useState({});
    const [overrides, setOverrides] = useState([]);
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

        // 2. Fetch Transactional Data (Overrides & Requests)
        const { data: ovData } = await supabase.from('roster_overrides').select('*');
        const { data: reqData } = await supabase.from('shift_swap_requests').select(
            '*, requester:employees!requester_id(name, position), shift:shifts!old_shift_id(name, start_time, end_time)'
        );

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
        setPoolRequests(reqData?.filter(r => r.status === 'PENDING_PEER' && !r.target_peer_id) || []);

        // Handle User (Demo: Select first one or specific ID)
        // In real app: supabase.auth.getUser() -> match employee email
        if (empData && empData.length > 0) {
            // Check if we have a stored ID in localStorage (Simulating session)
            const storedId = localStorage.getItem('demo_user_id');
            const foundPrice = storedId ? empData.find(e => String(e.id) === storedId) : empData[0];
            setCurrentUser(foundPrice || empData[0]);

            // Filter private requests
            const myId = foundPrice?.id || empData[0].id;
            setMyRequests(reqData?.filter(r => String(r.requester_id) === String(myId)) || []);
        }

        setLoading(false);
    };

    const handleUserSwitch = (e) => {
        const user = employees.find(emp => String(emp.id) === e.target.value);
        setCurrentUser(user);
        localStorage.setItem('demo_user_id', user.id);
        setMyRequests(poolRequests.concat(myRequests).filter(r => String(r.requester_id) === String(user.id))); // Reload needed really
        window.location.reload(); // Simple reload for prototype to refresh data context
    };

    if (loading) return <div className="p-8 text-center">Loading Roster...</div>;

    return (
        <div className="min-h-screen bg-slate-50 pb-20 font-sans text-slate-800">
            <div className="max-w-xl mx-auto p-4">

                {/* Header & User Switcher (For Demo) */}
                <div className="flex justify-between items-center mb-6">
                    <div>
                        <h1 className="text-2xl font-bold text-slate-800">Shifts</h1>
                        <p className="text-xs text-slate-500">Manage your schedule</p>
                    </div>
                    <div>
                        <select
                            className="text-xs font-bold bg-white border border-slate-200 rounded-lg p-2 outline-none"
                            value={currentUser?.id}
                            onChange={handleUserSwitch}
                        >
                            {employees.map(e => <option key={e.id} value={e.id}>{e.id}: {e.name}</option>)}
                        </select>
                    </div>
                </div>

                {/* Navigation */}
                <div className="flex bg-white p-1 rounded-xl shadow-sm border border-slate-100 mb-6">
                    <button
                        onClick={() => setActiveTab('my-shifts')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition ${activeTab === 'my-shifts' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        📅 My Schedule
                    </button>
                    <button
                        onClick={() => setActiveTab('market')}
                        className={`flex-1 py-2.5 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 ${activeTab === 'market' ? 'bg-slate-800 text-white shadow-md' : 'text-slate-400 hover:text-slate-600'}`}
                    >
                        <span>🌐</span> Pool
                        {poolRequests.length > 0 && <span className="bg-red-500 text-white text-[10px] px-1.5 rounded-full">{poolRequests.length}</span>}
                    </button>
                </div>

                {/* Content */}
                <div className="animate-fade-in-up">
                    {activeTab === 'my-shifts' && (
                        <MyShifts
                            currentUser={currentUser}
                            employees={employees} // Needed for Modal Peer List
                            schedules={schedules}
                            shifts={shifts}
                            overrides={overrides}
                            requests={myRequests}
                        />
                    )}

                    {activeTab === 'market' && (
                        <Marketplace
                            currentUser={currentUser}
                            initialRequests={poolRequests}
                        />
                    )}
                </div>

            </div>
        </div>
    );
}
