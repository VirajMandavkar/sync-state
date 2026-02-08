(function () {
  /* =========================================================
     URL-AWARE GLOBAL GUARD (SPA SAFE)
     ========================================================= */
  if (window.__SYNCSTATE_ACTIVE_URL__ === location.href) {
    return;
  }
  window.__SYNCSTATE_ACTIVE_URL__ = location.href;

  console.log("SyncState: initializing content script for", location.href);

  /* =========================================================
     SKU VALIDATION (STRICT)
     ========================================================= */
  function looksLikeSKU(val) {
    if (typeof val !== "string") return false;

    const v = val.trim();

    return (
      v.length >= 4 &&
      v.length <= 40 &&
      /[A-Z0-9]/i.test(v) &&      // must be alphanumeric
      !/^\d{8,}$/.test(v) &&      // reject long pure numbers (product IDs)
      !v.includes("  ") &&        // no excessive whitespace
      !v.toLowerCase().includes("resize")
    );
  }

  /* =========================================================
     SKU EXTRACTION
     ========================================================= */
  function extractSKU() {
    // 1. Inputs likely to contain SKU
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

    // 2. Known Shopify admin ID
    const byId = document.getElementById("InventoryCardSku");
    if (byId) {
      const val = (byId.value || byId.textContent || "").trim();
      if (looksLikeSKU(val)) return val;
    }

    // 3. Label-based search
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

    // 4. Data attributes
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

    return null;
  }

  /* =========================================================
     UI INJECTION
     ========================================================= */
  function injectSyncStateButton() {
    if (document.getElementById("syncstate-inject-button")) return;

    const actionContainer = document.querySelector(
      '[data-testid*="product"], [class*="Product"], [class*="Button"]'
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

    button.addEventListener("click", () => {
      chrome.runtime.sendMessage({ action: "openPopup" });
    });

    (actionContainer.parentElement || document.body).appendChild(button);
  }

  /* =========================================================
     MESSAGE HANDLING (FUTURE-PROOF)
     ========================================================= */
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "getSKU") {
      const sku = extractSKU();
      console.log("SyncState: extracted SKU =", sku);
      sendResponse({ sku });
      return true;
    }

    if (request.action === "injectButton") {
      injectSyncStateButton();
      sendResponse({ success: true });
      return true;
    }
  });

  /* =========================================================
     AUTO INJECT
     ========================================================= */
  setTimeout(injectSyncStateButton, 500);
  window.addEventListener("load", () => {
    setTimeout(injectSyncStateButton, 1000);
  });

  /* =========================================================
     MUTATION OBSERVER (DEBOUNCED)
     ========================================================= */
  let injectTimeout = null;

  const observer = new MutationObserver(() => {
    if (injectTimeout) return;

    injectTimeout = setTimeout(() => {
      injectTimeout = null;
      if (!document.getElementById("syncstate-inject-button")) {
        injectSyncStateButton();
      }
    }, 300);
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  /* =========================================================
     CLEANUP
     ========================================================= */
  window.addEventListener("beforeunload", () => {
    observer.disconnect();
  });

  console.log("SyncState: content script fully loaded");
})();
