/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Reforms Multi-Domain Support
  // Changes reforms from one-to-one to many-to-many relationship with reform_types
  // ============================================================================

  const sql = `
-- Step 1: Create junction table for many-to-many relationship
CREATE TABLE IF NOT EXISTS reform_reform_types (
  reform_id INTEGER NOT NULL REFERENCES reforms(id) ON DELETE CASCADE,
  reform_type_id INTEGER NOT NULL REFERENCES reform_types(id) ON DELETE CASCADE,
  PRIMARY KEY (reform_id, reform_type_id)
);

CREATE INDEX IF NOT EXISTS reform_reform_types_reform_idx ON reform_reform_types(reform_id);
CREATE INDEX IF NOT EXISTS reform_reform_types_type_idx ON reform_reform_types(reform_type_id);

-- Step 2: Populate junction table from existing reforms.reform_type_id
-- This preserves all existing relationships before we remove the column
INSERT INTO reform_reform_types (reform_id, reform_type_id)
SELECT id, reform_type_id
FROM reforms
WHERE reform_type_id IS NOT NULL
ON CONFLICT (reform_id, reform_type_id) DO NOTHING;

-- Step 3: Handle any duplicates that would be created by removing the unique constraint
-- If multiple reforms exist with same (place_id, adoption_date, status) but different reform_type_id,
-- we need to merge them by policy_document_id if present
-- First, identify potential duplicates after removing reform_type_id from unique constraint
DO $$
DECLARE
  duplicate_record RECORD;
  target_reform_id INTEGER;
  reform_type_to_add INTEGER;
  reform2_scope TEXT[];
  reform2_land_use TEXT[];
  reform2_summary TEXT;
  reform2_requirements TEXT[];
  reform2_notes TEXT;
  reform2_mechanism VARCHAR(100);
  reform2_phase VARCHAR(50);
  reform2_legislative_number VARCHAR(255);
  reform2_link_url TEXT;
BEGIN
  -- Find reforms that share (place_id, adoption_date, status) and have same policy_document_id
  FOR duplicate_record IN
    SELECT DISTINCT
      r1.id as reform_id_1,
      r1.reform_type_id as reform_type_1,
      r1.policy_document_id,
      r2.id as reform_id_2,
      r2.reform_type_id as reform_type_2
    FROM reforms r1
    JOIN reforms r2 ON (
      r1.place_id = r2.place_id
      AND COALESCE(r1.adoption_date, '1900-01-01'::date) = COALESCE(r2.adoption_date, '1900-01-01'::date)
      AND COALESCE(r1.status, '') = COALESCE(r2.status, '')
      AND r1.id < r2.id
    )
    WHERE r1.policy_document_id IS NOT NULL
      AND r1.policy_document_id = r2.policy_document_id
    ORDER BY r1.id, r2.id  -- Process in order to avoid deleting targets before use
  LOOP
    -- Use the first reform as the target (lower ID)
    target_reform_id := duplicate_record.reform_id_1;
    
    -- Skip if either reform has already been deleted (safety check)
    IF NOT EXISTS (SELECT 1 FROM reforms WHERE id = target_reform_id) THEN
      CONTINUE;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM reforms WHERE id = duplicate_record.reform_id_2) THEN
      CONTINUE;
    END IF;
    
    -- Add the second reform's reform_type to the target reform
    -- Use BEGIN/EXCEPTION to gracefully handle any foreign key violations
    -- (can happen if a reform was deleted between query execution and this INSERT)
    BEGIN
      -- First check if it's already in the junction table
      IF NOT EXISTS (
        SELECT 1 FROM reform_reform_types
        WHERE reform_id = target_reform_id
          AND reform_type_id = duplicate_record.reform_type_2
      ) THEN
        -- Try to insert - will fail gracefully if foreign key constraint is violated
        INSERT INTO reform_reform_types (reform_id, reform_type_id)
        VALUES (target_reform_id, duplicate_record.reform_type_2);
      END IF;
    EXCEPTION
      WHEN SQLSTATE '23503' THEN
        -- Skip this insert if reform_id doesn't exist (was deleted in previous iteration)
        -- SQLSTATE '23503' = foreign_key_violation
        NULL;
    END;
    
    -- Get data from reform_id_2 first (before it might be deleted)
    -- Only proceed if both reforms still exist
    IF EXISTS (SELECT 1 FROM reforms WHERE id = target_reform_id) 
       AND EXISTS (SELECT 1 FROM reforms WHERE id = duplicate_record.reform_id_2) THEN
      
      SELECT scope, land_use, summary, requirements, notes,
             reform_mechanism, reform_phase, legislative_number, link_url
      INTO reform2_scope, reform2_land_use, reform2_summary, reform2_requirements,
           reform2_notes, reform2_mechanism, reform2_phase, reform2_legislative_number, reform2_link_url
      FROM reforms
      WHERE id = duplicate_record.reform_id_2;
      
      -- Only update if we got data (reform still exists)
      IF FOUND THEN
        -- Merge data from reform_id_2 into reform_id_1 (prefer non-null values)
        UPDATE reforms
        SET
          scope = COALESCE(reforms.scope, reform2_scope),
          land_use = COALESCE(reforms.land_use, reform2_land_use),
          summary = COALESCE(reforms.summary, reform2_summary),
          requirements = COALESCE(reforms.requirements, reform2_requirements),
          notes = COALESCE(reforms.notes, reform2_notes),
          reform_mechanism = COALESCE(reforms.reform_mechanism, reform2_mechanism),
          reform_phase = COALESCE(reforms.reform_phase, reform2_phase),
          legislative_number = COALESCE(reforms.legislative_number, reform2_legislative_number),
          link_url = COALESCE(reforms.link_url, reform2_link_url),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = target_reform_id;
      END IF;
    END IF;
    
    -- Move reform_sources relationships from reform_id_2 to reform_id_1
    -- Only update if the target relationship doesn't already exist
    UPDATE reform_sources
    SET reform_id = target_reform_id
    WHERE reform_id = duplicate_record.reform_id_2
      AND NOT EXISTS (
        SELECT 1 FROM reform_sources rs2
        WHERE rs2.reform_id = target_reform_id
          AND rs2.source_id = reform_sources.source_id
      );
    
    -- Move reform_citations from reform_id_2 to reform_id_1
    UPDATE reform_citations
    SET reform_id = target_reform_id
    WHERE reform_id = duplicate_record.reform_id_2;
    
    -- Move reform_reform_types from reform_id_2 to reform_id_1
    -- Only update if the target relationship doesn't already exist
    UPDATE reform_reform_types
    SET reform_id = target_reform_id
    WHERE reform_id = duplicate_record.reform_id_2
      AND NOT EXISTS (
        SELECT 1 FROM reform_reform_types rrt2
        WHERE rrt2.reform_id = target_reform_id
          AND rrt2.reform_type_id = reform_reform_types.reform_type_id
      );
    
    -- Delete the duplicate reform
    DELETE FROM reforms WHERE id = duplicate_record.reform_id_2;
  END LOOP;
END $$;

-- Step 4: Drop the unique constraint on reforms
ALTER TABLE reforms DROP CONSTRAINT IF EXISTS reforms_place_id_reform_type_id_adoption_date_status_key;

-- Step 5: Drop the index on reform_type_id (replaced by junction table index)
DROP INDEX IF EXISTS reforms_type_idx;

-- Step 6: Drop the reform_type_id column (no longer needed)
-- Use CASCADE to automatically drop any remaining dependent views/constraints
-- (we'll recreate all views in Step 7 anyway)
ALTER TABLE reforms DROP COLUMN IF EXISTS reform_type_id CASCADE;

-- Step 7: Update views that reference reform_type_id
-- Drop and recreate views that depend on the old schema
DROP VIEW IF EXISTS v_place_comparisons CASCADE;
DROP VIEW IF EXISTS v_place_overall_grades CASCADE;
DROP VIEW IF EXISTS v_place_grades CASCADE;
DROP VIEW IF EXISTS v_place_reforms_summary CASCADE;
DROP VIEW IF EXISTS v_state_reforms_detailed CASCADE;
DROP VIEW IF EXISTS v_reforms_by_state_summary CASCADE;
DROP VIEW IF EXISTS v_states_with_reforms CASCADE;
DROP VIEW IF EXISTS v_reforms_by_municipality CASCADE;

-- Recreate v_state_reforms_detailed with new schema
CREATE OR REPLACE VIEW v_state_reforms_detailed AS
SELECT
  r.id,
  tld.state_code,
  tld.state_name,
  tld.country,
  STRING_AGG(DISTINCT rt.code, ', ') as reform_codes,
  STRING_AGG(DISTINCT rt.name, ', ') as reform_types,
  STRING_AGG(DISTINCT rt.color_hex, ', ') as color_hexes,
  p.name as municipality_name,
  CASE 
    WHEN p.place_type = 'city' THEN 'Municipality'
    WHEN p.place_type = 'county' THEN 'County'
    WHEN p.place_type = 'state' THEN 'State'
    ELSE 'Municipality'
  END as governance_level,
  tld.region,
  r.summary as reform_name,
  r.notes as description,
  ARRAY_TO_STRING(r.scope, ', ') as scope,
  r.reform_mechanism,
  r.reform_phase,
  r.adoption_date,
  p.latitude,
  p.longitude,
  STRING_AGG(DISTINCT src.short_name, ', ') as sources,
  STRING_AGG(DISTINCT rs.source_url, ', ') FILTER (WHERE rs.source_url IS NOT NULL) as source_urls,
  r.notes,
  r.created_at
FROM reforms r
JOIN places p ON r.place_id = p.id
JOIN top_level_division tld ON p.state_code = tld.state_code
LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
LEFT JOIN reform_types rt ON rrt.reform_type_id = rt.id
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
LEFT JOIN sources src ON rs.source_id = src.id
GROUP BY r.id, tld.state_code, tld.state_name, tld.country, p.name, p.place_type, tld.region, r.summary, r.notes, r.scope, r.reform_mechanism, r.reform_phase, r.adoption_date, p.latitude, p.longitude, r.created_at
ORDER BY tld.state_name, p.name;

-- Recreate v_reforms_by_state_summary with new schema
CREATE OR REPLACE VIEW v_reforms_by_state_summary AS
SELECT
  tld.id,
  tld.state_code,
  tld.state_name,
  tld.country,
  rt.id as reform_type_id,
  rt.code as reform_code,
  rt.name as reform_type,
  rt.color_hex,
  COUNT(DISTINCT r.id) as reform_count
FROM top_level_division tld
LEFT JOIN places p ON p.state_code = tld.state_code
LEFT JOIN reforms r ON r.place_id = p.id
LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
LEFT JOIN reform_types rt ON rrt.reform_type_id = rt.id
GROUP BY tld.id, tld.state_code, tld.state_name, tld.country, rt.id, rt.code, rt.name, rt.color_hex
ORDER BY tld.state_name;

-- Recreate v_states_with_reforms with new schema
CREATE OR REPLACE VIEW v_states_with_reforms AS
SELECT DISTINCT
  tld.id,
  tld.state_code,
  tld.state_name,
  tld.country,
  COUNT(DISTINCT r.id) as total_reforms,
  COUNT(DISTINCT rrt.reform_type_id) as type_count,
  COUNT(DISTINCT rs.source_id) as source_count,
  MAX(r.adoption_date) as most_recent_reform
FROM top_level_division tld
JOIN places p ON p.state_code = tld.state_code
JOIN reforms r ON r.place_id = p.id
LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
GROUP BY tld.id, tld.state_code, tld.state_name, tld.country;

-- Recreate v_reforms_by_municipality with new schema
CREATE OR REPLACE VIEW v_reforms_by_municipality AS
SELECT
  p.name as municipality_name,
  tld.state_code,
  tld.state_name,
  tld.country,
  STRING_AGG(DISTINCT src.short_name, ', ') as sources,
  COUNT(DISTINCT r.id) as reform_count,
  COUNT(DISTINCT rrt.reform_type_id) as type_count,
  p.latitude,
  p.longitude
FROM reforms r
JOIN places p ON r.place_id = p.id
JOIN top_level_division tld ON p.state_code = tld.state_code
LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
LEFT JOIN sources src ON rs.source_id = src.id
WHERE p.name IS NOT NULL
GROUP BY p.name, tld.state_code, tld.state_name, tld.country, p.latitude, p.longitude
ORDER BY reform_count DESC;

-- Recreate v_place_reforms_summary with new schema (using junction table)
CREATE OR REPLACE VIEW v_place_reforms_summary AS
SELECT 
  p.id as place_id,
  p.name as place_name,
  p.place_type,
  p.state_code,
  p.population,
  tld.state_name,
  tld.region,
  c.name as category,
  COUNT(DISTINCT rrt.reform_type_id) as reforms_adopted_count,
  COUNT(DISTINCT r.id) as total_reform_instances,
  -- Count limitations (non-citywide scope, non-all-uses land use, non-by-right requirements)
  COUNT(DISTINCT CASE 
    WHEN r.scope IS NOT NULL AND array_length(r.scope, 1) > 0 
         AND NOT (EXISTS (
           SELECT 1 FROM unnest(r.scope) AS scope_item 
           WHERE LOWER(scope_item) = 'citywide'
         ))
    THEN r.id 
  END) as scope_limitations_count,
  COUNT(DISTINCT CASE 
    WHEN r.land_use IS NOT NULL AND array_length(r.land_use, 1) > 0 
         AND NOT (EXISTS (
           SELECT 1 FROM unnest(r.land_use) AS land_item 
           WHERE LOWER(land_item) = 'all uses'
         ))
    THEN r.id 
  END) as land_use_limitations_count,
  COUNT(DISTINCT CASE 
    WHEN r.requirements IS NOT NULL AND array_length(r.requirements, 1) > 0 
         AND NOT (EXISTS (
           SELECT 1 FROM unnest(r.requirements) AS req_item 
           WHERE LOWER(req_item) = 'by right'
         ))
    THEN r.id 
  END) as requirements_limitations_count
FROM places p
LEFT JOIN reforms r ON r.place_id = p.id
LEFT JOIN reform_reform_types rrt ON r.id = rrt.reform_id
LEFT JOIN reform_types rt ON rrt.reform_type_id = rt.id
LEFT JOIN categories c ON rt.category_id = c.id
LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
WHERE c.name IS NOT NULL
GROUP BY p.id, p.name, p.place_type, p.state_code, p.population, tld.state_name, tld.region, c.name;

-- Recreate v_place_grades (depends on v_place_reforms_summary, unchanged)
CREATE OR REPLACE VIEW v_place_grades AS
WITH category_totals AS (
  SELECT 
    prs.place_id,
    prs.category,
    prs.reforms_adopted_count,
    COALESCE(rtc.total_reform_types, 1) as total_possible_reforms,
    prs.scope_limitations_count,
    prs.land_use_limitations_count,
    prs.requirements_limitations_count,
    -- Calculate limitations penalty (max 30 points)
    LEAST(
      (COALESCE(prs.scope_limitations_count, 0) * 5) +
      (COALESCE(prs.land_use_limitations_count, 0) * 5) +
      (COALESCE(prs.requirements_limitations_count, 0) * 10),
      30
    ) as limitations_penalty
  FROM v_place_reforms_summary prs
  LEFT JOIN v_reform_types_by_category rtc ON prs.category = rtc.category
),
category_scores AS (
  SELECT 
    place_id,
    category,
    reforms_adopted_count,
    total_possible_reforms,
    limitations_penalty,
    -- Base score: percentage of reforms adopted
    CASE 
      WHEN total_possible_reforms > 0 
      THEN (reforms_adopted_count::decimal / total_possible_reforms::decimal) * 100
      ELSE 0
    END as base_score,
    -- Final score with penalty (capped at 0-100)
    GREATEST(0, LEAST(100,
      CASE 
        WHEN total_possible_reforms > 0 
        THEN (reforms_adopted_count::decimal / total_possible_reforms::decimal) * 100 - limitations_penalty
        ELSE 0
      END
    )) as final_score
  FROM category_totals
)
SELECT 
  cs.place_id,
  cs.category,
  cs.reforms_adopted_count,
  cs.total_possible_reforms,
  cs.limitations_penalty,
  cs.base_score,
  cs.final_score,
  -- Letter grade assignment
  CASE
    WHEN cs.final_score >= 90 THEN 'A'
    WHEN cs.final_score >= 80 THEN 'B'
    WHEN cs.final_score >= 70 THEN 'C'
    WHEN cs.final_score >= 60 THEN 'D'
    ELSE 'F'
  END as letter_grade
FROM category_scores cs;

-- Recreate v_place_overall_grades (depends on v_place_grades, unchanged)
CREATE OR REPLACE VIEW v_place_overall_grades AS
SELECT 
  place_id,
  AVG(final_score) as overall_score,
  CASE
    WHEN AVG(final_score) >= 90 THEN 'A'
    WHEN AVG(final_score) >= 80 THEN 'B'
    WHEN AVG(final_score) >= 70 THEN 'C'
    WHEN AVG(final_score) >= 60 THEN 'D'
    ELSE 'F'
  END as overall_letter_grade,
  COUNT(DISTINCT category) as categories_with_reforms
FROM v_place_grades
GROUP BY place_id;

-- Recreate v_place_comparisons (depends on v_place_overall_grades, unchanged)
CREATE OR REPLACE VIEW v_place_comparisons AS
WITH place_scores AS (
  SELECT 
    p.id as place_id,
    p.place_type,
    p.state_code,
    p.population,
    tld.region,
    COALESCE(pog.overall_score, 0) as overall_score,
    CASE 
      WHEN p.population < 50000 THEN 'small'
      WHEN p.population < 500000 THEN 'mid'
      WHEN p.population < 2000000 THEN 'large'
      ELSE 'very_large'
    END as size_category
  FROM places p
  LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
  LEFT JOIN v_place_overall_grades pog ON p.id = pog.place_id
  WHERE p.population IS NOT NULL AND p.population > 0
),
state_rankings AS (
  SELECT 
    place_id,
    state_code,
    place_type,
    overall_score,
    PERCENT_RANK() OVER (
      PARTITION BY state_code, place_type 
      ORDER BY overall_score
    ) * 100 as state_percentile
  FROM place_scores
  WHERE state_code IS NOT NULL
),
region_rankings AS (
  SELECT 
    place_id,
    region,
    place_type,
    size_category,
    overall_score,
    PERCENT_RANK() OVER (
      PARTITION BY region, place_type, size_category 
      ORDER BY overall_score
    ) * 100 as region_percentile
  FROM place_scores
  WHERE region IS NOT NULL AND size_category IS NOT NULL
),
national_rankings AS (
  SELECT 
    place_id,
    place_type,
    size_category,
    overall_score,
    PERCENT_RANK() OVER (
      PARTITION BY place_type, size_category 
      ORDER BY overall_score
    ) * 100 as national_percentile
  FROM place_scores
  WHERE size_category IS NOT NULL
)
SELECT 
  ps.place_id,
  ps.place_type,
  ps.state_code,
  ps.region,
  ps.size_category,
  ps.overall_score,
  COALESCE(sr.state_percentile, 0) as state_percentile,
  COALESCE(rr.region_percentile, 0) as region_percentile,
  COALESCE(nr.national_percentile, 0) as national_percentile
FROM place_scores ps
LEFT JOIN state_rankings sr ON ps.place_id = sr.place_id
LEFT JOIN region_rankings rr ON ps.place_id = rr.place_id
LEFT JOIN national_rankings nr ON ps.place_id = nr.place_id;
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // ============================================================================
  // ROLLBACK: Revert to single reform_type_id per reform
  // Note: This rollback will lose data if reforms have multiple reform_types
  // ============================================================================

  const sql = `
