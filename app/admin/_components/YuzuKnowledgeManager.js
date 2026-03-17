"use client";

import { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { Icons } from "./ui/HausIcon";

export default function YuzuKnowledgeManager() {
    const [knowledge, setKnowledge] = useState([]);
    const [newContent, setNewContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [message, setMessage] = useState("");
    const [searchTerm, setSearchTerm] = useState("");

    useEffect(() => {
        fetchKnowledge();
    }, []);

    async function fetchKnowledge() {
        const { data, error } = await supabase
            .from("yuzu_knowledge")
            .select("*")
            .order("created_at", { ascending: false });
        if (!error) setKnowledge(data);
    }

    async function handleAdd() {
        if (!newContent) return;
        setLoading(true);
        setMessage("กำลังประมวลผล Embedding...");

        try {
            const res = await fetch("/api/yuzu/knowledge", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ content: newContent }),
            });
            const result = await res.json();
            if (result.success) {
                setMessage("เพิ่มความรู้สำเร็จ! ✨");
                setNewContent("");
                fetchKnowledge();
            } else {
                setMessage("ผิดพลาด: " + result.error);
            }
        } catch (e) {
            setMessage("Error: " + e.message);
        }
        setLoading(false);
    }

    async function handleDelete(id) {
        if (!confirm("ยืนยันการลบความรู้นี้?")) return;
        const { error } = await supabase.from("yuzu_knowledge").delete().eq("id", id);
        if (!error) {
            fetchKnowledge();
        } else {
            alert("Delete failed: " + error.message);
        }
    }

    const filteredKnowledge = knowledge.filter(k => 
        k.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-end">
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Yuzu Assistant Knowledge</h2>
                    <p className="text-slate-500 text-sm">Manage facts and rules for Yuzu AI assistant</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Left: Input Form */}
                <Card className="lg:col-span-1 space-y-4 h-fit sticky top-24">
                    <h3 className="font-bold text-slate-700 flex items-center gap-2">
                        <Icons.Yuzu size={18} className="text-orange-500" />
                        Add New Fact
                    </h3>
                    <div className="space-y-3">
                        <textarea
                            className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl h-48 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-orange-200 transition-all resize-none"
                            placeholder="ป้อนข้อมูลความรู้ (เช่น 'ถ้าน้ำแข็งหมด ให้แจ้งคุณบอยทันที')..."
                            value={newContent}
                            onChange={(e) => setNewContent(e.target.value)}
                        />
                        <button
                            onClick={handleAdd}
                            disabled={loading || !newContent}
                            className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                        >
                            {loading ? (
                                <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" />
                            ) : (
                                <Icons.Plus size={16} />
                            )}
                            {loading ? "Processing..." : "Teach Yuzu"}
                        </button>
                        {message && (
                            <p className={`text-xs font-bold text-center ${message.includes("สำเร็จ") ? "text-emerald-500" : "text-orange-500"}`}>
                                {message}
                            </p>
                        )}
                    </div>
                </Card>

                {/* Right: List and Search */}
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
                                <thead className="bg-slate-50 sticky top-0 z-10">
                                    <tr className="text-slate-400 uppercase text-[10px] font-bold tracking-wider">
                                        <th className="px-6 py-4">Knowledge Content</th>
                                        <th className="px-6 py-4 w-32">Date Added</th>
                                        <th className="px-6 py-4 w-10"></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {filteredKnowledge.length === 0 ? (
                                        <tr>
                                            <td colSpan="3" className="px-6 py-12 text-center text-slate-400 italic">
                                                No knowledge items found.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredKnowledge.map((k) => (
                                            <tr key={k.id} className="group hover:bg-orange-50/30 transition-colors">
                                                <td className="px-6 py-4">
                                                    <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">
                                                        {k.content}
                                                    </p>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tight">
                                                        {new Date(k.created_at).toLocaleDateString("th-TH")}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 text-right">
                                                    <button
                                                        onClick={() => handleDelete(k.id)}
                                                        className="p-2 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-all rounded-full hover:bg-rose-50"
                                                        title="Delete Fact"
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
                    <p className="text-center text-[10px] text-slate-400 uppercase font-bold tracking-widest">
                        Total {filteredKnowledge.length} knowledge entries
                    </p>
                </div>
            </div>
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
