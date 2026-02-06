# Quick Deployment Guide

## Prerequisites

Before deploying, ensure you have:
- AWS account with appropriate permissions
- Amazon Developer account (for SP-API)
- Shopify store or test store
- Node.js 16+ locally

## Step 1: AWS Setup (30 minutes)

### Create DynamoDB Tables

```bash
# Option A: Using AWS CLI
aws dynamodb create-table \
  --table-name SyncState-Inventory \
  --attribute-definitions \
    AttributeName=sku,AttributeType=S \
  --key-schema AttributeName=sku,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1

# Or use Terraform/CloudFormation (see infrastructure/)
```

### Create IAM Role

```bash
# Role for Lambda/EC2 to access DynamoDB
aws iam create-role --role-name SyncState-Backend \
  --assume-role-policy-document file://trust-policy.json

# Attach policies
aws iam attach-role-policy \
  --role-name SyncState-Backend \
  --policy-arn arn:aws:iam::aws:policy/AmazonDynamoDBFullAccess
```

## Step 2: Configure Environment

### Create `.env.production` 

```env
# AWS
AWS_REGION=us-east-1
DYNAMODB_ENDPOINT=https://dynamodb.us-east-1.amazonaws.com

# Amazon SP-API
AMAZON_SP_API_CLIENT_ID=<from developer.amazon.com>
AMAZON_SP_API_CLIENT_SECRET=<from developer.amazon.com>
AMAZON_SP_API_REGION=us-east-1

# Shopify (if using public app)
SHOPIFY_API_KEY=<from shopify.dev>
SHOPIFY_API_SECRET=<from shopify.dev>

# Server
PORT=3000
NODE_ENV=production

# Rate limiting
RATE_LIMIT_MS_PER_REQUEST=2000  # Amazon allows ~0.5 req/sec
```

## Step 3: Build & Deploy

### Option A: Docker to ECS

```bash
# 1. Build image
docker build -t syncstate:latest .

# 2. Push to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin <account>.dkr.ecr.us-east-1.amazonaws.com

docker tag syncstate:latest <account>.dkr.ecr.us-east-1.amazonaws.com/syncstate:latest
docker push <account>.dkr.ecr.us-east-1.amazonaws.com/syncstate:latest

# 3. Update ECS task definition
aws ecs update-service --cluster syncstate --service syncstate --force-new-deployment
```

### Option B: Lambda + API Gateway

```bash
# 1. Package
npm run build
zip -r syncstate-lambda.zip dist/ node_modules/

# 2. Create Lambda function
aws lambda create-function \
  --function-name syncstate \
  --runtime nodejs18.x \
  --role arn:aws:iam::<account>:role/SyncState-Backend \
  --zip-file fileb://syncstate-lambda.zip \
  --handler dist/index.handler \
  --environment Variables={DYNAMODB_ENDPOINT=...}

# 3. Create API Gateway
aws apigateway create-rest-api --name syncstate
# (Configure endpoints for /webhook/shopify, /webhook/amazon/return, etc.)
```

### Option C: EC2 Simple

```bash
# 1. SSH into EC2 instance
ssh -i key.pem ec2-user@<instance-ip>

# 2. Clone repo
git clone https://github.com/yourorg/syncstate.git
cd syncstate

# 3. Install & run
npm install
npm run build
npm start
```

## Step 4: Test Deployment

```bash
# Health check
curl https://api.syncstate.local/health
# Expected: {"ok": true}

# Test webhook endpoint
curl -X POST https://api.syncstate.local/webhook/shopify \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "test-1",
    "items": [{"sku": "TEST-001", "quantity": 1}]
  }'
# Expected: {"success": true, ...}
```

## Step 5: Configure Monitoring

### CloudWatch Alarms

```bash
# High latency alarm
aws cloudwatch put-metric-alarm \
  --alarm-name syncstate-latency-high \
  --alarm-description "Alert if sync latency > 60s" \
  --metric-name SyncLatency \
  --namespace SyncState \
  --statistic Average \
  --period 300 \
  --threshold 60000 \
  --comparison-operator GreaterThanThreshold \
  --alarm-actions arn:aws:sns:us-east-1:<account>:syncstate-alerts

# Error rate alarm
aws cloudwatch put-metric-alarm \
  --alarm-name syncstate-errors-high \
  --metric-name ErrorCount \
  --threshold 5 \
  --comparison-operator GreaterThanThreshold
```

