# PromptProfile™ Backend Server

Backend server for the PromptProfile™ Chrome extension, handling authentication, API key management, and payment verification.

## Features

- ✅ User authentication (register/login)
- ✅ Secure API key storage (OpenAI)
- ✅ Database for user management
- ✅ JWT token-based authentication
- 🔄 Stripe integration (ready for implementation)

## Setup Instructions

### 1. Local Development Setup

1. **Install Dependencies**
   ```bash
   cd Backend
   npm install
   ```

2. **Set Up Environment Variables**
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and fill in:
   - `DATABASE_URL` - Your local PostgreSQL connection string
   - `JWT_SECRET` - A random secret string for JWT signing
   - `OPENAI_API_KEY` - Your OpenAI API key
   - `GEMINI_API_KEY` - Your Google Gemini API key
   - `CLAUDE_API_KEY` - Your Anthropic Claude API key
   - `GROK_API_KEY` - Your xAI Grok API key
   - `ALLOWED_ORIGINS` - CORS allowed origins

3. **Set Up Local PostgreSQL Database**
   - Install PostgreSQL locally
   - Create a database:
     ```sql
     CREATE DATABASE prompanion_dev;
     ```
   - Update `DATABASE_URL` in `.env`:
     ```
     DATABASE_URL=postgresql://username:password@localhost:5432/prompanion_dev
     ```

4. **Run Database Migrations**
   ```bash
   npm run migrate
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

### 2. Render Deployment Setup

#### Step 1: Create PostgreSQL Database on Render

1. Go to [Render Dashboard](https://dashboard.render.com)
2. Click "New +" → "PostgreSQL"
3. Configure:
   - Name: `prompanion-db`
   - Database: `prompanion`
   - User: `prompanion_user`
   - Region: Choose closest to your users
4. Note the **Internal Database URL** (you'll need this)

#### Step 2: Create Web Service on Render

1. In Render Dashboard, click "New +" → "Web Service"
2. Connect your GitHub repository (or use manual deploy)
3. Configure the service:
   - **Name**: `prompanion-backend`
   - **Environment**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Plan**: Starter (or higher for production)

#### Step 3: Set Environment Variables

In your Render Web Service settings, add these environment variables:

- `NODE_ENV` = `production`
- `DATABASE_URL` = (Use the Internal Database URL from your PostgreSQL service)
- `JWT_SECRET` = (Generate a strong random string)
- `OPENAI_API_KEY` = (Your OpenAI API key)
- `GEMINI_API_KEY` = (Your Google Gemini API key)
- `CLAUDE_API_KEY` = (Your Anthropic Claude API key)
- `GROK_API_KEY` = (Your xAI Grok API key)
- `ALLOWED_ORIGINS` = `chrome-extension://*` (or specific extension IDs)

#### Step 4: Deploy

1. Render will automatically deploy when you push to your repository
2. Or click "Manual Deploy" → "Deploy latest commit"
3. Wait for deployment to complete
4. Note your service URL (e.g., `https://prompanion-backend.onrender.com`)

#### Step 5: Run Database Migrations

After first deployment, run migrations:

1. Go to your Web Service → "Shell"
2. Run:
   ```bash
   npm run migrate
   ```

Or use Render's scheduled jobs feature to run migrations automatically.

### 3. Update Chrome Extension

Update your extension's `background.js` to use the backend API:

1. Add your Render backend URL to the extension
2. Update API calls to use the backend instead of direct OpenAI calls
3. Implement authentication flow

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - Login user
- `POST /api/auth/verify` - Verify token

### API

- `POST /api/enhance` - Enhance prompt (requires auth)
- `POST /api/chat` - Side chat (requires auth)

### User

- `GET /api/user/profile` - Get user profile (requires auth)
- `GET /api/user/usage` - Get usage stats (requires auth)

## Database Schema

### users
- `id` - Primary key
- `email` - Unique email address
- `password_hash` - Bcrypt hashed password
- `subscription_status` - freemium/premium/etc
- `enhancements_used` - Count of enhancements used
- `enhancements_limit` - Maximum enhancements allowed
- `stripe_customer_id` - Stripe customer ID (for payments)
- `created_at` - Account creation timestamp
- `updated_at` - Last update timestamp

### subscription_history
- `id` - Primary key
- `user_id` - Foreign key to users
- `subscription_status` - Status at time of record
- `stripe_subscription_id` - Stripe subscription ID
- `started_at` - Subscription start
- `ended_at` - Subscription end (if applicable)
- `created_at` - Record creation timestamp

## Security Notes

- Passwords are hashed using bcrypt (10 rounds)
- JWT tokens expire after 7 days
- API routes require authentication
- Rate limiting is enabled (100 requests per 15 minutes)
- CORS is configured for extension origins only
- Helmet.js provides additional security headers

## Future: Stripe Integration

The database schema is ready for Stripe integration. To implement:

1. Install Stripe SDK: `npm install stripe`
2. Create webhook endpoint for Stripe events
3. Update subscription status based on payment events
4. Implement subscription upgrade/downgrade logic

## Troubleshooting

### Database Connection Issues
- Verify `DATABASE_URL` is correct
- Check PostgreSQL service is running (Render)
- Ensure firewall allows connections

### CORS Errors
- Update `ALLOWED_ORIGINS` to include your extension ID
- Check that requests include proper headers

### Authentication Failures
- Verify `JWT_SECRET` is set correctly
- Check token expiration
- Ensure token is sent in `Authorization: Bearer <token>` header

