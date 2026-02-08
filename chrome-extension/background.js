// Service Worker (background.js)
// Handles: API communication, storage, message routing, alarms

// Base configuration
const API_BASE = 'https://sync-state-backend.onrender.com';
const API_TIMEOUT = 10000; // 10 seconds

// Helper: Make API calls with timeout
async function makeApiCall(endpoint, method = 'GET', body = null) {
  try {
    const init = {
      method: method,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: API_TIMEOUT,
    };

    if (body) {
      init.body = JSON.stringify(body);
    }

    const response = await fetch(`${API_BASE}${endpoint}`, init);

    if (!response.ok) {
      // Try to parse error as JSON, fall back to text
      let errorData;
      try {
        errorData = await response.json();
      } catch (e) {
        errorData = { message: await response.text() || `HTTP ${response.status}` };
      }
      throw new Error(
        errorData.message || `HTTP ${response.status}`
      );
    }

    return await response.json();
  } catch (error) {
    console.error(`API call failed (${endpoint}):`, error);
    throw error;
  }
}

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'openPopup') {
    chrome.action.openPopup();
    sendResponse({ success: true });
  } else if (request.action === 'getSyncStatus') {
    getSyncStatus(sender.tab.url).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // Async response
  } else if (request.action === 'syncMapping') {
    syncMapping(request.sku, request.asin).then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // Async response
  } else if (request.action === 'getUnreadAlerts') {
    getUnreadAlerts().then(sendResponse).catch((err) => {
      sendResponse({ error: err.message });
    });
    return true; // Async response
  }
});

// Get sync status for a product
async function getSyncStatus(url) {
  try {
    // Extract product ID from URL
    const productMatch = url.match(/\/products\/(\d+)/);
    if (!productMatch) {
      throw new Error('Could not extract product ID from URL');
    }

    const productId = productMatch[1];

    // Check storage for cached mapping
    const storage = await chrome.storage.local.get(
      `product_sync_${productId}`
    );
    if (storage[`product_sync_${productId}`]) {
      return storage[`product_sync_${productId}`];
    }

    // Query backend for sync status
    const response = await makeApiCall(
      `/api/product-sync/${productId}`
    );
    const status = {
      lastSync: response.lastSync || null,
      synced: response.synced || false,
      inventoryLevel: response.inventoryLevel || 0,
      errors: response.errors || [],
    };

    // Cache result
    await chrome.storage.local.set({
      [`product_sync_${productId}`]: status,
      [`product_sync_${productId}_timestamp`]: new Date().toISOString(),
    });

    return status;
  } catch (error) {
    console.error('Error getting sync status:', error);
    return {
      lastSync: null,
      synced: false,
      inventoryLevel: 0,
      errors: [error.message],
    };
  }
}

// Sync SKU-to-ASIN mapping
async function syncMapping(sku, asin) {
  try {
    const response = await makeApiCall('/api/sku-mapping', 'POST', {
      sku: sku,
      asin: asin,
      source: 'chrome-extension',
      timestamp: new Date().toISOString(),
    });

    // Clear cache for any affected products
    const storage = await chrome.storage.local.get();
    const keysToRemove = Object.keys(storage).filter((k) =>
      k.startsWith(`sku_${sku}`)
    );
    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
    }

    return response;
  } catch (error) {
    console.error('Error syncing mapping:', error);
    throw error;
  }
}

// Get unread alerts
async function getUnreadAlerts() {
  try {
    const response = await makeApiCall('/api/alerts/unread');

    // Cache result
    await chrome.storage.local.set({
      unreadAlerts: response.alerts || [],
      unreadAlertsTimestamp: new Date().toISOString(),
    });

    return response;
  } catch (error) {
    console.error('Error getting unread alerts:', error);
    return { count: 0, alerts: [] };
  }
}

// Periodic sync of pending mappings (offline support)
async function syncPendingMappings() {
  try {
    const storage = await chrome.storage.local.get();

    // Find all pending SKU mappings
    const pendingMappings = Object.entries(storage).filter(([key, value]) => {
      return (
        key.startsWith('sku_') &&
        !key.endsWith('_timestamp') &&
        value &&
        typeof value === 'string'
      );
    });

    for (const [key, asin] of pendingMappings) {
      const sku = key.replace(/^sku_/, '');

      try {
        await syncMapping(sku, asin);
        console.log(
          `✓ Synced pending mapping: ${sku} → ${asin}`
        );
      } catch (error) {
        console.error(
          `Failed to sync mapping ${sku} → ${asin}:`,
          error
        );
      }
    }
  } catch (error) {
    console.error('Error syncing pending mappings:', error);
  }
}

// Set up periodic sync (every 5 minutes)
chrome.alarms.create('syncPendingMappings', { periodInMinutes: 5 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncPendingMappings') {
    syncPendingMappings();
  }
});

// Run initial sync on startup
chrome.runtime.onInstalled.addListener(() => {
  console.log('SyncState extension installed/updated');
  syncPendingMappings();
});

// Also sync on extension startup
syncPendingMappings();

// Update badge with alert count
async function updateBadge() {
  try {
    const response = await getUnreadAlerts();
    const count = response.count || 0;

    if (count > 0) {
      chrome.action.setBadgeText({ text: String(count) });
      chrome.action.setBadgeBackgroundColor({ color: '#667eea' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }
  } catch (error) {
    console.error('Error updating badge:', error);
  }
}

// Update badge every minute
chrome.alarms.create('updateBadge', { periodInMinutes: 1 });

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'updateBadge') {
    updateBadge();
  }
});

// Update badge on startup
updateBadge();

// Log service worker ready
console.log('SyncState service worker ready');

// ...existing code...


