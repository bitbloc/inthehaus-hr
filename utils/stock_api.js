const STOCK_API_BASE_URL = "https://lxfavbzmebqqsffgyyph.supabase.co/functions/v1/stock-api";
const STOCK_API_KEY = process.env.STOCK_API_KEY || "1500323553";

const getHeaders = () => ({
  "Content-Type": "application/json",
  "X-Internal-API-Key": STOCK_API_KEY
});

/**
 * Fetch all items or search by query
 * @param {string} search - Search query for items
 * @returns {Promise<Array>}
 */
export async function fetchStockItems(search = "") {
  try {
    const url = search 
      ? `${STOCK_API_BASE_URL}/items?search=${encodeURIComponent(search)}` 
      : `${STOCK_API_BASE_URL}/items`;
      
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (error) {
    console.error("fetchStockItems Error:", error);
    throw error;
  }
}

/**
 * Fetch items that are below or equal to reorder_point
 * @returns {Promise<Array>}
 */
export async function fetchLowStock() {
  try {
    const res = await fetch(`${STOCK_API_BASE_URL}/low-stock`, { method: "GET", headers: getHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (error) {
    console.error("fetchLowStock Error:", error);
    throw error;
  }
}

/**
 * Add a stock transaction (in or out)
 * @param {string} stockItemId - UUID of the item
 * @param {string} transactionType - 'in' or 'out'
 * @param {number} quantityChange - Positive for 'in', Negative for 'out'
 * @param {string} performedBy - Name of the person
 * @param {string} note - Optional note
 */
export async function addStockTransaction(stockItemId, transactionType, quantityChange, performedBy, note = "") {
  try {
    const payload = {
      stock_item_id: stockItemId,
      transaction_type: transactionType,
      quantity_change: quantityChange,
      performed_by: performedBy,
      note: note
    };
    const res = await fetch(`${STOCK_API_BASE_URL}/transactions`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(payload)
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (error) {
    console.error("addStockTransaction Error:", error);
    throw error;
  }
}

/**
 * Update an existing stock item
 * @param {string} id - UUID of the item
 * @param {Object} data - Update data { name, unit, reorder_point }
 */
export async function updateStockItem(id, data) {
  try {
    const res = await fetch(`${STOCK_API_BASE_URL}/items/${id}`, {
      method: "PUT",
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (error) {
    console.error("updateStockItem Error:", error);
    throw error;
  }
}

/**
 * Create a new stock item
 * @param {Object} data - { name, category, unit, current_quantity, reorder_point }
 */
export async function createStockItem(data) {
  try {
    const res = await fetch(`${STOCK_API_BASE_URL}/items`, {
      method: "POST",
      headers: getHeaders(),
      body: JSON.stringify(data)
    });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (error) {
    console.error("createStockItem Error:", error);
    throw error;
  }
}

/**
 * Fetch stock transaction history
 * @param {string} itemId - Optional UUID to filter by item
 * @returns {Promise<Array>}
 */
export async function fetchStockHistory(itemId = null) {
  try {
    const url = itemId 
      ? `${STOCK_API_BASE_URL}/transactions?item_id=${itemId}` 
      : `${STOCK_API_BASE_URL}/transactions`;
    const res = await fetch(url, { method: "GET", headers: getHeaders() });
    if (!res.ok) throw new Error(await res.text());
    return await res.json();
  } catch (error) {
    console.error("fetchStockHistory Error:", error);
    throw error;
  }
}
