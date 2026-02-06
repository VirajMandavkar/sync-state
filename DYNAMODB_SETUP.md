# Phase 3: DynamoDB Migration Setup Guide

## Overview

SyncState has been migrated from file-backed JSON storage to **AWS DynamoDB** for production-grade scalability and reliability.

### Benefits

✅ **Durability** — AWS managed backups and multi-AZ replication  
✅ **Auto-scaling** — Pay-per-request billing adapts to traffic  
✅ **Global replication** — Multi-region support built-in  
✅ **Compliance** — Encryption at rest, audit logging via CloudTrail  
✅ **Performance** — No file I/O bottlenecks  

---

## Quick Start (Development)

### Option A: Using DynamoDB Local (Recommended)

DynamoDB Local lets you develop locally without AWS costs.

#### 1. Install DynamoDB Local

Using Docker (recommended):
```bash
docker pull amazon/dynamodb-local
docker run -p 8000:8000 amazon/dynamodb-local
```

Or using Java directly:
```bash
# Download from: https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/DynamoDBLocal.html
# Then run:
java -Djava.library.path=./DynamoDBLocal_lib -jar DynamoDBLocal.jar -sharedDb
```

#### 2. Configure SyncState for Local DynamoDB

Edit `.env`:
```
# Use local DynamoDB
DYNAMODB_LOCAL_ENDPOINT=http://localhost:8000
NODE_ENV=development

# These can be dummy values for local testing
AWS_ACCESS_KEY_ID=local
AWS_SECRET_ACCESS_KEY=local
AMAZON_REGION=us-east-1
```

#### 3. Start SyncState

```bash
npm run build
npm run start
```

Expected output:
```
📦 Initializing DynamoDB tables...
✓ Inventory table ready
✓ Transactions table ready
✓ Returns table ready
✓ Alerts table ready
✅ All DynamoDB tables initialized
✨ SyncState prototype listening on 3000
```

#### 4. Verify Tables

Check tables were created:
```bash
# Using AWS CLI
aws dynamodb list-tables --endpoint-url http://localhost:8000 --region us-east-1

# Output should show:
# {
#   "TableNames": [
#     "SyncState-Inventory",
#     "SyncState-Transactions",
#     "SyncState-Returns",
#     "SyncState-Alerts"
#   ]
# }
```

#### 5. Run Tests

```bash
npm run test          # Phase 1 tests (Shopify→Amazon)
npm run test:phase2   # Phase 2 tests (Amazon returns)
```

---

## Production Setup (AWS)

### Prerequisites

- AWS Account with billing enabled
- AWS CLI configured (`aws configure`)
- Sufficient IAM permissions for DynamoDB

### Step 1: Create Tables via AWS Console

Alternatively, use AWS CLI:

```bash
aws dynamodb create-table \
  --table-name SyncState-Inventory \
  --attribute-definitions \
    AttributeName=sku,AttributeType=S \
  --key-schema \
    AttributeName=sku,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

aws dynamodb create-table \
  --table-name SyncState-Transactions \
  --attribute-definitions \
    AttributeName=txId,AttributeType=S \
  --key-schema \
    AttributeName=txId,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --ttl AttributeName=expiresAt,Enabled=true \
  --region us-east-1

aws dynamodb create-table \
  --table-name SyncState-Returns \
  --attribute-definitions \
    AttributeName=sku,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=sku,KeyType=HASH \
    AttributeName=timestamp,KeyType=RANGE \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

aws dynamodb create-table \
  --table-name SyncState-Alerts \
  --attribute-definitions \
    AttributeName=alertId,AttributeType=S \
    AttributeName=sku,AttributeType=S \
    AttributeName=timestamp,AttributeType=S \
  --key-schema \
    AttributeName=alertId,KeyType=HASH \
  --global-secondary-indexes "[{
    \"IndexName\": \"sku-timestamp-index\",
    \"KeySchema\": [
      {\"AttributeName\": \"sku\", \"KeyType\": \"HASH\"},
      {\"AttributeName\": \"timestamp\", \"KeyType\": \"RANGE\"}
    ],
    \"Projection\": {\"ProjectionType\": \"ALL\"},
    \"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}
  }]" \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### Step 2: Configure SyncState for AWS

Edit `.env` for production:

```
# AWS credentials (from IAM user with DynamoDB permissions)
AWS_ACCESS_KEY_ID=AKIA...
AWS_SECRET_ACCESS_KEY=...
AMAZON_REGION=us-east-1

