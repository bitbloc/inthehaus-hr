import { NextResponse } from 'next/server';

// Lazy load rag utilities to prevent top-level crashes
let rag = null;
async function getRag() {
    if (!rag) {
        console.log("Loading RAG utilities...");
        try {
            rag = await import('../../../../utils/rag.js');
            console.log("RAG utilities loaded");
        } catch (e) {
            console.error("Failed to load RAG utilities:", e);
            throw e;
        }
    }
    return rag;
}

export async function POST(request) {
    try {
        console.log("Knowledge API: POST start");
        const ragUtils = await getRag();
        
        const contentType = request.headers.get("content-type") || "";
        
        if (contentType.includes("multipart/form-data")) {
            const formData = await request.formData();
            const file = formData.get("file");
            const metadataStr = formData.get("metadata") || "{}";
            const metadata = JSON.parse(metadataStr);

            if (!file) {
                return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
            }

            const buffer = Buffer.from(await file.arrayBuffer());
            let content = "";
            
            if (file.type === "application/pdf") {
                content = await ragUtils.extractTextFromPDF(buffer);
                metadata.file_type = "pdf";
                metadata.file_name = file.name;
            } else if (file.type.startsWith("image/")) {
                content = `Image Reference: ${file.name}`;
                metadata.file_type = "image";
                metadata.file_name = file.name;
            } else {
                content = buffer.toString('utf-8');
            }

            if (!content) {
                return NextResponse.json({ success: false, error: "No content extracted from file" }, { status: 400 });
            }

            const result = await ragUtils.addKnowledge(content, metadata);
            return NextResponse.json(result);
        } else {
            const { content, metadata } = await request.json();
            if (!content) {
                return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 });
            }
            const result = await ragUtils.addKnowledge(content, metadata || {});
            return NextResponse.json(result);
        }
    } catch (error) {
        console.error("CRITICAL API Error (Knowledge POST):", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message || "Unknown error", 
            stack: error.stack,
            type: "POST_CRASH"
        }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        console.log("Knowledge API: PUT start");
        const ragUtils = await getRag();
        
        const { id, content, metadata } = await request.json();
        if (!id) {
            return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 });
        }

        const result = await ragUtils.updateKnowledge(id, content, metadata);
        return NextResponse.json(result);
    } catch (error) {
        console.error("CRITICAL API Error (Knowledge PUT):", error);
        return NextResponse.json({ 
            success: false, 
            error: error.message || "Unknown error", 
            stack: error.stack,
            type: "PUT_CRASH"
        }, { status: 500 });
    }
}
