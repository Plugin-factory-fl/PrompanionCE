/**
 * Stripe Webhook Routes
 * Handles Stripe webhook events for subscription management
 */

import express from 'express';
import Stripe from 'stripe';
import { query } from '../config/database.js';
import { linkStripeCustomerByEmail, getStripeCustomerEmail } from '../config/stripe.js';

const router = express.Router();

// Initialize Stripe - webhook secret will come from environment variable
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-12-15.clover'
});

// Store processed event IDs to prevent duplicate processing (idempotency)
const processedEvents = new Set();

/**
 * POST /api/webhooks/stripe
 * Handle Stripe webhook events
 * 
 * IMPORTANT: This route must use express.raw() middleware to receive raw body
 * for signature verification. This is handled in server.js
 */
router.post('/stripe', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('[Webhook] STRIPE_WEBHOOK_SECRET not configured');
    return res.status(500).json({ error: 'Webhook secret not configured' });
  }

  let event;

  try {
    // Verify webhook signature
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('[Webhook] Signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook signature verification failed: ${err.message}` });
  }

  // Check if we've already processed this event (idempotency)
  if (processedEvents.has(event.id)) {
    console.log(`[Webhook] Event ${event.id} already processed, skipping`);
    return res.json({ received: true, message: 'Event already processed' });
  }

  console.log(`[Webhook] Received event: ${event.type} (ID: ${event.id})`);

  try {
    // Handle different event types
    switch (event.type) {
      case 'customer.subscription.created':
        await handleSubscriptionCreated(event.data.object);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        break;

      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(event.data.object);
        break;

      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object);
        break;

      case 'customer.created':
        await handleCustomerCreated(event.data.object);
        break;

      case 'customer.updated':
        await handleCustomerUpdated(event.data.object);
        break;

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    // Mark event as processed
    processedEvents.add(event.id);
    
    // Clean up old event IDs (keep last 1000 to prevent memory issues)
    if (processedEvents.size > 1000) {
      const eventsArray = Array.from(processedEvents);
      processedEvents.clear();
      eventsArray.slice(-500).forEach(id => processedEvents.add(id));
    }

    res.json({ received: true });
  } catch (error) {
    console.error(`[Webhook] Error processing event ${event.type}:`, error);
    // Still return 200 to Stripe to prevent retries, but log the error
    res.status(200).json({ received: true, error: error.message });
  }
});

/**
 * Handle subscription created event
 */
async function handleSubscriptionCreated(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  console.log(`[Webhook] Subscription created: ${subscriptionId} for customer ${customerId}`);

  // Find user by Stripe customer ID
  let userResult = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  // If not found, try to link by customer email
  if (userResult.rows.length === 0) {
    const { email } = await getStripeCustomerEmail(customerId);
    
    if (email) {
      const linkResult = await linkStripeCustomerByEmail(email, customerId);
      if (linkResult.linked) {
        userResult = await query(
          'SELECT id FROM users WHERE id = $1',
          [linkResult.userId]
        );
        console.log(`[Webhook] ${linkResult.message}`);
      } else {
        console.log(`[Webhook] ${linkResult.message}`);
      }
    }
  }

  if (userResult.rows.length === 0) {
    console.warn(`[Webhook] User not found for customer ${customerId}. Subscription will be linked when user account is created.`);
    return;
  }

  const userId = userResult.rows[0].id;

  // Update user subscription status
  if (status === 'active' || status === 'trialing') {
    await query(
      'UPDATE users SET subscription_status = $1, enhancements_limit = 999999 WHERE id = $2',
      ['premium', userId]
    );
    console.log(`[Webhook] Updated user ${userId} to premium status`);
  }

  // Record in subscription history
  await query(
    'INSERT INTO subscription_history (user_id, subscription_status, stripe_subscription_id, started_at) VALUES ($1, $2, $3, NOW())',
    [userId, status, subscriptionId]
  );
}

/**
 * Handle subscription updated event
 */