### Logs

```bash
# Tail logs in real-time
aws logs tail /aws/lambda/syncstate --follow

# Or CloudWatch Insights query
aws logs start-query \
  --log-group-name /aws/lambda/syncstate \
  --start-time $(date -d '1 hour ago' +%s) \
  --end-time $(date +%s) \
  --query-string 'fields @timestamp, @message | filter @message like /ERROR/ | stats count()'
```

## Step 6: Connect Merchant

### For Each Beta Tester

1. **Shopify Setup**
   - Go to: `Settings → Apps and integrations → Develop apps`
   - Create custom app
   - Scope: `read_inventory`, `read_orders`, `write_inventory`
   - Install and get credentials

2. **Amazon Setup**
   - Have merchant create SP-API application (or authorize your app)
   - Get their Seller ID from Seller Central

3. **SyncState Onboarding**
   - Merchant provides: Shopify store URL + credentials, Amazon Seller ID
   - You add to DynamoDB:
   ```javascript
   const params = {
     TableName: 'SyncState-Merchants',
     Item: {
       merchant_id: 'BETA-001',
       shopify_store: 'myshop.myshopify.com',
       shopify_api_key: 'shpat_...',
       shopify_api_secret: 'shpss_...',
       amazon_seller_id: 'A1XXXXX',
       status: 'active',
       created_at: new Date().toISOString()
     }
   };
   await dynamoDB.put(params).promise();
   ```

## Troubleshooting

### Sync not working
```bash
# Check logs for errors
aws logs tail /aws/lambda/syncstate --filter-pattern "ERROR"

# Check if merchant credentials are valid
curl -X GET https://api.syncstate.local/debug/merchant/BETA-001
```

### High latency
```bash
# Check if rate limited by Amazon
curl -X GET https://api.syncstate.local/debug/rate-limit

# Check CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --metric-name SyncLatency \
  --namespace SyncState \
  --start-time $(date -u -d '1 hour ago' +%Y-%m-%dT%H:%M:%S) \
  --end-time $(date -u +%Y-%m-%dT%H:%M:%S) \
  --period 300 \
  --statistics Average,Maximum
```

### Echo loop prevention not working
```bash
# Check transaction table
aws dynamodb scan --table-name SyncState-Transactions \
  --filter-expression "txId = :txid" \
  --expression-attribute-values '{":txid": {"S": "your-tx-id"}}'

# If not present, echo detection is failing
```

## Rollback

If something goes wrong:

```bash
# ECS: Revert to previous task definition
aws ecs update-service \
  --cluster syncstate \
  --service syncstate \
  --task-definition syncstate:2  # Previous version

# Lambda: Publish new version with old code
aws lambda publish-version --function-name syncstate
aws lambda update-alias \
  --function-name syncstate \
  --name live \
  --routing-config '{"AdditionalVersionWeight": 0}' \
  --function-version 1  # Previous version
```

## Monitoring in Real-Time

```bash
# Option 1: Simple curl loop
while true; do
  curl -s https://api.syncstate.local/health | jq .
  sleep 5
done

# Option 2: CloudWatch dashboard
aws cloudwatch put-dashboard \
  --dashboard-name SyncState \
  --dashboard-body file://dashboard.json

# Option 3: Third-party monitoring (DataDog, New Relic)
# (Add instrumentation in src/index.ts)
```

## Production Readiness Checklist

- [ ] All tests passing (`npm run test`, `npm run test:phase2`, `npm run test:edgecases`)
- [ ] Environment variables configured
- [ ] DynamoDB tables created with backups enabled
- [ ] CloudWatch alarms set up
- [ ] Logging aggregation working
- [ ] Rate limiting configured for Amazon API
- [ ] SSL certificate installed
- [ ] Database auto-scaling enabled
- [ ] Backup and disaster recovery plan documented
- [ ] On-call rotation established

---

**For questions or issues during deployment, check [BETA_TESTING_PLAYBOOK.md](BETA_TESTING_PLAYBOOK.md) for monitoring and support procedures.**
