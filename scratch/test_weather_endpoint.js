const lat = 17.39009845004315;
const lon = 104.7929558480443;

async function testWeather() {
  const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&hourly=temperature_2m,precipitation_probability,precipitation,weather_code&past_days=1&timezone=Asia/Bangkok`;

  const res = await fetch(url);
  const data = await res.json();
  const current = data.current;

  // Hourly indexes 0..23 is yesterday, 24..47 is today
  const tempYesterday = data.hourly.temperature_2m.slice(0, 24);
  const tempToday = data.hourly.temperature_2m.slice(24, 48);
  
  const avgTempYesterday = tempYesterday.reduce((a, b) => a + b, 0) / 24;
  const avgTempToday = tempToday.reduce((a, b) => a + b, 0) / 24;
  
  const tempDiff = avgTempToday - avgTempYesterday;
  let tempComparisonStatus = 'similar';
  let tempDiffText = 'ใกล้เคียงกับเมื่อวาน';
  
  if (tempDiff > 0.5) {
    tempComparisonStatus = 'hotter';
    tempDiffText = `ร้อนกว่าเมื่อวานประมาณ ${tempDiff.toFixed(1)}°C`;
  } else if (tempDiff < -0.5) {
    tempComparisonStatus = 'colder';
    tempDiffText = `เย็นกว่าเมื่อวานประมาณ ${Math.abs(tempDiff).toFixed(1)}°C`;
  }

  // Rain checks for today (indices 24..47)
  const precToday = data.hourly.precipitation.slice(24, 48);
  const probToday = data.hourly.precipitation_probability.slice(24, 48);
  
  const rainyHours = [];
  for (let i = 0; i < 24; i++) {
    const isRaining = precToday[i] > 0.1 || probToday[i] >= 30;
    if (isRaining) {
      rainyHours.push(i);
    }
  }

  // Group contiguous hours
  const blocks = [];
  if (rainyHours.length > 0) {
    let start = rainyHours[0];
    let prev = rainyHours[0];
    for (let i = 1; i < rainyHours.length; i++) {
      const curr = rainyHours[i];
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

  const rainBlocksText = blocks.map(b => {
    const startStr = b.start.toString().padStart(2, '0') + ':00';
    const endStr = (b.end + 1).toString().padStart(2, '0') + ':00';
    return `${startStr} - ${endStr} น.`;
  });

  const hasRain = rainBlocksText.length > 0;

  // Build employee advice
  let advice = '';
  if (hasRain) {
    const times = rainBlocksText.join(' และ ');
    advice += `วันนี้คาดว่าจะมีฝนตกช่วง ${times} อย่าลืมพกร่ม/เสื้อกันฝนด้วยนะ 🌧️`;
    if (tempComparisonStatus === 'hotter') {
      advice += ` แถมอากาศก็ร้อนอบอ้าวขึ้นด้วย ระวังอับชื้นและดูแลสุขภาพด้วยครับ`;
    } else if (tempComparisonStatus === 'colder') {
      advice += ` อากาศจะเย็นลงและมีความชื้นสูง รักษาสุขภาพกันด้วยนะ`;
    } else {
      advice += ` ดูแลตัวเองดีๆ ด้วยความห่วงใยจาก Yuzu ครับ`;
    }
  } else {
    advice += `วันนี้ไม่มีฝนตก ท้องฟ้าแจ่มใส ☀️`;
    if (tempComparisonStatus === 'hotter') {
      advice += ` แต่อากาศร้อนกว่าเมื่อวาน หลีกเลี่ยงแดดจัดและดื่มน้ำบ่อยๆ นะครับ`;
    } else if (tempComparisonStatus === 'colder') {
      advice += ` อากาศเย็นกว่าเมื่อวานนิดหน่อย สบายตัวเลยล่ะ ทำงานอย่างมีความสุขนะ!`;
    } else {
      advice += ` อากาศและอุณหภูมิใกล้เคียงกับเมื่อวานเลย กำลังดีครับ`;
    }
  }

  console.log("Result:", {
    tempDiff,
    tempComparisonStatus,
    tempDiffText,
    rainBlocksText,
    hasRain,
    advice
  });
}

testWeather();
