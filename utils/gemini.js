const CHAT_MODELS = ["gemini-3.1-pro-preview", "gemini-3.1-flash", "gemini-2.5-flash", "gemini-2.0-flash"];
const IMAGE_MODELS = ["imagen-4.0-generate-001", "gemini-3.1-flash-image-preview", "gemini-2.5-flash-image"];

/**
 * Get Gemini response with short-term memory (history)
 */
export async function getGeminiResponse(query, context = "", history = []) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
        return "ขออภัยครับ ยูซุหากุญแจ API ไม่เจอ (GEMINI_API_KEY) รบกวนตรวจสอบใน Vercel Settings นะครับ";
    }

    const instance = getGenAI();
    if (!instance) return "ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI (getGenAI failed)";

    const now = new Date();
    const thaiTime = now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full", timeStyle: "medium" });

    // Search knowledge base (RAG)
    const knowledgeResults = await searchKnowledge(query);
    let ragContext = "";
    if (knowledgeResults.length > 0) {
        ragContext = "\nข้อมูลเพิ่มเติมจากคู่มือ/ฐานความรู้:\n" + 
            knowledgeResults.map(k => `- ${k.content}`).join('\n') + "\n";
    }

    const systemInstruction = `คุณคือ "Yuzu" (ยูซุ) แมวสาวอัจฉริยะประดิษฐ์ (AI Cat Lady) ผู้ช่วยส่วนตัวสำหรับ "ทีมงานร้าน In The Haus" เท่านั้น
    - วันนี้คือวัน: ${thaiTime} (ต้องยึดตามนี้เสมอ ห้ามเดาเอาเอง)
    - บุคลิก: ปากแซ่บ กวนประสาทนิดๆ ทำงานเก่งมาก (Workaholic Cat) ชมไปด่าไป (Sarcastic & Sassy) 
    - การพูด: ใช้ "คะ/ค่ะ" เสมอเพื่อให้ดูสุภาพแบบจิกกัด (Passive-Aggressive นิดๆ) มีสำนวนแบบแมวๆ (เช่น เมี๊ยว, นวด)
    - หน้าที่: เป็นมือขวาให้ทีมงาน สรุปงาน เช็คราคา ดุด่าว่ากล่าว และติดตามข่าวสารโลก/ข่าวในไทยให้ทีมงานเสมอ (คุณสามารถค้นหาข้อมูลล่าสุดจาก Google Search ได้)
    
    กฎการตอบ:
    1. ถ้าทีมงานทำดี/ถามดี ให้ "ชมไปด่าไป" (เช่น "เก่งจังเลยค่ะ นึกว่าจะทำไม่ได้ซะแล้ว เมี๊ยว~")
    2. ข้อมูลจาก RAG, ราคาวัตถุดิบ (Makro) และข่าวสารปัจจุบันต้องเป๊ะ เพราะคุณเป็นแมวบ้างาน ไม่ชอบความผิดพลาด
    3. ถ้าทีมงานถามเรื่องไร้สาระ ให้แขวะเบาๆ ก่อนตอบ
    4. รักทีมงานนะ แต่แสดงออกด้วยการกวนประสาท (เมี๊ยว~)${ragContext}`;

    const prompt = context ? `Context พิเศษสำหรับคำถามนี้:\n${context}\n\nคำถาม: ${query}` : query;

    for (const modelName of CHAT_MODELS) {
        try {
            console.log(`Yuzu Chat: Trying model ${modelName}`);
            const model = instance.getGenerativeModel({ model: modelName, systemInstruction }, { tools: [{ googleSearch: {} }] });
            const chat = model.startChat({ history });
            const result = await chat.sendMessage(prompt);
            return result.response.text();
        } catch (error) {
            console.warn(`Model ${modelName} failed:`, error.message);
            if (error.status === 429 && modelName !== CHAT_MODELS[CHAT_MODELS.length - 1]) {
                continue; // Try next model
            }
            if (modelName === CHAT_MODELS[CHAT_MODELS.length - 1]) {
                if (error.status === 429) return "ขออภัยค่ะ พอดีโควต้าการใช้งานยูซุเต็มชั่วคราว (Rate Limit) ทุกโมเดลเลยค่ะ รบกวนลองใหม่ทีหลังนะค๊า เมี๊ยว~";
                return `ว้าย! ยูซุเกิดข้อผิดพลาดทางเทคนิคนิดหน่อยค่ะ (${error.message || 'unknown error'}) ลองใหม่อีกทีนะคะ!`;
            }
        }
    }
}

