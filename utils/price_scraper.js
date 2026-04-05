/**
 * Price Scraper Utility for Talaad Thai and Makro Pro
 */

import { getGenAI } from './gemini-client.js';

const INGREDIENTS = [
    { name: 'หมู', search: 'เนื้อหมูสะโพก' },
    { name: 'เนื้อ', search: 'เนื้อวัว' },
    { name: 'น้ำ', search: 'น้ำดื่ม 600มล' },
    { name: 'บรรจุภัณฑ์พลาสติก', search: 'ถุงพลาสติก' },
    { name: 'ไข่ไก่', search: 'ไข่ไก่ เบอร์ 2' },
    { name: 'นม', search: 'นมสด' },
    { name: 'มะนาว', search: 'มะนาว' },
    { name: 'แตงกวา', search: 'แตงกวา' },
    { name: 'ผักชี', search: 'ผักชี' }
];

/**
 * Scrape prices from Talaad Thai
 * Note: Talaad Thai uses a fairly simple HTML structure.
 */
async function scrapeTalaadThai(keyword) {
    try {
        const url = `https://talaadthai.com/products?keyword=${encodeURIComponent(keyword)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
            }
        });
        const html = await response.text();

        // Extract using basic regex for speed, or Gemini for accuracy if regex fails
        // Pattern: <div class="productName">...</div> ... <div class="minPrice">...</div>
        const nameMatch = html.match(/class="productName">([^<]+)</);
        const minPriceMatch = html.match(/class="minPrice">([^<]+)</);
        const maxPriceMatch = html.match(/class="maxPrice">([^<]+)</);
        const unitMatch = html.match(/class="unit">([^<]+)</);

        if (minPriceMatch) {
            const min = parseFloat(minPriceMatch[1].replace(/,/g, ''));
            const max = maxPriceMatch ? parseFloat(maxPriceMatch[1].replace(/,/g, '')) : min;
            return {
                source: 'TalaadThai',
                item: keyword,
                price: (min + max) / 2, // Average price
                unit: unitMatch ? unitMatch[1].trim() : 'N/A',
                raw: `${min}-${max}`
            };
        }
        return null;
    } catch (error) {
        console.error(`TalaadThai Scrape Error (${keyword}):`, error);
        return null;
    }
}

/**
 * Scrape prices from Makro Pro
 * Note: Makro Pro is a Next.js app. We look for __NEXT_DATA__ for the most reliable results.
 */
async function scrapeMakro(keyword) {
    try {
        const url = `https://www.makro.pro/c/search?q=${encodeURIComponent(keyword)}`;
        const response = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
                'Accept-Language': 'th-TH,th;q=0.9'
            }
        });
        const html = await response.text();

        // Attempt to find __NEXT_DATA__
        const nextDataMatch = html.match(/<script id="__NEXT_DATA__" type="application\/json">([^<]+)<\/script>/);
        if (nextDataMatch) {
            const data = JSON.parse(nextDataMatch[1]);
            // Search results are usually in data.props.pageProps.initialState.search.products
            // Path might vary, this is a heuristic based on previous research.
            const products = data.props?.pageProps?.initialState?.search?.products || [];
            if (products.length > 0) {
                const p = products[0];
                return {
                    source: 'Makro',
                    item: p.productName || keyword,
                    price: p.price?.currentPrice || 0,
                    unit: p.price?.unit || 'N/A'
                };
            }
        }

        // Fallback: If __NEXT_DATA__ is obfuscated or empty, use Gemini to parse the HTML snippet
        // (Only for critical failures as it costs API credits)
        return null;
    } catch (error) {
        console.error(`Makro Scrape Error (${keyword}):`, error);
        return null;
    }
}

/**
 * Main function to trigger price updates
 */
export async function updateIngredientPrices() {
    const results = [];
    for (const item of INGREDIENTS) {
        const tt = await scrapeTalaadThai(item.search);
        const mk = await scrapeMakro(item.search);
        
        if (tt) results.push({ ...tt, officialName: item.name });
        if (mk) results.push({ ...mk, officialName: item.name });
    }

    // Save to Database
    if (results.length > 0) {
        const { supabase } = await import('../lib/supabaseClient.js');
        const { error } = await supabase.from('ingredient_prices').insert(
            results.map(r => ({
                item_name: r.officialName,
                source: r.source,
                price: r.price,
                unit: r.unit
            }))
        );
        if (error) console.error("Database Save Error:", error);
    }

    return results;
}

/**
 * Compare current prices with previous ones
 */
export async function getPriceComparison() {
    const { supabase } = await import('../lib/supabaseClient.js');
    
    // Get latest prices
    const { data: latest, error: err1 } = await supabase
        .from('ingredient_prices')
        .select('*')
        .order('recorded_at', { ascending: false })
        .limit(30); // Get recent enough batch

    if (err1 || !latest) return "ขออภัยค่ะ ยูซุหาข้อมูลราคาไม่เจอ";

    // Get prices from ~7 days ago for comparison
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const { data: previous, error: err2 } = await supabase
        .from('ingredient_prices')
        .select('*')
        .lt('recorded_at', sevenDaysAgo.toISOString())
        .order('recorded_at', { ascending: false })
        .limit(30);

    const report = [];
    INGREDIENTS.forEach(item => {
        const currentItem = latest.find(l => l.item_name === item.name);
        const prevItem = previous ? previous.find(p => p.item_name === item.name) : null;

        if (currentItem) {
            let changeText = "➖ รักษาระดับเดิม";
            if (prevItem) {
                const diff = currentItem.price - prevItem.price;
                const percent = (diff / prevItem.price) * 100;
                if (diff > 0) changeText = `📈 ขึ้น ${diff.toFixed(2)}บ. (${percent.toFixed(1)}%)`;
                if (diff < 0) changeText = `📉 ลง ${Math.abs(diff).toFixed(2)}บ. (${Math.abs(percent).toFixed(1)}%)`;
            }
            report.push(`${item.name}: ${currentItem.price}บ./${currentItem.unit} (${changeText})`);
        }
    });

    return report.length > 0 ? report.join('\n') : "ยังไม่มีข้อมูลเปรียบเทียบค่ะ บอสต้องรอให้ยูซุเก็บข้อมูลซักพ่อนะคะ";
}
