
async function saveGasHtml() {
  const url = 'https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec';
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
