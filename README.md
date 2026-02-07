# SyncState Prototype (Phase 1 + Real Amazon SP-API)

Fast Shopify → Amazon one-way valve with buffer logic, echo-prevention stubs, and **real Amazon SP-API integration** using LWA authentication.

## Setup

### Prerequisites
- Node.js 16+
- The `.env` file populated with credentials (already created)

### Install & Run

1. Install dependencies:

```bash
npm install
```

2. Start the server:

```bash
npm run start
```

Server listens on `http://localhost:3000`

## API

### Health check
```bash
curl http://localhost:3000/health
```

### Send a Shopify webhook (simulate a sale)
```bash
curl -X POST http://localhost:3000/webhook/shopify \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ord-1",
    "items": [
      {"sku": "SKU-123", "quantity": 1}
    ]
  }'
```

**Response:**
```json
{
  "ok": true,
  "orderId": "ord-1",
  "tx": "uuid-here"
}
```

## Architecture

- **`lwa.ts`** – LWA Token Manager: Exchanges refresh_token for short-lived OAuth2 access tokens
- **`amazonClient.ts`** – Real SP-API: Calls `PUT /inventory/v1/inventory/{sku}` to update Amazon inventory
- **`store.ts`** – Local file-backed store for physical counts, buffers, and echo-prevention transactions
- **`queue.ts`** – In-memory job queue (SQS-like)
- **`worker.ts`** – Background job processor that rate-limits calls to Amazon (0.5 req/sec)
- **`index.ts`** – Express webhook listener + Buffer logic
- **`.env`** – Credentials (AWS keys, SP-API Client ID/Secret/Refresh Token)

## Credentials (in `.env`)

```
AWS_ACCESS_KEY_ID=...
AWS_SECRET_ACCESS_KEY=...
SP_API_CLIENT_ID=...
SP_API_CLIENT_SECRET=...
SP_API_REFRESH_TOKEN=...
AMAZON_REGION=us-east-1
AMAZON_MARKETPLACE_ID=ATVPDKIKX0DER
```

⚠️ **Do NOT commit `.env` to Git** — it's in `.gitignore`

## Next Steps

- [ ] Phase 2: Add return handling (Disposition filter)
- [ ] Phase 3: DynamoDB for persistent SKU↔ASIN mapping
- [ ] Phase 4: Chrome extension for product mapping UI
- [ ] Add proper error handling + retry logic for failed Amazon updates
# sync-state
