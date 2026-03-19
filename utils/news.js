/**
 * News Fetcher Utility for THE STANDARD
 */

export async function getAccurateNews(categories = ['nakhon-phanom', 'latest', 'thailand', 'world', 'business']) {
    console.log("Yuzu News Fetcher: Starting for categories:", categories);
    
    // Use a real-looking User-Agent to avoid WAF blocks
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,th;q=0.8'
    };

    try {
        const results = await Promise.all(categories.map(async (cat) => {
            let url = "";
            if (cat === 'nakhon-phanom') {
                url = `https://www.thairath.co.th/tags/%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9E%E0%B8%99%E0%B8%A1`;
            } else if (cat === 'latest') {
                url = `https://thestandard.co/latest/`;
            } else {
                url = `https://thestandard.co/category/news/${cat}/`;
            }

            try {
                const response = await fetch(url, { headers });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text();
                const titles = [];

                // Specific regex for THE STANDARD: <h3 class="news-title">...<a ...>Headline</a>...</h3>
                // We use 's' flag for dot-all to handle internal newlines
                const regex = /<h3 class="news-title">.*?<a[^>]*>(.*?)<\/a>.*?<\/h3>|<h2 class="news-title">.*?<a[^>]*>(.*?)<\/a>.*?<\/h2>/gs;
                let match;
                while ((match = regex.exec(html)) !== null && titles.length < 5) {
                    let titleText = (match[1] || match[2]).replace(/<[^>]*>?/gm, '').trim();
                    if (titleText && titleText.length > 20 && !titles.includes(titleText)) {
                        const noise = ["EDITOR'S PICK", "MOST POPULAR", "THE STANDARD", "Latest News", "RELATED STORIES"];
                        if (!noise.some(n => titleText.toUpperCase().includes(n))) {
                            titles.push(titleText);
                        }
                    }
                }
                
                // Fallback for Thairath or different layouts
                if (titles.length === 0) {
                    const fallbackRegex = /<h3[^>]*>(.*?)<\/h3>|<h2[^>]*>(.*?)<\/h2>/g;
                    while ((match = fallbackRegex.exec(html)) !== null && titles.length < 5) {
                        let titleText = (match[1] || match[2]).replace(/<[^>]*>?/gm, '').trim();
                        if (titleText && titleText.length > 20 && !titles.includes(titleText)) {
                            titles.push(titleText);
                        }
                    }
                }

                return { category: cat, headlines: titles };
            } catch (err) {
                console.error(`Error fetching news for ${cat}:`, err);
                return { category: cat, headlines: [], error: true };
            }
        }));

        let context = "\n[ข่าวล่าสุดจากหน้าเว็บ (Real-time Headlines)]\n";
        results.forEach(res => {
            let catName = "";
            switch(res.category) {
                case 'nakhon-phanom': catName = 'นครพนม (ไทยรัฐ)'; break;
                case 'latest': catName = 'ด่วนล่าสุด (THE STANDARD)'; break;
                case 'thailand': catName = 'ในประเทศ (THE STANDARD)'; break;
                case 'world': catName = 'ต่างประเทศ (THE STANDARD)'; break;
                case 'business': catName = 'เศรษฐกิจ (THE STANDARD)'; break;
                default: catName = res.category;
            }
            context += `🚨 หมวดหมู่ ${catName}:\n`;
            if (res.headlines.length > 0) {
                res.headlines.forEach((h, i) => {
                    context += `${i + 1}. ${h}\n`;
                });
            } else {
                context += "- (ไม่พบข่าวล่าสุดในหน้าเว็บนี้)\n";
            }
        });

        return context;
    } catch (globalErr) {
        console.error("Global News Fetcher Error:", globalErr);
        return "\n[ข่าวล่าสุดจากหน้าเว็บ] ขออภัยค่ะ ตอนนี้ยูซุส่องข่าวหน้าเว็บไม่ได้ชั่วคราวค่ะ\n";
    }
}