async function handleSubscriptionUpdated(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;
  const status = subscription.status;

  console.log(`[Webhook] Subscription updated: ${subscriptionId} - status: ${status}`);

  let userResult = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  // If not found, try to link by customer email
  if (userResult.rows.length === 0) {
    const { email } = await getStripeCustomerEmail(customerId);
    
    if (email) {
      const linkResult = await linkStripeCustomerByEmail(email, customerId);
      if (linkResult.linked) {
        userResult = await query(
          'SELECT id FROM users WHERE id = $1',
          [linkResult.userId]
        );
        console.log(`[Webhook] ${linkResult.message}`);
      } else {
        console.log(`[Webhook] ${linkResult.message}`);
      }
    }
  }

  if (userResult.rows.length === 0) {
    console.warn(`[Webhook] User not found for customer ${customerId}. Subscription will be linked when user account is created.`);
    return;
  }

  const userId = userResult.rows[0].id;

  // Update subscription status based on Stripe status
  if (status === 'active' || status === 'trialing') {
    await query(
      'UPDATE users SET subscription_status = $1, enhancements_limit = 999999 WHERE id = $2',
      ['premium', userId]
    );
    console.log(`[Webhook] Updated user ${userId} to premium status`);
  } else if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
    await query(
      'UPDATE users SET subscription_status = $1, enhancements_limit = 10 WHERE id = $2',
      ['freemium', userId]
    );
    console.log(`[Webhook] Updated user ${userId} to freemium status`);
  }

  // Update subscription history - mark as ended if canceled/unpaid/past_due
  if (status === 'canceled' || status === 'unpaid' || status === 'past_due') {
    await query(
      'UPDATE subscription_history SET subscription_status = $1, ended_at = NOW() WHERE stripe_subscription_id = $2 AND ended_at IS NULL',
      [status, subscriptionId]
    );
  } else {
    await query(
      'UPDATE subscription_history SET subscription_status = $1 WHERE stripe_subscription_id = $2 AND ended_at IS NULL',
      [status, subscriptionId]
    );
  }
}

/**
 * Handle subscription deleted event
 */
async function handleSubscriptionDeleted(subscription) {
  const customerId = subscription.customer;
  const subscriptionId = subscription.id;

  console.log(`[Webhook] Subscription deleted: ${subscriptionId} for customer ${customerId}`);

  let userResult = await query(
    'SELECT id FROM users WHERE stripe_customer_id = $1',
    [customerId]
  );

  // If not found, try to link by customer email
  if (userResult.rows.length === 0) {
    const { email } = await getStripeCustomerEmail(customerId);
    
    if (email) {
      const linkResult = await linkStripeCustomerByEmail(email, customerId);
      if (linkResult.linked) {
        userResult = await query(
          'SELECT id FROM users WHERE id = $1',
          [linkResult.userId]
        );
        console.log(`[Webhook] ${linkResult.message}`);
      } else {
        console.log(`[Webhook] ${linkResult.message}`);
      }
    }
  }

  if (userResult.rows.length === 0) {
    console.warn(`[Webhook] User not found for customer ${customerId}. Subscription will be linked when user account is created.`);
    return;
  }

  const userId = userResult.rows[0].id;

  // Downgrade user to freemium
  await query(
    'UPDATE users SET subscription_status = $1, enhancements_limit = 10 WHERE id = $2',
    ['freemium', userId]
  );
  console.log(`[Webhook] Downgraded user ${userId} to freemium`);

  // Mark subscription as ended in history
  await query(
    'UPDATE subscription_history SET ended_at = NOW() WHERE stripe_subscription_id = $1 AND ended_at IS NULL',
    [subscriptionId]
  );
}

/**
 * Handle payment succeeded event
 */
async function handlePaymentSucceeded(invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  console.log(`[Webhook] Payment succeeded for customer ${customerId}, subscription ${subscriptionId}`);

  // Ensure subscription is active
  if (subscriptionId) {
    let userResult = await query(
      'SELECT id FROM users WHERE stripe_customer_id = $1',
      [customerId]
    );

    // If not found, try to link by customer email
    if (userResult.rows.length === 0) {
      const { email } = await getStripeCustomerEmail(customerId);
      
      if (email) {
        const linkResult = await linkStripeCustomerByEmail(email, customerId);
        if (linkResult.linked) {
          userResult = await query(
            'SELECT id FROM users WHERE id = $1',
            [linkResult.userId]
          );
          console.log(`[Webhook] ${linkResult.message}`);
        } else {
          console.log(`[Webhook] ${linkResult.message}`);
        }
      }
    }

    if (userResult.rows.length > 0) {
      const userId = userResult.rows[0].id;
      await query(
        'UPDATE users SET subscription_status = $1, enhancements_limit = 999999 WHERE id = $2',
        ['premium', userId]
      );
      console.log(`[Webhook] Confirmed premium status for user ${userId}`);
    }
  }
}

/**
 * Handle payment failed event
 */
async function handlePaymentFailed(invoice) {
  const customerId = invoice.customer;
  const subscriptionId = invoice.subscription;

  console.log(`[Webhook] Payment failed for customer ${customerId}, subscription ${subscriptionId}`);

  // Note: We don't immediately downgrade on payment failure
  // Stripe will retry automatically. Only downgrade if subscription is canceled
  // This is handled by subscription.deleted or subscription.updated events
}

/**
 * Handle customer created event
 */
async function handleCustomerCreated(customer) {
  console.log(`[Webhook] Customer created: ${customer.id}`);
  // Customer creation is typically handled when user signs up
  // This is mainly for logging purposes
}

/**
 * Handle customer updated event
 */
async function handleCustomerUpdated(customer) {
  console.log(`[Webhook] Customer updated: ${customer.id}`);
  // Update customer info if needed
  // For now, we mainly track subscription status, not customer details
}

export default router;