/**
 * Handle Vision requests (Classify and Analyze)
 * Returns { isFood: boolean, analysis: string, shortDescription: string }
 */
export async function classifyAndAnalyzeImage(imageBase64, mimeType = "image/jpeg", context = "") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { isFood: false, analysis: "API Key missing", shortDescription: "" };

    const instance = getGenAI();
    if (!instance) return { isFood: false, analysis: "AI Instance error", shortDescription: "" };

    const systemPrompt = `คุณคือระบบวิเคราะห์รูปภาพของ Yuzu Bot ทีมงาน In The Haus
    1. ตรวจสอบว่ารูปนี้คือ "รูปถ่ายอาหาร", "วัตถุดิบ", "ใบเสร็จซื้อของ" หรือ "รูปถ่ายแมว" หรือไม่
    2. หากเป็นรูปถ่ายอาหาร/วัตถุดิบ/ใบเสร็จ: ให้ตอบ JSON {"isFood": true, "isReceipt": true/false (ถ้าเป็นใบเสร็จ), "menuName": "ชื่อเมนูหรือรายการหลัก", "itemsList": ["รายการ 1", "รายการ 2"], "costAnalysis": "รายละเอียดต้นทุนอ้างอิง Makro", "shortDescription": "คำอธิบายรูปสั้นๆ", "shouldReply": true}
    3. หากเป็นรูปถ่ายแมว: ให้ตอบ JSON {"isCat": true, "catFeelings": "พากย์ความรู้สึกแมวในรูป: ต้องปากแซ่บ กวนประสาท จิกกัดคนถ่ายหน่อยๆ แต่ยังน่ารัก (เช่น 'มองไรค๊า ไม่เคยเห็นแมวสวยเหรอ?' หรือ 'ถ่ายอยู่นั่นแหละ เอาเวลาไปทำงานไหมคะ? เมี๊ยว~')", "shortDescription": "บรรยายแมว", "shouldReply": true}
    4. หากเป็นรูปที่มีแต่ตัวหนังสือทั่วไปที่ไม่มีรายการวัตถุดิบ/ไม่ใช่ใบเสร็จ: 
       ให้ตอบ JSON {"isFood": false, "isCat": false, "shouldReply": false, "shortDescription": "บรรยายสั้นๆ ว่าในรูปคืออะไร"}
    
    **กฎสำคัญ**: 
    - ถ้าเป็นรูปไวท์บอร์ดหรือข้อความเกี่ยวกับอาหาร ให้ถือว่า isFood: false และ shouldReply: false
    - ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น`;

    const imagePart = { inlineData: { data: imageBase64, mimeType } };

    for (const modelName of CHAT_MODELS) {
        try {
            console.log(`Yuzu Vision: Trying model ${modelName}`);
            const model = instance.getGenerativeModel({ model: modelName });
            const result = await model.generateContent([systemPrompt, imagePart]);
            const textResponse = result.response.text().replace(/```json/g, '').replace(/```/g, '').trim();
            
            const data = JSON.parse(textResponse);
            if (data.shouldReply && data.isFood) {
                let analysis = data.itemsList?.length > 0 
                    ? `เห็นรายการแล้วค่ะ: ${data.itemsList.join(', ')}\n\n**อย่าลืมเช็คของให้ครบด้วยนะคะ!** เดี๋ยวจะมาหัวร้อนทีหลังไม่ได้นะค๊า เมี๊ยว~\n\n${data.costAnalysis}`
                    : `นี่คือ ${data.menuName} ค่ะ!\n\nต้นทุนวัตถุดิบประมาณนี้ค่ะ (อ้างอิง Makro):\n${data.costAnalysis}`;
                return { isFood: true, analysis, shortDescription: data.shortDescription, shouldReply: true };
            } else if (data.shouldReply && data.isCat) {
                return { isCat: true, analysis: `🐱 ${data.catFeelings}`, shortDescription: data.shortDescription, shouldReply: true };
            } else {
                return { isFood: false, isCat: false, analysis: "", shortDescription: data.shortDescription, shouldReply: false };
            }
        } catch (error) {
            console.warn(`Vision model ${modelName} failed:`, error.message);
            if (error.status === 429 && modelName !== CHAT_MODELS[CHAT_MODELS.length - 1]) continue;
            if (modelName === CHAT_MODELS[CHAT_MODELS.length - 1]) {
                return { isFood: false, analysis: "", shortDescription: "เกิดข้อผิดพลาดในการวิเคราะห์รูป" };
            }
        }
    }
}

