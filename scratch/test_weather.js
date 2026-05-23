const API_KEY = 'HHgiMMzP47XhYsmXzWHaFQxHeaBuoMSw';
const lat = 17.390110564180162;
const lon = 104.79292673153263;

async function test() {
    const url = `https://api.tomorrow.io/v4/weather/forecast?location=${lat},${lon}&apikey=${API_KEY}`;
    const res = await fetch(url);
    const data = await res.json();
    console.log("Daily timeline keys:", Object.keys(data.timelines?.daily?.[0]?.values || {}));
    console.log("Daily values sample:", JSON.stringify(data.timelines?.daily?.[0]?.values, null, 2));
}

test();
