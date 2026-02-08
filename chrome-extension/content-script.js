// ================== GLOBAL GUARD ==================
// Prevent double-injection on Shopify SPA navigation
if (window.__SYNCSTATE_CONTENT_SCRIPT_LOADED__) {
  console.log("SyncState: content script already loaded, skipping re-init");
  return;
}
window.__SYNCSTATE_CONTENT_SCRIPT_LOADED__ = true;

// =================================================
// Content script injected into Shopify product pages
// Extracts SKU and facilitates SKU-to-ASIN linking
// =================================================


// ---------- SKU VALIDATION ----------
function looksLikeSKU(val) {
  return (
    typeof val === "string" &&
    val.length > 0 &&
    val.length <= 40 &&
    /[0-9]/.test(val) &&           // must contain a number
    !/\s{2,}/.test(val) &&        // no long whitespace
    !val.toLowerCase().includes("resize")
  );
}


// ---------- SKU EXTRACTION ----------
function extractSKU() {
  // Method 1: inputs likely to contain SKU
  const skuInputSelectors = [
    'input[name*="sku" i]',
    'input[id*="sku" i]',
    'input[class*="sku" i]'
  ];

  for (const sel of skuInputSelectors) {
    const inputs = document.querySelectorAll(sel);
    for (const input of inputs) {
      const val = (input.value || "").trim();
      if (looksLikeSKU(val)) return val;
    }
  }

  // Method 2: known Shopify ID
  const byId = document.getElementById("InventoryCardSku");
  if (byId) {
    const val = (byId.value || byId.textContent || "").trim();
    if (looksLikeSKU(val)) return val;
  }

  // Method 3: label-based search
  const labels = document.querySelectorAll("label, span, div");
  for (const label of labels) {
    const txt = (label.textContent || "").toLowerCase();
    if (!txt.includes("sku")) continue;

    const innerInput = label.querySelector("input");
    if (innerInput) {
      const val = (innerInput.value || "").trim();
      if (looksLikeSKU(val)) return val;
    }

    let sibling = label.nextElementSibling;
    while (sibling) {
      if (sibling.tagName === "INPUT") {
        const val = (sibling.value || "").trim();
        if (looksLikeSKU(val)) return val;
      }

      const nested = sibling.querySelector?.("input");
      if (nested) {
        const val = (nested.value || "").trim();
        if (looksLikeSKU(val)) return val;
      }

      sibling = sibling.nextElementSibling;
    }
  }

  // Method 4: data attributes
  const dataSkuEl = document.querySelector(
    "[data-sku], [data-sku-value], [data-testid*='sku' i]"
  );

  if (dataSkuEl) {
    const val = (
      dataSkuEl.getAttribute("data-sku") ||
      dataSkuEl.getAttribute("data-sku-value") ||
      dataSkuEl.textContent ||
      ""
    ).trim();

    if (looksLikeSKU(val)) return val;
  }

  // ❌ Never invent SKUs
  return null;
}


// ---------- UI INJECTION ----------
function injectSyncStateButton() {
  if (document.getElementById("syncstate-inject-button")) return;

  const actionContainer = document.querySelector(
    '[class*="Button"], [class*="action"]'
  );

  if (!actionContainer) return;

  const button = document.createElement("button");
  button.id = "syncstate-inject-button";
  button.textContent = "🔗 Link to SyncState";

  button.style.cssText = `
    padding: 10px 16px;
    margin: 10px;
    background: linear-gradient(135deg, #667eea, #764ba2);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 2px 8px rgba(102,126,234,0.3);
  `;

  button.addEventListener("mouseenter", () => {
    button.style.transform = "translateY(-2px)";
    button.style.boxShadow = "0 4px 12px rgba(102,126,234,0.4)";
  });

  button.addEventListener("mouseleave", () => {
    button.style.transform = "translateY(0)";
    button.style.boxShadow = "0 2px 8px rgba(102,126,234,0.3)";
  });

  button.addEventListener("click", () => {
    chrome.runtime.sendMessage({ action: "openPopup" });
  });

  (actionContainer.parentElement || document.body).appendChild(button);
}


// ---------- MESSAGE HANDLING ----------
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getSKU") {
    const sku = extractSKU();
    console.log("SyncState: extracted SKU =", sku);
    sendResponse({ sku });
  }

  if (request.action === "injectButton") {
    injectSyncStateButton();
    sendResponse({ success: true });
  }
});


// ---------- AUTO INJECT ----------
setTimeout(injectSyncStateButton, 500);

window.addEventListener("load", () => {
  setTimeout(injectSyncStateButton, 1000);
});


// ---------- MUTATION OBSERVER ----------
let observer;

if (!observer) {
  observer = new MutationObserver(() => {
    if (!document.getElementById("syncstate-inject-button")) {
      injectSyncStateButton();
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}


// ---------- DEBUG ----------
console.log("SyncState content script loaded on", window.location.href);
