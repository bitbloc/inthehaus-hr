async function testTwiiit() {
    try {
        console.log("Fetching from twiiit.com...");
        const res = await fetch('https://twiiit.com/thestandardth/rss', {
            redirect: 'follow',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        console.log("Status:", res.status);
        console.log("Redirected URL:", res.url);
        if (res.ok) {
            const html = await res.text();
            console.log("Fetched length:", html.length);
            console.log("Snippet:", html.slice(0, 500));
        }
    } catch (e) {
        console.error("Failed:", e.message);
    }
}

testTwiiit();
