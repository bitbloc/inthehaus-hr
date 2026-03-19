/**
 * News Fetcher Utility for THE STANDARD
 */

export async function getAccurateNews(categories = ['nakhon-phanom', 'thailand', 'world', 'business']) {
    console.log("Yuzu News Fetcher: Starting for categories:", categories);
    try {
        const results = await Promise.all(categories.map(async (cat) => {
            let url = "";
            if (cat === 'nakhon-phanom') {
                url = `https://www.thairath.co.th/tags/%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9E%E0%B8%99%E0%B8%A1`;
            } else {
                url = `https://thestandard.co/category/news/${cat}/`;
            }

            try {
                const response = await fetch(url);
                const html = await response.text();
                const titles = [];

                // Regex for THE STANDARD (h3/h2) and Thairath (typically h2 or h3 in specific layouts)
                // Thairath often uses h2 for tag headlines
                const regex = /<h3[^>]*>(.*?)<\/h3>|<h2[^>]*>(.*?)<\/h2>/g;
                let match;
                while ((match = regex.exec(html)) !== null && titles.length < 5) {
                    let titleText = (match[1] || match[2]).replace(/<[^>]*>?/gm, '').trim();
                    if (titleText && titleText.length > 15 && !titles.includes(titleText)) {
                        const noise = ["EDITOR'S PICK", "MOST POPULAR", "THE STANDARD", "THAIRATH", "Latest News", "RELATED STORIES"];
                        if (!noise.some(n => titleText.toUpperCase().includes(n))) {
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
                case 'thailand': catName = 'ไทย (THE STANDARD)'; break;
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