# DON'T set DYNAMODB_LOCAL_ENDPOINT
# (leave empty or remove - will use real AWS)

NODE_ENV=production

# Keep your existing Amazon SP-API credentials
SP_API_CLIENT_ID=...
SP_API_CLIENT_SECRET=...
SP_API_REFRESH_TOKEN=...
MOCK_AMAZON=false  # Use real Amazon in production
```

### Step 3: Deploy to AWS Lambda

Create `serverless.yml`:

```yaml
service: syncstate

frameworkVersion: '3'

provider:
  name: aws
  runtime: nodejs18.x
  region: us-east-1
  memorySize: 512
  timeout: 30
  environment:
    NODE_ENV: production
    AWS_ACCESS_KEY_ID: ${env:AWS_ACCESS_KEY_ID}
    AWS_SECRET_ACCESS_KEY: ${env:AWS_SECRET_ACCESS_KEY}
    AMAZON_REGION: us-east-1

functions:
  api:
    handler: dist/index.handler
    events:
      - http:
          path: /{proxy+}
          method: ANY
      - http:
          path: /
          method: ANY

plugins:
  - serverless-offline

package:
  individually: true
  patterns:
    - '!node_modules/**'
    - 'dist/**'
```

Deploy:

```bash
npm run build
serverless deploy
```

### Step 4: Setup CloudWatch Monitoring

Create alarms for key metrics:

```bash
# Check DynamoDB read/write capacity
aws cloudwatch get-metric-statistics \
  --namespace AWS/DynamoDB \
  --metric-name UserErrors \
  --dimensions Name=TableName,Value=SyncState-Inventory \
  --start-time 2026-02-01T00:00:00Z \
  --end-time 2026-02-07T00:00:00Z \
  --period 300 \
  --statistics Sum
```

---

## Data Migration from JSON to DynamoDB

If you have existing data in `data/store.json`, migration isn't automatic yet. You'll need to:

1. **Manual migration** (easiest):
   ```bash
   # Delete old store.json
   rm data/store.json
   
   # Start fresh with DynamoDB
   npm run start
   ```

2. **Programmatic migration** (if you have data to preserve):
   ```typescript
   // Create a migration script and import old data
   import fs from "fs";
   import store from "./store";
   
   const oldStore = JSON.parse(fs.readFileSync("data/store.json", "utf-8"));
   
   // Migrate inventory
   for (const [sku, physical] of Object.entries(oldStore.physical)) {
     await store.setPhysicalCount(sku as string, physical as number);
     const buffer = oldStore.buffer[sku as string] ?? 0;
     await store.setBuffer(sku as string, buffer);
   }
   
   console.log("✅ Migration complete");
   ```

---

## Table Schema Reference

### SyncState-Inventory

```
PK: sku (String)

Attributes:
- physical: Number          # Current on-hand inventory
- buffer: Number            # Safety reserve
- broadcast: Number         # Current Amazon sync (computed)
- lastBroadcast: Object
  - count: Number
  - txId: String
  - timestamp: String
- updatedAt: String (ISO)
```

Example:
```json
{
  "sku": "PROD-001",
  "physical": 50,
  "buffer": 5,
  "broadcast": 45,
  "lastBroadcast": {
    "count": 45,
    "txId": "uuid-1234",
    "timestamp": "2026-02-06T10:30:00Z"
  },
  "updatedAt": "2026-02-06T10:30:00Z"
}
```

### SyncState-Transactions

```
PK: txId (String)
TTL: 30 days (auto-delete)

