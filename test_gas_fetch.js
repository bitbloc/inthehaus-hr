
async function testFetchGas() {
  const url = 'https://script.google.com/macros/s/AKfycbxrg8k2_8y7t7F8nfmdRSY8rcB4n6IjA8ej72HMbENI8gv74x8x-rw5TFqeNRWtTjAL/exec';
  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log('Response status:', response.status);
    console.log('Response Sample (first 1000 chars):', text.substring(0, 1000));
  } catch (e) {
    console.error('Fetch Error:', e.message);
  }
}

testFetchGas();
