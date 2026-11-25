import React, { useState, useEffect } from "react";
import { supabase } from "../../../lib/supabaseClient";
import { Card } from "./ui/Card";
import { Badge } from "./ui/Badge";
import { TabButton } from "./ui/TabButton";
import { YuzuSlipMonth, YuzuEspressoMonth } from "./reports/YuzuMonthTabs";
import { Icons } from "./ui/HausIcon";
import { format, addHours } from "date-fns";
import HashtagIncidentManager from "./HashtagIncidentManager";

export default function YuzuKnowledgeManager() {
    const [activeTab, setActiveTab] = useState('knowledge'); // 'knowledge', 'insights', 'config', 'employees', 'slips'
    const [knowledge, setKnowledge] = useState([]);
    const [insights, setInsights] = useState([]);
    const [employees, setEmployees] = useState([]);
    const [config, setConfig] = useState({ father_uid: '', mother_uid: '' });
    
    const [newContent, setNewContent] = useState('');
    const [newImageUrl, setNewImageUrl] = useState('');
    const [newFile, setNewFile] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editingContent, setEditingContent] = useState('');
    const [editingImageUrl, setEditingImageUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const [, setSlipLoading] = useState(false);
    const [message, setMessage] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [showCleanupConfirm, setShowCleanupConfirm] = useState(false);
    const [cleanupLoading, setCleanupLoading] = useState(false);
    const [cleanupStatus, setCleanupStatus] = useState({ state: 'idle', message: '', type: 'info' });
    const [isFlowVisible, setIsFlowVisible] = useState(true);

    // New States for AI Operations Dashboard
    const [selectedBriefDate, setSelectedBriefDate] = useState(format(new Date(), 'yyyy-MM-dd'));
    const [dailyBriefs, setDailyBriefs] = useState({});
    const [briefLoading, setBriefLoading] = useState(false);
    const [pdfLoading, setPdfLoading] = useState(false);
    const [briefMode, setBriefMode] = useState('daily'); // 'daily', 'monthly'
    const [selectedBriefMonth, setSelectedBriefMonth] = useState(format(new Date(), 'yyyy-MM'));
    const [monthlyBriefs, setMonthlyBriefs] = useState({});
    const [monthlyLoading, setMonthlyLoading] = useState(false);

    // Calculate recent months (Current month + last 5 months)
    const recentMonths = React.useMemo(() => {
        const months = [];
        const now = new Date();
        for (let i = 0; i < 6; i++) {
            const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
            const value = format(d, 'yyyy-MM');
            const label = d.toLocaleDateString('th-TH', { month: 'long', year: 'numeric' });
            months.push({ value, label });
        }
        return months;
    }, []);

    // Dynamic position list combining base, DB employee positions, and current config
    const availablePositions = React.useMemo(() => {
        const base = ['Bar & Floor', 'Cooking', 'Owner', 'Manager', 'CEO', 'Part-time'];
        const empPositions = employees.map(e => e.position?.trim()).filter(Boolean);
        const currentConfigPositions = (config.allowed_slip_positions || '')
            .split(',')
            .map(s => s.trim())
            .filter(Boolean);
        
        const map = new Map();
        [...base, ...empPositions, ...currentConfigPositions].forEach(pos => {
            const key = pos.toLowerCase();
            if (!map.has(key)) {
                map.set(key, pos);
            }
        });
        return Array.from(map.values());
    }, [employees, config.allowed_slip_positions]);

    const [chatMessages, setChatMessages] = useState([
        { role: 'model', content: 'สวัสดีค่ะเจ้านาย! ยูซุ แมวส้มแสนรู้ประจำร้าน In The Haus พร้อมให้บริการแล้วค่ะ มีอะไรเกี่ยวกับข้อมูลร้าน กะงาน หรืออารมณ์ของพนักงานที่อยากคุยกับยูซุ แหลงมาได้เลยนะคะเมี๊ยว~ ' }
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
            element.style.background = '#fafaf9';
            element.style.color = '#1c1c1c';
            element.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '-9999px';

            element.innerHTML = `
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1c1c1c; padding-bottom: 20px; margin-bottom: 30px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="/logo.png" style="height: 40px; width: auto; object-fit: contain;" alt="In The Haus Logo" />
                        <div>
                            <div style="font-size: 18px; font-weight: 800;: 0.05em; line-height: 1.2;">IN THE HAUS</div>
                            <div style="font-size: 9px; font-weight: 700; color: #737373;: 0.1em; text-transform:; margin-top: 2px;">Daily Operations Report / รายงานสรุปการปฏิบัติงานรายวัน</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 16px; font-weight: 700; color: #1c1c1c;">DATE: ${dateStr}</div>
                        <div style="font-size: 8px; font-weight: 600; color: #a3a3a3; text-transform:; margin-top: 4px;">Generated: ${new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</div>
                    </div>
                </div>

                <!-- Content Container -->
                <div style="background: #ffffff; border: 1px solid #e5e5e7; border-radius: 16px; padding: 30px; margin-bottom: 40px; box-: 0 4px 6px -1px rgba(0,0,0,0.01);">
                    <div style="font-size: 13px; line-height: 1.8; color: #262626; white-space: pre-wrap;">${briefContent}</div>
                </div>

                <!-- Footer -->
                <div style="border-top: 1px solid #e5e5e7; padding-top: 20px; display: flex; justify-content: space-between; align-items: flex-end;">
                    <div style="max-width: 450px;">
                        <div style="font-size: 8px; font-weight: 750; text-transform:; color: #a3a3a3; letter-spacing: 0.1em; margin-bottom: 5px;">Verification & Archives</div>
                        <div style="font-size: 8px; line-height: 1.5; color: #a3a3a3;">
                            This document is an official daily summary report compiled and verified by Yuzu AI for In The Haus Nakhon Phanom. 
                            Any modifications must be authorized by management.
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 9px; font-weight: 800; color: #404040; letter-spacing: 0.05em;">YUZU x IN THE HAUS</div>
                        <div style="font-size: 8px; font-weight: 600; color: #a3a3a3; margin-top: 3px;">ONHAUS SYSTEM © ${new Date().getFullYear()} All Rights Reserved</div>
                    </div>
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
            element.style.background = '#fafaf9';
            element.style.color = '#1c1c1c';
            element.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '-9999px';

            let sectionsHtml = '';
            for (const date of datesToFetch) {
                sectionsHtml += `
                    <div style="margin-bottom: 30px; page-break-inside: avoid;">
                        <div style="display: inline-block; background: #1c1c1c; color: #ffffff; padding: 5px 12px; font-size: 10px; font-weight: 700; text-transform:; border-radius: 6px; margin-bottom: 12px; letter-spacing: 0.05em;">
                            REPORT DATE: ${date}
                        </div>
                        <div style="background: #ffffff; border: 1px solid #e5e5e7; border-radius: 16px; padding: 25px; font-size: 12px; line-height: 1.75; color: #262626; white-space: pre-wrap;">
                            ${fetchedBriefs[date] || 'ไม่มีการสรุปข้อมูลสำหรับวันนี้'}
                        </div>
                    </div>
                `;
            }

            element.innerHTML = `
                <!-- Header -->
                <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #1c1c1c; padding-bottom: 20px; margin-bottom: 35px;">
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <img src="/logo.png" style="height: 40px; width: auto; object-fit: contain;" alt="In The Haus Logo" />
                        <div>
                            <div style="font-size: 18px; font-weight: 800;: 0.05em; line-height: 1.2;">IN THE HAUS</div>
                            <div style="font-size: 9px; font-weight: 700; color: #737373;: 0.1em; text-transform:; margin-top: 2px;">3-Day Compilation Report / รายงานสรุปปฏิบัติงานย้อนหลัง 3 วัน</div>
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 14px; font-weight: 700; color: #1c1c1c;">3-DAY SUMMARY LOGS</div>
                        <div style="font-size: 8px; font-weight: 600; color: #a3a3a3; text-transform:; margin-top: 4px;">Generated: ${new Date().toLocaleDateString('th-TH')} ${new Date().toLocaleTimeString('th-TH')}</div>
                    </div>
                </div>

                <!-- Sections -->
                <div>
                    ${sectionsHtml}
                </div>

                <!-- Footer -->
                <div style="border-top: 1px solid #e5e5e7; padding-top: 20px; display: flex; justify-content: space-between; align-items: flex-end; margin-top: 40px;">
                    <div style="max-width: 450px;">
                        <div style="font-size: 8px; font-weight: 750; text-transform:; color: #a3a3a3; letter-spacing: 0.1em; margin-bottom: 5px;">Verification & Archives</div>
                        <div style="font-size: 8px; line-height: 1.5; color: #a3a3a3;">
                            This compiled document is an official historical log report compiled by Yuzu AI for In The Haus Nakhon Phanom. 
                            Any modifications must be authorized by management.
                        </div>
                    </div>
                    <div style="text-align: right;">
                        <div style="font-size: 9px; font-weight: 800; color: #404040; letter-spacing: 0.05em;">YUZU x IN THE HAUS</div>
                        <div style="font-size: 8px; font-weight: 600; color: #a3a3a3; margin-top: 3px;">ONHAUS SYSTEM © ${new Date().getFullYear()} All Rights Reserved</div>
                    </div>
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

    async function handleGenerateMonthlyBrief(monthStr = null) {
        const targetMonth = monthStr || selectedBriefMonth;
        setMonthlyLoading(true);
        try {
            const res = await fetch(`/api/yuzu/monthly-brief?month=${targetMonth}`);
            const data = await res.json();
            if (data.success) {
                setMonthlyBriefs(prev => ({ ...prev, [targetMonth]: data.brief }));
            } else {
                setMonthlyBriefs(prev => ({ ...prev, [targetMonth]: 'ไม่สามารถสรุปข้อมูลรายเดือนได้ในขณะนี้: ' + data.error }));
            }
        } catch (e) {
            setMonthlyBriefs(prev => ({ ...prev, [targetMonth]: 'เกิดข้อผิดพลาดในการดึงข้อมูลสรุปรายเดือน: ' + e.message }));
        }
        setMonthlyLoading(false);
    }

    async function handleExportMonthlyBriefPDF(monthStr) {
        const briefContent = monthlyBriefs[monthStr];
        if (!briefContent) return;

        setPdfLoading(true);
        try {
            const html2canvas = (await import('html2canvas')).default;
            const { jsPDF } = await import('jspdf');

            const monthLabel = recentMonths.find(m => m.value === monthStr)?.label || monthStr;

            let data = {};
            try {
                data = typeof briefContent === 'string'
                    ? JSON.parse(briefContent.replace(/```json/g, '').replace(/```/g, '').trim())
                    : briefContent;
            } catch(e) {
                console.error("JSON parse failed during PDF export", e);
                data = null;
            }

            const element = document.createElement('div');
            element.style.width = '800px';
            element.style.padding = '40px';
            element.style.background = '#ffffff';
            element.style.color = '#111827';
            element.style.fontFamily = "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
            element.style.position = 'absolute';
            element.style.left = '-9999px';
            element.style.top = '-9999px';

            if (data) {
                const teamSnapshot = data.teamSnapshot || [];
                const recruitmentPolicy = data.recruitmentPolicy || "";
                const metrics = data.metrics || {};
                const moodIndex = data.moodIndex || {};
                const issues = data.issues || {};
                const nextActions = data.nextActions || [];
                const summaryFocus = data.summaryFocus || {};

                const snapshotHtml = teamSnapshot.map(emp => `
                    <div style="display: flex; border-bottom: 1px solid #e5e7eb; padding: 10px 0; align-items: start;">
                        <div style="width: 30%; font-weight: bold;">
                            <div style="font-size: 11px; color: #111827;">${emp.name}</div>
                            <div style="font-size: 9px; color: #6b7280; font-weight: 500; margin-top: 2px;">${emp.position}</div>
                        </div>
                        <div style="width: 70%;">
                            <ul style="margin: 0; padding-left: 15px; font-size: 10px; color: #374151;">
                                ${(emp.bullets || []).map(b => `<li style="margin-bottom: 3px;">${b}</li>`).join('')}
                            </ul>
                        </div>
                    </div>
                `).join('');

                const issuesColsHtml = [
                    { key: 'assets', label: 'A. อุปกรณ์ / ทรัพย์สิน' },
                    { key: 'qc', label: 'B. วัตถุดิบเสียหาย / QC' },
                    { key: 'hygiene', label: 'C. วัตถุดิบแห้ง / สุขอนามัย' },
                    { key: 'recipes', label: 'D. สูตรเครื่องดื่ม / ราคา' },
                    { key: 'service', label: 'E. บริการ / ระบบหน้าร้าน' }
                ].map(col => `
                    <div style="flex: 1; border: 1px solid #e5e7eb; padding: 10px; background: #fafafa; border-radius: 4px; min-width: 130px; margin-right: 6px;">
                        <div style="font-size: 9px; font-weight: bold; color: #111827; border-bottom: 1px solid #d1d5db; padding-bottom: 4px; margin-bottom: 6px;">${col.label}</div>
                        <ul style="margin: 0; padding-left: 10px; font-size: 8.5px; color: #374151; line-height: 1.4; list-style-type: disc;">
                             ${(issues[col.key] || []).map(item => `<li style="margin-bottom: 3px;">${item}</li>`).join('')}
                        </ul>
                    </div>
                `).join('');

                const nextActionsHtml = nextActions.map(action => `
                    <div style="flex: 1; border: 1px solid #e5e7eb; padding: 12px; background: #ffffff; border-radius: 4px; margin-right: 8px; min-width: 160px;">
                        <div style="font-size: 10px; font-weight: 800; color: #111827; margin-bottom: 6px;">${action.title}</div>
                        <ul style="margin: 0; padding-left: 10px; font-size: 8.5px; color: #475569; line-height: 1.4; list-style-type: disc;">
                            ${(action.bullets || []).map(b => `<li style="margin-bottom: 2px;">${b}</li>`).join('')}
                        </ul>
                    </div>
                `).join('');

                element.innerHTML = `
                    <!-- Header -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #111827; padding-bottom: 15px; margin-bottom: 25px;">
                        <div>
                            <div style="font-size: 24px; font-weight: 800; : -0.02em; color: #111827; line-height: 1.1;">In The Haus</div>
                            <div style="font-size: 13px; font-weight: bold; color: #374151; margin-top: 4px;">ในบ้าน นครพนม · สรุปรายเดือน</div>
                            <div style="font-size: 9px; font-weight: 600; color: #6b7280; letter-spacing: 0.05em; text-transform:; margin-top: 2px;">รายงานภาพรวมการดำเนินงานประจำเดือน</div>
                        </div>
                        <div style="display: flex; align-items: center; gap: 12px; background: #f9fafb; border: 1px solid #e5e7eb; padding: 8px 12px; border-radius: 4px;">
                            <div style="text-align: right;">
                                <div style="font-size: 10px; font-weight: bold; color: #1f2937;">สรุปผลการดำเนินงานภายใน</div>
                                <div style="font-size: 8px; color: #6b7280; margin-top: 2px;">ประจำเดือน ${monthLabel}</div>
                            </div>
                        </div>
                    </div>

                    <!-- 01 TEAM SNAPSHOT -->
                    <div style="margin-bottom: 25px;">
                        <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #111827; padding-bottom: 6px; margin-bottom: 12px;">
                            <span style="font-size: 14px; font-weight: bold; color: #111827;">01</span>
                            <span style="font-size: 10px; font-weight: bold; text-transform:; letter-spacing: 0.05em; color: #374151;">ภาพรวมทีมงาน / TEAM SNAPSHOT</span>
                        </div>
                        <div style="display: flex; gap: 15px;">
                            <!-- Left: Employee Snapshot -->
                            <div style="width: 65%; border: 1px solid #e5e7eb; border-radius: 4px; padding: 10px;">
                                ${snapshotHtml}
                            </div>
                            <!-- Right: Sidebar -->
                            <div style="width: 35%; display: flex; flex-direction: column; gap: 12px;">
                                <!-- Recruitment -->
                                <div style="border: 1px solid #e5e7eb; background: #f9fafb; padding: 12px; border-radius: 4px;">
                                    <div style="font-size: 9px; font-weight: bold; text-transform:; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; margin-bottom: 6px; color: #1f2937;">นโยบายการรับพนักงานเดือนหน้า</div>
                                    <div style="font-size: 9px; color: #4b5563; line-height: 1.4; white-space: pre-wrap;">${recruitmentPolicy}</div>
                                </div>
                                <!-- Grid metrics -->
                                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
                                    <div style="border: 1px solid #e5e7eb; padding: 8px; text-align: center; border-radius: 4px; background: white;">
                                        <div style="font-size: 14px; font-weight: 800; color: #111827;">${metrics.forgotClockOutCount || 0} ครั้ง</div>
                                        <div style="font-size: 7.5px; color: #6b7280; font-weight: bold; text-transform:; margin-top: 2px;">ลืมลงเวลาออกงาน</div>
                                    </div>
                                    <div style="border: 1px solid #e5e7eb; padding: 8px; text-align: center; border-radius: 4px; background: white;">
                                        <div style="font-size: 14px; font-weight: 800; color: #111827;">${metrics.probationCount || 0} คน</div>
                                        <div style="font-size: 7.5px; color: #6b7280; font-weight: bold; text-transform:; margin-top: 2px;">พนักงานทดลองงาน</div>
                                    </div>
                                    <div style="border: 1px solid #e5e7eb; padding: 8px; text-align: center; border-radius: 4px; background: white;">
                                        <div style="font-size: 14px; font-weight: 800; color: #111827;">${metrics.notReadyCount || 0} คน</div>
                                        <div style="font-size: 7.5px; color: #6b7280; font-weight: bold; text-transform:; margin-top: 2px;">ไม่พร้อมทำงาน</div>
                                    </div>
                                    <div style="border: 1px solid #e5e7eb; padding: 8px; text-align: center; border-radius: 4px; background: white;">
                                        <div style="font-size: 14px; font-weight: 800; color: #111827;">${metrics.failedProbationCount || 0} คน</div>
                                        <div style="font-size: 7.5px; color: #6b7280; font-weight: bold; text-transform:; margin-top: 2px;">ไม่ผ่านทดลองงาน</div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    <!-- 02 MOOD INDEX -->
                    <div style="margin-bottom: 25px; page-break-inside: avoid;">
                        <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #111827; padding-bottom: 6px; margin-bottom: 12px;">
                            <span style="font-size: 14px; font-weight: bold; color: #111827;">02</span>
                            <span style="font-size: 10px; font-weight: bold; text-transform:; letter-spacing: 0.05em; color: #374151;">ดัชนีอารมณ์ทีม / MOOD INDEX</span>
                        </div>
                        <div style="display: flex; gap: 15px;">
                            <!-- Bar & Floor -->
                            <div style="flex: 1; border: 1px solid #e5e7eb; padding: 12px; border-radius: 4px; background: white;">
                                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 10px; margin-bottom: 6px; color: #111827;">
                                    <span>Bar & Floor อารมณ์โดยรวม</span>
                                    <span style="color: #ea580c;">${moodIndex.barAndFloor?.score || 0}/100</span>
                                </div>
                                <div style="width: 100%; background: #f3f4f6; height: 5px; border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                                    <div style="background: #f97316; height: 100%; width: ${moodIndex.barAndFloor?.score || 0}%;"></div>
                                </div>
                                <ul style="margin: 0; padding-left: 10px; font-size: 9px; color: #4b5563; line-height: 1.4; list-style-type: disc;">
                                    ${(moodIndex.barAndFloor?.bullets || []).map(b => `<li style="margin-bottom: 2px;">${b}</li>`).join('')}
                                </ul>
                            </div>
                            <!-- Cooking -->
                            <div style="flex: 1; border: 1px solid #e5e7eb; padding: 12px; border-radius: 4px; background: white;">
                                <div style="display: flex; justify-content: space-between; font-weight: bold; font-size: 10px; margin-bottom: 6px; color: #111827;">
                                    <span>Cooking/ครัว อารมณ์โดยรวม</span>
                                    <span style="color: #ea580c;">${moodIndex.cooking?.score || 0}/100</span>
                                </div>
                                <div style="width: 100%; background: #f3f4f6; height: 5px; border-radius: 3px; overflow: hidden; margin-bottom: 8px;">
                                    <div style="background: #f97316; height: 100%; width: ${moodIndex.cooking?.score || 0}%;"></div>
                                </div>
                                <ul style="margin: 0; padding-left: 10px; font-size: 9px; color: #4b5563; line-height: 1.4; list-style-type: disc;">
                                    ${(moodIndex.cooking?.bullets || []).map(b => `<li style="margin-bottom: 2px;">${b}</li>`).join('')}
                                </ul>
                            </div>
                        </div>
                    </div>

                    <!-- 03 ISSUES & RESPONSES -->
                    <div style="margin-bottom: 25px; page-break-inside: avoid;">
                        <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #111827; padding-bottom: 6px; margin-bottom: 12px;">
                            <span style="font-size: 14px; font-weight: bold; color: #111827;">03</span>
                            <span style="font-size: 10px; font-weight: bold; text-transform:; letter-spacing: 0.05em; color: #374151;">ปัญหาและการจัดการ / ISSUES & RESPONSES</span>
                        </div>
                        <div style="display: flex; gap: 6px;">
                            ${issuesColsHtml}
                        </div>
                    </div>

                    <!-- 04 NEXT ACTIONS -->
                    <div style="margin-bottom: 25px; page-break-inside: avoid;">
                        <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #111827; padding-bottom: 6px; margin-bottom: 12px;">
                            <span style="font-size: 14px; font-weight: bold; color: #111827;">04</span>
                            <span style="font-size: 10px; font-weight: bold; text-transform:; letter-spacing: 0.05em; color: #374151;">ข้อเสนอแนะเดือนถัดไป / NEXT ACTIONS</span>
                        </div>
                        <div style="display: flex; gap: 8px;">
                            ${nextActionsHtml}
                        </div>
                    </div>

                    <!-- 05 SUMMARY FOCUS -->
                    <div style="page-break-inside: avoid;">
                        <div style="display: flex; align-items: center; gap: 8px; border-bottom: 1px solid #111827; padding-bottom: 6px; margin-bottom: 12px;">
                            <span style="font-size: 14px; font-weight: bold; color: #111827;">05</span>
                            <span style="font-size: 10px; font-weight: bold; text-transform:; letter-spacing: 0.05em; color: #374151;">SUMMARY FOCUS</span>
                        </div>
                        <div style="display: flex; border: 1px solid #e5e7eb; border-radius: 4px; padding: 12px; background: #ffffff; text-align: center; justify-content: space-around;">
                            <div style="flex: 1; border-right: 1px solid #e5e7eb;">
                                <div style="font-size: 8.5px; font-weight: bold; color: #6b7280; text-transform:; margin-bottom: 4px;">ลงเวลาออกงาน</div>
                                <div style="font-size: 10px; font-weight: bold; color: #111827; white-space: pre-line;">${summaryFocus.forgotClockOut || ''}</div>
                            </div>
                            <div style="flex: 1; border-right: 1px solid #e5e7eb; padding: 0 8px;">
                                <div style="font-size: 8.5px; font-weight: bold; color: #6b7280; text-transform:; margin-bottom: 4px;">ทดลองงาน</div>
                                <div style="font-size: 10px; font-weight: bold; color: #111827; white-space: pre-line;">${summaryFocus.probation || ''}</div>
                            </div>
                            <div style="flex: 1; border-right: 1px solid #e5e7eb; padding: 0 8px;">
                                <div style="font-size: 8.5px; font-weight: bold; color: #6b7280; text-transform:; margin-bottom: 4px;">ของเสียหาย</div>
                                <div style="font-size: 10px; font-weight: bold; color: #111827; white-space: pre-line;">${summaryFocus.brokenItems || ''}</div>
                            </div>
                            <div style="flex: 1; border-right: 1px solid #e5e7eb; padding: 0 8px;">
                                <div style="font-size: 8.5px; font-weight: bold; color: #6b7280; text-transform:; margin-bottom: 4px;">ระบบที่ต้องซ้อม</div>
                                <div style="font-size: 10px; font-weight: bold; color: #111827; white-space: pre-line;">${summaryFocus.systemCheck || ''}</div>
                            </div>
                            <div style="flex: 1; padding: 0 8px;">
                                <div style="font-size: 8.5px; font-weight: bold; color: #6b7280; text-transform:; margin-bottom: 4px;">เป้าหมายโฟกัส</div>
                                <div style="font-size: 10px; font-weight: bold; color: #ea580c; white-space: pre-line;">${summaryFocus.focusAreas || ''}</div>
                            </div>
                        </div>
                    </div>
                `;
            } else {
                element.innerHTML = `
                    <div style="padding: 40px; text-align: center;">
                        <h2 style="font-size: 18px; color: #b91c1c;">ข้อมูลสรุปรายเดือนไม่ได้อยู่ในรูปแบบ JSON</h2>
                        <p style="font-size: 12px; color: #374151; white-space: pre-wrap; margin-top: 15px; text-align: left; background: #f3f4f6; padding: 15px; border-radius: 4px;">${briefContent}</p>
                    </div>
                `;
            }

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

            pdf.save(`yuzu-monthly-brief-${monthStr}.pdf`);
        } catch (e) {
            console.error("PDF Export Error:", e);
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

    const renderInfographic = (data) => {
        if (!data) return null;

        const teamSnapshot = data.teamSnapshot || [];
        const recruitmentPolicy = data.recruitmentPolicy || "";
        const metrics = data.metrics || {};
        const moodIndex = data.moodIndex || {};
        const issues = data.issues || {};
        const nextActions = data.nextActions || [];
        const summaryFocus = data.summaryFocus || {};

        return (
            <div className="bg-cream border border-rule p-6 text-charcoal space-y-8 select-text">
                {/* Header */}
                <div className="flex justify-between items-start border-b-2 border-charcoal pb-4">
                    <div>
                        <h2 className="text-2xl font-semibold text-charcoal">In The Haus</h2>
                        <h3 className="text-sm font-semibold text-charcoal mt-0.5">ในบ้าน นครพนม · สรุปรายเดือน</h3>
                        <p className="text-xs text-neutral mt-1">รายงานภาพรวมการดำเนินงานประจำเดือน</p>
                    </div>
                    <div className="flex items-center gap-3 bg-paper-2 p-2.5 border border-rule">
                                                <div>
                            <div className="text-xs font-semibold text-charcoal">สรุปผลการดำเนินงานภายใน</div>
                            <div className="text-xs text-neutral">ประจำเดือน {selectedBriefMonth}</div>
                        </div>
                    </div>
                </div>

                {/* 01 TEAM SNAPSHOT */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-charcoal">
                        <span className="text-lg font-semibold text-charcoal">01</span>
                        <h4 className="text-xs font-semibold text-charcoal">ภาพรวมทีมงาน / TEAM SNAPSHOT</h4>
                    </div>
                    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                        {/* Employee grid */}
                        <div className="lg:col-span-2 border border-rule divide-y divide-neutral-200 overflow-hidden">
                            {teamSnapshot.map((emp, i) => (
                                <div key={i} className="grid grid-cols-12 gap-2 p-3 items-start hover:bg-paper-2/50">
                                    <div className="col-span-4 flex items-center gap-2">
                                        <div className="w-6 h-6 bg-paper-2 flex items-center justify-center text-neutral border border-rule shrink-0">
                                                                                    </div>
                                        <div>
                                            <div className="text-xs font-semibold text-charcoal">{emp.name}</div>
                                            <div className="text-xs text-neutral font-medium">{emp.position}</div>
                                        </div>
                                    </div>
                                    <div className="col-span-8">
                                        <ul className="list-disc pl-3 text-xs text-charcoal space-y-0.5 leading-relaxed">
                                            {(emp.bullets || []).map((bullet, idx) => (
                                                <li key={idx}>{bullet}</li>
                                            ))}
                                        </ul>
                                    </div>
                                </div>
                            ))}
                        </div>

                        {/* Sidebar */}
                        <div className="space-y-4">
                            {/* Recruitment Policy */}
                            <div className="border border-rule p-4 bg-paper-2/50 space-y-2">
                                <div className="flex items-center gap-2 border-b border-rule pb-1.5">
                                                                        <h5 className="text-xs font-semibold text-charcoal">นโยบายการรับพนักงานเดือนหน้า</h5>
                                </div>
                                <p className="text-xs text-charcoal leading-relaxed whitespace-pre-wrap">{recruitmentPolicy}</p>
                            </div>

                            {/* 4 Stats Grid */}
                            <div className="grid grid-cols-2 gap-2">
                                <div className="border border-rule p-3 text-center space-y-1 bg-cream">
                                                                        <div className="text-lg font-semibold text-charcoal">{metrics.forgotClockOutCount || 0} ครั้ง</div>
                                    <div className="text-xs text-neutral font-semibold">ลืมลงเวลาออกงาน</div>
                                </div>
                                <div className="border border-rule p-3 text-center space-y-1 bg-cream">
                                                                        <div className="text-lg font-semibold text-charcoal">{metrics.probationCount || 0} คน</div>
                                    <div className="text-xs text-neutral font-semibold">พนักงานทดลองงาน</div>
                                </div>
                                <div className="border border-rule p-3 text-center space-y-1 bg-cream">
                                                                        <div className="text-lg font-semibold text-charcoal">{metrics.notReadyCount || 0} คน</div>
                                    <div className="text-xs text-neutral font-semibold">ไม่พร้อมทำงาน</div>
                                </div>
                                <div className="border border-rule p-3 text-center space-y-1 bg-cream">
                                                                        <div className="text-lg font-semibold text-charcoal">{metrics.failedProbationCount || 0} คน</div>
                                    <div className="text-xs text-neutral font-semibold">ไม่ผ่านทดลองงาน</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* 02 MOOD INDEX */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-charcoal">
                        <span className="text-lg font-semibold text-charcoal">02</span>
                        <h4 className="text-xs font-semibold text-charcoal">ดัชนีอารมณ์ทีม / MOOD INDEX</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Bar & Floor */}
                        {moodIndex.barAndFloor && (
                            <div className="border border-rule p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                                        Bar & Floor อารมณ์โดยรวม
                                    </div>
                                    <span className="text-xs font-semibold text-plum">{moodIndex.barAndFloor.score}/100</span>
                                </div>
                                {/* Slider display */}
                                <div className="w-full bg-paper-2 h-2 border border-rule overflow-hidden">
                                    <div 
                                        className="bg-paper-2 h-full" 
                                        style={{ width: `${Math.min(100, Math.max(0, moodIndex.barAndFloor.score || 0))}%` }} 
                                    />
                                </div>
                                <ul className="list-disc pl-3 text-xs text-charcoal space-y-0.5 leading-relaxed">
                                    {(moodIndex.barAndFloor.bullets || []).map((b, idx) => (
                                        <li key={idx}>{b}</li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        {/* Cooking */}
                        {moodIndex.cooking && (
                            <div className="border border-rule p-4 space-y-3">
                                <div className="flex justify-between items-center">
                                    <div className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                                        Cooking/ครัว อารมณ์โดยรวม
                                    </div>
                                    <span className="text-xs font-semibold text-plum">{moodIndex.cooking.score}/100</span>
                                </div>
                                {/* Slider display */}
                                <div className="w-full bg-paper-2 h-2 border border-rule overflow-hidden">
                                    <div 
                                        className="bg-paper-2 h-full" 
                                        style={{ width: `${Math.min(100, Math.max(0, moodIndex.cooking.score || 0))}%` }} 
                                    />
                                </div>
                                <ul className="list-disc pl-3 text-xs text-charcoal space-y-0.5 leading-relaxed">
                                    {(moodIndex.cooking.bullets || []).map((b, idx) => (
                                        <li key={idx}>{b}</li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                </div>

                {/* 03 ISSUES & RESPONSES */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-charcoal">
                        <span className="text-lg font-semibold text-charcoal">03</span>
                        <h4 className="text-xs font-semibold text-charcoal">ปัญหาและการจัดการ / ISSUES & RESPONSES</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                        {[
                            { key: 'assets', label: 'A. อุปกรณ์ / ทรัพย์สิน' },
                            { key: 'qc', label: 'B. วัตถุดิบเสียหาย / QC' },
                            { key: 'hygiene', label: 'C. วัตถุดิบแห้ง / สุขอนามัย' },
                            { key: 'recipes', label: 'D. สูตรเครื่องดื่ม / ราคา' },
                            { key: 'service', label: 'E. บริการ / ระบบหน้าร้าน' }
                        ].map(col => (
                            <div key={col.key} className="border border-rule p-3 space-y-2 bg-paper-2/20">
                                <h5 className="text-xs font-semibold text-charcoal border-b border-rule pb-1">{col.label}</h5>
                                <ul className="list-disc pl-3 text-xs text-charcoal space-y-1 leading-relaxed">
                                    {(issues[col.key] || []).map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 04 NEXT ACTIONS */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-charcoal">
                        <span className="text-lg font-semibold text-charcoal">04</span>
                        <h4 className="text-xs font-semibold text-charcoal">ข้อเสนอแนะเดือนถัดไป / NEXT ACTIONS</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {nextActions.map((action, i) => (
                            <div key={i} className="border border-rule p-4 space-y-2 bg-cream">
                                <h5 className="text-xs font-semibold text-charcoal flex items-center gap-1.5">
                                    {action.title}
                                </h5>
                                <ul className="list-disc pl-3 text-xs text-charcoal space-y-0.5 leading-relaxed">
                                    {(action.bullets || []).map((b, idx) => (
                                        <li key={idx}>{b}</li>
                                    ))}
                                </ul>
                            </div>
                        ))}
                    </div>
                </div>

                {/* 05 SUMMARY FOCUS (Footer) */}
                <div className="space-y-3">
                    <div className="flex items-center gap-2 pb-1.5 border-b border-charcoal">
                        <span className="text-lg font-semibold text-charcoal">05</span>
                        <h4 className="text-xs font-semibold text-charcoal">SUMMARY FOCUS</h4>
                    </div>
                    <div className="border border-rule p-4 grid grid-cols-2 md:grid-cols-5 gap-4 divide-y md:divide-y-0 md:divide-x divide-neutral-200 text-center items-center bg-cream">
                        <div className="pt-2 md:pt-0">
                            <div className="text-xs font-semibold text-neutral">ลงเวลาออกงาน</div>
                            <div className="text-xs font-semibold text-charcoal mt-1 whitespace-pre-line">{summaryFocus.forgotClockOut}</div>
                        </div>
                        <div className="pt-2 md:pt-0">
                            <div className="text-xs font-semibold text-neutral">ทดลองงาน</div>
                            <div className="text-xs font-semibold text-charcoal mt-1 whitespace-pre-line">{summaryFocus.probation}</div>
                        </div>
                        <div className="pt-2 md:pt-0">
                            <div className="text-xs font-semibold text-neutral">ของเสียหาย</div>
                            <div className="text-xs font-semibold text-charcoal mt-1 whitespace-pre-line">{summaryFocus.brokenItems}</div>
                        </div>
                        <div className="pt-2 md:pt-0">
                            <div className="text-xs font-semibold text-neutral">ระบบที่ต้องซ้อม</div>
                            <div className="text-xs font-semibold text-charcoal mt-1 whitespace-pre-line">{summaryFocus.systemCheck}</div>
                        </div>
                        <div className="pt-2 md:pt-0 col-span-2 md:col-span-1 border-t md:border-t-0 border-rule">
                            <div className="text-xs font-semibold text-neutral">เป้าหมายโฟกัส</div>
                            <div className="text-xs font-semibold text-plum mt-1">{summaryFocus.focusAreas}</div>
                        </div>
                    </div>
                </div>
            </div>
        );
    };

    const getMoodStats = () => {
        const stats = { '': 0, '': 0, '': 0, '': 0, '': 0 };
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
            if (briefMode === 'daily' && !dailyBriefs[selectedBriefDate]) {
                handleGenerateBrief(selectedBriefDate);
            } else if (briefMode === 'monthly' && !monthlyBriefs[selectedBriefMonth]) {
                handleGenerateMonthlyBrief(selectedBriefMonth);
            }
        }
    }, [activeTab, selectedDate, selectedBriefDate, selectedBriefMonth, briefMode]);

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
            if (employees.length === 0) {
                const { data: empData } = await supabase
                    .from('employees')
                    .select('id, name, nickname, position, line_bot_id, line_user_id, is_active')
                    .eq('is_active', true);
                if (empData) setEmployees(empData);
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
            
            // Fetch config if not loaded
            const { data: cfgData } = await supabase.from('yuzu_config').select('*');
            if (cfgData) {
                const cfg = {};
                cfgData.forEach(item => cfg[item.key] = item.value);
                setConfig(prev => ({ ...prev, ...cfg }));
            }
            
            // Fetch employees if not already loaded to support mapping
            if (employees.length === 0) {
                const { data: empData } = await supabase
                    .from('employees')
                    .select('id, name, nickname, line_bot_id, line_user_id')
                    .eq('is_active', true);
                if (empData) setEmployees(empData);
            }

            setSlipLoading(false);
        }
    }

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
                setMessage('เพิ่มความรู้สำเร็จ! ');
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
                setMessage('อัปเดตความรู้สำเร็จ! ');
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
            setMessage('บันทึกความรู้เข้าคลังหลักเรียบร้อย ');
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

    async function handleUpdateConfig(key, value) {
        setLoading(true);
        const { error } = await supabase
            .from('yuzu_config')
            .upsert({ key, value, updated_at: new Date().toISOString() });
        
        if (error) {
            alert('Error updating config: ' + error.message);
        } else {
            setConfig(prev => ({ ...prev, [key]: value }));
            setMessage('บันทึกการตั้งค่าแล้ว ');
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
            setMessage('อัปเดตข้อมูลพนักงานเรียบร้อย ');
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
                
                setMessage('ประเมินประสิทธิภาพด้วย AI สำเร็จและบันทึกเรียบร้อยเมี๊ยว~ ');
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
            const confirmed = window.confirm("ยืนยันการลบไฟล์โดยไม่สำรองข้อมูล? ไฟล์ที่ถูกลบไปแล้วจะไม่สามารถกู้คืนได้!");
            if (!confirmed) return;
        }

        setCleanupLoading(true);
        setCleanupStatus({
            state: 'running',
            message: shouldBackup 
                ? 'กำลังดึงข้อมูลและเตรียมไฟล์สำรอง...' 
                : 'กำลังตรวจสอบและล้างไฟล์ภาพเก่าในระบบ...',
            type: 'info'
        });

        try {
            if (shouldBackup) {
                // 1. Fetch data to backup
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);
                const cutoffISO = cutoffDate.toISOString();

                try {
                    // Fetch slips
                    const { data: slipsToBackup, error: slipErr } = await supabase
                        .from('slip_transactions')
                        .select('id, amount, slip_url, timestamp, sender_name, user_id, bank_name, date')
                        .not('slip_url', 'is', null)
                        .lt('timestamp', cutoffISO);

                    if (slipErr) console.warn("Backup slips warning:", slipErr);

                    // Fetch coffee shot reports and descriptions
                    const { data: chatsToBackup, error: chatErr } = await supabase
                        .from('yuzu_chat_history')
                        .select('id, created_at, user_id, role, content, message_type')
                        .eq('message_type', 'image_description')
                        .like('content', '%[ภาพประกอบช็อตกาแฟ]%')
                        .lt('created_at', cutoffISO);

                    if (chatErr) console.warn("Backup chats warning:", chatErr);

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
                    link.setAttribute('download', `yuzu-storage-backup-${new Date().toISOString().split('T')[0]}.json`);
                    document.body.appendChild(link);
                    link.click();
                    setTimeout(() => {
                        if (document.body.contains(link)) document.body.removeChild(link);
                        URL.revokeObjectURL(url);
                    }, 2000);
                } catch (backupErr) {
                    console.error("Backup file generation error:", backupErr);
                }
            }

            setCleanupStatus({
                state: 'running',
                message: 'กำลังล้างไฟล์ภาพเก่าใน Supabase Storage...',
                type: 'info'
            });

            // 2. Call the cleanup API with a 45s timeout guard so the button never gets stuck
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 45000);

            const res = await fetch('/api/yuzu/cleanup-uploads', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ days }),
                signal: controller.signal
            });
            clearTimeout(timeoutId);

            if (!res.ok) {
                const text = await res.text();
                let errMsg = `เกิดข้อผิดพลาดจากเซิร์ฟเวอร์ (${res.status})`;
                try {
                    const parsed = JSON.parse(text);
                    if (parsed.error) errMsg = parsed.error;
                } catch (_) {}
                throw new Error(errMsg);
            }

            const result = await res.json();
            if (result.success) {
                const totalDeleted = (result.yuzu_slips_deleted || 0) + (result.yuzu_images_deleted || 0);
                const msg = totalDeleted > 0
                    ? `ล้างข้อมูลสำเร็จ! ลบสลิป ${result.yuzu_slips_deleted} รูป, รูปประกอบ ${result.yuzu_images_deleted} รูป (รวม ${totalDeleted} รูป) `
                    : `ระบบตรวจสอบแล้ว: ไม่มีรูปภาพที่เก่ากว่า ${days} วันในระบบ (พื้นที่สะอาดเรียบร้อยแล้ว) `;

                setCleanupStatus({
                    state: 'success',
                    message: msg,
                    type: 'success'
                });
                setShowCleanupConfirm(false);
            } else {
                setCleanupStatus({
                    state: 'error',
                    message: 'เกิดข้อผิดพลาด: ' + (result.error || 'ไม่ทราบสาเหตุ'),
                    type: 'error'
                });
            }
        } catch (err) {
            console.error("Cleanup execution error:", err);
            const isTimeout = err.name === 'AbortError';
            setCleanupStatus({
                state: 'error',
                message: isTimeout
                    ? 'การเชื่อมต่อใช้เวลานานเกินไป: ระบบอาจกำลังดำเนินการเบื้องหลัง กรุณารอสักครู่แล้วตรวจสอบอีกครั้ง'
                    : 'เกิดข้อผิดพลาดในการล้างข้อมูล: ' + err.message,
                type: 'error'
            });
        } finally {
            setCleanupLoading(false);
        }
    }

    const filteredKnowledge = knowledge.filter(k => 
        k.content.toLowerCase().includes(searchTerm.toLowerCase())
    );

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 border-b border-rule pb-4">
                <div>
                    <p className="text-neutral text-sm">จัดการฐานความรู้ สิทธิ์บอส และยอดโอนเงิน</p>
                </div>
                
                {/* Internal Tabs */}
                <div className="border border-rule p-1 bg-cream flex flex-wrap gap-1 self-start">
                    {[
                        { id: 'knowledge', label: 'ความรู้' },
                        { id: 'insights', label: 'สรุปจาก AI' },
                        { id: 'hashtags', label: 'แฮชแท็ก' },
                        { id: 'config', label: 'สิทธิ์' },
                        { id: 'employees', label: 'บทบาทพนักงาน' },
                        { id: 'slips', label: 'สลิปโอน' },
                        { id: 'espresso', label: 'บันทึกเอสเปรสโซ' }
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
                        <h3 className="font-semibold text-xs text-charcoal flex items-center gap-2">เพิ่มความรู้ใหม่</h3>
                        <div className="space-y-3">
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-neutral px-1">เนื้อหา</label>
                                <textarea
                                    className="w-full p-4 bg-cream border border-rule h-40 text-xs font-num text-charcoal outline-none focus:border-charcoal transition-colors duration-150 resize-none"
                                    placeholder="ป้อนข้อมูลความรู้ให้น้องยูซุ..."
                                    value={newContent}
                                    onChange={(e) => setNewContent(e.target.value)}
                                />
                            </div>
                            
                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-neutral px-1">ลิงก์รูป (ถ้ามี)</label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-cream border border-rule text-xs font-num text-charcoal outline-none focus:border-charcoal"
                                    placeholder="https://example.com/image.png"
                                    value={newImageUrl}
                                    onChange={(e) => setNewImageUrl(e.target.value)}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-xs font-semibold text-neutral px-1">แนบไฟล์ (PDF หรือรูป)</label>
                                <input
                                    type="file"
                                    accept="application/pdf,image/*"
                                    className="w-full text-xs font-num text-neutral file:mr-4 file:py-2 file:px-4 file: file:border file:border-rule file:text-xs file:font-num file:bg-cream file:text-charcoal hover:file:bg-cream cursor-pointer"
                                    onChange={(e) => setNewFile(e.target.files[0])}
                                />
                                {newFile && <p className="text-xs text-charcoal font-num font-semibold px-1 mt-1">Ready to upload: {newFile.name}</p>}
                            </div>

                            <div className="pt-2">
                                <button
                                    onClick={handleAddKnowledge}
                                    disabled={loading || (!newContent && !newFile)}
                                    className="w-full py-3 bg-charcoal text-cream border border-charcoal font-num font-semibold hover:bg-charcoal-2 disabled:opacity-50 transition-colors duration-150 flex items-center justify-center gap-2"
                                >
                                    
                                    {loading ? "กำลังบันทึก…" : "สอนยูซุ"}
                                </button>
                                {message && <p className={`text-xs font-num font-semibold text-center mt-3 ${message.includes("สำเร็จ") ? "text-charcoal" : "text-plum"}`}>{message}</p>}
                            </div>
                        </div>
                    </Card>

                    <div className="lg:col-span-2 space-y-4">
                        <Card className="flex items-center gap-3 py-3 px-4">
                                                        <input
                                type="text"
                                placeholder="ค้นหาในฐานความรู้"
                                className="bg-transparent border-none outline-none text-xs font-num text-charcoal w-full placeholder:text-neutral"
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                            />
                        </Card>
                        <Card className="p-0 overflow-hidden">
                            <div className="max-h-[600px] overflow-auto custom-scrollbar">
                                <table className="w-full text-xs text-left">
                                    <thead className="bg-cream sticky top-0 z-10 text-charcoal text-xs font-semibold border-b border-charcoal">
                                        <tr>
                                            <th className="px-6 py-4">เนื้อหา</th>
                                            <th className="px-6 py-4 w-32">วันที่เพิ่ม</th>
                                            <th className="px-6 py-4 w-10"></th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-rule bg-cream">
                                        {filteredKnowledge.map((k) => (
                                            <tr key={k.id} className="group hover:bg-paper-2 transition-colors">
                                                <td className="px-6 py-4">
                                                    {editingId === k.id ? (
                                                        <div className="space-y-3 p-4 bg-cream border border-charcoal">
                                                            <textarea 
                                                                className="w-full p-3 bg-cream text-xs font-num text-charcoal outline-none h-40 resize-none border border-rule"
                                                                value={editingContent}
                                                                onChange={(e) => setEditingContent(e.target.value)}
                                                            />
                                                            <div className="space-y-1">
                                                                <label className="text-xs font-semibold text-neutral">ลิงก์รูป</label>
                                                                <input 
                                                                    type="text"
                                                                    className="w-full p-2 bg-cream text-xs font-num border border-rule text-charcoal"
                                                                    value={editingImageUrl}
                                                                    onChange={(e) => setEditingImageUrl(e.target.value)}
                                                                />
                                                            </div>
                                                            <div className="flex gap-2">
                                                                <button onClick={handleUpdateKnowledge} className="flex-1 py-2 bg-charcoal text-cream border border-charcoal font-num font-semibold text-xs hover:bg-charcoal-2">Save</button>
                                                                <button onClick={() => setEditingId(null)} className="px-4 py-2 bg-cream text-neutral border border-rule font-num font-semibold text-xs hover:bg-cream">Cancel</button>
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="flex gap-4 items-start">
                                                            {k.metadata?.image_url && (
                                                                <div className="w-16 h-16 overflow-hidden flex-shrink-0 border border-rule">
                                                                    <img src={k.metadata.image_url} alt="Reference" className="w-full h-full object-cover" />
                                                                </div>
                                                            )}
                                                            <div className="space-y-2 flex-1">
                                                                {k.metadata?.file_type === 'pdf' && (
                                                                    <div className="flex items-center gap-2 text-xs font-num font-semibold text-error bg-error/10 border border-error/20 px-2 py-1 w-fit">
                                                                        PDF: {k.metadata.file_name}
                                                                    </div>
                                                                )}
                                                                <p className="text-charcoal text-xs whitespace-pre-wrap leading-relaxed">{k.content}</p>
                                                            </div>
                                                        </div>
                                                    )}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap"><span className="text-xs font-num font-semibold text-neutral">{new Date(k.created_at).toLocaleDateString("th-TH")}</span></td>
                                                <td className="px-6 py-4">
                                                    <div className="flex items-center gap-1 transition-colors duration-150">
                                                        <button 
                                                            onClick={() => {
                                                                setEditingId(k.id);
                                                                setEditingContent(k.content);
                                                                setEditingImageUrl(k.metadata?.image_url || '');
                                                            }} 
                                                            className="text-neutral hover:text-plum hover:bg-cream transition-colors duration-150 min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                                        >แก้ไข</button>
                                                        <button onClick={() => handleDeleteKnowledge(k.id)} className="hover:bg-cream transition-colors duration-150 min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline text-error">ลบ</button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Card>
                        <p className="text-center text-xs text-neutral font-num font-semibold mt-4">Total {filteredKnowledge.length} entries</p>
                    </div>
                </div>
            )}

            {/* TAB: INSIGHTS */}
            {activeTab === 'insights' && (
                <div className="space-y-6">
                    
                    {/* Header Row */}
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center bg-charcoal p-6 text-cream border border-charcoal gap-4">
                        <div className="space-y-1">
                            <h3 className="text-base font-num font-semibold text-cream flex items-center gap-2">สรุปงานจากยูซุ</h3>
                            <p className="text-cream/60 text-xs mt-1">วิเคราะห์พฤติกรรม สรุปงานรายวัน และแชทคุยเพื่อสั่งงานยูซุได้ทันที</p>
                        </div>
                        <button
                            onClick={() => handleGenerateBrief(selectedBriefDate)}
                            disabled={briefLoading}
                            className="bg-cream text-charcoal border border-charcoal hover:bg-cream transition-colors duration-150 font-num font-semibold text-xs py-2.5 px-5 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                        >
                            {briefLoading ? "กำลังสรุป…" : "สรุป/อัปเดตข้อมูลประจำวัน"}
                        </button>
                    </div>

                    {/* AI Operations Briefing (Full Width) */}
                    <Card className="p-6 space-y-4 border-t-2 border-t-plum">
                        <div className="flex justify-between items-center pb-2 border-b border-rule">
                            <h4 className="font-num font-semibold text-xs text-charcoal flex items-center gap-2">สรุปงานประจำวัน</h4>
                            <Badge color="orange">
                                {briefMode === 'daily' ? 'บันทึกสรุปย้อนหลัง 3 วัน' : 'สรุปรายงานประจำเดือน'}
                            </Badge>
                        </div>

                        {/* Brief Mode Selector */}
                        <div className="flex border border-rule p-1 bg-cream gap-1">
                            <button 
                                onClick={() => setBriefMode('daily')}
                                className={`flex-1 py-1 text-center transition-colors duration-150 font-num font-semibold text-xs cursor-pointer ${
 briefMode === 'daily'
 ? 'bg-charcoal text-cream'
 : 'text-neutral hover:bg-cream'
 }`}
                            >
                                สรุปรายวัน
                            </button>
                            <button 
                                onClick={() => setBriefMode('monthly')}
                                className={`flex-1 py-1 text-center transition-colors duration-150 font-num font-semibold text-xs cursor-pointer ${
 briefMode === 'monthly'
 ? 'bg-charcoal text-cream'
 : 'text-neutral hover:bg-cream'
 }`}
                            >
                                สรุปรายเดือน
                            </button>
                        </div>
                        
                        {briefMode === 'daily' && (
                            <>
                                {/* Date Selector Tabs */}
                                <div className="flex border-b border-rule pb-2 overflow-x-auto gap-1 no-scrollbar">
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
                                                className={`flex-1 py-1.5 px-2.5 text-center transition-colors duration-150 duration-200 whitespace-nowrap min-w-[70px] cursor-pointer ${
 isSelected 
 ? 'bg-charcoal text-cream font-num font-semibold text-xs ' 
 : 'text-neutral hover:bg-cream font-num font-semibold text-xs'
 }`}
                                            >
                                                <div className="text-xs opacity-80">{dayLabel}</div>
                                                <div className="text-xs">{formattedDate}</div>
                                            </button>
                                        );
                                    })}
                                </div>

                                {briefLoading ? (
                                    <div className="py-12 flex flex-col items-center justify-center space-y-3 text-neutral">
                                        
                                        <p className="text-xs font-semibold">ยูซุกำลังวิเคราะห์ข้อมูลกะงานและสรุปห้องแชท...</p>
                                    </div>
                                ) : dailyBriefs[selectedBriefDate] ? (
                                    <div className="bg-cream p-4 border border-rule text-charcoal text-xs font-num whitespace-pre-wrap leading-relaxed">
                                        {dailyBriefs[selectedBriefDate]}
                                    </div>
                                ) : (
                                    <div className="py-12 text-center text-neutral space-y-3 font-num">
                                        <p className="text-xs font-semibold">ยังไม่มีการสร้างสรุปประจำวันนี้</p>
                                        <button 
                                            onClick={() => handleGenerateBrief(selectedBriefDate)}
                                            className="text-xs font-semibold text-plum hover:text-plum/95 underline cursor-pointer"
                                        >
                                            กดเพื่อสร้างสรุปเมี๊ยว~
                                        </button>
                                    </div>
                                )}

                                {/* PDF Actions */}
                                {dailyBriefs[selectedBriefDate] && !briefLoading && (
                                    <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-rule">
                                        <button
                                            onClick={() => handleExportSingleBriefPDF(selectedBriefDate)}
                                            disabled={pdfLoading}
                                            className="flex-1 py-2 px-3 bg-cream border border-rule text-charcoal hover:bg-cream transition-colors duration-150 font-num font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                        >
                                            {pdfLoading ? "กำลังสรุป…" : "ส่งออก PDF สรุปประจำวัน"}
                                        </button>
                                        <button
                                            onClick={handleExportThreeDayReportPDF}
                                            disabled={pdfLoading}
                                            className="flex-1 py-2 px-3 bg-charcoal text-cream border border-charcoal hover:bg-charcoal-2 transition-colors duration-150 font-num font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                        >
                                            {pdfLoading ? "กำลังสรุป…" : "ส่งออก PDF ย้อนหลัง 3 วัน"}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}

                        {briefMode === 'monthly' && (
                            <>
                                {/* Month Selector Dropdown */}
                                <div className="flex items-center gap-2 border-b border-rule pb-3">
                                    <label className="text-xs font-semibold text-neutral">เลือกเดือน:</label>
                                    <select
                                        value={selectedBriefMonth}
                                        onChange={(e) => setSelectedBriefMonth(e.target.value)}
                                        className="bg-cream text-charcoal border border-rule p-1 px-2 text-xs font-num outline-none cursor-pointer flex-1"
                                    >
                                        {recentMonths.map(m => (
                                            <option key={m.value} value={m.value}>{m.label}</option>
                                        ))}
                                    </select>
                                </div>

                                {monthlyLoading ? (
                                    <div className="py-12 flex flex-col items-center justify-center space-y-3 text-neutral">
                                        
                                        <p className="text-xs font-semibold">ยูซุกำลังวิเคราะห์ข้อมูลกะงานและสรุปห้องแชททั้งเดือน...</p>
                                    </div>
                                ) : monthlyBriefs[selectedBriefMonth] ? (
                                    (() => {
                                        let parsedData = {};
                                        try {
                                            parsedData = typeof monthlyBriefs[selectedBriefMonth] === 'string'
                                                ? JSON.parse(monthlyBriefs[selectedBriefMonth].replace(/```json/g, '').replace(/```/g, '').trim())
                                                : monthlyBriefs[selectedBriefMonth];
                                        } catch(e) {
                                            return (
                                                <div className="bg-cream p-4 border border-rule text-charcoal text-xs font-num whitespace-pre-wrap leading-relaxed">
                                                    {String(monthlyBriefs[selectedBriefMonth])}
                                                </div>
                                            );
                                        }
                                        return renderInfographic(parsedData);
                                    })()
                                ) : (
                                    <div className="py-12 text-center text-neutral space-y-3 font-num">
                                        <p className="text-xs font-semibold">ยังไม่มีการสร้างสรุปประจำเดือนนี้</p>
                                        <button 
                                            onClick={() => handleGenerateMonthlyBrief(selectedBriefMonth)}
                                            className="text-xs font-semibold text-plum hover:text-plum/95 underline cursor-pointer"
                                        >
                                            กดเพื่อสร้างสรุปรายเดือนเมี๊ยว~
                                        </button>
                                    </div>
                                )}

                                {/* PDF Actions for Monthly Brief */}
                                {monthlyBriefs[selectedBriefMonth] && !monthlyLoading && (
                                    <div className="flex flex-col sm:flex-row gap-2 pt-3 border-t border-rule">
                                        <button
                                            onClick={() => handleExportMonthlyBriefPDF(selectedBriefMonth)}
                                            disabled={pdfLoading}
                                            className="w-full py-2.5 px-3 bg-charcoal text-cream border border-charcoal hover:bg-charcoal-2 transition-colors duration-150 font-num font-semibold text-xs flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                                        >
                                            {pdfLoading ? "กำลังสรุป…" : "ส่งออก PDF สรุปประจำเดือน"}
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </Card>

                    {/* Secondary Metrics: Grid Layout */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        
                        {/* Sentiment Tracker & Mood Index */}
                        <Card className="p-6 space-y-4 border-t-2 border-t-charcoal">
                            <h4 className="font-semibold text-xs text-charcoal flex items-center gap-2">
                                                                อารมณ์ทีมงานวันนี้
                            </h4>
                            
                            {(() => {
                                const { stats, total } = getMoodStats();
                                return (
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-5 gap-2 text-center">
                                            {Object.entries(stats).map(([mood, count]) => {
                                                const percentage = total > 0 ? Math.round((count / total) * 100) : 0;
                                                const label = mood === '🔥' ? 'ไฟลุก' : mood === '😊' ? 'สดใส' : mood === '😐' ? 'เฉยๆ' : mood === '😴' ? 'ง่วง' : 'ไม่สบาย';
                                                const color = mood === '🔥' ? 'text-plum' : mood === '😊' ? 'text-charcoal' : mood === '😐' ? 'text-neutral' : mood === '😴' ? 'text-plum' : 'text-error';
                                                return (
                                                    <div key={mood} className="bg-cream p-2.5 border border-rule space-y-1">
                                                        <span className="text-2xl block">{mood}</span>
                                                        <span className={`text-xs font-num font-semibold block ${color}`}>{label}</span>
                                                        <span className="text-xs font-semibold text-charcoal">{count} คน ({percentage}%)</span>
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Beautiful horizontal bar of mood breakdown */}
                                        <div className="w-full h-3 bg-cream border border-rule overflow-hidden flex">
                                            {Object.entries(stats).map(([mood, count]) => {
                                                if (count === 0) return null;
                                                const percentage = (count / total) * 100;
                                                const bg = mood === '🔥' ? 'bg-plum' : mood === '😊' ? 'bg-charcoal' : mood === '😐' ? 'bg-neutral' : mood === '😴' ? 'bg-plum' : 'bg-error';
                                                return (
                                                    <div 
                                                        key={mood} 
                                                        style={{ width: `${percentage}%` }} 
                                                        className={`${bg} transition-colors duration-150 duration-500`}
                                                        title={`${mood}: ${count} คน`}
                                                    />
                                                );
                                            })}
                                        </div>
                                        <p className="text-xs font-num font-semibold text-neutral text-center">
                                            วันนี้บันทึกอารมณ์ {total} ครั้ง
                                        </p>
                                    </div>
                                );
                            })()}
                        </Card>

                        {/* Staff Mood Timeline */}
                        <Card className="p-6 space-y-4 max-h-[380px] overflow-y-auto custom-scrollbar bg-cream border border-rule">
                            <h4 className="font-semibold text-xs text-charcoal sticky top-0 bg-cream py-1 flex items-center gap-2">
                                                                อารมณ์และโน้ตล่าสุด
                            </h4>
                            
                            <div className="space-y-3">
                                {attendanceLogs.filter(log => log.mood_status || log.mood_note).length === 0 ? (
                                    <p className="text-center text-xs font-semibold text-neutral py-6">ยังไม่มีการบันทึกอารมณ์ในขณะนี้</p>
                                ) : (
                                    attendanceLogs
                                        .filter(log => log.mood_status || log.mood_note)
                                        .map((log) => {
                                            const empName = log.employees?.nickname || log.employees?.name || 'พนักงาน';
                                            const time = new Date(log.timestamp).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' });
                                            const actionLabel = log.action_type === 'check_in' ? 'เข้างาน' : 'ออกงาน';
                                            return (
                                                <div key={log.id} className="flex gap-3 items-start border-b border-rule pb-2.5 last:border-0 last:pb-0">
                                                    <span className="text-2xl bg-cream p-1.5 border border-rule flex-shrink-0">
                                                        {log.mood_status || ''}
                                                    </span>
                                                    <div className="space-y-0.5 flex-1">
                                                        <div className="flex justify-between items-center">
                                                            <span className="font-semibold text-charcoal text-xs">{empName}</span>
                                                            <span className="text-xs text-neutral font-num font-semibold">{time} ({actionLabel})</span>
                                                        </div>
                                                        {log.mood_note && (
                                                            <p className="text-xs bg-cream text-neutral p-2.5 border border-rule font-num">
                                                                &ldquo;{log.mood_note}&rdquo;
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

                    {/* Collapsible Pending Facts Accordion */}
                    <Card className="border border-charcoal overflow-hidden p-0">
                        {/* Accordion Trigger Header */}
                        <button 
                            onClick={() => setIsPendingInsightsExpanded(!isPendingInsightsExpanded)}
                            className="w-full bg-cream hover:bg-paper-2 p-4 px-6 flex justify-between items-center text-charcoal font-num font-semibold text-xs transition-colors duration-150 border-b border-rule cursor-pointer"
                        >
                            <div className="flex items-center gap-2">
                                                                <span>คลังความรู้ที่ยูซุแอบจำมารอการอนุมัติ ({insights.length} รายการ)</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <Badge color="purple">{insights.length}</Badge>
                                {isPendingInsightsExpanded ? "ซ่อน" : "ดู"}
                            </div>
                        </button>

                        {/* Accordion Content */}
                        {isPendingInsightsExpanded && (
                            <div className="p-6 bg-cream space-y-4">
                                <p className="text-xs text-neutral leading-relaxed">
                                    นี่คือชุดข้อมูล/ข้อเท็จจริงใหม่ที่ยูซุคัดกรองจากบทสนทนาในห้องแชทของร้าน In The Haus คุณพ่อคุณแม่สามารถเลือก Approve เพื่อบันทึกเข้าฐานความรู้หลัก สำหรับใช้ตอบคำถาม หรือคลิก Delete เพื่อยกเลิกข้อมูลดังกล่าวได้ครับ
                                </p>
                                
                                {insights.length === 0 ? (
                                    <div className="py-12 text-center text-neutral font-num font-semibold text-xs">
                                        <p>ไม่มีรายการค้างอนุมัติเมี๊ยว~ </p>
                                    </div>
                                ) : (
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                        {insights.map(item => (
                                            <Card key={item.id} className="group hover:border-charcoal transition-colors duration-150 border-l-4 border-l-plum border border-rule p-5 space-y-4 bg-paper-2">
                                                <div className="flex justify-between items-start">
                                                    <Badge color={item.metadata?.is_problem ? "rose" : "purple"}>
                                                        {item.metadata?.category || 'GENERAL'}
                                                    </Badge>
                                                    <span className="text-xs font-num font-semibold text-neutral">{new Date(item.created_at).toLocaleTimeString('th-TH')}</span>
                                                </div>
                                                
                                                <p className="text-xs font-num text-charcoal leading-relaxed">
                                                    {item.content}
                                                </p>
                                                
                                                <div className="space-y-2 py-2">
                                                    <label className="text-xs font-semibold text-neutral block">Keywords (พิมพ์แล้วกด Enter)</label>
                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                        {(item.metadata?.keywords || []).map((kw, idx) => (
                                                            <span key={idx} className="bg-cream text-charcoal px-2 py-1 border border-rule text-xs font-num font-semibold flex items-center gap-1 group/tag transition-colors duration-150 hover:bg-cream">
                                                                {kw}
                                                                <button 
                                                                    onClick={() => {
                                                                        const newKeywords = item.metadata.keywords.filter((_, i) => i !== idx);
                                                                        handleUpdateInsightKeywords(item.id, newKeywords.join(','));
                                                                    }}
                                                                    className="text-neutral hover:text-error transition-colors cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                                                >ปิด</button>
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
                                                        className="w-full text-xs font-num font-semibold text-charcoal bg-cream p-2 border border-rule outline-none focus:border-charcoal transition-colors duration-150"
                                                    />
                                                </div>
                                                
                                                <div className="flex gap-2 pt-2">
                                                    <button 
                                                        onClick={() => handleVerifyInsight(item.id)}
                                                        className="flex-1 bg-charcoal text-cream border border-charcoal hover:bg-charcoal/90 py-2 text-xs font-num font-semibold transition-colors duration-150 cursor-pointer"
                                                    >
                                                        Approve & Save
                                                    </button>
                                                    <button 
                                                        onClick={() => handleDeleteKnowledge(item.id)}
                                                        className="px-4 bg-cream border border-rule text-neutral hover:text-error hover:border-error/30 py-2 text-xs font-num font-semibold transition-colors duration-150 cursor-pointer"
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
                    {/* Card: Slip Submission Permissions */}
                    <Card className="space-y-6">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-2 border-b border-rule pb-3">
                            <div>
                                <h3 className="font-semibold text-xs text-charcoal flex items-center gap-2">
                                                                        สิทธิ์ส่งสลิปโอนเงิน
                                </h3>
                                <p className="text-xs text-neutral mt-1">
                                    กำหนดตำแหน่งพนักงานที่มีสิทธิ์ส่ง/บันทึกสลิปโอนเงินเข้าไลน์กลุ่ม (หากตำแหน่งอื่นส่ง ระบบจะปฏิเสธและแจ้งเตือน)
                                </p>
                            </div>
                            <button
                                onClick={() => handleUpdateConfig('allowed_slip_positions', config.allowed_slip_positions !== undefined ? config.allowed_slip_positions : 'Bar & Floor, Owner, CEO, Manager')}
                                className="px-4 py-2 bg-charcoal text-cream border border-charcoal text-xs font-num font-semibold hover:bg-charcoal-2 transition-colors duration-150 cursor-pointer w-fit self-start md:self-auto"
                            >บันทึกสิทธิ์</button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-semibold text-neutral mb-2 block">
                                    เลือกตำแหน่งที่อนุญาต
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {availablePositions.map(pos => {
                                        const currentStr = config.allowed_slip_positions !== undefined ? config.allowed_slip_positions : 'Bar & Floor, Owner, CEO, Manager';
                                        const currentAllowed = currentStr.split(',').map(s => s.trim()).filter(Boolean);
                                        const isSelected = currentAllowed.some(p => p.toLowerCase() === pos.toLowerCase());

                                        const togglePos = () => {
                                            let newAllowed;
                                            if (isSelected) {
                                                newAllowed = currentAllowed.filter(p => p.toLowerCase() !== pos.toLowerCase());
                                            } else {
                                                newAllowed = [...currentAllowed, pos];
                                            }
                                            const newStr = newAllowed.join(', ');
                                            setConfig(prev => ({ ...prev, allowed_slip_positions: newStr }));
                                        };

                                        return (
                                            <button
                                                key={pos}
                                                type="button"
                                                onClick={togglePos}
                                                className={`px-3 py-1.5 font-num text-xs border transition-colors duration-150 cursor-pointer flex items-center gap-1.5 ${
 isSelected 
 ? 'bg-charcoal text-cream border-charcoal font-semibold' 
 : 'bg-cream text-neutral border-rule hover:border-charcoal'
 }`}
                                            >
                                                <span>{isSelected ? '' : '+'}</span>
                                                <span>{pos}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-semibold text-neutral mb-1 block">
                                    หรือพิมพ์ระบุตำแหน่งเพิ่มเติม (คั่นด้วยเครื่องหมายจุลภาค , )
                                </label>
                                <input
                                    type="text"
                                    className="w-full p-3 bg-cream border border-rule text-xs text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                                    value={config.allowed_slip_positions !== undefined ? config.allowed_slip_positions : 'Bar & Floor, Owner, CEO, Manager'}
                                    onChange={(e) => setConfig({ ...config, allowed_slip_positions: e.target.value })}
                                    placeholder="เช่น Bar & Floor, Owner, Manager, Cooking"
                                />
                                <p className="text-xs text-neutral mt-1.5">
                                    ตัวอย่างข้อความตอบกลับเมื่อไม่มีสิทธิ์: &quot;คุณ [ชื่อ] ไม่มีสิทธิ์ในการบันทึกสลิปเข้าระบบครับ (จำกัดสิทธิ์เฉพาะตำแหน่ง {
                                        (() => {
                                            const str = config.allowed_slip_positions !== undefined ? config.allowed_slip_positions : 'Bar & Floor, Owner, CEO, Manager';
                                            const arr = str.split(',').map(s => s.trim()).filter(Boolean);
                                            if (arr.length <= 1) return arr[0] || 'Bar & Floor';
                                            return `${arr.slice(0, -1).join(', ')} และ ${arr[arr.length - 1]}`;
                                        })()
                                    } เท่านั้น)&quot;
                                </p>
                            </div>
                        </div>
                    </Card>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <Card className="space-y-6">
                            <h3 className="font-semibold text-xs text-charcoal flex items-center gap-2">
                                                                รหัส LINE ของบอส
                            </h3>
                            <div className="space-y-4">
                                {[
                                    { key: 'father_uid', label: 'คุณพ่อ', placeholder: 'U77e...' },
                                    { key: 'mother_uid', label: 'คุณแม่', placeholder: 'U8c5...' }
                                ].map(boss => (
                                    <div key={boss.key}>
                                        <label className="text-xs font-num font-semibold text-neutral mb-1 block">{boss.label}</label>
                                        <div className="flex gap-2">
                                            <input 
                                                type="text" 
                                                className="flex-1 p-3 bg-cream border border-rule text-xs font-num text-charcoal outline-none focus:border-charcoal transition-colors duration-150"
                                                value={config[boss.key] || ''}
                                                onChange={(e) => setConfig({...config, [boss.key]: e.target.value})}
                                                placeholder={boss.placeholder}
                                            />
                                            <button 
                                                onClick={() => handleUpdateConfig(boss.key, config[boss.key])}
                                                className="px-4 bg-charcoal text-cream border border-charcoal text-xs font-num font-semibold hover:bg-charcoal-2 transition-colors duration-150 cursor-pointer"
                                            >
                                                Save
                                            </button>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Card>

                        <Card className="bg-cream border border-rule">
                            <h3 className="font-num font-semibold text-xs text-charcoal flex items-center gap-2">เกี่ยวกับการตั้งค่า</h3>
                            <p className="text-xs text-neutral leading-relaxed mt-2">
                                การตั้งค่า UID บอสจะช่วยให้น้องยูซุแยกแยะและตอบโต้กับผู้บริหารด้วยสไตล์ที่นอบน้อมเป็นพิเศษ โดยค่าเหล่านี้จะถูกจัดเก็บไว้ในฐานข้อมูลและประมวลผลทันทีเมื่อมีการแชท
                            </p>
                        </Card>
                    </div>

                    <Card className="space-y-6">
                        <h3 className="font-semibold text-xs text-charcoal flex items-center gap-2">
                                                        บุคลิกยูซุตามตำแหน่ง
                        </h3>
                        <p className="text-xs text-neutral">กำหนดคำสั่งพิเศษ ให้น้องยูซุใช้คุยกับแต่ละตำแหน่งงาน</p>
                        
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                            {[
                                { key: 'role_instruction_Bar&Floor', label: 'Bar & Floor (หน้าร้าน)', color: 'blue' },
                                { key: 'role_instruction_Kitchen', label: 'Kitchen (ในครัว)', color: 'rose' },
                                { key: 'role_instruction_Admin', label: 'Admin (จัดการระบบ)', color: 'slate' }
                            ].map(role => (
                                <div key={role.key} className="space-y-3">
                                    <Badge color={role.color} className="">{role.label}</Badge>
                                    <textarea 
                                        className="w-full p-4 bg-cream border border-rule h-32 text-xs font-num text-charcoal outline-none focus:border-charcoal transition-colors duration-150 resize-none"
                                        placeholder={`ใส่คำสั่งพิเศษสำหรับกลุ่ม ${role.label}...`}
                                        value={config[role.key] || ''}
                                        onChange={(e) => setConfig({...config, [role.key]: e.target.value})}
                                        onBlur={(e) => handleUpdateConfig(role.key, e.target.value)}
                                    />
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card className="space-y-6 border border-plum bg-plum/10">
                        <div className="flex items-center gap-2 text-charcoal">
                                                        <h3 className="font-semibold text-xs">Storage Cleanup & Backup (ล้างข้อมูลรูปภาพเก่าเพื่อประหยัดพื้นที่)</h3>
                        </div>
                        <p className="text-xs text-neutral leading-relaxed">
                            คุณสามารถเคลียร์พื้นที่จัดเก็บข้อมูล โดยการลบไฟล์รูปภาพสลิปและรูปภาพประกอบการชงกาแฟที่เก่ากว่า 30 วัน 
                            ระบบจะลบเฉพาะไฟล์รูปภาพออกไปอย่างถาวร แต่จะยังคงเก็บข้อมูลสรุปตัวเลขและประวัติแชทเอาไว้ (ไม่ส่งผลกระทบต่อหน้ารายงาน PDF นอกจากการไม่แสดงรูปประกอบที่ถูกลบไปแล้ว)
                        </p>

                        {/* Status feedback banner */}
                        {cleanupStatus.state !== 'idle' && (
                            <div className={`p-4 border font-num text-xs flex items-start gap-2.5 transition-colors duration-150 ${
 cleanupStatus.type === 'success' 
 ? 'bg-charcoal/10 border-charcoal text-charcoal'
 : cleanupStatus.type === 'error'
 ? 'bg-error/10 border-error text-error'
 : 'bg-cream border-charcoal text-charcoal'
 }`}>
                                
                                <div className="flex-1">
                                    <p className="font-semibold leading-relaxed">{cleanupStatus.message}</p>
                                </div>
                                {cleanupStatus.state !== 'running' && (
                                    <button 
                                        onClick={() => setCleanupStatus({ state: 'idle', message: '', type: 'info' })}
                                        className="text-xs text-neutral hover:text-charcoal ml-2 cursor-pointer min-h-11 px-3 text-sm font-semibold underline-offset-4 hover:underline"
                                        title="ปิดข้อความ"
                                    >ปิด</button>
                                )}
                            </div>
                        )}
                        
                        {!showCleanupConfirm ? (
                            <button
                                onClick={() => {
                                    setShowCleanupConfirm(true);
                                    if (cleanupStatus.state !== 'running') {
                                        setCleanupStatus({ state: 'idle', message: '', type: 'info' });
                                    }
                                }}
                                disabled={cleanupLoading}
                                className="min-h-12 px-6 bg-cream border border-error text-error font-semibold text-sm hover:bg-error hover:text-cream transition-colors duration-150 flex items-center gap-2 w-fit disabled:opacity-50 cursor-pointer"
                            >
                                {cleanupLoading ? "กำลังลบ…" : "เริ่มต้นล้างข้อมูลภาพประกอบ"}
                            </button>
                        ) : (
                            <div className="bg-cream border border-rule p-5 space-y-4">
                                <div className="space-y-1">
                                    <p className="text-xs font-semibold text-error">
                                        แจ้งเตือน: ระบบจะค้นหาและลบรูปภาพสลิป / ภาพกาแฟในระบบที่อายุเกิน 30 วันทั้งหมดออกอย่างถาวร
                                    </p>
                                    <p className="text-xs text-neutral">
                                        แนะนำให้ดาวน์โหลดข้อมูลสำรอง ไว้ก่อนลบ เพื่อเก็บข้อมูลสลิปและรูปกาแฟเป็นไฟล์ไว้ในเครื่องของคุณ
                                    </p>
                                </div>
                                <div className="flex flex-wrap gap-2 pt-2">
                                    <button 
                                        onClick={() => handleExecuteCleanup(30, true)} 
                                        disabled={cleanupLoading}
                                        className="bg-charcoal text-cream border border-charcoal hover:bg-charcoal/90 text-xs font-num font-semibold py-2.5 px-4 transition-colors duration-150 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                    >
                                        {cleanupLoading ? "กำลังลบ…" : "ดาวน์โหลดข้อมูลสำรอง + ลบไฟล์ (แนะนำ)"}
                                    </button>
                                    <button 
                                        onClick={() => handleExecuteCleanup(30, false)} 
                                        disabled={cleanupLoading}
                                        className="bg-error text-cream border border-error hover:bg-error/90 text-xs font-num font-semibold py-2.5 px-4 transition-colors duration-150 flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                    >
                                        {cleanupLoading ? "กำลังลบ…" : "ลบไฟล์ทันที (ไม่สำรอง)"}
                                    </button>
                                    <button 
                                        onClick={() => setShowCleanupConfirm(false)} 
                                        disabled={cleanupLoading}
                                        className="bg-cream border border-rule text-charcoal hover:bg-cream text-xs font-semibold py-2.5 px-4 transition-colors duration-150 disabled:opacity-50 cursor-pointer"
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
                    <Card className="p-4 bg-cream border border-rule flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
                        <div className="space-y-1">
                            <h4 className="text-xs font-semibold text-charcoal flex items-center gap-2">
                                ระบบประเมินบทบาทและประสิทธิภาพพนักงาน
                            </h4>
                            <p className="text-xs text-neutral">
                                คลิกแถวรายชื่อพนักงานเพื่อเปิดกล่องบันทึก <b>หน้าที่ความรับผิดชอบ</b>, <b>สิ่งที่ดีแล้ว</b> และ <b>สิ่งที่ต้องปรับปรุง</b> หรือเรียกให้ ยูซุ AI ช่วยสรุปการประเมินได้เมี๊ยว~ 
                            </p>
                        </div>
                    </Card>

                    <Card className="p-0 overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-xs text-left">
                                <thead className="bg-cream border-b border-charcoal text-charcoal font-num font-semibold text-xs">
                                    <tr>
                                        <th className="px-6 py-4">พนักงาน</th>
                                        <th className="px-6 py-4">ตำแหน่ง</th>
                                        <th className="px-6 py-4">รหัส LINE</th>
                                        <th className="px-6 py-4 text-center">สถานะ</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-rule">
                                    {employees.map(emp => {
                                        const isExpanded = expandedEmpId === emp.id;
                                        return (
                                            <React.Fragment key={emp.id}>
                                                <tr 
                                                    className={`hover:bg-paper-2 border-b border-rule transition-colors cursor-pointer ${isExpanded ? 'bg-cream' : 'bg-cream'}`}
                                                    onClick={() => setExpandedEmpId(isExpanded ? null : emp.id)}
                                                >
                                                    <td className="px-6 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <div className="text-xs font-num text-neutral font-semibold w-4 text-center select-none">
                                                                {isExpanded ? '▼' : '▶'}
                                                            </div>
                                                            <div>
                                                                <div className="font-semibold text-charcoal font-num text-xs flex items-center gap-2">
                                                                    {emp.nickname || emp.name}
                                                                    {(emp.duties || emp.strengths || emp.improvements) && (
                                                                        <span className="w-1.5 h-1.5 bg-plum" title="มีบันทึกประเมินแล้ว" />
                                                                    )}
                                                                </div>
                                                                <div className="text-xs font-num text-neutral">{emp.name}</div>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-6 py-4" onClick={(e) => e.stopPropagation()}>
                                                        <input 
                                                            type="text" 
                                                            className="w-full p-2 bg-transparent border border-transparent hover:border-rule focus:border-charcoal outline-none font-num text-xs text-charcoal transition-colors duration-150"
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
                                                            className="w-full p-2 bg-transparent border border-transparent hover:border-rule focus:border-charcoal outline-none font-num text-xs text-neutral transition-colors duration-150"
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
                                                            <div className={`w-2 h-2 ${emp.line_bot_id ? 'bg-charcoal ' : 'bg-rule'}`} />
                                                            <span className="text-xs font-num font-semibold text-neutral">{emp.line_bot_id ? 'เชื่อมแล้ว' : 'ยังไม่เชื่อม'}</span>
                                                        </div>
                                                    </td>
                                                </tr>
                                                {isExpanded && (
                                                    <tr className="bg-paper-2">
                                                        <td colSpan="4" className="px-6 py-6 border-b border-rule">
                                                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                                                                {/* Duties Section */}
                                                                <div className="space-y-2">
                                                                    <label className="text-xs font-semibold text-neutral block">หน้าที่ความรับผิดชอบ</label>
                                                                    <textarea 
                                                                        className="w-full p-3.5 bg-cream border border-rule h-36 text-xs font-num text-charcoal outline-none focus:border-charcoal transition-colors duration-150 resize-none leading-relaxed"
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
                                                                    <label className="text-xs font-semibold text-charcoal block">สิ่งที่ดีแล้ว</label>
                                                                    <textarea 
                                                                        className="w-full p-3.5 bg-cream border border-rule h-36 text-xs font-num text-charcoal outline-none focus:border-charcoal transition-colors duration-150 resize-none leading-relaxed"
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
                                                                        <label className="text-xs font-semibold text-plum block">สิ่งที่ต้องปรับปรุง</label>
                                                                        
                                                                        {/* AI evaluate button */}
                                                                        <button
                                                                            onClick={() => handleAiEvaluateEmployee(emp.id)}
                                                                            disabled={aiLoadingEmpId === emp.id}
                                                                            className="bg-cream hover:bg-cream text-charcoal border border-rule font-num font-semibold text-xs px-2.5 py-1 transition-colors duration-150 flex items-center gap-1  disabled:opacity-50 cursor-pointer"
                                                                        >
                                                                            {aiLoadingEmpId === emp.id ? (
                                                                                <>
                                                                                    
                                                                                    <span>กำลังวิเคราะห์...</span>
                                                                                </>
                                                                            ) : (
                                                                                <>
                                                                                    <span>ยูซุช่วยวิเคราะห์</span>
                                                                                </>
                                                                            )}
                                                                        </button>
                                                                    </div>
                                                                    <textarea 
                                                                        className="w-full p-3.5 bg-cream border border-rule h-36 text-xs font-num text-charcoal outline-none focus:border-charcoal transition-colors duration-150 resize-none leading-relaxed"
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
                    <YuzuSlipMonth />
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between bg-cream p-3 px-4 border border-rule text-xs font-num gap-2">
                        <div className="flex flex-wrap items-center gap-2 text-charcoal">
                                                        <span className="text-neutral">สิทธิ์ตำแหน่งที่ส่งสลิปได้:</span>
                            <span className="font-semibold text-charcoal bg-cream px-2 py-0.5 border border-rule">
                                {config.allowed_slip_positions !== undefined ? config.allowed_slip_positions : 'Bar & Floor, Owner, CEO, Manager'}
                            </span>
                        </div>
                        <button 
                            onClick={() => setActiveTab('config')}
                            className="text-xs font-semibold text-charcoal hover:underline cursor-pointer flex items-center gap-1 shrink-0"
                        >
                            ตั้งค่าสิทธิ์
                        </button>
                    </div>

                </div>
            )}

            {/* TAB: ESPRESSO */}
            {activeTab === 'espresso' && <YuzuEspressoMonth />}

            {/* TAB: HASHTAG REPORTS & INCIDENTS */}
            {activeTab === 'hashtags' && (
                <HashtagIncidentManager />
            )}

            {message && !loading && (
                 <div className="fixed bottom-8 right-8 z-[100] bg-charcoal text-cream px-6 py-3 border border-charcoal flex items-center gap-3 animate-in fade-in">
                    <span className="w-2 h-2 bg-plum" />
                    <span className="text-xs font-num font-semibold">{message}</span>
                 </div>
            )}
        </div>
    );
}


