async function test() {
    const { getSchemaWeather, formatWeatherFlex, formatWeatherMessage } = await import('../utils/weather.js');
    console.log("Fetching weather...");
    const weather = await getSchemaWeather();
    if (!weather) {
        console.error("Failed to get weather data.");
        return;
    }
    console.log("Weather Data successfully retrieved:\n", JSON.stringify(weather, null, 2));
    
    console.log("\nTesting Text Weather Message:\n", formatWeatherMessage(weather));
    
    console.log("\nTesting Flex Weather Message:\n", JSON.stringify(formatWeatherFlex(weather), null, 2));
}

test().catch(console.error);
