/**
 * Database Migration Script - Add Name Column
 * Adds a nullable name column to the users table
 */

import { pool } from '../config/database.js';
import dotenv from 'dotenv';

dotenv.config();

const addNameColumn = async () => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Check if column already exists
    const columnExists = await client.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name='users' AND column_name='name'
    `);

    if (columnExists.rows.length > 0) {
      console.log('✅ Name column already exists');
      await client.query('COMMIT');
      return;
    }

    // Add name column
    await client.query(`
      ALTER TABLE users 
      ADD COLUMN name VARCHAR(255)
    `);

    await client.query('COMMIT');
    console.log('✅ Name column added successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('❌ Error adding name column:', error);
    throw error;
  } finally {
    client.release();
  }
};

// Run migration
addNameColumn()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exit(1);
  });

