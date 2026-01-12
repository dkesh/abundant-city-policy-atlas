#!/usr/bin/env node

/**
 * Migration Runner Script
 * 
 * Runs pending database migrations automatically.
 * This script is designed to be called during build/deploy processes.
 * 
 * Exits with code 0 on success, non-zero on failure.
 */

require('dotenv').config();
const { execSync } = require('child_process');
const path = require('path');

async function runMigrations() {
  console.log('🔄 Running database migrations...\n');

  // Check DATABASE_URL
  if (!process.env.DATABASE_URL) {
    console.error('❌ DATABASE_URL not set in environment');
    console.error('   Migrations require DATABASE_URL to be configured');
    process.exit(1);
  }

  try {
    // Patch node-pg-migrate to support both dash and underscore separators
    // This allows migration files to use either format
    require('./patch-node-pg-migrate.js');

    // Run migrations using node-pg-migrate CLI
    // Use npx to ensure we get the locally installed version
    const migrationsDir = 'scripts/migrations';
    const command = `npx node-pg-migrate up -m ${migrationsDir}`;
    
    console.log(`Running migrations...\n`);
    execSync(command, {
      stdio: 'inherit',
      env: process.env,
      cwd: process.cwd()
    });

    console.log('\n✅ Migrations completed successfully');
  } catch (error) {
    console.error('\n❌ Migration failed');
    console.error('   Build/deployment will be aborted');
    process.exit(1);
  }
}

runMigrations().catch(error => {
  console.error('❌ Error running migrations:', error.message);
  process.exit(1);
});
