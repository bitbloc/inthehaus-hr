const lat = 17.39009845004315;
const lon = 104.7929558480443;

async function printHourly() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&past_days=1&timezone=Asia/Bangkok`;
  const res = await fetch(url);
  const data = await res.json();
  
  const precToday = data.hourly.precipitation.slice(24, 48);
  const probToday = data.hourly.precipitation_probability.slice(24, 48);
  const codeToday = data.hourly.weather_code.slice(24, 48);
  const timesToday = data.hourly.time.slice(24, 48);
  
  for (let i = 0; i < 24; i++) {
    console.log(`Hour ${i.toString().padStart(2, '0')}:00 | code: ${codeToday[i]} | prob: ${probToday[i]}% | prec: ${precToday[i]}mm`);
  }
}

printHourly();
