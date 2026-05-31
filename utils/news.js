/**
 * News Fetcher Utility for THE STANDARD
 */

async function fetchTwitterFeed(now) {
    const instances = [
        'https://nitter.drgns.space',
        'https://nitter.poast.org',
        'https://nitter.no-logs.com',
        'https://nitter.tiekoetter.com',
        'https://nitter.privacydev.net'
    ];
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    };

    function isWithinLast24Hours(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) return false;
        const diffInMs = now.getTime() - dateObj.getTime();
        const diffInHours = diffInMs / (1000 * 60 * 60);
        return diffInHours >= 0 && diffInHours <= 24;
    }

    for (const inst of instances) {
        try {
            const url = `${inst}/thestandardth/rss?t=${Date.now()}`;
            console.log(`Trying Twitter RSS via Nitter: ${url}`);
            const res = await fetch(url, { headers, signal: AbortSignal.timeout(4000) });
            if (res.ok) {
                const text = await res.text();
                if (text.includes('<rss') && text.includes('<item>')) {
                    const items = text.split(/<item>/);
                    const headlines = [];
                    for (let i = 1; i < items.length; i++) {
                        if (headlines.length >= 5) break;
                        const block = items[i];
                        const titleMatch = block.match(/<title>(.*?)<\/title>/s);
                        const pubDateMatch = block.match(/<pubDate>(.*?)<\/pubDate>/s);
                        if (titleMatch) {
                            let tweetText = titleMatch[1]
                                .replace(/<!\[CDATA\[(.*?)\]\]>/gs, '$1')
                                .replace(/&quot;/g, '"')
                                .replace(/&lt;/g, '<')
                                .replace(/&gt;/g, '>')
                                .replace(/&amp;/g, '&')
                                .replace(/RT by @thestandardth:/g, '')
                                .replace(/<[^>]*>?/gm, '')
                                .replace(/\s+/g, ' ')
                                .trim();
                            
                            // Remove Twitter short URLs at the end
                            tweetText = tweetText.replace(/https:\/\/t\.co\/[a-zA-Z0-9]+$/g, '').trim();

                            const pubDate = pubDateMatch ? new Date(pubDateMatch[1].trim()) : null;
                            if (tweetText.length > 20 && (!pubDate || isWithinLast24Hours(pubDate))) {
                                if (!headlines.includes(tweetText)) {
                                    headlines.push(tweetText);
                                }
                            }
                        }
                    }
                    if (headlines.length > 0) {
                        console.log(`Successfully fetched ${headlines.length} tweets from Nitter instance: ${inst}`);
                        return headlines;
                    }
                }
            }
        } catch (e) {
            console.error(`Failed fetching Twitter feed from ${inst}:`, e.message);
        }
    }
    return null;
}

