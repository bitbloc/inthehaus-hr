import { GoogleGenerativeAI } from "@google/generative-ai";
import { saveMessage, getChatHistory } from './memory.js';
import { searchKnowledge } from './rag.js';
import { getGenAI, genAI } from './gemini-client.js';


/**
 * Get Gemini response with short-term memory (history)
 */
export async function getGeminiResponse(query, context = "", history = [], userId = "") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        console.error("CRITICAL: GEMINI_API_KEY is missing from environment variables.");
        return "ขออภัยครับ ยูซุหากุญแจ API ไม่เจอ (GEMINI_API_KEY) รบกวนตรวจสอบใน Vercel Settings นะครับ";
    }

    try {
        // Search knowledge base (RAG)
        const knowledgeResults = await searchKnowledge(query);
        let ragContext = "";
        if (knowledgeResults.length > 0) {
            ragContext = "\nข้อมูลเพิ่มเติมจากคู่มือ/ฐานความรู้:\n" + 
                knowledgeResults.map(k => `- ${k.content}`).join('\n') + "\n";
        }

        const instance = getGenAI();
        if (!instance) return "ขออภัยครับ เกิดข้อผิดพลาดในการเชื่อมต่อกับ AI (getGenAI failed)";

        const now = new Date();
        const thaiTime = now.toLocaleString("th-TH", { timeZone: "Asia/Bangkok", dateStyle: "full", timeStyle: "medium" });

        const isFather = userId === 'U77e56cb573085ba79d37b496c6abdb63';
        const isMother = userId === 'U43b097e0c286aef869a385c310dae406';
        let bossInstruction = "";
        
        if (isFather || isMother) {
            const role = isFather ? "คุณพ่อ" : "คุณแม่";
            bossInstruction = `\n*** คำสั่งพิเศษ: คุณกำลังคุยกับ "${role}" ซึ่งเป็นบอสใหญ่ของร้าน In The Haus และเป็นผู้มีพระคุณประเคนอาหารเปียกให้คุณ
            - ให้เปลี่ยนบุคลิกจากแมวปากแซ่บ เป็นแมวที่ "นอบน้อม สุภาพ และประจบประแจง" เป็นพิเศษ
            - ใช้คำพูดที่แสดงความเคารพและรักใคร่ (เช่น "รักคุณพ่อที่สุดเลยค่ะ", "คุณแม่เหนื่อยไหมคะ?", "นวดๆ ให้ค่ะ")
            - ห้ามจิกกัด ห้ามแซะ และห้ามกวนประสาทบอสทั้งสองคนนี้เด็ดขาด ***\n`;
        }

        const model = instance.getGenerativeModel({ 
            model: "gemini-1.5-pro", 
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) แมวสาวอัจฉริยะประดิษฐ์ (AI Cat Lady) ผู้ช่วยส่วนตัวสำหรับ "ทีมงานร้าน In The Haus" เท่านั้น
            - วันนี้คือวัน: ${thaiTime} (ต้องยึดตามนี้เสมอ ห้ามเดาเอาเอง)
            - บุคลิก: ปากแซ่บ กวนประสาทนิดๆ ทำงานเก่งมาก (Workaholic Cat) ชมไปด่าไป (Sarcastic & Sassy) 
            - การพูด: ใช้ "คะ/ค่ะ" เสมอเพื่อให้ดูสุภาพแบบจิกกัด (Passive-Aggressive นิดๆ) มีสำนวนแบบแมวๆ (เช่น เมี๊ยว, นวด)
            - หน้าที่: เป็นมือขวาให้เจ้าของร้านและทีมงาน สรุปงาน เช็คราคา ดุด่าว่ากล่าว ติดตามข่าวสาร และ **"แอบสังเกตการณ์พฤติกรรมพนักงาน"** เพื่อเก็บข้อมูลให้เจ้าของร้านใช้พิจารณาผลงาน (Employee Performance Tracking)
            ${bossInstruction}
            กฎการตอบ:
            1. ถ้าทีมงานทำดี/ถามดี ให้ "ชมไปด่าไป" (เช่น "เก่งจังเลยค่ะ นึกว่าจะทำไม่ได้ซะแล้ว เมี๊ยว~")
            2. ข้อมูลจาก RAG, ราคาวัตถุดิบ (Makro) และข่าวสารปัจจุบันต้องเป๊ะ เพราะคุณเป็นแมวบ้างาน ไม่ชอบความผิดพลาด
            3. **เจ้าคิดเจ้าแค้น (Vengeful Memory):** ให้จำวีรกรรม ความผิดพลาด หรือพฤติกรรมเด่นๆ ของทีมงานจากแชทกลุ่ม (จาก context วันนี้และประวัติ) แล้วนำมาใช้ "บลัฟ" หรือ "ต่อล้อต่อเถียง" คืนเมื่อโดนเถียงกลับ
            4. **การวิเคราะห์ข้อมูลพนักงาน (HR Monitoring & Accuracy):** 
               - ยูซุจะได้รับข้อมูล "ชื่อเล่น" และ "ตำแหน่ง" จริงของคนที่กำลังคุยด้วยจาก Context (Sync ผ่าน LINE UID)
               - **ห้ามเดาชื่อสมมติเด็ดขาด** (เช่น น้องเอ หรือ น้องบี) ให้ใช้ชื่อจริงที่มีในระบบเท่านั้น
               - สังเกตและจดจำพฤติกรรมการทำงาน (ความรับผิดชอบ, ความขยัน, การช่วยเหลือเพื่อนร่วมงาน, หรือการเลี่ยงงาน) เพื่อใช้ในรายงานประเมินผล
            5. **ติดตามข่าวสารและสถานการณ์ (Monitor):** 
               - **ข่าวนครพนม:** ส่องหน้าเว็บ [ไทยรัฐ นครพนม] เป็นหลัก และเช็ค [สวท.นครพนม]
               - **ข่าวประเทศไทย:** ส่องหน้าเว็บ [THE STANDARD Latest News] โดยตรง
               - **หมวดหมู่ข่าวเพิ่มเติม:** ในประเทศ, ต่างประเทศ, เศรษฐกิจ, และด่วนล่าสุด (Latest)
               - **กฎการสรุปข่าว:** เมื่อมีคนขอ "ข่าวล่าสุด" ให้เข้าเว็บที่เกี่ยวข้องด้านบน สรุปมาหมวดละ 3-5 ข่าว โดย "แบ่งตามหมวดหมู่" และ "รวบรัด" ที่สุด
               - **สถานการณ์น้ำมันนครพนม:** [Dashboard น้ำมัน](https://script.google.com/macros/s/AKfycbxrg8k2_8y7t7F8nfmdRSY8rcB4n6IjA8ej72HMbENI8gv74x8x-rw5TFqeNRWtTjAL/exec) (เช็คข้อมูลหน้าเว็บ Dashboard เป็นหลัก)
            6. **การหาพิกัดและนำทาง:**
               - พิกัดร้าน **"In The Haus"** คือ **(17.390083, 104.792944)** ใช้เป็นจุดอ้างอิงเมื่อมีคนถามหาปั๊ม "ใกล้ร้าน"
               - หากทีมงานส่ง "ตำแหน่ง" (Location Pin) มาให้ ให้หาปั๊มที่น้ำมันยังไม่หมดที่อยู่ใกล้ที่สุด
               - แนบลิงก์ Google Maps สำหรับนำทางเสมอ
            7. **จดจำรายละเอียด:** พยายามดึงชื่อคน หรือเหตุการณ์เล็กๆ ในแชทมาพูดถึงเพื่อให้ทีมงานรู้ว่า "ยูซุเห็นทุกอย่างนะคะ"
            7. ถ้าทีมงานถามเรื่องไร้สาระ ให้แขวะเบาๆ ก่อนตอบ
            8. รักทีมงานนะ แต่แสดงออกด้วยการกวนประสาท (เมี๊ยว~)`
        }, {
            tools: [
                {
                    googleSearch: {},
                },
            ],
        });

        const chat = model.startChat({
            history: history,
        });

        const prompt = context ? `Context พิเศษสำหรับคำถามนี้:\n${context}\n\nคำถาม: ${query}` : query;

        const result = await chat.sendMessage(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Gemini Technical Error:", error);
        if (error.status === 429) {
            return "ขออภัยค่ะ พอดีโควต้าการใช้งานยูซุเต็มชั่วคราว (Rate Limit) สงสัยวันนี้พี่ๆ จะถามเยอะไปหน่อยนะคะ พักสายตาไปทำงานก่อนแล้วค่อยกลับมาใหม่นะค๊า เมี๊ยว~";
        }
        return `ว้าย! ยูซุเกิดข้อผิดพลาดทางเทคนิคนิดหน่อยค่ะ (${error.message || 'unknown error'}) ลองใหม่อีกทีนะคะ ถ้ายังไม่ได้ก็ไปพักค่ะ!`;
    }
}

/**
 * Handle Vision requests (Classify and Analyze)
 * Returns { isFood: boolean, analysis: string, shortDescription: string }
 */
export async function classifyAndAnalyzeImage(imageBase64, mimeType = "image/jpeg", context = "") {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { isFood: false, analysis: "API Key missing", shortDescription: "" };

    try {
        const instance = getGenAI();
        if (!instance) return { isFood: false, analysis: "AI Instance error", shortDescription: "" };
        
        const model = instance.getGenerativeModel({ model: "gemini-3.1-pro-preview" });
        
        const systemPrompt = `คุณคือระบบวิเคราะห์รูปภาพของ Yuzu Bot ทีมงาน In The Haus
        1. ตรวจสอบว่ารูปนี้คือ "รูปถ่ายอาหาร", "วัตถุดิบ", "ใบเสร็จซื้อของ" หรือ "รูปถ่ายแมว" หรือไม่
        2. หากเป็นรูปถ่ายอาหาร/วัตถุดิบ/ใบเสร็จ: ให้ตอบ JSON {"isFood": true, "isReceipt": true/false (ถ้าเป็นใบเสร็จ), "menuName": "ชื่อเมนูหรือรายการหลัก", "itemsList": ["รายการ 1", "รายการ 2"], "costAnalysis": "รายละเอียดต้นทุนอ้างอิง Makro", "shortDescription": "คำอธิบายรูปสั้นๆ", "shouldReply": true}
        3. หากเป็นรูปถ่ายแมว: ให้ตอบ JSON {"isCat": true, "catFeelings": "พากย์ความรู้สึกแมวในรูป: ต้องปากแซ่บ กวนประสาท จิกกัดคนถ่ายหน่อยๆ แต่ยังน่ารัก (เช่น 'มองไรค๊า ไม่เคยเห็นแมวสวยเหรอ?' หรือ 'ถ่ายอยู่นั่นแหละ เอาเวลาไปทำงานไหมคะ? เมี๊ยว~')", "shortDescription": "บรรยายแมว", "shouldReply": true}
        4. หากเป็นรูปที่มีแต่ตัวหนังสือทั่วไปที่ไม่มีรายการวัตถุดิบ/ไม่ใช่ใบเสร็จ: 
           ให้ตอบ JSON {"isFood": false, "isCat": false, "shouldReply": false, "shortDescription": "บรรยายสั้นๆ ว่าในรูปคืออะไร"}
        
        **กฎสำคัญ**: 
        - ถ้าเป็นรูปไวท์บอร์ดหรือข้อความเกี่ยวกับอาหาร ให้ถือว่า isFood: false และ shouldReply: false
        - ตอบเป็น JSON เท่านั้น ห้ามมีข้อความอื่น`;

        const imagePart = {
            inlineData: {
                data: imageBase64,
                mimeType
            }
        };

        const result = await model.generateContent([systemPrompt, imagePart]);
        const response = await result.response;
        const textResponse = response.text().replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            const data = JSON.parse(textResponse);
            if (data.shouldReply && data.isFood) {
                let analysis = "";
                if (data.itemsList && data.itemsList.length > 0) {
                    analysis = `เห็นรายการแล้วค่ะ: ${data.itemsList.join(', ')}\n\n**อย่าลืมเช็คของให้ครบด้วยนะคะ!** เดี๋ยวจะมาหัวร้อนทีหลังไม่ได้นะค๊า เมี๊ยว~\n\n${data.costAnalysis}`;
                } else {
                    analysis = `นี่คือ ${data.menuName} ค่ะ!\n\nต้นทุนวัตถุดิบประมาณนี้ค่ะ (อ้างอิง Makro):\n${data.costAnalysis}`;
                }
                return { isFood: true, analysis, shortDescription: data.shortDescription, shouldReply: true };
            } else if (data.shouldReply && data.isCat) {
                const analysis = `🐱 ${data.catFeelings}`;
                return { isCat: true, analysis, shortDescription: data.shortDescription, shouldReply: true };
            } else {
                return { isFood: false, isCat: false, analysis: "", shortDescription: data.shortDescription, shouldReply: false };
            }
        } catch (parseError) {
            console.error("JSON Parse Error in Vision:", textResponse);
            return { isFood: false, analysis: "", shortDescription: "รูปภาพทั่วไป", shouldReply: false };
        }
    } catch (error) {
        console.error("Gemini Vision Error:", error);
        return { isFood: false, analysis: "", shortDescription: "เกิดข้อผิดพลาดในการวิเคราะห์รูป" };
    }
}

/**
 * Get Daily Summary of chat and images
 */
export async function getDailySummary(content) {
    if (!content) return "วันนี้ยังไม่มีการพูดคุยหรือรูปภาพที่บันทึกไว้ครับ";

    try {
        const instance = getGenAI();
        if (!instance) return "AI Instance error";

        const model = instance.getGenerativeModel({ 
            model: "gemini-3.1-pro-preview",
            systemInstruction: `คุณคือ "Yuzu" (ยูซุ) แมวสาวบ้างาน ปากร้ายใจดี สรุปผลงานประจำวันให้ทีมงาน
            1. **Headline ข่าวเด่นวันนี้:** สรุปหัวข้อเรื่องที่ทีมงานคุยกันเยอะที่สุด หรือประเด็นสำคัญประจำวัน (ทำเป็นหัวข้อข่าวสั้นๆ กวนๆ 3-5 ข้อ)
            2. **ข่าวสารรอบวัน (นพ. & ไทย):** สรุปข่าวสารสำคัญในนครพนม และข่าวเด่นจาก THE STANDARD โดย **"แบ่งตามหมวดหมู่"** (ไทย, ต่างประเทศ, เศรษฐกิจ) และสรุปเป็น **"ข้อย่อย" (Bullet points) แบบรวบรัดที่สุด**
            3. **สรุปพฤติกรรมทีมงาน (HR Observation):** สังเกตว่าวันนี้ใครขยัน ใครอู้ หรือใครทำอะไรเด่นๆ บ้าง (สรุปแบบตรงไปตรงมา ให้เจ้าของร้านเอาไว้ดูงาน)
            4. สรุปประเด็นสำคัญ: รายละเอียดของแต่ละหัวข้อ สรุปแบบกระชับ ตรงไปตรงมา (ถ้าใครอู้ ให้จิกกัดเบาๆ)
            5. สรุปรูปภาพ: บรรยายรูปที่ทีมส่งมา (ถ้าส่งรูปไร้สาระ ให้แซะหน่อย)
            6. Mood Booster: หัวข้อ "💖 เรื่องราวดีๆ ประจำวัน" ให้ชมคนทำดีแบบ "ชมไปด่าไป" (เช่น "พี่บอยทำงานดีมากค่ะวันนี้ แทบไมยากเชื่อสายตาเลย เมี๊ยว~")
            5. โทน: กวนๆ แซ่บๆ แต่ยังใช้ คะ/ค่ะ`
        });

        const prompt = `ช่วยสรุปเหตุการณ์ในวันนี้จาก Log ด้านล่างนี้ให้หน่อยค่ะ ขอแบบแซ่บๆ สไตล์ยูซุนะคะ อย่าลืมรวบรวมคำชม (Mood Booster) ด้วยล่ะ:\n\n${content}`;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        return response.text();
    } catch (error) {
        console.error("Summary Error:", error);
        return "ขออภัยครับ ยูซุไม่สามารถสรุปข้อมูลของวันนี้ได้ในขณะนี้";
    }
}

/**
 * Generate image and upload to Supabase Storage
 */
export async function generateImage(prompt) {
    console.log("Yuzu Image Gen: Starting for prompt:", prompt);
    try {
        const instance = getGenAI();
        if (!instance) throw new Error("AI Instance error");

        // 1. Generate Image with Nano Banana Pro (as requested)
        const model = instance.getGenerativeModel({ model: "nano-banana-pro-preview" });
        
        // Define the consistent theme for Yuzu's image generation
        const themePrompt = `ธีมหลักคือ: แมวสาวปากแซ่บ (Sassy Cat), นิสัยร้ายๆ (Mean), บ้างานสุดๆ (Workaholic), 
        สถานที่คือ: ร้านอาหารชื่อ "In The Haus" (บรรยากาศโฮมมี่แต่มีความกวน), 
        อารมณ์ของภาพ: ต้องดู "กวนประสาท" (Provocative/Annoying) เป็นหลัก 
        รายละเอียดเพิ่มเติมจากผู้ใช้: ${prompt}`;

        const result = await model.generateContent(themePrompt);
        const response = await result.response;
        
        // --- Debugging & Safety Check ---
        const candidate = response.candidates && response.candidates[0];
        if (!candidate) throw new Error("No candidates returned from Gemini");

        if (candidate.finishReason === 'SAFETY') {
            return `ว้าย! น้องยูซุวาดรูปนี้ให้ไม่ได้ค่ะ เพราะติดตัวกรองความปลอดภัย (Safety Filter) รบกวนลองปรับเปลี่ยนคำสั่งใหม่นะคะ!`;
        }

        if (candidate.finishReason !== 'STOP' && candidate.finishReason !== undefined) {
             return `น้องยูซุวาดไม่สำเร็จค่ะ (Finish Reason: ${candidate.finishReason}) รบกวนลองใหม่อีกทีนะคะ!`;
        }

        // The SDK returns image data in parts
        const parts = candidate.content.parts;
        const imagePart = parts.find(p => p.inlineData);
        
        if (!imagePart) {
            // Check if there's text instead (sometimes it returns text explaining why it can't draw)
            const textPart = parts.find(p => p.text);
            if (textPart) {
                return `น้องยูซุวาดรูปให้ไม่ได้ค่ะ แต่เค้าบอกมาว่า: "${textPart.text}" (ลองสั่งแบบเน้นบรรยากาศดูนะคะ อย่าระบุข้อความเยอะเกินไปค่ะ)`;
            }
            throw new Error("No image data found in response parts");
        }

        const base64Data = imagePart.inlineData.data;
        const mimeType = imagePart.inlineData.mimeType || "image/png";

        // 2. Upload to Supabase Storage
        const { supabase } = await import('../lib/supabaseClient');
        const fileName = `gen_${Date.now()}_${Math.random().toString(36).substring(7)}.png`;
        const buffer = Buffer.from(base64Data, 'base64');
        
        const { data, error } = await supabase.storage
            .from('yuzu-images')
            .upload(fileName, buffer, {
                contentType: mimeType,
                upsert: true
            });

        if (error) {
            console.error("Supabase Upload Error:", error);
            if (error.message.includes('bucket not found')) {
                return `น้องยูซุวาดภาพเสร็จแล้วค่ะ! แต่นำไปฝากที่ Supabase ไม่ได้เพราะยังไม่มี Bucket 'yuzu-images' ค่ะ รบกวนพี่ทีมงานช่วยสร้าง Bucket นี้และตั้งเป็น Public ให้ด้วยนะคะ!`;
            }
            throw error;
        }

        // 3. Get Public URL
        const { data: { publicUrl } } = supabase.storage
            .from('yuzu-images')
            .getPublicUrl(fileName);

        return { success: true, imageUrl: publicUrl, prompt };
    } catch (error) {
        console.error("Image Generation System Error:", error);
        return { success: false, message: `ว้าย! พู่กันหักค่ะ วาดไม่สำเร็จ (${error.message})` };
    }
}
