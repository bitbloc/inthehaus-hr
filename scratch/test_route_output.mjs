import { GET } from '../app/api/weather/route.js';

async function testGET() {
  const req = {
    url: 'http://localhost:3000/api/weather?lat=17.39009845004315&lon=104.7929558480443'
  };
  
  console.log("Calling GET route directly...");
  const response = await GET(req);
  const data = await response.json();
  console.log("Status:", response.status);
  console.log("Data:", JSON.stringify(data, null, 2));
}

testGET().catch(console.error);
