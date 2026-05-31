async function testInstances() {
    const instances = [
        'https://nitter.poast.org',
        'https://nitter.woodland.cafe',
        'https://nitter.privacydev.net',
        'https://nitter.drgns.space',
        'https://nitter.inpt.no',
        'https://nitter.tiekoetter.com',
        'https://nitter.no-logs.com',
        'https://nitter.soopy.moe',
        'https://nitter.da2c.de'
    ];

    for (const inst of instances) {
        try {
            const url = `${inst}/thestandardth/rss`;
            console.log("Fetching from:", url);
            const res = await fetch(url, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            console.log("Status for", inst, ":", res.status);
            if (res.ok) {
                const text = await res.text();
                if (text.includes('<rss') || text.includes('<channel>')) {
                    console.log("🟢 Success! Uptime verified for", inst, "Length:", text.length);
                    // Let's print the first item
                    const items = text.split('<item>');
                    if (items.length > 1) {
                        console.log("First item:", items[1].slice(0, 300));
                    }
                } else {
                    console.log("🔴 Returned non-RSS content for", inst);
                }
            }
        } catch (e) {
            console.log("🔴 Error for", inst, ":", e.message);
        }
    }
}

testInstances();
