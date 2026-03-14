import { NextResponse } from 'next/server';
import { addKnowledge } from '../../../../utils/rag';

export async function POST(request) {
    try {
        const { content, metadata } = await request.json();
        if (!content) {
            return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 });
        }

        const result = await addKnowledge(content, metadata || {});
        return NextResponse.json(result);
    } catch (error) {
        console.error("API Error (Knowledge):", error);
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }
}
