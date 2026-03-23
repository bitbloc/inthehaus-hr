import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  try {
    console.log("Starting Yuzu Image Cleanup...");
    
    // Slips are usually stored with names like slip_TIMESTAMP_USERID.jpg
    // We want to delete images older than 2 days.
    const now = Date.now();
    const twoDaysAgo = now - (2 * 24 * 60 * 60 * 1000);

    const { data: files, error } = await supabase.storage
      .from('yuzu-images')
      .list();

    if (error) throw error;

    const toDelete = files
      .filter(file => {
        // Handle slip_ prefix or gen_ prefix
        const timestampMatch = file.name.match(/_(17\d+)_/);
        if (timestampMatch) {
            const ts = parseInt(timestampMatch[1]);
            return ts < twoDaysAgo;
        }
        // Fallback to created_at if name doesn't match pattern
        return new Date(file.created_at).getTime() < twoDaysAgo;
      })
      .map(file => file.name);

    if (toDelete.length > 0) {
      console.log(`Deleting ${toDelete.length} old images...`, toDelete);
      const { error: delError } = await supabase.storage
        .from('yuzu-images')
        .remove(toDelete);
      if (delError) throw delError;
    }

    return NextResponse.json({ success: true, deletedCount: toDelete.length });
  } catch (error) {
    console.error("Cleanup Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
