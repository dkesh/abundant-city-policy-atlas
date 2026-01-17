/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Update ZRT Source Name and Description
  // Updates "Berkeley Zoning Reform Tracker" to "Zoning Reform Tracker, Othering and Belonging Institute"
  // Updates description to "Zoning reform tracking project by Othering & Belonging Institute, University of California, Berkeley"
  // ============================================================================

  const sql = `
UPDATE sources 
SET 
  name = 'Zoning Reform Tracker, Othering and Belonging Institute',
  description = 'Zoning reform tracking project by Othering & Belonging Institute, University of California, Berkeley'
WHERE short_name = 'ZRT';
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Revert to original name and description
  pgm.sql(`
    UPDATE sources 
    SET 
      name = 'Berkeley Zoning Reform Tracker',
      description = 'Zoning reform tracking project by UC Berkeley Othering & Belonging Institute'
    WHERE short_name = 'ZRT';
  `);
};
