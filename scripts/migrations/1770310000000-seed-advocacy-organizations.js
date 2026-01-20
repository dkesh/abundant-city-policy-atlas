/* eslint-disable camelcase */

const fs = require('fs');
const path = require('path');

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Seed Advocacy Organizations
  // Loads advocacy organizations and place mappings from seed file
  // ============================================================================

  // Read the seed SQL file
  const seedFilePath = path.join(__dirname, '../../database/seed-advocacy-organizations.sql');
  const seedSQL = fs.readFileSync(seedFilePath, 'utf8');

  // Execute the seed SQL
  // The SQL file contains INSERT statements with ON CONFLICT, so it's safe to run multiple times
  // PostgreSQL client handles multiple statements separated by semicolons
  pgm.sql(seedSQL);
};

exports.down = (pgm) => {
  // Revert migration by deleting all advocacy organizations and their mappings
  const sql = `
-- Remove all place mappings
DELETE FROM advocacy_organization_places;

-- Remove all advocate communications
DELETE FROM advocate_communications;

-- Remove all advocacy organizations
DELETE FROM advocacy_organizations;
  `;

  pgm.sql(sql);
};
