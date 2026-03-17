import { NextResponse } from 'next/server';
import { cleanupOldHistory, cleanupOldImages } from '../../../utils/memory';

export const dynamic = 'force-dynamic';

/**
 * GET handler to trigger cleanup processes
 * Can be called by Vercel Cron or any other cron service
 */
export async function GET(request) {
    console.log("Cron: Starting scheduled cleanup...");
    
    try {
        // 1. Cleanup chat history (older than 2 days)
        await cleanupOldHistory();
        console.log("Cron: Chat history cleanup completed.");
        
        // 2. Cleanup images (older than 15 days)
        await cleanupOldImages();
        console.log("Cron: Storage image cleanup completed.");
        
        return NextResponse.json({ 
            success: true, 
            message: "Cleanup tasks completed successfully",
            timestamp: new Date().toISOString()
        });
    } catch (error) {
        console.error("Cron Cleanup Error:", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message 
        }, { status: 500 });
    }
}
