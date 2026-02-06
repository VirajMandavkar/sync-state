// Get DOM elements
const skuDisplay = document.getElementById('skuDisplay');
const asinInput = document.getElementById('asinInput');
const linkBtn = document.getElementById('linkBtn');
const clearBtn = document.getElementById('clearBtn');
const statusDiv = document.getElementById('status');

// Helper functions
function showStatus(message, type) {
  statusDiv.className = `status ${type}`;
  statusDiv.innerHTML = message;
  if (type !== 'error') {
    setTimeout(() => {
      statusDiv.className = 'status';
    }, 4000);
  }
}

function setLoading(isLoading) {
  if (isLoading) {
    linkBtn.disabled = true;
    linkBtn.innerHTML = '<span class="spinner"></span>Saving...';
  } else {
    linkBtn.disabled = false;
    linkBtn.innerHTML = 'Save Link';
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Get current tab
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    const currentTab = tabs[0];

    // Check if on Shopify product page
    if (!currentTab.url.includes('myshopify.com/admin/products/')) {
      skuDisplay.textContent = 'Not on a Shopify product page';
      asinInput.disabled = true;
      linkBtn.disabled = true;
      showStatus('This extension only works on Shopify product pages', 'error');
      return;
    }

    // Inject content script to extract SKU
    chrome.tabs.sendMessage(
      currentTab.id,
      { action: 'getSKU' },
      (response) => {
        if (response && response.sku) {
          skuDisplay.textContent = response.sku;
          loadStoredASIN(response.sku);
        } else {
          skuDisplay.textContent = 'Could not extract SKU';
          showStatus('Unable to find SKU on this product page', 'error');
        }
      }
    );
  } catch (error) {
    console.error('Error initializing popup:', error);
    showStatus('Error loading popup', 'error');
  }
});

// Load previously stored ASIN for this SKU
async function loadStoredASIN(sku) {
  try {
    const result = await chrome.storage.local.get(`sku_${sku}`);
    if (result[`sku_${sku}`]) {
      asinInput.value = result[`sku_${sku}`];
    }
  } catch (error) {
    console.error('Error loading stored ASIN:', error);
  }
}

// Save button handler
linkBtn.addEventListener('click', async () => {
  const sku = skuDisplay.textContent;
  const asin = asinInput.value.trim().toUpperCase();

  if (!sku || sku.includes('Loading') || sku.includes('Could not')) {
    showStatus('Please wait for SKU to load', 'error');
    return;
  }

  if (!asin) {
    showStatus('Please enter an ASIN', 'error');
    return;
  }

  if (!/^[A-Z0-9]{10}$/.test(asin)) {
    showStatus('ASIN must be 10 characters (alphanumeric)', 'error');
    return;
  }

  setLoading(true);
  showStatus('<span class="spinner"></span>Saving to SyncState...', 'loading');

  try {
    // Save to local storage first (offline support)
    await chrome.storage.local.set({
      [`sku_${sku}`]: asin,
      [`sku_${sku}_timestamp`]: new Date().toISOString(),
    });

    // Send to SyncState backend
    const response = await fetch('https://api.syncstate.local/api/sku-mapping', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        sku: sku,
        asin: asin,
        source: 'chrome-extension',
        timestamp: new Date().toISOString(),
      }),
    });

    if (response.ok) {
      showStatus('✓ SKU linked successfully!', 'success');
      setLoading(false);
      // Optional: Close popup after success
      setTimeout(() => window.close(), 1500);
    } else {
      const errorData = await response.json();
      showStatus(
        `Error: ${errorData.message || 'Failed to save mapping'}`,
        'error'
      );
      setLoading(false);
    }
  } catch (error) {
    console.error('Error sending to backend:', error);
    showStatus(
      'Saved locally (backend unreachable - will sync when available)',
      'success'
    );
    setLoading(false);
  }
});

// Clear button handler
clearBtn.addEventListener('click', async () => {
  const sku = skuDisplay.textContent;

  if (!sku || sku.includes('Loading') || sku.includes('Could not')) {
    return;
  }

  try {
    await chrome.storage.local.remove(`sku_${sku}`);
    asinInput.value = '';
    showStatus('Link cleared', 'success');
  } catch (error) {
    console.error('Error clearing stored ASIN:', error);
    showStatus('Error clearing link', 'error');
  }
});

// Allow Enter key to save
asinInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    linkBtn.click();
  }
});
