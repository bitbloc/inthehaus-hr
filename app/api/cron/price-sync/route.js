import { NextResponse } from 'next/server';
import { updateIngredientPrices } from '../../../../utils/price_scraper';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    // 1. Authorization (Simple API Key or check Vercel Cron header)
    const authHeader = request.headers.get('authorization');
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // 2. Perform Sync
    console.log("Yuzu Cron: Starting price sync...");
    const results = await updateIngredientPrices();
    
    return NextResponse.json({ 
      success: true, 
      count: results.length,
      timestamp: new Date().toISOString() 
    });
  } catch (error) {
    console.error("Yuzu Cron Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
