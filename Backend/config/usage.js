/**
 * Usage Management Utilities
 * Handles daily reset logic for enhancement limits
 */

import { query } from './database.js';

/**
 * Resets daily usage if the last reset date is not today
 * Uses UTC date to ensure consistency across timezones
 * @param {number} userId - User ID
 * @returns {Promise<boolean>} True if reset occurred, false if already reset today
 */
export async function resetDailyUsageIfNeeded(userId) {
  try {
    // Use PostgreSQL's CURRENT_DATE for consistency (avoids timezone issues)
    // Check if last_reset_date is not today using SQL comparison
    const checkResult = await query(
      `SELECT 
        last_reset_date, 
        enhancements_used,
        CASE 
          WHEN last_reset_date IS NULL THEN true
          WHEN last_reset_date < CURRENT_DATE THEN true
          ELSE false
        END as needs_reset
      FROM users 
      WHERE id = $1`,
      [userId]
    );

    if (checkResult.rows.length === 0) {
      throw new Error('User not found');
    }

    const user = checkResult.rows[0];

    // If reset is needed, update the usage
    if (user.needs_reset) {
      await query(
        'UPDATE users SET enhancements_used = 0, last_reset_date = CURRENT_DATE WHERE id = $1',
        [userId]
      );
      console.log(`Daily usage reset for user ${userId} (was ${user.enhancements_used}, now 0)`);
      return true; // Reset occurred
    }

    return false; // Already reset today
  } catch (error) {
    console.error('Error resetting daily usage:', error);
    throw error;
  }
}

/**
 * Gets user's current usage with daily reset applied
 * @param {number} userId - User ID
 * @returns {Promise<Object>} Usage object with enhancementsUsed and enhancementsLimit
 */
export async function getUserUsage(userId) {
  // Reset if needed before fetching
  await resetDailyUsageIfNeeded(userId);
  
  const result = await query(
    'SELECT enhancements_used, enhancements_limit, subscription_status FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];
  return {
    enhancementsUsed: user.enhancements_used,
    enhancementsLimit: user.enhancements_limit,
    subscriptionStatus: user.subscription_status
  };
}

