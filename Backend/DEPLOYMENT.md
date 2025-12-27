# Deployment Guide for Prompanion Backend

## Quick Start Checklist

- [ ] Create PostgreSQL database on Render
- [ ] Create Web Service on Render
- [ ] Set environment variables
- [ ] Deploy code
- [ ] Run database migrations
- [ ] Test API endpoints
- [ ] Update Chrome extension to use backend

## Detailed Steps

### 1. Render PostgreSQL Setup

1. Log in to [Render Dashboard](https://dashboard.render.com)
2. Click **"New +"** → **"PostgreSQL"**
3. Fill in:
   - **Name**: `prompanion-db`
   - **Database**: `prompanion`
   - **User**: `prompanion_user`
   - **Region**: Choose closest to your users
   - **Plan**: Starter (free tier) or higher
4. Click **"Create Database"**
5. Wait for database to be provisioned
6. Copy the **Internal Database URL** (you'll need this)

### 2. Render Web Service Setup

1. In Render Dashboard, click **"New +"** → **"Web Service"**
2. Connect your repository:
   - If using GitHub: Click **"Connect GitHub"** and select your repo
   - If using manual deploy: Click **"Public Git repository"** and enter your repo URL
3. Configure service:
   - **Name**: `prompanion-backend`
   - **Root Directory**: `Backend` (if your backend is in a subdirectory)
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Starter (free tier) or higher
4. Click **"Create Web Service"**

### 3. Environment Variables

In your Web Service settings, go to **"Environment"** tab and add:

| Key | Value | Notes |
|-----|-------|-------|
| `NODE_ENV` | `production` | Environment mode |
| `DATABASE_URL` | `[Internal Database URL]` | From PostgreSQL service |
| `JWT_SECRET` | `[Random string]` | Generate with: `openssl rand -base64 32` |
| `OPENAI_API_KEY` | `sk-...` | Your OpenAI API key |
| `GEMINI_API_KEY` | `...` | Your Google Gemini API key |
| `CLAUDE_API_KEY` | `sk-ant-...` | Your Anthropic Claude API key |
| `GROK_API_KEY` | `xai-...` | Your xAI Grok API key |
| `ALLOWED_ORIGINS` | `chrome-extension://*` | Or specific extension IDs |

**Important**: 
- Use the **Internal Database URL** (not External) for better performance
- Keep `JWT_SECRET` secret and never commit it
- `ALLOWED_ORIGINS` can be `*` for development, but restrict in production

### 4. Deploy

1. Render will auto-deploy on git push
2. Or manually: Click **"Manual Deploy"** → **"Deploy latest commit"**
3. Watch the build logs for errors
4. Once deployed, note your service URL (e.g., `https://prompanion-backend.onrender.com`)

### 5. Database Migration

After first deployment:

**Option A: Using Render Shell**
1. Go to your Web Service → **"Shell"** tab
2. Run: `npm run migrate`
3. Verify tables were created

**Option B: Using Scheduled Job**
1. Create a new **"Scheduled Job"** on Render
2. Set command: `cd Backend && npm run migrate`
3. Run once manually, then disable

**Option C: Local Migration**
1. Set `DATABASE_URL` to your Render database (External URL)
2. Run locally: `npm run migrate`

### 6. Test Your Backend

Test the health endpoint:
```bash
curl https://your-backend-url.onrender.com/health
```

Should return:
```json
{
  "status": "healthy",
  "timestamp": "...",
  "database": "connected"
}
```

### 7. Test Authentication

Register a test user:
```bash
curl -X POST https://your-backend-url.onrender.com/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'
```

Login:
```bash
curl -X POST https://your-backend-url.onrender.com/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"testpassword123"}'
```

### 8. Update Chrome Extension

Update your extension to use the backend:

1. **Add backend URL to extension**:
   - Store in `chrome.storage` or hardcode (for now)
   - Example: `const BACKEND_URL = 'https://prompanion-backend.onrender.com'`

2. **Update authentication**:
   - Modify `Source/LoginMenu.js` to call `/api/auth/login`
   - Store JWT token in `chrome.storage.local`

3. **Update API calls**:
   - Modify `background.js` to call `/api/enhance` instead of direct OpenAI
   - Include `Authorization: Bearer <token>` header

4. **Update Side Chat**:
   - Modify `Source/sideChat.js` to call `/api/chat`

## Troubleshooting

### Build Fails
- Check build logs in Render dashboard
- Verify `package.json` is correct
- Ensure Node version is compatible

### Database Connection Fails
- Verify `DATABASE_URL` uses Internal URL
- Check PostgreSQL service is running
- Verify database credentials

### CORS Errors
- Update `ALLOWED_ORIGINS` to include your extension ID
- Check request headers include `Content-Type: application/json`

### 503 Errors (Service Unavailable)
- Free tier services spin down after 15 minutes of inactivity
- First request after spin-down takes ~30 seconds
- Consider upgrading to paid plan for always-on service

### Authentication Not Working
- Verify JWT_SECRET is set correctly
- Check token is sent in Authorization header
- Verify token hasn't expired (7 days)

## Render Free Tier Limitations

- Services spin down after 15 min inactivity
- 750 hours/month free (enough for always-on if single service)
- Database: 1GB storage, 90 days retention
- Build time: ~5 minutes
- Cold start: ~30 seconds

## Upgrading to Paid Plan

For production, consider:
- **Starter Plan**: $7/month - Always on, faster cold starts
- **Standard Plan**: $25/month - Better performance, more resources
- **Pro Plan**: $85/month - High performance, dedicated resources

## Next Steps

1. ✅ Backend deployed and tested
2. 🔄 Integrate authentication in extension
3. 🔄 Update API calls to use backend
4. 🔄 Implement Stripe payment integration
5. 🔄 Add subscription management UI

