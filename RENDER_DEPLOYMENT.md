# Render Free Tier Deployment Guide

This guide walks through deploying SyncState to Render's free tier.

## Prerequisites

- Render account (https://render.com)
- GitHub repository with this code
- AWS account with DynamoDB access
- Amazon Developer account with SP-API credentials

## Step 1: Create DynamoDB Table on AWS

Before deploying to Render, set up a DynamoDB table:

```bash
aws dynamodb create-table \
  --table-name SyncState-Inventory \
  --attribute-definitions AttributeName=sku,AttributeType=S \
  --key-schema AttributeName=sku,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

**Note**: Use `PAY_PER_REQUEST` billing to stay within free tier limits on AWS.

## Step 2: Prepare Credentials

Gather the following credentials:

### Amazon SP-API
1. Go to https://developer.amazon.com/
2. Create/register your application
3. Get your:
   - `SP_API_CLIENT_ID`
   - `SP_API_CLIENT_SECRET`
   - `SP_API_REFRESH_TOKEN`

### AWS DynamoDB
Your AWS credentials should have permissions to:
- Read/Write to DynamoDB tables
- Use AWS SDK v3 (already configured in code)

## Step 3: Deploy to Render

### Option A: Using Web Dashboard (Recommended for beginners)

1. **Create a new Web Service on Render**:
   - Go to https://dashboard.render.com
   - Click "New +" → "Web Service"
   - Connect your GitHub repository

2. **Configure the service**:
   - **Name**: `syncstate-api`
   - **Runtime**: `Node`
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm start`
   - **Plan**: Free

3. **Add Environment Variables** (in Service Settings):
   ```
   NODE_ENV=production
   PORT=3000
   AMAZON_REGION=us-east-1
   MOCK_AMAZON=false
   MOCK_DYNAMODB=false
   SP_API_CLIENT_ID=<your_client_id>
   SP_API_CLIENT_SECRET=<your_client_secret>
   SP_API_REFRESH_TOKEN=<your_refresh_token>
   ```

4. **Deploy**:
   - Click "Create Web Service"
   - Render will automatically:
     - Install dependencies
     - Run `npm run build` (TypeScript compilation)
     - Start the server with `npm start`

### Option B: Using Render CLI

```bash
# Install Render CLI
npm install -g @render/cli

# Login
render login

# Deploy
render deploy
```

## Step 4: Verify Deployment

After deployment completes:

1. **Check Health Endpoint**:
   ```bash
   curl https://<your-service>.onrender.com/health
   # Should return: {"ok":true}
   ```

2. **Check Logs** in Render Dashboard:
   - Look for "✅ SyncState initialized with DynamoDB"
   - If you see errors, check that all environment variables are set

## Environment Variables Reference

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `NODE_ENV` | Yes | Set to `production` | `production` |
| `PORT` | No | Port (Render sets this automatically) | `3000` |
| `AMAZON_REGION` | No | AWS region | `us-east-1` |
| `SP_API_CLIENT_ID` | Yes (unless mocking) | Amazon SP-API client ID | `amzn1.ask.account...` |
| `SP_API_CLIENT_SECRET` | Yes (unless mocking) | Amazon SP-API client secret | `...` |
| `SP_API_REFRESH_TOKEN` | Yes (unless mocking) | Amazon SP-API refresh token | `Atzr|...` |
| `MOCK_AMAZON` | No | Mock Amazon SP-API (testing) | `false` or `true` |
| `MOCK_DYNAMODB` | No | Mock DynamoDB (testing) | `false` or `true` |

## Troubleshooting

### Build Fails with TypeScript Errors
```
npm run build
typescript errors...
```
**Solution**: Ensure all TS errors are fixed locally first
```bash
npm install
npm run build
```

### "Cannot find module" errors at runtime
**Solution**: Try a clean rebuild in Render:
1. Go to Service Settings
2. Click "Clear build cache"
3. Re-deploy

### DynamoDB Connection Errors
**Solution**: Verify
- AWS credentials have DynamoDB permissions
- Table name is correct: `SyncState-Inventory`
- Region matches: `AMAZON_REGION=us-east-1`

### Health Check Fails
**Solution**: Check logs in Render dashboard for initialization errors

## Free Tier Limitations & Optimization

### Memory
- Render Free Tier: 512 MB
- The app uses ~100-150 MB at baseline
- No heavy data processing - you should be fine

### CPU
- Render Free Tier: Shared CPU
- OK for low-traffic sync operations
- Not suitable for high-volume requests

### Network
- Free tier has internet access
- Outbound requests to AWS/Amazon work fine

### Recommendations
- Keep request/processing lightweight
- Use `MOCK_DYNAMODB=true` for testing without AWS costs
- Monitor logs to catch issues early
- Consider upgrading if you expect >100 req/min

## API Endpoints

Once deployed, your service will be available at:
```
https://<your-service-name>.onrender.com
```

Main endpoints:
- `GET /health` - Health check
- `POST /api/buffer/:sku` - Add item to sync buffer
- `GET /api/sync-status/:sku` - Get sync status

See [API_REFERENCE.md](API_REFERENCE.md) for full API documentation.

## Monitoring & Logs

In Render Dashboard:
1. Select your service
2. Click "Logs" tab
3. View real-time logs as requests come in
4. Check for initialization messages and errors

## Next Steps

After successful deployment:
1. Update your Chrome extension or client to use the Render URL
2. Monitor initial requests and logs
3. Test sync workflow end-to-end
4. Set up monitoring alerts if needed

## Getting Help

- Render Docs: https://render.com/docs
- This repo's issues: Check DEPLOYMENT_GUIDE.md for AWS setup details
- Check service logs for detailed error messages
