/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Remove Duplicate Reforms
  // 
  // Removes duplicate reforms where PostgreSQL's NULL != NULL behavior allowed
  // multiple rows with NULL adoption_date or NULL status to coexist.
  // 
  // Strategy:
  // 1. Identify duplicates using normalized values (COALESCE for NULLs)
  // 2. Keep the oldest reform (by created_at) in each duplicate group
  // 3. Merge citations and source links from duplicates into the kept reform
  // 4. Delete duplicate reforms
  // ============================================================================

  const sql = `
-- ============================================================================
-- STEP 1: Create temporary table to identify duplicate groups and keep oldest
-- ============================================================================

CREATE TEMP TABLE duplicate_groups AS
WITH normalized_reforms AS (
  SELECT 
    id,
    place_id,
    reform_type_id,
    COALESCE(adoption_date, '1900-01-01'::date) AS normalized_adoption_date,
    COALESCE(status, '') AS normalized_status,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY 
        place_id, 
        reform_type_id, 
        COALESCE(adoption_date, '1900-01-01'::date),
        COALESCE(status, '')
      ORDER BY created_at ASC
    ) AS rn
  FROM reforms
)
SELECT 
  id,
  place_id,
  reform_type_id,
  normalized_adoption_date,
  normalized_status,
  created_at,
  rn
FROM normalized_reforms
WHERE rn > 1;  -- Only duplicates (rn=1 is the oldest, which we keep)

-- ============================================================================
-- STEP 2: For each duplicate, merge citations into the kept reform
-- ============================================================================

-- Find the kept reform ID for each duplicate
CREATE TEMP TABLE duplicate_to_kept AS
WITH normalized_reforms AS (
  SELECT 
    id,
    place_id,
    reform_type_id,
    COALESCE(adoption_date, '1900-01-01'::date) AS normalized_adoption_date,
    COALESCE(status, '') AS normalized_status,
    created_at,
    ROW_NUMBER() OVER (
      PARTITION BY 
        place_id, 
        reform_type_id, 
        COALESCE(adoption_date, '1900-01-01'::date),
        COALESCE(status, '')
      ORDER BY created_at ASC
    ) AS rn
  FROM reforms
),
kept_reforms AS (
  SELECT 
    id AS kept_id,
    place_id,
    reform_type_id,
    normalized_adoption_date,
    normalized_status
  FROM normalized_reforms
  WHERE rn = 1
),
duplicate_reforms AS (
  SELECT 
    id AS duplicate_id,
    place_id,
    reform_type_id,
    normalized_adoption_date,
    normalized_status
  FROM normalized_reforms
  WHERE rn > 1
)
SELECT 
  d.duplicate_id,
  k.kept_id
FROM duplicate_reforms d
JOIN kept_reforms k ON 
  d.place_id = k.place_id
  AND d.reform_type_id = k.reform_type_id
  AND d.normalized_adoption_date = k.normalized_adoption_date
  AND d.normalized_status = k.normalized_status;

-- Merge citations: Insert citations from duplicates into kept reforms
-- Use CTE to deduplicate first, then insert to avoid conflicts
-- (ON CONFLICT DO NOTHING handles duplicates based on unique index)
WITH deduplicated_citations AS (
  SELECT DISTINCT ON (dtk.kept_id, COALESCE(rc.citation_url, ''), COALESCE(rc.citation_description, ''))
    dtk.kept_id,
    rc.citation_description,
    rc.citation_url,
    rc.citation_notes
  FROM reform_citations rc
  JOIN duplicate_to_kept dtk ON rc.reform_id = dtk.duplicate_id
  ORDER BY dtk.kept_id, COALESCE(rc.citation_url, ''), COALESCE(rc.citation_description, ''), rc.id
)
INSERT INTO reform_citations (reform_id, citation_description, citation_url, citation_notes)
SELECT 
  kept_id,
  citation_description,
  citation_url,
  citation_notes
FROM deduplicated_citations
ON CONFLICT DO NOTHING;

-- ============================================================================
-- STEP 3: Merge source links from duplicates into kept reforms
-- ============================================================================

-- Merge reform_sources: Insert source links from duplicates into kept reforms
-- Use CTE to deduplicate first, then insert to avoid "cannot affect row a second time" error
-- (ON CONFLICT handles duplicates based on PRIMARY KEY)
WITH deduplicated_sources AS (
  SELECT DISTINCT ON (dtk.kept_id, rs.source_id)
    dtk.kept_id,
    rs.source_id,
    rs.reporter,
    rs.source_url,
    rs.notes,
    rs.ingestion_date,
    rs.is_primary
  FROM reform_sources rs
  JOIN duplicate_to_kept dtk ON rs.reform_id = dtk.duplicate_id
  ORDER BY dtk.kept_id, rs.source_id, rs.ingestion_date DESC
)
INSERT INTO reform_sources (reform_id, source_id, reporter, source_url, notes, ingestion_date, is_primary)
SELECT 
  kept_id,
  source_id,
  reporter,
  source_url,
  notes,
  ingestion_date,
  is_primary
FROM deduplicated_sources
ON CONFLICT (reform_id, source_id) DO UPDATE SET
  reporter = COALESCE(EXCLUDED.reporter, reform_sources.reporter),
  source_url = COALESCE(EXCLUDED.source_url, reform_sources.source_url),
  notes = COALESCE(EXCLUDED.notes, reform_sources.notes),
  is_primary = reform_sources.is_primary OR EXCLUDED.is_primary;

-- ============================================================================
-- STEP 4: Collect statistics before deletion
-- ============================================================================

DO $$
DECLARE
  duplicates_removed INT;
  citations_to_merge INT;
  sources_to_merge INT;
BEGIN
  SELECT COUNT(*) INTO duplicates_removed FROM duplicate_to_kept;
  
  -- Count citations that will be merged
  SELECT COUNT(DISTINCT rc.id) INTO citations_to_merge
  FROM reform_citations rc
  JOIN duplicate_to_kept dtk ON rc.reform_id = dtk.duplicate_id;
  
  -- Count source links that will be merged
  SELECT COUNT(*) INTO sources_to_merge
  FROM (
    SELECT DISTINCT rs.reform_id, rs.source_id
    FROM reform_sources rs
    JOIN duplicate_to_kept dtk ON rs.reform_id = dtk.duplicate_id
  ) AS distinct_sources;
  
  RAISE NOTICE 'Duplicate cleanup starting:';
  RAISE NOTICE '  Duplicates to remove: %', duplicates_removed;
  RAISE NOTICE '  Citations to merge: %', citations_to_merge;
  RAISE NOTICE '  Source links to merge: %', sources_to_merge;
END $$;

-- ============================================================================
-- STEP 5: Delete duplicate reforms (citations and source links cascade)
-- ============================================================================

DELETE FROM reforms
WHERE id IN (SELECT duplicate_id FROM duplicate_to_kept);

-- ============================================================================
-- STEP 6: Report final statistics
-- ============================================================================

DO $$
DECLARE
  duplicates_removed INT;
BEGIN
  SELECT COUNT(*) INTO duplicates_removed FROM duplicate_to_kept;
  
  RAISE NOTICE 'Duplicate cleanup complete:';
  RAISE NOTICE '  Duplicates removed: %', duplicates_removed;
END $$;

-- Clean up temp tables
DROP TABLE IF EXISTS duplicate_to_kept;
DROP TABLE IF EXISTS duplicate_groups;
`;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // This migration cannot be reversed as we've deleted duplicate records
  // The data loss is intentional and necessary for data integrity
  pgm.sql(`
    -- Migration cannot be reversed
    -- Duplicate reforms have been permanently removed
    SELECT 1;
  `);
};
