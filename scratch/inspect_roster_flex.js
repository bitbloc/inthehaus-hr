const { createClient } = require('@supabase/supabase-js');
const dotenv = require('dotenv');
const path = require('path');
const { format, addHours, startOfWeek, addDays, parseISO } = require('date-fns');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '../.env.local') });

const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// Copy color mapping from rosterHandler
function getShiftColorHex(shiftName, isOff, isCustomOrExtra) {
  if (isOff) return '#dc2626'; // Red
  if (isCustomOrExtra) return '#0284c7'; // Sky/Teal
  
  const name = (shiftName || '').toLowerCase();
  
  if (name.includes('ควบ') || name.includes('double')) {
    return '#e11d48'; // Rose
  }
  if (name.includes('ค่ำ') || name.includes('ดึก') || name.includes('night') || name.includes('evening')) {
    return '#4f46e5'; // Indigo
  }
  if (name.includes('เช้า') || name.includes('morning')) {
    return '#d97706'; // Amber
  }
  return '#ca8a04'; // Yellow
}

function createTimeRange(dateStr, startTimeStr, endTimeStr) {
    if (!startTimeStr) startTimeStr = '00:00:00';
    if (!endTimeStr) endTimeStr = '23:59:59';
    const start = new Date(`${dateStr}T${startTimeStr}`);
    let end = new Date(`${dateStr}T${endTimeStr}`);
    if (endTimeStr < startTimeStr) {
        end = addDays(end, 1);
    }
    return { start, end };
}

// Copy getEffectiveRoster logic
async function getEffectiveRoster(dateObj) {
    const targetDate = typeof dateObj === 'string' ? parseISO(dateObj) : dateObj;
    const dateStr = format(targetDate, 'yyyy-MM-dd');

    const { data: transactions, error: transErr } = await supabase
        .from('roster_transactions')
        .select(`
            employee_id,
            slot_type,
            is_off,
            status,
            shift_id,
            custom_start_time,
            custom_end_time,
            employees!inner(id, name, nickname, position),
            shifts(id, name, start_time, end_time)
        `)
        .eq('date', dateStr)
        .eq('status', 'PUBLISHED');

    if (transErr) {
        console.error("Error fetching transactions:", transErr);
        return [];
    }

    const rosterList = [];
    if (transactions) {
        transactions.forEach(tx => {
            if (tx.is_off) {
                rosterList.push({
                    ...tx.employees,
                    slot_type: tx.slot_type,
                    is_off: true,
                    shift: { name: "OFF" },
                    status: tx.status
                });
                return;
            }

            const shiftData = tx.shifts ? { ...tx.shifts } : { name: "Custom Shift" };
            if (tx.custom_start_time) shiftData.start_time = tx.custom_start_time;
            if (tx.custom_end_time) shiftData.end_time = tx.custom_end_time;

            const { start, end } = createTimeRange(dateStr, shiftData.start_time, shiftData.end_time);

            rosterList.push({
                ...tx.employees,
                slot_type: tx.slot_type,
                is_off: false,
                status: tx.status,
                shift: shiftData,
                timeRange: { start, end }
            });
        });
    }

    // Sort by start time
    return rosterList.sort((a, b) => {
        const timeA = a.shift?.start_time || '23:59';
        const timeB = b.shift?.start_time || '23:59';
        return timeA.localeCompare(timeB);
    });
}

