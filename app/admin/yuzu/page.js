'use client';

import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export default function YuzuKnowledgeAdmin() {
    const [knowledge, setKnowledge] = useState([]);
    const [newContent, setNewContent] = useState('');
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState('');

    useEffect(() => {
        fetchKnowledge();
    }, []);

    async function fetchKnowledge() {
        const { data, error } = await supabase
            .from('yuzu_knowledge')
            .select('*')
            .order('created_at', { ascending: false });
        if (!error) setKnowledge(data);
    }

    async function handleAdd() {
        if (!newContent) return;
        setLoading(true);
        setMessage('กำลังประมวลผล Embedding...');
        
        try {
            // Note: We normally do embedding on server side.
            // For simplicity in this demo, we'll call an API route we'll create
            const res = await fetch('/api/yuzu/knowledge', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ content: newContent })
            });
            const result = await res.json();
            if (result.success) {
                setMessage('เพิ่มความสำเร็จ!');
                setNewContent('');
                fetchKnowledge();
            } else {
                setMessage('ผิดพลาด: ' + result.error);
            }
        } catch (e) {
            setMessage('Error: ' + e.message);
        }
        setLoading(false);
    }

    async function handleDelete(id) {
        if (!confirm('ยืนยันการลบ?')) return;
        const { error } = await supabase.from('yuzu_knowledge').delete().eq('id', id);
        if (!error) fetchKnowledge();
    }

    return (
        <div className="p-8 max-w-4xl mx-auto">
            <h1 className="text-3xl font-bold mb-6 flex items-center gap-2">
                🍊 Yuzu Knowledge Base (RAG)
            </h1>
            
            <div className="bg-white p-6 rounded-xl shadow-lg border border-orange-100 mb-8">
                <h2 className="text-xl font-semibold mb-4">เพิ่มความรู้ใหม่ให้น้องยูซุ</h2>
                <textarea 
                    className="w-full p-4 border rounded-lg h-32 mb-4 focus:ring-2 focus:ring-orange-500 outline-none"
                    placeholder="ใส่เนื้อความรู้ที่นี่ (เช่น กฎระเบียบบริษัท, ข้อมูลเฉพาะเจาะจง)..."
                    value={newContent}
                    onChange={(e) => setNewContent(e.target.value)}
                />
                <button 
                    onClick={handleAdd}
                    disabled={loading}
                    className="bg-orange-500 text-white px-6 py-2 rounded-lg hover:bg-orange-600 disabled:opacity-50 transition-all font-medium"
                >
                    {loading ? 'กำลังบันทึก...' : 'บันทึกลงฐานความรู้'}
                </button>
                {message && <p className="mt-2 text-sm text-orange-600">{message}</p>}
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold">รายการความรู้ในระบบ ({knowledge.length})</h2>
                {knowledge.map((k) => (
                    <div key={k.id} className="bg-gray-50 p-4 rounded-lg border flex justify-between items-start group">
                        <div className="flex-1 pr-4">
                            <p className="text-gray-800 whitespace-pre-wrap">{k.content}</p>
                            <span className="text-xs text-gray-400 mt-2 block">
                                สร้างเมื่อ: {new Date(k.created_at).toLocaleString('th-TH')}
                            </span>
                        </div>
                        <button 
                            onClick={() => handleDelete(k.id)}
                            className="text-red-400 hover:text-red-600 opacity-0 group-hover:opacity-100 transition-all"
                        >
                            ลบ
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}
