# Chrome Extension Implementation (Phase 4)

## Overview

Completed full Chrome extension scaffolding for Shopify merchants to link product SKUs to Amazon ASINs for automated inventory synchronization.

## Files Created

### Core Extension Files

1. **`manifest.json`** (Extension configuration)
   - Manifest v3 specification
   - Permissions: storage, activeTab, scripting
   - Host permissions: myshopify.com admin products + api.syncstate.local
   - Background service worker: background.js
   - Content script injection with styles
   - Icons configuration (16px, 48px, 128px)

2. **`popup.html`** (Merchant UI - Extension popup)
   - Responsive design (400px width)
   - Auto-detects and displays product SKU
   - ASIN input form with validation
   - Save/Clear buttons
   - Status messages (success/error/loading)
   - Styled with gradient header and professional UI

3. **`popup.js`** (Popup logic)
   - Page load initialization
   - Shopify product page detection
   - Content script message handling
   - SKU extraction communication
   - ASIN validation (10 alphanumeric characters)
   - Local storage management
   - API integration with error handling
   - Offline-first approach (saves locally if backend unreachable)

4. **`content-script.js`** (Shopify page injection)
   - Injected into `https://*.myshopify.com/admin/products/*`
   - SKU extraction strategies:
     - Method 1: Scans for SKU:// labeled products
     - Method 2: Searches for labeled SKU fields
     - Method 3: Falls back to product ID from URL
   - Injects "🔗 Link to SyncState" button on product pages
   - Message listener for popup communication
   - Mutation observer for dynamic content
   - Auto-injection on page load and updates

5. **`background.js`** (Service worker - API & storage)
   - Message routing from popup/content-script
   - API communication with backend:
     - POST /api/sku-mapping (save mappings)
     - GET /api/alerts/unread (fetch alert count)
     - GET /api/product-sync/:id (get sync status)
   - Offline support: Queues mappings in storage if backend unreachable
   - Periodic sync every 5 minutes for pending mappings
   - Badge management: Shows unread alert count
   - Alarms for recurring tasks (sync, badge update)

6. **`styles.css`** (Shared styling)
   - CSS variables for consistent theming
   - Button, form, alert, and badge styles
   - Animations: fadeIn, slideIn, pulse, spin
   - Responsive design utilities
   - Dark mode support (@media prefers-color-scheme)
   - Mobile-friendly layout

### Documentation & Assets

7. **`README.md`** (Extension documentation)
   - Feature overview
   - File structure
   - Installation instructions (development mode)
   - Usage guide (SKU linking, alert management)
   - Architecture explanation (content script, popup, service worker)
   - API endpoints reference
   - Data storage schema
   - Security considerations
   - Troubleshooting guide
   - Development instructions
   - Chrome Web Store submission guide

