import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });
import { fetchStockItems } from '../utils/stock_api.js';

const cleanString = (str) => str.toLowerCase().replace(/[^a-zA-Z0-9\u0e00-\u0e7f]/g, '');

function filterStockItemsByQuery(allItems, searchQuery) {
  const cleanSearch = cleanString(searchQuery);
  if (!cleanSearch) return [];

  // Split by spaces, commas, slashes, or the word "และ" (word boundary/alternation)
  const tokens = searchQuery
    .toLowerCase()
    .split(/\s+|และ|,|，|、|\/|\|/g)
    .map(t => cleanString(t))
    .filter(t => t.length > 1); // Ignore single characters

  console.log("Search tokens:", tokens);

  return allItems.filter(item => {
    const cleanItemName = cleanString(item.name);
    // 1. Direct match with full cleaned search query
    if (cleanItemName.includes(cleanSearch) || cleanSearch.includes(cleanItemName)) {
      return true;
    }
    // 2. Token match
    return tokens.some(token => cleanItemName.includes(token));
  });
}

async function test() {
  try {
    const allItems = await fetchStockItems();
    const query = "เบสชาไทย ชามะลิ นมมิกซ์ และเบสอื่นในบาร์";
    console.log("Query:", query);
    const matched = filterStockItemsByQuery(allItems, query);
    console.log("Matched items:", matched.map(i => i.name));
  } catch (err) {
    console.error("Error:", err);
  }
}
test();
