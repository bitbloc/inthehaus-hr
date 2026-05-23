// Scratch testing script for checking items and fuzzy matching
const mockStockItems = [
  { id: "1", name: "น้ำสิงห์ 1.5 ลิตร", current_quantity: 15, unit: "ขวด", reorder_point: 5 },
  { id: "2", name: "เบียร์สิงห์", current_quantity: 24, unit: "ขวด", reorder_point: 10 },
  { id: "3", name: "น้ำแร่สิงห์", current_quantity: 3, unit: "ขวด", reorder_point: 5 },
  { id: "4", name: "โค้ก 325 มล.", current_quantity: 50, unit: "กระป๋อง", reorder_point: 12 }
];

function testSearch(search) {
  console.log(`\nSearching for: "${search}"`);
  
  // Simulated search matching the exact logic used in stockHandler:
  const items = mockStockItems.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
  const exactMatch = items.find(i => i.name.toLowerCase() === search.toLowerCase());
  
  if (exactMatch) {
     console.log("-> Exact match found: ", exactMatch.name);
  } else if (items.length === 1) {
     console.log("-> Single partial match found: ", items[0].name);
  } else if (items.length > 1) {
     console.log("-> Multiple matches found. Displaying selection menu:");
     items.forEach(item => {
        console.log(`   [Button] ${item.name} -> triggers check_exact_stock for "${item.name}"`);
     });
  } else {
     console.log("-> No items found.");
  }
}

testSearch("สิงห์");
testSearch("เบียร์สิงห์");
testSearch("โค้ก");
testSearch("ช้าง");
