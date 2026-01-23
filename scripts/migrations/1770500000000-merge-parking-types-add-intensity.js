/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Merge Parking Types and Add Intensity Dimension
  // Merges parking:eliminated and parking:reduced into parking:off-street_mandates
  // Adds intensity column to reforms table to track complete vs partial
  // ============================================================================

  const sql = `
-- ============================================================================
-- STEP 1: Add intensity column to reforms table
-- ============================================================================

ALTER TABLE reforms 
ADD COLUMN intensity VARCHAR(20) CHECK (intensity IN ('complete', 'partial') OR intensity IS NULL);

CREATE INDEX IF NOT EXISTS reforms_intensity_idx ON reforms(intensity);

-- ============================================================================
-- STEP 2: Create new parking:off-street_mandates reform type
-- ============================================================================

INSERT INTO reform_types (code, category_id, name, description, color_hex, icon_name, sort_order)
SELECT 
  'parking:off-street_mandates',
  (SELECT id FROM categories WHERE name = 'Parking'),
  'Off-Street Parking Mandates',
  'Reforms to off-street parking minimum requirements',
  '#27ae60',
  'local_parking',
  10
WHERE NOT EXISTS (
  SELECT 1 FROM reform_types WHERE code = 'parking:off-street_mandates'
);

-- ============================================================================
-- STEP 3: Migrate existing reforms from parking:eliminated to parking:off-street_mandates
-- ============================================================================

-- Get the new reform type ID
DO $$
DECLARE
  new_type_id INTEGER;
  eliminated_type_id INTEGER;
BEGIN
  -- Get IDs
  SELECT id INTO new_type_id FROM reform_types WHERE code = 'parking:off-street_mandates';
  SELECT id INTO eliminated_type_id FROM reform_types WHERE code = 'parking:eliminated';
  
  IF new_type_id IS NOT NULL AND eliminated_type_id IS NOT NULL THEN
    -- Update reform_reform_types to point to new type
    UPDATE reform_reform_types
    SET reform_type_id = new_type_id
    WHERE reform_type_id = eliminated_type_id;
    
    -- Set intensity = 'complete' for these reforms
    UPDATE reforms
    SET intensity = 'complete'
    WHERE id IN (
      SELECT reform_id 
      FROM reform_reform_types 
      WHERE reform_type_id = new_type_id
        AND reform_id IN (
          SELECT reform_id 
          FROM reform_reform_types 
          WHERE reform_type_id = eliminated_type_id
        )
    );
    
    -- Handle case where reform might have had both types (shouldn't happen, but be safe)
    -- Update any remaining references
    UPDATE reforms
    SET intensity = 'complete'
    WHERE id IN (
      SELECT DISTINCT r.id
      FROM reforms r
      JOIN reform_reform_types rrt ON r.id = rrt.reform_id
      WHERE rrt.reform_type_id = new_type_id
        AND (r.intensity IS NULL OR r.intensity != 'complete')
    );
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Migrate existing reforms from parking:reduced to parking:off-street_mandates
-- ============================================================================

DO $$
DECLARE
  new_type_id INTEGER;
  reduced_type_id INTEGER;
BEGIN
  -- Get IDs
  SELECT id INTO new_type_id FROM reform_types WHERE code = 'parking:off-street_mandates';
  SELECT id INTO reduced_type_id FROM reform_types WHERE code = 'parking:reduced';
  
  IF new_type_id IS NOT NULL AND reduced_type_id IS NOT NULL THEN
    -- First, handle reforms that already have the new type (from STEP 3)
    -- These are reforms that had both parking:eliminated AND parking:reduced
    -- Delete the parking:reduced entry for these reforms since they already have the new type
    DELETE FROM reform_reform_types
    WHERE reform_type_id = reduced_type_id
      AND reform_id IN (
        SELECT reform_id 
        FROM reform_reform_types 
        WHERE reform_type_id = new_type_id
      );
    
    -- Now update remaining parking:reduced entries to point to new type
    -- These are reforms that ONLY had parking:reduced (not parking:eliminated)
    UPDATE reform_reform_types
    SET reform_type_id = new_type_id
    WHERE reform_type_id = reduced_type_id;
    
    -- Set intensity = 'partial' for reforms that were migrated from parking:reduced
    -- Only if not already set to 'complete' (which would have been set in STEP 3)
    UPDATE reforms
    SET intensity = 'partial'
    WHERE id IN (
      SELECT reform_id 
      FROM reform_reform_types 
      WHERE reform_type_id = new_type_id
    )
    AND (intensity IS NULL OR intensity != 'complete');
  END IF;
END $$;

-- ============================================================================
-- STEP 5: Clean up duplicate reform_reform_types entries
-- ============================================================================

-- Remove duplicate entries where a reform has multiple links to the same type
DELETE FROM reform_reform_types rrt1
WHERE EXISTS (
  SELECT 1 FROM reform_reform_types rrt2
  WHERE rrt1.reform_id = rrt2.reform_id
    AND rrt1.reform_type_id = rrt2.reform_type_id
    AND rrt1.ctid < rrt2.ctid
);

-- ============================================================================
-- STEP 6: Delete old reform types
-- ============================================================================

DELETE FROM reform_types WHERE code = 'parking:eliminated';
DELETE FROM reform_types WHERE code = 'parking:reduced';
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Revert migration
  const sql = `
