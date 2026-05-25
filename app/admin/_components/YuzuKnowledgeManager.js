import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
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
            element.style.padding = '40px';
            element.style.background = '#ffffff';
            element.style.color = '#1e293b';
            element.style.fontFamily = 'system-ui, -apple-system, sans-serif';
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '-9999px';

            element.innerHTML = `
                <div style="border-bottom: 3px solid #f97316; padding-bottom: 20px; margin-bottom: 30px;">
                    <div style="font-size: 24px; font-weight: 850; color: #1e293b; letter-spacing: -0.02em;">In The Haus - Daily Briefing Report</div>
                    <div style="font-size: 14px; color: #64748b; margin-top: 5px;">รายงานสรุปผลการทำงานประจำวันโดยน้องยูซุ</div>
                </div>
                <div style="margin-bottom: 30px;">
                    <div style="font-size: 18px; font-weight: 700; color: #f97316; border-left: 4px solid #f97316; padding-left: 12px; margin-bottom: 15px;">
                        ประจำวันที่ ${new Date(dateStr).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                    <div style="background: #fffdfa; border: 1px solid #fed7aa; border-radius: 12px; padding: 25px; font-size: 14px; line-height: 1.65; color: #334155; white-space: pre-wrap;">
                        ${briefContent}
                    </div>
                </div>
                <div style="margin-top: 60px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
                    รายงานนี้สร้างขึ้นอัตโนมัติโดยระบบ Yuzu AI - In The Haus ณ วันที่ ${new Date().toLocaleDateString('th-TH')} ${new Date().toLocaleTimeString('th-TH')}
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
            element.style.padding = '40px';
            element.style.background = '#ffffff';
            element.style.color = '#1e293b';
            element.style.fontFamily = 'system-ui, -apple-system, sans-serif';
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '-9999px';

            let sectionsHtml = '';
            for (const date of datesToFetch) {
                sectionsHtml += `
                    <div style="margin-bottom: 40px; page-break-inside: avoid;">
                        <div style="font-size: 16px; font-weight: 700; color: #f97316; border-left: 4px solid #f97316; padding-left: 12px; margin-bottom: 12px;">
                            รายงานประจำวัน${date === recentDates[0] ? 'นี้' : ''}: ${new Date(date).toLocaleDateString('th-TH', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                        </div>
                        <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 20px; font-size: 13px; line-height: 1.6; color: #334155; white-space: pre-wrap;">
                            ${fetchedBriefs[date] || 'ไม่มีการสรุปข้อมูลสำหรับวันนี้'}
                        </div>
                    </div>
                `;
            }

            element.innerHTML = `
                <div style="border-bottom: 3px solid #f97316; padding-bottom: 20px; margin-bottom: 35px;">
                    <div style="font-size: 26px; font-weight: 900; color: #1e293b; letter-spacing: -0.02em;">In The Haus - 3-Day History Briefing Report</div>
                    <div style="font-size: 14px; color: #64748b; margin-top: 5px;">รายงานสรุปผลการปฏิบัติงานย้อนหลัง 3 วัน รวบรวมโดยระบบ AI น้องยูซุ</div>
                </div>
                <div>
                    ${sectionsHtml}
                </div>
                <div style="margin-top: 60px; border-top: 1px solid #e2e8f0; padding-top: 20px; text-align: center; font-size: 11px; color: #94a3b8;">
                    รายงานสรุปประวัติประเมินผลร้าน In The Haus นครพนม ณ วันที่ ${new Date().toLocaleDateString('th-TH')} ${new Date().toLocaleTimeString('th-TH')}
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
                        { id: 'insights', label: 'AI Dashboard', icon: Icons.Yuzu },
                        { id: 'config', label: 'System Config', icon: Icons.Settings },
                        { id: 'employees', label: 'Staff Roles', icon: Icons.Staff },
                        { id: 'slips', label: 'Transfer Slips', icon: Icons.Money },
                        { id: 'espresso', label: 'Espresso Log', icon: Icons.Coffee }
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
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Content / Fact</label>
                                <textarea
                                    className="w-full p-4 bg-slate-50 border border-slate-200 rounded-xl h-40 text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-orange-200 transition-all resize-none"
                                    placeholder="ป้อนข้อมูลความรู้ให้น้องยูซุ..."
                                    value={newContent}
                                    onChange={(e) => setNewContent(e.target.value)}
                                />
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Image URL (Optional)</label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-600 outline-none focus:ring-2 focus:ring-orange-200"
                                    placeholder="https://example.com/image.png"
                                    value={newImageUrl}
                                    onChange={(e) => setNewImageUrl(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest px-1">Upload File (PDF/Image)</label>
                                <input
                                    type="file"
                                    accept="application/pdf,image/*"
                                    className="w-full text-xs text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-xs file:font-semibold file:bg-orange-50 file:text-orange-600 hover:file:bg-orange-100 cursor-pointer"
                                    onChange={(e) => setNewFile(e.target.files[0])}
                                />
                                {newFile && <p className="text-[9px] text-emerald-500 font-bold px-1 mt-1">Ready to upload: {newFile.name}</p>}
                            </div>

                            <div className="pt-2">
                                <button
                                    onClick={handleAddKnowledge}
                                    disabled={loading || (!newContent && !newFile)}
                                    className="w-full py-3 bg-orange-500 text-white rounded-xl font-bold shadow-lg shadow-orange-100 hover:bg-orange-600 disabled:opacity-50 transition-all active:scale-95 flex items-center justify-center gap-2"
                                >
                                    {loading ? <span className="animate-spin rounded-full h-4 w-4 border-2 border-white border-t-transparent" /> : <Icons.Plus size={16} />}
                                    {loading ? "Processing..." : "Teach Yuzu"}
                                </button>
                                {message && <p className={`text-xs font-bold text-center mt-3 ${message.includes("สำเร็จ") ? "text-emerald-500" : "text-orange-500"}`}>{message}</p>}
                            </div>
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
                                                <td className="px-6 py-4">
                                                    {editingId === k.id ? (
                                                        <div className="space-y-3 p-2 bg-white rounded-xl border border-orange-100 shadow-sm">
                                                            <textarea 
                                                                className="w-full p-3 bg-slate-50 rounded-lg text-sm text-slate-700 outline-none h-40 resize-none font-medium border border-slate-200"
                                                                value={editingContent}
                                                                onChange={(e) => setEditingContent(e.target.value)}
                                                            />
                                                            <div className="space-y-1">
                                                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Image URL</label>
                                                                <input 
                                                                    type="text"
                                                                    className="w-full p-2 bg-slate-50 rounded-lg text-xs font-medium border border-slate-200"
                                                                    value={editingImageUrl}
                                                                    onChange={(e) => setEditingImageUrl(e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={handleUpdateKnowledge} className="flex-1 py-2 bg-orange-500 text-white rounded-lg font-bold text-xs hover:bg-orange-600">Save</button>
                                                                <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-slate-100 text-slate-500 rounded-lg font-bold text-xs hover:bg-slate-200">Cancel</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-4 items-start">
                                                            {k.metadata?.image_url && (
                                                                <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0 border border-slate-100">
                                                                    <img src={k.metadata.image_url} alt="Reference" className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                            <div className="space-y-2 flex-1">
                                                                {k.metadata?.file_type === 'pdf' && (
                                                                    <div className="flex items-center gap-2 text-[10px] font-bold text-rose-500 uppercase bg-rose-50 px-2 py-1 rounded w-fit">
                                                                        <Icons.File size={10} /> PDF: {k.metadata.file_name}
                                                                    </div>
                                                                )}
                                                                <p className="text-slate-700 text-sm whitespace-pre-wrap leading-relaxed">{k.content}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap"><span className="text-[10px] font-bold text-slate-400">{new Date(k.created_at).toLocaleDateString("th-TH")}</span></td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                        <button 
                                                            onClick={() => {
                                                                setEditingId(k.id);
                                                                setEditingContent(k.content);
                                                                setEditingImageUrl(k.metadata?.image_url || '');
                                                            }} 
                                                            className="p-2 text-slate-300 hover:text-orange-500 rounded-full hover:bg-orange-50 transition-all"
                                                        >
                                                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4L18.5 2.5z"></path></svg>
                                                        </button>
                                                        <button onClick={() => handleDeleteKnowledge(k.id)} className="p-2 text-slate-300 hover:text-rose-500 rounded-full hover:bg-rose-50 transition-all"><Icons.Trash size={14} /></button>
                                                    </div>
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

            {/* TAB: INSIGHTS */}
            {activeTab === 'insights' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    
                    {/* Header Row */}
                    <div className="flex justify-between items-center bg-gradient-to-r from-orange-500 to-amber-500 p-6 rounded-2xl text-white shadow-lg shadow-orange-100">
                        <div className="space-y-1">
                            <h3 className="text-xl font-bold flex items-center gap-2">
                                <Icons.Yuzu size={22} className="animate-bounce" />
                                Yuzu AI Operations Dashboard
                            </h3>
                            <p className="text-orange-100 text-xs">วิเคราะห์พฤติกรรม สรุปงานรายวัน และแชทคุยเพื่อสั่งงานยูซุได้ทันที</p>
                        </div>
                        <button
                            onClick={() => handleGenerateBrief(selectedBriefDate)}
                            disabled={briefLoading}
                            className="bg-white text-orange-600 hover:bg-orange-50 transition-all font-bold text-xs py-2.5 px-5 rounded-xl shadow-md disabled:opacity-50 active:scale-95 flex items-center gap-2"
                        >
                            {briefLoading ? (
                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-orange-600 border-t-transparent" />
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
                            <Card className="p-6 space-y-4 border-t-4 border-t-orange-500">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-50">
                                    <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                        <Icons.File size={18} className="text-orange-500" />
                                        AI Operations Briefing
                                    </h4>
                                    <Badge color="orange">บันทึกสรุปย้อนหลัง 3 วัน</Badge>
                                </div>
                                
                                {/* Date Selector Tabs */}
                                <div className="flex border-b border-slate-100 pb-2 overflow-x-auto gap-1 no-scrollbar">
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
                                                className={`flex-1 py-1.5 px-2.5 text-center rounded-xl transition-all duration-200 whitespace-nowrap min-w-[70px] ${
                                                    isSelected 
                                                    ? 'bg-orange-500 text-white font-extrabold shadow-sm' 
                                                    : 'text-slate-500 hover:bg-slate-50 font-bold'
                                                }`}
                                            >
                                                <div className="text-[9px] uppercase tracking-wide opacity-80">{dayLabel}</div>
                                                <div className="text-xs">{formattedDate}</div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {briefLoading ? (
                                    <div className="py-12 flex flex-col items-center justify-center space-y-3 text-slate-400">
                                        <span className="animate-spin rounded-full h-8 w-8 border-4 border-orange-500 border-t-transparent" />
                                        <p className="text-xs font-bold animate-pulse">ยูซุกำลังวิเคราะห์ข้อมูลกะงานและสรุปห้องแชท...</p>
                                    </div>
                                ) : dailyBriefs[selectedBriefDate] ? (
                                    <div className="bg-orange-50/50 p-4 rounded-xl border border-orange-100 text-slate-700 text-sm font-medium whitespace-pre-wrap leading-relaxed">
                                        {dailyBriefs[selectedBriefDate]}
                                    </div>
                                ) : (
                                    <div className="py-12 text-center text-slate-400 space-y-3">
                                        <p className="text-xs font-medium">ยังไม่มีการสร้างสรุปประจำวันนี้</p>
                                        <button 
                                            onClick={() => handleGenerateBrief(selectedBriefDate)}
                                            className="text-xs font-bold text-orange-500 hover:text-orange-600 underline"
                                        >
                                            กดเพื่อสร้างสรุปเมี๊ยว~
                                        </button>
                                    </div>
                                )}

                                {/* PDF Actions */}
                                {dailyBriefs[selectedBriefDate] && !briefLoading && (
                                    <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-slate-100">
                                        <button
                                            onClick={() => handleExportSingleBriefPDF(selectedBriefDate)}
                                            disabled={pdfLoading}
                                            className="flex-1 py-2 px-3 bg-orange-50 border border-orange-200 text-orange-600 hover:bg-orange-100 transition-all font-bold text-xs rounded-xl flex items-center justify-center gap-2 disabled:opacity-50"
                                        >
                                            {pdfLoading ? (
                                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-orange-600 border-t-transparent" />
                                            ) : (
                                                <Icons.File size={13} />
                                            )}
                                            ส่งออก PDF สรุปประจำวัน
                                        </button>
                                        <button
                                            onClick={handleExportThreeDayReportPDF}
                                            disabled={pdfLoading}
                                            className="flex-1 py-2 px-3 bg-orange-600 text-white hover:bg-orange-700 transition-all font-bold text-xs rounded-xl flex items-center justify-center gap-2 shadow-md shadow-orange-100 disabled:opacity-50"
                                        >
                                            {pdfLoading ? (
                                                <span className="animate-spin rounded-full h-3.5 w-3.5 border-2 border-white border-t-transparent" />
                                            ) : (
                                                <Icons.File size={13} />
                                            )}
                                            ส่งออก PDF ย้อนหลัง 3 วัน
                                        </button>
                                    </div>
                                )}
                            </Card>

                            {/* Sentiment Tracker & Mood Index */}
                            <Card className="p-6 space-y-4 border-t-4 border-t-purple-500">
                                <h4 className="font-bold text-slate-800 flex items-center gap-2">
                                    <Icons.Alert size={18} className="text-purple-500" />
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
                                                    const color = mood === '🔥' ? 'text-amber-500' : mood === '😊' ? 'text-emerald-500' : mood === '😐' ? 'text-blue-500' : mood === '😴' ? 'text-violet-500' : 'text-rose-500';
                                                    return (
                                                        <div key={mood} className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 space-y-1">
                                                            <span className="text-2xl block">{mood}</span>
                                                            <span className={`text-[10px] font-extrabold block ${color}`}>{label}</span>
                                                            <span className="text-xs font-black text-slate-700">{count} คน ({percentage}%)</span>
                                                        </div>
                                                    );
                                                })}
                                            </div>

                                            {/* Beautiful horizontal bar of mood breakdown */}
                                            <div className="w-full h-3 rounded-full bg-slate-100 overflow-hidden flex">
                                                {Object.entries(stats).map(([mood, count]) => {
                                                    if (count === 0) return null;
                                                    const percentage = (count / total) * 100;
                                                    const bg = mood === '🔥' ? 'bg-amber-500' : mood === '😊' ? 'bg-emerald-500' : mood === '😐' ? 'bg-blue-500' : mood === '😴' ? 'bg-violet-500' : 'bg-rose-500';
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
                                            <p className="text-[10px] font-bold text-slate-400 text-center uppercase tracking-wider">
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
                            <Card className="p-0 border border-slate-900 rounded-2xl overflow-hidden flex flex-col h-[350px] shadow-xl">
                                {/* Header */}
                                <div className="bg-slate-950 px-4 py-3 flex justify-between items-center text-white border-b border-slate-800">
                                    <div className="flex items-center gap-2">
                                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-ping" />
                                        <span className="font-mono text-xs font-bold text-emerald-400">YUZU_INTERACTIVE_CONSOLE v3.5</span>
                                    </div>
                                    <Badge color="purple" className="font-mono text-[9px]">GEMINI-3.5-FLASH</Badge>
                                </div>

                                {/* Messages list */}
                                <div className="bg-slate-950 flex-1 p-4 overflow-y-auto space-y-3 custom-scrollbar font-mono text-xs text-slate-300">
                                    {chatMessages.map((msg, idx) => (
                                        <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                                            <div className={`max-w-[85%] p-3 rounded-2xl leading-relaxed whitespace-pre-wrap ${
                                                msg.role === 'user' 
                                                ? 'bg-orange-500 text-white rounded-tr-none' 
                                                : 'bg-slate-900 border border-slate-800 text-emerald-400 rounded-tl-none'
                                            }`}>
                                                <div className="text-[9px] text-slate-500 font-bold mb-1">
                                                    {msg.role === 'user' ? 'BOSS' : '🐱 YUZU'}
                                                </div>
                                                {msg.content}
                                            </div>
                                        </div>
                                    ))}
                                    {chatLoading && (
                                        <div className="flex justify-start">
                                            <div className="bg-slate-900 border border-slate-800 text-slate-400 p-3 rounded-2xl rounded-tl-none flex items-center gap-2">
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce delay-100" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce delay-200" />
                                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-bounce delay-300" />
                                                <span className="text-[9px] font-bold">Yuzu is thinking...</span>
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
                                    className="bg-slate-900 p-3 flex gap-2 border-t border-slate-800"
                                >
                                    <input 
                                        type="text" 
                                        placeholder="ถามตารางกะงาน, ราคาของ, หรือประเมินพนักงาน..."
                                        className="flex-1 bg-slate-950 border border-slate-800 rounded-xl px-4 py-2 text-xs font-mono text-emerald-400 outline-none focus:ring-1 focus:ring-orange-500"
                                        value={chatInput}
                                        onChange={(e) => setChatInput(e.target.value)}
                                        disabled={chatLoading}
                                    />
                                    <button 
                                        type="submit"
                                        disabled={chatLoading || !chatInput.trim()}
                                        className="bg-orange-500 text-white font-bold text-xs py-2 px-4 rounded-xl hover:bg-orange-600 disabled:opacity-40 transition-all"
                                    >
                                        ส่ง
                                    </button>
                                </form>
                            </Card>

                            {/* Staff Mood Timeline */}
                            <Card className="p-6 space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar">
                                <h4 className="font-bold text-slate-800 flex items-center gap-2 sticky top-0 bg-white py-1">
                                    <Icons.Clock size={18} className="text-slate-600" />
                                    Staff Mood & Notes Timeline (บันทึกอารมณ์ล่าสุด)
                                </h4>
                                
                                <div className="space-y-3">
                                    {attendanceLogs.filter(log => log.mood_status || log.mood_note).length === 0 ? (
                                        <p className="text-center text-xs text-slate-400 py-6">ยังไม่มีการบันทึกอารมณ์ในขณะนี้</p>
                                    ) : (
                                        attendanceLogs
                                            .filter(log => log.mood_status || log.mood_note)
                                            .map((log) => {
                                                const empName = log.employees?.nickname || log.employees?.name || 'พนักงาน';
                                                const time = new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                                                const actionLabel = log.action_type === 'check_in' ? 'เข้างาน' : 'ออกงาน';
                                                return (
                                                    <div key={log.id} className="flex gap-3 items-start border-b border-slate-50 pb-2.5 last:border-0 last:pb-0">
                                                        <span className="text-2xl bg-slate-50 p-1.5 rounded-xl border border-slate-100 flex-shrink-0">
                                                            {log.mood_status || '😐'}
                                                        </span>
                                                        <div className="space-y-0.5 flex-1">
                                                            <div className="flex justify-between items-center">
                                                                <span className="font-bold text-slate-700 text-xs">{empName}</span>
                                                                <span className="text-[10px] text-slate-400 font-bold">{time} ({actionLabel})</span>
                                                            </div>
                                                            {log.mood_note && (
                                                                <p className="text-xs bg-slate-50 text-slate-600 p-2 rounded-lg border border-slate-100 italic">
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
                    <Card className="border border-purple-200 overflow-hidden p-0 shadow-lg shadow-purple-50">
                        {/* Accordion Trigger Header */}
                        <button 
                            onClick={() => setIsPendingInsightsExpanded(!isPendingInsightsExpanded)}
                            className="w-full bg-purple-50 hover:bg-purple-100/70 p-4 px-6 flex justify-between items-center text-purple-900 font-bold transition-all"
                        >
                            <div className="flex items-center gap-2">
                                <Icons.Yuzu size={18} className="text-purple-600" />
                                <span>คลังความรู้ที่ยูซุแอบจำมารอการอนุมัติ ({insights.length} รายการ)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge color="purple">{insights.length}</Badge>
                                {isPendingInsightsExpanded ? <Icons.Up size={16} /> : <Icons.Down size={16} />}
                            </div>
                        </button>

                        {/* Accordion Content */}
                        {isPendingInsightsExpanded && (
                            <div className="p-6 bg-white border-t border-purple-100 space-y-4 animate-in slide-in-from-top-2 duration-300">
                                <p className="text-xs text-slate-500 leading-relaxed">
                                    นี่คือชุดข้อมูล/ข้อเท็จจริงใหม่ที่ยูซุคัดกรองจากบทสนทนาในห้องแชทของร้าน In The Haus คุณพ่อคุณแม่สามารถเลือก Approve เพื่อบันทึกเข้าฐานความรู้หลัก (Knowledge Base) สำหรับใช้ตอบคำถาม หรือคลิก Delete เพื่อยกเลิกข้อมูลดังกล่าวได้ครับ
                                </p>
                                
                                {insights.length === 0 ? (
                                    <div className="py-12 text-center text-slate-400">
                                        <p className="text-xs font-bold">ไม่มีรายการค้างอนุมัติเมี๊ยว~ 💤</p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {insights.map(item => (
                                            <Card key={item.id} className="group hover:border-purple-200 transition-all border-l-4 border-l-purple-500 p-5 space-y-4 bg-slate-50/50">
                                                <div className="flex justify-between items-start">
                                                    <Badge color={item.metadata?.is_problem ? "rose" : "purple"}>
                                                        {item.metadata?.category || 'GENERAL'}
                                                    </Badge>
                                                    <span className="text-[10px] font-bold text-slate-400">{new Date(item.created_at).toLocaleTimeString('th-TH')}</span>
                                                </div>
                                                
                                                <p className="text-sm font-medium text-slate-700 leading-relaxed">
                                                    {item.content}
                                                </p>
                                                
                                                <div className="space-y-2 py-2">
                                                    <label className="text-[9px] font-extrabold text-slate-400 uppercase tracking-widest block">Keywords (พิมพ์แล้วกด Enter)</label>
                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                        {(item.metadata?.keywords || []).map((kw, idx) => (
                                                            <span key={idx} className="bg-indigo-50 text-indigo-600 px-2 py-1 rounded-lg text-[10px] font-bold flex items-center gap-1 group/tag transition-all hover:bg-indigo-100">
                                                                {kw}
                                                                <button 
                                                                    onClick={() => {
                                                                        const newKeywords = item.metadata.keywords.filter((_, i) => i !== idx);
                                                                        handleUpdateInsightKeywords(item.id, newKeywords.join(','));
                                                                    }}
                                                                    className="text-indigo-300 hover:text-rose-500 transition-colors"
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
                                                        className="w-full text-xs font-bold text-slate-600 bg-white p-2 rounded-xl outline-none focus:ring-1 focus:ring-purple-200 border border-slate-200 transition-all"
                                                    />
                                                </div>
                                                
                                                <div className="flex gap-2 pt-2">
                                                    <button 
                                                        onClick={() => handleVerifyInsight(item.id)}
                                                        className="flex-1 bg-emerald-500 text-white py-2 rounded-xl text-xs font-bold hover:bg-emerald-600 transition-all shadow-sm"
                                                    >
                                                        Approve & Save
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteKnowledge(item.id)}
                                                        className="px-4 bg-white border border-slate-200 text-slate-400 py-2 rounded-xl text-xs font-bold hover:bg-rose-50 hover:text-rose-500 transition-all"
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
                <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-4">
                    <Card className="p-4 bg-orange-50/50 border border-orange-100/50 flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="space-y-1">
                            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                                📝 ระบบประเมินบทบาทและประสิทธิภาพพนักงาน (Appraisal)
                            </h4>
                            <p className="text-xs text-slate-500">
                                คลิกแถวรายชื่อพนักงานเพื่อเปิดกล่องบันทึก <b>หน้าที่ความรับผิดชอบ</b>, <b>สิ่งที่ดีแล้ว</b> และ <b>สิ่งที่ต้องปรับปรุง</b> หรือเรียกให้ ยูซุ AI ช่วยสรุปการประเมินได้เมี๊ยว~ 🐱
                            </p>
                        </div>
                    </Card>

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
                                    {employees.map(emp => {
                                        const isExpanded = expandedEmpId === emp.id;
                                        return (
                                            <React.Fragment key={emp.id}>
                                                <tr 
                                                    className={`hover:bg-slate-50/50 transition-colors cursor-pointer ${isExpanded ? 'bg-orange-50/20' : ''}`}
                                                    onClick={() => setExpandedEmpId(isExpanded ? null : emp.id)}
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-[10px] text-slate-400 font-bold w-4 text-center select-none">
                                                                {isExpanded ? '▼' : '▶'}
                                                            </div>
                                                            <div>
                                                                <div className="font-bold text-slate-700 flex items-center gap-2">
                                                                    {emp.nickname || emp.name}
                                                                    {(emp.duties || emp.strengths || emp.improvements) && (
                                                                        <span className="w-1.5 h-1.5 rounded-full bg-orange-500" title="มีบันทึกประเมินแล้ว" />
                                                                    )}
                                                                </div>
                                                                <div className="text-[10px] text-slate-400">{emp.name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                        <input 
                                                            type="text" 
                                                            className="w-full p-2 bg-transparent border-b border-transparent focus:border-orange-400 outline-none font-bold text-slate-600 transition-all text-xs"
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
                                                {isExpanded && (
                                                    <tr className="bg-slate-50/30">
                                                        <td colSpan="4" className="px-6 py-6 border-b border-slate-100">
                                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in duration-300">
                                                                {/* Duties Section */}
                                                                <div className="space-y-2">
                                                                    <label className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">📋 หน้าที่ความรับผิดชอบ (Duties)</label>
                                                                    <textarea 
                                                                        className="w-full p-3.5 bg-white border border-slate-200 rounded-xl h-36 text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-orange-200 transition-all resize-none shadow-sm leading-relaxed"
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
                                                                    <label className="text-[10px] font-extrabold text-emerald-500 uppercase tracking-widest block">💚 สิ่งที่ดีแล้ว (Strengths)</label>
                                                                    <textarea 
                                                                        className="w-full p-3.5 bg-white border border-emerald-100 rounded-xl h-36 text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-emerald-200 transition-all resize-none shadow-sm leading-relaxed"
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
                                                                        <label className="text-[10px] font-extrabold text-amber-500 uppercase tracking-widest block">🧡 สิ่งที่ต้องปรับปรุง (Improvements)</label>
                                                                        
                                                                        {/* AI evaluate button */}
                                                                        <button
                                                                            onClick={() => handleAiEvaluateEmployee(emp.id)}
                                                                            disabled={aiLoadingEmpId === emp.id}
                                                                            className="bg-purple-50 hover:bg-purple-100 text-purple-600 font-extrabold text-[9px] px-2.5 py-1 rounded-lg border border-purple-100 transition-all flex items-center gap-1 active:scale-95 disabled:opacity-50"
                                                                        >
                                                                            {aiLoadingEmpId === emp.id ? (
                                                                                <>
                                                                                    <span className="animate-spin rounded-full h-2.5 w-2.5 border-2 border-purple-600 border-t-transparent" />
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
                                                                        className="w-full p-3.5 bg-white border border-amber-100 rounded-xl h-36 text-xs font-semibold text-slate-600 outline-none focus:ring-2 focus:ring-amber-200 transition-all resize-none shadow-sm leading-relaxed"
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

            {/* TAB: ESPRESSO */}
            {activeTab === 'espresso' && (
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
                            href={`/admin/report/espresso?date=${selectedDate}`} 
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
                                        <th className="px-6 py-4">Barista</th>
                                        <th className="px-6 py-4">Parameters (Raw Log)</th>
                                        <th className="px-6 py-4">Yuzu Recommendation</th>
                                        <th className="px-6 py-4">Photos</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50">
                                    {espressoLoading ? (
                                        <tr>
                                            <td colSpan="5" className="p-12 text-center text-slate-400 italic">กำลังดึงข้อมูลรายงานช็อตกาแฟ...</td>
                                        </tr>
                                    ) : espressoReports.length === 0 ? (
                                        <tr>
                                            <td colSpan="5" className="p-20 text-center">
                                                <p className="text-slate-300 font-bold uppercase tracking-widest mb-1">No Espresso Reports</p>
                                                <p className="text-slate-400 text-[10px]">ไม่พบรายงานการสกัดช็อตกาแฟในวันที่เลือก</p>
                                            </td>
                                        </tr>
                                    ) : (
                                        espressoReports.map((report) => (
                                            <tr key={report.id} className="hover:bg-slate-50 transition-colors">
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-bold text-slate-700">{format(new Date(report.timestamp), 'HH:mm:ss')}</div>
                                                    <div className="text-[10px] text-slate-400 uppercase font-mono">{format(new Date(report.timestamp), 'dd MMM yyyy')}</div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <div className="font-bold text-slate-700">
                                                        {getEmployeeName(report.userId, '-')}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="font-medium text-slate-600 max-w-xs overflow-hidden text-ellipsis whitespace-nowrap" title={report.rawText}>
                                                        {report.rawText}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4">
                                                    <div className="text-slate-500 max-w-sm overflow-hidden text-ellipsis whitespace-nowrap italic" title={report.recommendation}>
                                                        {report.recommendation}
                                                    </div>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    {report.photos.length > 0 ? (
                                                        <div className="flex gap-1.5 items-center">
                                                            <span className="text-[10px] font-black bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                                                                {report.photos.length} Photo(s)
                                                            </span>
                                                            <div className="flex gap-1">
                                                                {report.photos.map((url, i) => (
                                                                    <a key={i} href={url} target="_blank" rel="noreferrer" className="w-6 h-6 rounded border border-slate-100 overflow-hidden block">
                                                                        <img src={url} className="w-full h-full object-cover" />
                                                                    </a>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : <span className="text-slate-300">-</span>}
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

