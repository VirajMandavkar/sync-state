# SyncState Chrome Extension

A Shopify merchant extension for mapping product SKUs to Amazon ASINs for automated inventory synchronization.

## Features

- **Auto SKU Extraction**: Automatically detects and displays product SKU from Shopify product pages
- **ASIN Linking**: Simple UI to enter and save Amazon ASIN for quick linking
- **Offline Support**: Stores mappings locally if backend is unreachable, syncs automatically when available
- **Alert Notifications**: Badge shows count of unread inventory alerts
- **Persistent Storage**: Uses Chrome storage API to remember mappings across sessions
- **Secure**: All data stored locally; only syncs mappings relevant to merchant

## File Structure

```
chrome-extension/
├── manifest.json          # Extension configuration & permissions
├── popup.html             # Popup UI for SKU-to-ASIN linking
├── popup.js               # Popup logic & event handlers
├── content-script.js      # Injected into Shopify product pages
├── background.js          # Service worker for API calls & storage
├── styles.css             # Shared styles
├── icons/
│   ├── icon-16.png        # 16x16 favicon
│   ├── icon-48.png        # 48x48 toolbar icon
│   └── icon-128.png       # 128x128 Chrome Web Store icon
└── README.md              # This file
```

## Installation (Development)

1. Clone or download this folder
2. Open `chrome://extensions/` in Chrome
3. Enable "Developer mode" (top-right toggle)
4. Click "Load unpacked" and select this `chrome-extension` folder
5. The extension will appear in the Chrome toolbar

## Usage

### Linking a Product

1. Navigate to a Shopify product page (`myshopify.com/admin/products/[product-id]`)
2. Click the **🔗 Link to SyncState** button (injected on the page)
3. The extension popup opens and auto-detects the product SKU
4. Enter the corresponding Amazon ASIN (10-character code)
5. Click **Save Link** to save the mapping

### Managing Links

- Click the SyncState extension icon → popup appears with current SKU/ASIN
- Click **Clear** to remove a mapping
- All mappings are saved to local storage automatically

### Alerts

- The extension badge on the toolbar shows the count of unread inventory alerts
- Badge updates every minute (or on demand from backend)
- Click the icon to view alerts in the popup

## Architecture

### Content Script (`content-script.js`)
- Injects into `https://*.myshopify.com/admin/products/*`
- Extracts product SKU using multiple strategies:
  1. Scans for `SKU://` label with value
  2. Looks for "SKU" labeled fields
  3. Falls back to product ID from URL
- Injects "Link to SyncState" button on product pages
- Handles message routing from popup

### Popup (`popup.html` & `popup.js`)
- Displays current SKU (auto-detected or cached)
- Text input for ASIN entry
- Validates ASIN format (10 alphanumeric characters)
- Saves to both local storage and backend API
- Shows status messages (success/error/loading)

### Service Worker (`background.js`)
- Handles all API communication with backend
- Implements offline-first approach:
  - Stores mappings in Chrome storage first
  - Attempts to sync to backend
  - Fails gracefully if backend unreachable
- Runs periodic sync tasks (every 5 minutes) to catch pending mappings
- Updates extension badge with alert count (every 1 minute)
- Listens for messages from popup and content scripts

### Styles (`styles.css`)
- CSS variables for consistent theming
- Mobile-friendly responsive design
- Dark mode support
- Animations and transitions
- Utility class system

## API Integration

### Backend Endpoints Used

```typescript
POST /api/sku-mapping
  Body: { sku: string, asin: string, source: "chrome-extension", timestamp: ISO }
  Response: { success: boolean, mapping: { sku, asin, created, lastUpdated } }

GET /api/alerts/unread
  Response: { count: number, alerts: Alert[] }

GET /api/product-sync/:productId
  Response: { lastSync?: timestamp, synced: boolean, inventoryLevel: number, errors: string[] }
```

### Configuration

- **API Base**: `https://api.syncstate.local` (configurable in `background.js`)
- **API Timeout**: 10 seconds (configurable)
- **Periodic Sync**: Every 5 minutes
- **Badge Update**: Every 1 minute

## Data Storage

All data stored via `chrome.storage.local` (encrypted per Chrome profile):

```typescript
sku_[SKU]: ASIN                    // Mapped ASIN for SKU
sku_[SKU]_timestamp: ISO           // When mapping was created/updated
product_sync_[ID]: SyncStatus      // Cached sync status for product
unreadAlerts: Alert[]              // Last fetched unread alerts
```

## Security

- **Permissions**: Only requests `storage`, `activeTab`, `scripting`
- **Host Permissions**: Only `*.myshopify.com/admin/products/*` and backend API
- **No Auth Required**: Uses Shopify session for auth (merchant logged in to admin)
- **Data**: SKU/ASIN pairs only, no passwords or sensitive data stored
- **Backend Auth**: Should use API key exchange or OAuth in production

## Troubleshooting

### "Not on a Shopify product page"
- Extension only works on Shopify admin product pages
- URL must be `https://[store].myshopify.com/admin/products/[id]`

### "Could not extract SKU"
- Some products may not have SKU set in Shopify
- Check that SKU field is populated in product settings
- Fallback uses product ID (format: `PRODUCT-[id]`)

### "Backend unreachable" / "Saved locally"
- Backend API is offline
- Mapping saved to browser storage
- Will sync automatically when backend is available (checked every 5 minutes)

### Extension not injecting button
- Refresh the Shopify page after installing extension
- Check that extension is enabled in `chrome://extensions/`
- Open DevTools (F12) → Console for error messages

## Development

### Testing Locally

1. Start the SyncState backend on `https://api.syncstate.local`
2. Load extension with `MOCK_DYNAMODB=true` enabled on backend
3. Navigate to any Shopify product page (staging/test shop)
4. Map a SKU to ASIN and verify it appears in backend database

### Building for Release

```bash
# Pack extension for Chrome Web Store
# Requires: Private key (store securely)

zip -r syncstate-extension.zip chrome-extension/ \
  -x "*.git*" "*.DS_Store" "README.md"
```

### Chrome Web Store Submission

1. Create developer account (one-time $5 fee)
2. Upload packaged extension
3. Add detailed description, screenshots, video
4. Submit for review (typically 1–3 days)
5. Once approved, extension available to install from Web Store

## Future Enhancements

- [ ] Settings page for API key management
- [ ] Bulk SKU import from CSV
- [ ] Inventory level live dashboard
- [ ] Return status tracking
- [ ] Merchant onboarding wizard
- [ ] Multi-language support
- [ ] Export mapping history

## Support

For issues or feature requests, contact: support@syncstate.local

## License

Copyright © 2024 SyncState. All rights reserved.
