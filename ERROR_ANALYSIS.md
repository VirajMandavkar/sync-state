# Error & Edge Case Analysis Report

## Critical Issues Found

### 1. ⚠️ INPUT VALIDATION - SKU Field
**Location:** `src/index.ts` line 45  
**Issue:** No validation that SKU is non-empty string
```typescript
const sku: string = it.sku;  // ← Could be "", null, undefined
```
**Risk:** Empty SKU could cause DynamoDB errors or data corruption  
**Severity:** MEDIUM

**Recommended Fix:**
```typescript
const sku = String(it.sku || "").trim();
if (!sku) {
  return res.status(400).json({ error: "SKU cannot be empty" });
}
```

---

### 2. ⚠️ QUANTITY VALIDATION - No Range Check
**Location:** `src/index.ts` line 47  
**Issue:** Accepts negative quantities and very large numbers
```typescript
const qty: number = Number(it.quantity ?? 1);
// No check for negative or unreasonably large values
```
**Risk:** 
- Negative qty can increase inventory instead of decreasing
- Very large qty can cause integer overflow
- Malicious abuse possible

**Severity:** MEDIUM

**Recommended Fix:**
```typescript
const requestedQty = Number(it.quantity ?? 1);
if (!Number.isInteger(requestedQty) || requestedQty < 0) {
  return res.status(400).json({ error: "Quantity must be a non-negative integer" });
}
if (requestedQty > 1_000_000) {
  return res.status(400).json({ error: "Quantity too large (max: 1,000,000)" });
}
const qty = requestedQty;
```

---

### 3. ⚠️ RETURN QUANTITY VALIDATION
**Location:** `src/index.ts` line 88  
**Issue:** No validation that return quantity is positive
```typescript
quantity: body.quantity,  // ← Could be negative, zero, or NaN
```
**Risk:** Negative returns could be mishandled  
**Severity:** MEDIUM

**Recommended Fix:**
```typescript
const returnQty = Number(body.quantity || 0);
if (!Number.isInteger(returnQty) || returnQty <= 0) {
  return res.status(400).json({ error: "Return quantity must be a positive integer" });
}
```

---

### 4. ⚠️ BUFFER FLOAT VALUES
**Location:** `src/index.ts` line 125  
**Issue:** Accepts float values for bufferQty
```typescript
if (typeof bufferQty !== "number" || bufferQty < 0) {
  // Does not check if it's an integer
}
```
**Risk:** Float buffers (5.7) could cause calculation precision issues  
**Severity:** LOW

**Recommended Fix:**
```typescript
if (typeof bufferQty !== "number" || !Number.isInteger(bufferQty) || bufferQty < 0) {
  return res.status(400).json({ error: "Buffer must be a non-negative integer" });
}
```

---

### 5. ⚠️ RACE CONDITION - Echo Prevention
**Location:** `src/returnHandler.ts` line 40  
**Issue:** Echo check happens AFTER return processing could start
```typescript
const isEcho = await store.isEcho(tx);
if (isEcho) {
  // But another request could delete this and reprocess
}
```
**Risk:** Two simultaneous identical return events could both process  
**Severity:** LOW (Amazon sends unique txIds)

**Note:** This is acceptable with DynamoDB's consistency model, but could be hardened with transactions.

---

### 6. ⚠️ MISSING SKU IN RETURN
**Location:** `src/index.ts` line 88  
**Issue:** No validation that SKU is non-empty
```typescript
if (!body || !body.sku || !body.quantity || !body.disposition) {
  // But empty string for sku would pass this check
}
```
**Severity:** MEDIUM

**Recommended Fix:**
```typescript
const sku = String(body.sku || "").trim();
if (!sku || !body.quantity || !body.disposition) {
  return res.status(400).json({
    error: "Missing required fields: sku, quantity, disposition"
  });
}
```

---

### 7. ⚠️ CONCURRENT INVENTORY UPDATES - Race Condition
**Location:** `src/store.ts` (cache layer)  
**Issue:** In-memory cache doesn't prevent race conditions
```typescript
// Request 1
const cur = await getPhysicalCount(sku);  // Gets 100, caches it
// Request 2
const cur = await getPhysicalCount(sku);  // Gets same 100 from cache
// Both could then decrement and both succeed, losing one update
```
**Risk:** Concurrent orders could cause inventory discrepancies  
**Severity:** MEDIUM (in high-traffic scenarios)

**Note:** DynamoDB ACID on single items prevents divergence at DB level, but cached reads create risk.

