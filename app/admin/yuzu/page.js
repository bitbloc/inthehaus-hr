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
            setEmployees(prev => prev.map(emp => emp.id === id ? { ...emp, [field]: value } : emp));
        }
    }

    return (
        <div className="p-8 max-w-5xl mx-auto min-h-screen bg-gray-50">
            <header className="mb-10 text-center">
                 <h1 className="text-4xl font-extrabold mb-2 flex justify-center items-center gap-3 text-orange-600">
                    🍊 Yuzu AI Management
                </h1>
                <p className="text-gray-500">จัดการความรู้, สิทธิ์บอส และฐานข้อมูลพนักงานน้องยูซุ</p>
            </header>

            {/* Tabs */}
            <div className="flex gap-2 mb-8 bg-white p-1 rounded-xl shadow-sm border border-orange-100">
                {[
                    { id: 'knowledge', label: '📖 ความรู้ (RAG)', icon: '📚' },
                    { id: 'config', label: '⚙️ ตั้งค่าบอส (UID)', icon: '👑' },
                    { id: 'employees', label: '👥 พนักงาน & ตำแหน่ง', icon: '👤' }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-3 px-4 rounded-lg font-medium transition-all flex items-center justify-center gap-2 ${
                            activeTab === tab.id 
                            ? 'bg-orange-500 text-white shadow-md' 
                            : 'text-gray-600 hover:bg-orange-50 hover:text-orange-600'
                        }`}
                    >
                        <span>{tab.icon}</span>
                        {tab.label}
                    </button>
                ))}
            </div>
            
            {message && (
                <div className="mb-6 p-4 bg-orange-100 border border-orange-200 text-orange-700 rounded-lg animate-pulse text-center font-medium">
                    {message}
                </div>
            )}

            {/* TAB: KNOWLEDGE */}
            {activeTab === 'knowledge' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white p-6 rounded-2xl shadow-xl border border-orange-50 mb-8">
                        <h2 className="text-xl font-bold mb-4 text-gray-800 flex items-center gap-2">
                             ✏️ เพิ่มความรู้ใหม่ให้น้องยูซุ
                        </h2>
                        <textarea 
                            className="w-full p-4 border-2 border-gray-100 rounded-xl h-40 mb-4 focus:ring-4 focus:ring-orange-200 focus:border-orange-500 outline-none transition-all resize-none"
                            placeholder="ใส่เนื้อความรู้ที่นี่ (เช่น กฎระเบียบบริษัท, เมนูอาหาร, ข้อมูลเฉพาะเจาะจง)..."
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                        />
                        <div className="flex justify-end">
                            <button 
                                onClick={handleAddKnowledge}
                                disabled={loading || !newContent}
                                className="bg-orange-500 text-white px-8 py-3 rounded-xl hover:bg-orange-600 disabled:opacity-50 transition-all font-bold shadow-lg shadow-orange-200 transform hover:-translate-y-0.5 active:translate-y-0"
                            >
                                {loading ? '⌛ กำลังบันทึก...' : '🚀 บันทึกลงฐานความรู้'}
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <h2 className="text-xl font-bold text-gray-800">📋 รายการความรู้ในระบบ ({knowledge.length})</h2>
                        {knowledge.length === 0 && !loading && <p className="text-gray-400 italic">ยังไม่มีข้อมูลความรู้ในระบบ</p>}
                        {knowledge.map((k) => (
                            <div key={k.id} className="bg-white p-5 rounded-2xl border border-gray-100 shadow-sm flex justify-between items-start group hover:border-orange-200 transition-all hover:shadow-md">
                                <div className="flex-1 pr-6">
                                    <p className="text-gray-800 whitespace-pre-wrap leading-relaxed">{k.content}</p>
                                    <div className="flex items-center gap-3 mt-3">
                                        <span className="text-[10px] uppercase tracking-wider font-bold text-gray-300 bg-gray-50 px-2 py-1 rounded">
                                            ID: {k.id.toString().slice(0, 8)}
                                        </span>
                                        <span className="text-xs text-gray-400 italic">
                                            สร้างเมื่อ: {new Date(k.created_at).toLocaleString('th-TH')}
                                        </span>
                                    </div>
                                </div>
                                <button 
                                    onClick={() => handleDeleteKnowledge(k.id)}
                                    className="text-gray-300 hover:text-red-500 p-2 rounded-lg hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                                    title="ลบความรู้นี้"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
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
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white p-8 rounded-2xl shadow-xl border border-orange-50 max-w-2xl mx-auto">
                        <h2 className="text-2xl font-bold mb-6 text-gray-800 flex items-center gap-2">
                             👑 ตั้งค่าบอสสูงสุด (UID)
                        </h2>
                        <p className="text-gray-500 mb-8 text-sm bg-orange-50 p-4 rounded-xl border border-orange-100">
                            กำหนด LINE User ID ของบอส เพื่อให้น้องยูซุเปลี่ยนบุคลิกเป็น "แมวประจบ" เมื่อคุยกับบุคคลเหล่านี้
                        </p>
                        
                        <div className="space-y-6">
                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">UID คุณพ่อ (Father)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        className="flex-1 p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:ring-4 focus:ring-orange-100 outline-none font-mono text-sm"
                                        value={config.father_uid}
                                        onChange={(e) => setConfig({...config, father_uid: e.target.value})}
                                        placeholder="เช่น U77e56cb..."
                                    />
                                    <button 
                                        onClick={() => handleUpdateConfig('father_uid', config.father_uid)}
                                        className="bg-gray-800 text-white px-5 rounded-xl hover:bg-black transition-all font-medium"
                                    >
                                        Update
                                    </button>
                                </div>
                            </div>

                            <div>
                                <label className="block text-sm font-bold text-gray-700 mb-2">UID คุณแม่ (Mother)</label>
                                <div className="flex gap-2">
                                    <input 
                                        type="text"
                                        className="flex-1 p-3 bg-gray-50 border-2 border-gray-100 rounded-xl focus:ring-4 focus:ring-orange-100 outline-none font-mono text-sm"
                                        value={config.mother_uid}
                                        onChange={(e) => setConfig({...config, mother_uid: e.target.value})}
                                        placeholder="เช่น U8c53c87..."
                                    />
                                    <button 
                                        onClick={() => handleUpdateConfig('mother_uid', config.mother_uid)}
                                        className="bg-gray-800 text-white px-5 rounded-xl hover:bg-black transition-all font-medium"
                                    >
                                        Update
                                    </button>
                                </div>
                            </div>
                        </div>

                        <div className="mt-10 pt-6 border-t border-gray-100 italic text-xs text-gray-400 text-center">
                            * การเปลี่ยน UID มีผลทันทีในการสนทนาถัดไปผ่าน Webhook
                        </div>
                    </div>
                </div>
            )}

            {/* TAB: EMPLOYEES */}
            {activeTab === 'employees' && (
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-white rounded-2xl shadow-xl border border-orange-50 overflow-hidden">
                        <div className="p-6 bg-white border-b border-gray-50 flex justify-between items-center">
                            <h2 className="text-xl font-bold text-gray-800">👥 จัดการพนักงาน ({employees.length})</h2>
                            <p className="text-xs text-gray-400">แก้ไขตำแหน่งและ Bot UID เพื่อให้ AI จำชื่อได้</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-gray-50 text-gray-500 text-xs uppercase tracking-widest font-bold">
                                    <tr>
                                        <th className="px-6 py-4">ชื่อ / ชื่อเล่น</th>
                                        <th className="px-6 py-4">ตำแหน่ง</th>
                                        <th className="px-6 py-4">Yuzu Bot UID (Bot ID)</th>
                                        <th className="px-6 py-4 text-center">ข้อมูลระบบ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-gray-50">
                                    {employees.map(emp => (
                                        <tr key={emp.id} className="hover:bg-orange-50/30 transition-all group">
                                            <td className="px-6 py-4">
                                                <div className="font-bold text-gray-800">{emp.nickname || emp.name}</div>
                                                <div className="text-[10px] text-gray-400">{emp.name}</div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <input 
                                                    type="text"
                                                    className="w-full bg-transparent border-b border-transparent focus:border-orange-300 outline-none p-1 text-sm text-gray-600 focus:bg-white rounded"
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
                                                    className="w-full bg-transparent border-b border-transparent focus:border-orange-300 outline-none p-1 font-mono text-[10px] text-gray-500 focus:bg-white rounded"
                                                    value={emp.line_bot_id || ''}
                                                    placeholder="ใส่ UID จากแชทบอท..."
                                                    onChange={(e) => {
                                                        const val = e.target.value;
                                                        setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, line_bot_id: val} : item));
                                                    }}
                                                    onBlur={(e) => handleUpdateEmployee(emp.id, 'line_bot_id', e.target.value)}
                                                />
                                            </td>
                                            <td className="px-6 py-4 text-center">
                                                <span className={`inline-block w-2 h-2 rounded-full ${emp.line_bot_id ? 'bg-green-400' : 'bg-gray-200'}`} title={emp.line_bot_id ? 'UID Connected' : 'Missing UID'}></span>
                                                <div className="text-[9px] text-gray-300 mt-1">Check-in: {emp.line_user_id ? 'Yes' : 'No'}</div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                    <div className="mt-6 p-4 bg-blue-50 rounded-xl border border-blue-100 flex items-start gap-3">
                        <div className="text-blue-500 text-xl font-bold">ℹ️</div>
                        <div className="text-xs text-blue-700 leading-relaxed">
                            <p className="font-bold mb-1">คำแนะนำ:</p>
                            <ul className="list-disc ml-4 space-y-1">
                                <li><strong>Bot UID:</strong> คือ User ID ที่ได้เมื่อพิมพ์ "yuzu who am i" ในแชทพนักงาน</li>
                                <li><strong>ตำแหน่ง:</strong> น้องยูซุจะใช้ตำแหน่งนี้ในบทสนทนา (เช่น ถ้าตำแหน่งคือ 'Bar&Floor' AI จะคุยเน้นเรื่องเครื่องดื่มและบริการ)</li>
                                <li>AI จะจำพนักงานที่ "เปิดใช้งาน (Is Active)" อยู่เท่านั้น</li>
                            </ul>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
