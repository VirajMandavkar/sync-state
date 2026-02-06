# SyncState API Quick Reference Guide

## 🚀 Getting Started

1. **Start the server:**
   ```bash
   npm run start
   ```
   Expected: `SyncState prototype listening on 3000`

2. **Run tests:**
   ```bash
   npm run test          # Phase 1: 10 tests (Shopify→Amazon)
   npm run test:phase2   # Phase 2: 7 tests (Amazon returns)
   ```

3. **Configuration:**
   - Edit `.env` for AWS/Amazon credentials
   - Set `MOCK_AMAZON=true` to use mock mode (no real API calls)
   - Set `MOCK_AMAZON=false` for real Amazon SP-API

---

## Phase 1: Shopify → Amazon Sync

### POST /webhook/shopify
**Ingest Shopify sale event**

Request body:
```json
{
  "orderId": "ORDER-123",
  "items": [
    {
      "sku": "PROD-001",
      "quantity": 2
    },
    {
      "sku": "PROD-002", 
      "quantity": 1
    }
  ]
}
```

Response:
```json
{
  "success": true,
  "queued": 2,
  "inventoryAfter": {
    "PROD-001": 48,
    "PROD-002": 99
  },
  "broadcastAfter": {
    "PROD-001": 43,
    "PROD-002": 94
  }
}
```

**What happens:**
1. Physical inventory decremented
2. Buffer applied: broadcast = max(0, physical - buffer)
3. Job queued for Amazon
4. Background worker sends update at next available slot (0.5 req/sec)
5. Transaction ID stored for echo prevention

**Example (curl):**
```bash
curl -X POST http://localhost:3000/webhook/shopify \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER-456",
    "items": [{"sku": "PROD-001", "quantity": 2}]
  }'
```

**Example (PowerShell):**
```powershell
$body = @{
  orderId = "ORDER-456"
  items = @(@{sku = "PROD-001"; quantity = 2})
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3000/webhook/shopify" `
  -Method POST `
  -Body $body `
  -ContentType "application/json"
```

---

### GET /health
**Check server status**

Response:
```json
{
  "status": "ok",
  "queueSize": 5,
  "timestamp": "2026-02-06T10:30:00Z"
}
```

---

## Phase 2: Amazon Returns → Shopify

### POST /webhook/amazon/return
**Ingest Amazon FBA return event**

Request body:
```json
{
  "orderId": "AMAZON-789",
  "sku": "PROD-001",
  "quantity": 1,
  "disposition": "SELLABLE",
  "returnedAt": "2026-02-06T09:00:00Z"
}
```

Disposition types:
- `SELLABLE` — Item OK, sync back to Shopify ✓
- `CUSTOMER_DAMAGED` — Customer broke it, don't sell again ✗
- `WAREHOUSE_DAMAGED` — Amazon's warehouse broke it, quarantine ✗
- `CARRIER_DAMAGED` — Shipper damaged in transit, quarantine ✗
- `UNSELLABLE` — General refuse, don't sell ✗
- `UNKNOWN` — Unclear, alert merchant for manual review ❓

Response:
```json
{
  "processed": true,
  "synced": true,
  "action": "sync",
  "inventoryAfter": 51,
  "broadcastAfter": 46,
  "alert": null
}
```

**What happens:**
1. Return event validated
2. Disposition filter applied
3. If SELLABLE:
   - Physical inventory **incremented** (add back to stock)
   - Job queued to update Amazon
   - No alert created
4. If DAMAGED/UNSELLABLE:
   - Physical inventory **NOT changed**
   - Merchant alert created (warning or critical)
   - Audit trail recorded
5. Every return **logged for compliance**

Response with blocked return:
```json
{
  "processed": true,
  "synced": false,
  "action": "alert_only",
  "inventoryAfter": 50,
  "broadcastAfter": 45,
  "alert": {
    "id": "alert-1234567890",
    "type": "return_damaged",
    "severity": "warning",
    "message": "Customer damaged return for PROD-001. DO NOT sync back to Shopify.",
    "sku": "PROD-001"
  }
}
```

**Example (curl):**
```bash
curl -X POST http://localhost:3000/webhook/amazon/return \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "AMAZON-789",
    "sku": "PROD-001",
    "quantity": 1,
    "disposition": "SELLABLE",
    "returnedAt": "2026-02-06T09:00:00Z"
  }'
