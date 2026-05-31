async function testSyndication() {
    const url = 'https://syndication.twitter.com/srv/timeline-profile/screen-name/thestandardth';
    try {
        console.log("Fetching Twitter Syndication for @thestandardth...");
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.5'
            }
        });
        console.log("Status:", res.status);
        if (res.ok) {
            const html = await res.text();
            console.log("Length:", html.length);
            // Write a snippet of the HTML to inspect
            console.log("Snippet:", html.slice(0, 1000));
            // Let's search for json or script tags containing tweet data
            const scriptMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
            if (scriptMatch) {
                console.log("Found __NEXT_DATA__ script!");
                const json = JSON.parse(scriptMatch[1]);
                console.log("JSON Keys:", Object.keys(json));
                console.log("JSON Props:", JSON.stringify(json.props).slice(0, 1000));
            } else {
                console.log("No __NEXT_DATA__ found, checking other scripts...");
                const dataMatch = html.match(/<script id="data" type="application\/json">(.*?)<\/script>/s);
                if (dataMatch) {
                    console.log("Found data script!");
                    const json = JSON.parse(dataMatch[1]);
                    console.log("JSON data keys:", Object.keys(json));
                }
            }
        }
    } catch (e) {
        console.error("Error:", e);
    }
}

testSyndication();
