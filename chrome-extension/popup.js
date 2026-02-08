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

    // Check if on Shopify product page (supports both old and new Shopify URLs)
    const isShopifyPage = /https:\/\/([^\/]+\.myshopify\.com\/admin\/products|admin\.shopify\.com\/store\/[^\/]+\/products)/.test(currentTab.url);
    
      if (!isShopifyPage) {
      console.log('SyncState: Current URL:', currentTab.url);
      skuDisplay.textContent = 'Not on a Shopify product page';
      asinInput.disabled = true;
      linkBtn.disabled = true;
      showStatus(`This extension only works on Shopify product pages. Current: ${currentTab.url}`, 'error');
      return;
    }

    // First, ensure content script is injected (Manifest V3)
    try {
      await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        files: ['content-script.js']
      });
    } catch (injectionError) {
      console.log('Content script injection issue:', injectionError);
    }

    // Wait a moment for the script to be ready
    await new Promise(resolve => setTimeout(resolve, 500));

    // Try extracting SKU by executing code directly in the page (avoids messaging issues)
    const extractSkuFromPage = async () => {
      try {
        const results = await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          func: () => {
            // Prefer exact matches first
            try {
              const byId = document.getElementById('InventoryCardSku');
              if (byId && byId.value && byId.value.trim()) return { value: byId.value.trim(), source: 'id:InventoryCardSku' };

              const byName = document.querySelector('input[name="sku"]');
              if (byName && byName.value && byName.value.trim()) return { value: byName.value.trim(), source: 'name:sku' };

              // broader selectors
              const selectors = [
                'input[name*="sku" i]',
                'input[id*="sku" i]',
                'input[class*="sku" i]'
              ];

              for (const s of selectors) {
                try {
                  const el = document.querySelector(s);
                  if (el && el.value && el.value.trim()) return { value: el.value.trim(), source: `selector:${s}` };
                } catch (e) {}
              }

              // labels nearby
              const labels = document.querySelectorAll('label, span, div');
              for (const label of labels) {
                const txt = (label.textContent || '').toLowerCase();
                if (txt.includes('sku') && !txt.includes('resize')) {
                  const innerInput = label.querySelector('input');
                  if (innerInput && innerInput.value && innerInput.value.trim()) return { value: innerInput.value.trim(), source: 'input:inside-label' };

                  let sibling = label.nextElementSibling;
                  while (sibling) {
                    if (sibling.tagName === 'INPUT' && sibling.value && sibling.value.trim()) return { value: sibling.value.trim(), source: 'input:sibling' };
                    const nested = sibling.querySelector && sibling.querySelector('input');
                    if (nested && nested.value && nested.value.trim()) return { value: nested.value.trim(), source: 'input:nested-sibling' };
                    sibling = sibling.nextElementSibling;
                  }
                }
              }

              const dataSku = document.querySelector('[data-sku], [data-sku-value]');
              if (dataSku) {
                const v = (dataSku.getAttribute('data-sku') || dataSku.getAttribute('data-sku-value') || '').trim();
                if (v) return { value: v, source: 'data-attr' };
              }
            } catch (e) {}

            return { value: null, source: 'none' };
          }
        });

        if (results && results.length) {
          for (const r of results) {
            if (r && r.result) return r.result;
          }
        }

        return { value: null, source: 'none' };
      } catch (err) {
        console.error('scripting.executeScript failed:', err);
        return { value: null, source: 'error' };
      }
    };

    let extractResult = await extractSkuFromPage();
    let sku = extractResult && extractResult.value ? extractResult.value : null;
    const source = extractResult && extractResult.source ? extractResult.source : 'unknown';

    // Fallback: try messaging the content script if direct execution didn't return a SKU
    if (!sku) {
      const sendSKURequest = () => {
        return new Promise((resolve) => {
          chrome.tabs.sendMessage(
            currentTab.id,
            { action: 'getSKU' },
            (response) => {
              if (chrome.runtime.lastError) {
                console.warn('Message error (content script maybe missing):', chrome.runtime.lastError.message);
                resolve(null);
              } else if (response && response.sku) {
                resolve(response.sku);
              } else {
                resolve(null);
              }
            }
          );
        });
      };

        sku = await sendSKURequest();
        // if messaging found a sku, set a different source label
        if (sku) {
          showStatus('Shopify SKU (via content script)', 'success');
        }
    }

    if (sku) {
      skuDisplay.textContent = sku;
        // show source only when debugging
        showStatus(`Shopify SKU (Auto-detected) — source: ${source}`, 'success');
        loadStoredASIN(sku);
    } else {
      skuDisplay.textContent = 'Could not extract SKU';
      showStatus('Unable to find SKU on this product page', 'error');
    }
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
  // Re-read SKU directly from the page at save-time to avoid stale/misleading popup text
  let sku = skuDisplay.textContent;
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId: (await chrome.tabs.query({ active: true, currentWindow: true }))[0].id },
      func: () => {
        const selectors = ['input[name*="sku" i]', 'input[id*="sku" i]', 'input[class*="sku" i]'];
        for (const s of selectors) {
          try {
            const el = document.querySelector(s);
            if (el && el.value && el.value.trim()) return el.value.trim();
          } catch (e) {}
        }
        const byId = document.getElementById('InventoryCardSku');
        if (byId && byId.value && byId.value.trim()) return byId.value.trim();
        return null;
      }
    });

    if (results && results.length) {
      for (const r of results) {
        if (r && r.result) {
          sku = r.result;
          break;
        }
      }
    }
  } catch (err) {
    console.warn('Could not re-read SKU from page at save-time:', err);
  }
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
    const response = await fetch('https://sync-state-backend.onrender.com/api/sku-mapping', {
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
      showStatus(`Error: ${errorData.message || 'Failed to save mapping'}`, 'error');
      setLoading(false);
    }
  } catch (error) {
    console.error('Error sending to backend:', error);
    const errMsg = error && error.message ? error.message : 'Network or CORS error';
    showStatus(`Saved locally (backend unreachable). ${errMsg}`, 'error');
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
