"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '../../../lib/supabaseClient';
import { startOfWeek, endOfWeek, addDays, format, subWeeks, addWeeks, parseISO } from 'date-fns';
import { ChevronLeft, ChevronRight, Copy, CheckCircle, Save, Plus, Trash2 } from 'lucide-react';

export default function AdminRosterPage() {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [employees, setEmployees] = useState([]);
    const [shifts, setShifts] = useState([]);
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    
    // Modal State
    const [editingCell, setEditingCell] = useState(null); // { employee, date, slots: [] }
    const [saving, setSaving] = useState(false);
    const [customPresets, setCustomPresets] = useState([]);

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

    const saveCustomPreset = (start, end) => {
        if (!start || !end) return alert('กรุณากรอกทั้งเวลาเริ่มและเวลาเลิก');
        if (customPresets.some(p => p.start === start && p.end === end)) {
            return;
        }
        const newPresets = [...customPresets, { start, end }];
        setCustomPresets(newPresets);
        localStorage.setItem('roster_custom_presets', JSON.stringify(newPresets));
    };

    const deleteCustomPreset = (start, end) => {
        const newPresets = customPresets.filter(p => !(p.start === start && p.end === end));
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
        const [empRes, shiftRes, transRes] = await Promise.all([
            supabase.from('employees').select('*').order('id'),
            supabase.from('shifts').select('*').order('start_time'),
            supabase.from('roster_transactions')
                .select('*')
                .gte('date', format(weekStart, 'yyyy-MM-dd'))
                .lte('date', format(weekEnd, 'yyyy-MM-dd'))
        ]);
        if (empRes.data) setEmployees(empRes.data);
        if (shiftRes.data) setShifts(shiftRes.data);
        if (transRes.data) setTransactions(transRes.data);
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
                                            return (
                                                <td key={i} className="px-2 py-2 border-l border-gray-100 align-top">
                                                    <div 
                                                        className="h-full min-h-[60px] w-full rounded-md border border-dashed border-gray-200 hover:border-blue-400 hover:bg-blue-50 cursor-pointer p-1 space-y-1 transition-colors flex flex-col"
                                                        onClick={() => openCellModal(emp, date)}
                                                    >
                                                        {slots.length === 0 && <span className="text-gray-300 text-xs m-auto block text-center">+</span>}
                                                        {slots.map((s, idx) => {
                                                            const shiftObj = shifts.find(sh => sh.id === s.shift_id);
                                                            const bgColor = getShiftColorClass(s, shiftObj);
                                                            const timeStr = s.custom_start_time ? `${s.custom_start_time.slice(0,5)}-${s.custom_end_time?.slice(0,5)}` : (shiftObj ? `${shiftObj.start_time.slice(0,5)}-${shiftObj.end_time.slice(0,5)}` : '');

                                                            return (
                                                                    <div key={idx} className={`p-1.5 rounded text-xs border ${bgColor} ${s.status === 'DRAFT' ? 'border-dashed border-2' : ''}`}>
                                                                        <div className="font-semibold">{s.is_off ? 'OFF (วันหยุด)' : (shiftObj?.name || 'Custom')}</div>
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
                                                            onClick={() => saveCustomPreset(slot.custom_start_time, slot.custom_end_time)}
                                                            className="text-xs text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1 mt-1 transition-colors"
                                                        >
                                                            💾 บันทึกเวลานี้ไว้ใช้ซ้ำ ({slot.custom_start_time} - {slot.custom_end_time})
                                                        </button>
                                                    )}

                                                    {customPresets.length > 0 && (
                                                        <div className="mt-2">
                                                            <label className="block text-xs text-black font-semibold mb-1">เวลากำหนดเองที่บันทึกไว้:</label>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {customPresets.map((preset, pIdx) => (
                                                                    <div 
                                                                        key={pIdx}
                                                                        className="flex items-center gap-1 px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-800 rounded text-xs font-semibold cursor-pointer border border-blue-200 transition-colors"
                                                                        onClick={() => {
                                                                            handleSlotChange(index, 'custom_start_time', preset.start);
                                                                            handleSlotChange(index, 'custom_end_time', preset.end);
                                                                        }}
                                                                    >
                                                                        <span>{preset.start} - {preset.end}</span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={(e) => {
                                                                                e.stopPropagation();
                                                                                deleteCustomPreset(preset.start, preset.end);
                                                                            }}
                                                                            className="text-blue-400 hover:text-red-600 ml-1 font-bold text-sm"
                                                                            title="ลบ"
                                                                        >
                                                                            ×
                                                                        </button>
                                                                    </div>
                                                                ))}
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
