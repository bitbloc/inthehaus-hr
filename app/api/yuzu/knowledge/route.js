import { NextResponse } from 'next/server';
import { addKnowledge, updateKnowledge, extractTextFromPDF } from '../../../../utils/rag.js';

export async function POST(request) {
    try {
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
                content = await extractTextFromPDF(buffer);
                metadata.file_type = "pdf";
                metadata.file_name = file.name;
            } else if (file.type.startsWith("image/")) {
                // For images, we might just store the link or tell the user we're storing it as a reference
                // Ideally, we'd use a multimodal model to describe it, but for now let's just use the filename
                content = `Image Reference: ${file.name}`;
                metadata.file_type = "image";
                metadata.file_name = file.name;
            } else {
                content = buffer.toString('utf-8');
            }

            if (!content) {
                return NextResponse.json({ success: false, error: "No content extracted from file" }, { status: 400 });
            }

            const result = await addKnowledge(content, metadata);
            return NextResponse.json(result);
        } else {
            const { content, metadata } = await request.json();
            if (!content) {
                return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 });
            }
            const result = await addKnowledge(content, metadata || {});
            return NextResponse.json(result);
        }
    } catch (error) {
        console.error("API Error (Knowledge POST):", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}

export async function PUT(request) {
    try {
        const { id, content, metadata } = await request.json();
        if (!id) {
            return NextResponse.json({ success: false, error: "ID is required" }, { status: 400 });
        }

        const result = await updateKnowledge(id, content, metadata);
        return NextResponse.json(result);
    } catch (error) {
        console.error("API Error (Knowledge PUT):", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
