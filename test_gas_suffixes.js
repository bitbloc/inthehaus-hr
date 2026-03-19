
async function testFetchGasSuffixes() {
  const url = 'https://script.google.com/macros/s/AKfycbxrg8k2_8y7t7F8nfmdRSY8rcB4n6IjA8ej72HMbENI8gv74x8x-rw5TFqeNRWtTjAL/exec?json=true';
  try {
    const response = await fetch(url);
    const text = await response.text();
    console.log('Response with ?json=true:', text.substring(0, 500));
  } catch (e) {
    console.error('Fetch Error:', e.message);
  }
}

testFetchGasSuffixes();
