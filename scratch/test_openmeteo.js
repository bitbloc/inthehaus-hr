const lat = 17.39009845004315;
const lon = 104.7929558480443;
const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&past_days=1&timezone=Asia/Bangkok`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log("Index 0 time:", data.hourly.time[0]);
    console.log("Index 24 time:", data.hourly.time[24]);
    console.log("Index 48 time:", data.hourly.time[48]);
    console.log("Timezone:", data.timezone);
    console.log("UTC Offset Seconds:", data.utc_offset_seconds);
  })
  .catch(console.error);
