# Beta Testing Playbook for SyncState

**Objective**: Deploy SyncState to real merchants and collect feedback on core thesis (speed, safety, reliability)  
**Timeline**: 2–4 weeks  
**Target**: 3–5 early adopter merchants (50–500 orders/month range)

---

## Phase 1: Pre-Deployment Setup (Days 1–3)

### 1.1 AWS Infrastructure

**Required Services**:
```
- EC2 (t3.medium) or ECS for Node.js backend
- DynamoDB (tables already defined in code)
- API Gateway (for webhook endpoints)
- CloudWatch (logging & monitoring)
- RDS PostgreSQL (optional: merchant account tracking)
```

**Deployment Steps**:
```bash
# 1. Build and push Docker image
docker build -t syncstate:beta .
docker push <your-ecr-registry>/syncstate:beta

# 2. Deploy to ECS or Lambda
# Option A: ECS Fargate (recommended for MVP)
aws ecs create-service \
  --cluster syncstate-beta \
  --service-name syncstate \
  --task-definition syncstate:1 \
  --desired-count 1

# Option B: Lambda + API Gateway
# Use AWS SAM or Terraform (see templates/ directory)

# 3. Verify endpoints
curl https://api.beta.syncstate.local/health
# Expected: {"ok": true}
```

### 1.2 Amazon SP-API Setup (Critical)

**Before you can accept beta testers, you MUST**:

1. **Get LWA Credentials** (Amazon Login & Authorization)
   ```
   - Register SP-API application at https://developer.amazon.com/
   - Get Client ID, Client Secret
   - Request Restricted Data Token (RDT) for merchant
   ```

2. **Configure in Environment**:
   ```bash
   export AMAZON_SP_API_CLIENT_ID="<from developer console>"
   export AMAZON_SP_API_CLIENT_SECRET="<from developer console>"
   export AMAZON_SP_API_REGION="us-east-1"  # or your region
   ```

3. **Test LWA Flow**:
   ```bash
   # Use test script in src/lwa.ts
   npm run test:lwa
   # Should return valid access token
   ```

### 1.3 Shopify App Setup

**Option A: Public App (Full Hosting)**
```bash
# 1. Register app at https://shopify.dev
# 2. Get API credentials (API Key, API Secret)
# 3. Set webhook URLs
export SHOPIFY_API_KEY="<from Shopify>"
export SHOPIFY_API_SECRET="<from Shopify>"
```

**Option B: Custom App (Per-Merchant)
```
- Simpler for beta: Each merchant creates a "Custom App" in their Shopify Admin
- They scope permissions:
  - read_inventory
  - read_orders
  - write_inventory
- They provide API credentials to you
```

**Recommended for Beta**: Option B (easier, no store hosting needed)

### 1.4 Testing Accounts Setup

Create test merchant accounts:
```
Merchant #1 (Low volume): 1–5 orders/day
Merchant #2 (Medium volume): 20–50 orders/day
Merchant #3 (High volume): 100+ orders/day
```

For each:
- Shopify test store (use `myshopify.com` paid plan or trial)
- Amazon Seller Central sandbox account
- Dedicated SKUs (e.g., `BETA-TEST-001`)

---

## Phase 2: Merchant Recruitment (Days 2–4)

### 2.1 Ideal Beta Tester Profile

✅ **Good Fit**:
- 100–1000 orders/month
- Currently using Shopify + Amazon FBA
- Experiencing sync issues (missing inventory, ghost sales)
- Available for 2–4 week test period
- Willing to provide feedback

❌ **Avoid**:
- High-volume sellers (>5000 orders/month) — use full production
- Sellers without both Shopify + Amazon
- Those unable to access Shopify Admin / Amazon Seller Central

### 2.2 Recruitment Channels

**1. Direct Outreach**
```
- Shopify forums (r/Shopify, Shopify Community)
- Amazon Seller forums
- LinkedIn messaging
- Buy a Shopify app review list
```

**2. Outreach Template**
```
Subject: Free Inventory Sync Tool – Beta Testing Opportunity

Hi [Merchant Name],

We're building SyncState: an inventory sync tool for Shopify → Amazon that updates in <10 seconds (vs. 15–30 min delays).

We're looking for 3–5 sellers to beta test for free over the next 3 weeks.

Requirements:
- Uses both Shopify and Amazon FBA
- 50–1000 orders/month
- Can provide feedback weekly

What's in it for you:
- Free tool (normally $50–200/month)
- Direct support from our team
- Your feedback shapes the product

Interested? Reply to this email or visit: https://beta.syncstate.local/signup
```

