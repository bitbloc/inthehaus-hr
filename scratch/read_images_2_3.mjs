
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const files = [
    "C:/Users/Ritha/.gemini/antigravity/brain/0aa7a9fd-414c-4943-9a29-bf52eb287021/media__1776012538850.png",
    "C:/Users/Ritha/.gemini/antigravity/brain/0aa7a9fd-414c-4943-9a29-bf52eb287021/media__1776012538890.png"
  ];
  
  for (const f of files) {
      if (!fs.existsSync(f)) continue;
      const imagePart = {
          inlineData: { data: fs.readFileSync(f).toString("base64"), mimeType: "image/png" }
      };
      console.log("Analyzing", f);
      const result = await model.generateContent(["What text or action is shown here?", imagePart]);
      console.log(result.response.text());
  }
}
run();
