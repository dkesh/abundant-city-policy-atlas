/* eslint-disable camelcase */

/**
 * Migration: Standardize reform statuses to lowercase
 * 
 * This migration converts all status values in the reforms table to lowercase
 * to ensure consistent matching for the unique constraint (place_id, reform_type_id, adoption_date, status).
 * 
 * For example:
 * - "Adopted" -> "adopted"
 * - "Proposed" -> "proposed"
 * - "Failed" -> "failed"
 */

exports.up = (pgm) => {
  const sql = `
    -- Update all status values to lowercase
    UPDATE reforms
    SET status = LOWER(status)
    WHERE status IS NOT NULL
      AND status != LOWER(status);
    
    -- Verify no uppercase statuses remain
    DO $$
    DECLARE
      uppercase_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO uppercase_count
      FROM reforms
      WHERE status IS NOT NULL
        AND status != LOWER(status);
      
      IF uppercase_count > 0 THEN
        RAISE EXCEPTION 'Migration failed: % uppercase statuses still remain', uppercase_count;
      END IF;
    END $$;
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Cannot reliably restore original case, so this is a no-op
  // The status values were likely inconsistent before anyway
  pgm.sql(`
    -- Note: Cannot restore original case as it was not preserved
    -- This migration standardizes to lowercase which is the desired state
  `);
};
