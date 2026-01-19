/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Update CBNA Source Description
  // Updates the description for the Center for Building in North America source
  // ============================================================================

  const sql = `
UPDATE sources
SET description = 'The Center for Building is a non-profit that conducts research on building codes and standards, and advocates for reform in the United States and Canada.'
WHERE short_name = 'CBNA';
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Revert to previous description
  pgm.sql(`
UPDATE sources
SET description = 'Tracks building code reforms, particularly single-stair building reforms across North America'
WHERE short_name = 'CBNA';
  `);
};