-- Step 1: Add reform_type_id column back
ALTER TABLE reforms ADD COLUMN reform_type_id INTEGER REFERENCES reform_types(id) ON DELETE CASCADE;

-- Step 2: Populate reform_type_id from junction table (taking first reform_type for each reform)
UPDATE reforms r
SET reform_type_id = (
  SELECT reform_type_id
  FROM reform_reform_types rrt
  WHERE rrt.reform_id = r.id
  ORDER BY reform_type_id
  LIMIT 1
)
WHERE reform_type_id IS NULL;

-- Step 3: Recreate unique constraint
ALTER TABLE reforms ADD CONSTRAINT reforms_place_id_reform_type_id_adoption_date_status_key
  UNIQUE (place_id, reform_type_id, adoption_date, status);

-- Step 4: Recreate index
CREATE INDEX IF NOT EXISTS reforms_type_idx ON reforms(reform_type_id);

-- Step 5: Drop junction table
DROP TABLE IF EXISTS reform_reform_types CASCADE;

-- Step 6: Update views (drop and recreate with old schema)
DROP VIEW IF EXISTS v_state_reforms_detailed CASCADE;
DROP VIEW IF EXISTS v_reforms_by_state_summary CASCADE;
DROP VIEW IF EXISTS v_states_with_reforms CASCADE;
DROP VIEW IF EXISTS v_reforms_by_municipality CASCADE;

