// Content script injected into Shopify product pages
// Extracts SKU and facilitates SKU-to-ASIN linking

// Extract SKU from Shopify product page
function extractSKU() {
  // Target: product variants section
  // Shopify stores SKU in data attributes or visible text in admin interface

  // Method 1: Look for SKU in the variants table (most reliable)
  const skuElements = document.querySelectorAll(
    '[data-testid*="variant"], [class*="variant"]'
  );

  for (const el of skuElements) {
    const text = el.innerText || el.textContent;
    if (text && text.includes('SKU://')) {
      // Format: "SKU:// AB123CD"
      const match = text.match(/SKU:\/\/\s*([A-Za-z0-9\-_.]+)/);
      if (match) return match[1];
    }
  }

  // Method 2: Look in product details section
  const labels = document.querySelectorAll('label, span, div');
  for (const label of labels) {
    if (
      label.textContent.toLowerCase().includes('sku') &&
      label.nextElementSibling
    ) {
      const skuValue = label.nextElementSibling.textContent.trim();
      if (skuValue && !skuValue.includes('SKU')) {
        return skuValue;
      }
    }
  }

  // Method 3: Parse from URL if it contains product info
  const url = new URL(window.location);
  const pathParts = url.pathname.split('/');
  if (pathParts.includes('products')) {
    const productId = pathParts[pathParts.indexOf('products') + 1];
    if (productId) {
      return `PRODUCT-${productId}`;
    }
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
