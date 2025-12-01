/**
 * Reset User Usage Script
 * Resets a user's enhancements_used count to 0
 * 
 * Usage:
 *   node scripts/reset-user-usage.js <email>
 *   node scripts/reset-user-usage.js --id <user_id>
 */

import { pool } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const resetUserUsage = async (identifier, isUserId = false) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Find user by email or ID
    let userResult;
    if (isUserId) {
      userResult = await client.query(
        'SELECT id, email, name, enhancements_used, enhancements_limit, last_reset_date FROM users WHERE id = $1',
        [identifier]
      );
    } else {
      userResult = await client.query(
        'SELECT id, email, name, enhancements_used, enhancements_limit, last_reset_date FROM users WHERE email = $1',
        [identifier]
      );
    }

    if (userResult.rows.length === 0) {
      console.error(`❌ User not found: ${identifier}`);
      await client.query('ROLLBACK');
      process.exit(1);
    }

    const user = userResult.rows[0];
    console.log(`📋 Found user:`);
    console.log(`   ID: ${user.id}`);
    console.log(`   Email: ${user.email}`);
    console.log(`   Name: ${user.name || 'N/A'}`);
    console.log(`   Current usage: ${user.enhancements_used}/${user.enhancements_limit}`);
    console.log(`   Last reset: ${user.last_reset_date || 'Never'}`);

    // Reset enhancements_used to 0 and update last_reset_date to today
    await client.query(
      'UPDATE users SET enhancements_used = 0, last_reset_date = CURRENT_DATE WHERE id = $1',
      [user.id]
    );

    await client.query('COMMIT');
    console.log(`\n✅ Successfully reset usage for user ${user.email}`);
    console.log(`   Usage reset from ${user.enhancements_used}/${user.enhancements_limit} to 0/${user.enhancements_limit}`);
    console.log(`   Last reset date updated to: ${new Date().toISOString().split('T')[0]}`);
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error resetting user usage:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.error('Usage:');
  console.error('  node scripts/reset-user-usage.js <email>');
  console.error('  node scripts/reset-user-usage.js --id <user_id>');
  process.exit(1);
}

let identifier;
let isUserId = false;

if (args[0] === '--id' || args[0] === '-i') {
  if (args.length < 2) {
    console.error('❌ Error: --id requires a user ID');
    process.exit(1);
  }
  identifier = args[1];
  isUserId = true;
} else {
  identifier = args[0];
}

// Run the reset
resetUserUsage(identifier, isUserId)
  .then(() => {
    console.log('\n✅ Reset completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('\n❌ Reset failed:', error);
    process.exit(1);
  });


