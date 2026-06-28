"use client";

import React, { useState, useEffect } from 'react';
import { Badge } from '../_components/ui/Badge';
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
    const [selectedLeaveIds, setSelectedLeaveIds] = useState([]);
    const [leaveForm, setLeaveForm] = useState({
        leave_type: 'sick',
        reason: '',
        replacement_employee_id: '',
        startDate: '',
        endDate: ''
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
        setSelectedLeaveIds([]);
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
        if (empRes.data) {
            const getPositionOrder = (position) => {
                const pos = (position || '').toLowerCase().trim();
                if (pos.includes('owner')) return 1;
                if (pos.includes('cook') || pos.includes('kitchen')) return 2;
                if (pos.includes('bar') || pos.includes('floor')) return 3;
                return 4;
            };
            const sorted = [...empRes.data].sort((a, b) => {
                const orderA = getPositionOrder(a.position);
                const orderB = getPositionOrder(b.position);
                if (orderA !== orderB) return orderA - orderB;
                return (a.nickname || a.name || '').localeCompare(b.nickname || b.name || '', 'th');
            });
            setEmployees(sorted);
        }
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

    const handleDeleteLeaveRequest = async (req) => {
        const isConfirmed = confirm(`คุณต้องการลบใบลาของคุณ ${req.employees?.nickname || req.employees?.name || 'พนักงาน'} วันที่ ${req.leave_date} ใช่หรือไม่?`);
        if (!isConfirmed) return;

        setLoading(true);
        try {
            const idsToDelete = [req.id];
            const datesToDelete = [req.leave_date];
            const replacementIds = req.replacement_employee_id ? [req.replacement_employee_id] : [];

            // 1. Delete leave requests
            const { error: delErr } = await supabase
                .from('leave_requests')
                .delete()
                .in('id', idsToDelete);
            if (delErr) throw delErr;

            // 2. Clean up roster overrides
            await supabase
                .from('roster_overrides')
                .delete()
                .eq('employee_id', req.employee_id)
                .in('date', datesToDelete);

            // 3. Clean up roster transactions
            await supabase
                .from('roster_transactions')
                .delete()
                .eq('employee_id', req.employee_id)
                .in('date', datesToDelete);

            // 4. Clean up replacements roster overrides & transactions
            for (const repId of replacementIds) {
                await supabase
                    .from('roster_overrides')
                    .delete()
                    .eq('employee_id', repId)
                    .in('date', datesToDelete);

                await supabase
                    .from('roster_transactions')
                    .delete()
                    .eq('employee_id', repId)
                    .in('date', datesToDelete);
            }

            alert("ลบข้อมูลใบลาและเคลียร์ตาราง Roster เรียบร้อยแล้ว!");
            setSelectedLeaveIds(prev => prev.filter(id => id !== req.id));
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาดในการลบใบลา: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handleDeleteMultipleLeaves = async () => {
        const count = selectedLeaveIds.length;
        if (count === 0) return;
        
        const isConfirmed = confirm(`คุณต้องการลบใบลาที่เลือกทั้งหมด ${count} รายการใช่หรือไม่?`);
        if (!isConfirmed) return;

        setLoading(true);
        try {
            // Find all leave requests matching the selected IDs
            const { data: leaves, error: fetchErr } = await supabase
                .from('leave_requests')
                .select('id, employee_id, leave_date, replacement_employee_id')
                .in('id', selectedLeaveIds);
            
            if (fetchErr) throw fetchErr;
            if (!leaves || leaves.length === 0) return;

            const idsToDelete = leaves.map(l => l.id);

            // 1. Delete leave requests
            const { error: delErr } = await supabase
                .from('leave_requests')
                .delete()
                .in('id', idsToDelete);
            if (delErr) throw delErr;

            // 2. Clean up roster overrides and transactions for each leave
            for (const req of leaves) {
                const datesToDelete = [req.leave_date];
                const replacementIds = req.replacement_employee_id ? [req.replacement_employee_id] : [];

                await supabase
                    .from('roster_overrides')
                    .delete()
                    .eq('employee_id', req.employee_id)
                    .in('date', datesToDelete);

                await supabase
                    .from('roster_transactions')
                    .delete()
                    .eq('employee_id', req.employee_id)
                    .in('date', datesToDelete);

                for (const repId of replacementIds) {
                    await supabase
                        .from('roster_overrides')
                        .delete()
                        .eq('employee_id', repId)
                        .in('date', datesToDelete);

                    await supabase
                        .from('roster_transactions')
                        .delete()
                        .eq('employee_id', repId)
                        .in('date', datesToDelete);
                }
            }

            alert(`ลบใบลาสำเร็จ ${idsToDelete.length} รายการ และเคลียร์ตาราง Roster เรียบร้อยแล้ว!`);
            setSelectedLeaveIds([]);
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาดในการลบใบลา: " + e.message);
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
            startDate: req.leave_date,
            endDate: req.leave_date
        });
    };

    const saveLeaveEdit = async (id) => {
        if (!leaveForm.startDate || !leaveForm.endDate) return alert("กรุณาระบุวันที่เริ่มและสิ้นสุด");
        setLoading(true);
        try {
            // Find original request
            const req = leaveRequests.find(l => l.id === id);
            if (!req) throw new Error("ไม่พบข้อมูลคำขอลา");

            // Generate list of dates in range
            const dateList = [];
            let current = new Date(leaveForm.startDate);
            const last = new Date(leaveForm.endDate);
            while (current <= last) {
                dateList.push(format(current, 'yyyy-MM-dd'));
                current.setDate(current.getDate() + 1);
            }

            if (dateList.length === 0) throw new Error("ช่วงวันที่ระบุไม่ถูกต้อง");

            // 1. Update the original request with the first date of the range
            const { error: updateError } = await supabase
                .from('leave_requests')
                .update({
                    leave_date: dateList[0],
                    leave_type: leaveForm.leave_type,
                    reason: leaveForm.reason,
                    replacement_employee_id: leaveForm.replacement_employee_id ? parseInt(leaveForm.replacement_employee_id) : null,
                })
                .eq('id', id);

            if (updateError) throw updateError;

            // 2. If multiple dates, check and insert them
            if (dateList.length > 1) {
                const extraDates = dateList.slice(1);
                for (const date of extraDates) {
                    const { data: existing } = await supabase
                        .from('leave_requests')
                        .select('id')
                        .eq('employee_id', req.employee_id)
                        .eq('leave_date', date)
                        .maybeSingle();

                    const payload = {
                        employee_id: req.employee_id,
                        leave_date: date,
                        leave_type: leaveForm.leave_type,
                        reason: leaveForm.reason,
                        replacement_employee_id: leaveForm.replacement_employee_id ? parseInt(leaveForm.replacement_employee_id) : null,
                        status: req.status // Preserve original status
                    };

                    if (existing) {
                        await supabase.from('leave_requests').update(payload).eq('id', existing.id);
                    } else {
                        await supabase.from('leave_requests').insert(payload);
                    }
                }
            }

            alert("อัปเดตช่วงวันลาเรียบร้อยแล้ว");
            setEditingLeaveId(null);
            await fetchData();
        } catch (e) {
            alert("เกิดข้อผิดพลาด: " + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="p-6 max-w-7xl mx-auto space-y-6 text-rams-ink font-sans min-h-screen bg-rams-bg selection:bg-rams-ink/10">
            <div className="mb-2">
                <a href="/admin" className="text-xs font-mono font-bold text-rams-ink-muted hover:text-rams-ink flex items-center gap-1.5 w-fit transition-colors uppercase tracking-wider">
                    <ChevronLeft size={14} /> กลับสู่หน้าแดชบอร์ดหลัก
                </a>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-rams-panel p-5 rounded-sm border border-rams-rule shadow-none">
                <div>
                    <h1 className="text-lg font-mono font-bold tracking-wider text-rams-ink uppercase">จัดการตารางงาน (Matrix View)</h1>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-rams-ink-muted mt-1.5">จัดกะการทำงานรองรับแบบยืดหยุ่น ข้ามวัน และกะควบ</p>
                </div>
                
                <div className="flex flex-wrap gap-2">
                    <button onClick={copyLastWeek} className="flex items-center gap-2 px-4 py-2 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink rounded-sm border border-rams-rule-light text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer">
                        <Copy size={14} className="text-rams-ink-muted" /> Copy from Last Week
                    </button>
                    <a 
                        href={`/admin/roster/report?start=${format(weekStart, 'yyyy-MM-dd')}`} 
                        target="_blank"
                        className="flex items-center gap-2 px-4 py-2 bg-rams-bg hover:bg-rams-ink-muted/10 text-rams-ink rounded-sm border border-rams-rule-light text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer"
                    >
                        <Printer size={14} className="text-rams-ink-muted" /> Export PDF
                    </a>
                    <button onClick={publishWeek} className="flex items-center gap-2 px-4 py-2 bg-rams-orange hover:bg-rams-orange-active text-rams-panel rounded-sm border border-rams-rule text-xs font-mono font-bold uppercase tracking-wider shadow-[0_2px_0_0_var(--color-rams-rule)] active:translate-y-[1px] active:shadow-none transition-all cursor-pointer">
                        <CheckCircle size={14} /> Publish & Notify
                    </button>
                </div>
            </div>

            <div className="bg-rams-panel border border-rams-rule rounded-sm overflow-hidden shadow-none">
                <div className="flex items-center justify-between p-4 border-b border-rams-rule-light bg-rams-bg/30">
                    <button onClick={prevWeek} className="w-8 h-8 bg-rams-panel border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center rounded-sm transition-all cursor-pointer"><ChevronLeft size={16} /></button>
                    <h2 className="text-sm font-mono font-bold text-rams-ink uppercase tracking-wider">
                        {format(weekStart, 'dd MMM yyyy')} - {format(weekEnd, 'dd MMM yyyy')}
                    </h2>
                    <button onClick={nextWeek} className="w-8 h-8 bg-rams-panel border border-rams-rule-light hover:border-rams-rule text-rams-ink flex items-center justify-center rounded-sm transition-all cursor-pointer"><ChevronRight size={16} /></button>
                </div>

                <div className="overflow-x-auto">
                    {loading ? (
                        <div className="p-12 text-center font-mono text-xs text-rams-ink-muted uppercase tracking-wider">Loading roster...</div>
                    ) : (
                        <table className="w-full text-xs text-left">
                            <thead className="bg-rams-bg/50 text-rams-ink-muted border-b border-rams-rule-light font-mono text-[9px] uppercase tracking-widest">
                                <tr>
                                    <th className="px-4 py-3 min-w-[150px]">พนักงาน</th>
                                    {dates.map((date, i) => (
                                        <th key={i} className="px-4 py-3 text-center min-w-[140px] border-l border-rams-rule-light">
                                            <div className="text-[9px] font-mono text-rams-ink-muted uppercase tracking-widest">{daysTitle[i]}</div>
                                            <div className="font-mono font-bold text-[11px] text-rams-ink mt-0.5">{format(date, 'dd/MM')}</div>
                                        </th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-rams-rule-light">
                                {employees.map(emp => (
                                    <tr key={emp.id} className="hover:bg-rams-bg/30 text-rams-ink">
                                        <td className="px-4 py-3 font-bold border-b border-rams-rule-light">
                                            {emp.nickname || emp.name}
                                            <div className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-wider mt-0.5">{emp.position}</div>
                                        </td>
                                        {dates.map((date, i) => {
                                            const slots = getCellSlots(emp.id, date);
                                            const dateStr = format(date, 'yyyy-MM-dd');
                                            const empLeaves = leaveRequests.filter(l => l.employee_id === emp.id && l.leave_date === dateStr);
                                            return (
                                                <td key={i} className="px-2 py-2 border-l border-rams-rule-light align-top bg-rams-panel/50">
                                                    <div 
                                                        className="h-full min-h-[65px] w-full rounded-sm border border-dashed border-rams-rule-light hover:border-rams-rule hover:bg-rams-bg cursor-pointer p-1 space-y-1 transition-all flex flex-col"
                                                        onClick={() => openCellModal(emp, date)}
                                                    >
                                                        {slots.length === 0 && empLeaves.length === 0 && <span className="text-rams-ink-muted/50 font-mono text-xs m-auto block text-center">+</span>}
                                                        
                                                        {/* Leave Request Badges */}
                                                        {empLeaves.map((l, idx) => {
                                                            let badgeColor = 'bg-rams-amber/10 border-rams-amber/30 text-rams-amber';
                                                            let label = `⏳ ขอลา${l.leave_type === 'sick' ? 'ป่วย' : l.leave_type === 'business' ? 'กิจ' : 'พักร้อน'}`;
                                                            if (l.status === 'approved') {
                                                                badgeColor = 'bg-rams-green/10 border-rams-green/30 text-rams-green';
                                                                label = `✅ ลา${l.leave_type === 'sick' ? 'ป่วย' : l.leave_type === 'business' ? 'กิจ' : 'พักร้อน'}`;
                                                            } else if (l.status === 'rejected') {
                                                                badgeColor = 'bg-rams-red/10 border-rams-red/30 text-rams-red';
                                                                label = `❌ ปฏิเสธลา${l.leave_type === 'sick' ? 'ป่วย' : l.leave_type === 'business' ? 'กิจ' : 'พักร้อน'}`;
                                                            }
                                                            return (
                                                                <div key={`leave-${idx}`} className={`p-1 rounded-sm text-[9px] font-mono font-bold border ${badgeColor} text-center uppercase tracking-wider`}>
                                                                    {label}
                                                                </div>
                                                            );
                                                        })}
                                                        {slots.map((s, idx) => {
                                                            const shiftObj = shifts.find(sh => sh.id === s.shift_id);
                                                            const timeStr = s.custom_start_time ? `${s.custom_start_time.slice(0,5)}-${s.custom_end_time?.slice(0,5)}` : (shiftObj ? `${shiftObj.start_time.slice(0,5)}-${shiftObj.end_time.slice(0,5)}` : '');

                                                            // Match against saved presets for custom slots
                                                            const matchedPreset = (!s.is_off && !s.shift_id && s.custom_start_time && s.custom_end_time)
                                                                ? customPresets.find(p => (p.start || '').slice(0, 5) === s.custom_start_time.slice(0, 5) && (p.end || '').slice(0, 5) === s.custom_end_time.slice(0, 5))
                                                                : null;
                                                            const approvedLeave = empLeaves.find(l => l.status === 'approved');
                                                            const isLeaveOff = s.is_off && approvedLeave;
                                                            const bgColor = isLeaveOff
                                                                ? 'bg-amber-50 border-amber-300 text-amber-900 font-extrabold border-2 border-dashed shadow-sm'
                                                                : (matchedPreset
                                                                    ? `${getPresetColor(matchedPreset.color).bg} ${getPresetColor(matchedPreset.color).border} ${getPresetColor(matchedPreset.color).text}`
                                                                    : getShiftColorClass(s, shiftObj));
                                                            const cellLabel = s.is_off
                                                                ? (approvedLeave
                                                                    ? `OFF (ลา${approvedLeave.leave_type === 'sick' ? 'ป่วย 😷' : approvedLeave.leave_type === 'business' ? 'กิจ 💼' : 'พักร้อน 🏖️'})`
                                                                    : 'OFF (วันหยุด)')
                                                                : (matchedPreset ? `${matchedPreset.icon || '⏰'} ${matchedPreset.name}` : (shiftObj?.name || 'Custom'));

                                                            return (
                                                                <div key={idx} className={`p-1.5 rounded-sm text-[10px] font-mono border ${bgColor} ${s.status === 'DRAFT' ? 'border-dashed border-2' : ''}`}>
                                                                    <div className="font-bold">{cellLabel}</div>
                                                                    {!s.is_off && <div className="text-[9px] font-bold text-rams-ink/80 mt-0.5">{timeStr}</div>}
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
            <div className="bg-rams-panel rounded-sm border border-rams-rule p-5 space-y-4 shadow-none">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div>
                        <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-rams-ink flex items-center gap-2">
                            <span>📝</span> ข้อมูลการลาหยุดสัปดาห์นี้ ({leaveRequests.length} รายการ)
                        </h2>
                        <p className="text-[10px] text-rams-ink-muted">จัดการ อนุมัติ ปรับรายละเอียดการลา และซิงค์เข้าสู่ตารางเวร roster โดยตรง</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                        {selectedLeaveIds.length > 0 && (
                            <button
                                type="button"
                                onClick={handleDeleteMultipleLeaves}
                                className="flex items-center gap-2 px-3 py-1.5 bg-rams-red/10 hover:bg-rams-red/20 text-rams-red border border-rams-red/30 rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-none cursor-pointer"
                            >
                                🗑️ ลบใบลาที่เลือก ({selectedLeaveIds.length})
                            </button>
                        )}
                        {leaveRequests.length > 0 && (
                            <label className="flex items-center gap-1.5 px-3 py-1.5 bg-rams-bg hover:bg-rams-panel border border-rams-rule-light rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={leaveRequests.length > 0 && selectedLeaveIds.length === leaveRequests.length}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedLeaveIds(leaveRequests.map(r => r.id));
                                        } else {
                                            setSelectedLeaveIds([]);
                                        }
                                    }}
                                    className="w-3 h-3 rounded-sm border-rams-rule bg-rams-bg accent-rams-orange focus:ring-0 cursor-pointer"
                                />
                                เลือกทั้งหมด
                            </label>
                        )}
                        {leaveRequests.filter(l => l.status === 'approved').length > 0 && (
                            <button 
                                type="button"
                                onClick={syncAllApprovedLeaves}
                                className="flex items-center gap-2 px-3 py-1.5 bg-rams-panel hover:bg-rams-bg text-rams-ink border border-rams-rule rounded-sm text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-none cursor-pointer"
                            >
                                🔄 ซิงค์ใบลาที่อนุมัติแล้วทั้งหมดเข้าตาราง
                            </button>
                        )}
                    </div>
                </div>
                
                {leaveRequests.length === 0 ? (
                    <div className="text-center py-8 text-rams-ink-muted text-xs font-mono uppercase tracking-wider bg-rams-bg rounded-sm border border-dashed border-rams-rule-light">
                        ไม่มีคำขอลาหยุดในสัปดาห์นี้
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {leaveRequests.map((req) => {
                            const isEditing = editingLeaveId === req.id;
                            return (
                                <div key={req.id} className="bg-rams-panel border border-rams-rule-light rounded-sm shadow-none overflow-hidden flex flex-col transition-all">
                                    {/* Card Header */}
                                    <div className="px-4 py-3 bg-rams-bg border-b border-rams-rule-light flex justify-between items-center">
                                        <div className="flex items-center gap-2.5">
                                            <input 
                                                type="checkbox"
                                                checked={selectedLeaveIds.includes(req.id)}
                                                onChange={(e) => {
                                                    if (e.target.checked) {
                                                        setSelectedLeaveIds([...selectedLeaveIds, req.id]);
                                                    } else {
                                                        setSelectedLeaveIds(selectedLeaveIds.filter(id => id !== req.id));
                                                    }
                                                }}
                                                className="w-3.5 h-3.5 rounded-sm border-rams-rule bg-rams-bg accent-rams-orange focus:ring-0 cursor-pointer"
                                            />
                                            <div>
                                                <div className="font-bold text-rams-ink">{req.employees?.nickname || req.employees?.name}</div>
                                                <div className="text-[9px] text-rams-ink-muted font-mono font-bold uppercase tracking-widest">{req.employees?.position || 'พนักงาน'}</div>
                                            </div>
                                        </div>
                                        <Badge color={req.status === 'approved' ? 'emerald' : req.status === 'rejected' ? 'rose' : 'amber'}>
                                            {req.status === 'approved' ? 'อนุมัติแล้ว' : req.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รออนุมัติ'}
                                        </Badge>
                                    </div>
                                    
                                    {/* Card Body */}
                                    <div className="p-4 flex-1 space-y-3 text-xs text-rams-ink">
                                        {isEditing ? (
                                            <div className="space-y-3">
                                                <div className="grid grid-cols-2 gap-2">
                                                    <div>
                                                        <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">วันที่เริ่มลา</label>
                                                        <input 
                                                            type="date"
                                                            value={leaveForm.startDate}
                                                            onChange={e => setLeaveForm({ 
                                                                ...leaveForm, 
                                                                startDate: e.target.value,
                                                                endDate: leaveForm.endDate < e.target.value ? e.target.value : leaveForm.endDate 
                                                            })}
                                                            className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule"
                                                        />
                                                    </div>
                                                    <div>
                                                        <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">วันสิ้นสุด</label>
                                                        <input 
                                                            type="date"
                                                            value={leaveForm.endDate}
                                                            onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                                                            className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule"
                                                            min={leaveForm.startDate}
                                                        />
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">ประเภท</label>
                                                    <select
                                                        value={leaveForm.leave_type}
                                                        onChange={e => setLeaveForm({ ...leaveForm, leave_type: e.target.value })}
                                                        className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule cursor-pointer"
                                                    >
                                                        <option value="sick">ลาป่วย 😷</option>
                                                        <option value="business">ลากิจ 💼</option>
                                                        <option value="vacation">พักร้อน 🏖️</option>
                                                    </select>
                                                </div>
                                                <div>
                                                    <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">คนแทน</label>
                                                    <select
                                                        value={leaveForm.replacement_employee_id}
                                                        onChange={e => setLeaveForm({ ...leaveForm, replacement_employee_id: e.target.value })}
                                                        className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule cursor-pointer"
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
                                                    <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">เหตุผล</label>
                                                    <input 
                                                        type="text"
                                                        value={leaveForm.reason}
                                                        onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                                                        className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-sans text-rams-ink bg-rams-bg outline-none focus:border-rams-rule"
                                                        placeholder="ระบุเหตุผล"
                                                    />
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-2">
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">วันที่ลา:</span>
                                                    <span className="font-mono text-xs font-bold text-rams-ink">
                                                        {req.leave_date ? format(parseISO(req.leave_date), 'dd/MM/yyyy') : '-'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">ประเภท:</span>
                                                    <span className="font-bold text-rams-ink text-xs">
                                                        {req.leave_type === 'sick' ? 'ลาป่วย 😷' : req.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'}
                                                    </span>
                                                </div>
                                                <div className="flex justify-between items-center">
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest">ปฏิบัติงานแทนโดย:</span>
                                                    <span className="font-bold text-rams-ink text-xs">
                                                        {req.replacement_employee ? `${req.replacement_employee.name} (${req.replacement_employee.nickname || "-"})` : '-'}
                                                    </span>
                                                </div>
                                                <div className="pt-1 border-t border-rams-rule-light mt-1">
                                                    <span className="text-[9px] font-mono font-bold text-rams-ink-muted block mb-0.5 uppercase tracking-widest">เหตุผลการลา:</span>
                                                    <span className="text-rams-ink italic block text-xs">&ldquo;{req.reason || '-'}&rdquo;</span>
                                                </div>
                                                {req.status === 'approved' && (() => {
                                                    const isRequesterOff = transactions.some(t => t.employee_id === req.employee_id && t.date === req.leave_date && t.is_off);
                                                    const isReplacementScheduled = req.replacement_employee_id 
                                                        ? transactions.some(t => t.employee_id === req.replacement_employee_id && t.date === req.leave_date && !t.is_off)
                                                        : false;
                                                    return (
                                                        <div className="mt-2 p-2 bg-rams-green/5 rounded-sm border border-rams-green/20 flex flex-col gap-1 text-[10px] text-rams-green font-mono font-bold uppercase tracking-wider">
                                                            <div className="flex items-center gap-1">
                                                                <span>{isRequesterOff ? '✅' : '❌'}</span>
                                                                <span>พนักงานลาหยุด: {isRequesterOff ? 'บันทึกวันหยุด (OFF) แล้ว' : 'ยังไม่ได้บันทึกวันหยุด'}</span>
                                                            </div>
                                                            {req.replacement_employee_id && (
                                                                <div className="flex items-center gap-1">
                                                                    <span>{isReplacementScheduled ? '✅' : '❌'}</span>
                                                                    <span>พนักงานแทน: {isReplacementScheduled ? 'ลงตารางกะแทนแล้ว' : 'ยังไม่ได้ลงตารางกะแทน'}</span>
                                                                </div>
                                                            )}
                                                        </div>
                                                    );
                                                })()}
                                            </div>
                                        )}
                                    </div>
                                    
                                    {/* Card Footer Actions */}
                                    <div className="px-4 py-3 bg-rams-bg border-t border-rams-rule-light flex justify-end gap-2">
                                        {isEditing ? (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={() => setEditingLeaveId(null)}
                                                    className="px-3 py-1.5 bg-rams-bg hover:bg-rams-ink-muted/10 border border-rams-rule-light text-rams-ink font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider transition-all cursor-pointer"
                                                >
                                                    ยกเลิก
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => saveLeaveEdit(req.id)}
                                                    className="px-3 py-1.5 bg-rams-orange text-rams-panel font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                                                >
                                                    บันทึก
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button 
                                                    type="button"
                                                    onClick={() => startEditLeave(req)}
                                                    className="px-3 py-1.5 bg-rams-bg hover:bg-rams-ink-muted/10 border border-rams-rule-light text-rams-ink font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider transition-all cursor-pointer"
                                                >
                                                    แก้ไขข้อมูล
                                                </button>
                                                <button 
                                                    type="button"
                                                    onClick={() => handleDeleteLeaveRequest(req)}
                                                    className="px-3 py-1.5 bg-rams-red/10 hover:bg-rams-red/20 text-rams-red border border-rams-red/20 font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider transition-all flex items-center gap-1 cursor-pointer"
                                                    title="ลบคำขอลาหยุด"
                                                >
                                                    🗑️ ลบใบลา
                                                </button>
                                                {req.status === 'pending' && (
                                                    <>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleApproveAndSyncLeave(req)}
                                                            className="px-3 py-1.5 bg-rams-green text-rams-panel font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-green/90 active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
                                                        >
                                                            อนุมัติ & ซิงค์
                                                        </button>
                                                        <button 
                                                            type="button"
                                                            onClick={() => handleRejectLeave(req)}
                                                            className="px-3 py-1.5 bg-rams-red text-rams-panel font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-red/90 active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
                                                        >
                                                            ปฏิเสธ
                                                        </button>
                                                    </>
                                                )}
                                                {req.status === 'approved' && (
                                                    <button 
                                                        type="button"
                                                        onClick={() => handleResetLeaveStatus(req)}
                                                        className="px-3 py-1.5 bg-rams-amber text-rams-panel font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-amber/90 active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
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
                <div className="fixed inset-0 bg-rams-ink/40 backdrop-blur-[2px] flex items-center justify-center z-50 p-4">
                    <div className="bg-rams-panel border border-rams-rule rounded-sm w-full max-w-md overflow-hidden shadow-none flex flex-col">
                        <div className="px-6 py-4 border-b border-rams-rule-light flex justify-between items-center bg-rams-bg/30">
                            <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-rams-ink">
                                จัดตาราง: {editingCell.employee.nickname} <br/>
                                <span className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-widest block mt-0.5">{format(editingCell.date, 'dd MMM yyyy')}</span>
                            </h3>
                        </div>
                        
                        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto bg-rams-panel custom-scrollbar">
                            {(() => {
                                const dateStr = format(editingCell.date, 'yyyy-MM-dd');
                                const cellLeaves = leaveRequests.filter(l => l.employee_id === editingCell.employee.id && l.leave_date === dateStr);
                                if (cellLeaves.length === 0) return null;
                                return (
                                    <div className="space-y-3 mb-2">
                                        {cellLeaves.map((l, idx) => (
                                            <div key={idx} className="bg-rams-amber/10 border border-rams-rule-light rounded-sm p-4 space-y-2 text-xs text-rams-ink shadow-none font-sans">
                                                <div className="font-mono font-bold uppercase tracking-wider text-[10px] text-rams-ink flex justify-between items-center">
                                                    <span className="flex items-center gap-1">📌 ข้อมูลการลาหยุดวันนี้</span>
                                                    <Badge color={l.status === 'approved' ? 'emerald' : l.status === 'rejected' ? 'rose' : 'amber'}>
                                                        {l.status === 'approved' ? 'อนุมัติแล้ว' : l.status === 'rejected' ? 'ปฏิเสธแล้ว' : 'รออนุมัติ'}
                                                    </Badge>
                                                </div>
                                                <div className="grid grid-cols-2 gap-2 mt-1 font-mono text-[10px] text-rams-ink-muted uppercase tracking-wider">
                                                    <div><strong>ประเภท:</strong> {l.leave_type === 'sick' ? 'ลาป่วย 😷' : l.leave_type === 'business' ? 'ลากิจ 💼' : 'พักร้อน 🏖️'}</div>
                                                    <div><strong>คนปฏิบัติแทน:</strong> {l.replacement_employee ? (l.replacement_employee.nickname || l.replacement_employee.name) : '-'}</div>
                                                </div>
                                                <div className="mt-1 font-sans text-xs text-rams-ink"><strong>เหตุผล:</strong> {l.reason || '-'}</div>
                                                
                                                <div className="flex gap-2 pt-1 border-t border-rams-rule-light mt-2">
                                                    {l.status === 'pending' && (
                                                        <>
                                                            <button 
                                                                type="button"
                                                                onClick={async () => {
                                                                    await handleApproveAndSyncLeave(l);
                                                                    setEditingCell(null);
                                                                }}
                                                                className="px-3 py-1.5 bg-rams-green text-rams-panel font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-green/90 active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
                                                            >
                                                                อนุมัติและปรับตารางเวร
                                                            </button>
                                                            <button 
                                                                type="button"
                                                                onClick={async () => {
                                                                    await handleRejectLeave(l);
                                                                    setEditingCell(null);
                                                                }}
                                                                className="px-3 py-1.5 bg-rams-red text-rams-panel font-mono font-bold text-[9px] uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_1.5px_0_0_var(--color-rams-rule)] hover:bg-rams-red/90 active:translate-y-[1px] active:shadow-none cursor-pointer transition-all"
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
                                                            className="px-3 py-1.5 bg-rams-bg border border-rams-rule-light text-rams-ink-muted font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider hover:bg-rams-ink-muted/10 cursor-pointer transition-all"
                                                        >
                                                            ยกเลิกการอนุมัติ (กลับเป็นรออนุมัติ)
                                                        </button>
                                                    )}
                                                    <button 
                                                        type="button"
                                                        onClick={async () => {
                                                            await handleDeleteLeaveRequest(l);
                                                            setEditingCell(null);
                                                        }}
                                                        className="px-3 py-1.5 bg-rams-red/10 hover:bg-rams-red/20 text-rams-red border border-rams-red/20 font-mono font-bold rounded-sm text-[9px] uppercase tracking-wider cursor-pointer transition-all"
                                                    >
                                                        🗑️ ลบใบลา
                                                    </button>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                );
                            })()}
                            {editingCell.slots.map((slot, index) => (
                                <div key={index} className="bg-rams-panel p-4 rounded-sm border border-rams-rule-light shadow-none space-y-3 relative">
                                    <div className="flex justify-between items-center mb-2">
                                        <select 
                                            value={slot.slot_type}
                                            onChange={e => handleSlotChange(index, 'slot_type', e.target.value)}
                                            className="text-[10px] font-mono font-bold uppercase bg-rams-bg text-rams-ink px-2 py-1 rounded-sm border border-rams-rule-light outline-none cursor-pointer"
                                        >
                                            <option value="MAIN">Main Shift</option>
                                            <option value="SPLIT">Split Shift</option>
                                            <option value="OVERTIME">Overtime</option>
                                        </select>
                                        <button onClick={() => removeSlot(index)} className="text-rams-red hover:text-rams-red/80 transition-colors cursor-pointer">
                                            <Trash2 size={16} />
                                        </button>
                                    </div>
                                    
                                    <label className="flex items-center gap-2 text-xs font-mono font-bold uppercase tracking-wider text-rams-red bg-rams-red/5 p-2 rounded-sm border border-rams-red/20 cursor-pointer select-none">
                                        <input 
                                            type="checkbox" 
                                            checked={slot.is_off}
                                            onChange={e => handleSlotChange(index, 'is_off', e.target.checked)}
                                            className="w-3.5 h-3.5 rounded-sm border-rams-red/30 bg-rams-bg accent-rams-red focus:ring-0 cursor-pointer"
                                        />
                                        วันหยุด (OFF)
                                    </label>
 
                                    {!slot.is_off && (
                                        <>
                                            <div>
                                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">เลือกกะสำเร็จรูป</label>
                                                <select 
                                                    value={slot.shift_id || ''}
                                                    onChange={e => handleSlotChange(index, 'shift_id', e.target.value)}
                                                    className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none focus:border-rams-rule cursor-pointer"
                                                >
                                                    <option value="">-- กะกำหนดเอง (Custom) --</option>
                                                    {shifts.map(sh => (
                                                        <option key={sh.id} value={sh.id}>{sh.name} ({sh.start_time.slice(0,5)} - {sh.end_time.slice(0,5)})</option>
                                                    ))}
                                                </select>
                                            </div>
 
                                            {!slot.shift_id && (
                                                <div className="space-y-2 border-t border-rams-rule-light pt-2">
                                                    <div className="grid grid-cols-2 gap-3">
                                                        <div>
                                                            <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">เวลาเริ่ม</label>
                                                            <input 
                                                                type="time" 
                                                                value={slot.custom_start_time || ''}
                                                                onChange={e => handleSlotChange(index, 'custom_start_time', e.target.value)}
                                                                className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none"
                                                            />
                                                        </div>
                                                        <div>
                                                            <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1">เวลาเลิก</label>
                                                            <input 
                                                                type="time" 
                                                                value={slot.custom_end_time || ''}
                                                                onChange={e => handleSlotChange(index, 'custom_end_time', e.target.value)}
                                                                className="w-full border border-rams-rule-light rounded-sm p-2 text-xs font-mono text-rams-ink bg-rams-bg outline-none"
                                                            />
                                                        </div>
                                                    </div>
 
                                                    {slot.custom_start_time && slot.custom_end_time && (
                                                        <button 
                                                            type="button"
                                                            onClick={() => openPresetModal(slot.custom_start_time, slot.custom_end_time)}
                                                            className="text-[10px] font-mono font-bold text-rams-orange hover:text-rams-orange-active uppercase tracking-wider flex items-center gap-1 mt-1 transition-colors cursor-pointer"
                                                        >
                                                            💾 บันทึกเป็น Preset ({slot.custom_start_time} - {slot.custom_end_time})
                                                        </button>
                                                    )}
 
                                                    {customPresets.length > 0 && (
                                                        <div className="mt-3">
                                                            <label className="block text-[9px] font-mono font-bold text-rams-ink uppercase tracking-widest mb-1.5">⚡ Preset ที่บันทึกไว้:</label>
                                                            <div className="flex flex-wrap gap-2">
                                                                {customPresets.map((preset, pIdx) => {
                                                                    const pc = getPresetColor(preset.color);
                                                                    return (
                                                                        <div 
                                                                            key={pIdx}
                                                                            className={`flex items-center gap-1.5 px-2.5 py-1 ${pc.bg} hover:bg-opacity-90 ${pc.text} rounded-sm text-[10px] font-mono font-bold cursor-pointer border ${pc.border} transition-all uppercase tracking-wider`}
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
                                                                                className="opacity-50 hover:opacity-100 hover:text-rams-red ml-1 font-bold text-xs leading-none cursor-pointer"
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
 
                            <button onClick={addSlot} className="w-full py-2 border border-dashed border-rams-rule-light rounded-sm text-rams-ink-muted font-mono font-bold text-xs uppercase tracking-wider hover:bg-rams-bg transition-colors flex justify-center items-center gap-2 cursor-pointer">
                                <Plus size={16} /> เพิ่มกะในวันนี้ (Split Shift)
                            </button>
                        </div>
 
                        <div className="px-6 py-4 border-t border-rams-rule-light flex justify-end gap-3 bg-rams-bg/30 shrink-0">
                            <button 
                                onClick={() => setEditingCell(null)}
                                className="px-4 py-2 text-rams-ink hover:bg-rams-ink-muted/10 border border-rams-rule-light rounded-sm font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button 
                                onClick={saveCell}
                                disabled={saving}
                                className="px-4 py-2 bg-rams-orange text-rams-panel font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[1px] active:shadow-none transition-all flex items-center gap-2 cursor-pointer"
                            >
                                {saving ? 'กำลังบันทึก...' : <><Save size={16} /> บันทึก</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Preset Creation Modal */}
            {presetModal && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-rams-ink/40 backdrop-blur-[2px] p-4">
                    <div className="bg-rams-panel border border-rams-rule rounded-sm w-full max-w-sm overflow-hidden shadow-none">
                        <div className="px-6 py-4 border-b border-rams-rule-light bg-rams-bg/30">
                            <h3 className="font-mono font-bold text-sm uppercase tracking-wider text-rams-ink">✨ สร้าง Preset ใหม่</h3>
                            <p className="text-[10px] font-mono text-rams-ink-muted uppercase tracking-widest block mt-0.5">เวลา: {presetModal.start} - {presetModal.end}</p>
                        </div>
                        <div className="px-6 py-5 space-y-5">
                            {/* Name */}
                            <div>
                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">ชื่อ Preset</label>
                                <input
                                    type="text"
                                    value={presetModal.name}
                                    onChange={e => setPresetModal(p => ({ ...p, name: e.target.value }))}
                                    placeholder={`เช่น กะพิเศษ, เปิดร้าน...`}
                                    className="w-full border border-rams-rule-light rounded-sm px-3 py-2 text-xs font-sans text-rams-ink bg-rams-bg outline-none focus:border-rams-rule"
                                />
                            </div>
                            {/* Icon */}
                            <div>
                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">เลือก Icon</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_ICONS.map(icon => (
                                        <button
                                            key={icon}
                                            type="button"
                                            onClick={() => setPresetModal(p => ({ ...p, icon }))}
                                            className={`w-9 h-9 rounded-sm text-sm flex items-center justify-center border transition-all cursor-pointer ${
                                                presetModal.icon === icon
                                                    ? 'border-rams-rule bg-rams-ink text-rams-panel'
                                                    : 'border-rams-rule-light bg-rams-bg hover:border-rams-rule text-rams-ink'
                                            }`}
                                        >
                                            {icon}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Color */}
                            <div>
                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">เลือกสี</label>
                                <div className="flex flex-wrap gap-2">
                                    {PRESET_COLORS.map(c => (
                                        <button
                                            key={c.id}
                                            type="button"
                                            onClick={() => setPresetModal(p => ({ ...p, color: c.id }))}
                                            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-sm text-[10px] font-mono font-bold border transition-all cursor-pointer ${c.bg} ${c.text} ${
                                                presetModal.color === c.id
                                                    ? `${c.border} border-rams-rule ring-1 ring-rams-rule`
                                                    : 'border-rams-rule-light hover:border-rams-rule'
                                            }`}
                                        >
                                            <span className={`w-2.5 h-2.5 rounded-sm ${c.dot}`}></span>
                                            {c.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            {/* Preview */}
                            <div>
                                <label className="block text-[9px] font-mono font-bold text-rams-ink-muted uppercase tracking-widest mb-1.5">ตัวอย่าง</label>
                                {(() => {
                                    const pc = getPresetColor(presetModal.color);
                                    return (
                                        <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 ${pc.bg} ${pc.text} rounded-sm text-xs font-mono font-bold border ${pc.border} uppercase tracking-wider`}>
                                            <span>{presetModal.icon || '⏰'}</span>
                                            <span>{presetModal.name || `${presetModal.start}-${presetModal.end}`}</span>
                                            <span className="opacity-50 text-[10px] font-semibold">({presetModal.start}-{presetModal.end})</span>
                                        </div>
                                    );
                                })()}
                            </div>
                        </div>
                        <div className="px-6 py-4 border-t border-rams-rule-light flex justify-end gap-3 bg-rams-bg/30">
                            <button
                                onClick={() => setPresetModal(null)}
                                className="px-4 py-2 text-rams-ink hover:bg-rams-ink-muted/10 border border-rams-rule-light rounded-sm font-mono font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                            >
                                ยกเลิก
                            </button>
                            <button
                                onClick={confirmSavePreset}
                                className="px-5 py-2 bg-rams-orange text-rams-panel font-mono font-bold text-xs uppercase tracking-wider rounded-sm border border-rams-rule shadow-[0_2px_0_0_var(--color-rams-rule)] hover:bg-rams-orange-active active:translate-y-[1px] active:shadow-none transition-all cursor-pointer"
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
