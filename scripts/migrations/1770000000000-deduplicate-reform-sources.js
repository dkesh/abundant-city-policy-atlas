/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Deduplicate Reform Sources
  // 
  // Removes duplicate entries in reform_sources where the same reform_id
  // is linked to the same source_id multiple times.
  // 
  // Strategy:
  // 1. Identify duplicate (reform_id, source_id) combinations
  // 2. Keep the first occurrence (by ingestion_date, then by ctid as tiebreaker)
  // 3. Delete all other duplicates
  // 4. Ensure PRIMARY KEY constraint exists as a safety measure
  // ============================================================================

  const sql = `
-- ============================================================================
-- STEP 1: Identify and report duplicates before cleanup
-- ============================================================================

DO $$
DECLARE
  duplicate_count INT;
  affected_reforms INT;
BEGIN
  -- Count duplicate (reform_id, source_id) combinations
  SELECT COUNT(*) INTO duplicate_count
  FROM (
    SELECT reform_id, source_id, COUNT(*) as cnt
    FROM reform_sources
    GROUP BY reform_id, source_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  -- Count distinct reform_id values affected
  SELECT COUNT(DISTINCT reform_id) INTO affected_reforms
  FROM (
    SELECT reform_id, source_id, COUNT(*) as cnt
    FROM reform_sources
    GROUP BY reform_id, source_id
    HAVING COUNT(*) > 1
  ) duplicates;
  
  IF duplicate_count > 0 THEN
    RAISE NOTICE 'Found % duplicate reform+source combinations affecting % reforms', duplicate_count, affected_reforms;
  ELSE
    RAISE NOTICE 'No duplicates found in reform_sources table';
  END IF;
END $$;

-- ============================================================================
-- STEP 2: Delete duplicates, keeping the first occurrence
-- ============================================================================

-- Use ctid (internal row identifier) to identify duplicates to delete
-- Keep the row with the smallest ctid (first physical occurrence)
-- Prioritize by ingestion_date, then by ctid as a tiebreaker
WITH ranked_duplicates AS (
  SELECT 
    ctid,
    reform_id,
    source_id,
    ROW_NUMBER() OVER (
      PARTITION BY reform_id, source_id 
      ORDER BY ingestion_date ASC NULLS LAST, ctid ASC
    ) AS rn
  FROM reform_sources
)
DELETE FROM reform_sources
WHERE ctid IN (
  SELECT ctid 
  FROM ranked_duplicates 
  WHERE rn > 1
);

-- ============================================================================
-- STEP 3: Ensure PRIMARY KEY constraint exists as a safety measure
-- ============================================================================

-- The PRIMARY KEY constraint should already exist, but we'll add it if missing
-- This prevents future duplicates from being created
DO $$
BEGIN
  -- Check if PRIMARY KEY constraint exists by querying information_schema
  IF NOT EXISTS (
    SELECT 1 
    FROM information_schema.table_constraints
    WHERE constraint_name = 'reform_sources_pkey'
    AND table_name = 'reform_sources'
    AND constraint_type = 'PRIMARY KEY'
  ) THEN
    ALTER TABLE reform_sources 
    ADD CONSTRAINT reform_sources_pkey 
    PRIMARY KEY (reform_id, source_id);
    
    RAISE NOTICE 'Added PRIMARY KEY constraint on reform_sources(reform_id, source_id)';
  ELSE
    RAISE NOTICE 'PRIMARY KEY constraint already exists on reform_sources';
  END IF;
END $$;

-- ============================================================================
-- STEP 4: Report cleanup statistics
-- ============================================================================

DO $$
DECLARE
  remaining_count BIGINT;
BEGIN
  SELECT COUNT(*) INTO remaining_count FROM reform_sources;
  
  RAISE NOTICE 'Deduplication complete. Total reform_sources entries: %', remaining_count;
END $$;
`;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // This migration cannot be reversed as we've deleted duplicate records
  // The data loss is intentional and necessary for data integrity
  pgm.sql(`
    -- Migration cannot be reversed
    -- Duplicate reform_sources entries have been permanently removed
    -- The PRIMARY KEY constraint remains to prevent future duplicates
    SELECT 1;
  `);
};
