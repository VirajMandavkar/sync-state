# SyncState Architecture: Phase 1 + Phase 2

## Complete Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        SYNCSTATE FULL ARCHITECTURE                          │
└─────────────────────────────────────────────────────────────────────────────┘

                              shopigy ORDERS
                                   │
                                   ↓
                    ┌──────────────────────────┐
                    │  POST /webhook/shopify   │ ← PHASE 1 INGESTION
                    │  (Order sale event)      │
                    └──────────────────────────┘
                                   │
                    ┌──────────────┴─────────────┐
                    │ PHASE 1: Sales Processing  │
                    │ - Parse items & quantities │
                    │ - Decrement inventory      │
                    │ - Apply buffer logic       │
                    │ - Queue Amazon update      │
                    └──────────────┬──────────────┘
                                   │
                                   ↓
                     ┌─────────────────────────┐
                     │   Background Worker     │
                     │  (Rate limiter active)  │
                     │   Bottleneck: 0.5/sec   │
                     └──────────────┬──────────┘
                                    │
                 ┌──────────────────┴────────────────────┐
                 │                                       │
                 ↓                                       ↓
        ┌─────────────────┐                  ┌──────────────────────┐
        │  MOCK_AMAZON    │                  │  Real Amazon SP-API  │
        │  (for testing)  │                  │  (production)        │
        └────────┬────────┘                  └──────────┬───────────┘
                 │                                      │
                 └──────────────────┬───────────────────┘
                                    │
                                    ↓
                    ┌───────────────────────────┐
                    │  AMAZON INVENTORY UPDATED │
                    │  (qty = max(0, phys-buf)) │
                    └───────────────┬───────────┘
                                    │
                    ╔═══════════════════════════════╗
                    ║  Time passes (days, weeks)    ║
                    ║  Customer uses product        ║
                    ║  Customer returns to FBA      ║
                    ╚═══════════════════════════════╝
                                    │
                                    ↓
            ┌───────────────────────────────────────┐
            │   Amazon FBA Return Processed         │
            │   Disposition determined:             │
            │   - SELLABLE                          │
            │   - CUSTOMER_DAMAGED                  │
            │   - WAREHOUSE_DAMAGED                 │
            │   - CARRIER_DAMAGED                   │
            │   - UNSELLABLE                        │
            │   - UNKNOWN                           │
            └───────────────┬───────────────────────┘
                            │
                            ↓
                ┌─────────────────────────────┐
                │  FBA_INVENTORY_CHANGE EVENT │
                │  POST /webhook/amazon/return│ ← PHASE 2 INGESTION
                └──────────────┬──────────────┘
                               │
               ┌───────────────┴────────────────┐
               │  PHASE 2: Return Processing    │
               │  - Filter by disposition       │
               │  - Block bad dispositions      │
               │  - Create merchant alerts      │
               │  - Record audit trail          │
               └───────────────┬────────────────┘
                               │
                ┌──────────────┬┴────────────────┐
                │              │                 │
        ┌───────────────┐      │         ┌──────────────────┐
        │ SELLABLE (✓)  │      │         │ DAMAGED (✗)      │
        │ - Sync back   │      │         │ - Block sync     │
        │ - Add to      │      │         │ - Create alert   │
        │   Shopify     │      │         │ - Quarantine     │
        │ - Queue       │      │         │ - Log audit      │
        │   Amazon updt │      │         └──────────────────┘
        └───────┬───────┘      │
                │          ┌───┴───────┐
                ↓          │           │
         ┌──────────────┐ ⚠️WARNING   🚨CRITICAL
         │ New customer │(unsellable) (warehouse dmg)
         │ can now buy  │
         │ item again ✓ │
         └──────────────┘

                        PHASE 2 DISPOSITION TREE
                        
                              Return Event
                                   │
                        ┌──────────┴──────────┐
                        │ Disposition Filter  │
                        └──────────┬──────────┘
                                   │
          ┌────────────────────────┼────────────────────────┐
          │                        │                        │
    ┌─────▼─────┐         ┌──────▼──────┐         ┌───────▼────┐
    │ SELLABLE  │         │   DAMAGED   │         │ UNSELLABLE │
    │           │         │             │         │            │
    │ Action:   │         │ Action:     │         │ Action:    │
    │  Sync ✓   │         │  Alert ⚠️   │         │  Ignore ✗  │
    │           │         │  Block ✗    │         │            │
    │ Alert:    │         │  Quarantine │         │ Alert:     │
    │  None     │         │             │         │  Info ℹ️   │
    │           │         │ Alert Type: │         │            │
    │ Severity: │         │  Warning    │         │ Severity:  │
    │  (none)   │         │  or Critical│         │  Info      │
    └───────────┘         └─────────────┘         └────────────┘

                        BROADCAST COUNT FORMULA
                        
        Broadcast to Amazon = max(0, Physical - Buffer)
        
        Example 1: Physical=50, Buffer=5
        → Broadcast = 50-5 = 45 (send 45 to Amazon)
        
        Example 2: Physical=3, Buffer=5
        → Broadcast = max(0, 3-5) = 0 (don't sell on Amazon)
        
        Example 3: SELLABLE return of 2 units
        → Physical += 2
        → Broadcast = max(0, (50+2)-5) = 47
        
```

## Data Flow Summary

### Phase 1: Shopify → Amazon
```
Sale on Shopify
  ↓
Webhook: POST /webhook/shopify
  ↓
Decrement physical inventory
  ↓
Calculate: broadcast = max(0, physical - buffer)
  ↓
Queue job to AWS/mock
  ↓
Background worker sends to Amazon
  ↓
Amazon inventory updated
```

### Phase 2: Amazon → Shopify (Filtered)
```
Return processed in FBA
  ↓
Amazon sends disposition event
  ↓
Webhook: POST /webhook/amazon/return
  ↓
Filter by disposition
  ├─ SELLABLE → Sync ✓
  ├─ DAMAGED → Alert + quarantine ✗
  └─ UNSELLABLE → Dispose, no sync ✗
  ↓
If SELLABLE: Add back to Shopify inventory
  ↓
All: Log audit trail + create alerts
```

## State Storage

```
data/store.json
{
  "physical": {
    "PROD-001": 50,      ← Current on-hand inventory
    "PROD-002": 0
  },
  "buffer": {
    "PROD-001": 5,       ← Safety reserve (don't sell past this)
    "PROD-002": 0
  },
  "broadcast": {
    "PROD-001": 45,      ← What we told Amazon (read-only, computed)
    "PROD-002": 0
  },
  "transactions": {
    "tx-uuid-1": true,   ← Echo prevention: seen this before?
    "tx-uuid-2": true
  },
  "lastBroadcast": {
    "PROD-001": {        ← Last state sent to Amazon
      "count": 45,
      "tx": "tx-uuid-1"
    }
  },
  "returns": {
    "PROD-001": [        ← All returns (audit trail)
      {
        "quantity": 2,
        "disposition": "SELLABLE",
        "timestamp": "2026-02-06T10:30:00Z"
      },
      {
        "quantity": 1,
        "disposition": "CUSTOMER_DAMAGED",
        "timestamp": "2026-02-06T10:35:00Z"
      }
    ]
  },
  "alerts": [            ← All merchant alerts
    {
      "id": "alert-123",
      "type": "return_damaged",
      "severity": "warning",
      "sku": "PROD-001",
      "message": "Customer damaged return...",
      "timestamp": "2026-02-06T10:35:00Z",
      "read": false
    }
  ]
}
```

## Rate Limiting Strategy

```
Shopify Webhook Queue:
  ↓ (immediate, no delay)
  
SyncState In-Memory Job Queue:
  ↓
  
Bottleneck Rate Limiter:
  ├─ Min time: 2000ms (0.5 requests/sec)
  ├─ Amazon SP-API limit: 0.5 req/sec per seller
  ├─ Ensures: Never exceeds Amazon's quota
  └─ Result: Multiple Shopify events staggered at Amazon
  
Example:
  t=0ms:   100 Shopify orders arrive → queued instantly ✓
  t=0ms:   First job to Amazon
  t=2000ms: Second job to Amazon
  t=4000ms: Third job to Amazon
  ... (continuing at 0.5 req/sec)
```

## Endpoints Summary

### Phase 1 Endpoints
- `POST /webhook/shopify` — Ingest Shopify sale
- `GET /health` — Server health

### Phase 2 Endpoints
- `POST /webhook/amazon/return` — Ingest Amazon return
- `GET /api/alerts/unread` — Get merchant unread alerts
- `GET /api/alerts/severity/:level` — Filter by severity
- `POST /api/alerts/:alertId/read` — Mark alert read
- `POST /api/buffer/:sku` — Set safety buffer
- `GET /api/buffer/:sku` — Get buffer + inventory state
- `GET /api/inventory/:sku` — Full inventory status for one SKU
- `GET /api/inventory` — Inventory for all SKUs

---

This architecture solves the **"Death Spiral"** by:

1. ✅ **Sub-second ingestion** — Shopify sales reach Amazon in <60s
2. ✅ **Buffer logic** — Never over-sell on Amazon
3. ✅ **Return filtering** — Damaged items never reach Shopify customers
4. ✅ **Echo prevention** — No double-counting
5. ✅ **Audit trail** — Compliance + merchant visibility
6. ✅ **Rate limiting** — Amazon API compliant
7. ✅ **Persistence** — Survives restarts

**Result: Merchant never faces Amazon account suspension due to inventory mismatches.**
