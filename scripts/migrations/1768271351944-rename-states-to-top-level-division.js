/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Rename states table to top_level_division and add country column
  // ============================================================================

  // Step 1: Rename the table
  pgm.renameTable('states', 'top_level_division');

  // Step 2: Rename the index using raw SQL
  pgm.sql(`
    ALTER INDEX IF EXISTS states_geom_idx RENAME TO top_level_division_geom_idx;
  `);

  // Step 3: Add country column with default 'US' for existing records
  pgm.addColumn('top_level_division', {
    country: {
      type: 'VARCHAR(2)',
      notNull: true,
      default: 'US'
    }
  });

  // Step 4: Drop existing views (they need to be dropped before recreating with new columns)
  pgm.sql(`
    DROP VIEW IF EXISTS v_state_reforms_detailed;
    DROP VIEW IF EXISTS v_reforms_by_state_summary;
    DROP VIEW IF EXISTS v_states_with_reforms;
    DROP VIEW IF EXISTS v_reforms_by_municipality;
  `);

  // Step 5: Recreate all views with the new table name and country column
  pgm.sql(`
    -- View: All reforms with state and type info
    CREATE VIEW v_state_reforms_detailed AS
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
  `);

  pgm.sql(`
    -- View: Summary of reforms by state and type
    CREATE VIEW v_reforms_by_state_summary AS
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
    ORDER BY tld.state_name, rt.sort_order;
  `);

  pgm.sql(`
    -- View: States with at least one reform
    CREATE VIEW v_states_with_reforms AS
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
  `);

  pgm.sql(`
    -- View: Reforms by municipality and source
    CREATE VIEW v_reforms_by_municipality AS
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
  `);
};

exports.down = (pgm) => {
  // Revert the migration
  // Step 1: Revert views (simplified - just drop and recreate with old table name)
  pgm.sql(`
    DROP VIEW IF EXISTS v_state_reforms_detailed;
    DROP VIEW IF EXISTS v_reforms_by_state_summary;
    DROP VIEW IF EXISTS v_states_with_reforms;
    DROP VIEW IF EXISTS v_reforms_by_municipality;
  `);

  // Step 2: Remove country column
  pgm.dropColumn('top_level_division', 'country');

  // Step 3: Rename index back using raw SQL
  pgm.sql(`
    ALTER INDEX IF EXISTS top_level_division_geom_idx RENAME TO states_geom_idx;
  `);

  // Step 4: Rename table back
  pgm.renameTable('top_level_division', 'states');

  // Step 5: Recreate views with old table name (simplified versions)
  // Note: Full view recreation should be done by re-running schema.sql
};
