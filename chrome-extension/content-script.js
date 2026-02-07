// Content script injected into Shopify product pages
// Extracts SKU and facilitates SKU-to-ASIN linking

// Extract SKU from Shopify product page
function extractSKU() {
  // Target: try several robust ways to find the SKU input/value

  // Method 1: Directly target inputs that likely contain SKU
  // Use case-insensitive attribute selectors (the "i" flag) where supported
  const skuInputSelectors = [
    'input[name*="sku" i]',
    'input[id*="sku" i]',
    'input[class*="sku" i]',
    'input[data-*="sku" i]'
  ];

  for (const sel of skuInputSelectors) {
    try {
      const inputs = document.querySelectorAll(sel);
      for (const input of inputs) {
        if (!input) continue;
        const val = (input.value || '').trim();
        if (val && !/resize/i.test(val)) {
          return val;
        }
      }
    } catch (e) {
      // Some browsers may not accept the data-* selector pattern; ignore errors
    }
  }

  // Also look specifically for the known ID used in the page you pasted
  const byId = document.getElementById('InventoryCardSku');
  if (byId && (byId.value || '').trim()) {
    return byId.value.trim();
  }

  // Method 2: Look for label text containing "SKU" and find nearby inputs
  const labels = document.querySelectorAll('label, span, div');
  for (const label of labels) {
    const txt = (label.textContent || '').toLowerCase();
    if (txt.includes('sku') && !txt.includes('resize')) {
      // try: input inside label
      const innerInput = label.querySelector('input');
      if (innerInput && (innerInput.value || '').trim()) return innerInput.value.trim();

      // try: sibling input
      let sibling = label.nextElementSibling;
      while (sibling) {
        if (sibling.tagName === 'INPUT' && (sibling.value || '').trim()) return sibling.value.trim();
        // sometimes the input is deeper inside
        const nested = sibling.querySelector && sibling.querySelector('input');
        if (nested && (nested.value || '').trim()) return nested.value.trim();
        sibling = sibling.nextElementSibling;
      }
    }
  }

  // Method 3: Look for data attributes or text nodes that may contain SKU
  const dataSku = document.querySelector('[data-sku], [data-sku-value]');
  if (dataSku) {
    const v = (dataSku.getAttribute('data-sku') || dataSku.getAttribute('data-sku-value') || '').trim();
    if (v) return v;
  }

  // Method 4: Parse from URL if it contains product info
  try {
    const url = new URL(window.location);
    const pathParts = url.pathname.split('/');
    if (pathParts.includes('products')) {
      const productId = pathParts[pathParts.indexOf('products') + 1];
      if (productId) return `PRODUCT-${productId}`;
    }
  } catch (e) {
    // ignore malformed URL
  }

  return null;
}

// Inject UI button on product page
function injectSyncStateButton() {
  // Check if button already injected
  if (document.getElementById('syncstate-inject-button')) {
    return;
  }

  // Find a good place to inject (look for product action buttons)
  const actionContainer = document.querySelector(
    '[class*="Button"], [class*="action"]'
  );

  if (!actionContainer) {
    console.log('SyncState: Could not find action container');
    return;
  }

  // Create button
  const button = document.createElement('button');
  button.id = 'syncstate-inject-button';
  button.textContent = '🔗 Link to SyncState';
  button.style.cssText = `
    padding: 10px 16px;
    margin: 10px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    font-size: 14px;
    box-shadow: 0 2px 8px rgba(102, 126, 234, 0.3);
    transition: all 0.2s;
  `;

  button.addEventListener('mouseover', () => {
    button.style.boxShadow = '0 4px 12px rgba(102, 126, 234, 0.4)';
    button.style.transform = 'translateY(-2px)';
  });

  button.addEventListener('mouseout', () => {
    button.style.boxShadow = '0 2px 8px rgba(102, 126, 234, 0.3)';
    button.style.transform = 'translateY(0)';
  });

  button.addEventListener('click', () => {
    chrome.runtime.sendMessage({ action: 'openPopup' });
  });

  // Try to insert in relevant location
  const insertionPoint =
    actionContainer.parentElement || document.body;
  insertionPoint.appendChild(button);
}

// Listen for messages from popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getSKU') {
    const sku = extractSKU();
    sendResponse({ sku: sku });
  } else if (request.action === 'injectButton') {
    injectSyncStateButton();
    sendResponse({ success: true });
  }
});

// Auto-inject on page load
window.addEventListener('load', () => {
  // Small delay to allow page to fully render
  setTimeout(injectSyncStateButton, 1000);
});

// Also try on DOM ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(injectSyncStateButton, 500);
  });
} else {
  setTimeout(injectSyncStateButton, 500);
}

// Mutation observer to detect dynamically loaded content
const observer = new MutationObserver(() => {
  if (!document.getElementById('syncstate-inject-button')) {
    injectSyncStateButton();
  }
});

observer.observe(document.body, {
  childList: true,
  subtree: true,
});

// Log that content script loaded
console.log('SyncState content script loaded on', window.location.href);
