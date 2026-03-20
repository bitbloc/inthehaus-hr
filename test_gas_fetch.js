
async function testFetchGas() {
  const url = 'https://script.google.com/macros/s/AKfycbyC8vSspmwSUc83QJpdaADrkr3b-mtI2d6qt7QAF2eP8IogWFKe1lXpfLCxEoK6tENVsQ/exec';
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