Attributes:
- timestamp: String (ISO)
- action: String            # "sync", "return", etc.
- status: String            # "pending", "completed", "failed"
- error: String (optional)
- expiresAt: Number         # Unix timestamp (TTL)
```

### SyncState-Returns

```
PK: sku (String) + timestamp (Range)

Attributes:
- quantity: Number
- disposition: String       # "SELLABLE", "DAMAGED", etc.
- orderId: String
```

### SyncState-Alerts

```
PK: alertId (String)
GSI: sku + timestamp

Attributes:
- type: String              # "return_damaged", "stock_low", etc.
- severity: String          # "info", "warning", "critical"
- sku: String
- message: String
- timestamp: String (ISO)
- read: Boolean
```

---

## Performance Tuning

### Read / Write Capacity

**Development:** PAY_PER_REQUEST (recommended)
```bash
aws dynamodb update-billing-mode \
  --table-name SyncState-Inventory \
  --billing-mode PAY_PER_REQUEST
```

**Production (high traffic):** Provisioned with auto-scaling
```bash
aws dynamodb update-table \
  --table-name SyncState-Inventory \
  --billing-mode PROVISIONED \
  --provisioned-throughput '{
    "WriteCapacityUnits": 25,
    "ReadCapacityUnits": 25
  }'
```

### Add DAX Caching (Optional)

For sub-millisecond reads:

```bash
# Create DAX cluster
aws dax create-cluster \
  --cluster-name syncstate-cache \
  --node-type dax.r5.large \
  --replication-factor 3 \
  --iam-role-arn arn:aws:iam::ACCOUNT:role/DAXServiceRole
```

Update code:
```typescript
import AmazonDaxClient from "amazon-dax-client";

const client = new AmazonDaxClient.DynamoDBClient({
  endpoints: ["syncstate-cache.xxxxx.dax.amazonaws.com:8111"]
});
```

---

## Troubleshooting

### Error: "ResourceNotFoundException"

**Cause:** Table doesn't exist  
**Solution:** Verify tables created:
```bash
aws dynamodb list-tables --region us-east-1
```

### Error: "ValidationException: One or more parameter values are invalid"

**Cause:** Incorrect attribute types  
**Solution:** Check schema matches table definition (see reference above)

### High latency (>100ms)

**Cause:** DynamoDB throttling or network latency  
**Solution:**
- Upgrade to provisioned capacity
- Add DAX caching
- Check CloudWatch metrics for throttles

### "User: arn:aws:iam::... is not authorized to perform: dynamodb:GetItem"

**Cause:** IAM permissions missing  
**Solution:** Add policy to IAM user:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:*"
      ],
      "Resource": "arn:aws:dynamodb:us-east-1:ACCOUNT:table/SyncState-*"
    }
  ]
}
```

---

## Monitoring

### CloudWatch Dashboard

```bash
# Create simple metric
aws cloudwatch put-metric-data \
  --namespace SyncState \
  --metric-name InventoryUpdates \
  --value 1 \
  --region us-east-1
```

### DynamoDB Streams (Advanced)

For real-time event processing:

```bash
aws dynamodb update-table \
  --table-name SyncState-Inventory \
  --stream-specification StreamEnabled=true,StreamViewType=NEW_AND_OLD_IMAGES \
  --region us-east-1
```

---

## Cost Estimation

### Development (PAY_PER_REQUEST)

- First 25 GB free tier
- $0.0000015 per read unit
- $0.0000006 per write unit

**Estimate:** $0-10/month

### Production (Provisioned)

- 25 RCU + 25 WCU = ~$20/month
- With auto-scaling: $50-200/month (depends on traffic)

**Estimate:** $20-200/month

---

## Next Steps

1. ✅ Choose deployment option (Local, Lambda, or Self-hosted)
2. ✅ Create DynamoDB tables
3. ✅ Configure credentials in `.env`
4. ✅ Run tests to verify
5. ✅ Deploy to your platform
6. ✅ Monitor metrics in CloudWatch

---

Questions? Check `src/dynamodbService.ts` for implementation details.
