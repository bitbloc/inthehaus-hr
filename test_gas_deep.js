
async function testFetchGasDeep() {
  const url = 'https://script.google.com/macros/s/AKfycbxrg8k2_8y7t7F8nfmdRSY8rcB4n6IjA8ej72HMbENI8gv74x8x-rw5TFqeNRWtTjAL/exec';
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    console.log('Status:', res.status);
    console.log('Length:', text.length);
    // Search for keywords in the whole response
    const keywords = ['ปกติ', 'หมด', 'ท่าควาย', 'ก้องตะวัน'];
    keywords.forEach(kw => {
        console.log(`Contains "${kw}":`, text.includes(kw));
    });
  } catch (e) {
    console.error('Error:', e.message);
  }
}
testFetchGasDeep();
