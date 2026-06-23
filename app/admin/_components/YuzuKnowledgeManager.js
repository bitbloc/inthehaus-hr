import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { TabButton } from "./ui/TabButton";
import { Icons } from "./ui/HausIcon";
import { format, addHours } from "date-fns";

export default function YuzuKnowledgeManager() {
    const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge', 'insights', 'config', 'employees', 'slips'
    const [knowledge, setKnowledge] = useState([]);
    const [insights, setInsights] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [slips, setSlips] = useState([]);
    const [config, setConfig] = useState({ father_uid: '', mother_uid: '' });
    
    const [newContent, setNewContent] = useState('');
    const [newImageUrl, setNewImageUrl] = useState('');
    const [newFile, setNewFile] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editingContent, setEditingContent] = useState('');
    const [editingImageUrl, setEditingImageUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [slipLoading, setSlipLoading] = useState(false);
    const [espressoLoading, setEspressoLoading] = useState(false);
    const [espressoReports, setEspressoReports] = useState([]);
    const [message, setMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
    const [cleanupLoading, setCleanupLoading] = useState(false);
    const [isFlowVisible, setIsFlowVisible] = useState(true);

    // New States for AI Operations Dashboard
    const [selectedBriefDate, setSelectedBriefDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [dailyBriefs, setDailyBriefs] = useState({});
    const [briefLoading, setBriefLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [chatMessages, setChatMessages] = useState([
        { role: 'model', content: 'สวัสดีค่ะเจ้านาย! ยูซุ แมวส้มแสนรู้ประจำร้าน In The Haus พร้อมให้บริการแล้วค่ะ มีอะไรเกี่ยวกับข้อมูลร้าน กะงาน หรืออารมณ์ของพนักงานที่อยากคุยกับยูซุ แหลงมาได้เลยนะคะเมี๊ยว~ 🐱🍊' }
    ]);
    const [chatInput, setChatInput] = useState('');
    const [chatLoading, setChatLoading] = useState(false);
    const [attendanceLogs, setAttendanceLogs] = useState([]);
    const [isPendingInsightsExpanded, setIsPendingInsightsExpanded] = useState(false);
    const [aiLoadingEmpId, setAiLoadingEmpId] = useState(null);
    const [expandedEmpId, setExpandedEmpId] = useState(null);
    
    // Date filter for slips
    const [selectedDate, setSelectedDate] = useState(format(new Date(), 'yyyy-MM-dd'));

    // Calculate recent dates (Today + last 3 days)
    const recentDates = React.useMemo(() => {
        const dates = [];
        for (let i = 0; i < 4; i++) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            dates.push(format(d, 'yyyy-MM-dd'));
        }
        return dates;
    }, []);

    async function handleGenerateBrief(dateStr = null) {
        const targetDate = dateStr || selectedBriefDate;
        setBriefLoading(true);
        try {
            const res = await fetch(`/api/yuzu/brief?date=${targetDate}`);
            const data = await res.json();
            if (data.success) {
                setDailyBriefs(prev => ({ ...prev, [targetDate]: data.brief }));
            } else {
                setDailyBriefs(prev => ({ ...prev, [targetDate]: 'ไม่สามารถสรุปข้อมูลได้ในขณะนี้: ' + data.error }));
            }
        } catch (e) {
            setDailyBriefs(prev => ({ ...prev, [targetDate]: 'เกิดข้อผิดพลาดในการดึงข้อมูลสรุป: ' + e.message }));
        }
        setBriefLoading(false);
    }

    async function handleExportSingleBriefPDF(dateStr) {
        const briefContent = dailyBriefs[dateStr];
        if (!briefContent) return;

        setPdfLoading(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');

            const element = document.createElement('div');
            element.style.width = '800px';
            element.style.padding = '50px';
            element.style.background = '#ffffff';
            element.style.color = '#000000';
            element.style.fontFamily = 'monospace, Courier, Courier New, monospace';
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '-9999px';

            element.innerHTML = `
                <div style="border: 2px solid #000000; padding: 25px; margin-bottom: 30px;">
                    <div style="font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">IN THE HAUS — DAILY REPORT</div>
                    <div style="font-size: 11px; margin-top: 5px; opacity: 0.7; text-transform: uppercase;">YUZU AI AUTOMATED BRIEFING SYSTEM</div>
                </div>
                <div style="margin-bottom: 30px;">
                    <div style="display: inline-block; background: #000000; color: #ffffff; padding: 6px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
                        DATE : ${dateStr}
                    </div>
                    <div style="border: 1px solid #000000; padding: 25px; font-size: 12px; line-height: 1.65; white-space: pre-wrap;">
${briefContent}
                    </div>
                </div>
                <div style="margin-top: 60px; border-top: 1px solid #000000; padding-top: 15px; text-align: center; font-size: 9px; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.05em;">
                    AUTO-GENERATED BY YUZU SYSTEM AT ${new Date().toLocaleString('th-TH')}
                </div>
            `;
            document.body.appendChild(element);

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
            });
            document.body.removeChild(element);

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgWidth = 210;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            pdf.addImage(imgData, 'PNG', 0, 0, imgWidth, imgHeight);
            pdf.save(`yuzu-brief-${dateStr}.pdf`);
        } catch (e) {
            console.error("PDF Export Error:", e);
            alert("เกิดข้อผิดพลาดในการสร้าง PDF: " + e.message);
        } finally {
            setPdfLoading(false);
        }
    }

    async function handleExportThreeDayReportPDF() {
        setPdfLoading(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');

            const datesToFetch = recentDates.slice(0, 3);
            const fetchedBriefs = { ...dailyBriefs };

            for (const date of datesToFetch) {
                if (!fetchedBriefs[date]) {
                    const res = await fetch(`/api/yuzu/brief?date=${date}`);
                    const data = await res.json();
                    if (data.success) {
                        fetchedBriefs[date] = data.brief;
                    } else {
                        fetchedBriefs[date] = 'ไม่มีข้อมูลสรุปสำหรับวันนี้';
                    }
                }
            }

            setDailyBriefs(fetchedBriefs);

            const element = document.createElement('div');
            element.style.width = '800px';
            element.style.padding = '50px';
            element.style.background = '#ffffff';
            element.style.color = '#000000';
            element.style.fontFamily = 'monospace, Courier, Courier New, monospace';
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '-9999px';

            let sectionsHtml = '';
            for (const date of datesToFetch) {
                sectionsHtml += `
                    <div style="margin-bottom: 40px; page-break-inside: avoid;">
                        <div style="display: inline-block; background: #000000; color: #ffffff; padding: 6px 12px; font-size: 11px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
                            REPORT DATE : ${date}
                        </div>
                        <div style="border: 1px solid #000000; padding: 20px; font-size: 11px; line-height: 1.6; white-space: pre-wrap;">
                            ${fetchedBriefs[date] || 'ไม่มีการสรุปข้อมูลสำหรับวันนี้'}
                        </div>
                    </div>
                `;
            }

            element.innerHTML = `
                <div style="border: 2px solid #000000; padding: 25px; margin-bottom: 35px;">
                    <div style="font-size: 20px; font-weight: bold; text-transform: uppercase; letter-spacing: 0.05em;">IN THE HAUS — 3-DAY REPORT</div>
                    <div style="font-size: 11px; margin-top: 5px; opacity: 0.7; text-transform: uppercase;">YUZU AI COMPILATION LOGS</div>
                </div>
                <div>
                    ${sectionsHtml}
                </div>
                <div style="margin-top: 60px; border-top: 1px solid #000000; padding-top: 15px; text-align: center; font-size: 9px; opacity: 0.6; text-transform: uppercase; letter-spacing: 0.05em;">
                    AUTO-COMPILED BY YUZU SYSTEM AT ${new Date().toLocaleString('th-TH')}
                </div>
            `;
            document.body.appendChild(element);

            const canvas = await html2canvas(element, {
                scale: 2,
                useCORS: true,
                logging: false,
            });
            document.body.removeChild(element);

            const imgData = canvas.toDataURL('image/png');
            const pdf = new jsPDF('p', 'mm', 'a4');
            const imgWidth = 210;
            const pageHeight = 295;
            const imgHeight = (canvas.height * imgWidth) / canvas.width;
            
            let heightLeft = imgHeight;
            let position = 0;

            pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
            heightLeft -= pageHeight;

            while (heightLeft >= 0) {
                position = heightLeft - imgHeight;
                pdf.addPage();
                pdf.addImage(imgData, 'PNG', 0, position, imgWidth, imgHeight);
                heightLeft -= pageHeight;
            }

            pdf.save(`yuzu-3day-brief-report.pdf`);
        } catch (e) {
            console.error("PDF Compilation Export Error:", e);
            alert("เกิดข้อผิดพลาดในการสร้าง PDF: " + e.message);
        } finally {
            setPdfLoading(false);
        }
    }

    async function handleSendConsoleChat() {
        if (!chatInput.trim()) return;
        const userMsg = chatInput.trim();
        setChatInput('');
        setChatMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setChatLoading(true);
        
        try {
            const res = await fetch('/api/yuzu/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ message: userMsg, userId: config.father_uid || 'admin_dashboard' })
            });
            const data = await res.json();
            if (data.success) {
                setChatMessages(prev => [...prev, { role: 'model', content: data.response }]);
            } else {
                setChatMessages(prev => [...prev, { role: 'model', content: 'มีปัญหาบางอย่างเมี๊ยว: ' + data.error }]);
            }
        } catch (e) {
            setChatMessages(prev => [...prev, { role: 'model', content: 'ติดต่อหนูไม่ได้เมี๊ยว: ' + e.message }]);
        }
        setChatLoading(false);
    }

    const getMoodStats = () => {
        const stats = { '🔥': 0, '😊': 0, '😐': 0, '😴': 0, '🤒': 0 };
        let total = 0;
        attendanceLogs.forEach(log => {
            if (log.mood_status && stats[log.mood_status] !== undefined) {
                stats[log.mood_status]++;
                total++;
            }
        });
        return { stats, total };
    };

    useEffect(() => {
        fetchData();
        if (activeTab === 'insights') {
            if (!dailyBriefs[selectedBriefDate]) {
                handleGenerateBrief(selectedBriefDate);
            }
        }
    }, [activeTab, selectedDate, selectedBriefDate]);

    async function fetchData() {
        if (activeTab === 'knowledge') {
            setLoading(true);
            const { data, error } = await supabase
                .from('yuzu_knowledge')
                .select('*')
                .order('created_at', { ascending: false });
            if (!error) setKnowledge(data);
            setLoading(false);
        } else if (activeTab === 'insights') {
            setLoading(true);
            // 1. Fetch pending insights
            const { data: insightsData, error: insightsErr } = await supabase
                .from('yuzu_knowledge')
                .select('*')
                .filter('metadata->>status', 'eq', 'pending')
                .order('created_at', { ascending: false });
            if (!insightsErr) setInsights(insightsData || []);

            // 2. Fetch today's & recent attendance logs for mood index
            const { data: attData, error: attErr } = await supabase
                .from('attendance_logs')
                .select('*, employees(id, name, nickname, position)')
                .order('timestamp', { ascending: false })
                .limit(30);
            if (!attErr && attData) setAttendanceLogs(attData);

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
                .select('id, name, nickname, position, line_bot_id, line_user_id, is_active, duties, strengths, improvements')
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
        } else if (activeTab === 'espresso') {
            setEspressoLoading(true);
            
            if (employees.length === 0) {
                const { data: empData } = await supabase
                    .from('employees')
                    .select('id, name, nickname, line_bot_id, line_user_id')
                    .eq('is_active', true);
                if (empData) setEmployees(empData);
            }

            const start = new Date(selectedDate + 'T00:00:00+07:00').toISOString();
            const end = new Date(selectedDate + 'T23:59:59.999+07:00').toISOString();

            const { data: chatData, error } = await supabase
                .from('yuzu_chat_history')
                .select('id, created_at, user_id, role, content, message_type')
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: true });

            if (!error && chatData) {
                const rawReports = chatData.filter(m => m.message_type === 'espresso_report');
                const photos = chatData.filter(m => m.message_type === 'image_description' && m.content.includes('[ภาพประกอบช็อตกาแฟ]'));
                const analyses = chatData.filter(m => m.role === 'model' && m.content.includes('[Espresso Analysis]'));

                const matchedReports = rawReports.map(report => {
                    const reportTime = new Date(report.created_at);

                    const matchingPhotos = photos.filter(p => {
                        const pTime = new Date(p.created_at);
                        const diffMin = Math.abs(pTime - reportTime) / 60000;
                        return p.user_id === report.user_id && diffMin <= 5;
                    });

                    const photoUrls = matchingPhotos.map(p => {
                        const match = p.content.match(/\[ภาพประกอบช็อตกาแฟ\] (https?:\/\/[^\s]+)/);
                        return match ? match[1] : null;
                    }).filter(Boolean);

                    const analysis = analyses.find(a => {
                        const aTime = new Date(a.created_at);
                        const diffMin = (aTime - reportTime) / 60000;
                        return diffMin >= 0 && diffMin <= 2;
                    });

                    const recommendation = analysis 
                        ? analysis.content.replace('[Espresso Analysis]', '').trim() 
                        : 'ไม่มีบทวิเคราะห์ช็อตกาแฟ';

                    return {
                        id: report.id,
                        timestamp: report.created_at,
                        userId: report.user_id,
                        rawText: report.content,
                        photos: photoUrls,
                        recommendation
                    };
                });

                setEspressoReports(matchedReports);
            } else if (error) {
                console.error("Espresso fetch error:", error);
                setMessage('Error: ' + error.message);
            }
            setEspressoLoading(false);
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
        if (!newContent && !newFile) return;
        setLoading(true);
        setMessage('กำลังประมวลผล...');
        
        try {
            let res;
            if (newFile) {
                const formData = new FormData();
                formData.append('file', newFile);
                formData.append('metadata', JSON.stringify({ 
                    image_url: newImageUrl,
                    source: 'upload'
                }));
                res = await fetch('/api/yuzu/knowledge', {
                    method: 'POST',
                    body: formData
                });
            } else {
                res = await fetch('/api/yuzu/knowledge', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        content: newContent,
                        metadata: { image_url: newImageUrl }
                    })
                });
            }
            
            // Improved error handling for non-JSON responses
            let result;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                result = await res.json();
            } else {
                const text = await res.text();
                throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}...`);
            }
            if (result.success) {
                setMessage('เพิ่มความรู้สำเร็จ! ✨');
                setNewContent('');
                setNewImageUrl('');
                setNewFile(null);
                fetchData();
            } else {
                setMessage('ผิดพลาด: ' + result.error);
            }
        } catch (e) {
            setMessage('Error: ' + e.message);
        }
        setLoading(false);
    }

    async function handleUpdateKnowledge() {
        if (!editingId) return;
        setLoading(true);
        setMessage('กำลังอัปเดตข้อมูล...');
        
        try {
            const res = await fetch('/api/yuzu/knowledge', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    id: editingId,
                    content: editingContent,
                    metadata: { image_url: editingImageUrl }
                })
            });

            // Improved error handling for non-JSON responses
            let result;
            const contentType = res.headers.get("content-type");
            if (contentType && contentType.includes("application/json")) {
                result = await res.json();
            } else {
                const text = await res.text();
                throw new Error(`Server returned non-JSON response (${res.status}): ${text.slice(0, 100)}...`);
            }
            
            if (result.success) {
                setMessage('อัปเดตความรู้สำเร็จ! ✨');
                setEditingId(null);
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

    async function handleVerifyInsight(id) {
        const { error } = await supabase
            .from('yuzu_knowledge')
            .update({ 
                metadata: { status: 'verified', verified_at: new Date().toISOString() } 
            })
            .eq('id', id);
        
        if (!error) {
            setMessage('บันทึกความรู้เข้าคลังหลักเรียบร้อย ✨');
            fetchData();
        }
    }

    async function handleUpdateInsightKeywords(id, keywords) {
        const insight = insights.find(i => i.id === id);
        if (!insight) return;
        const newMetadata = { ...insight.metadata, keywords: keywords.split(',').map(k => k.trim()) };
        const { error } = await supabase
            .from('yuzu_knowledge')
            .update({ metadata: newMetadata })
            .eq('id', id);
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

    async function handleAiEvaluateEmployee(id) {
        setAiLoadingEmpId(id);
        setMessage('น้องยูซุกำลังสืบค้นข้อมูลกะงานและประวัติการแชท...');
        try {
            const res = await fetch('/api/yuzu/analyze-employee', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ employeeId: id })
            });
            const data = await res.json();
            if (data.success && data.analysis) {
                const { duties, strengths, improvements } = data.analysis;
                
                // Save to DB immediately so it is persistent
                const { error: dbErr } = await supabase
                    .from('employees')
                    .update({ duties, strengths, improvements })
                    .eq('id', id);
                
                if (dbErr) throw dbErr;

                // Update local state
                setEmployees(prev => prev.map(emp => 
                    emp.id === id 
                    ? { ...emp, duties: duties || emp.duties, strengths: strengths || emp.strengths, improvements: improvements || emp.improvements } 
                    : emp
                ));
                
                setMessage('ประเมินประสิทธิภาพด้วย AI สำเร็จและบันทึกเรียบร้อยเมี๊ยว~ ✨🐾');
            } else {
                setMessage('ผิดพลาด: ' + (data.error || 'ไม่สามารถวิเคราะห์ได้'));
            }
        } catch (e) {
            console.error("AI Appraisal Error:", e);
            setMessage('เกิดข้อผิดพลาด: ' + e.message);
        } finally {
            setAiLoadingEmpId(null);
            setTimeout(() => setMessage(''), 4000);
        }
    }

    async function handleExecuteCleanup(days = 30, shouldBackup = true) {
        if (!shouldBackup) {
            const confirmed = window.confirm("⚠️ ยืนยันการลบไฟล์โดยไม่สำรองข้อมูล? ไฟล์ที่ถูกลบไปแล้วจะไม่สามารถกู้คืนได้!");
            if (!confirmed) return;
        }

        setCleanupLoading(true);
        setMessage(shouldBackup ? 'กำลังสำรองข้อมูลและล้างพื้นที่...' : 'กำลังล้างพื้นที่จัดเก็บ...');

        try {
            if (shouldBackup) {
                // 1. Fetch data to backup
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);
                const cutoffISO = cutoffDate.toISOString();

                // Fetch slips
                const { data: slipsToBackup } = await supabase
                    .from('slip_transactions')
                    .select('id, amount, slip_url, timestamp, sender_name, user_id, bank_name, date')
                    .not('slip_url', 'is', null)
                    .lt('timestamp', cutoffISO);

                // Fetch coffee shot reports and descriptions
                const { data: chatsToBackup } = await supabase
                    .from('yuzu_chat_history')
                    .select('id, created_at, user_id, role, content, message_type')
                    .eq('message_type', 'image_description')
                    .like('content', '%[ภาพประกอบช็อตกาแฟ]%')
                    .lt('created_at', cutoffISO);

                const backupData = {
                    backup_date: new Date().toISOString(),
                    retention_days: days,
                    slips: slipsToBackup || [],
                    espresso_photos: chatsToBackup || []
                };

                // Trigger browser JSON download
                const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const link = document.createElement('a');
                link.href = url;
                link.download = `yuzu-storage-backup-${new Date().toISOString().split('T')[0]}.json`;
                document.body.appendChild(link);
                link.click();
                document.body.removeChild(link);
                URL.revokeObjectURL(url);
            }

            // 2. Call the cleanup API
            const res = await fetch('/api/yuzu/cleanup-uploads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days })
            });

            const result = await res.json();
            if (result.success) {
                setMessage(`ล้างข้อมูลสำเร็จ! ลบสลิป ${result.yuzu_slips_deleted} รูป, รูปวาด ${result.yuzu_images_deleted} รูป ✨`);
                setShowCleanupConfirm(false);
            } else {
                setMessage('เกิดข้อผิดพลาด: ' + (result.error || 'ไม่ทราบสาเหตุ'));
            }
        } catch (err) {
            console.error("Cleanup execution error:", err);
            setMessage('เกิดข้อผิดพลาดในการล้างข้อมูล: ' + err.message);
        } finally {
            setCleanupLoading(false);
            setTimeout(() => setMessage(''), 5000);
        }
    }

    const filteredKnowledge = knowledge.filter(k => 
        k.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-rams-rule-light pb-4">
                <div>
                    <h2 className="text-xl font-mono font-bold uppercase tracking-widest text-rams-ink">Yuzu AI Management</h2>
                    <p className="text-rams-ink-muted text-xs font-mono uppercase mt-1">จัดการฐานความรู้ สิทธิ์บอส และยอดโอนเงิน</p>
                </div>
                
                {/* Internal Tabs */}
                <div className="border border-rams-rule-light p-1 bg-rams-bg rounded-sm flex gap-1 self-start overflow-x-auto no-scrollbar">
                    {[
                        { id: 'knowledge', label: 'Knowledge', icon: Icons.File },
                        { id: 'insights', label: 'AI Dashboard', icon: Icons.Yuzu },
                        { id: 'config', label: 'System Config', icon: Icons.Settings },
                        { id: 'employees', label: 'Staff Roles', icon: Icons.Staff },
                        { id: 'slips', label: 'Transfer Slips', icon: Icons.Money },
                        { id: 'espresso', label: 'Espresso Log', icon: Icons.Coffee }
                    ].map(tab => (
                        <TabButton
                            key={tab.id}
                            id={tab.id}
                            active={activeTab === tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            label={tab.label}
                            icon={tab.icon}
                        />
                    ))}
                </div>
            </div>

            {/* TAB: KNOWLEDGE */}
            {activeTab === 'knowledge' && (
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <Card className="lg:col-span-1 space-y-4 h-fit lg:sticky lg:top-24">
                        <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink flex items-center gap-2">
                            <Icons.Yuzu size={18} className="text-rams-orange" />
                            Add New Fact
                        </h3>
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest px-1">Content / Fact</label>
                                <textarea
                                    className="w-full p-4 bg-rams-bg border border-rams-rule-light rounded-sm h-40 text-xs font-mono text-rams-ink outline-none focus:border-rams-rule transition-all resize-none"
                                    placeholder="ป้อนข้อมูลความรู้ให้น้องยูซุ..."
                                    value={newContent}
                                    onChange={(e) => setNewContent(e.target.value)}
                                />
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest px-1">Image URL (Optional)</label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono text-rams-ink outline-none focus:border-rams-rule"
                                    placeholder="https://example.com/image.png"
                                    value={newImageUrl}
                                    onChange={(e) => setNewImageUrl(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest px-1">Upload File (PDF/Image)</label>
                                <input
                                    type="file"
                                    accept="application/pdf,image/*"
                                    className="w-full text-xs font-mono text-rams-ink-muted file:mr-4 file:py-2 file:px-4 file:rounded-sm file:border file:border-rams-rule-light file:text-xs file:font-mono file:bg-rams-bg file:text-rams-ink hover:file:bg-rams-panel cursor-pointer"
                                    onChange={(e) => setNewFile(e.target.files[0])}
                                />
                                {newFile && <p className="text-[9px] text-rams-green font-mono font-bold px-1 mt-1">Ready to upload: {newFile.name}</p>}
                            </div>

                            <div className="pt-2">
                                <button
                                    onClick={handleAddKnowledge}
                                    disabled={loading || (!newContent && !newFile)}
                                    className="w-full py-3 bg-rams-ink text-rams-panel border border-rams-rule rounded-sm font-mono font-bold uppercase tracking-widest hover:bg-rams-ink/90 disabled:opacity-50 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                                >
                                    {loading ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-rams-panel border-t-transparent" /> : <Icons.Plus size={16} />}
                                    {loading ? "Processing..." : "Teach Yuzu"}
                                </button>
                                {message && <p className={`text-xs font-mono font-bold text-center mt-3 ${message.includes("สำเร็จ") ? "text-rams-green" : "text-rams-orange"}`}>{message}</p>}
                            </div>
                        </div>
                    </Card>

                    <div className="lg:col-span-2 space-y-4">
                        <Card className="flex items-center gap-3 py-3 px-4">
                            <Icons.Search size={16} className="text-rams-ink-muted" />
                            <input
                                type="text"
                                placeholder="Search knowledge base..."
                                className="bg-transparent border-none outline-none text-xs font-mono uppercase tracking-wider text-rams-ink w-full placeholder:text-rams-ink-muted"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </Card>
                        <Card className="p-0 overflow-hidden">
                            <div className="max-h-[600px] overflow-auto custom-scrollbar">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-rams-bg sticky top-0 z-10 text-rams-ink uppercase text-[10px] font-bold tracking-widest border-b border-rams-rule">
                                        <tr>
                                            <th className="px-6 py-4 font-mono">Content</th>
                                            <th className="px-6 py-4 w-32 font-mono">Added</th>
                                            <th className="px-6 py-4 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-rams-rule-light bg-rams-panel">
                                        {filteredKnowledge.map((k) => (
                                            <tr key={k.id} className="group hover:bg-rams-bg/50 transition-colors">
                                                <td className="px-6 py-4">
                                                    {editingId === k.id ? (
                                                        <div className="space-y-3 p-4 bg-rams-panel border border-rams-rule rounded-sm shadow-none">
                                                            <textarea 
                                                                className="w-full p-3 bg-rams-bg rounded-sm text-xs font-mono text-rams-ink outline-none h-40 resize-none border border-rams-rule-light"
                                                                value={editingContent}
                                                                onChange={(e) => setEditingContent(e.target.value)}
                                                            />
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider">Image URL</label>
                                                                <input 
                                                                    type="text"
                                                                    className="w-full p-2 bg-rams-bg rounded-sm text-xs font-mono border border-rams-rule-light text-rams-ink"
                                                                    value={editingImageUrl}
                                                                    onChange={(e) => setEditingImageUrl(e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={handleUpdateKnowledge} className="flex-1 py-2 bg-rams-ink text-rams-panel border border-rams-rule rounded-sm font-mono font-bold text-xs hover:bg-rams-ink/90">Save</button>
                                                                <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-rams-panel text-rams-ink-muted border border-rams-rule-light rounded-sm font-mono font-bold text-xs hover:bg-rams-bg">Cancel</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-4 items-start">
                                                            {k.metadata?.image_url && (
                                                                <div className="w-16 h-16 rounded-sm overflow-hidden flex-shrink-0 border border-rams-rule-light">
                                                                    <img src={k.metadata.image_url} alt="Reference" className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                            <div className="space-y-2 flex-1">
                                                                {k.metadata?.file_type === 'pdf' && (
                                                                    <div className="flex items-center gap-2 text-[10px] font-mono font-bold text-rams-red uppercase bg-rams-red/10 border border-rams-red/20 px-2 py-1 rounded-sm w-fit">
                                                                        <Icons.File size={10} /> PDF: {k.metadata.file_name}
                                                                    </div>
                                                                )}
                                                                <p className="text-rams-ink text-xs whitespace-pre-wrap leading-relaxed">{k.content}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap"><span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase">{new Date(k.created_at).toLocaleDateString("th-TH")}</span></td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button 
                                                            onClick={() => {
                                                                setEditingId(k.id);
                                                                setEditingContent(k.content);
                                                                setEditingImageUrl(k.metadata?.image_url || '');
                                                            }} 
                                                            className="p-2 text-rams-ink-muted hover:text-rams-orange rounded-sm hover:bg-rams-bg transition-all"
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                                                        </button>
                                                        <button onClick={() => handleDeleteKnowledge(k.id)} className="p-2 text-rams-ink-muted hover:text-rams-red rounded-sm hover:bg-rams-bg transition-all"><Icons.Trash size={14} /></button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                        <p className="text-center text-[10px] text-rams-ink-muted uppercase font-mono font-bold tracking-widest mt-4">Total {filteredKnowledge.length} entries</p>
                    </div>
                </div>
            )}

            {/* TAB: INSIGHTS */}
            {activeTab === 'insights' && (
                <div className="space-y-6">
                    
                    {/* Header Row */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-rams-ink p-6 rounded-sm text-rams-panel border border-rams-rule gap-4">
                        <div className="space-y-1">
                            <h3 className="text-base font-mono font-bold uppercase tracking-widest text-rams-panel flex items-center gap-2">
                                <Icons.Yuzu size={22} className="animate-bounce" />
                                Yuzu AI Operations Dashboard
                            </h3>
                            <p className="text-rams-panel/60 text-xs font-mono uppercase mt-1">วิเคราะห์พฤติกรรม สรุปงานรายวัน และแชทคุยเพื่อสั่งงานยูซุได้ทันที</p>
                        </div>
                        <button
                            onClick={() => handleGenerateBrief(selectedBriefDate)}
                            disabled={briefLoading}
                            className="bg-rams-panel text-rams-ink border border-rams-rule hover:bg-rams-bg transition-all font-mono font-bold text-xs py-2.5 px-5 rounded-sm disabled:opacity-50 active:scale-[0.98] flex items-center gap-2 cursor-pointer"
                        >
                            {briefLoading ? (
                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-rams-ink border-t-transparent" />
                            ) : (
                                <Icons.Yuzu size={14} />
                            )}
                            สรุป/อัปเดตข้อมูลประจำวัน
                        </button>
                    </div>

                    {/* Dashboard Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        {/* Left Column: AI Daily Briefing */}
                        <div className="space-y-6">
                            <Card className="p-6 space-y-4 border-t-2 border-t-rams-orange">
                                <div className="flex justify-between items-center pb-2 border-b border-rams-rule-light">
                                    <h4 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink flex items-center gap-2">
                                        <Icons.File size={18} />
                                        AI Operations Briefing
                                    </h4>
                                    <Badge color="orange">บันทึกสรุปย้อนหลัง 3 วัน</Badge>
                                </div>
                                
                                {/* Date Selector Tabs */}
                                <div className="flex border-b border-rams-rule-light pb-2 overflow-x-auto gap-1 no-scrollbar">
                                    {recentDates.map((date, idx) => {
                                        const isSelected = selectedBriefDate === date;
                                        let dayLabel = "วันนี้";
                                        if (idx === 1) dayLabel = "เมื่อวาน";
                                        else if (idx === 2) dayLabel = "2 วันก่อน";
                                        else if (idx === 3) dayLabel = "3 วันก่อน";
                                        
                                        const dateObj = new Date(date);
                                        const formattedDate = dateObj.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' });
                                        
                                        return (
                                            <button
                                                key={date}
                                                onClick={() => setSelectedBriefDate(date)}
                                                className={`flex-1 py-1.5 px-2.5 text-center rounded-sm transition-all duration-200 whitespace-nowrap min-w-[70px] cursor-pointer ${
                                                    isSelected 
                                                    ? 'bg-rams-ink text-rams-panel font-mono font-bold text-xs shadow-none' 
                                                    : 'text-rams-ink-muted hover:bg-rams-bg font-mono font-bold text-xs'
                                                }`}
                                            >
                                                <div className="text-[9px] uppercase tracking-wide opacity-80">{dayLabel}</div>
                                                <div className="text-xs">{formattedDate}</div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {briefLoading ? (
                                    <div className="py-12 flex flex-col items-center justify-center space-y-3 text-rams-ink-muted">
                                        <span className="animate-spin rounded-full h-8 w-8 border-4 border-rams-orange border-t-transparent" />
                                        <p className="text-xs font-mono font-bold animate-pulse">ยูซุกำลังวิเคราะห์ข้อมูลกะงานและสรุปห้องแชท...</p>
                                    </div>
                                ) : dailyBriefs[selectedBriefDate] ? (
                                    <div className="bg-rams-bg p-4 rounded-sm border border-rams-rule-light text-rams-ink text-xs font-mono whitespace-pre-wrap leading-relaxed">
                                        {dailyBriefs[selectedBriefDate]}
                                    </div>
                                ) : (
                                    <div className="py-12 text-center text-rams-ink-muted space-y-3 font-mono">
                                        <p className="text-xs font-bold">ยังไม่มีการสร้างสรุปประจำวันนี้</p>
                                        <button 
                                            onClick={() => handleGenerateBrief(selectedBriefDate)}
                                            className="text-xs font-bold text-rams-orange hover:text-rams-orange/95 underline cursor-pointer"
                                        >
                                            กดเพื่อสร้างสรุปเมี๊ยว~
                                        </button>
                                    </div>
                                )}

                                {/* PDF Actions */}
                                {dailyBriefs[selectedBriefDate] && !briefLoading && (
                                    <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-rams-rule-light">
                                        <button
                                            onClick={() => handleExportSingleBriefPDF(selectedBriefDate)}
                                            disabled={pdfLoading}
                                            className="flex-1 py-2 px-3 bg-rams-panel border border-rams-rule-light text-rams-ink hover:bg-rams-bg transition-all font-mono font-bold text-xs rounded-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                        >
                                            {pdfLoading ? (
                                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-rams-ink border-t-transparent" />
                                            ) : (
                                                <Icons.File size={13} />
                                            )}
                                            ส่งออก PDF สรุปประจำวัน
                                        </button>
                                        <button
                                            onClick={handleExportThreeDayReportPDF}
                                            disabled={pdfLoading}
                                            className="flex-1 py-2 px-3 bg-rams-ink text-rams-panel border border-rams-rule hover:bg-rams-ink/90 transition-all font-mono font-bold text-xs rounded-sm flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                        >
                                            {pdfLoading ? (
                                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-rams-panel border-t-transparent" />
                                            ) : (
                                                <Icons.File size={13} />
                                            )}
                                            ส่งออก PDF ย้อนหลัง 3 วัน
                                        </button>
                                    </div>
                                )}
                            </Card>

                            {/* Sentiment Tracker & Mood Index */}
                            <Card className="p-6 space-y-4 border-t-2 border-t-rams-rule">
                                <h4 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink flex items-center gap-2">
                                    <Icons.Alert size={18} />
                                    Sentiment Tracker (ดัชนีอารมณ์ทีมงาน)
                                </h4>
                                
                                {(() => {
                                    const { stats, total } = getMoodStats();
                                    return (
                                        <div className="space-y-4">
                                            <div className="grid grid-cols-5 gap-2 text-center">
                                                {Object.entries(stats).map(([mood, count]) => {
                                                    const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                                                    const label = mood === '🔥' ? 'Fired Up' : mood === '😊' ? 'Happy' : mood === '😐' ? 'Neutral' : mood === '😴' ? 'Sleepy' : 'Sick';
                                                    const color = mood === '🔥' ? 'text-rams-orange' : mood === '😊' ? 'text-rams-green' : mood === '😐' ? 'text-rams-ink-muted' : mood === '😴' ? 'text-rams-amber' : 'text-rams-red';
                                                    return (
                                                        <div key={mood} className="bg-rams-bg p-2.5 rounded-sm border border-rams-rule-light space-y-1">
                                                            <span className="text-2xl block">{mood}</span>
                                                            <span className={`text-[9px] font-mono font-bold block uppercase tracking-wider ${color}`}>{label}</span>
                                                            <span className="text-[10px] font-mono font-bold text-rams-ink">{count} คน ({percentage}%)</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Beautiful horizontal bar of mood breakdown */}
                                            <div className="w-full h-3 rounded-sm bg-rams-bg border border-rams-rule-light overflow-hidden flex">
                                                {Object.entries(stats).map(([mood, count]) => {
                                                    if (count === 0) return null;
                                                    const percentage = (count / total) * 100;
                                                    const bg = mood === '🔥' ? 'bg-rams-orange' : mood === '😊' ? 'bg-rams-green' : mood === '😐' ? 'bg-rams-ink-muted' : mood === '😴' ? 'bg-rams-amber' : 'bg-rams-red';
                                                    return (
                                                        <div 
                                                            key={mood} 
                                                            style={{ width: `${percentage}%` }} 
                                                            className={`${bg} transition-all duration-500`}
                                                            title={`${mood}: ${count} คน`}
                                                        />
                                                    );
                                                })}
                                            </div>
                                            <p className="text-[9px] font-mono font-bold text-rams-ink-muted text-center uppercase tracking-widest">
                                                Mood logs count: {total} record(s) today
                                            </p>
                                        </div>
                                    );
                                })()}
                            </Card>
                        </div>

                        {/* Right Column: Interactive Chat & Timeline */}
                        <div className="space-y-6">
                            
                            {/* Interactive Console Chat */}
                            <Card className="p-0 border border-rams-rule bg-rams-ink rounded-sm overflow-hidden flex flex-col h-[380px] shadow-none">
                                {/* Header */}
                                <div className="bg-rams-ink px-4 py-3 flex justify-between items-center text-rams-panel border-b border-rams-rule">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-rams-green animate-ping" />
                                        <span className="font-mono text-xs font-bold text-rams-green">YUZU_INTERACTIVE_CONSOLE v3.5</span>
                                    </div>
                                    <Badge color="purple" className="font-mono text-[9px]">GEMINI-3.5-FLASH</Badge>
                                </div>

                                {/* Messages list */}
                                <div className="bg-rams-ink flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar font-mono text-xs text-rams-panel/90">
                                    {chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] p-3 rounded-sm leading-relaxed whitespace-pre-wrap ${
                                                msg.role === 'user' 
                                                ? 'bg-rams-panel text-rams-ink border border-rams-rule rounded-tr-none' 
                                                : 'bg-rams-ink border border-rams-rule-light text-rams-green rounded-tl-none'
                                            }`}>
                                                <div className="text-[9px] font-bold font-mono uppercase tracking-widest mb-1 flex items-center gap-1">
                                                    {msg.role === 'user' ? <span className="text-rams-orange">BOSS</span> : <span className="text-rams-green">🐱 YUZU</span>}
                                                </div>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-rams-ink border border-rams-rule-light text-rams-green/70 p-3 rounded-sm rounded-tl-none flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-rams-green animate-bounce delay-100" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-rams-green animate-bounce delay-200" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-rams-green animate-bounce delay-300" />
                                                <span className="text-[9px] font-mono font-bold">Yuzu is thinking...</span>
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Form Input */}
                                <form 
                                    onSubmit={(e) => {
                                        e.preventDefault();
                                        handleSendConsoleChat();
                                    }}
                                    className="bg-rams-ink p-3 flex gap-2 border-t border-rams-rule"
                                >
                                    <input 
                                        type="text" 
                                        placeholder="ถามตารางกะงาน, ราคาของ, หรือประเมินพนักงาน..."
                                        className="flex-1 bg-rams-ink border border-rams-rule-light rounded-sm px-4 py-2 text-xs font-mono text-rams-panel outline-none focus:border-rams-panel"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        disabled={chatLoading}
                                    />
                                    <button 
                                        type="submit"
                                        disabled={chatLoading || !chatInput.trim()}
                                        className="bg-rams-orange border border-rams-orange text-rams-panel font-mono font-bold text-xs py-2 px-4 rounded-sm hover:bg-rams-orange-active disabled:opacity-40 transition-all cursor-pointer"
                                    >
                                        ส่ง
                                    </button>
                                </form>
                            </Card>

                            {/* Staff Mood Timeline */}
                            <Card className="p-6 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar rounded-sm bg-rams-panel border border-rams-rule-light shadow-none">
                                <h4 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink sticky top-0 bg-rams-panel py-1 flex items-center gap-2">
                                    <Icons.Clock size={18} />
                                    Staff Mood & Notes Timeline (บันทึกอารมณ์ล่าสุด)
                                </h4>
                                
                                <div className="space-y-3">
                                    {attendanceLogs.filter(log => log.mood_status || log.mood_note).length === 0 ? (
                                        <p className="text-center text-xs font-mono font-bold text-rams-ink-muted py-6">ยังไม่มีการบันทึกอารมณ์ในขณะนี้</p>
                                    ) : (
                                        attendanceLogs
                                            .filter(log => log.mood_status || log.mood_note)
                                            .map((log) => {
                                                const empName = log.employees?.nickname || log.employees?.name || 'พนักงาน';
                                                const time = new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                                                const actionLabel = log.action_type === 'check_in' ? 'เข้างาน' : 'ออกงาน';
                                                return (
                                                    <div key={log.id} className="flex gap-3 items-start border-b border-rams-rule-light pb-2.5 last:border-0 last:pb-0">
                                                        <span className="text-2xl bg-rams-bg p-1.5 rounded-sm border border-rams-rule-light flex-shrink-0">
                                                            {log.mood_status || '😐'}
                                                        </span>
                                                        <div className="space-y-0.5 flex-1">
                                                            <div className="flex justify-between items-center">
                                                                <span className="font-bold text-rams-ink text-xs">{empName}</span>
                                                                <span className="text-[9px] text-rams-ink-muted font-mono font-bold uppercase">{time} ({actionLabel})</span>
                                                            </div>
                                                            {log.mood_note && (
                                                                <p className="text-xs bg-rams-bg text-rams-ink-muted p-2.5 rounded-sm border border-rams-rule-light italic font-mono">
                                                                    "{log.mood_note}"
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>
                            </Card>
                        </div>
                    </div>

                    {/* Collapsible Pending Facts Accordion */}
                    <Card className="border border-rams-rule overflow-hidden p-0 shadow-none rounded-sm">
                        {/* Accordion Trigger Header */}
                        <button 
                            onClick={() => setIsPendingInsightsExpanded(!isPendingInsightsExpanded)}
                            className="w-full bg-rams-bg hover:bg-rams-bg/85 p-4 px-6 flex justify-between items-center text-rams-ink font-mono font-bold uppercase tracking-wider text-xs transition-all border-b border-rams-rule-light cursor-pointer"
                        >
                            <div className="flex items-center gap-2">
                                <Icons.Yuzu size={18} className="text-rams-orange" />
                                <span>คลังความรู้ที่ยูซุแอบจำมารอการอนุมัติ ({insights.length} รายการ)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge color="purple">{insights.length}</Badge>
                                {isPendingInsightsExpanded ? <Icons.Up size={16} /> : <Icons.Down size={16} />}
                            </div>
                        </button>

                        {/* Accordion Content */}
                        {isPendingInsightsExpanded && (
                            <div className="p-6 bg-rams-panel space-y-4">
                                <p className="text-xs text-rams-ink-muted leading-relaxed font-sans">
                                    นี่คือชุดข้อมูล/ข้อเท็จจริงใหม่ที่ยูซุคัดกรองจากบทสนทนาในห้องแชทของร้าน In The Haus คุณพ่อคุณแม่สามารถเลือก Approve เพื่อบันทึกเข้าฐานความรู้หลัก (Knowledge Base) สำหรับใช้ตอบคำถาม หรือคลิก Delete เพื่อยกเลิกข้อมูลดังกล่าวได้ครับ
                                </p>
                                
                                {insights.length === 0 ? (
                                    <div className="py-12 text-center text-rams-ink-muted font-mono font-bold text-xs">
                                        <p>ไม่มีรายการค้างอนุมัติเมี๊ยว~ 💤</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {insights.map(item => (
                                            <Card key={item.id} className="group hover:border-rams-rule transition-all border-l-4 border-l-rams-orange rounded-sm border border-rams-rule-light p-5 space-y-4 bg-rams-bg/30">
                                                <div className="flex justify-between items-start">
                                                    <Badge color={item.metadata?.is_problem ? "rose" : "purple"}>
                                                        {item.metadata?.category || 'GENERAL'}
                                                    </Badge>
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase">{new Date(item.created_at).toLocaleTimeString('th-TH')}</span>
                                                </div>
                                                
                                                <p className="text-xs font-mono text-rams-ink leading-relaxed">
                                                    {item.content}
                                                </p>
                                                
                                                <div className="space-y-2 py-2">
                                                    <label className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest block">Keywords (พิมพ์แล้วกด Enter)</label>
                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                        {(item.metadata?.keywords || []).map((kw, idx) => (
                                                            <span key={idx} className="bg-rams-bg text-rams-ink px-2 py-1 rounded-sm border border-rams-rule-light text-[9px] font-mono font-bold flex items-center gap-1 group/tag transition-all hover:bg-rams-panel">
                                                                {kw}
                                                                <button 
                                                                    onClick={() => {
                                                                        const newKeywords = item.metadata.keywords.filter((_, i) => i !== idx);
                                                                        handleUpdateInsightKeywords(item.id, newKeywords.join(','));
                                                                    }}
                                                                    className="text-rams-ink-muted hover:text-rams-red transition-colors cursor-pointer"
                                                                >
                                                                    <Icons.X size={10} />
                                                                </button>
                                                            </span>
                                                        ))}
                                                    </div>
                                                    <input 
                                                        type="text" 
                                                        placeholder="เพิ่ม keyword..."
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter' && e.target.value.trim()) {
                                                                const val = e.target.value.trim();
                                                                const currentKeywords = item.metadata?.keywords || [];
                                                                if (!currentKeywords.includes(val)) {
                                                                    handleUpdateInsightKeywords(item.id, [...currentKeywords, val].join(','));
                                                                }
                                                                e.target.value = '';
                                                            }
                                                        }}
                                                        className="w-full text-xs font-mono font-bold text-rams-ink bg-rams-bg p-2 border border-rams-rule-light rounded-sm outline-none focus:border-rams-rule transition-all"
                                                    />
                                                </div>
                                                
                                                <div className="flex gap-2 pt-2">
                                                    <button 
                                                        onClick={() => handleVerifyInsight(item.id)}
                                                        className="flex-1 bg-rams-green text-rams-panel border border-rams-green hover:bg-rams-green/90 py-2 rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                                                    >
                                                        Approve & Save
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteKnowledge(item.id)}
                                                        className="px-4 bg-rams-panel border border-rams-rule-light text-rams-ink-muted hover:text-rams-red hover:border-rams-red/30 py-2 rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                                                    >
                                                        Delete
                                                    </button>
                                                </div>
                                            </Card>
                                        ))}
                                    </div>
                                )}
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* TAB: CONFIG */}
            {activeTab === 'config' && (
                <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="space-y-6">
                            <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink flex items-center gap-2">
                                <Icons.Staff size={18} />
                                Boss UIDs (ตั้งค่าบอส)
                            </h3>
                            <div className="space-y-4">
                                {[
                                    { key: 'father_uid', label: 'คุณพ่อ (Father)', placeholder: 'U77e...' },
                                    { key: 'mother_uid', label: 'คุณแม่ (Mother)', placeholder: 'U8c5...' }
                                ].map(boss => (
                                    <div key={boss.key}>
                                        <label className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-wider mb-1 block">{boss.label}</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                className="flex-1 p-3 bg-rams-bg border border-rams-rule-light rounded-sm text-xs font-mono text-rams-ink outline-none focus:border-rams-rule transition-all"
                                                value={config[boss.key] || ''}
                                                onChange={(e) => setConfig({...config, [boss.key]: e.target.value})}
                                                placeholder={boss.placeholder}
                                            />
                                            <button 
                                                onClick={() => handleUpdateConfig(boss.key, config[boss.key])}
                                                className="px-4 bg-rams-ink text-rams-panel border border-rams-rule rounded-sm text-xs font-mono font-bold uppercase tracking-widest hover:bg-rams-ink/90 transition-all cursor-pointer"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card className="bg-rams-bg border border-rams-rule-light shadow-none">
                            <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink flex items-center gap-2">
                                <Icons.Alert size={18} />
                                About Configuration
                            </h3>
                            <p className="text-xs font-mono text-rams-ink-muted leading-relaxed mt-2">
                                การตั้งค่า UID บอสจะช่วยให้น้องยูซุแยกแยะและตอบโต้กับผู้บริหารด้วยสไตล์ที่นอบน้อมเป็นพิเศษ โดยค่าเหล่านี้จะถูกจัดเก็บไว้ในฐานข้อมูลและประมวลผลทันทีเมื่อมีการแชท
                            </p>
                        </Card>
                    </div>

                    <Card className="space-y-6">
                        <h3 className="font-mono font-bold text-xs uppercase tracking-wider text-rams-ink flex items-center gap-2">
                            <Icons.Yuzu size={18} />
                            Role-based Personality (ปรับบุคลิกรายตำแหน่ง)
                        </h3>
                        <p className="text-xs font-mono text-rams-ink-muted">กำหนดคำสั่งพิเศษ (Instruction) ให้น้องยูซุใช้คุยกับแต่ละตำแหน่งงาน</p>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {[
                                { key: 'role_instruction_Bar&Floor', label: 'Bar & Floor (หน้าร้าน)', color: 'blue' },
                                { key: 'role_instruction_Kitchen', label: 'Kitchen (ในครัว)', color: 'rose' },
                                { key: 'role_instruction_Admin', label: 'Admin (จัดการระบบ)', color: 'slate' }
                            ].map(role => (
                                <div key={role.key} className="space-y-3">
                                    <Badge color={role.color} className="uppercase tracking-widest">{role.label}</Badge>
                                    <textarea 
                                        className="w-full p-4 bg-rams-bg border border-rams-rule-light rounded-sm h-32 text-xs font-mono text-rams-ink outline-none focus:border-rams-rule transition-all resize-none shadow-none"
                                        placeholder={`ใส่คำสั่งพิเศษสำหรับกลุ่ม ${role.label}...`}
                                        value={config[role.key] || ''}
                                        onChange={(e) => setConfig({...config, [role.key]: e.target.value})}
                                        onBlur={(e) => handleUpdateConfig(role.key, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card className="space-y-6 border border-rams-amber bg-rams-amber/10 shadow-none">
                        <div className="flex items-center gap-2 text-rams-ink">
                            <Icons.Trash size={18} />
                            <h3 className="font-mono font-bold text-xs uppercase tracking-wider">Storage Cleanup & Backup (ล้างข้อมูลรูปภาพเก่าเพื่อประหยัดพื้นที่)</h3>
                        </div>
                        <p className="text-xs font-mono text-rams-ink-muted leading-relaxed">
                            คุณสามารถเคลียร์พื้นที่จัดเก็บข้อมูล (Supabase Storage) โดยการลบไฟล์รูปภาพสลิปและรูปภาพประกอบการชงกาแฟที่เก่ากว่า 30 วัน 
                            ระบบจะลบเฉพาะไฟล์รูปภาพออกไปอย่างถาวร แต่จะยังคงเก็บข้อมูลสรุปตัวเลขและประวัติแชทเอาไว้ (ไม่ส่งผลกระทบต่อหน้ารายงาน PDF นอกจากการไม่แสดงรูปประกอบที่ถูกลบไปแล้ว)
                        </p>
                        
                        {!showCleanupConfirm ? (
                            <button
                                onClick={() => setShowCleanupConfirm(true)}
                                disabled={cleanupLoading}
                                className="px-6 py-3 bg-rams-amber border border-rams-amber text-rams-ink font-mono font-bold text-xs tracking-widest uppercase hover:bg-rams-amber/90 transition-all flex items-center gap-2 w-fit disabled:opacity-50 rounded-sm cursor-pointer"
                            >
                                {cleanupLoading ? <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-rams-ink border-t-transparent" /> : <Icons.Trash size={14} />}
                                เริ่มต้นล้างข้อมูลภาพประกอบ (Delete Old Uploads)
                            </button>
                        ) : (
                            <div className="bg-rams-bg border border-rams-rule-light rounded-sm p-5 space-y-4 animate-in fade-in duration-200">
                                <div className="space-y-1">
                                    <p className="text-xs font-mono font-bold text-rams-red">
                                        ⚠️ แจ้งเตือน: ระบบจะค้นหาและลบรูปภาพสลิป / ภาพกาแฟในระบบที่อายุเกิน 30 วันทั้งหมดออกอย่างถาวร
                                    </p>
                                    <p className="text-[11px] font-mono text-rams-ink-muted">
                                        แนะนำให้ดาวน์โหลดข้อมูลสำรอง (Backup) ไว้ก่อนลบ เพื่อเก็บข้อมูลสลิปและรูปกาแฟเป็นไฟล์ไว้ในเครื่องของคุณ
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    <button 
                                        onClick={() => handleExecuteCleanup(30, true)} 
                                        disabled={cleanupLoading}
                                        className="bg-rams-green text-rams-panel border border-rams-green hover:bg-rams-green/90 text-xs font-mono font-bold uppercase tracking-wider py-2.5 px-4 rounded-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                    >
                                        {cleanupLoading ? <span className="animate-spin rounded-full h-3 w-3 border-2 border-rams-panel border-t-transparent" /> : null}
                                        ดาวน์โหลดข้อมูลสำรอง + ลบไฟล์ (แนะนำ)
                                    </button>
                                    <button 
                                        onClick={() => handleExecuteCleanup(30, false)} 
                                        disabled={cleanupLoading}
                                        className="bg-rams-red text-rams-panel border border-rams-red hover:bg-rams-red/90 text-xs font-mono font-bold uppercase tracking-wider py-2.5 px-4 rounded-sm transition-all flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                    >
                                        {cleanupLoading ? <span className="animate-spin rounded-full h-3 w-3 border-2 border-rams-panel border-t-transparent" /> : null}
                                        ลบไฟล์ทันที (ไม่สำรอง)
                                    </button>
                                    <button 
                                        onClick={() => setShowCleanupConfirm(false)} 
                                        disabled={cleanupLoading}
                                        className="bg-rams-panel border border-rams-rule-light text-rams-ink hover:bg-rams-bg text-xs font-mono font-bold uppercase tracking-wider py-2.5 px-4 rounded-sm transition-all disabled:opacity-50 cursor-pointer"
                                    >
                                        ยกเลิก
                                    </button>
                                </div>
                            </div>
                        )}
                    </Card>
                </div>
            )}

            {/* TAB: EMPLOYEES */}
            {activeTab === 'employees' && (
                <div className="space-y-4">
                    <Card className="p-4 bg-rams-bg border border-rams-rule-light flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="space-y-1">
                            <h4 className="text-xs font-mono font-bold uppercase tracking-wider text-rams-ink flex items-center gap-2">
                                📝 ระบบประเมินบทบาทและประสิทธิภาพพนักงาน (Appraisal)
                            </h4>
                            <p className="text-xs font-mono text-rams-ink-muted">
                                คลิกแถวรายชื่อพนักงานเพื่อเปิดกล่องบันทึก <b>หน้าที่ความรับผิดชอบ</b>, <b>สิ่งที่ดีแล้ว</b> และ <b>สิ่งที่ต้องปรับปรุง</b> หรือเรียกให้ ยูซุ AI ช่วยสรุปการประเมินได้เมี๊ยว~ 🐱
                            </p>
                        </div>
                    </Card>

                    <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-rams-bg border-b border-rams-rule text-rams-ink font-mono font-bold text-[10px] uppercase tracking-widest">
                                    <tr>
                                        <th className="px-6 py-4">Staff</th>
                                        <th className="px-6 py-4">Position (ใช้แยก Role)</th>
                                        <th className="px-6 py-4">Bot Chat ID (UID)</th>
                                        <th className="px-6 py-4 text-center">Status</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-rams-rule-light">
                                    {employees.map(emp => {
                                        const isExpanded = expandedEmpId === emp.id;
                                        return (
                                            <React.Fragment key={emp.id}>
                                                <tr 
                                                    className={`hover:bg-rams-bg/50 border-b border-rams-rule-light transition-colors cursor-pointer ${isExpanded ? 'bg-rams-bg' : 'bg-rams-panel'}`}
                                                    onClick={() => setExpandedEmpId(isExpanded ? null : emp.id)}
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-[9px] font-mono text-rams-ink-muted font-bold w-4 text-center select-none">
                                                                {isExpanded ? '▼' : '▶'}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-rams-ink font-mono text-xs uppercase tracking-wide flex items-center gap-2">
                                                                    {emp.nickname || emp.name}
                                                                    {(emp.duties || emp.strengths || emp.improvements) && (
                                                                        <span className="w-1.5 h-1.5 rounded-sm bg-rams-orange" title="มีบันทึกประเมินแล้ว" />
                                                                    )}
                                                                </div>
                                                                <div className="text-[9px] font-mono text-rams-ink-muted">{emp.name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                        <input 
                                                            type="text" 
                                                            className="w-full p-2 bg-transparent border border-transparent hover:border-rams-rule-light focus:border-rams-rule rounded-sm outline-none font-mono text-xs text-rams-ink transition-all"
                                                            value={emp.position || ''}
                                                            onChange={(e) => {
                                                                const val = e.target.value;
                                                                setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, position: val} : item));
                                                            }}
                                                            onBlur={(e) => handleUpdateEmployee(emp.id, 'position', e.target.value)}
                                                        />
                                                    </td>
                                                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                        <input 
                                                            type="text" 
                                                            className="w-full p-2 bg-transparent border border-transparent hover:border-rams-rule-light focus:border-rams-rule rounded-sm outline-none font-mono text-[11px] text-rams-ink-muted transition-all"
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
                                                            <div className={`w-2 h-2 rounded-sm ${emp.line_bot_id ? 'bg-rams-green animate-pulse' : 'bg-rams-rule-light'}`} />
                                                            <span className="text-[8px] font-mono font-bold text-rams-ink-muted uppercase">{emp.line_bot_id ? 'Linked' : 'No ID'}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-rams-bg/30">
                                                        <td colSpan="4" className="px-6 py-6 border-b border-rams-rule-light">
                                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                                {/* Duties Section */}
                                                                <div className="space-y-2">
                                                                    <label className="text-[10px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest block">📋 หน้าที่ความรับผิดชอบ (Duties)</label>
                                                                    <textarea 
                                                                        className="w-full p-3.5 bg-rams-bg border border-rams-rule-light rounded-sm h-36 text-xs font-mono text-rams-ink outline-none focus:border-rams-rule transition-all resize-none shadow-none leading-relaxed"
                                                                        placeholder="ระบุหน้าที่ความรับผิดชอบหลักของพนักงานคนนี้..."
                                                                        value={emp.duties || ''}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, duties: val} : item));
                                                                        }}
                                                                        onBlur={(e) => handleUpdateEmployee(emp.id, 'duties', e.target.value)}
                                                                    />
                                                                </div>

                                                                {/* Strengths Section */}
                                                                <div className="space-y-2">
                                                                    <label className="text-[10px] font-mono font-bold text-rams-green uppercase tracking-widest block">💚 สิ่งที่ดีแล้ว (Strengths)</label>
                                                                    <textarea 
                                                                        className="w-full p-3.5 bg-rams-bg border border-rams-rule-light rounded-sm h-36 text-xs font-mono text-rams-ink outline-none focus:border-rams-rule transition-all resize-none shadow-none leading-relaxed"
                                                                        placeholder="จุดแข็งและสิ่งที่คุณประทับใจในพนักงานคนนี้..."
                                                                        value={emp.strengths || ''}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, strengths: val} : item));
                                                                        }}
                                                                        onBlur={(e) => handleUpdateEmployee(emp.id, 'strengths', e.target.value)}
                                                                    />
                                                                </div>

                                                                {/* Improvements Section */}
                                                                <div className="space-y-2">
                                                                    <div className="flex justify-between items-center">
                                                                        <label className="text-[10px] font-mono font-bold text-rams-orange uppercase tracking-widest block">🧡 สิ่งที่ต้องปรับปรุง (Improvements)</label>
                                                                        
                                                                        {/* AI evaluate button */}
                                                                        <button
                                                                            onClick={() => handleAiEvaluateEmployee(emp.id)}
                                                                            disabled={aiLoadingEmpId === emp.id}
                                                                            className="bg-rams-bg hover:bg-rams-panel text-rams-ink border border-rams-rule-light font-mono font-bold text-[9px] px-2.5 py-1 rounded-sm transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50 cursor-pointer"
                                                                        >
                                                                            {aiLoadingEmpId === emp.id ? (
                                                                                <>
                                                                                    <span className="animate-spin rounded-full h-2.5 w-2.5 border-2 border-rams-ink border-t-transparent" />
                                                                                    <span>กำลังวิเคราะห์...</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <span>✨ ยูซุช่วยวิเคราะห์</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                    <textarea 
                                                                        className="w-full p-3.5 bg-rams-bg border border-rams-rule-light rounded-sm h-36 text-xs font-mono text-rams-ink outline-none focus:border-rams-rule transition-all resize-none shadow-none leading-relaxed"
                                                                        placeholder="จุดอ่อนหรือพฤติกรรมที่ควรแนะนำตักเตือนและปรับปรุง..."
                                                                        value={emp.improvements || ''}
                                                                        onChange={(e) => {
                                                                            const val = e.target.value;
                                                                            setEmployees(prev => prev.map(item => item.id === emp.id ? {...item, improvements: val} : item));
                                                                        }}
                                                                        onBlur={(e) => handleUpdateEmployee(emp.id, 'improvements', e.target.value)}
                                                                    />
                                                                </div>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                )}
                                            </React.Fragment>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </Card>
                </div>
            )}

            {/* TAB: SLIPS */}
            {activeTab === 'slips' && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4 bg-rams-panel p-2 px-4 rounded-sm border border-rams-rule-light w-fit">
                            <span className="text-[10px] font-mono font-bold uppercase text-rams-ink-muted tracking-wider">เลือกวันที่:</span>
                            <input 
                                type="date" 
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent font-mono font-bold text-rams-ink outline-none text-xs cursor-pointer"
                            />
                        </div>
                        
                        <a 
                            href={`/admin/report/slips?date=${selectedDate}`} 
                            target="_blank"
                            className="bg-rams-ink text-rams-panel border border-rams-rule px-6 py-3 rounded-sm font-mono font-bold text-[10px] tracking-widest uppercase hover:bg-rams-ink/90 transition-all flex items-center gap-2 cursor-pointer"
                        >
                            <Icons.File size={14} /> PDF REPORT
                        </a>
                    </div>

                    <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-rams-bg text-rams-ink font-mono font-bold text-[10px] uppercase tracking-widest border-b border-rams-rule">
                                    <tr>
                                        <th className="px-6 py-4 font-mono">Time</th>
                                        <th className="px-6 py-4 font-mono">Sender</th>
                                        <th className="px-6 py-4 font-mono">Staff</th>
                                        <th className="px-6 py-4 font-mono">Bank</th>
                                        <th className="px-6 py-4 font-mono">Amount (THB)</th>
                                        <th className="px-6 py-4 font-mono">Proof</th>
                                        <th className="px-6 py-4 text-center font-mono">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-rams-rule-light bg-rams-panel">
                                    {slipLoading ? (
                                        <tr>
                                            <td colSpan="7" className="p-12 text-center text-rams-ink-muted italic font-mono">กำลังดึงข้อมูลสลิป...</td>
                                        </tr>
                                    ) : slips.length === 0 ? (
                                        <tr>
                                            <td colSpan="7" className="p-20 text-center">
                                                <p className="text-rams-ink-muted font-mono font-bold uppercase tracking-widest mb-1">No Transactions</p>
                                                <p className="text-rams-ink-muted font-mono text-[9px]">ไม่พบข้อมูลสลิปในวันที่เลือก</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        slips.map((slip) => (
                                            <tr key={slip.id} className="hover:bg-rams-bg/50 transition-colors group">
                                                <td className="px-6 py-4">
                                                    <div className="font-mono font-bold text-rams-ink text-xs">{format(new Date(slip.timestamp), 'HH:mm:ss')}</div>
                                                    <div className="text-[9px] text-rams-ink-muted uppercase font-mono">{format(new Date(slip.timestamp), 'dd MMM yyyy')}</div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-mono text-xs text-rams-ink">
                                                        {slip.sender_name || 'External'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-mono text-rams-ink-muted text-[9px] uppercase font-bold tracking-wider">
                                                        {getEmployeeName(slip.user_id, '-')}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-mono text-rams-ink-muted text-[9px] uppercase">
                                                        {slip.bank_name || '-'}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <span className="text-base font-mono font-bold tracking-tight text-rams-ink">
                                                        {Number(slip.amount).toLocaleString('th-TH', {minimumFractionDigits: 2})}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4">
                                                    {slip.slip_url ? (
                                                        <a href={slip.slip_url} target="_blank" rel="noreferrer" className="text-[9px] font-mono font-bold uppercase tracking-widest py-2 px-4 rounded-sm border border-rams-rule-light bg-rams-bg text-rams-ink hover:bg-rams-ink hover:text-rams-panel transition-all">
                                                            View Slip
                                                        </a>
                                                    ) : <span className="text-rams-ink-muted font-mono">-</span>}
                                                </td>
                                                <td className="px-6 py-4 text-center">
                                                    <button 
                                                        onClick={() => handleDeleteSlip(slip.id)}
                                                        className="p-2 text-rams-ink-muted hover:text-rams-red opacity-0 group-hover:opacity-100 rounded-sm hover:bg-rams-bg transition-all cursor-pointer"
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

            {/* TAB: ESPRESSO */}
            {activeTab === 'espresso' && (
                <div className="space-y-6">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                        <div className="flex items-center gap-4 bg-rams-panel p-2 px-4 rounded-sm border border-rams-rule-light w-fit">
                            <span className="text-[10px] font-mono font-bold uppercase text-rams-ink-muted tracking-wider">เลือกวันที่:</span>
                            <input 
                                type="date" 
                                value={selectedDate}
                                onChange={(e) => setSelectedDate(e.target.value)}
                                className="bg-transparent font-mono font-bold text-rams-ink outline-none text-xs cursor-pointer"
                            />
                        </div>
                        
                        <a 
                            href={`/admin/report/espresso?date=${selectedDate}`} 
                            target="_blank"
                            className="bg-rams-ink text-rams-panel border border-rams-rule px-6 py-3 rounded-sm font-mono font-bold text-[10px] tracking-widest uppercase hover:bg-rams-ink/90 transition-all flex items-center gap-2 cursor-pointer"
                        >
                            <Icons.File size={14} /> PDF REPORT
                        </a>
                    </div>

                    <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-rams-bg text-rams-ink font-mono font-bold text-[10px] uppercase tracking-widest border-b border-rams-rule">
                                    <tr>
                                        <th className="px-6 py-4 font-mono">Time</th>
                                        <th className="px-6 py-4 font-mono">Barista</th>
                                        <th className="px-6 py-4 font-mono">Parameters (Raw Log)</th>
                                        <th className="px-6 py-4 font-mono">Yuzu Recommendation</th>
                                        <th className="px-6 py-4 font-mono">Photos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-rams-rule-light bg-rams-panel">
                                    {espressoLoading ? (
                                        <tr>
                                            <td colSpan="5" className="p-12 text-center text-rams-ink-muted italic font-mono">กำลังดึงข้อมูลรายงานช็อตกาแฟ...</td>
                                        </tr>
                                    ) : espressoReports.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="p-20 text-center">
                                                <p className="text-rams-ink-muted font-mono font-bold uppercase tracking-widest mb-1">No Espresso Reports</p>
                                                <p className="text-rams-ink-muted font-mono text-[9px]">ไม่พบรายงานการสกัดช็อตกาแฟในวันที่เลือก</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        espressoReports.map((report) => (
                                            <tr key={report.id} className="hover:bg-rams-bg/50 transition-colors group">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-mono font-bold text-rams-ink text-xs">{format(new Date(report.timestamp), 'HH:mm:ss')}</div>
                                                    <div className="text-[9px] text-rams-ink-muted uppercase font-mono">{format(new Date(report.timestamp), 'dd MMM yyyy')}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-mono font-bold text-rams-ink text-xs">
                                                        {getEmployeeName(report.userId, '-')}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-mono text-xs text-rams-ink max-w-xs overflow-hidden text-ellipsis whitespace-nowrap" title={report.rawText}>
                                                        {report.rawText}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-mono text-xs text-rams-ink-muted max-w-sm overflow-hidden text-ellipsis whitespace-nowrap italic" title={report.recommendation}>
                                                        {report.recommendation}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {report.photos.length > 0 ? (
                                                        <div className="flex gap-1.5 items-center">
                                                            <span className="text-[9px] font-mono font-bold bg-rams-bg text-rams-orange border border-rams-orange/20 px-2 py-0.5 rounded-sm">
                                                                {report.photos.length} Photo(s)
                                                            </span>
                                                            <div className="flex gap-1">
                                                                {report.photos.map((url, i) => (
                                                                    <a key={i} href={url} target="_blank" rel="noreferrer" className="w-6 h-6 rounded-sm border border-rams-rule-light overflow-hidden block">
                                                                        <img src={url} className="w-full h-full object-cover" />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : <span className="text-rams-ink-muted font-mono">-</span>}
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
                 <div className="fixed bottom-8 right-8 z-[100] bg-rams-ink text-rams-panel px-6 py-3 rounded-sm border border-rams-rule shadow-none flex items-center gap-3 animate-in fade-in">
                    <span className="w-2 h-2 rounded-sm bg-rams-orange animate-ping" />
                    <span className="text-xs font-mono font-bold uppercase tracking-wider">{message}</span>
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

// Minimal Alert icon
if (!Icons.Alert) {
    Icons.Alert = ({ size, className }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
    );
}

// Minimal Coffee icon
if (!Icons.Coffee) {
    Icons.Coffee = ({ size }) => (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8h1a4 4 0 0 1 0 8h-1"></path>
            <path d="M2 8h16v9a4 4 0 0 1-4 4H6a4 4 0 0 1-4-4V8z"></path>
            <line x1="6" y1="1" x2="6" y2="4"></line>
            <line x1="10" y1="1" x2="10" y2="4"></line>
            <line x1="14" y1="1" x2="14" y2="4"></line>
        </svg>
    );
}

