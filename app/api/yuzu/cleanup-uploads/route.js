import { NextResponse } from 'next/server';
import { supabase } from '../../../../lib/supabaseClient';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // Allow sufficient execution window for cloud environments

// Helper function to list all files in a bucket using pagination
async function listAllBucketFiles(bucketName) {
  let allFiles = [];
  let offset = 0;
  const limit = 500;
  
  while (true) {
    const { data: files, error } = await supabase.storage
      .from(bucketName)
      .list('', { limit, offset });
    
    if (error) {
      console.error(`Storage listing error in ${bucketName}:`, error);
      throw error;
    }
    if (!files || files.length === 0) break;
    
    allFiles = allFiles.concat(files);
    if (files.length < limit) break;
    offset += limit;
  }
  return allFiles;
}

// Concurrency helper to execute async updates in chunks without overloading PostgREST
async function runWithConcurrency(items, fn, concurrency = 10) {
  for (let i = 0; i < items.length; i += concurrency) {
    const chunk = items.slice(i, i + concurrency);
    await Promise.all(chunk.map(fn));
  }
}

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const days = Number(body.days) || 30;

    console.log(`🧹 Manual Deletion Request: cleaning uploads older than ${days} days`);

    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);
    const cutoffTime = cutoffDate.getTime();

    let slipsDeleted = 0;
    let imagesDeleted = 0;

    // 1. Clean 'yuzu-slips' bucket
    try {
      const slipFiles = await listAllBucketFiles('yuzu-slips');
      const slipsToDelete = slipFiles.filter(file => {
        const createdTime = new Date(file.created_at).getTime();
        return createdTime < cutoffTime;
      });

      if (slipsToDelete.length > 0) {
        const fileNames = slipsToDelete.map(f => f.name);
        console.log(`Deleting ${fileNames.length} files from 'yuzu-slips'`);
        
        const batchSize = 100;
        for (let i = 0; i < fileNames.length; i += batchSize) {
          const batch = fileNames.slice(i, i + batchSize);
          const { error: delErr } = await supabase.storage
            .from('yuzu-slips')
            .remove(batch);
          if (delErr) console.error("Storage remove batch error in yuzu-slips:", delErr);
          slipsDeleted += batch.length;
        }

        // Update slip transactions for deleted slips (concurrency 10)
        const slipFilesToUpdate = fileNames.filter(name => name.startsWith('slip_'));
        await runWithConcurrency(slipFilesToUpdate, async (fileName) => {
          try {
            await supabase
              .from('slip_transactions')
              .update({ slip_url: null })
              .like('slip_url', `%${fileName}`);
          } catch (e) {
            console.error(`Failed to nullify slip_url for ${fileName}:`, e.message);
          }
        }, 10);

        // Update espresso shot chat logs (concurrency 10)
        const shotFilesToUpdate = fileNames.filter(name => name.startsWith('shot_') || name.includes('shot'));
        await runWithConcurrency(shotFilesToUpdate, async (fileName) => {
          try {
            await supabase
              .from('yuzu_chat_history')
              .update({ content: '[ภาพประกอบช็อตกาแฟ] (ไฟล์ภาพถูกลบเพื่อประหยัดพื้นที่)' })
              .like('content', `%${fileName}`);
          } catch (e) {
            console.error(`Failed to update chat log for shot ${fileName}:`, e.message);
          }
        }, 10);
      }
    } catch (e) {
      console.error("Error processing yuzu-slips cleanup:", e);
    }

    // 2. Clean 'yuzu-images' bucket
    try {
      const imageFiles = await listAllBucketFiles('yuzu-images');
      const imagesToDelete = imageFiles.filter(file => {
        const createdTime = new Date(file.created_at).getTime();
        return createdTime < cutoffTime;
      });

      if (imagesToDelete.length > 0) {
        const fileNames = imagesToDelete.map(f => f.name);
        console.log(`Deleting ${fileNames.length} files from 'yuzu-images'`);
        
        const batchSize = 100;
        for (let i = 0; i < fileNames.length; i += batchSize) {
          const batch = fileNames.slice(i, i + batchSize);
          const { error: delErr } = await supabase.storage
            .from('yuzu-images')
            .remove(batch);
          if (delErr) console.error("Storage remove batch error in yuzu-images:", delErr);
          imagesDeleted += batch.length;
        }

        await runWithConcurrency(fileNames, async (fileName) => {
          try {
            await supabase
              .from('yuzu_chat_history')
              .update({ content: '(รูปภาพถูกลบเพื่อประหยัดพื้นที่)' })
              .like('content', `%${fileName}`);
          } catch (e) {
            console.error(`Failed to update chat log for image ${fileName}:`, e.message);
          }
        }, 10);
      }
    } catch (e) {
      console.error("Error processing yuzu-images cleanup:", e);
    }

    return NextResponse.json({
      success: true,
      yuzu_slips_deleted: slipsDeleted,
      yuzu_images_deleted: imagesDeleted,
      message: (slipsDeleted + imagesDeleted) > 0 
        ? `ล้างข้อมูลสำเร็จ (ลบสลิป ${slipsDeleted} รูป, รูปประกอบ ${imagesDeleted} รูป)`
        : `ไม่มีไฟล์เก่ากว่า ${days} วันในระบบ`
    });

  } catch (error) {
    console.error("Cleanup API Error:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

