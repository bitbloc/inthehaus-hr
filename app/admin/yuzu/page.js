'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function YuzuKnowledgeAdmin() {
    const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge', 'config', 'employees'
    const [knowledge, setKnowledge] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [config, setConfig] = useState({ father_uid: '', mother_uid: '' });
    
    const [newContent, setNewContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchData();
    }, [activeTab]);

    async function fetchData() {
        setLoading(true);
        if (activeTab === 'knowledge') {
            const { data, error } = await supabase
                .from('yuzu_knowledge')
                .select('*')
                .order('created_at', { ascending: false });
            if (!error) setKnowledge(data);
        } else if (activeTab === 'config') {
            const { data, error } = await supabase.from('yuzu_config').select('*');
            if (!error && data) {
                const cfg = {};
                data.forEach(item => cfg[item.key] = item.value);
                setConfig(prev => ({ ...prev, ...cfg }));
            }
        } else if (activeTab === 'employees') {
            const { data, error } = await supabase
                .from('employees')
                .select('id, name, nickname, position, line_bot_id, line_user_id, is_active')
                .eq('is_active', true)
                .order('name', { ascending: true });
            if (!error) setEmployees(data);
        }
        setLoading(false);
    }

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
                setMessage('เพิ่มความสำเร็จ!');
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
        if (!confirm('ยืนยันการลบ?')) return;
        const { error } = await supabase.from('yuzu_knowledge').delete().eq('id', id);
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
            setMessage('บันทึกการตั้งค่าแล้ว');
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
            setMessage('อัปเดตข้อมูลพนักงานเรียบร้อย');
            setTimeout(() => setMessage(''), 3000);
        }
    }

    return (
        <div className="py-12 px-4 md:px-8 max-w-6xl mx-auto min-h-screen bg-transparent">
            <header className="mb-12 text-center pt-4">
                 <h1 className="text-4xl md:text-5xl font-extrabold mb-3 flex justify-center items-center gap-3 text-orange-600 tracking-tight">
                    🍊 Yuzu AI Management
                </h1>
                <p className="text-gray-500 font-medium">จัดการความรู้, สิทธิ์บอส และบุคลิกรายตำแหน่งของน้องยูซุ</p>
            </header>

            {/* Tabs */}
            <div className="flex flex-wrap gap-2 mb-10 bg-white/80 backdrop-blur-md p-1.5 rounded-2xl shadow-sm border border-orange-100 sticky top-4 z-50">
                {[
                    { id: 'knowledge', label: '📖 ความรู้ (RAG)', icon: '📚' },
                    { id: 'config', label: '⚙️ ตั้งค่าระบบ (Config)', icon: '🛠️' },
                    { id: 'employees', label: '👥 พนักงาน & ตำแหน่ง', icon: '👤' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 min-w-[150px] py-3.5 px-6 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
                            activeTab === tab.id 
                            ? 'bg-orange-500 text-white shadow-lg shadow-orange-200 scale-[1.02]' 
                            : 'text-gray-500 hover:bg-orange-50 hover:text-orange-600'
                        }`}
                    >
                        <span className="text-xl">{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>
            
            {message && (
                <div className="fixed bottom-8 right-8 z-50 p-4 bg-orange-600 text-white rounded-2xl shadow-2xl animate-bounce border-2 border-orange-400 font-bold">
                    ✨ {message}
                </div>
            )}

            {/* TAB: KNOWLEDGE */}
            {activeTab === 'knowledge' && (
                <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                    <div className="bg-white p-8 rounded-3xl shadow-xl border border-orange-50 mb-10">
                        <h2 className="text-2xl font-black mb-6 text-gray-800 flex items-center gap-3">
                             <span className="p-2 bg-orange-100 rounded-lg text-orange-600">✏️</span>
                             เพิ่มความรู้ใหม่ให้น้องยูซุ
                        </h2>
                        <textarea 
                            className="w-full p-6 border-2 border-gray-100 rounded-2xl h-48 mb-6 focus:ring-8 focus:ring-orange-100 focus:border-orange-500 outline-none transition-all resize-none text-lg leading-relaxed"
                            placeholder="ใส่เนื้อความรู้ที่นี่ (เช่น กฎระเบียบบริษัท, เมนูอาหาร, ข้อมูลเฉพาะเจาะจง)..."
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                        />
                        <div className="flex justify-end">
                            <button 
                                onClick={handleAddKnowledge}
                                disabled={loading || !newContent}
                                className="bg-orange-500 text-white px-10 py-4 rounded-2xl hover:bg-orange-600 disabled:opacity-50 transition-all font-black text-lg shadow-xl shadow-orange-200 transform hover:-translate-y-1 active:translate-y-0"
                            >
                                {loading ? '⌛ กำลังบันทึก...' : '🚀 บันทึกลงฐานความรู้'}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-6">
                        <h2 className="text-2xl font-black text-gray-800 flex items-center gap-3">
                             <span className="p-2 bg-gray-100 rounded-lg text-gray-600">📋</span>
                             รายการความรู้ ({knowledge.length})
                        </h2>
                        {knowledge.length === 0 && !loading && <p className="text-gray-400 italic bg-white p-10 rounded-3xl text-center border-2 border-dashed">ยังไม่มีข้อมูลความรู้ในระบบ</p>}
                        {knowledge.map((k) => (
                            <div key={k.id} className="bg-white p-6 md:p-8 rounded-3xl border border-gray-100 shadow-sm flex justify-between items-start group hover:border-orange-300 transition-all hover:shadow-xl">
                                <div className="flex-1 pr-10">
                                    <p className="text-gray-700 whitespace-pre-wrap leading-loose text-lg font-medium">{k.content}</p>
                                    <div className="flex items-center gap-4 mt-6">
                                        <span className="text-[11px] uppercase tracking-widest font-black text-gray-400 bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100">
                                            DOC-ID: {k.id.toString().slice(0, 8)}
                                        </span>
                                        <span className="text-xs text-gray-400 font-medium">
                                            📅 {new Date(k.created_at).toLocaleString('th-TH')}
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleDeleteKnowledge(k.id)}
                                    className="text-gray-200 hover:text-red-500 p-3 rounded-2xl hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100 flex-shrink-0"
                                    title="ลบความรู้นี้"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7" viewBox="0 0 20 20" fill="currentColor">
                                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                    </svg>
                                </button>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB: CONFIG */}
            {activeTab === 'config' && (
                <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                    <div className="grid gap-8">
                        {/* Boss Config */}
                        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-orange-50">
                            <h2 className="text-3xl font-black mb-8 text-gray-800 flex items-center gap-3">
                                <span className="p-2 bg-orange-100 rounded-xl text-orange-600">👑</span>
                                ตั้งค่าบอสสูงสุด (Boss UIDs)
                            </h2>
                            <div className="grid md:grid-cols-2 gap-10">
                                {[
                                    { id: 'father_uid', label: 'คุณพ่อ (Father)', icon: '👔' },
                                    { id: 'mother_uid', label: 'คุณแม่ (Mother)', icon: '💃' }
                                ].map(boss => (
                                    <div key={boss.id} className="space-y-3">
                                        <label className="flex items-center gap-2 text-sm font-black text-gray-600 uppercase tracking-widest">
                                            <span>{boss.icon}</span> {boss.label}
                                        </label>
                                        <div className="flex gap-3">
                                            <input 
                                                type="text"
                                                className="flex-1 p-4 bg-gray-50 border-2 border-gray-100 rounded-2xl focus:ring-8 focus:ring-orange-50 focus:border-orange-500 outline-none font-mono text-sm shadow-inner transition-all"
                                                value={config[boss.id] || ''}
                                                onChange={(e) => setConfig({...config, [boss.id]: e.target.value})}
                                                placeholder="U77e56cb..."
                                            />
                                            <button 
                                                onClick={() => handleUpdateConfig(boss.id, config[boss.id])}
                                                className="bg-gray-900 text-white px-6 rounded-2xl hover:bg-black transition-all font-bold text-sm shadow-lg active:scale-95"
                                            >
                                                บันทึก
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Role Interaction Config */}
                        <div className="bg-white p-8 md:p-12 rounded-3xl shadow-xl border border-orange-50">
                            <h2 className="text-3xl font-black mb-4 text-gray-800 flex items-center gap-3">
                                <span className="p-2 bg-purple-100 rounded-xl text-purple-600">🎭</span>
                                ปรับแต่งบุคลิกรายตำแหน่ง (Role-based AI)
                            </h2>
                            <p className="text-gray-400 mb-10 text-sm font-medium">
                                กำหนด "คำสั่งพิเศษ" ให้น้องยูซุคุยกับพนักงานแต่ละแผนกด้วยสไตล์ที่แตกต่างกัน (ปรับแต่ง Instruction แยกตาม Role)
                            </p>

                            <div className="grid gap-8">
                                {[
                                    { key: 'role_instruction_Bar&Floor', label: 'Bar & Floor (หน้าร้าน)', positions: ['Bar&Floor', 'Bar & Floor'] },
                                    { key: 'role_instruction_Kitchen', label: 'Kitchen (ในครัว)', positions: ['Cooking', 'Kitchen'] },
                                    { key: 'role_instruction_Admin', label: 'Admin (จัดการระบบ)', positions: ['Owner', 'Admin'] }
                                ].map(role => (
                                    <div key={role.key} className="p-6 rounded-2xl bg-gray-50 border border-gray-200">
                                        <label className="block text-lg font-black text-gray-700 mb-4 flex items-center gap-2">
                                            📌 สำหรับตำแหน่ง: <span className="text-purple-600">{role.label}</span>
                                        </label>
                                        <textarea
                                            className="w-full p-5 bg-white border-2 border-gray-100 rounded-2xl h-32 focus:ring-8 focus:ring-purple-50 focus:border-purple-400 outline-none transition-all resize-none text-base leading-relaxed text-gray-600"
                                            placeholder={`ใส่คำแนะนำพิเศษสำหรับกลุ่ม ${role.label}...`}
                                            value={config[role.key] || ''}
                                            onChange={(e) => setConfig({...config, [role.key]: e.target.value})}
                                            onBlur={(e) => handleUpdateConfig(role.key, e.target.value)}
                                        />
                                        <p className="mt-3 text-[11px] text-gray-400 italic">
                                            * น้องยูซุจะใช้คำสั่งนี้เมื่อ LINE ID นั้นมีตำแหน่งตรงกับกลุ่ม: {role.positions.join(', ')}
                                        </p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: EMPLOYEES */}
            {activeTab === 'employees' && (
                <div className="animate-in fade-in slide-in-from-bottom-6 duration-700">
                    <div className="bg-white rounded-[32px] shadow-2xl border border-orange-50 overflow-hidden">
                        <div className="p-10 bg-white border-b border-gray-100 flex flex-col md:flex-row justify-between items-center gap-4">
                            <div>
                                <h2 className="text-3xl font-black text-gray-800">👥 รายชื่อทีมงาน ({employees.length})</h2>
                                <p className="text-sm text-gray-400 font-medium mt-1">อัปเดต Bot UID และตำแหน่งงานเพื่อให้ AI จำแม่นขึ้น</p>
                            </div>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50/50 text-gray-400 text-[11px] uppercase tracking-[0.2em] font-black">
                                    <tr>
                                        <th className="px-10 py-6">พนักงาน</th>
                                        <th className="px-10 py-6">ตำแหน่ง</th>
                                        <th className="px-10 py-6">Yuzu Bot UID (Chat ID)</th>
                                        <th className="px-10 py-6 text-center">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {employees.map(emp => (
                                        <tr key={emp.id} className="hover:bg-orange-50/20 transition-all group">
                                            <td className="px-10 py-8">
                                                <div className="font-black text-gray-800 text-lg">{emp.nickname || emp.name}</div>
                                                <div className="text-xs text-gray-400 mt-0.5">{emp.name}</div>
                                            </td>
                                            <td className="px-10 py-8">
                                                <input 
                                                    type="text"
                                                    className="w-full bg-orange-50/0 border-b-2 border-transparent focus:border-orange-400 focus:bg-white outline-none p-2 text-base font-bold text-gray-600 rounded-lg transition-all"
                                                    value={emp.position || ''}
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, position: val} : item));
                                                    }}
                                                    onBlur={(e) => handleUpdateEmployee(emp.id, 'position', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-10 py-8">
                                                <input 
                                                    type="text"
                                                    className="w-full bg-gray-50/0 border-b-2 border-transparent focus:border-orange-400 focus:bg-white outline-none p-2 font-mono text-xs text-gray-400 focus:text-orange-600 rounded-lg transition-all"
                                                    value={emp.line_bot_id || ''}
                                                    placeholder="U..."
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, line_bot_id: val} : item));
                                                    }}
                                                    onBlur={(e) => handleUpdateEmployee(emp.id, 'line_bot_id', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-10 py-8 text-center">
                                                <div className="flex flex-col items-center gap-2">
                                                    <span className={`inline-block w-3 h-3 rounded-full shadow-sm ${emp.line_bot_id ? 'bg-green-500 animate-pulse' : 'bg-gray-200'}`}></span>
                                                    <span className="text-[10px] font-black text-gray-300 uppercase">{emp.line_bot_id ? 'Connected' : 'Offline'}</span>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
