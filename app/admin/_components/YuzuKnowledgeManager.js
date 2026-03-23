import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/HausIcon";
import { format, addHours } from "date-fns";

export default function YuzuKnowledgeManager() {
    const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge', 'config', 'employees', 'slips'
    const [knowledge, setKnowledge] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [slips, setSlips] = useState([]);
    const [config, setConfig] = useState({ father_uid: '', mother_uid: '' });
    
    const [newContent, setNewContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [slipLoading, setSlipLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    
    // Date filter for slips
    const [selectedDate, setSelectedDate] = useState(format(addHours(new Date(), 7), 'yyyy-MM-dd'));

    useEffect(() => {
        fetchData();
    }, [activeTab, selectedDate]);

    async function fetchData() {
        if (activeTab === 'knowledge') {
            setLoading(true);
            const { data, error } = await supabase
                .from('yuzu_knowledge')
                .select('*')
                .order('created_at', { ascending: false });
            if (!error) setKnowledge(data);
            setLoading(false);
        } else if (activeTab === 'config') {
            setLoading(true);
            const { data, error } = await supabase.from('yuzu_config').select('*');
            if (!error && data) {
                const cfg = {};
                data.forEach(item => cfg[item.key] = item.value);
                setConfig(prev => ({ ...prev, ...cfg }));
            }
            setLoading(false);
        } else if (activeTab === 'employees') {
            setLoading(true);
            const { data, error } = await supabase
                .from('employees')
                .select('id, name, nickname, position, line_bot_id, line_user_id, is_active')
                .eq('is_active', true)
                .order('name', { ascending: true });
            if (!error) setEmployees(data);
            setLoading(false);
        } else if (activeTab === 'slips') {
            setSlipLoading(true);
            
            // Fetch employees if not already loaded to support mapping
            if (employees.length === 0) {
                const { data: empData } = await supabase
                    .from('employees')
                    .select('id, name, nickname, line_bot_id, line_user_id')
                    .eq('is_active', true);
                if (empData) setEmployees(empData);
            }

            // DIRECT QUERY WITHOUT JOIN TO AVOID 400 ERROR
            const { data, error } = await supabase
                .from('slip_transactions')
                .select('id, amount, slip_url, timestamp, is_deleted, sender_name, user_id, bank_name')
                .eq('is_deleted', false)
                .eq('date', selectedDate)
                .order('timestamp', { ascending: false });
            
            if (!error && data) {
                setSlips(data);
            } else if (error) {
                console.error("Slip fetch error:", error);
                setMessage('Error: ' + error.message);
            }
            setSlipLoading(false);
        }
    }

    // Helper to get employee name from ID
    const getEmployeeName = (userId, senderName) => {
        if (!userId) return senderName || 'External';
        const emp = employees.find(e => 
            String(e.id) === String(userId) ||
            (e.line_bot_id && e.line_bot_id.toLowerCase() === String(userId).toLowerCase()) ||
            (e.line_user_id && e.line_user_id.toLowerCase() === String(userId).toLowerCase())
        );
        if (emp) return emp.nickname || emp.name;
        return senderName || `Staff (ID: ${userId})`;
    };

    async function handleAddKnowledge() {
        if (!newContent) return;
        setLoading(true);
        setMessage('กำลังประมวลผล Embedding...');
        
        try {
            const res = await fetch('/api/yuzu/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent })
            });
            const result = await res.json();
            if (result.success) {
                setMessage('เพิ่มความรู้สำเร็จ! ✨');
                setNewContent('');
                fetchData();
            } else {
                setMessage('ผิดพลาด: ' + result.error);
            }
        } catch (e) {
            setMessage('Error: ' + e.message);
        }
        setLoading(false);
    }

    async function handleDeleteKnowledge(id) {
        if (!confirm('ยืนยันการลบความรู้นี้?')) return;
        const { error } = await supabase.from('yuzu_knowledge').delete().eq('id', id);
        if (!error) fetchData();
    }

    async function handleDeleteSlip(id) {
        if (!confirm('ยืนยันการลบรายการสลิปนี้?')) return;
        const { error } = await supabase
            .from('slip_transactions')
            .update({ is_deleted: true })
            .eq('id', id);
        if (!error) fetchData();
    }

    async function handleUpdateConfig(key, value) {
        setLoading(true);
        const { error } = await supabase
            .from('yuzu_config')
            .upsert({ key, value, updated_at: new Date().toISOString() });
        
        if (error) {
            alert('Error updating config: ' + error.message);
        } else {
            setConfig(prev => ({ ...prev, [key]: value }));
            setMessage('บันทึกการตั้งค่าแล้ว ✨');
            setTimeout(() => setMessage(''), 3000);
        }
        setLoading(false);
    }

    async function handleUpdateEmployee(id, field, value) {
        const { error } = await supabase
            .from('employees')
            .update({ [field]: value })
            .eq('id', id);
        
        if (error) {
            alert('Error updating employee: ' + error.message);
        } else {
            setMessage('อัปเดตข้อมูลพนักงานเรียบร้อย ✨');
            setTimeout(() => setMessage(''), 3000);
        }
    }

    const filteredKnowledge = knowledge.filter(k => 
        k.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Yuzu AI Management</h2>
                    <p className="text-slate-500 text-sm">จัดการฐานความรู้ สิทธิ์บอส และยอดโอนเงิน</p>
                </div>
                
                {/* Internal Tabs */}
                <div className="bg-slate-100 p-1 rounded-xl flex gap-1 self-start overflow-x-auto no-scrollbar">
                    {[
                        { id: 'knowledge', label: 'Knowledge', icon: Icons.File },
                        { id: 'config', label: 'System Config', icon: Icons.Settings },
                        { id: 'employees', label: 'Staff Roles', icon: Icons.Staff },
                        { id: 'slips', label: 'Transfer Slips', icon: Icons.Money }
                    ].map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 whitespace-nowrap ${
                                activeTab === tab.id 
                                ? 'bg-white text-orange-600 shadow-sm' 
                                : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <tab.icon size={14} />
                            {tab.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* TAB: KNOWLEDGE */}
            {activeTab === 'knowledge' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="lg:col-span-1 space-y-4 h-fit lg:sticky lg:top-24">
                        <h3 className="font-bold text-slate-700 flex items-center gap-2">
                            <Icons.Yuzu size={18} className="text-orange-500" />
                            Add New Fact
                        </h3>
                        <div className="space-y-3">
                            <textarea
                                className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl h-48 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-orange-200 transition-all resize-none"
                                placeholder="ป้อนข้อมูลความรู้ให้น้องยูซุ..."
                                value={newContent}
                                onChange={(e) => setNewContent(e.target.value)}
                            />
                            <button
                                onClick={handleAddKnowledge}
                                disabled={loading || !newContent}
                                className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                            >
                                {loading ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Icons.Plus size={16} />}
                                {loading ? "Processing..." : "Teach Yuzu"}
                            </button>
                            {message && <p className={`text-xs font-bold text-center ${message.includes("สำเร็จ") ? "text-emerald-500" : "text-orange-500"}`}>{message}</p>}
                        </div>
                    </Card>

                    <div className="lg:col-span-2 space-y-4">
                        <Card className="flex items-center gap-3 py-3 px-4">
                            <Icons.Search size={16} className="text-slate-400" />
                            <input
                                type="text"
                                placeholder="Search knowledge base..."
                                className="bg-transparent border-none outline-none text-sm font-medium text-slate-600 w-full"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </Card>
                        <Card className="p-0 overflow-hidden">
                            <div className="max-h-[600px] overflow-auto custom-scrollbar">
                                <table className="w-full text-sm text-left">
                                    <thead className="bg-slate-50 sticky top-0 z-10 text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                                        <tr>
                                            <th className="px-6 py-4">Content</th>
                                            <th className="px-6 py-4 w-32">Added</th>
                                            <th className="px-6 py-4 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {filteredKnowledge.map((k) => (
                                            <tr key={k.id} className="group hover:bg-orange-50/30 transition-colors">
                                                <td className="px-6 py-4"><p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{k.content}</p></td>
                                                <td className="px-6 py-4 whitespace-nowrap"><span className="text-[10px] font-bold text-slate-400">{new Date(k.created_at).toLocaleDateString("th-TH")}</span></td>
                                                <td className="px-6 py-4 text-right">
                                                    <button onClick={() => handleDeleteKnowledge(k.id)} className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 rounded-full hover:bg-rose-50 transition-all"><Icons.Trash size={14} /></button>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                        <p className="text-center text-[10px] text-slate-400 uppercase font-bold tracking-widest">Total {filteredKnowledge.length} entries</p>
                    </div>
                </div>
            )}

            {/* TAB: CONFIG */}
            {activeTab === 'config' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="space-y-6">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Icons.Staff size={18} className="text-orange-500" />
                                Boss UIDs (ตั้งค่าบอส)
                            </h3>
                            <div className="space-y-4">
                                {[
                                    { key: 'father_uid', label: 'คุณพ่อ (Father)', placeholder: 'U77e...' },
                                    { key: 'mother_uid', label: 'คุณแม่ (Mother)', placeholder: 'U8c5...' }
                                ].map(boss => (
                                    <div key={boss.key}>
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1 block">{boss.label}</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                className="flex-1 p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono text-slate-600 outline-none focus:ring-2 focus:ring-orange-100 transition-all"
                                                value={config[boss.key] || ''}
                                                onChange={(e) => setConfig({...config, [boss.key]: e.target.value})}
                                                placeholder={boss.placeholder}
                                            />
                                            <button 
                                                onClick={() => handleUpdateConfig(boss.key, config[boss.key])}
                                                className="px-4 bg-slate-800 text-white rounded-xl text-xs font-bold hover:bg-black transition-all"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card className="bg-orange-50/50 border-orange-100">
                            <h3 className="font-bold text-slate-800 flex items-center gap-2">
                                <Icons.Alert size={18} className="text-orange-500" />
                                About Configuration
                            </h3>
                            <p className="text-sm text-slate-600 leading-relaxed mt-2">
                                การตั้งค่า UID บอสจะช่วยให้น้องยูซุแยกแยะและตอบโต้กับผู้บริหารด้วยสไตล์ที่นอบน้อมเป็นพิเศษ โดยค่าเหล่านี้จะถูกจัดเก็บไว้ในฐานข้อมูลและประมวลผลทันทีเมื่อมีการแชท
                            </p>
                        </Card>
                    </div>

                    <Card className="space-y-6">
                        <h3 className="font-bold text-slate-800 flex items-center gap-2">
                            <Icons.Yuzu size={18} className="text-purple-600" />
                            Role-based Personality (ปรับบุคลิกรายตำแหน่ง)
                        </h3>
                        <p className="text-sm text-slate-500">กำหนดคำสั่งพิเศษ (Instruction) ให้น้องยูซุใช้คุยกับแต่ละตำแหน่งงาน</p>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {[
                                { key: 'role_instruction_Bar&Floor', label: 'Bar & Floor (หน้าร้าน)', color: 'blue' },
                                { key: 'role_instruction_Kitchen', label: 'Kitchen (ในครัว)', color: 'rose' },
                                { key: 'role_instruction_Admin', label: 'Admin (จัดการระบบ)', color: 'slate' }
                            ].map(role => (
                                <div key={role.key} className="space-y-3">
                                    <Badge color={role.color} className="uppercase tracking-widest">{role.label}</Badge>
                                    <textarea 
                                        className="w-full p-4 bg-white border border-slate-200 rounded-xl h-32 text-sm text-slate-600 outline-none focus:ring-2 focus:ring-purple-200 transition-all resize-none"
                                        placeholder={`ใส่คำสั่งพิเศษสำหรับกลุ่ม ${role.label}...`}
                                        value={config[role.key] || ''}
                                        onChange={(e) => setConfig({...config, [role.key]: e.target.value})}
                                        onBlur={(e) => handleUpdateConfig(role.key, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB: EMPLOYEES */}
            {activeTab === 'employees' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Staff</th>
                                        <th className="px-6 py-4">Position (ใช้แยก Role)</th>
                                        <th className="px-6 py-4">Bot Chat ID (UID)</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {employees.map(emp => (
                                        <tr key={emp.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-slate-700">{emp.nickname || emp.name}</div>
                                                <div className="text-[10px] text-slate-400">{emp.name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <input 
                                                    type="text" 
                                                    className="w-full p-2 bg-transparent border-b border-transparent focus:border-orange-400 outline-none font-bold text-slate-600 transition-all"
                                                    value={emp.position || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, position: val} : item));
                                                    }}
                                                    onBlur={(e) => handleUpdateEmployee(emp.id, 'position', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-6 py-4">
                                                <input 
                                                    type="text" 
                                                    className="w-full p-2 bg-transparent border-b border-transparent focus:border-orange-400 outline-none font-mono text-[11px] text-slate-400 transition-all"
                                                    value={emp.line_bot_id || ''}
                                                    placeholder="U..."
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, line_bot_id: val} : item));
                                                    }}
                                                    onBlur={(e) => handleUpdateEmployee(emp.id, 'line_bot_id', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <div className="flex flex-col items-center gap-1">
                                                    <div className={`w-2 h-2 rounded-full ${emp.line_bot_id ? 'bg-emerald-500 animate-pulse' : 'bg-slate-200'}`} />
                                                    <span className="text-[8px] font-bold text-slate-400 uppercase">{emp.line_bot_id ? 'Linked' : 'No ID'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB: SLIPS */}
            {activeTab === 'slips' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4 bg-white p-2 px-4 rounded-2xl shadow-sm border border-slate-100 w-fit">
                            <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider">เลือกวันที่:</span>
                            <input 
                                type="date" 
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent font-bold text-slate-800 outline-none text-sm cursor-pointer"
                            />
                        </div>
                        
                        <a 
                            href={`/admin/report/slips?date=${selectedDate}`} 
                            target="_blank"
                            className="bg-slate-900 text-white px-6 py-3 rounded-xl font-bold text-[10px] tracking-[0.2em] uppercase shadow-xl hover:bg-black transition-all flex items-center gap-2"
                        >
                            <Icons.File size={14} /> PDF REPORT
                        </a>
                    </div>

                    <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-sm text-left">
                                <thead className="bg-slate-50 text-slate-400 font-bold text-[10px] uppercase tracking-wider">
                                    <tr>
                                        <th className="px-6 py-4">Time</th>
                                        <th className="px-6 py-4">Sender</th>
                                        <th className="px-6 py-4">Staff</th>
                                        <th className="px-6 py-4">Bank</th>
                                        <th className="px-6 py-4">Amount (THB)</th>
                                        <th className="px-6 py-4">Proof</th>
                                        <th className="px-6 py-4 text-center">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {slipLoading ? (
                                        <tr>
                                            <td colSpan="7" className="p-12 text-center text-slate-400 italic">กำลังดึงข้อมูลสลิป...</td>
                                        </tr>
                                    ) : slips.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="p-20 text-center">
                                                <p className="text-slate-300 font-bold uppercase tracking-widest mb-1">No Transactions</p>
                                                <p className="text-slate-400 text-[10px]">ไม่พบข้อมูลสลิปในวันที่เลือก</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        slips.map((slip) => (
                                            <tr key={slip.id} className="hover:bg-slate-50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="font-bold text-slate-700">{format(new Date(slip.timestamp), 'HH:mm:ss')}</div>
                                                    <div className="text-[10px] text-slate-400 uppercase font-mono">{format(new Date(slip.timestamp), 'dd MMM yyyy')}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-slate-600">
                                                        {slip.sender_name || 'External'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-slate-500 text-[10px] uppercase font-bold tracking-widest">
                                                        {getEmployeeName(slip.user_id, '-')}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-slate-500 text-[10px] uppercase tracking-tight">
                                                        {slip.bank_name || '-'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-lg font-black tracking-tight text-slate-900">
                                                        {Number(slip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {slip.slip_url ? (
                                                        <a href={slip.slip_url} target="_blank" rel="noreferrer" className="text-[10px] font-bold uppercase tracking-widest py-2 px-4 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-900 hover:text-white transition-all">
                                                            View Slip
                                                        </a>
                                                    ) : <span className="text-slate-300">-</span>}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button 
                                                        onClick={() => handleDeleteSlip(slip.id)}
                                                        className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 rounded-full hover:bg-rose-50 transition-all"
                                                    >
                                                        <Icons.Trash size={14} />
                                                    </button>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {message && !loading && (
                 <div className="fixed bottom-8 right-8 z-[100] bg-slate-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 animate-in fade-in slide-in-from-right-10 duration-300">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                    <span className="text-sm font-bold">{message}</span>
                 </div>
            )}
        </div>
    );
}

// Minimal Plus icon for the button since it wasn't in HausIcon
if (!Icons.Plus) {
    Icons.Plus = ({ size }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
    );
}

// Minimal Money icon for the slips
if (!Icons.Money) {
    Icons.Money = ({ size }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="1" x2="12" y2="23"></line>
            <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path>
        </svg>
    );
}

