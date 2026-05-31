async function testStatusPage() {
    try {
        console.log("Fetching status page...");
        const res = await fetch('https://status.d420.de/');
        console.log("Status:", res.status);
        if (res.ok) {
            const html = await res.text();
            console.log("Length:", html.length);
            // Search for links containing nitter or active instances
            // Usually listed under table rows or lists
            const regex = /https?:\/\/[a-zA-Z0-9.-]+\/thestandardth\/rss/g;
            // Let's print out what instances are in the page
            const matches = html.match(/href="https?:\/\/([^"/]+)"/g);
            if (matches) {
                console.log("Found matches:", matches.slice(0, 20));
            }
        }
    } catch (e) {
        console.error(e);
    }
}

testStatusPage();