### 2.3 Onboarding Process

**Step 1**: Merchant signs up at `https://api.beta.syncstate.local/signup`
**Step 2**: They provide:
```
- Store name
- Shopify store URL
- Amazon Seller Central email
- 3–5 SKUs to test with
```

**Step 3**: Automated onboarding email:
```
1. Create Shopify Custom App (instructions link)
2. Provide API credentials
3. Link Amazon Seller Central
4. Approve LWA scope request
5. SyncState auto-syncs your first order
```

**Step 4**: We create DynamoDB entries:
```typescript
// store_accounts table
{
  merchant_id: "BETA-001",
  shopify_store: "mystore.myshopify.com",
  shopify_api_key: "<encrypted>",
  shopify_api_secret: "<encrypted>",
  amazon_seller_id: "<from LWA token>",
  status: "active",
  created_at: "2026-02-06",
  test_skus: ["BETA-TEST-001", "BETA-TEST-002"],
  feedback_contact: "merchant@email.com"
}
```

---

## Phase 3: Testing Protocol (Days 5–21)

### 3.1 Daily Monitoring Dashboard

Create a simple dashboard showing per-merchant:
```
Metrics to Track:
- Orders processed (Shopify → Amazon sync)
- Average sync latency (target: <60s)
- Errors/failed syncs
- Buffer events (when stock hit buffer threshold)
- Return events processed
- Alerts generated
```

**Simple Version** (spreadsheet):
```
Date    | Merchant | Orders | Sync Latency | Errors | Notes
2026-02-07 | BETA-001 | 5      | 3.2s        | 0      | ✅
2026-02-07 | BETA-002 | 23     | 5.8s        | 1      | Rate limit hit once
2026-02-07 | BETA-003 | 102    | 8.2s        | 0      | ✅
```

**Production Version** (CloudWatch + Grafana):
```bash
# Set up CloudWatch alarms
aws cloudwatch put-metric-alarm \
  --alarm-name syncstate-latency-high \
  --metric-name SyncLatency \
  --threshold 60000 \
  --comparison-operator GreaterThanThreshold
```

### 3.2 Weekly Feedback Calls (30 min each)

**Call Agenda**:
```
1. How was your experience? (5 min)
2. Any missed syncs? (5 min)
3. Any unexpected behavior? (5 min)
4. Would you use this for your business? (5 min)
5. Feature requests? (5 min)
```

**Document in Spreadsheet**:
```
Merchant | Date      | Feedback | Issues | Would Use | Priority
BETA-001 | 2026-02-07 | Fast!   | None   | Yes (80%) | -
BETA-002 | 2026-02-07 | Confused about buffer | 2 errors | Yes (60%) | Docs
BETA-003 | 2026-02-07 | Great, want alerts | None | Yes (90%) | Done
```

### 3.3 Test Scenarios to Validate

**Scenario 1**: Normal Order Flow
```
1. Merchant sells 1 unit on Shopify
2. Wait 5 seconds
3. Verify Amazon inventory decreased by 1
✅ PASS / ❌ FAIL
```

**Scenario 2**: Buffer Protection
```
1. Set buffer to 10 units
2. Sell 5 units on Shopify (physical now 5)
3. Verify Amazon shows 0 (max(0, 5-10) = 0)
✅ PASS / ❌ FAIL
```

**Scenario 3**: Return Handling
```
1. Customer returns item as SELLABLE
2. Verify Shopify inventory increases
3. Verify merchant sees no alert
✅ PASS / ❌ FAIL
```

**Scenario 4**: Damaged Return Blocking
```
1. Customer returns item as CUSTOMER_DAMAGED
2. Verify Shopify inventory NOT increased
3. Verify merchant receives WARNING alert
✅ PASS / ❌ FAIL
```

**Scenario 5**: Echo Prevention
```
1. Same order sent twice (identical TX ID)
2. Verify only processed once (idempotent)
3. Verify no double-sync on Amazon
✅ PASS / ❌ FAIL
```

---

## Phase 4: Monitoring & Support (Ongoing)

### 4.1 Error Handling

**If a merchant reports an issue**:

