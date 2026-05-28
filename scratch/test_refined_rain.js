const lat = 17.39009845004315;
const lon = 104.7929558480443;

async function testRefinedRain() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&past_days=1&timezone=Asia/Bangkok`;
  const res = await fetch(url);
  const data = await res.json();
  
  const precToday = data.hourly.precipitation.slice(24, 48);
  const probToday = data.hourly.precipitation_probability.slice(24, 48);
  
  const heavyRainHours = [];
  const lightRainHours = [];
  
  for (let i = 0; i < 24; i++) {
    const isHeavy = precToday[i] >= 0.5;
    const isLight = !isHeavy && (precToday[i] > 0.1 || probToday[i] >= 40);
    
    if (isHeavy) {
      heavyRainHours.push(i);
    } else if (isLight) {
      lightRainHours.push(i);
    }
  }
  
  const groupHours = (hours) => {
    const blocks = [];
    if (hours.length > 0) {
      let start = hours[0];
      let prev = hours[0];
      for (let i = 1; i < hours.length; i++) {
        const curr = hours[i];
        if (curr === prev + 1) {
          prev = curr;
        } else {
          blocks.push({ start, end: prev });
          start = curr;
          prev = curr;
        }
      }
      blocks.push({ start, end: prev });
    }
    return blocks.map(b => {
      const startStr = b.start.toString().padStart(2, '0') + ':00';
      const endStr = (b.end + 1).toString().padStart(2, '0') + ':00';
      return `${startStr} - ${endStr} น.`;
    });
  };

  const heavyBlocks = groupHours(heavyRainHours);
  const lightBlocks = groupHours(lightRainHours);
  
  console.log("Heavy blocks:", heavyBlocks);
  console.log("Light blocks:", lightBlocks);
}

testRefinedRain();