```

---

## Stock Buffer Management

### POST /api/buffer/:sku
**Set safety buffer for a SKU**

Request:
```json
{
  "bufferQty": 10
}
```

Example:
```bash
curl -X POST http://localhost:3000/api/buffer/PROD-001 \
  -H "Content-Type: application/json" \
  -d '{"bufferQty": 10}'
```

Response:
```json
{
  "sku": "PROD-001",
  "physical": 50,
  "buffer": 10,
  "broadcast": 40,
  "message": "Buffer set to 10. Will broadcast 40 to Amazon."
}
```

**What it means:**
- You have **50** units on shelf (physical)
- You want to keep **10** units as reserve (buffer)
- Amazon sees **40** units available (broadcast = 50 - 10)
- If someone buys 40 units on Amazon, you still have 10 for Shopify/returns

---

### GET /api/buffer/:sku
**Check current buffer and inventory state**

Example:
```bash
curl http://localhost:3000/api/buffer/PROD-001
```

Response:
```json
{
  "sku": "PROD-001",
  "physical": 50,
  "buffer": 10,
  "broadcast": 40,
  "lastBroadcast": {
    "count": 40,
    "txId": "uuid-1234-5678"
  }
}
```

---

## Inventory Status

### GET /api/inventory/:sku
**Get full inventory status for one SKU**

Example:
```bash
curl http://localhost:3000/api/inventory/PROD-001
```

Response:
```json
{
  "sku": "PROD-001",
  "physical": 50,
  "buffer": 10,
  "broadcast": 40,
  "lastBroadcast": {
    "count": 40,
    "txId": "uuid-1234-5678",
    "timestamp": "2026-02-06T10:25:00Z"
  },
  "returns": [
    {
      "quantity": 1,
      "disposition": "SELLABLE",
      "timestamp": "2026-02-06T09:00:00Z"
    },
    {
      "quantity": 1,
      "disposition": "CUSTOMER_DAMAGED",
      "timestamp": "2026-02-06T09:30:00Z"
    }
  ]
}
```

---

### GET /api/inventory
**Get inventory for all SKUs**

Example:
```bash
curl http://localhost:3000/api/inventory
```

Response:
```json
{
  "PROD-001": {
    "physical": 50,
    "buffer": 10,
    "broadcast": 40
  },
  "PROD-002": {
    "physical": 0,
    "buffer": 0,
    "broadcast": 0
  },
  "PROD-003": {
    "physical": 150,
    "buffer": 20,
    "broadcast": 130
  }
}
```

---

## Merchant Alerts

### GET /api/alerts/unread
**Get all unread alerts**

Example:
```bash
curl http://localhost:3000/api/alerts/unread
```

Response:
```json
{
  "unreadCount": 2,
  "alerts": [
    {
      "id": "alert-1234567890",
      "type": "return_damaged",
      "severity": "warning",
      "sku": "PROD-001",
      "message": "Customer damaged return for PROD-001 (qty: 1). DO NOT sync back to Shopify.",
      "timestamp": "2026-02-06T09:30:00Z",
      "read": false
    },
    {
      "id": "alert-1234567891",
      "type": "return_unsellable",
      "severity": "info",
      "sku": "PROD-002",
      "message": "Unsellable return for PROD-002 (qty: 2). Will be disposed.",
      "timestamp": "2026-02-06T10:00:00Z",
      "read": false
    }
  ]
}
```

Alert types:
- `return_damaged` — Damaged return (customer, warehouse, or carrier damage)
- `return_unsellable` — Cannot be resold
- `stock_low` — Inventory below threshold
- `sync_failed` — Failed to update Amazon
- `manual_review` — Needs merchant attention

Alert severities:
- `info` — FYI, no action needed ℹ️
- `warning` — Action recommended ⚠️
- `critical` — Urgent, inventory quarantined 🚨

---

### GET /api/alerts/severity/:level
**Filter alerts by severity**

Example:
```bash
curl http://localhost:3000/api/alerts/severity/warning
```

Valid levels: `info`, `warning`, `critical`

Response:
```json
{
  "severity": "warning",
  "count": 3,
  "alerts": [
    {
      "id": "alert-1234567890",
      "type": "return_damaged",
      "severity": "warning",
      "sku": "PROD-001",
      "message": "...",
      "timestamp": "2026-02-06T09:30:00Z",
      "read": false
    }
  ]
}
```

---

### POST /api/alerts/:alertId/read
**Mark an alert as read**

Example:
```bash
curl -X POST http://localhost:3000/api/alerts/alert-1234567890/read
```

Response:
```json
{
  "alertId": "alert-1234567890",
  "read": true,
  "message": "Alert marked as read"
}
```

---

## Testing Workflows

### Quick Test: Full Cycle
```bash
# Terminal 1: Start server
npm run start

