/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add CBNA (Center for Building in North America) Source
  // Adds CBNA to the sources table
  // ============================================================================

  const sql = `
INSERT INTO sources (name, short_name, description, website_url, logo_filename) VALUES
  ('Center for Building in North America', 'CBNA', 'Tracks building code reforms, particularly single-stair building reforms across North America', 'https://www.centerforbuilding.org/', 'cbna-logo.svg')
ON CONFLICT (short_name) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  website_url = EXCLUDED.website_url,
  logo_filename = EXCLUDED.logo_filename;
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Remove CBNA source
  pgm.sql(`
    DELETE FROM sources WHERE short_name = 'CBNA';
  `);
};
