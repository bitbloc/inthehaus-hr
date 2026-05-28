import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';

export const dynamic = 'force-dynamic';

// Helper function to list all files in a bucket using pagination
async function listAllBucketFiles(bucketName) {
  let allFiles = [];
  let offset = 0;
  const limit = 500;
  
  while (true) {
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit, offset });
    
    if (error) throw error;
    if (!files || files.length === 0) break;
    
    allFiles = allFiles.concat(files);
    if (files.length < limit) break;
    offset += limit;
  }
  return allFiles;
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const days = body.days || 30;

    console.log(`🧹 Manual Deletion Request: cleaning uploads older than ${days} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTime = cutoffDate.getTime();

    // 1. Clean 'yuzu-slips' bucket
    const slipFiles = await listAllBucketFiles('yuzu-slips');
    const slipsToDelete = slipFiles.filter(file => {
      const createdTime = new Date(file.created_at).getTime();
      return createdTime < cutoffTime;
    });

    let slipsDeleted = 0;
    if (slipsToDelete.length > 0) {
      const fileNames = slipsToDelete.map(f => f.name);
      console.log(`Deleting ${fileNames.length} files from 'yuzu-slips'`);
      
      const batchSize = 100;
      for (let i = 0; i < fileNames.length; i += batchSize) {
        const batch = fileNames.slice(i, i + batchSize);
        const { error: delErr } = await supabase.storage
          .from('yuzu-slips')
          .remove(batch);
        if (delErr) throw delErr;
        slipsDeleted += batch.length;
      }

      // Update Database references
      for (const fileName of fileNames) {
        if (fileName.startsWith('slip_')) {
          await supabase
            .from('slip_transactions')
            .update({ slip_url: null })
            .like('slip_url', `%${fileName}`);
        }
        
        await supabase
          .from('yuzu_chat_history')
          .update({ content: '[ภาพประกอบช็อตกาแฟ] (ไฟล์ภาพถูกลบเพื่อประหยัดพื้นที่)' })
          .like('content', `%${fileName}`);
      }
    }

    // 2. Clean 'yuzu-images' bucket
    const imageFiles = await listAllBucketFiles('yuzu-images');
    const imagesToDelete = imageFiles.filter(file => {
      const createdTime = new Date(file.created_at).getTime();
      return createdTime < cutoffTime;
    });

    let imagesDeleted = 0;
    if (imagesToDelete.length > 0) {
      const fileNames = imagesToDelete.map(f => f.name);
      console.log(`Deleting ${fileNames.length} files from 'yuzu-images'`);
      
      const batchSize = 100;
      for (let i = 0; i < fileNames.length; i += batchSize) {
        const batch = fileNames.slice(i, i + batchSize);
        const { error: delErr } = await supabase.storage
          .from('yuzu-images')
          .remove(batch);
        if (delErr) throw delErr;
        imagesDeleted += batch.length;
      }

      for (const fileName of fileNames) {
        await supabase
          .from('yuzu_chat_history')
          .update({ content: '(รูปภาพถูกลบเพื่อประหยัดพื้นที่)' })
          .like('content', `%${fileName}`);
      }
    }

    return NextResponse.json({
      success: true,
      yuzu_slips_deleted: slipsDeleted,
      yuzu_images_deleted: imagesDeleted
    });

  } catch (error) {
    console.error("Cleanup API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