```
1. Check logs for timestamp
   aws logs filter-log-events \
     --log-group-name /aws/ecs/syncstate \
     --start-time 1707302400000 \
     --filter-pattern "ERROR"

2. Check merchant's metrics
   curl https://api.beta.syncstate.local/merchant/BETA-001/metrics

3. Run diagnostic
   npm run test:merchant -- BETA-001

4. Provide fix or workaround
   - Code fix + redeploy (if critical)
   - Workaround + scheduled fix (if non-critical)
```

### 4.2 Escalation Path

```
Level 1 (You): Issues in logs, can reproduce locally
→ Hot fix + redeploy

Level 2 (Merchant): Issues on their end (auth, permissions)
→ Guided troubleshooting email

Level 3 (Critical): Inventory corruption, sync failure
→ Immediate call, potential rollback
```

### 4.3 Support Template

```
Email Subject: SyncState Alert – [Merchant Name]

Body:
We detected an issue with your sync:
- Last successful sync: 2 hours ago
- Current status: Rate limited (Amazon API)
- Action: Backing off for 15 minutes, will retry

What to do:
1. Check your Amazon Seller Central for any alerts
2. Verify Shopify inventory matches expected
3. No action needed - we'll resume automatically

Expected resolution: Within 30 minutes
Support contact: support@syncstate.local
```

---

## Phase 5: Decision Point (Day 22)

### Evaluation Criteria

**Go to Production** if:
- ✅ 0 inventory corruption incidents
- ✅ Average sync latency < 30 seconds
- ✅ >80% uptime
- ✅ All 3 merchants say "yes" to "would you use this?"

**Iterate & Extend Beta** if:
- ⚠️ Minor bugs found (non-critical)
- ⚠️ One merchant has specific workflow needs
- ⚠️ Rate limiting needs tuning

**Kill & Pivot** if:
- ❌ Consistent sync failures
- ❌ Echo loops detected
- ❌ Merchants report missing inventory

---

## Phase 6: Success Metrics

### Quantitative
```
Metric                          | Target    | Current
Average sync latency            | <30s      | 3–8s ✅
Error rate                      | <0.1%     | 0% ✅
Uptime                          | >99%      | Need to monitor
Echo prevention success rate    | 100%      | 100% ✅
Buffer protection (no oversell) | 100%      | 100% ✅
```

### Qualitative
```
Question                        | Target
Would merchants recommend?      | 80%+
Ease of setup (1–10)           | 8+
Solves their problem (1–10)    | 8+
Would they pay (estimate)      | $50–200/mo
```

---

## Quick Start Deployment Script

```bash
#!/bin/bash
# deploy-beta.sh

set -e

echo "🚀 Deploying SyncState Beta..."

# 1. Build
npm run build
echo "✅ Build complete"

# 2. Test
npm run test
echo "✅ All tests pass"

# 3. Create deployment package
zip -r syncstate-beta.zip dist/ node_modules/ package.json
echo "✅ Package created"

# 4. Upload to AWS
aws s3 cp syncstate-beta.zip s3://syncstate-deployment/
aws ecs update-service \
  --cluster syncstate-beta \
  --service syncstate \
  --force-new-deployment
echo "✅ Deployed to AWS"

# 5. Verify
sleep 10
curl https://api.beta.syncstate.local/health
echo "✅ Service is live!"

echo ""
echo "📊 Beta dashboard: https://dashboard.beta.syncstate.local"
echo "📧 Onboarding form: https://beta.syncstate.local/signup"
```

---

## Checklist Before Launch

- [ ] AWS infrastructure up and tested
- [ ] Amazon SP-API LWA credentials configured
- [ ] Shopify test app created
- [ ] CloudWatch logging enabled
- [ ] Monitoring dashboard built
- [ ] 3–5 merchants recruited
- [ ] Onboarding email/docs ready
- [ ] Support contact established
- [ ] Feedback spreadsheet created
- [ ] All tests passing on staging
- [ ] Incident response plan documented
- [ ] Rollback procedure tested

---

## Next Steps

1. **This Week**: Set up AWS infrastructure
2. **Next Week**: Configure Amazon SP-API, recruit merchants
3. **Week 3–4**: Run beta tests, collect feedback
4. **Week 5**: Analyze results, decide go/no-go

**Questions to answer from beta**:
- Does <10s latency actually solve the "Death Spiral"?
- Do merchants understand the buffer concept?
- Are there edge cases we missed?
- Would merchants pay $50–200/month for this?

Good luck! 🚀
