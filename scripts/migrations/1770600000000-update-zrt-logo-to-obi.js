/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Update ZRT Logo Filename
  // Updates logo_filename from 'zrt-logo.svg' to 'obi-logo.svg' for ZRT source
  // ============================================================================

  const sql = `
UPDATE sources 
SET logo_filename = 'obi-logo.svg'
WHERE short_name = 'ZRT' AND logo_filename = 'zrt-logo.svg';
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Revert logo filename back to zrt-logo.svg
  pgm.sql(`
    UPDATE sources 
    SET logo_filename = 'zrt-logo.svg'
    WHERE short_name = 'ZRT' AND logo_filename = 'obi-logo.svg';
  `);
};
