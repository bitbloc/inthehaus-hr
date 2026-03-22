/**
 * News Fetcher Utility for THE STANDARD
 */

export async function getAccurateNews(categories = ['nakhon-phanom', 'nakhon-phanom-matichon', 'nakhon-phanom-pptv', 'latest', 'thailand', 'world', 'business']) {
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
                url = `https://www.thairath.co.th/tags/%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9E%E0%B8%99%E0%B8%A1?t=${Date.now()}`;
            } else if (cat === 'nakhon-phanom-matichon') {
                url = `https://www.matichon.co.th/tag/%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9E%E0%B8%99%E0%B8%A1/feed?t=${Date.now()}`;
            } else if (cat === 'nakhon-phanom-pptv') {
                url = `https://www.pptvhd36.com/tags/%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9E%E0%B8%99%E0%B8%A1?t=${Date.now()}`;
            } else if (cat === 'latest') {
                url = `https://thestandard.co/latest/?t=${Date.now()}`;
            } else {
                url = `https://thestandard.co/category/news/${cat}/?t=${Date.now()}`;
            }

            try {
                const response = await fetch(url, { headers });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text();
                const titles = [];

                if (url.includes('thairath.co.th')) {
                    // Extract directly from Thairath Next.js State
                    const matchNext = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
                    if (matchNext) {
                        try {
                            const data = JSON.parse(matchNext[1]);
                            function findTitles(obj) {
                                let results = [];
                                if (typeof obj === 'object' && obj !== null) {
                                    for (let k in obj) {
                                        if (k === 'title' && typeof obj[k] === 'string' && obj[k].length > 20) {
                                            results.push(obj[k]);
                                        }
                                        results = results.concat(findTitles(obj[k]));
                                    }
                                } else if (Array.isArray(obj)) {
                                    for (let v of obj) {
                                        results = results.concat(findTitles(v));
                                    }
                                }
                                return results;
                            }
                            const allFound = findTitles(data.props?.initialState || data);
                            const noiseTexts = ["บทความและข่าว", "ไทยรัฐออนไลน์", "รวมข่าว", "รูปภาพ", "คลังภาพ", "วิดีโอ", "ติดต่อโฆษณา", "การเมือง", "กีฬา", "บันเทิง", "สังคม", "เศรษฐกิจ", "ต่างประเทศ", "ไลฟ์สไตล์", "ดวง", "หวย", "ยานยนต์", "เทคโนโลยี", "คลิป", "ดูคลิปทั้งหมด"];
                            const uniqueItems = [...new Set(allFound)];
                            for (const titleText of uniqueItems) {
                                if (titles.length >= 5) break;
                                if (!noiseTexts.some(n => titleText.includes(n))) {
                                    titles.push(titleText.replace(/&quot;/g, '"').trim());
                                }
                            }
                        } catch(e) { console.error("JSON Parse Error:", e); }
                    }

                    // Fallback to Thairath regex if JSON extraction fails
                    if (titles.length === 0) {
                        const fallbackRegex = /<h3[^>]*>(.*?)<\/h3>|<h2[^>]*>(.*?)<\/h2>/gs;
                        let match;
                        while ((match = fallbackRegex.exec(html)) !== null && titles.length < 5) {
                            let titleText = (match[1] || match[2]).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
                            if (titleText && titleText.length > 20 && !titles.includes(titleText)) {
                                titles.push(titleText);
                            }
                        }
                    }
                } else if (url.includes('matichon.co.th')) {
                    // Extract from Matichon RSS Feed
                    const regex = /<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/gs;
                    let match;
                    while ((match = regex.exec(html)) !== null && titles.length < 5) {
                        let titleText = (match[1] || match[2]).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').replace(/&#8211;/g, '-').trim();
                        if (titleText.length > 20 && !titles.includes(titleText) && !titleText.includes('Matichon') && !titleText.includes('มติชนออนไลน์')) {
                            titles.push(titleText);
                        }
                    }
                } else if (url.includes('pptvhd36.com')) {
                    // Extract from PPTV
                    const regex = /<h[234][^>]*>(.*?)<\/h[234]>/gs;
                    let match;
                    while ((match = regex.exec(html)) !== null && titles.length < 5) {
                        let titleText = (match[1] || match[2] || match[0]).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').replace(/&quot;/g, '"').replace(/&#8211;/g, '-').trim();
                        if (titleText.length > 20 && !titles.includes(titleText) && !titleText.includes('ข่าวที่เกี่ยวข้องกับ')) {
                            titles.push(titleText);
                        }
                    }
                } else {
                    // Extract THE STANDARD (and others)
                    const regex = /<h3 class="news-title">.*?<a[^>]*>(.*?)<\/a>.*?<\/h3>|<h2 class="news-title">.*?<a[^>]*>(.*?)<\/a>.*?<\/h2>/gs;
                    let match;
                    while ((match = regex.exec(html)) !== null && titles.length < 5) {
                        let titleText = (match[1] || match[2]).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
                        if (titleText && titleText.length > 20 && !titles.includes(titleText)) {
                            const noise = ["EDITOR'S PICK", "MOST POPULAR", "THE STANDARD", "Latest News", "RELATED STORIES"];
                            if (!noise.some(n => titleText.toUpperCase().includes(n))) {
                                titles.push(titleText);
                            }
                        }
                    }
                    
                    // Fallback for different layouts
                    if (titles.length === 0) {
                        const fallbackRegex = /<h3[^>]*>(.*?)<\/h3>|<h2[^>]*>(.*?)<\/h2>/gs;
                        while ((match = fallbackRegex.exec(html)) !== null && titles.length < 5) {
                            let titleText = (match[1] || match[2]).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').trim();
                            if (titleText && titleText.length > 20 && !titles.includes(titleText)) {
                                titles.push(titleText);
                            }
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
                case 'nakhon-phanom': catName = 'นครพนม (ไทยรัฐออนไลน์)'; break;
                case 'nakhon-phanom-matichon': catName = 'นครพนม (มติชนออนไลน์)'; break;
                case 'nakhon-phanom-pptv': catName = 'นครพนม (PPTVHD36)'; break;
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
                if (res.category === 'nakhon-phanom') {
                    context += "- (สแกนข่าวหน้าเว็บไม่พบคะ โปรดส่องกลุ่ม [นครพนม Nakhonphanom Talk of the Town] หรือเพจ [สวท.นครพนม] แทนนะคะ)\n";
                } else {
                    context += "- (ไม่พบข่าวล่าสุดในหน้าเว็บนี้)\n";
                }
            }
        });

        return context;
    } catch (globalErr) {
        console.error("Global News Fetcher Error:", globalErr);
        return "\n[ข่าวล่าสุดจากหน้าเว็บ] ขออภัยค่ะ ตอนนี้ยูซุส่องข่าวหน้าเว็บไม่ได้ชั่วคราวค่ะ\n";
    }
}
