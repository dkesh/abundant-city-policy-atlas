/**
 * Migration: Add importance score columns and triggers
 *
 * Adds reforms.impact_score and places.population_log for sorting the list
 * by importance (population, impact, recency). Backfills from existing data
 * and adds triggers to keep values in sync on INSERT/UPDATE.
 */

exports.up = async (pgm) => {
  console.log('Starting migration: Add importance score columns...');

  // 1. Add impact_score to reforms
  await pgm.db.query('ALTER TABLE reforms ADD COLUMN IF NOT EXISTS impact_score NUMERIC(4,3)');

  // 2. Add population_log to places and backfill
  await pgm.db.query('ALTER TABLE places ADD COLUMN IF NOT EXISTS population_log NUMERIC(10,4)');

  const updatePlacesSql = `
    UPDATE places
    SET population_log = LN(GREATEST(COALESCE(population, 1), 1)) / LN(10)
    WHERE population IS NOT NULL OR population_log IS NULL
  `.trim();
  await pgm.db.query(updatePlacesSql);

  // 3. Trigger function for reforms.impact_score (full formula inline)
  await pgm.db.query(`
    CREATE OR REPLACE FUNCTION compute_reform_impact_score()
    RETURNS TRIGGER AS $fn$
    DECLARE
      penalty float := 0;
      mult float := 0.5;
    BEGIN
      IF NEW.scope IS NULL OR array_length(NEW.scope, 1) IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(NEW.scope) AS u WHERE LOWER(u::text) = 'citywide') THEN
        penalty := penalty + 1;
      END IF;
      IF NEW.land_use IS NULL OR array_length(NEW.land_use, 1) IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(NEW.land_use) AS u WHERE LOWER(u::text) = 'all uses') THEN
        penalty := penalty + 1;
      END IF;
      IF NEW.requirements IS NULL OR array_length(NEW.requirements, 1) IS NULL OR NOT EXISTS (SELECT 1 FROM unnest(NEW.requirements) AS u WHERE LOWER(u::text) = 'by right') THEN
        penalty := penalty + 1;
      END IF;
      IF NEW.intensity = 'partial' THEN
        penalty := penalty + 1;
      END IF;
      IF NEW.intensity = 'complete' THEN
        mult := 1.0;
      ELSIF NEW.intensity = 'partial' THEN
        mult := 0.7;
      ELSE
        mult := 0.5;
      END IF;
      NEW.impact_score := ROUND(((1 - penalty / 4.0) * mult)::numeric, 3)::numeric(4,3);
      RETURN NEW;
    END;
    $fn$ LANGUAGE plpgsql
  `);

  await pgm.db.query('DROP TRIGGER IF EXISTS trg_reforms_impact_score ON reforms');
  await pgm.db.query(`
    CREATE TRIGGER trg_reforms_impact_score
    BEFORE INSERT OR UPDATE OF scope, land_use, requirements, intensity
    ON reforms
    FOR EACH ROW
    EXECUTE FUNCTION compute_reform_impact_score()
  `);

  // Backfill impact_score by firing trigger for every row
  await pgm.db.query(`UPDATE reforms SET scope = scope WHERE true`);

  // 6. Trigger function for places.population_log
  pgm.sql(`
    CREATE OR REPLACE FUNCTION compute_place_population_log()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.population_log := LN(GREATEST(COALESCE(NEW.population, 1), 1)) / LN(10);
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql
  `);

  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_places_population_log ON places
  `);
  pgm.sql(`
    CREATE TRIGGER trg_places_population_log
    BEFORE INSERT OR UPDATE OF population
    ON places
    FOR EACH ROW
    EXECUTE FUNCTION compute_place_population_log()
  `);

  console.log('Migration completed: importance score columns and triggers added.');
};

exports.down = async (pgm) => {
  pgm.sql(`
    DROP TRIGGER IF EXISTS trg_reforms_impact_score ON reforms;
    DROP FUNCTION IF EXISTS compute_reform_impact_score();
    DROP TRIGGER IF EXISTS trg_places_population_log ON places;
    DROP FUNCTION IF EXISTS compute_place_population_log();
    ALTER TABLE reforms DROP COLUMN IF EXISTS impact_score;
    ALTER TABLE places DROP COLUMN IF EXISTS population_log;
  `);
};