# Terminal 2: Send a Shopify sale
curl -X POST http://localhost:3000/webhook/shopify \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "TEST-001",
    "items": [{"sku": "TEST-SKU", "quantity": 5}]
  }'

# Wait 2-3 seconds (rate limiting)

# Check inventory
curl http://localhost:3000/api/inventory/TEST-SKU

# Simulate a return
curl -X POST http://localhost:3000/webhook/amazon/return \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "AMZ-001",
    "sku": "TEST-SKU",
    "quantity": 2,
    "disposition": "SELLABLE",
    "returnedAt": "2026-02-06T10:00:00Z"
  }'

# Check alerts (should be none for SELLABLE)
curl http://localhost:3000/api/alerts/unread

# Try a damaged return
curl -X POST http://localhost:3000/webhook/amazon/return \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "AMZ-002",
    "sku": "TEST-SKU",
    "quantity": 1,
    "disposition": "CUSTOMER_DAMAGED",
    "returnedAt": "2026-02-06T10:05:00Z"
  }'

# Check alerts (should now show WARNING)
curl http://localhost:3000/api/alerts/severity/warning
```

### Automation Test
```bash
npm run test          # Phase 1 (10 tests)
npm run test:phase2   # Phase 2 (7 tests)
```

---

## Troubleshooting

**Q: Server won't start**
- Check port 3000 not in use: `netstat -ano | findstr 3000`
- Kill blocking process: `taskkill /PID <pid> /F`
- Restart: `npm run start`

**Q: Tests fail with "MOCK_AMAZON not set"**
- Edit `.env`: ensure `MOCK_AMAZON=true`
- Restart server: `npm run start`

**Q: "Cannot read properties of undefined"**
- Delete old store: `rm data/store.json -Force`
- Restart: `npm run start`

**Q: Rate limiting seems slow**
- Expected! Amazon allows 0.5 req/sec = one request every 2 seconds
- This is by design to avoid rate limit errors
- Check `src/amazonClient.ts` for `Bottleneck` configuration

**Q: Amazon returns HTTP 403**
- Your seller account lacks inventory entitlements
- **Solution:** Use `MOCK_AMAZON=true` (active by default)
- When ready: Go to Seller Central → Developer apps → Grant inventory scope

**Q: Webhook not firing**
- Check server logs for errors
- Verify request body JSON is valid
- Try manual curl command from Troubleshooting section

---

## Performance Metrics

From test runs:
- **Webhook ingestion:** <50ms
- **Physical count update:** <10ms
- **Queue delay:** 0ms (immediate)
- **Amazon rate limiting:** 2000ms per request (0.5 req/sec)
- **Return processing:** <100ms
- **Alert creation:** <50ms
- **Persistence (file write):** <200ms

Total E2E for one item: ~2-4 seconds (depends on queue position)

---

## Next Steps

1. **Try the quick test above** to verify everything works
2. **Modify `.env`** with your real Amazon credentials when ready
3. **Run the full test suite** to validate all scenarios
4. **Deploy to AWS Lambda** for production (future)
5. **Add Chrome extension** to link Shopify + Amazon SKUs (future)

Questions? Check the actual test files for working examples:
- `tests/integration.ts` — Phase 1 examples
- `tests/phase2.ts` — Phase 2 examples
