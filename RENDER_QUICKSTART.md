# Render Deployment - Quick Start

Get SyncState running on Render Free Tier in 5 minutes.

## Step 1: Prepare Your Credentials

You'll need:
- **SP-API Credentials** (from Amazon Developer Console):
  - `SP_API_CLIENT_ID`
  - `SP_API_CLIENT_SECRET`
  - `SP_API_REFRESH_TOKEN`

See [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md) for how to obtain these.

## Step 2: Push Code to GitHub

```bash
git add .
git commit -m "Ready for Render deployment"
git push origin main
```

This repository should be in your GitHub account (public or private).

## Step 3: Create Render Service

1. Go to https://dashboard.render.com
2. Click **"New+"** → **"Web Service"**
3. Select your GitHub repository
4. Configure:
   - **Name**: `syncstate-api`
   - **Runtime**: Node
   - **Build Command**: `npm install && npm run build`
   - **Start Command**: `npm run start:prod`
   - **Plan**: Free

## Step 4: Add Environment Variables

In the "Environment" section, add these variables:

| Key | Value |
|-----|-------|
| `NODE_ENV` | `production` |
| `PORT` | `3000` |
| `AMAZON_REGION` | `us-east-1` |
| `SP_API_CLIENT_ID` | Your Client ID |
| `SP_API_CLIENT_SECRET` | Your Client Secret |
| `SP_API_REFRESH_TOKEN` | Your Refresh Token |
| `MOCK_AMAZON` | `false` |
| `MOCK_DYNAMODB` | `false` |

## Step 5: Deploy

Click **"Create Web Service"** and watch the logs build.

## Step 6: Verify

Once deployed, test the health endpoint:

```bash
curl https://<your-service-name>.onrender.com/health
```

Should return: `{"ok":true}`

Check logs for: **"✅ SyncState initialized with DynamoDB"**

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Build fails | Run `npm run build` locally to check for TypeScript errors |
| Runtime errors | Check environment variables are all set correctly |
| DynamoDB error | Ensure AWS DynamoDB table `SyncState-Inventory` exists |
| Port error | PORT is automatically set by Render, don't override |

## What's Included?

✅ TypeScript compilation (npm run build)  
✅ Express server ready to go  
✅ DynamoDB integration  
✅ Amazon SP-API client  
✅ Health check endpoint  
✅ Configured for free tier  

## Next Steps

1. Deploy the service
2. Create DynamoDB table on AWS (if not done)
3. Set AWS credentials as environment variables (optional - use IAM role)
4. Start syncing inventory!

For detailed walkthrough, see [RENDER_DEPLOYMENT.md](RENDER_DEPLOYMENT.md)
