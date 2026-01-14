/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add Unique Index with Normalized NULLs
  // 
  // Creates a unique index that normalizes NULL values for duplicate detection.
  // This allows us to keep NULLs as NULLs in the data while preventing duplicates.
  // 
  // The index uses COALESCE to normalize:
  // - NULL adoption_date -> '1900-01-01' (sentinel date)
  // - NULL status -> '' (empty string)
  // 
  // This works alongside the existing UNIQUE constraint, providing a safety net
  // that properly handles NULL values.
  // ============================================================================

  const sql = `
-- Create unique index with normalized NULLs
-- This prevents duplicates even when adoption_date or status is NULL
CREATE UNIQUE INDEX IF NOT EXISTS reforms_unique_normalized 
ON reforms (
  place_id, 
  reform_type_id, 
  COALESCE(adoption_date, '1900-01-01'::date),
  COALESCE(status, '')
);

-- Note: We keep the existing UNIQUE constraint as well for backward compatibility
-- The index provides the normalized NULL handling we need
`;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS reforms_unique_normalized;
  `);
};