-- ============================================================================
-- STEP 1: Recreate old parking types
-- ============================================================================

INSERT INTO reform_types (code, category_id, name, description, color_hex, icon_name, sort_order)
SELECT 
  'parking:eliminated',
  (SELECT id FROM categories WHERE name = 'Parking'),
  'Mandates Eliminated',
  'Completely eliminated parking minimum requirements',
  '#27ae60',
  'ban',
  10
WHERE NOT EXISTS (SELECT 1 FROM reform_types WHERE code = 'parking:eliminated');

INSERT INTO reform_types (code, category_id, name, description, color_hex, icon_name, sort_order)
SELECT 
  'parking:reduced',
  (SELECT id FROM categories WHERE name = 'Parking'),
  'Mandates Reduced',
  'Reduced parking minimum requirements',
  '#2ecc71',
  'minus-circle',
  11
WHERE NOT EXISTS (SELECT 1 FROM reform_types WHERE code = 'parking:reduced');

-- ============================================================================
-- STEP 2: Migrate reforms back to old types based on intensity
-- ============================================================================

DO $$
DECLARE
  new_type_id INTEGER;
  eliminated_type_id INTEGER;
  reduced_type_id INTEGER;
BEGIN
  SELECT id INTO new_type_id FROM reform_types WHERE code = 'parking:off-street_mandates';
  SELECT id INTO eliminated_type_id FROM reform_types WHERE code = 'parking:eliminated';
  SELECT id INTO reduced_type_id FROM reform_types WHERE code = 'parking:reduced';
  
  IF new_type_id IS NOT NULL AND eliminated_type_id IS NOT NULL AND reduced_type_id IS NOT NULL THEN
    -- Migrate complete reforms back to parking:eliminated
    UPDATE reform_reform_types
    SET reform_type_id = eliminated_type_id
    WHERE reform_type_id = new_type_id
      AND reform_id IN (
        SELECT id FROM reforms WHERE intensity = 'complete'
      );
    
    -- Migrate partial reforms back to parking:reduced
    UPDATE reform_reform_types
    SET reform_type_id = reduced_type_id
    WHERE reform_type_id = new_type_id
      AND reform_id IN (
        SELECT id FROM reforms WHERE intensity = 'partial'
      );
    
    -- For reforms with NULL intensity, keep them on new type (or migrate to unspecified)
    -- This is a judgment call - keeping on new type for safety
  END IF;
END $$;

-- ============================================================================
-- STEP 3: Delete new reform type
-- ============================================================================

DELETE FROM reform_types WHERE code = 'parking:off-street_mandates';

-- ============================================================================
-- STEP 4: Remove intensity column
-- ============================================================================

DROP INDEX IF EXISTS reforms_intensity_idx;
ALTER TABLE reforms DROP COLUMN IF EXISTS intensity;
  `;

  pgm.sql(sql);
};
