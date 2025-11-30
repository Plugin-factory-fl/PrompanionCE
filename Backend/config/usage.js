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
    
    // Get the user's limit to check for data corruption
    const limitResult = await query(
      'SELECT enhancements_limit FROM users WHERE id = $1',
      [userId]
    );
    const enhancementsLimit = limitResult.rows[0]?.enhancements_limit || 10;
    
    console.log(`[Usage] Reset check for user ${userId}:`, {
      last_reset_date: user.last_reset_date,
      enhancements_used: user.enhancements_used,
      enhancements_limit: enhancementsLimit,
      needs_reset: user.needs_reset,
      current_date: new Date().toISOString().split('T')[0]
    });

    // Safety check: If enhancements_used exceeds limit and last_reset_date is today,
    // this indicates corrupted data - force a reset
    const isToday = user.last_reset_date && 
      new Date(user.last_reset_date).toISOString().split('T')[0] === new Date().toISOString().split('T')[0];
    
    if (isToday && user.enhancements_used > enhancementsLimit) {
      console.log(`[Usage] Data corruption detected for user ${userId}: count ${user.enhancements_used} exceeds limit ${enhancementsLimit} but last_reset_date is today. Forcing reset.`);
      await query(
        'UPDATE users SET enhancements_used = 0, last_reset_date = CURRENT_DATE WHERE id = $1',
        [userId]
      );
      return true;
    }

    // If reset is needed, update the usage
    if (user.needs_reset) {
      await query(
        'UPDATE users SET enhancements_used = 0, last_reset_date = CURRENT_DATE WHERE id = $1',
        [userId]
      );
      console.log(`[Usage] Daily usage reset for user ${userId} (was ${user.enhancements_used}, now 0)`);
      return true; // Reset occurred
    }
    
    console.log(`[Usage] No reset needed for user ${userId} - already reset today (count: ${user.enhancements_used})`);

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
  const resetOccurred = await resetDailyUsageIfNeeded(userId);
  
  const result = await query(
    'SELECT enhancements_used, enhancements_limit, subscription_status, last_reset_date FROM users WHERE id = $1',
    [userId]
  );

  if (result.rows.length === 0) {
    throw new Error('User not found');
  }

  const user = result.rows[0];
  console.log(`[Usage] getUserUsage for user ${userId}:`, {
    enhancementsUsed: user.enhancements_used,
    enhancementsLimit: user.enhancements_limit,
    last_reset_date: user.last_reset_date,
    resetOccurred
  });
  
  return {
    enhancementsUsed: user.enhancements_used,
    enhancementsLimit: user.enhancements_limit,
    subscriptionStatus: user.subscription_status
  };
}

