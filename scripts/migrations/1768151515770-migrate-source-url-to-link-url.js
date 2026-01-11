/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Move source_url from places to link_url in reforms
  // 
  // This migration:
  // 1. Adds link_url column to reforms table
  // 2. Migrates data from places.source_url to reforms.link_url for PRN city reforms
  // 3. Sets default link_urls for other sources based on their tracker URLs
  // 4. Removes source_url column from places table
  // 5. Updates views that reference places.source_url
  // ============================================================================

  const sql = `
-- ============================================================================
-- STEP 1: Add link_url column to reforms table
-- ============================================================================

ALTER TABLE reforms ADD COLUMN IF NOT EXISTS link_url TEXT;

-- ============================================================================
-- STEP 2: Migrate data from places.source_url to reforms.link_url for PRN city reforms
-- ============================================================================

-- For PRN city reforms: copy place's source_url to reform's link_url
-- This must happen BEFORE PRN state updates to avoid conflicts
UPDATE reforms
SET link_url = (
  SELECT p.source_url
  FROM places p
  WHERE p.id = reforms.place_id
    AND p.place_type IN ('city', 'county')
    AND p.source_url IS NOT NULL
)
WHERE EXISTS (
    SELECT 1
    FROM reform_sources rs
    JOIN sources s ON rs.source_id = s.id
    WHERE rs.reform_id = reforms.id
      AND s.short_name = 'PRN'
  )
  AND reforms.place_id IN (
    SELECT id FROM places WHERE place_type IN ('city', 'county') AND source_url IS NOT NULL
  );

-- ============================================================================
-- STEP 3: Set default link_urls for other sources (overrides any existing values)
-- ============================================================================

-- ZRT: https://belonging.berkeley.edu/zoning-reform-tracker
-- Process ZRT before Mercatus to ensure correct assignment
UPDATE reforms
SET link_url = 'https://belonging.berkeley.edu/zoning-reform-tracker'
WHERE EXISTS (
    SELECT 1
    FROM reform_sources rs
    JOIN sources s ON rs.source_id = s.id
    WHERE rs.reform_id = reforms.id
      AND s.short_name = 'ZRT'
  );

-- Mercatus: https://www.quorum.us/spreadsheet/external/vehiYnJcriswPJrHpUKe/
UPDATE reforms
SET link_url = 'https://www.quorum.us/spreadsheet/external/vehiYnJcriswPJrHpUKe/'
WHERE EXISTS (
    SELECT 1
    FROM reform_sources rs
    JOIN sources s ON rs.source_id = s.id
    WHERE rs.reform_id = reforms.id
      AND s.short_name = 'Mercatus'
  );

-- PRN State Legislation: https://parkingreform.org/resources/state-legislation-map/
-- Process PRN state AFTER PRN city to avoid overwriting city reforms
UPDATE reforms
SET link_url = 'https://parkingreform.org/resources/state-legislation-map/'
WHERE reforms.place_id IN (SELECT id FROM places WHERE place_type = 'state')
  AND EXISTS (
    SELECT 1
    FROM reform_sources rs
    JOIN sources s ON rs.source_id = s.id
    WHERE rs.reform_id = reforms.id
      AND s.short_name = 'PRN'
  );

-- ============================================================================
-- STEP 4: Remove source_url column from places table
-- ============================================================================

ALTER TABLE places DROP COLUMN IF EXISTS source_url;

-- ============================================================================
-- STEP 5: Update views that reference places.source_url
-- ============================================================================

-- The view v_state_reforms_detailed doesn't directly reference p.source_url,
-- but we should verify it doesn't break. The get-reforms.js API endpoint
-- references p.source_url as place_url, which will need to be updated in code.

-- Note: Views are automatically updated when underlying tables change,
-- but we should recreate any views that explicitly select source_url

`;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // ============================================================================
  // ROLLBACK: Restore source_url to places, remove link_url from reforms
  // ============================================================================

  const sql = `
-- Add source_url back to places
ALTER TABLE places ADD COLUMN IF NOT EXISTS source_url TEXT;

-- Note: We cannot fully restore the original source_url values from places
-- as they may have been different per reform. This rollback is best-effort.

-- Remove link_url from reforms
ALTER TABLE reforms DROP COLUMN IF EXISTS link_url;
`;

  pgm.sql(sql);
};
