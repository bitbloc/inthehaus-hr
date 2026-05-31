async function testParse() {
    const url = 'https://nitter.poast.org/thestandardth/rss';
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        if (res.ok) {
            const html = await res.text();
            const items = html.split(/<item>/);
            console.log("Found items:", items.length - 1);
            
            // Print the first 5 items
            for (let i = 1; i <= Math.min(5, items.length - 1); i++) {
                const block = items[i];
                const titleMatch = block.match(/<title>(.*?)<\/title>/s);
                const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/s);
                const descMatch = block.match(/<description>(.*?)<\/description>/s);
                const dcCreatorMatch = block.match(/<dc:creator>(.*?)<\/dc:creator>/s);
                const linkMatch = block.match(/<link>(.*?)<\/link>/s);

                console.log(`\n--- Item ${i} ---`);
                console.log("Title:", titleMatch ? titleMatch[1].trim() : "N/A");
                console.log("PubDate:", pubDateMatch ? pubDateMatch[1].trim() : "N/A");
                console.log("Creator:", dcCreatorMatch ? dcCreatorMatch[1].trim() : "N/A");
                console.log("Link:", linkMatch ? linkMatch[1].trim() : "N/A");
                
                let desc = descMatch ? descMatch[1].trim() : "N/A";
                // decode html entities
                desc = desc.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
                // strip html tags
                desc = desc.replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
                console.log("Clean Description (first 200 chars):", desc.slice(0, 200));
            }
        }
    } catch (e) {
        console.error(e);
    }
}

testParse();
