"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { startOfWeek, endOfWeek, addDays, format, subWeeks, addWeeks, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, CheckCircle, Save, Plus, Trash2, Printer } from 'lucide-react';

export default function AdminRosterPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [leaveRequests, setLeaveRequests] = useState([]);
    const [editingLeaveId, setEditingLeaveId] = useState(null);
    const [leaveForm, setLeaveForm] = useState({
        leave_type: 'sick',
        reason: '',
        replacement_employee_id: '',
        leave_date: ''
    });
    
    // Modal State
    const [editingCell, setEditingCell] = useState(null); // { employee, date, slots: [] }
    const [saving, setSaving] = useState(false);
    const [customPresets, setCustomPresets] = useState([]);
    const [presetModal, setPresetModal] = useState(null); // { start, end } or null

    const PRESET_COLORS = [
        { id: 'sky', label: 'ฟ้า', bg: 'bg-sky-50', text: 'text-sky-800', border: 'border-sky-200', dot: 'bg-sky-500' },
        { id: 'amber', label: 'ส้ม', bg: 'bg-amber-50', text: 'text-amber-800', border: 'border-amber-200', dot: 'bg-amber-500' },
        { id: 'indigo', label: 'ม่วง', bg: 'bg-indigo-50', text: 'text-indigo-800', border: 'border-indigo-200', dot: 'bg-indigo-500' },
        { id: 'rose', label: 'ชมพู', bg: 'bg-rose-50', text: 'text-rose-800', border: 'border-rose-200', dot: 'bg-rose-500' },
        { id: 'emerald', label: 'เขียว', bg: 'bg-emerald-50', text: 'text-emerald-800', border: 'border-emerald-200', dot: 'bg-emerald-500' },
        { id: 'violet', label: 'ม่วงอ่อน', bg: 'bg-violet-50', text: 'text-violet-800', border: 'border-violet-200', dot: 'bg-violet-500' },
        { id: 'slate', label: 'เทา', bg: 'bg-slate-100', text: 'text-slate-800', border: 'border-slate-300', dot: 'bg-slate-500' },
        { id: 'teal', label: 'น้ำเงินเขียว', bg: 'bg-teal-50', text: 'text-teal-800', border: 'border-teal-200', dot: 'bg-teal-500' },
    ];
    const PRESET_ICONS = ['⏰', '☀️', '🌙', '🔥', '⚡', '💼', '🍳', '🌊', '🎯', '✨', '🛎️', '🍽️'];

    const getPresetColor = (colorId) => PRESET_COLORS.find(c => c.id === colorId) || PRESET_COLORS[0];

    useEffect(() => {
        try {
            const saved = localStorage.getItem('roster_custom_presets');
            if (saved) {
                setCustomPresets(JSON.parse(saved));
            }
        } catch (e) {
            console.error(e);
        }
    }, []);

    const openPresetModal = (start, end) => {
        setPresetModal({ start, end, name: '', color: 'sky', icon: '⏰' });
    };

    const confirmSavePreset = () => {
        if (!presetModal) return;
        const { start, end, name, color, icon } = presetModal;
        if (!start || !end) return alert('กรุณากรอกทั้งเวลาเริ่มและเวลาเลิก');
        const normStart = start.slice(0, 5);
        const normEnd = end.slice(0, 5);
        if (customPresets.some(p => (p.start || '').slice(0, 5) === normStart && (p.end || '').slice(0, 5) === normEnd)) {
            setPresetModal(null);
            return;
        }
        const newPresets = [...customPresets, { start: normStart, end: normEnd, name: name || `${normStart}-${normEnd}`, color: color || 'sky', icon: icon || '⏰' }];
        setCustomPresets(newPresets);
        localStorage.setItem('roster_custom_presets', JSON.stringify(newPresets));
        setPresetModal(null);
    };

    const deleteCustomPreset = (idx) => {
        const newPresets = customPresets.filter((_, i) => i !== idx);
        setCustomPresets(newPresets);
        localStorage.setItem('roster_custom_presets', JSON.stringify(newPresets));
    };

    const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 }); // Monday
    const weekEnd = addDays(weekStart, 6);
    const daysTitle = ["จันทร์", "อังคาร", "พุธ", "พฤหัส", "ศุกร์", "เสาร์", "อาทิตย์"];
    const dates = Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i));

    useEffect(() => {
        fetchData();
    }, [currentDate]);

    async function fetchData() {
        setLoading(true);
        const [empRes, shiftRes, transRes, leaveRes] = await Promise.all([
            supabase.from('employees').select('*').order('id'),
            supabase.from('shifts').select('*').order('start_time'),
            supabase.from('roster_transactions')
                .select('*')
                .gte('date', format(weekStart, 'yyyy-MM-dd'))
                .lte('date', format(weekEnd, 'yyyy-MM-dd')),
            supabase.from('leave_requests')
                .select('*, employees!employee_id(name, nickname, position), replacement_employee:employees!replacement_employee_id(name, nickname, position)')
                .gte('leave_date', format(weekStart, 'yyyy-MM-dd'))
                .lte('leave_date', format(weekEnd, 'yyyy-MM-dd'))
        ]);
        if (empRes.data) setEmployees(empRes.data);
        if (shiftRes.data) setShifts(shiftRes.data);
        if (transRes.data) setTransactions(transRes.data);
        if (leaveRes.data) setLeaveRequests(leaveRes.data);
        setLoading(false);
    }

    const prevWeek = () => setCurrentDate(subWeeks(currentDate, 1));
    const nextWeek = () => setCurrentDate(addWeeks(currentDate, 1));

    const getCellSlots = (empId, date) => {
        const dateStr = format(date, 'yyyy-MM-dd');
        return transactions.filter(t => t.employee_id === empId && t.date === dateStr);
    };

    const openCellModal = (emp, date) => {
        const existingSlots = getCellSlots(emp.id, date);
        setEditingCell({
            employee: emp,
            date: date,
            slots: existingSlots.length > 0 ? existingSlots : [{
                slot_type: 'MAIN',
                is_off: false,
                shift_id: '',
                custom_start_time: '',
                custom_end_time: '',
                status: 'DRAFT',
                isNew: true
            }]
        });
    };

    const handleSlotChange = (index, field, value) => {
        const newSlots = [...editingCell.slots];
        newSlots[index][field] = value;
        setEditingCell({ ...editingCell, slots: newSlots });
    };

    const addSlot = () => {
        setEditingCell({
            ...editingCell,
            slots: [...editingCell.slots, {
                slot_type: 'SPLIT',
                is_off: false,
                shift_id: '',
                custom_start_time: '',
                custom_end_time: '',
                status: 'DRAFT',
                isNew: true
            }]
        });
    };

    const removeSlot = (index) => {
        const newSlots = [...editingCell.slots];
        newSlots.splice(index, 1);
        setEditingCell({ ...editingCell, slots: newSlots });
    };

    const saveCell = async () => {
        setSaving(true);
        const dateStr = format(editingCell.date, 'yyyy-MM-dd');
        const empId = editingCell.employee.id;

        const payload = editingCell.slots.map(s => ({
            employee_id: empId,
            date: dateStr,
            slot_type: s.slot_type,
            shift_id: s.shift_id ? parseInt(s.shift_id) : null,
            custom_start_time: s.custom_start_time || null,
            custom_end_time: s.custom_end_time || null,
            is_off: s.is_off,
            status: s.status || 'DRAFT'
        }));

        try {
            // Because we might have deleted some slots, let's just delete all for this cell first then insert
            await supabase.from('roster_transactions')
                .delete()
                .match({ employee_id: empId, date: dateStr });
            
            if (payload.length > 0) {
                const res = await fetch('/api/roster/bulk', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'UPSERT', transactions: payload })
                });
                if (!res.ok) throw new Error('Save failed');
            }
            
            await fetchData();
            setEditingCell(null);
        } catch (e) {
            alert(e.message);
        } finally {
            setSaving(false);
        }
    };

    const copyLastWeek = async () => {
        if (!confirm('ยืนยันคัดลอกตารางจากสัปดาห์ที่แล้วมายังสัปดาห์นี้? ข้อมูลเก่าในสัปดาห์นี้อาจถูกทับ')) return;
        setLoading(true);
        const lastWeekStart = format(subWeeks(weekStart, 1), 'yyyy-MM-dd');
        const lastWeekEnd = format(subWeeks(weekEnd, 1), 'yyyy-MM-dd');
        
        const { data: lastTrans } = await supabase.from('roster_transactions')
            .select('*')
            .gte('date', lastWeekStart)
            .lte('date', lastWeekEnd);
        
        if (lastTrans && lastTrans.length > 0) {
            const newTrans = lastTrans.map(t => {
                const oldDate = parseISO(t.date);
                const newDate = format(addWeeks(oldDate, 1), 'yyyy-MM-dd');
                return {
                    ...t,
                    date: newDate,
                    status: 'DRAFT', // Always copy as draft
                };
            });

            await fetch('/api/roster/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'UPSERT', transactions: newTrans })
            });
            await fetchData();
        } else {
            alert('ไม่พบข้อมูลสัปดาห์ที่แล้ว');
            setLoading(false);
        }
    };

    const publishWeek = async () => {
        if (!confirm('ยืนยันประกาศตารางงานสัปดาห์นี้? พนักงานจะได้รับการแจ้งเตือนผ่าน LINE')) return;
        setLoading(true);
        try {
            const res = await fetch('/api/roster/bulk', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    action: 'PUBLISH', 
                    startDate: format(weekStart, 'yyyy-MM-dd'),
                    endDate: format(weekEnd, 'yyyy-MM-dd')
                })
            });
            if (!res.ok) throw new Error('Publish failed');
            alert('ประกาศตารางงานเรียบร้อยแล้ว');
            await fetchData();
        } catch (e) {
            alert(e.message);
            setLoading(false);
        }
    };

    const handleApproveAndSyncLeave = async (req) => {
        setLoading(true);
        try {
            // 1. Update status to approved
            await supabase.from('leave_requests')
                .update({ status: 'approved' })
                .eq('id', req.id);

            const dateStr = req.leave_date;

            // 2. Mark leaving employee as OFF
            await supabase.from('roster_transactions')
                .delete()
                .match({ employee_id: req.employee_id, date: dateStr });
            
            await supabase.from('roster_transactions')
                .insert({
                    employee_id: req.employee_id,
                    date: dateStr,
                    is_off: true,
                    slot_type: 'MAIN',
                    status: 'PUBLISHED'
                });

            // 3. If replacement employee exists, assign shift
            if (req.replacement_employee_id) {
                const dayOfWeek = (new Date(dateStr).getDay() + 6) % 7; // Map JS getDay() (0=Sun, 1=Mon) to DB day_of_week (0=Mon, 6=Sun)
                const { data: sched } = await supabase
                    .from('employee_schedules')
                    .select('shift_id')
                    .eq('employee_id', req.employee_id)
                    .eq('day_of_week', dayOfWeek)
                    .eq('is_off', false)
                    .maybeSingle();

                let originalShiftId = sched?.shift_id;
                let originalStart = null;
                let originalEnd = null;

                if (originalShiftId) {
                    const { data: shiftObj } = await supabase
                        .from('shifts')
                        .select('start_time, end_time')
                        .eq('id', originalShiftId)
                        .single();
                    if (shiftObj) {
                        originalStart = shiftObj.start_time;
                        originalEnd = shiftObj.end_time;
                    }
                }

                await supabase.from('roster_transactions')
                    .delete()
                    .match({ employee_id: req.replacement_employee_id, date: dateStr });

                await supabase.from('roster_transactions')
                    .insert({
                        employee_id: req.replacement_employee_id,
                        date: dateStr,
                        shift_id: originalShiftId || null,
                        custom_start_time: originalStart || null,
                        custom_end_time: originalEnd || null,
                        is_off: false,
                        slot_type: 'MAIN',
                        status: 'PUBLISHED'
                    });
            }

            alert("อนุมัติและปรับตาราง Roster เรียบร้อยแล้ว!");
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleRejectLeave = async (req) => {
        if (!confirm("ต้องการปฏิเสธคำขอลาหยุดนี้ใช่หรือไม่?")) return;
        setLoading(true);
        try {
            await supabase.from('leave_requests')
                .update({ status: 'rejected' })
                .eq('id', req.id);
            alert("ปฏิเสธคำขอลาหยุดเรียบร้อยแล้ว");
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleResetLeaveStatus = async (req) => {
        if (!confirm("ต้องการยกเลิกการตัดสินใจ และเปลี่ยนสถานะกลับเป็นรออนุมัติใช่หรือไม่? (การตั้งค่าในตารางเวรจะไม่ถูกลบโดยอัตโนมัติ บอสสามารถปรับแก้เองเพิ่มเติมได้)")) return;
        setLoading(true);
        try {
            await supabase.from('leave_requests')
                .update({ status: 'pending' })
                .eq('id', req.id);
            alert("เปลี่ยนสถานะคำขอลาหยุดกลับเป็นรออนุมัติเรียบร้อยแล้ว");
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const syncAllApprovedLeaves = async () => {
        setLoading(true);
        const approvedLeaves = leaveRequests.filter(l => l.status === 'approved');
        if (approvedLeaves.length === 0) {
            alert("ไม่มีใบลาที่อนุมัติแล้วในสัปดาห์นี้ให้ซิงค์");
            setLoading(false);
            return;
        }

        try {
            let count = 0;
            for (const req of approvedLeaves) {
                const dateStr = req.leave_date;
                
                await supabase.from('roster_transactions')
                    .delete()
                    .match({ employee_id: req.employee_id, date: dateStr });
                
                await supabase.from('roster_transactions')
                    .insert({
                        employee_id: req.employee_id,
                        date: dateStr,
                        is_off: true,
                        slot_type: 'MAIN',
                        status: 'PUBLISHED'
                    });
                
                if (req.replacement_employee_id) {
                    const dayOfWeek = (new Date(dateStr).getDay() + 6) % 7; // Map JS getDay() (0=Sun, 1=Mon) to DB day_of_week (0=Mon, 6=Sun)
                    const { data: sched } = await supabase
                        .from('employee_schedules')
                        .select('shift_id')
                        .eq('employee_id', req.employee_id)
                        .eq('day_of_week', dayOfWeek)
                        .eq('is_off', false)
                        .maybeSingle();

                    let originalShiftId = sched?.shift_id;
                    let originalStart = null;
                    let originalEnd = null;

                    if (originalShiftId) {
                        const { data: shiftObj } = await supabase
                            .from('shifts')
                            .select('start_time, end_time')
                            .eq('id', originalShiftId)
                            .single();
                        if (shiftObj) {
                            originalStart = shiftObj.start_time;
                            originalEnd = shiftObj.end_time;
                        }
                    }

                    await supabase.from('roster_transactions')
                        .delete()
                        .match({ employee_id: req.replacement_employee_id, date: dateStr });

                    await supabase.from('roster_transactions')
                        .insert({
                            employee_id: req.replacement_employee_id,
                            date: dateStr,
                            shift_id: originalShiftId || null,
                            custom_start_time: originalStart || null,
                            custom_end_time: originalEnd || null,
                            is_off: false,
                            slot_type: 'MAIN',
                            status: 'PUBLISHED'
                        });
                }
                count++;
            }
            alert(`ซิงค์ข้อมูลใบลาอนุมัติสำเร็จ ${count} รายการเข้าสู่ตารางเวร!`);
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาดในการซิงค์: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const startEditLeave = (req) => {
        setEditingLeaveId(req.id);
        setLeaveForm({
            leave_type: req.leave_type,
            reason: req.reason || '',
            replacement_employee_id: req.replacement_employee_id || '',
            leave_date: req.leave_date
        });
    };

    const saveLeaveEdit = async (id) => {
        if (!leaveForm.leave_date) return alert("กรุณาระบุวันที่ลา");
        setLoading(true);
        try {
            const { error } = await supabase
                .from('leave_requests')
                .update({
                    leave_type: leaveForm.leave_type,
                    reason: leaveForm.reason,
                    replacement_employee_id: leaveForm.replacement_employee_id ? parseInt(leaveForm.replacement_employee_id) : null,
                    leave_date: leaveForm.leave_date
                })
                .eq('id', id);

            if (error) throw error;
            alert("อัปเดตข้อมูลการลาเรียบร้อยแล้ว");
            setEditingLeaveId(null);
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6">
            <div className="mb-2">
                <a href="/admin" className="text-sm text-gray-500 hover:text-gray-800 flex items-center gap-1 w-fit transition-colors">
                    <ChevronLeft size={16} /> กลับสู่หน้าแดชบอร์ดหลัก
                </a>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-100">
                <div>
                    <h1 className="text-2xl font-bold text-gray-800">จัดการตารางงาน (Matrix View)</h1>
                    <p className="text-gray-500 text-sm">จัดกะการทำงานรองรับแบบยืดหยุ่น ข้ามวัน และกะควบ</p>
                </div>
                
                <div className="flex gap-2">
                    <button onClick={copyLastWeek} className="flex items-center gap-2 px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm font-medium transition-colors">
                        <Copy size={16} /> Copy from Last Week
                    </button>
                    <a 
                        href={`/admin/roster/report?start=${format(weekStart, 'yyyy-MM-dd')}`} 
                        target="_blank"
                        className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-black text-white rounded-lg text-sm font-medium transition-colors shadow-sm"
                    >
                        <Printer size={16} /> Export PDF
                    </a>
                    <button onClick={publishWeek} className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium shadow-sm transition-colors">
                        <CheckCircle size={16} /> Publish & Notify
                    </button>
                </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b border-gray-100">
                    <button onClick={prevWeek} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronLeft /></button>
                    <h2 className="text-lg font-semibold text-gray-700">
                        {format(weekStart, 'dd MMM yyyy')} - {format(weekEnd, 'dd MMM yyyy')}
                    </h2>
                    <button onClick={nextWeek} className="p-2 hover:bg-gray-100 rounded-full transition-colors"><ChevronRight /></button>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-12 text-center text-gray-500">Loading roster...</div>
                    ) : (
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-50 text-gray-600">
                                <tr>
                                    <th className="px-4 py-3 font-semibold border-b border-gray-200 min-w-[150px]">พนักงาน</th>
                                    {dates.map((date, i) => (
                                        <th key={i} className="px-4 py-3 font-semibold border-b border-gray-200 text-center min-w-[140px]">
                                            <div className="text-xs text-black font-semibold">{daysTitle[i]}</div>
                                            <div className="text-black font-bold">{format(date, 'dd/MM')}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {employees.map(emp => (
                                    <tr key={emp.id} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-4 py-3 font-medium text-gray-800">
                                            {emp.nickname || emp.name}
                                            <div className="text-xs text-black font-medium">{emp.position}</div>
                                        </td>
                                        {dates.map((date, i) => {
                                            const slots = getCellSlots(emp.id, date);
                                            const dateStr = format(date, 'yyyy-MM-dd');
                                            const empLeaves = leaveRequests.filter(l => l.employee_id === emp.id && l.leave_date === dateStr);
                                            return (
                                                <td key={i} className="px-2 py-2 border-l border-gray-100 align-top">
                                                    <div 
                                                        className="h-full min-h-[60px] w-full rounded-md border border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer p-1 space-y-1 transition-colors flex flex-col"
                                                        onClick={() => openCellModal(emp, date)}
                                                    >
                                                        {slots.length === 0 && empLeaves.length === 0 && <span className="text-gray-300 text-xs m-auto block text-center">+</span>}
                                                        
                                                        {/* Leave Request Badges */}
                                                        {empLeaves.map((l, idx) => {
                                                            let badgeColor = 'bg-amber-50 border-amber-250 text-amber-800';
                                                            let label = `⏳ ขอลา${l.leave_type === 'sick' ? 'ป่วย' : l.leave_type === 'business' ? 'กิจ' : 'พักร้อน'}`;
                                                            if (l.status === 'approved') {
                                                                badgeColor = 'bg-green-50 border-green-250 text-green-800';
                                                                label = `✅ ลา${l.leave_type === 'sick' ? 'ป่วย' : l.leave_type === 'business' ? 'กิจ' : 'พักร้อน'}`;
                                                            } else if (l.status === 'rejected') {
                                                                badgeColor = 'bg-rose-50 border-rose-250 text-rose-800';
                                                                label = `❌ ปฏิเสธลา${l.leave_type === 'sick' ? 'ป่วย' : l.leave_type === 'business' ? 'กิจ' : 'พักร้อน'}`;
                                                            }
                                                            return (
                                                                <div key={`leave-${idx}`} className={`p-1 rounded text-[10px] font-bold border ${badgeColor} text-center`}>
                                                                    {label}
                                                                </div>
                                                            );
                                                        })}
                                                        {slots.map((s, idx) => {
                                                            const shiftObj = shifts.find(sh => sh.id === s.shift_id);
                                                            const timeStr = s.custom_start_time ? `${s.custom_start_time.slice(0,5)}-${s.custom_end_time?.slice(0,5)}` : (shiftObj ? `${shiftObj.start_time.slice(0,5)}-${shiftObj.end_time.slice(0,5)}` : '');

                                                            // Match against saved presets for custom slots
                                                            const matchedPreset = (!s.shift_id && s.custom_start_time && s.custom_end_time)
                                                                ? customPresets.find(p => (p.start || '').slice(0, 5) === s.custom_start_time.slice(0, 5) && (p.end || '').slice(0, 5) === s.custom_end_time.slice(0, 5))
                                                                : null;
                                                            const bgColor = matchedPreset
                                                                ? `${getPresetColor(matchedPreset.color).bg} ${getPresetColor(matchedPreset.color).border} ${getPresetColor(matchedPreset.color).text}`
                                                                : getShiftColorClass(s, shiftObj);
                                                            const cellLabel = s.is_off ? 'OFF (วันหยุด)' : (matchedPreset ? `${matchedPreset.icon || '⏰'} ${matchedPreset.name}` : (shiftObj?.name || 'Custom'));

                                                            return (
                                                                    <div key={idx} className={`p-1.5 rounded text-xs border ${bgColor} ${s.status === 'DRAFT' ? 'border-dashed border-2' : ''}`}>
                                                                        <div className="font-semibold">{cellLabel}</div>
                                                                        {!s.is_off && <div className="text-[10px] font-bold text-black mt-0.5">{timeStr}</div>}
                                                                        {s.slot_type !== 'MAIN' && <div className="text-[9px] uppercase font-bold tracking-wider opacity-60 mt-0.5">{s.slot_type}</div>}
                                                                    </div>
                                                            )
                                                        })}
                                                    </div>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Section: Leave Requests of the Week */}
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 space-y-4">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
                            <span>📝</span> ข้อมูลการลาหยุดสัปดาห์นี้ ({leaveRequests.length} รายการ)
                        </h2>
                        <p className="text-xs text-gray-500 font-medium">จัดการ อนุมัติ ปรับรายละเอียดการลา และซิงค์เข้าสู่ตารางเวร roster โดยตรง</p>
                    </div>
                    {leaveRequests.filter(l => l.status === 'approved').length > 0 && (
                        <button 
                            type="button"
                            onClick={syncAllApprovedLeaves}
                            className="flex items-center gap-2 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 hover:text-blue-800 border border-blue-200 rounded-lg text-xs font-bold transition-all shadow-sm"
                        >
                            🔄 ซิงค์ใบลาที่อนุมัติแล้วทั้งหมดเข้าตาราง
                        </button>
                    )}
                </div>
                
                {leaveRequests.length === 0 ? (
                    <div className="text-center py-8 text-gray-400 text-sm font-medium bg-gray-50/50 rounded-xl border border-dashed border-gray-200">
                        ไม่มีคำขอลาหยุดในสัปดาห์นี้
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {leaveRequests.map((req) => {
                            const isEditing = editingLeaveId === req.id;
                            return (
                                <div key={req.id} className="bg-white border border-gray-200 rounded-xl shadow-sm overflow-hidden flex flex-col transition-all hover:shadow-md">
                                    {/* Card Header */}
                                    <div className="px-4 py-3 bg-gray-50 border-b border-gray-200 flex justify-between items-center">
                                        <div>
                                            <div className="font-bold text-gray-800">{req.employees?.nickname || req.employees?.name}</div>
                                            <div className="text-[10px] text-gray-500 font-bold">{req.employees?.position || 'พนักงาน'}</div>
                                        </div>
                                        <span className={`px-2.5 py-1 rounded-full text-[10px] font-black tracking-wide uppercase border ${
                                            req.status === 'approved' 
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-250' 
                                                : req.status === 'rejected' 
                                                    ? 'bg-rose-50 text-rose-700 border-rose-250' 
                                                    : 'bg-amber-50 text-amber-700 border-amber-250'
                                        }`}>
                                            {req.status === 'approved' ? 'อนุมัติแล้ว' : req.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รออนุมัติ'}
                                        </span>
                                    </div>
                                    
                                    {/* Card Body */}
                                    <div className="p-4 flex-1 space-y-3 text-xs text-gray-700">
                                        {isEditing ? (
                                            <div className="space-y-3">
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">วันที่ลา</label>
                                                    <input 
                                                        type="date"
                                                        value={leaveForm.leave_date}
                                                        onChange={e => setLeaveForm({ ...leaveForm, leave_date: e.target.value })}
                                                        className="w-full border border-gray-300 rounded-lg p-2 text-xs text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">ประเภท</label>
                                                    <select
                                                        value={leaveForm.leave_type}
                                                        onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                                                        className="w-full border border-gray-300 rounded-lg p-2 text-xs text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        <option value="sick">ลาป่วย 😷</option>
                                                        <option value="business">ลากิจ 💼</option>
                                                        <option value="vacation">พักร้อน 🏖️</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">คนแทน</label>
                                                    <select
                                                        value={leaveForm.replacement_employee_id}
                                                        onChange={e => setLeaveForm({ ...leaveForm, replacement_employee_id: e.target.value })}
                                                        className="w-full border border-gray-300 rounded-lg p-2 text-xs text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        <option value="">-- เลือกผู้ปฏิบัติหน้าที่แทน --</option>
                                                        {employees.filter(e => e.id !== req.employee_id).map(emp => (
                                                            <option key={emp.id} value={emp.id}>
                                                                {emp.name} {emp.nickname ? `(${emp.nickname})` : ""} - {emp.position || "ทั่วไป"}
                                                            </option>
                                                        ))}
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[10px] font-bold text-gray-500 mb-1">เหตุผล</label>
                                                    <input 
                                                        type="text"
                                                        value={leaveForm.reason}
                                                        onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                                                        className="w-full border border-gray-300 rounded-lg p-2 text-xs text-gray-900 bg-white outline-none focus:ring-2 focus:ring-blue-500"
                                                        placeholder="ระบุเหตุผล"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">วันที่ลา:</span>
                                                    <span className="font-bold text-gray-900">
                                                        {req.leave_date ? format(parseISO(req.leave_date), 'dd/MM/yyyy') : '-'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">ประเภท:</span>
                                                    <span className="font-semibold text-gray-900">
                                                        {req.leave_type === 'sick' ? 'ลาป่วย 😷' : req.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between">
                                                    <span className="text-gray-500">ปฏิบัติงานแทนโดย:</span>
                                                    <span className="font-medium text-gray-800">
                                                        {req.replacement_employee ? `${req.replacement_employee.name} (${req.replacement_employee.nickname || "-"})` : '-'}
                                                    </span>
                                                </div>
                                                <div className="pt-1 border-t border-gray-100 mt-1">
                                                    <span className="text-gray-500 block mb-0.5">เหตุผลการลา:</span>
                                                    <span className="text-gray-700 italic block font-medium">&ldquo;{req.reason || '-'}&rdquo;</span>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Card Footer Actions */}
                                    <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex justify-end gap-2">
                                        {isEditing ? (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={() => setEditingLeaveId(null)}
                                                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-[10px] transition-colors"
                                                >
                                                    ยกเลิก
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => saveLeaveEdit(req.id)}
                                                    className="px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg text-[10px] transition-colors"
                                                >
                                                    บันทึก
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={() => startEditLeave(req)}
                                                    className="px-3 py-1.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold rounded-lg text-[10px] transition-colors"
                                                >
                                                    แก้ไขข้อมูล
                                                </button>
                                                {req.status === 'pending' && (
                                                    <>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleApproveAndSyncLeave(req)}
                                                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-lg text-[10px] transition-colors shadow-sm"
                                                        >
                                                            อนุมัติ & ซิงค์ตาราง
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleRejectLeave(req)}
                                                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-lg text-[10px] transition-colors shadow-sm"
                                                        >
                                                            ปฏิเสธคำขอ
                                                        </button>
                                                    </>
                                                )}
                                                {req.status === 'approved' && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleResetLeaveStatus(req)}
                                                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-[10px] transition-colors shadow-sm"
                                                    >
                                                        ยกเลิกการอนุมัติ
                                                    </button>
                                                )}
                                            </>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>

            {/* Edit Cell Modal */}
            {editingCell && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-xl shadow-xl w-full max-w-md overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 flex justify-between items-center">
                            <h3 className="font-bold text-lg text-gray-800">
                                จัดตาราง: {editingCell.employee.nickname} <br/>
                                <span className="text-sm font-normal text-gray-500">{format(editingCell.date, 'dd MMM yyyy')}</span>
                            </h3>
                        </div>
                        
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto bg-gray-50">
                            {(() => {
                                const dateStr = format(editingCell.date, 'yyyy-MM-dd');
                                const cellLeaves = leaveRequests.filter(l => l.employee_id === editingCell.employee.id && l.leave_date === dateStr);
                                if (cellLeaves.length === 0) return null;
                                return (
                                    <div className="space-y-3 mb-2">
                                        {cellLeaves.map((l, idx) => (
                                            <div key={idx} className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-2 text-xs text-amber-900 shadow-sm">
                                                <div className="font-bold flex justify-between items-center text-sm">
                                                    <span className="flex items-center gap-1">📌 ข้อมูลการลาหยุดวันนี้</span>
                                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                                        l.status === 'approved' ? 'bg-green-100 text-green-800' : l.status === 'rejected' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                                                    }`}>
                                                        {l.status === 'approved' ? 'อนุมัติแล้ว' : l.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รออนุมัติ'}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-1">
                                                    <div><strong>ประเภท:</strong> {l.leave_type === 'sick' ? 'ลาป่วย 😷' : l.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'}</div>
                                                    <div><strong>คนปฏิบัติแทน:</strong> {l.replacement_employee ? (l.replacement_employee.nickname || l.replacement_employee.name) : '-'}</div>
                                                </div>
                                                <div className="mt-1 font-medium"><strong>เหตุผล:</strong> {l.reason || '-'}</div>
                                                
                                                <div className="flex gap-2 pt-1 border-t border-amber-200/50 mt-2">
                                                    {l.status === 'pending' && (
                                                        <>
                                                            <button 
                                                                type="button"
                                                                onClick={async () => {
                                                                    await handleApproveAndSyncLeave(l);
                                                                    setEditingCell(null);
                                                                }}
                                                                className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-bold text-[11px] transition-colors shadow-sm"
                                                            >
                                                                อนุมัติและปรับตารางเวร
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={async () => {
                                                                    await handleRejectLeave(l);
                                                                    setEditingCell(null);
                                                                }}
                                                                className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-[11px] transition-colors shadow-sm"
                                                            >
                                                                ปฏิเสธคำขอลา
                                                            </button>
                                                        </>
                                                    )}
                                                    {l.status === 'approved' && (
                                                        <button 
                                                            type="button"
                                                            onClick={async () => {
                                                                await handleResetLeaveStatus(l);
                                                                setEditingCell(null);
                                                            }}
                                                            className="px-3 py-1.5 bg-gray-600 hover:bg-gray-700 text-white rounded-lg font-bold text-[11px] transition-colors shadow-sm"
                                                        >
                                                            ยกเลิกการอนุมัติ (กลับเป็นรออนุมัติ)
                                                        </button>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                            {editingCell.slots.map((slot, index) => (
                                <div key={index} className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm space-y-3 relative">
                                    <div className="flex justify-between items-center mb-2">
                                        <select 
                                            value={slot.slot_type}
                                            onChange={e => handleSlotChange(index, 'slot_type', e.target.value)}
                                            className="text-xs font-bold uppercase bg-gray-100 text-gray-700 px-2 py-1 rounded"
                                        >
                                            <option value="MAIN">Main Shift</option>
                                            <option value="SPLIT">Split Shift</option>
                                            <option value="OVERTIME">Overtime</option>
                                        </select>
                                        <button onClick={() => removeSlot(index)} className="text-red-400 hover:text-red-600">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    
                                    <label className="flex items-center gap-2 text-sm font-medium text-red-600 bg-red-50 p-2 rounded border border-red-100">
                                        <input 
                                            type="checkbox" 
                                            checked={slot.is_off}
                                            onChange={e => handleSlotChange(index, 'is_off', e.target.checked)}
                                        />
                                        วันหยุด (OFF)
                                    </label>

                                    {!slot.is_off && (
                                        <>
                                            <div>
                                                <label className="block text-xs text-black font-semibold mb-1">เลือกกะสำเร็จรูป</label>
                                                <select 
                                                    value={slot.shift_id || ''}
                                                    onChange={e => handleSlotChange(index, 'shift_id', e.target.value)}
                                                    className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                >
                                                    <option value="">-- กะกำหนดเอง (Custom) --</option>
                                                    {shifts.map(sh => (
                                                        <option key={sh.id} value={sh.id}>{sh.name} ({sh.start_time.slice(0,5)} - {sh.end_time.slice(0,5)})</option>
                                                    ))}
                                                </select>
                                            </div>

                                            {!slot.shift_id && (
                                                <div className="space-y-2 border-t border-gray-100 pt-2">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-xs text-black font-semibold mb-1">เวลาเริ่ม</label>
                                                            <input 
                                                                type="time" 
                                                                value={slot.custom_start_time || ''}
                                                                onChange={e => handleSlotChange(index, 'custom_start_time', e.target.value)}
                                                                className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-xs text-black font-semibold mb-1">เวลาเลิก</label>
                                                            <input 
                                                                type="time" 
                                                                value={slot.custom_end_time || ''}
                                                                onChange={e => handleSlotChange(index, 'custom_end_time', e.target.value)}
                                                                className="w-full border border-gray-300 rounded-md p-2 text-sm text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                                            />
                                                        </div>
                                                    </div>

                                                    {slot.custom_start_time && slot.custom_end_time && (
                                                        <button 
                                                            type="button"
                                                            onClick={() => openPresetModal(slot.custom_start_time, slot.custom_end_time)}
                                                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 mt-1 transition-colors"
                                                        >
                                                            💾 บันทึกเป็น Preset ({slot.custom_start_time} - {slot.custom_end_time})
                                                        </button>
                                                    )}

                                                    {customPresets.length > 0 && (
                                                        <div className="mt-3">
                                                            <label className="block text-xs text-black font-bold mb-1.5">⚡ Preset ที่บันทึกไว้:</label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {customPresets.map((preset, pIdx) => {
                                                                    const pc = getPresetColor(preset.color);
                                                                    return (
                                                                        <div 
                                                                            key={pIdx}
                                                                            className={`flex items-center gap-1.5 px-3 py-1.5 ${pc.bg} hover:opacity-80 ${pc.text} rounded-full text-xs font-bold cursor-pointer border ${pc.border} transition-all shadow-sm hover:shadow`}
                                                                            onClick={() => {
                                                                                handleSlotChange(index, 'custom_start_time', preset.start);
                                                                                handleSlotChange(index, 'custom_end_time', preset.end);
                                                                            }}
                                                                        >
                                                                            <span>{preset.icon || '⏰'}</span>
                                                                            <span>{preset.name || `${preset.start}-${preset.end}`}</span>
                                                                            <span className="opacity-50 text-[10px] font-semibold">({preset.start}-{preset.end})</span>
                                                                            <button
                                                                                type="button"
                                                                                onClick={(e) => {
                                                                                    e.stopPropagation();
                                                                                    deleteCustomPreset(pIdx);
                                                                                }}
                                                                                className="opacity-40 hover:opacity-100 hover:text-red-600 ml-0.5 font-bold text-sm leading-none"
                                                                                title="ลบ"
                                                                            >
                                                                                ×
                                                                            </button>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            ))}

                            <button onClick={addSlot} className="w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-gray-500 font-medium hover:bg-gray-100 flex justify-center items-center gap-2">
                                <Plus size={16} /> เพิ่มกะในวันนี้ (Split Shift)
                            </button>
                        </div>

                        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-white">
                            <button 
                                onClick={() => setEditingCell(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg font-medium transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button 
                                onClick={saveCell}
                                disabled={saving}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2"
                            >
                                {saving ? 'กำลังบันทึก...' : <><Save size={16} /> บันทึก</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preset Creation Modal */}
            {presetModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 backdrop-blur-sm p-4">
                    <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
                        <div className="px-6 py-5 border-b border-gray-100">
                            <h3 className="text-lg font-black text-gray-900">✨ สร้าง Preset ใหม่</h3>
                            <p className="text-xs text-gray-500 mt-1 font-medium">เวลา: {presetModal.start} - {presetModal.end}</p>
                        </div>
                        <div className="px-6 py-5 space-y-5">
                            {/* Name */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">ชื่อ Preset</label>
                                <input
                                    type="text"
                                    value={presetModal.name}
                                    onChange={e => setPresetModal(p => ({ ...p, name: e.target.value }))}
                                    placeholder={`เช่น กะพิเศษ, เปิดร้าน...`}
                                    className="w-full border border-gray-300 rounded-xl px-4 py-2.5 text-sm font-medium text-gray-900 bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                                />
                            </div>
                            {/* Icon */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">เลือก Icon</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_ICONS.map(icon => (
                                        <button
                                            key={icon}
                                            type="button"
                                            onClick={() => setPresetModal(p => ({ ...p, icon }))}
                                            className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center border-2 transition-all ${
                                                presetModal.icon === icon
                                                    ? 'border-blue-500 bg-blue-50 scale-110 shadow-md'
                                                    : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                                            }`}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Color */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">เลือกสี</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setPresetModal(p => ({ ...p, color: c.id }))}
                                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border-2 transition-all ${c.bg} ${c.text} ${
                                                presetModal.color === c.id
                                                    ? `${c.border} ring-2 ring-offset-1 ring-blue-400 scale-105`
                                                    : 'border-transparent hover:border-gray-300'
                                            }`}
                                        >
                                            <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`}></span>
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Preview */}
                            <div>
                                <label className="block text-xs font-bold text-gray-700 mb-1.5">ตัวอย่าง</label>
                                {(() => {
                                    const pc = getPresetColor(presetModal.color);
                                    return (
                                        <div className={`inline-flex items-center gap-1.5 px-4 py-2 ${pc.bg} ${pc.text} rounded-full text-sm font-bold border ${pc.border} shadow-sm`}>
                                            <span>{presetModal.icon || '⏰'}</span>
                                            <span>{presetModal.name || `${presetModal.start}-${presetModal.end}`}</span>
                                            <span className="opacity-50 text-[10px] font-semibold">({presetModal.start}-{presetModal.end})</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3 bg-gray-50/50">
                            <button
                                onClick={() => setPresetModal(null)}
                                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-xl font-medium text-sm transition-colors"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmSavePreset}
                                className="px-5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm shadow-sm transition-colors"
                            >
                                💾 บันทึก Preset
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

const getShiftColorClass = (s, shiftObj) => {
    if (s.is_off) return 'bg-red-50 border-red-200 text-red-700';
    if (!s.shift_id || s.custom_start_time || !shiftObj) {
        return 'bg-sky-50 border-sky-200 text-sky-950';
    }

    const name = (shiftObj.name || '').toLowerCase();
    
    if (name.includes('ควบ') || name.toLowerCase().includes('double')) {
        return 'bg-rose-50 border-rose-200 text-rose-950';
    }
    
    if (name.includes('ค่ำ') || name.includes('ดึก') || name.toLowerCase().includes('night') || name.toLowerCase().includes('evening')) {
        return 'bg-indigo-50 border-indigo-200 text-indigo-950';
    }
    
    if (name.includes('เช้า') || name.toLowerCase().includes('morning')) {
        return 'bg-amber-50 border-amber-200 text-amber-950';
    }
    
    return 'bg-yellow-50 border-yellow-200 text-yellow-950';
};
