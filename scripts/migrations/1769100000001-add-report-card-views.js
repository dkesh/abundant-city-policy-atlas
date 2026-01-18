/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Add Place Grades Views
  // Creates views for calculating grades and comparisons for jurisdictions.
  // Note: These views are used internally; grades are no longer displayed in UI.
  // The filename retains the original "report-card" name for migration tracking.
  // ============================================================================

  const sql = `
-- ============================================================================
-- VIEW: Place Reforms Summary
-- Aggregates reforms by place and category with limitations counts
-- ============================================================================
CREATE OR REPLACE VIEW v_place_reforms_summary AS
SELECT 
  p.id as place_id,
  p.name as place_name,
  p.place_type,
  p.state_code,
  p.population,
  tld.state_name,
  tld.region,
  rt.category,
  COUNT(DISTINCT r.reform_type_id) as reforms_adopted_count,
  COUNT(DISTINCT r.id) as total_reform_instances,
  -- Count limitations (non-citywide scope, non-all-uses land use, non-by-right requirements)
  -- Check if arrays exist and don't contain the "unlimited" values (case-insensitive)
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
LEFT JOIN reform_types rt ON r.reform_type_id = rt.id
LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
WHERE rt.category IS NOT NULL
GROUP BY p.id, p.name, p.place_type, p.state_code, p.population, tld.state_name, tld.region, rt.category;

-- ============================================================================
-- VIEW: Total Reform Types Per Category (for denominator in grade calculation)
-- ============================================================================
CREATE OR REPLACE VIEW v_reform_types_by_category AS
SELECT 
  category,
  COUNT(DISTINCT id) as total_reform_types
FROM reform_types
WHERE category IS NOT NULL
GROUP BY category;

-- ============================================================================
-- VIEW: Place Grades by Category
-- Calculates letter grades per category for each place
-- ============================================================================
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

-- ============================================================================
-- VIEW: Overall Place Grades
-- Calculates overall grade (weighted average) for each place
-- ============================================================================
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

-- ============================================================================
-- VIEW: Place Comparisons
-- Pre-computed comparison data for percentile rankings
-- ============================================================================
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
  // Drop views in reverse order
  pgm.sql(`
    DROP VIEW IF EXISTS v_place_comparisons;
    DROP VIEW IF EXISTS v_place_overall_grades;
    DROP VIEW IF EXISTS v_place_grades;
    DROP VIEW IF EXISTS v_reform_types_by_category;
    DROP VIEW IF EXISTS v_place_reforms_summary;
  `);
};