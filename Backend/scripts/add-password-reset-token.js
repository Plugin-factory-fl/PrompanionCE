/**
 * Database Migration Script - Add Password Reset Token Columns
 * Adds password_reset_token and password_reset_expires columns to users table
 */

import { pool } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const addPasswordResetColumns = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if password_reset_token column already exists
    const tokenColumnExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='password_reset_token'
    `);

    if (tokenColumnExists.rows.length > 0) {
      console.log('✅ password_reset_token column already exists');
    } else {
      // Add password_reset_token column
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN password_reset_token VARCHAR(255)
      `);
      console.log('✅ password_reset_token column added successfully');
    }

    // Check if password_reset_expires column already exists
    const expiresColumnExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='password_reset_expires'
    `);

    if (expiresColumnExists.rows.length > 0) {
      console.log('✅ password_reset_expires column already exists');
    } else {
      // Add password_reset_expires column
      await client.query(`
        ALTER TABLE users 
        ADD COLUMN password_reset_expires TIMESTAMP
      `);
      console.log('✅ password_reset_expires column added successfully');
    }

    // Check if index already exists
    const indexExists = await client.query(`
      SELECT indexname 
      FROM pg_indexes 
      WHERE tablename='users' AND indexname='idx_users_password_reset_token'
    `);

    if (indexExists.rows.length > 0) {
      console.log('✅ Index on password_reset_token already exists');
    } else {
      // Add index on password_reset_token for faster lookups
      await client.query(`
        CREATE INDEX idx_users_password_reset_token ON users(password_reset_token)
      `);
      console.log('✅ Index on password_reset_token created successfully');
    }

    await client.query('COMMIT');
    console.log('✅ Password reset columns migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding password reset columns:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration
addPasswordResetColumns()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

