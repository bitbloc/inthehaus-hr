import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { getGenAI } from '../utils/gemini-client.js';

async function testModel(modelName) {
  const instance = getGenAI();
  if (!instance) {
    console.error("No instance");
    return;
  }
  const model = instance.getGenerativeModel({ model: modelName });
  const prompt = `Hello, reply with "pong" only.`;
  console.time(modelName);
  try {
    const result = await model.generateContent(prompt);
    const text = result.response.text();
    console.timeEnd(modelName);
    console.log(`${modelName} response:`, text.trim());
  } catch (err) {
    console.timeEnd(modelName);
    console.error(`${modelName} error:`, err.message);
  }
}

async function run() {
  await testModel("gemini-1.5-flash");
  await testModel("gemini-2.5-flash");
  await testModel("gemini-3.5-flash");
}
run();
