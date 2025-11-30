/**
 * Database Migration Script - Add Last Reset Date Column
 * Adds a last_reset_date column to track daily usage resets
 */

import { pool } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const addLastResetDateColumn = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if column already exists
    const columnExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='last_reset_date'
    `);

    if (columnExists.rows.length > 0) {
      console.log('✅ last_reset_date column already exists');
      await client.query('COMMIT');
      return;
    }

    // Add last_reset_date column
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN last_reset_date DATE
    `);

    await client.query('COMMIT');
    console.log('✅ last_reset_date column added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding last_reset_date column:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration
addLastResetDateColumn()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

