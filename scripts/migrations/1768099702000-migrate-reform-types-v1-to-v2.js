/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Reform Types v1 → v2
  // Updates reform_types table to new Policy Domain structure
  // 
  // FIX: Deletes reforms that would create duplicates BEFORE updating
  // ============================================================================

  // Read the SQL file content (without BEGIN/COMMIT as node-pg-migrate handles transactions)
  const sql = `
-- ============================================================================
-- STEP 1: Update existing codes that need category/name changes
-- ============================================================================

-- Update parking types
UPDATE reform_types SET
  category = 'Parking',
  name = 'Parking Minimums Eliminated',
  description = 'Completely eliminated parking minimum requirements',
  sort_order = 10
WHERE code = 'parking:eliminated';

UPDATE reform_types SET
  category = 'Parking',
  name = 'Parking Minimums Reduced',
  description = 'Reduced parking minimum requirements',
  sort_order = 11
WHERE code = 'parking:reduced';

-- Update parking:general to parking:unspecified (handle if target already exists)
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code = 'parking:general')
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'parking:unspecified')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'parking:unspecified');

-- Now update reforms to point to parking:unspecified (or keep as parking:general if target doesn't exist)
UPDATE reforms SET reform_type_id = (
  SELECT COALESCE(
    (SELECT id FROM reform_types WHERE code = 'parking:unspecified'),
    (SELECT id FROM reform_types WHERE code = 'parking:general')
  )
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code = 'parking:general'
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'parking:general');

-- Only rename if parking:unspecified doesn't already exist
UPDATE reform_types SET
  code = 'parking:unspecified',
  category = 'Parking',
  name = 'Parking: unspecified',
  description = 'Parking policy changes',
  sort_order = 12
WHERE code = 'parking:general'
AND NOT EXISTS (SELECT 1 FROM reform_types WHERE code = 'parking:unspecified');

-- Delete parking:general if parking:unspecified already existed
DELETE FROM reform_types WHERE code = 'parking:general'
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'parking:unspecified');

-- Update housing types (category change: "Housing Types" → "Housing Typology")
UPDATE reform_types SET
  category = 'Housing Typology',
  name = 'ADU',
  description = 'Accessory Dwelling Unit reforms',
  sort_order = 20
WHERE code = 'housing:adu';

UPDATE reform_types SET
  category = 'Housing Typology',
  name = 'Plex',
  description = 'Duplexes, triplexes, 4-plexes',
  sort_order = 21
WHERE code = 'housing:plex';

-- Map old housing types to housing:plex (handle merges)
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code IN ('housing:multifamily', 'housing:mixed_use', 'housing:townhouses'))
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'housing:plex')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
);

-- Now update remaining reforms
UPDATE reforms SET reform_type_id = (
  SELECT id FROM reform_types WHERE code = 'housing:plex'
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code IN ('housing:multifamily', 'housing:mixed_use', 'housing:townhouses')
);

DELETE FROM reform_types WHERE code IN ('housing:multifamily', 'housing:mixed_use', 'housing:townhouses');

-- Map landuse codes to new physical/zoning codes
-- landuse:tod → zoning:tod (check if target exists first)
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code = 'landuse:tod')
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'zoning:tod')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'zoning:tod')
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:tod');

-- Now update reforms
UPDATE reforms SET reform_type_id = (
  SELECT COALESCE(
    (SELECT id FROM reform_types WHERE code = 'zoning:tod'),
    (SELECT id FROM reform_types WHERE code = 'landuse:tod')
  )
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code = 'landuse:tod'
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:tod');

UPDATE reform_types SET
  code = 'zoning:tod',
  category = 'Zoning Category',
  name = 'TOD Upzones',
  description = 'Transit-oriented development reforms',
  sort_order = 32
WHERE code = 'landuse:tod'
AND NOT EXISTS (SELECT 1 FROM reform_types WHERE code = 'zoning:tod');

DELETE FROM reform_types WHERE code = 'landuse:tod'
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'zoning:tod');

-- landuse:lot_size → physical:lot_size
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code = 'landuse:lot_size')
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'physical:lot_size')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:lot_size')
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:lot_size');

UPDATE reforms SET reform_type_id = (
  SELECT COALESCE(
    (SELECT id FROM reform_types WHERE code = 'physical:lot_size'),
    (SELECT id FROM reform_types WHERE code = 'landuse:lot_size')
  )
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code = 'landuse:lot_size'
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:lot_size');

UPDATE reform_types SET
  code = 'physical:lot_size',
  category = 'Physical Dimension',
  name = 'Lot Size',
  description = 'Minimum lot size reforms',
  sort_order = 40
WHERE code = 'landuse:lot_size'
AND NOT EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:lot_size');

DELETE FROM reform_types WHERE code = 'landuse:lot_size'
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:lot_size');

-- landuse:height → physical:height
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code = 'landuse:height')
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'physical:height')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:height')
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:height');

UPDATE reforms SET reform_type_id = (
  SELECT COALESCE(
    (SELECT id FROM reform_types WHERE code = 'physical:height'),
    (SELECT id FROM reform_types WHERE code = 'landuse:height')
  )
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code = 'landuse:height'
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:height');

UPDATE reform_types SET
  code = 'physical:height',
  category = 'Physical Dimension',
  name = 'Height Limits',
  description = 'Building height limit reforms',
  sort_order = 41
WHERE code = 'landuse:height'
AND NOT EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:height');

DELETE FROM reform_types WHERE code = 'landuse:height'
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:height');

-- landuse:far → physical:far
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code = 'landuse:far')
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'physical:far')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:far')
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:far');

UPDATE reforms SET reform_type_id = (
  SELECT COALESCE(
    (SELECT id FROM reform_types WHERE code = 'physical:far'),
    (SELECT id FROM reform_types WHERE code = 'landuse:far')
  )
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code = 'landuse:far'
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:far');

UPDATE reform_types SET
  code = 'physical:far',
  category = 'Physical Dimension',
  name = 'Floor Area Ratio',
  description = 'FAR regulations',
  sort_order = 42
WHERE code = 'landuse:far'
AND NOT EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:far');

DELETE FROM reform_types WHERE code = 'landuse:far'
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'physical:far');

-- landuse:zoning → other:general (merge into existing other:general)
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code = 'landuse:zoning')
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'other:general')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:zoning');

UPDATE reforms SET reform_type_id = (
  SELECT id FROM reform_types WHERE code = 'other:general' LIMIT 1
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code = 'landuse:zoning'
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'landuse:zoning');

DELETE FROM reform_types WHERE code = 'landuse:zoning';

-- Update process types
UPDATE reform_types SET
  category = 'Process',
  name = 'Permitting Process',
  description = 'Permitting process streamlining',
  sort_order = 50
WHERE code = 'process:permitting';

-- Map process:by_right to process:permitting (handle merge)
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code = 'process:by_right')
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'process:permitting')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
);

UPDATE reforms SET reform_type_id = (
  SELECT id FROM reform_types WHERE code = 'process:permitting'
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code = 'process:by_right'
);

DELETE FROM reform_types WHERE code = 'process:by_right';

-- Map process:impact_fees, tiffs, tif to process:permitting (handle merge)
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code IN ('process:impact_fees', 'process:tiffs', 'process:tif'))
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'process:permitting')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
);

UPDATE reforms SET reform_type_id = (
  SELECT id FROM reform_types WHERE code = 'process:permitting'
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code IN ('process:impact_fees', 'process:tiffs', 'process:tif')
);

DELETE FROM reform_types WHERE code IN ('process:impact_fees', 'process:tiffs', 'process:tif');

-- Update building code types
-- building:staircases → building:unspecified (check if target exists first)
-- FIX: Delete duplicates BEFORE update
DELETE FROM reforms r1
WHERE r1.reform_type_id IN (SELECT id FROM reform_types WHERE code = 'building:staircases')
AND EXISTS (
  SELECT 1 FROM reforms r2
  WHERE r2.place_id = r1.place_id
    AND r2.reform_type_id = (SELECT id FROM reform_types WHERE code = 'building:unspecified')
    AND COALESCE(r2.adoption_date, '1900-01-01') = COALESCE(r1.adoption_date, '1900-01-01')
    AND COALESCE(r2.status, '') = COALESCE(r1.status, '')
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'building:unspecified')
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'building:staircases');

UPDATE reforms SET reform_type_id = (
  SELECT COALESCE(
    (SELECT id FROM reform_types WHERE code = 'building:unspecified'),
    (SELECT id FROM reform_types WHERE code = 'building:staircases')
  )
)
WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code = 'building:staircases'
)
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'building:staircases');

UPDATE reform_types SET
  code = 'building:unspecified',
  category = 'Building Code',
  name = 'Building Code: Unspecified',
  description = 'Building code reforms',
  sort_order = 62
WHERE code = 'building:staircases'
AND NOT EXISTS (SELECT 1 FROM reform_types WHERE code = 'building:unspecified');

DELETE FROM reform_types WHERE code = 'building:staircases'
AND EXISTS (SELECT 1 FROM reform_types WHERE code = 'building:unspecified');

-- Update other:general
UPDATE reform_types SET
  category = 'Other',
  name = 'Other Reform',
  description = 'Other zoning or land use reforms',
  sort_order = 90
WHERE code = 'other:general';

-- ============================================================================
-- STEP 2: Delete deprecated reform types (and their reforms)
-- ============================================================================

-- Delete reforms that use deprecated types
DELETE FROM reforms WHERE reform_type_id IN (
  SELECT id FROM reform_types WHERE code IN (
    'parking:maximums',
    'housing:sro',
    'housing:manufactured',
    'housing:tiny_homes',
    'housing:cottage_courts',
    'housing:group_housing',
    'housing:courtyard',
    'housing:sf_detached',
    'process:hearings',
    'process:design_review',
    'process:environmental',
    'landuse:setbacks',
    'landuse:density'
  )
);

-- Delete deprecated reform types
DELETE FROM reform_types WHERE code IN (
  'parking:maximums',
  'housing:sro',
  'housing:manufactured',
  'housing:tiny_homes',
  'housing:cottage_courts',
  'housing:group_housing',
  'housing:courtyard',
  'housing:sf_detached',
  'process:hearings',
  'process:design_review',
  'process:environmental',
  'landuse:setbacks',
  'landuse:density'
);

-- ============================================================================
-- STEP 3: Insert new reform types
-- ============================================================================

INSERT INTO reform_types (code, category, name, description, color_hex, icon_name, sort_order)
VALUES
  -- New parking type
  ('parking:unspecified', 'Parking', 'Parking: unspecified', 'Parking policy changes', '#27ae60', 'car', 12),
  -- New zoning types
  ('zoning:ricz', 'Zoning Category', 'RICZ', 'Reform Income Community Zoning reforms', '#2980b9', 'map', 30),
  ('zoning:yigby', 'Zoning Category', 'YIGBY', 'Yes In God''s Backyard reforms', '#3498db', 'church', 31),
  ('zoning:tod', 'Zoning Category', 'TOD Upzones', 'Transit-oriented development reforms', '#2980b9', 'subway', 32),
  -- New physical dimension types
  ('physical:lot_size', 'Physical Dimension', 'Lot Size', 'Minimum lot size reforms', '#16a085', 'ruler-combined', 40),
  ('physical:height', 'Physical Dimension', 'Height Limits', 'Building height limit reforms', '#34495e', 'arrow-up', 41),
  ('physical:far', 'Physical Dimension', 'Floor Area Ratio', 'FAR regulations', '#d35400', 'expand', 42),
  -- New process types
  ('process:courts_appeals', 'Process', 'Courts & Appeals', 'Court and appeals process reforms', '#8e44ad', 'gavel', 51),
  ('process:planning_obligations', 'Process', 'Planning Obligations', 'Planning obligation reforms', '#f39c12', 'file-contract', 52),
  -- New building code types
  ('building:stairwells', 'Building Code', 'Stairwells', 'Stairwell reforms', '#95a5a6', 'stream', 60),
  ('building:elevators', 'Building Code', 'Elevators', 'Elevator-related code reforms', '#7f8c8d', 'arrow-up', 61),
  ('building:unspecified', 'Building Code', 'Building Code: Unspecified', 'Building code reforms', '#95a5a6', 'building', 62),
  -- New other types
  ('other:land_value_tax', 'Other', 'Land Value Tax', 'Land value tax reforms', '#27ae60', 'dollar-sign', 91),
  ('other:urbanity', 'Other', 'Urbanity', 'Urbanity-related reforms', '#2c3e50', 'city', 92)
ON CONFLICT (code) DO UPDATE SET
  category = EXCLUDED.category,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  color_hex = EXCLUDED.color_hex,
  icon_name = EXCLUDED.icon_name,
  sort_order = EXCLUDED.sort_order;
`;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Note: This migration is complex and reversing it completely is difficult
  // because we're merging types and deleting data. A full rollback would require
  // restoring deleted reform types and data, which may not be possible.
  // In practice, you may need to restore from a backup instead of rolling back.
  
  pgm.sql(`
    -- This is a placeholder - full rollback not implemented
    -- Full rollback would require:
    -- 1. Restoring deleted reform_types
    -- 2. Restoring deleted reforms
    -- 3. Unmerging merged reform types
    -- 4. Reverting code/category changes
    -- 
    -- Recommendation: Use database backup/restore instead of rollback
    SELECT 1;
  `);
};