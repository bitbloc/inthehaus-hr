
async function saveGasHtml() {
  const url = 'https://script.google.com/macros/s/AKfycbxrg8k2_8y7t7F8nfmdRSY8rcB4n6IjA8ej72HMbENI8gv74x8x-rw5TFqeNRWtTjAL/exec';
  try {
    const res = await fetch(url, { redirect: 'follow' });
    const text = await res.text();
    require('fs').writeFileSync('gas_source_utf8.txt', text, 'utf8');
    console.log('Saved 15k bytes to gas_source_utf8.txt');
  } catch (e) {
    console.error('Error:', e.message);
  }
}
saveGasHtml();
