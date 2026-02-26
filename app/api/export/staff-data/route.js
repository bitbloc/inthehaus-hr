import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';

export async function GET(request) {
    try {
        const { searchParams } = new URL(request.url);
        let startDate = searchParams.get('startDate');
        let endDate = searchParams.get('endDate');

        // Default to current month if no dates provided
        if (!startDate || !endDate) {
            const now = new Date();
            const year = now.getFullYear();
            const month = String(now.getMonth() + 1).padStart(2, '0');
            // Basic fallback if not specified
            if (!startDate) startDate = `${year}-${month}-01`;

            // Get last day of current month
            const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
            if (!endDate) endDate = `${year}-${month}-${lastDay}`;
        }

        // Format for DB query (inclusive of the whole end date)
        const queryStartDate = new Date(`${startDate}T00:00:00.000Z`).toISOString();
        const queryEndDate = new Date(`${endDate}T23:59:59.999Z`).toISOString();


        // 1. Fetch Attendance Logs
        const { data: attendanceData, error: attendanceError } = await supabase
            .from('attendance_logs')
            .select(`
                id,
                employee_id,
                action_type,
                timestamp,
                mood_status,
                employees (
                    name,
                    position
                )
            `)
            .gte('timestamp', queryStartDate)
            .lte('timestamp', queryEndDate)
            .order('timestamp', { ascending: false });

        if (attendanceError) {
            console.error('Error fetching attendance:', attendanceError);
            throw new Error(`Failed to fetch attendance data: ${attendanceError.message}`);
        }

        // 2. Fetch Leave Requests
        // Note: leave_date is usually stored as YYYY-MM-DD
        const { data: leaveData, error: leaveError } = await supabase
            .from('leave_requests')
            .select(`
                id,
                employee_id,
                leave_type,
                leave_date,
                reason,
                status,
                created_at,
                employees (
                    name,
                    position
                )
            `)
            .gte('leave_date', startDate)
            .lte('leave_date', endDate)
            .order('leave_date', { ascending: false });

        if (leaveError) {
            console.error('Error fetching leaves:', leaveError);
            throw new Error(`Failed to fetch leave data: ${leaveError.message}`);
        }

        // Format the output
        const responseData = {
            period: {
                start: startDate,
                end: endDate
            },
            total_attendance_records: attendanceData?.length || 0,
            total_leave_records: leaveData?.length || 0,

            attendance: attendanceData?.map(log => ({
                record_id: log.id,
                employee_id: log.employee_id,
                employee_name: log.employees?.name || 'Unknown',
                position: log.employees?.position || 'Unknown',
                action_type: log.action_type, // "check_in", "check_out", "absent"
                timestamp: log.timestamp,
                mood_status: log.mood_status
            })) || [],

            leaves: leaveData?.map(leave => ({
                record_id: leave.id,
                employee_id: leave.employee_id,
                employee_name: leave.employees?.name || 'Unknown',
                position: leave.employees?.position || 'Unknown',
                leave_type: leave.leave_type, // "sick", "personal", "annual"
                leave_date: leave.leave_date,
                reason: leave.reason,
                status: leave.status, // "approved", "rejected", "pending"
                submitted_at: leave.created_at
            })) || []
        };

        return NextResponse.json(responseData, {
            status: 200,
            headers: {
                'Content-Type': 'application/json',
                // Add CORS headers if this will be accessed from a different domain
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS',
                'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            }
        });

    } catch (error) {
        console.error('API Error:', error);
        return NextResponse.json(
            { error: 'Internal Server Error', details: error.message },
            { status: 500 }
        );
    }
}

// Handle OPTIONS request for CORS
export async function OPTIONS(request) {
    return NextResponse.json({}, {
        status: 200,
        headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
    });
}
