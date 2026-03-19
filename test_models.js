
const { GoogleGenerativeAI } = require('@google/generative-ai');
const dotenv = require('dotenv');
dotenv.config({ path: '.env.local' });

async function listModels() {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  // Unfortunately, the @google/generative-ai Node SDK doesn't have a direct listModels() yet.
  // One must use the REST API or GCloud.
  // But wait, it might be in the latest version or we can just try common names.
  
  const modelsToTry = [
    'gemini-1.5-pro',
    'gemini-1.5-pro-latest',
    'gemini-1.5-pro-002',
    'gemini-2.0-flash',
    'gemini-2.0-pro-exp-02-05'
  ];

  for (const modelName of modelsToTry) {
    try {
      const model = genAI.getGenerativeModel({ model: modelName });
      const result = await model.generateContent("hello");
      console.log(`✅ Model ${modelName} is AVAILABLE`);
    } catch (e) {
      console.log(`❌ Model ${modelName} returned error: ${e.message}`);
    }
  }
}

listModels();
