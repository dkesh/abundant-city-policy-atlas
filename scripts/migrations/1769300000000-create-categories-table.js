/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Create Categories Table
  // Creates a new categories table and migrates category data from reform_types
  // ============================================================================

  const sql = `
-- Create categories table
CREATE TABLE IF NOT EXISTS categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) UNIQUE NOT NULL,
  description TEXT NOT NULL,
  icon VARCHAR(50) NOT NULL,
  sort_order INT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Insert categories with descriptions and icons (Material Icons)
INSERT INTO categories (name, description, icon, sort_order) VALUES
  ('Parking', 'Reforms to off-street parking mandates, allowing developers to build the amount of parking that makes economic sense. Also, reforms to on-street parking rules.', 'local_parking', 10),
  ('Housing Typology', 'Reforms that legalize or make it easier to build diverse housing types like accessory dwelling units (ADUs), duplexes, triplexes, and other missing middle housing.', 'home_work', 20),
  ('Zoning Category', 'Reforms that change zoning classifications and land use categories to allow more housing density and mixed-use development.', 'location_city', 30),
  ('Physical Dimension', 'Reforms that adjust physical constraints like minimum lot sizes, building height limits, and floor area ratios to enable more housing.', 'square_foot', 40),
  ('Process', 'Reforms that streamline permitting, approvals, and other bureaucratic processes to reduce delays and costs in building housing.', 'assignment', 50),
  ('Building Code', 'Reforms that update building codes to allow more efficient building designs, such as single-stair buildings and elevator requirements.', 'domain', 60),
  ('Other', 'Other types of housing and land use reforms that don''t fit into the standard categories.', 'more_horiz', 90)
ON CONFLICT (name) DO NOTHING;

-- Add category_id column to reform_types
ALTER TABLE reform_types ADD COLUMN category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL;

-- Migrate existing category data to category_id
UPDATE reform_types rt
SET category_id = c.id
FROM categories c
WHERE rt.category = c.name;

-- Create index on category_id
CREATE INDEX IF NOT EXISTS reform_types_category_idx ON reform_types(category_id);

-- Update views that reference the category column to use category_id
-- Note: We keep the category column for backward compatibility, but views should use categories table
-- Drop dependent views first (in reverse dependency order)
DROP VIEW IF EXISTS v_place_comparisons;
DROP VIEW IF EXISTS v_place_overall_grades;
DROP VIEW IF EXISTS v_place_grades;
DROP VIEW IF EXISTS v_place_reforms_summary;
DROP VIEW IF EXISTS v_reform_types_by_category;

-- Recreate v_reform_types_by_category using categories table
CREATE OR REPLACE VIEW v_reform_types_by_category AS
SELECT
  c.name as category,
  COUNT(DISTINCT rt.id) as total_reform_types
FROM categories c
LEFT JOIN reform_types rt ON c.id = rt.category_id
GROUP BY c.name;

-- Recreate v_place_reforms_summary to use categories table
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
  COUNT(DISTINCT r.reform_type_id) as reforms_adopted_count,
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
LEFT JOIN reform_types rt ON r.reform_type_id = rt.id
LEFT JOIN categories c ON rt.category_id = c.id
LEFT JOIN top_level_division tld ON p.state_code = tld.state_code
WHERE c.name IS NOT NULL
GROUP BY p.id, p.name, p.place_type, p.state_code, p.population, tld.state_name, tld.region, c.name;

-- Recreate v_place_grades (depends on v_reform_types_by_category and v_place_reforms_summary)
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

-- Recreate v_place_overall_grades (depends on v_place_grades)
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

-- Recreate v_place_comparisons (depends on v_place_overall_grades)
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

-- Drop the old category column (commented out for safety - can be dropped after verifying everything works)
-- ALTER TABLE reform_types DROP COLUMN category;
  `;

  pgm.sql(sql);
};

exports.down = (pgm) => {
  // Revert migration
  const sql = `
-- Restore category column if it was dropped
ALTER TABLE reform_types ADD COLUMN IF NOT EXISTS category VARCHAR(50);

-- Migrate data back from category_id
UPDATE reform_types rt
SET category = c.name
FROM categories c
WHERE rt.category_id = c.id;

-- Drop index
DROP INDEX IF EXISTS reform_types_category_idx;

-- Drop category_id column
ALTER TABLE reform_types DROP COLUMN IF EXISTS category_id;

-- Drop categories table
DROP TABLE IF EXISTS categories;
  `;

  pgm.sql(sql);
};
