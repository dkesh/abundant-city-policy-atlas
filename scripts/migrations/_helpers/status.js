#!/usr/bin/env node

/**
 * Migration Status Script
 * 
 * Shows which migrations have been applied and which are pending.
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const migrationsDir = path.join(process.cwd(), 'scripts/migrations');

async function showStatus() {
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in environment');
    console.error('   Add DATABASE_URL=postgres://... to your .env file');
    process.exit(1);
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Get all migration files
    const migrationFiles = fs.readdirSync(migrationsDir)
      .filter(file => file.endsWith('.js') && !file.includes('helper') && !file.includes('status') && !file.includes('verify'))
      .sort();

    if (migrationFiles.length === 0) {
      console.log('ℹ️  No migration files found in scripts/migrations/');
      console.log('   Run: npm run migrate:create <name> to create a migration');
      return;
    }

    // Check if pgmigrations table exists
    const tableExists = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name = 'pgmigrations'
      );
    `);

    let appliedMigrations = [];

    if (tableExists.rows[0].exists) {
      // Get applied migrations
      const result = await pool.query('SELECT name FROM pgmigrations ORDER BY name');
      appliedMigrations = result.rows.map(row => row.name);
    } else {
      console.log('ℹ️  Migration tracking table (pgmigrations) does not exist yet.');
      console.log('   It will be created automatically when you run your first migration.\n');
    }

    // Match files with applied migrations
    console.log('📋 Migration Status:\n');
    console.log('='.repeat(70));
    console.log(`${'Migration File'.padEnd(50)} ${'Status'.padEnd(20)}`);
    console.log('='.repeat(70));

    const allMigrations = [];
    let appliedCount = 0;
    let pendingCount = 0;

    for (const file of migrationFiles) {
      // Extract migration name (without extension)
      const migrationName = path.basename(file, '.js');
      
      // node-pg-migrate stores just the migration name without extension
      const isApplied = appliedMigrations.includes(migrationName);
      
      const status = isApplied ? '✅ Applied' : '⏳ Pending';
      const statusColor = isApplied ? '\x1b[32m' : '\x1b[33m';
      const resetColor = '\x1b[0m';
      
      console.log(`${file.padEnd(50)} ${statusColor}${status.padEnd(20)}${resetColor}`);
      
      allMigrations.push({ file, name: migrationName, applied: isApplied });
      
      if (isApplied) {
        appliedCount++;
      } else {
        pendingCount++;
      }
    }

    console.log('='.repeat(70));
    console.log(`\nSummary: ${appliedCount} applied, ${pendingCount} pending, ${allMigrations.length} total\n`);

    if (pendingCount > 0) {
      console.log('💡 To apply pending migrations:');
      console.log('   npm run migrate:up\n');
    } else if (allMigrations.length > 0) {
      console.log('✅ All migrations have been applied!\n');
    }

    // Show rollback info
    if (appliedCount > 0) {
      const lastApplied = allMigrations.filter(m => m.applied).pop();
      if (lastApplied) {
        console.log('💡 To rollback the last migration:');
        console.log(`   npm run migrate:down\n`);
      }
    }

  } catch (error) {
    console.error('❌ Error checking migration status:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('   Could not connect to database. Check your DATABASE_URL.');
    }
    throw error;
  } finally {
    await pool.end();
  }
}

showStatus().catch(error => {
  console.error('❌ Error:', error.message);
  process.exit(1);
});