# Render Deployment Checklist

Complete this checklist before deploying to Render:

## Prerequisites
- [ ] GitHub account with this repository pushed
- [ ] Render account created (https://render.com)
- [ ] AWS DynamoDB table created (`SyncState-Inventory`)
- [ ] Amazon Developer account with SP-API registered app

## Code Preparation
- [ ] All TypeScript code compiles: `npm run build`
- [ ] No TypeScript errors: Check tsconfig.json
- [ ] Environment variables documented in .env.example
- [ ] .gitignore properly configured (.env, node_modules, dist)
- [ ] package.json has correct Node.js version requirement

## Credentials & Configuration
- [ ] SP_API_CLIENT_ID obtained from Amazon Developer Console
- [ ] SP_API_CLIENT_SECRET securely stored
- [ ] SP_API_REFRESH_TOKEN obtained from Shopify/Amazon LWA flow
- [ ] AWS credentials have DynamoDB table permissions
- [ ] DynamoDB table name is correct: `SyncState-Inventory`

## Render Configuration
- [ ] GitHub repository is public or Render has access
- [ ] render.yaml file is in repository root
- [ ] Build command: `npm install && npm run build`
- [ ] Start command: `npm run start:prod`
- [ ] Node.js environment selected

## Environment Variables in Render Dashboard
Add these in Service Settings → Environment:
```
NODE_ENV=production
PORT=3000
AMAZON_REGION=us-east-1
SP_API_CLIENT_ID=<your_value>
SP_API_CLIENT_SECRET=<your_value>
SP_API_REFRESH_TOKEN=<your_value>
MOCK_AMAZON=false
MOCK_DYNAMODB=false
```

## Deployment
- [ ] Verify git repository is up to date
- [ ] Connect GitHub repository to Render
- [ ] Create Web Service from Render dashboard
- [ ] Set all required environment variables
- [ ] Click "Create Web Service" to deploy
- [ ] Monitor deployment logs

## Post-Deployment Verification
- [ ] Build completed successfully
- [ ] See "✅ SyncState initialized with DynamoDB" in logs
- [ ] Health check passes: `curl https://<your-service>.onrender.com/health`
- [ ] No errors in Render logs during startup
- [ ] Service shows "Running" status

## Troubleshooting
If build fails:
- [ ] Check for TypeScript compilation errors
- [ ] Verify all dependencies are in package.json
- [ ] Clear Render build cache and redeploy

If runtime errors occur:
- [ ] Check all environment variables are set
- [ ] Verify DynamoDB table exists and is accessible
- [ ] Check AWS IAM permissions
- [ ] Review full logs in Render dashboard

## Performance Monitoring
- [ ] Check memory usage (~100-150 MB baseline)
- [ ] Monitor CPU usage on Free tier
- [ ] If exceeding free tier limits, consider upgrading plan