8. **`icons/generate-icons.html`** (Icon generator)
   - HTML utility to generate 16x16, 48x48, 128x128 icons
   - Canvas-based SVG rendering with gradient
   - Download buttons for each size
   - Instructions for saving to icons folder

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│ CHROME BROWSER (Merchant's Machine)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Shopify Admin Page (product.myshopify.com/admin/products)  │ │
│  │                                                             │ │
│  │  [Content Script Injected]                                │ │
│  │  • Extracts SKU from page                                 │ │
│  │  • Injects "🔗 Link to SyncState" button                  │ │
│  │  • Handles popup communication                            │ │
│  └────────┬─────────────────────────────────────────────────┘ │
│           │                                                     │
│           │ (user clicks button or icon)                       │
│           ↓                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Popup (popup.html + popup.js)                             │ │
│  │ • Shows auto-detected SKU                                 │ │
│  │ • Input field for ASIN                                    │ │
│  │ • Save/Clear buttons                                      │ │
│  │ • Validation & status messages                            │ │
│  └────────┬─────────────────────────────────────────────────┘ │
│           │                                                     │
│           │ (user enters ASIN & clicks Save)                  │
│           ↓                                                     │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Service Worker (background.js)                            │ │
│  │ • Save to localStorage first (offline support)            │ │
│  │ • Attempt API sync to backend                             │ │
│  │ • Queue pending if backend unreachable                    │ │
│  │ • Periodic retry (5 min intervals)                        │ │
│  │ • Update badge with alert count                           │ │
│  └────────┬─────────────────────────────────────────────────┘ │
│           │                                                     │
│           ├──→ chrome.storage.local                            │
│           │    {sku_[SKU]: ASIN}                               │
│           │                                                     │
│           └──→ HTTPS (if connected)                            │
│                POST /api/sku-mapping                           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
                             │
                             ↓
                    ┌────────────────┐
                    │ SyncState      │
                    │ Backend API    │
                    │ (api.syncstate │
                    │ .local)        │
                    └────────────────┘
```

## Data Flow

### SKU Linking Flow

```
Merchant Action:
1. Navigate to Shopify product page
2. Click "🔗 Link to SyncState" button

Page Processing:
3. Content script detects click
4. Opens popup.html
5. Popup.js sends getSKU message to content script
6. Content script extracts SKU from page
7. Popup displays SKU in read-only field

Merchant Input:
8. Merchant enters Amazon ASIN
9. Clicks "Save Link"

Backend Sync:
10. Popup saves to chrome.storage.local (offline cache)
11. Popup calls background.js → POST /api/sku-mapping
12. Service worker sends to backend API
13. Backend validates & stores in DynamoDB
14. Success response → Popup confirms & closes
15. Error/timeout → Saved locally, retried in 5 min

Persistence:
16. Service worker checks pending mappings every 5 min
17. Retries any failed syncs
18. Updates badge with alert count every 1 min
```

## Integration Points

### With SyncState Backend

1. **SKU Mapping Endpoint**
   ```
   POST /api/sku-mapping
   {
     "sku": "PROD-12345",
     "asin": "B0A1B2C3D4E5",
     "source": "chrome-extension",
     "timestamp": "2024-01-15T10:30:00Z"
   }
   ```

2. **Alerts Endpoint**
   ```
   GET /api/alerts/unread
   Returns: { count: number, alerts: Alert[] }
   ```

3. **Product Sync Status Endpoint**
   ```
   GET /api/product-sync/:productId
   Returns: { synced: boolean, lastSync: timestamp, inventoryLevel: number }
   ```

## Testing Checklist

- [ ] Extension loads in `chrome://extensions/` (developer mode)
- [ ] Button injects on Shopify product pages
- [ ] SKU extracts correctly (test with multiple product types)
- [ ] ASIN input validates format (10 chars, alphanumeric)
- [ ] Saves to local storage with timestamp
- [ ] API call succeeds (test with mock backend)
- [ ] Handles API timeout gracefully (offline mode)
- [ ] Periodic sync retries failed mappings
- [ ] Badge updates with alert count (if alerts implemented)
- [ ] Popup shows status messages (success, error, loading)
- [ ] Clear button removes stored mapping
- [ ] Dark mode styling works in Chrome dark theme
- [ ] Extension works with multiple merchant accounts (separate storage per profile)

## Deployment Steps

1. **Generate Icons**
   - Open `icons/generate-icons.html` in browser
   - Click download buttons to save 3 PNG files
   - Save as: icon-16.png, icon-48.png, icon-128.png

2. **Test Locally**
   - Start SyncState backend on `https://api.syncstate.local`
   - Enable MOCK_DYNAMODB or configure real DynamoDB
   - Load extension in Chrome developer mode
   - Test on staging Shopify store

3. **Package for Release**
   - Zip all files (excluding node_modules, .git, etc.)
   - File manifest.json must be at top level of zip

4. **Submit to Chrome Web Store**
   - Create developer account ($5 one-time)
   - Upload packaged extension
   - Add detailed description, screenshots, privacy policy
   - Submit for review

5. **Post-Launch**
   - Monitor user feedback
   - Track installation/active user count in Web Store dashboard
   - Plan updates based on merchant requests

## Next Steps

1. ✅ **Done**: Extension scaffolding complete
2. **TODO**: Generate and commit icon PNG files
3. **TODO**: Test with real Shopify store (staging)
4. **TODO**: Deploy backend API endpoints (if not already done)
5. **TODO**: Create Chrome Web Store listing assets (screenshots, description)
6. **TODO**: Beta test with 2-3 merchants
7. **TODO**: Submit to Chrome Web Store

## Known Limitations

- Requires merchant to be logged into Shopify product page to use extension
- SKU extraction depends on Shopify's current HTML structure (may need updates if Shopify redesigns)
- Backend API must be accessible from merchant's network (CORS considerations)
- No multi-workspace support per Chrome profile (future enhancement)

## Security Notes

- ✅ Minimal permissions requested (storage, activeTab, scripting)
- ✅ Only communicates with Shopify & backend API (no third parties)
- ✅ All sensitive data stored locally in encrypted Chrome storage
- ✅ No passwords or auth tokens stored in extension
- ⚠️ **TODO**: Add API key management for merchant-specific access (production)

## Version

- **Extension Version**: 1.0.0
- **Manifest Version**: 3 (Latest Chrome standard)
- **Compatible**: Chrome 88+ (Manifest v3 support)
