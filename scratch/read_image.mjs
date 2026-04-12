
import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs';
import path from 'path';

async function run() {
  const apiKey = process.env.GEMINI_API_KEY;
  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

  const imagePath = "C:/Users/Ritha/.gemini/antigravity/brain/0aa7a9fd-414c-4943-9a29-bf52eb287021/media__1776012538812.png";
  if (!fs.existsSync(imagePath)) {
      console.log("Image not found");
      return;
  }
  const mimeType = "image/png";
  const imagePart = {
      inlineData: {
          data: fs.readFileSync(imagePath).toString("base64"),
          mimeType
      }
  };

  const result = await model.generateContent(["Describe everything you see in this screenshot related to the stock audit or Line Chat", imagePart]);
  console.log(result.response.text());
}
run();