**Mitigation:** The 1-minute cache is acceptable for most scenarios. For critical accuracy, could add atomic increment operation (DynamoDB Update Expressions).

---

### 8. ⚠️ MISSING AND FIELD TYPE ERRORS
**Location:** `src/index.ts` line 82-83  
**Issue:** No validation that returnOrderId and reason are strings
```typescript
returnOrderId: body.returnOrderId ?? "unknown",  // Could be object
reason: body.reason ?? "No reason provided",      // Could be object
```
**Severity:** LOW

---

### 9. ⚠️ BUFFER AND PHYSICAL CALCULATION WITHOUT NULL CHECKS  
**Location:** `src/index.ts` line 59, 178  
**Issue:** Assumes getBuffer() never fails
```typescript
const buffer = await store.getBuffer(sku);
const broadcastCount = Math.max(0, nextPhysical - buffer);
// If getBuffer throws, request fails
```
**Severity:** LOW (handled by try/catch in route)

---

### 10. ⚠️ EMPTY ITEMS ARRAY
**Location:** `src/index.ts` line 45-70  
**Issue:** No check for empty items array
```typescript
for (const it of body.items) {
  // If body.items is [], loop doesn't execute
}
// Returns success with queued: 0
```
**Note:** This is acceptable behavior (idempotent), but could warn in logs.

---

## Summary of Fixes Needed

| Issue | Severity | Fix Effort | Impact |
|-------|----------|-----------|--------|
| SKU validation | MEDIUM | 5 min | Prevent empty SKUs |
| Quantity range check | MEDIUM | 5 min | Prevent negative/huge quantities |
| Return quantity validation | MEDIUM | 5 min | Prevent invalid returns |
| Buffer must be integer | LOW | 3 min | Prevent float precision issues |
| Return SKU validation | MEDIUM | 3 min | Prevent empty SKUs |
| Type validation on objects | LOW | 5 min | Improve robustness |

---

## Recommended Action Items

### High Priority (MEDIUM severity)
- [ ] Add SKU validation (non-empty string)
- [ ] Add quantity range validation (0 < qty <= 1M)
- [ ] Add return quantity validation (positive integers only)
- [ ] Add buffer integer-only check

### Medium Priority (LOW severity)
- [ ] Add type validation for complex fields
- [ ] Add logging for empty requests
- [ ] Add request size limit headers

### Low Priority (Optimization)
- [ ] Consider atomic increment for inventory (DynamoDB Update Expressions)
- [ ] Add request rate limiting (per IP)
- [ ] Add request logging/audit trail

---

## Testing Recommendations

1. **Run edge case tests:**
   ```bash
   npm run test:edgecases
   ```

2. **Test scenarios:**
   - Empty SKU: `{"items": [{"sku": "", "quantity": 1}]}`
   - Negative quantity: `{"items": [{"sku": "X", "quantity": -5}]}`
   - Very large quantity: `{"items": [{"sku": "X", "quantity": 999999999}]}`
   - Float buffer: `{"bufferQty": 3.7}`
   - Concurrent orders: 5 simultaneous `/webhook/shopify` requests

3. **Stress test:**
   - 100 concurrent Shopify webhooks
   - 50 concurrent return webhooks
   - Check final inventory matches expected value

---

## Security Considerations

### Input Validation ✓ (Mostly Good)
- Headers are typed
- JSON parsing handled by bodyParser
- Required fields are validated
- **Could Be Better:** Range validation on quantities

### Authentication ✗ (NOT IMPLEMENTED)
- No API key validation
- No Shopify webhook signature verification
- No Amazon webhook signature verification
- **Recommendation:** Add HMAC-SHA256 verification for production

### Rate Limiting ✗ (NOT IMPLEMENTED)
- No per-IP rate limiting
- No per-merchant rate limiting
- **Recommendation:** Add express-rate-limit middleware

### Data Encryption ✗ (Partial)
- DynamoDB encrypted at rest (✓)
- Transit: Not enforced (should use HTTPS in production)
- **Recommendation:** Add HTTPS enforcement in production

### Audit Logging ✓ (Partial)
- Request errors logged to console
- DynamoDB stores all writes
- **Could Be Better:** Add structured logging (JSON format) for CloudWatch

---

## Next Steps

1. **Implement input validation fixes above** (~20 minutes)
2. **Run edge case test suite** to verify fixes work
3. **Add authentication** for production deployment
4. **Add rate limiting** for production deployment
5. **Set up HTTPS** when deploying to production

---

Would you like me to implement the recommended fixes?
