/**
 * User Routes
 * Handles user profile and subscription management
 */

import express from 'express';
import { authenticate } from '../config/auth.js';
import { query } from '../config/database.js';
import { getUserUsage } from '../config/usage.js';

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

/**
 * GET /api/user/profile
 * Get current user profile
 */
router.get('/profile', async (req, res) => {
  try {
    // Get usage with daily reset applied
    const usage = await getUserUsage(req.user.userId);
    
    // Get full user profile
    const result = await query(
      'SELECT id, email, name, subscription_status, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    // Include current usage data (with daily reset applied)
    res.json({ 
      user: {
        ...user,
        enhancements_used: usage.enhancementsUsed,
        enhancements_limit: usage.enhancementsLimit
      }
    });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * GET /api/user/usage
 * Get user's usage statistics (with daily reset applied)
 */
router.get('/usage', async (req, res) => {
  try {
    // Get usage with daily reset applied
    const usage = await getUserUsage(req.user.userId);
    
    res.json({
      enhancementsUsed: usage.enhancementsUsed,
      enhancementsLimit: usage.enhancementsLimit,
      subscriptionStatus: usage.subscriptionStatus,
      remaining: Math.max(0, usage.enhancementsLimit - usage.enhancementsUsed)
    });
  } catch (error) {
    console.error('Usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;

