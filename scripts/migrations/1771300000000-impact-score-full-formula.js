/**
 * Migration: Full impact score formula in trigger and backfill
 *
 * Replaces the stub get_reform_impact_score with the full formula computed
 * inline in the PL/pgSQL trigger. Then backfills all reforms by firing
 * the trigger so impact_score is recalculated for every row.
 */

exports.up = async (pgm) => {
  // 1. Replace trigger function with full formula inline (avoids long SQL function from JS)
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

  // 2. Backfill: fire trigger for every row so impact_score is recomputed
  await pgm.db.query(`
    UPDATE reforms SET scope = scope WHERE true
  `);
};

exports.down = async () => {
  // Trigger body is now defined in 1771200000000; no need to restore stub
};