-- Recreate views with old schema (single reform_type)
CREATE OR REPLACE VIEW v_state_reforms_detailed AS
SELECT
  r.id,
  tld.state_code,
  tld.state_name,
  tld.country,
  rt.code as reform_code,
  rt.name as reform_type,
  rt.color_hex,
  p.name as municipality_name,
  CASE 
    WHEN p.place_type = 'city' THEN 'Municipality'
    WHEN p.place_type = 'county' THEN 'County'
    WHEN p.place_type = 'state' THEN 'State'
    ELSE 'Municipality'
  END as governance_level,
  tld.region,
  r.summary as reform_name,
  r.notes as description,
  ARRAY_TO_STRING(r.scope, ', ') as scope,
  r.reform_mechanism,
  r.reform_phase,
  r.adoption_date,
  p.latitude,
  p.longitude,
  STRING_AGG(DISTINCT src.short_name, ', ') as sources,
  STRING_AGG(DISTINCT rs.source_url, ', ') FILTER (WHERE rs.source_url IS NOT NULL) as source_urls,
  r.notes,
  r.created_at
FROM reforms r
JOIN places p ON r.place_id = p.id
JOIN top_level_division tld ON p.state_code = tld.state_code
JOIN reform_types rt ON r.reform_type_id = rt.id
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
LEFT JOIN sources src ON rs.source_id = src.id
GROUP BY r.id, tld.state_code, tld.state_name, tld.country, rt.code, rt.name, rt.color_hex, rt.sort_order, p.name, p.place_type, tld.region, r.summary, r.notes, r.scope, r.reform_mechanism, r.reform_phase, r.adoption_date, p.latitude, p.longitude, r.created_at
ORDER BY tld.state_name, p.name, rt.sort_order;

