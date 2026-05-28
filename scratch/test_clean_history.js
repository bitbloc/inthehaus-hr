import { cleanHistoryForGemini } from '../utils/gemini.js';

function runTests() {
  console.log("=== Running cleanHistoryForGemini Tests ===");

  // Test Case 1: Empty history
  console.log("Test Case 1: Empty history");
  const t1 = cleanHistoryForGemini([]);
  console.assert(JSON.stringify(t1) === "[]", `t1 failed: ${JSON.stringify(t1)}`);

  // Test Case 2: Starts with model, alternates, ends with model
  console.log("Test Case 2: Starts with model");
  const t2 = cleanHistoryForGemini([
    { role: 'model', content: 'hello model' },
    { role: 'user', content: 'hello user' },
    { role: 'model', content: 'model reply' }
  ]);
  console.assert(JSON.stringify(t2) === JSON.stringify([
    { role: 'user', parts: [{ text: 'hello user' }] },
    { role: 'model', parts: [{ text: 'model reply' }] }
  ]), `t2 failed: ${JSON.stringify(t2)}`);

  // Test Case 3: Ends with user
  console.log("Test Case 3: Ends with user");
  const t3 = cleanHistoryForGemini([
    { role: 'user', content: 'user 1' },
    { role: 'model', content: 'model 1' },
    { role: 'user', content: 'user 2' }
  ]);
  console.assert(JSON.stringify(t3) === JSON.stringify([
    { role: 'user', parts: [{ text: 'user 1' }] },
    { role: 'model', parts: [{ text: 'model 1' }] }
  ]), `t3 failed: ${JSON.stringify(t3)}`);

  // Test Case 4: Consecutive duplicate roles (user -> user)
  console.log("Test Case 4: Consecutive user messages");
  const t4 = cleanHistoryForGemini([
    { role: 'user', content: 'user 1' },
    { role: 'user', content: 'user 2' },
    { role: 'model', content: 'model 1' }
  ]);
  console.assert(JSON.stringify(t4) === JSON.stringify([
    { role: 'user', parts: [{ text: 'user 1\nuser 2' }] },
    { role: 'model', parts: [{ text: 'model 1' }] }
  ]), `t4 failed: ${JSON.stringify(t4)}`);

  // Test Case 5: Consecutive duplicate roles (model -> model)
  console.log("Test Case 5: Consecutive model messages");
  const t5 = cleanHistoryForGemini([
    { role: 'user', content: 'user 1' },
    { role: 'model', content: 'model 1' },
    { role: 'model', content: 'model 2' }
  ]);
  console.assert(JSON.stringify(t5) === JSON.stringify([
    { role: 'user', parts: [{ text: 'user 1' }] },
    { role: 'model', parts: [{ text: 'model 1\nmodel 2' }] }
  ]), `t5 failed: ${JSON.stringify(t5)}`);

  // Test Case 6: Mixed and messy roles
  console.log("Test Case 6: Mixed and messy roles");
  const t6 = cleanHistoryForGemini([
    { role: 'model', content: 'model 0' },
    { role: 'user', content: 'user 1' },
    { role: 'user', content: 'user 2' },
    { role: 'model', content: 'model 1' },
    { role: 'model', content: 'model 2' },
    { role: 'user', content: 'user 3' }
  ]);
  console.assert(JSON.stringify(t6) === JSON.stringify([
    { role: 'user', parts: [{ text: 'user 1\nuser 2' }] },
    { role: 'model', parts: [{ text: 'model 1\nmodel 2' }] }
  ]), `t6 failed: ${JSON.stringify(t6)}`);

  console.log("All tests passed successfully!");
}

runTests();
