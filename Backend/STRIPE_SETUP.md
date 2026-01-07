# Stripe Integration Setup Guide

## Overview
This guide explains how to set up Stripe webhooks for PromptProfile™ subscription management.

## What Has Been Implemented

✅ Stripe webhook endpoint at `/api/webhooks/stripe`
✅ Webhook signature verification for security
✅ Event handlers for:
   - `customer.subscription.created` - Upgrade to premium
   - `customer.subscription.updated` - Update subscription status
   - `customer.subscription.deleted` - Downgrade to freemium
   - `invoice.payment_succeeded` - Confirm premium status
   - `invoice.payment_failed` - Log payment failures
   - `customer.created` - Log customer creation
   - `customer.updated` - Log customer updates

✅ Database updates for subscription status
✅ Subscription history tracking
✅ Idempotency (prevents duplicate event processing)

## Step 1: Get Your Stripe Keys

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **API keys**
3. Copy your **Secret key** (starts with `sk_live_` for production or `sk_test_` for testing)
4. You'll also need your **Publishable key** (starts with `pk_live_` or `pk_test_`) for the frontend

## Step 2: Configure Render Environment Variables

In your Render Web Service settings:

1. Go to your backend service on Render
2. Click **Environment** tab
3. Add these environment variables:

| Variable | Value | Where to Find |
|----------|-------|---------------|
| `STRIPE_SECRET_KEY` | `sk_live_...` or `sk_test_...` | Stripe Dashboard → Developers → API keys |
| `STRIPE_WEBHOOK_SECRET` | `whsec_...` | See Step 3 below |

**Important**: 
- Use `sk_test_...` and `pk_test_...` for testing
- Use `sk_live_...` and `pk_live_...` for production
- Never commit these keys to git

## Step 3: Create Stripe Webhook Endpoint

1. Go to [Stripe Dashboard](https://dashboard.stripe.com)
2. Navigate to **Developers** → **Webhooks**
3. Click **"Add endpoint"** or **"Create destination"**
4. Fill in the form:
   - **Endpoint URL**: `https://your-backend-name.onrender.com/api/webhooks/stripe`
     - Replace `your-backend-name` with your actual Render service name
   - **Description**: `PromptProfile subscription webhooks`
   - **Events to listen to**: Select these events:
     - `customer.subscription.created`
     - `customer.subscription.updated`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
     - `invoice.payment_failed`
     - `customer.created`
     - `customer.updated`
5. Click **"Create destination"** or **"Add endpoint"**
6. **Copy the "Signing secret"** (starts with `whsec_...`)
7. Add this to Render as `STRIPE_WEBHOOK_SECRET`

## Step 4: Deploy Backend Changes

1. Push your code to GitHub (the webhook handler is already in the codebase)
2. Render will automatically deploy
3. Or manually trigger deployment in Render dashboard

## Step 5: Test the Webhook

1. In Stripe Dashboard → Webhooks, click on your endpoint
2. Click **"Send test webhook"**
3. Select an event type (e.g., `customer.subscription.created`)
4. Click **"Send test webhook"**
5. Check your Render logs to see if the webhook was received and processed

## Step 6: Verify Webhook is Working

1. Check Render logs for webhook events
2. Look for log messages like:
   - `[Webhook] Received event: customer.subscription.created`
   - `[Webhook] Updated user X to premium status`
3. Test with a real subscription (in test mode):
   - Create a test customer
   - Create a test subscription
   - Verify the user's subscription_status is updated in your database

## Troubleshooting

### Webhook Not Receiving Events
- Verify the endpoint URL is correct in Stripe
- Check that your Render service is running
- Verify `STRIPE_WEBHOOK_SECRET` is set correctly in Render
- Check Render logs for errors

### Signature Verification Failed
- Ensure `STRIPE_WEBHOOK_SECRET` matches the signing secret from Stripe
- Verify the webhook endpoint uses `express.raw()` middleware (already configured)

### User Not Found Errors
- Ensure `stripe_customer_id` is saved when user creates a Stripe customer
- Check that the customer ID in Stripe matches what's in your database

### Subscription Status Not Updating
- Check Render logs for webhook processing errors
- Verify database connection is working
- Check that the user exists with the correct `stripe_customer_id`

## Next Steps

After webhooks are working:
1. Implement frontend subscription creation flow
2. Add Stripe Checkout or Payment Element to your extension
3. Store `stripe_customer_id` when user subscribes
4. Test the full subscription flow end-to-end

## Security Notes

- Webhook signature verification is implemented and required
- Never expose your Stripe secret keys
- Use test keys during development
- Switch to live keys only when ready for production