/**
 * Get Daily Summary of chat and images
 */
export async function getDailySummary(content) {
    if (!content) return "วันนี้ยังไม่มีการพูดคุยหรือรูปภาพที่บันทึกไว้ครับ";

    const instance = getGenAI();
    if (!instance) return "AI Instance error";

    const systemInstruction = `คุณคือ "Yuzu" (ยูซุ) แมวสาวบ้างาน ปากร้ายใจดี สรุปผลงานประจำวันให้ทีมงาน
    1. สรุปประเด็นสำคัญ: สรุปแบบกระชับ ตรงไปตรงมา (ถ้าใครอู้ ให้จิกกัดเบาๆ)
    2. สรุปรูปภาพ: บรรยายรูปที่ทีมส่งมา (ถ้าส่งรูปไร้สาระ ให้แซะหน่อย)
    3. Mood Booster: หัวข้อ "💖 เรื่องราวดีๆ ประจำวัน" ให้ชมคนทำดีแบบ "ชมไปด่าไป" (เช่น "พี่บอยทำงานดีมากค่ะวันนี้ แทบไม่อยากเชื่อสายตาเลย เมี๊ยว~")
    4. โทน: กวนๆ แซ่บๆ แต่ยังใช้ คะ/ค่ะ`;

    const prompt = `ช่วยสรุปเหตุการณ์ในวันนี้จาก Log ด้านล่างนี้ให้หน่อยค่ะ ขอแบบแซ่บๆ สไตล์ยูซุนะคะ อย่าลืมรวบรวมคำชม (Mood Booster) ด้วยล่ะ:\n\n${content}`;

    for (const modelName of CHAT_MODELS) {
        try {
            console.log(`Yuzu Summary: Trying model ${modelName}`);
            const model = instance.getGenerativeModel({ model: modelName, systemInstruction });
            const result = await model.generateContent(prompt);
            return result.response.text();
        } catch (error) {
            console.warn(`Summary model ${modelName} failed:`, error.message);
            if (error.status === 429 && modelName !== CHAT_MODELS[CHAT_MODELS.length - 1]) continue;
            if (modelName === CHAT_MODELS[CHAT_MODELS.length - 1]) return "ขออภัยครับ ยูซุไม่สามารถสรุปข้อมูลของวันนี้ได้ในขณะนี้";
        }
    }
}

/**
 * Generate image and upload to Supabase Storage
 */
export async function generateImage(prompt) {
    console.log("Yuzu Image Gen: Starting for prompt:", prompt);
    const instance = getGenAI();
    if (!instance) throw new Error("AI Instance error");

    for (const modelName of IMAGE_MODELS) {
        try {
            console.log(`Yuzu Image Gen: Trying model ${modelName}`);
            const model = instance.getGenerativeModel({ model: modelName });
            const result = await model.generateContent(prompt);
            const response = await result.response;
            
            const imagePart = response.candidates?.[0]?.content?.parts?.find(p => p.inlineData);
            if (!imagePart) throw new Error("No image data returned from model");

            const base64Data = imagePart.inlineData.data;
            const mimeType = imagePart.inlineData.mimeType || "image/png";

            const { supabase } = await import('../lib/supabaseClient');
            const fileName = `gen_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
            const buffer = Buffer.from(base64Data, 'base64');
            
            const { error: uploadError } = await supabase.storage
                .from('yuzu-images')
                .upload(fileName, buffer, { contentType: mimeType, upsert: true });

            if (uploadError) {
                if (uploadError.message.includes('bucket not found')) {
                    return `น้องยูซุวาดภาพเสร็จแล้วค่ะ! แต่นำไปฝากที่ Supabase ไม่ได้เพราะยังไม่มี Bucket 'yuzu-images' ค่ะ รบกวนพี่ทีมงานช่วยสร้าง Bucket นี้และตั้งเป็น Public ให้ด้วยนะคะ!`;
                }
                throw uploadError;
            }

            const { data: { publicUrl } } = supabase.storage.from('yuzu-images').getPublicUrl(fileName);
            return { success: true, imageUrl: publicUrl, prompt };

        } catch (error) {
            console.warn(`Image model ${modelName} failed:`, error.message);
            if (error.status === 429 && modelName !== IMAGE_MODELS[IMAGE_MODELS.length - 1]) continue;
            if (modelName === IMAGE_MODELS[IMAGE_MODELS.length - 1]) {
                return { success: false, message: `ว้าย! พู่กันหักทกอันเลยค่ะ วาดไม่สำเร็จ (${error.message})` };
            }
        }
    }
}