export async function getAccurateNews(categories = ['latest', 'thailand', 'nakhon-phanom', 'nakhon-phanom-matichon', 'nakhon-phanom-pptv', 'nakhon-phanom-fb', 'restaurant-th', 'restaurant-biz', 'isan-news-matichon']) {
    console.log("Yuzu News Fetcher: Starting for categories:", categories);
    
    const now = new Date();
    const ThaiMonths = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

    function isWithinLast24Hours(dateObj) {
        if (!dateObj || isNaN(dateObj.getTime())) return false;
        const diffInMs = now.getTime() - dateObj.getTime();
        const diffInHours = diffInMs / (1000 * 60 * 60);
        return diffInHours >= 0 && diffInHours <= 24;
    }

    function parseThaiDate(thaiStr) {
        try {
            const match = thaiStr.match(/(\d+)\s+([^\s,]+)\s+(\d+),(\d+):(\d+)น/);
            if (match) {
                const day = parseInt(match[1]);
                const monthIdx = ThaiMonths.indexOf(match[2]);
                const year = parseInt(match[3]) - 543; // BE to AD
                const hour = parseInt(match[4]);
                const minute = parseInt(match[5]);
                return new Date(year, monthIdx, day, hour, minute);
            }
        } catch (e) {}
        return null;
    }

    function parseRssDate(itemBlock) {
        try {
            const pubDateMatch = itemBlock.match(/<pubDate>(.*?)<\/pubDate>/s);
            if (pubDateMatch) {
                return new Date(pubDateMatch[1].trim());
            }
            const dcDateMatch = itemBlock.match(/<dc:date>(.*?)<\/dc:date>/s);
            if (dcDateMatch) {
                return new Date(dcDateMatch[1].trim());
            }
        } catch (e) {}
        return null;
    }
    
    const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9,th;q=0.8'
    };

    try {
        const results = await Promise.all(categories.map(async (cat) => {
            if (cat === 'latest') {
                const tweets = await fetchTwitterFeed(now);
                if (tweets && tweets.length > 0) {
                    return { category: cat, headlines: tweets };
                }
            }
            let url = "";
            if (cat === 'nakhon-phanom') {
                url = `https://www.thairath.co.th/tags/%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9E%E0%B8%99%E0%B8%A1?t=${Date.now()}`;
            } else if (cat === 'nakhon-phanom-matichon') {
                url = `https://www.matichon.co.th/tag/%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9E%E0%B8%99%E0%B8%A1/feed?t=${Date.now()}`;
            } else if (cat === 'nakhon-phanom-pptv') {
                url = `https://www.pptvhd36.com/tags/%E0%B8%99%E0%B8%84%E0%B8%A3%E0%B8%9E%E0%B8%99%E0%B8%A1?t=${Date.now()}`;
            } else if (cat === 'nakhon-phanom-fb') {
                return { category: cat, headlines: [
                    "สวท.นครพนม (Facebook Page): https://www.facebook.com/profile.php?id=100064315526807",
                    "นครพนม Happy Nakhonphanom: https://www.facebook.com/happynakhonphanom",
                    "Bird Agavone -นครพนม-: https://www.facebook.com/birdagavone1"
                ] };
            } else if (cat === 'restaurant-th') {
                url = `https://www.prachachat.net/tag/%E0%B8%A3%E0%B9%85%E0%B8%B2%E0%B8%99%E0%B8%AD%E0%B8%B2%E0%B8%AB%E0%B8%B2%E0%B8%A3/feed?t=${Date.now()}`;
            } else if (cat === 'restaurant-biz') {
                url = `https://brandinside.asia/category/business/retail-restaurant/feed/?t=${Date.now()}`;
            } else if (cat === 'isan-news-matichon') {
                url = `https://www.matichon.co.th/tag/%E0%B8%A0%E0%B8%B2%E0%B8%84%E0%B8%AD%E0%B8%B5%E0%B8%AA%E0%B8%B2%E0%B8%99/feed?t=${Date.now()}`;
            } else if (cat === 'latest') {
                url = `https://thestandard.co/feed/?t=${Date.now()}`;
            } else {
                url = `https://thestandard.co/category/news/${cat}/feed/?t=${Date.now()}`;
            }

            try {
                const response = await fetch(url, { headers });
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                const html = await response.text();
                const titles = [];

                if (url.includes('thairath.co.th')) {
                    const matchNext = html.match(/<script id="__NEXT_DATA__" type="application\/json">(.*?)<\/script>/s);
                    if (matchNext) {
                        try {
                            const data = JSON.parse(matchNext[1]);
                            function findArticles(obj) {
                                let results = [];
                                if (typeof obj === 'object' && obj !== null) {
                                    if (obj.title && obj.publishTime) {
                                        results.push({ title: obj.title, date: new Date(obj.publishTime) });
                                    }
                                    for (let k in obj) {
                                        results = results.concat(findArticles(obj[k]));
                                    }
                                } else if (Array.isArray(obj)) {
                                    for (let v of obj) {
                                        results = results.concat(findArticles(v));
                                    }
                                }
                                return results;
                            }
                            const allFound = findArticles(data.props?.initialState || data);
                            const noiseTexts = ["บทความและข่าว", "ไทยรัฐออนไลน์", "รวมข่าว", "รูปภาพ", "คลังภาพ", "วิดีโอ", "ติดต่อโฆษณา", "การเมือง", "กีฬา", "บันเทิง", "สังคม", "เศรษฐกิจ", "ต่างประเทศ", "ไลฟ์สไตล์", "ดวง", "หวย", "ยานยนต์", "เทคโนโลยี", "คลิป", "ดูคลิปทั้งหมด"];
                            
                            for (const art of allFound) {
                                if (titles.length >= 5) break;
                                if (art.title.length > 20 && !noiseTexts.some(n => art.title.includes(n))) {
                                    if (isWithinLast24Hours(art.date)) {
                                        titles.push(art.title.replace(/&quot;/g, '"').trim());
                                    }
                                }
                            }
                        } catch(e) { console.error("JSON Parse Error:", e); }
                    }
                } else if (url.includes('matichon.co.th') || url.includes('prachachat.net') || url.includes('brandinside.asia') || url.includes('thestandard.co')) {
                    // Split XML into items to parse title and publication date accurately
                    const items = html.split(/<item>/);
                    // The first chunk is the channel info, skip it
                    for (let i = 1; i < items.length; i++) {
                        if (titles.length >= 5) break;
                        const block = items[i];
                        const titleMatch = block.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>|<title>(.*?)<\/title>/s);
                        if (titleMatch) {
                            let titleText = (titleMatch[1] || titleMatch[2]).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').replace(/&#8211;/g, '-').trim();
                            const pubDate = parseRssDate(block);
                            if (titleText.length > 20 && isWithinLast24Hours(pubDate) && !titleText.includes('Matichon') && !titleText.includes('มติชนออนไลน์') && !titleText.includes('ประชาชาติธุรกิจ') && !titleText.includes('Brand Inside') && !titleText.includes('THE STANDARD')) {
                                if (!titles.includes(titleText)) {
                                    if (url.includes('thestandard.co')) {
                                        const catRegex = /<category><!\[CDATA\[(.*?)\]\]><\/category>|<category>(.*?)<\/category>/g;
                                        let catMatch;
                                        const cats = [];
                                        while ((catMatch = catRegex.exec(block)) !== null) {
                                            const catVal = catMatch[1] || catMatch[2];
                                            if (catVal && !['News', 'Thailand', 'ความรู้', 'บันเทิง', 'ไลฟ์สไตล์', 'กีฬา'].includes(catVal)) {
                                                cats.push(catVal.replace(/\s+/g, ''));
                                            }
                                        }
                                        if (cats.length > 0) {
                                            const hashtags = cats.map(c => `#${c}`).join(' ');
                                            titleText = `${titleText} ${hashtags}`;
                                        }
                                    }
                                    titles.push(titleText);
                                }
                            }
                        }
                    }
                } else if (url.includes('pptvhd36.com')) {
                    const blocks = html.split(/<div class="list-item"|<article|<li class="item"/);
                    for (const block of blocks) {
                        if (titles.length >= 5) break;
                        const titleMatch = block.match(/<h[234][^>]*>(.*?)<\/h[234]>/s);
                        const dateMatch = block.match(/datetime="([^"]+)"/);
                        if (titleMatch && dateMatch) {
                            const titleText = titleMatch[1].replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').replace(/&quot;/g, '"').trim();
                            const storyDate = parseThaiDate(dateMatch[1]);
                            if (titleText.length > 20 && isWithinLast24Hours(storyDate) && !titleText.includes('ข่าวที่เกี่ยวข้องกับ')) {
                                titles.push(titleText);
                            }
                        }
                    }
                } else {
                    const blocks = html.split(/<article|<div class="news-item"|<div class="card"/);
                    for (let i = 1; i < blocks.length; i++) {
                        if (titles.length >= 5) break;
                        const block = blocks[i];
                        const titleMatch = block.match(/<h3 class="news-title">.*?<a[^>]*>(.*?)<\/a>.*?<\/h3>|<h2 class="news-title">.*?<a[^>]*>(.*?)<\/a>.*?<\/h2>|<h3[^>]*>(.*?)<\/h3>|<h2[^>]*>(.*?)<\/h2>/s);
                        const timeMatch = block.match(/<time[^>]*datetime="([^"]+)"|<time[^>]*>(.*?)<\/time>/s);
                        
                        if (titleMatch) {
                            const titleText = (titleMatch[1] || titleMatch[2] || titleMatch[3] || titleMatch[4]).replace(/<[^>]*>?/gm, '').replace(/\s+/g, ' ').replace(/&quot;/g, '"').trim();
                            let publishDate = null;
                            if (timeMatch) {
                                const dtStr = timeMatch[1] || timeMatch[2];
                                publishDate = new Date(dtStr);
                            }
                            
                            if (titleText.length > 20 && (!publishDate || isWithinLast24Hours(publishDate)) && !titles.includes(titleText)) {
                                const noise = ["EDITOR'S PICK", "MOST POPULAR", "THE STANDARD", "Latest News", "RELATED STORIES"];
                                if (!noise.some(n => titleText.toUpperCase().includes(n))) {
                                    titles.push(titleText);
                                }
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
                case 'nakhon-phanom-fb': catName = 'นครพนม (Facebook Pages แนะนำ)'; break;
                case 'restaurant-th': catName = 'วงการร้านอาหารในไทย (ประชาชาติธุรกิจ)'; break;
                case 'restaurant-biz': catName = 'ธุรกิจร้านอาหาร & ค้าปลีก (Brand Inside)'; break;
                case 'isan-news-matichon': catName = 'ข่าวทั่วไปภาคอีสาน (มติชนออนไลน์)'; break;
                case 'latest': catName = 'ข่าวเด่นล่าสุด (THE STANDARD)'; break;
                case 'thailand': catName = 'ข่าวเด่นในประเทศ (THE STANDARD)'; break;
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
