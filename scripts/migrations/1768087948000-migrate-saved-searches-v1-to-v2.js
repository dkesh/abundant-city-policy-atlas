/* eslint-disable camelcase */

exports.up = (pgm) => {
  // ============================================================================
  // MIGRATION: Saved Searches v1 → v2
  // Updates saved_searches.filter_config.reform_types to new Policy Domain codes
  // ============================================================================

  // Update saved searches: replace old codes with new codes in reform_types array
  // This uses a raw SQL query because node-pg-migrate doesn't have native support
  // for complex JSONB array transformations
  pgm.sql(`
    UPDATE saved_searches
    SET filter_config = jsonb_set(
      filter_config,
      '{reform_types}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE 
              -- Map to new codes
              WHEN value::text = '"landuse:tod"' THEN '"zoning:tod"'
              WHEN value::text = '"landuse:lot_size"' THEN '"physical:lot_size"'
              WHEN value::text = '"landuse:height"' THEN '"physical:height"'
              WHEN value::text = '"landuse:far"' THEN '"physical:far"'
              WHEN value::text = '"landuse:zoning"' THEN '"other:general"'
              WHEN value::text = '"building:staircases"' THEN '"building:unspecified"'
              WHEN value::text = '"parking:general"' THEN '"parking:unspecified"'
              WHEN value::text = '"housing:multifamily"' THEN '"housing:plex"'
              WHEN value::text = '"housing:mixed_use"' THEN '"housing:plex"'
              WHEN value::text = '"housing:townhouses"' THEN '"housing:plex"'
              WHEN value::text = '"process:by_right"' THEN '"process:permitting"'
              WHEN value::text = '"process:impact_fees"' THEN '"process:permitting"'
              WHEN value::text = '"process:tiffs"' THEN '"process:permitting"'
              WHEN value::text = '"process:tif"' THEN '"process:permitting"'
              -- Keep as-is (deprecated codes are filtered out by WHERE clause)
              ELSE value
            END
          )
          FROM jsonb_array_elements(filter_config->'reform_types') AS value
          WHERE value::text NOT IN (
            '"parking:maximums"',
            '"housing:sro"',
            '"housing:manufactured"',
            '"housing:tiny_homes"',
            '"housing:cottage_courts"',
            '"housing:group_housing"',
            '"housing:courtyard"',
            '"housing:sf_detached"',
            '"process:hearings"',
            '"process:design_review"',
            '"process:environmental"',
            '"landuse:setbacks"',
            '"landuse:density"'
          )
        ),
        '[]'::jsonb
      )
    ),
    filter_version = 2
    WHERE filter_version = 1
      AND filter_config->'reform_types' IS NOT NULL
      AND jsonb_typeof(filter_config->'reform_types') = 'array';
  `);

  // Update filter_version for saved searches that don't have reform_types
  pgm.sql(`
    UPDATE saved_searches
    SET filter_config = jsonb_set(filter_config, '{filter_version}', '2'),
        filter_version = 2
    WHERE filter_version = 1
      AND (filter_config->'reform_types' IS NULL OR jsonb_typeof(filter_config->'reform_types') != 'array');
  `);
};

exports.down = (pgm) => {
  // Reverse the migration: downgrade from v2 to v1
  // Note: Exact reverse mapping is not possible for deprecated codes that were removed
  // This rollback will map back to the most common old code where applicable
  
  pgm.sql(`
    UPDATE saved_searches
    SET filter_config = jsonb_set(
      filter_config,
      '{reform_types}',
      COALESCE(
        (
          SELECT jsonb_agg(
            CASE 
              -- Reverse map to old codes where possible
              WHEN value::text = '"zoning:tod"' THEN '"landuse:tod"'
              WHEN value::text = '"physical:lot_size"' THEN '"landuse:lot_size"'
              WHEN value::text = '"physical:height"' THEN '"landuse:height"'
              WHEN value::text = '"physical:far"' THEN '"landuse:far"'
              WHEN value::text = '"other:general"' THEN '"landuse:zoning"'
              WHEN value::text = '"building:unspecified"' THEN '"building:staircases"'
              WHEN value::text = '"parking:unspecified"' THEN '"parking:general"'
              WHEN value::text = '"housing:plex"' THEN '"housing:multifamily"'
              WHEN value::text = '"process:permitting"' THEN '"process:by_right"'
              ELSE value
            END
          )
          FROM jsonb_array_elements(filter_config->'reform_types') AS value
        ),
        '[]'::jsonb
      )
    ),
    filter_version = 1
    WHERE filter_version = 2
      AND filter_config->'reform_types' IS NOT NULL
      AND jsonb_typeof(filter_config->'reform_types') = 'array';
  `);

  // Also rollback searches without reform_types
  pgm.sql(`
    UPDATE saved_searches
    SET filter_config = jsonb_set(filter_config, '{filter_version}', '1'),
        filter_version = 1
    WHERE filter_version = 2
      AND (filter_config->'reform_types' IS NULL OR jsonb_typeof(filter_config->'reform_types') != 'array');
  `);
};