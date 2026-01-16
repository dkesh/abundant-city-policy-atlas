/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add CLE (Center for Land Economics) Source
  // Adds CLE to the sources table
  // ============================================================================

  const sql = `
INSERT INTO sources (name, short_name, description, website_url, logo_filename) VALUES
  ('Center for Land Economics', 'CLE', 'Tracks land value tax reforms across North America', 'https://landeconomics.org/', 'cle-logo.svg')
ON CONFLICT (short_name) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  website_url = EXCLUDED.website_url,
  logo_filename = EXCLUDED.logo_filename;
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Remove CLE source
  pgm.sql(`
    DELETE FROM sources WHERE short_name = 'CLE';
  `);
};