async function inspect() {
    try {
        console.log("Analyzing updated weekly schedule Flex message generation...");
        // Set date to today (or a specific date where there's transactions)
        const today = addHours(new Date(), 7);
        const todayDateStr = format(today, 'yyyy-MM-dd');
        const startOfThisWeek = startOfWeek(today, { weekStartsOn: 1 });
        const tomorrow = addDays(today, 1);
        const start = startOfWeek(tomorrow, { weekStartsOn: 1 }); // Monday of tomorrow's week
        const isNextWeek = format(start, 'yyyy-MM-dd') > format(startOfThisWeek, 'yyyy-MM-dd');
        const titleText = isNextWeek ? '📅 ตารางงานสัปดาห์หน้า' : '📅 ตารางงานสัปดาห์นี้';
        
        console.log("Today in Thai time:", format(today, 'yyyy-MM-dd HH:mm:ss'));
        console.log("startOfThisWeek:", format(startOfThisWeek, 'yyyy-MM-dd'));
        console.log("tomorrowDateStr:", format(tomorrow, 'yyyy-MM-dd'));
        console.log("start (Monday of tomorrow's week):", format(start, 'yyyy-MM-dd'));
        console.log("isNextWeek:", isNextWeek);
        console.log("titleText:", titleText);

        const daysTitle = ["อาทิตย์", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์"];
        const contents = [];

        for (let i = 0; i < 7; i++) {
            const currentDay = addDays(start, i);
            const currentDayStr = format(currentDay, 'yyyy-MM-dd');
            const dayIndex = currentDay.getDay();
            const dateStr = format(currentDay, 'dd/MM');

            console.log(`Checking Day ${i}: ${daysTitle[dayIndex]} ${currentDayStr}`);

            // Skip past days (but keep today!)
            if (currentDayStr < todayDateStr) {
                console.log(`  -> Skipped because ${currentDayStr} < ${todayDateStr}`);
                continue;
            }

            const roster = await getEffectiveRoster(currentDay);
            const workingRoster = roster.filter(emp => !emp.is_off && emp.shift?.name !== 'OFF');
            console.log(`  -> Found ${workingRoster.length} working employees.`);

            if (workingRoster.length > 0) {
                contents.push({
                    type: 'box', layout: 'horizontal', margin: 'md',
                    contents: [
                        { type: 'text', text: `📅 ${daysTitle[dayIndex]} ${dateStr}`, weight: 'bold', size: 'sm', color: '#1e293b', flex: 1 },
                        { type: 'text', text: `👥 ${workingRoster.length} คน`, size: 'xs', color: '#64748b', align: 'end', weight: 'bold' }
                    ]
                });
                workingRoster.forEach(emp => {
                    const isOff = emp.is_off || emp.shift?.name === 'OFF';
                    const isCustomOrExtra = emp.isExtra || !emp.shift?.id || emp.shift?.name?.includes('Custom') || emp.shift?.name?.includes('Extra');
                    const shiftStart = emp.shift?.start_time?.slice(0,5) || '';
                    const shiftEnd = emp.shift?.end_time?.slice(0,5) || '';
                    const shiftName = emp.shift?.name || 'Custom';
                    
                    const colorHex = getShiftColorHex(shiftName, isOff, isCustomOrExtra);
                    const displayTime = shiftStart && shiftEnd ? `${shiftStart}-${shiftEnd}` : shiftStart || '';
                    
                    contents.push({
                        type: 'box', layout: 'horizontal', margin: 'xs',
                        paddingStart: '12px',
                        contents: [
                            { type: 'text', text: `👤 ${emp.nickname || emp.name}`, size: 'xs', color: '#334155', flex: 3 },
                            { type: 'text', text: displayTime, size: 'xs', color: colorHex, align: 'end', flex: 2, weight: 'bold' }
                        ]
                    });
                });
                contents.push({ type: 'separator', margin: 'md', color: '#e2e8f0' });
            } else {
                contents.push({
                    type: 'box', layout: 'horizontal', margin: 'md',
                    contents: [
                        { type: 'text', text: `📅 ${daysTitle[dayIndex]} ${dateStr}`, weight: 'bold', size: 'sm', color: '#64748b', flex: 1 },
                        { type: 'text', text: `ไม่มีคนเข้ากะ 😴`, size: 'xs', color: '#94a3b8', align: 'end' }
                    ]
                });
                contents.push({ type: 'separator', margin: 'md', color: '#e2e8f0' });
            }
        }

        if (contents.length > 0 && contents[contents.length - 1].type === 'separator') {
            contents.pop();
        }

        const flexBubble = {
            type: 'bubble',
            size: 'mega',
            header: {
                type: 'box',
                layout: 'vertical',
                backgroundColor: '#0b8a4f',
                paddingAll: '16px',
                contents: [
                    {
                        type: 'text',
                        text: titleText,
                        weight: 'bold',
                        size: 'lg',
                        color: '#ffffff'
                    },
                    {
                        type: 'text',
                        text: isNextWeek ? 'ตารางเวรการทำงานล่วงหน้าสำหรับสัปดาห์หน้า' : 'ตารางเวรการทำงานสำหรับสัปดาห์นี้',
                        size: 'xs',
                        color: '#a7f3d0',
                        margin: 'xs'
                    }
                ]
            },
            body: {
                type: 'box',
                layout: 'vertical',
                paddingAll: '16px',
                spacing: 'md',
                contents: contents
            }
        };

        console.log("\nGenerated Flex Message Bubble Contents:");
        console.log(JSON.stringify(flexBubble, null, 2));

    } catch (err) {
        console.error("Error in inspect:", err);
    }
}

inspect();
