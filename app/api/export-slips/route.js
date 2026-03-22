import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { format, addHours } from 'date-fns';

export async function GET(request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date');
    let dateStr = dateParam;
    
    if (!dateStr) {
      // Default to today in Thailand time
      dateStr = format(addHours(new Date(), 7), 'yyyy-MM-dd');
    }

    const { data: slips, error } = await supabase
      .from('slip_transactions')
      .select('id, amount, slip_url, timestamp, is_deleted, employees(name, nickname)')
      .eq('date', dateStr)
      .order('timestamp', { ascending: true });

    if (error) throw error;

    // Create CSV content
    // We add BOM \uFEFF for Excel to read Thai properly
    let csvContent = '\uFEFF';
    csvContent += 'Transaction ID,Date,Time,Employee Name,Amount (THB),Slip URL,Status\n';

    slips.forEach(slip => {
      const bkkTime = addHours(new Date(slip.timestamp), 7);
      const rowDate = format(bkkTime, 'dd/MM/yyyy');
      const rowTime = format(bkkTime, 'HH:mm:ss');
      const empName = slip.employees ? (slip.employees.nickname || slip.employees.name) : 'Unknown';
      const status = slip.is_deleted ? 'Deleted' : 'Active';
      
      // Escape for CSV
      const escapedName = `"${empName.replace(/"/g, '""')}"`;
      
      csvContent += `${slip.id},${rowDate},${rowTime},${escapedName},${slip.amount},${slip.slip_url || ''},${status}\n`;
    });

    const response = new NextResponse(csvContent);
    response.headers.set('Content-Type', 'text/csv; charset=utf-8');
    response.headers.set('Content-Disposition', `attachment; filename="slip_transactions_${dateStr}.csv"`);
    
    return response;
  } catch (error) {
    console.error("Export Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
