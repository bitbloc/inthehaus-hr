import { NextResponse } from 'next/server';
import { fetchStockItems } from '../../../../utils/stock_api';

export async function GET() {
  try {
    const items = await fetchStockItems();
    return NextResponse.json({ success: true, data: items }, { status: 200 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
