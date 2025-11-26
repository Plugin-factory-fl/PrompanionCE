/**
 * User Routes
 * Handles user profile and subscription management
 */

import express from 'express';
import { authenticate } from '../config/auth.js';
import { query } from '../config/database.js';

const router = express.Router();

// All user routes require authentication
router.use(authenticate);

/**
 * GET /api/user/profile
 * Get current user profile
 */
router.get('/profile', async (req, res) => {
  try {
    const result = await query(
      'SELECT id, email, subscription_status, enhancements_used, enhancements_limit, created_at FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({ user: result.rows[0] });
  } catch (error) {
    console.error('Profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * GET /api/user/usage
 * Get user's usage statistics
 */
router.get('/usage', async (req, res) => {
  try {
    const result = await query(
      'SELECT enhancements_used, enhancements_limit, subscription_status FROM users WHERE id = $1',
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const user = result.rows[0];
    res.json({
      enhancementsUsed: user.enhancements_used,
      enhancementsLimit: user.enhancements_limit,
      subscriptionStatus: user.subscription_status,
      remaining: Math.max(0, user.enhancements_limit - user.enhancements_used)
    });
  } catch (error) {
    console.error('Usage error:', error);
    res.status(500).json({ error: 'Failed to fetch usage' });
  }
});

export default router;

