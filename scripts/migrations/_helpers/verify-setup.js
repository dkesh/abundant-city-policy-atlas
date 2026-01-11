#!/usr/bin/env node

/**
 * Migration Setup Verification
 * 
 * Checks that everything is configured correctly for database migrations.
 */

require('dotenv').config();
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const checks = {
  envFile: false,
  databaseUrl: false,
  migrationDir: false,
  migrations: false,
  databaseConnection: false,
  migrationTable: false
};

console.log('🔍 Verifying migration setup...\n');

// Check 1: .env file exists
if (fs.existsSync(path.join(process.cwd(), '.env'))) {
  checks.envFile = true;
  console.log('✅ .env file found');
} else {
  console.log('❌ .env file not found');
  console.log('   Create a .env file with DATABASE_URL set');
}

// Check 2: DATABASE_URL is set
if (process.env.DATABASE_URL) {
  checks.databaseUrl = true;
  const maskedUrl = process.env.DATABASE_URL.replace(/:([^:@]+)@/, ':***@');
  console.log(`✅ DATABASE_URL is set: ${maskedUrl}`);
} else {
  console.log('❌ DATABASE_URL not set in environment');
  console.log('   Add DATABASE_URL=postgres://... to your .env file');
}

// Check 3: Migrations directory exists
const migrationsDir = path.join(process.cwd(), 'scripts/migrations');
if (fs.existsSync(migrationsDir)) {
  checks.migrationDir = true;
  console.log(`✅ Migrations directory exists: scripts/migrations`);
} else {
  console.log('❌ Migrations directory not found');
}

// Check 4: Migration files exist
const migrationFiles = fs.readdirSync(migrationsDir)
  .filter(file => file.endsWith('.js') && file !== 'verify-setup.js')
  .sort();

if (migrationFiles.length > 0) {
  checks.migrations = true;
  console.log(`✅ Found ${migrationFiles.length} migration file(s):`);
  migrationFiles.forEach(file => {
    console.log(`   - ${file}`);
  });
} else {
  console.log('⚠️  No migration files found');
  console.log('   Run: npm run migrate:create <name> to create your first migration');
}

// Main async function
async function runChecks() {
  // Check 5: Database connection
  if (process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    try {
      const result = await pool.query('SELECT version()');
      checks.databaseConnection = true;
      const pgVersion = result.rows[0].version.match(/PostgreSQL (\d+\.\d+)/)?.[1] || 'unknown';
      console.log(`✅ Database connection successful (PostgreSQL ${pgVersion})`);
    } catch (error) {
      console.log(`❌ Database connection failed: ${error.message}`);
      console.log('   Check your DATABASE_URL and network connection');
    } finally {
      await pool.end();
    }
  }

  // Check 6: Migration tracking table
  if (checks.databaseConnection && process.env.DATABASE_URL) {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL
    });

    try {
      const result = await pool.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables 
          WHERE table_schema = 'public' 
          AND table_name = 'pgmigrations'
        );
      `);

      if (result.rows[0].exists) {
        checks.migrationTable = true;
        
        // Check applied migrations
        const applied = await pool.query('SELECT name FROM pgmigrations ORDER BY run_on DESC');
        console.log(`✅ Migration tracking table exists (pgmigrations)`);
        if (applied.rows.length > 0) {
          console.log(`   Applied migrations: ${applied.rows.length}`);
          applied.rows.slice(0, 5).forEach(row => {
            console.log(`   - ${row.name}`);
          });
          if (applied.rows.length > 5) {
            console.log(`   ... and ${applied.rows.length - 5} more`);
          }
        } else {
          console.log('   No migrations have been applied yet');
        }
      } else {
        console.log('ℹ️  Migration tracking table does not exist yet');
        console.log('   It will be created automatically on first migration run');
      }
    } catch (error) {
      console.log(`⚠️  Could not check migration table: ${error.message}`);
    } finally {
      await pool.end();
    }
  }

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('📋 Setup Summary:');
  console.log('='.repeat(60));

  const allChecks = Object.values(checks);
  const passedChecks = allChecks.filter(check => check === true).length;
  const totalChecks = allChecks.length;

  console.log(`\nPassed: ${passedChecks}/${totalChecks} checks\n`);

  if (passedChecks === totalChecks) {
    console.log('✅ All checks passed! You\'re ready to run migrations.');
    console.log('\nNext steps:');
    console.log('   1. Create a Neon branch for testing (optional but recommended)');
    console.log('   2. Run: npm run migrate:status (to see pending migrations)');
    console.log('   3. Run: npm run migrate:up (to apply pending migrations)');
  } else if (checks.databaseConnection && checks.migrations) {
    console.log('✅ Core setup is ready! You can run migrations.');
    console.log('\nNext steps:');
    console.log('   1. Run: npm run migrate:status');
    console.log('   2. Run: npm run migrate:up');
  } else {
    console.log('⚠️  Some checks failed. Please fix the issues above before proceeding.');
  }

  console.log('\nFor more help:');
  console.log('   npm run migrate:help       - Show migration command help');
  console.log('   See: scripts/migrations/_helpers/README.md for detailed documentation\n');
}

// Run all checks
runChecks().catch(error => {
  console.error('❌ Error running verification:', error.message);
  process.exit(1);
});