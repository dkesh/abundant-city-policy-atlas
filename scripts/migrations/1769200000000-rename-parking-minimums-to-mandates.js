/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Rename Parking Minimums to Mandates
  // Updates reform type names from "Parking Minimums Eliminated/Reduced" 
  // to "Mandates Eliminated/Reduced"
  // ============================================================================

  const sql = `
-- Update parking:eliminated name
UPDATE reform_types SET
  name = 'Mandates Eliminated'
WHERE code = 'parking:eliminated';

-- Update parking:reduced name
UPDATE reform_types SET
  name = 'Mandates Reduced'
WHERE code = 'parking:reduced';
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Revert names back to original
  const sql = `
-- Revert parking:eliminated name
UPDATE reform_types SET
  name = 'Parking Minimums Eliminated'
WHERE code = 'parking:eliminated';

-- Revert parking:reduced name
UPDATE reform_types SET
  name = 'Parking Minimums Reduced'
WHERE code = 'parking:reduced';
  `;

  pgm.sql(sql);
};