CREATE OR REPLACE VIEW v_reforms_by_state_summary AS
SELECT
  tld.id,
  tld.state_code,
  tld.state_name,
  tld.country,
  rt.id as reform_type_id,
  rt.code as reform_code,
  rt.name as reform_type,
  rt.color_hex,
  COUNT(r.id) as reform_count
FROM top_level_division tld
LEFT JOIN places p ON p.state_code = tld.state_code
LEFT JOIN reforms r ON r.place_id = p.id
LEFT JOIN reform_types rt ON r.reform_type_id = rt.id
GROUP BY tld.id, tld.state_code, tld.state_name, tld.country, rt.id, rt.code, rt.name, rt.color_hex
ORDER BY tld.state_name;

CREATE OR REPLACE VIEW v_states_with_reforms AS
SELECT DISTINCT
  tld.id,
  tld.state_code,
  tld.state_name,
  tld.country,
  COUNT(DISTINCT r.id) as total_reforms,
  COUNT(DISTINCT r.reform_type_id) as type_count,
  COUNT(DISTINCT rs.source_id) as source_count,
  MAX(r.adoption_date) as most_recent_reform
FROM top_level_division tld
JOIN places p ON p.state_code = tld.state_code
JOIN reforms r ON r.place_id = p.id
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
GROUP BY tld.id, tld.state_code, tld.state_name, tld.country;

CREATE OR REPLACE VIEW v_reforms_by_municipality AS
SELECT
  p.name as municipality_name,
  tld.state_code,
  tld.state_name,
  tld.country,
  STRING_AGG(DISTINCT src.short_name, ', ') as sources,
  COUNT(DISTINCT r.id) as reform_count,
  COUNT(DISTINCT r.reform_type_id) as type_count,
  p.latitude,
  p.longitude
FROM reforms r
JOIN places p ON r.place_id = p.id
JOIN top_level_division tld ON p.state_code = tld.state_code
LEFT JOIN reform_sources rs ON r.id = rs.reform_id
LEFT JOIN sources src ON rs.source_id = src.id
WHERE p.name IS NOT NULL
GROUP BY p.name, tld.state_code, tld.state_name, tld.country, p.latitude, p.longitude
ORDER BY reform_count DESC;
  `;

  pgm.sql(sql);
};
